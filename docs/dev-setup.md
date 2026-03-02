# Nazar Dev Setup

Local development uses a Fedora bootc VM managed via libvirt. Two scripts handle the workflow:

- **`nazar vm`** — VM lifecycle (runs on the **host**, needs libvirt)
- **`nazar deploy`** — Build and push code to the VM (runs from **toolbox**, only needs SSH + podman)

## Prerequisites

- **Host**: Fedora Silverblue with `virt-manager` / `libvirt` installed
- **Toolbox**: Node.js, npm, podman, SSH client
- The `default` libvirt network must be active (`sudo virsh net-start default`)

## One-Time Setup

### 1. Provide your SSH key

```bash
cp bootc/config.toml.example bootc/config.toml
# Edit bootc/config.toml and add your SSH public key
```

This file is gitignored — each developer provides their own key.

### 2. Create the VM (from host terminal)

```bash
nazar vm create
```

This will:
- Build the bootc OS image via `podman build`
- Generate a QCOW2 disk via `bootc-image-builder`
- Create a 20GB VM with 2 vCPUs and 2GB RAM
- Boot the VM — it's ready immediately (all packages baked into the image)

### 3. Configure deploy target

```bash
nazar vm ip
cp .nazar-deploy.env.example .nazar-deploy.env
# Edit .nazar-deploy.env and set NAZAR_HOST to the VM IP
```

## Dev Cycle

Run these from the **toolbox** where you develop:

```bash
# Full deploy — build containers, sync scripts/persona/skills, health check
nazar deploy

# Quick iterations
nazar deploy --scripts    # Just sync shell scripts
nazar deploy --persona    # Just sync persona files
nazar deploy --skills     # Just sync skills
nazar deploy --images     # Rebuild and push containers (slower)
nazar deploy --check      # Health check only

# Preview what would happen
nazar deploy --dry-run
```

### What `nazar deploy --images` does

1. Builds `nazar-base` from `containers/base/Containerfile`
2. Builds each service container (heartbeat, signal-cli, signal-bridge)
3. Tags them as `localhost/nazar-*:latest` (same names the Quadlet files reference)
4. Transfers via `podman save | ssh sudo podman load`
5. Restarts the relevant systemd services

Since local builds use the same image tags as production, Quadlet files work unchanged. To restore production images, run `nazar update` on the VM.

## OS Image Iteration

For OS-level changes (root `Containerfile`, system packages, sysconfig), use `bootc upgrade` instead of rebuilding the entire VM. Only changed layers are transferred (~1-2 min vs 10+ min).

### One-time: start the local registry

```bash
make registry
```

This runs a local OCI registry on port 5000. It persists across reboots (`--restart=always`).

### All-in-one: build, push, and upgrade the VM

```bash
nazar deploy --os
```

This will:
1. Build the OS image (`podman build`)
2. Push to the local registry (`localhost:5000`)
3. SSH into the VM and run `bootc switch` (first time) or `bootc upgrade` (subsequent)
4. Prompt to reboot the VM

### Manual workflow

```bash
make push              # Build OS image + push to local registry
nazar vm upgrade       # SSH into VM, bootc upgrade, prompt reboot
```

### Rollback

If something breaks after a `bootc upgrade`:

```bash
nazar vm ssh -- 'sudo bootc rollback && sudo systemctl reboot'
```

The previous OS deployment is preserved and can be instantly restored.

### Note: existing VMs

VMs created before the insecure registry config was added to the `Containerfile` need either:
- A full rebuild: `nazar vm destroy && nazar vm create`
- Or manually copy the config: `nazar vm ssh -- 'sudo mkdir -p /etc/containers/registries.conf.d && sudo tee /etc/containers/registries.conf.d/nazar-dev-registry.conf <<EOF
[[registry]]
location = "192.168.122.1:5000"
insecure = true
EOF'`

## VM Management

Run these from the **host** terminal (needs libvirt):

```bash
nazar vm status    # Show VM state and IP
nazar vm ssh       # SSH into the VM
nazar vm stop      # Graceful shutdown
nazar vm start     # Start a stopped VM
nazar vm upgrade   # bootc upgrade and optionally reboot
nazar vm destroy   # Remove VM and all storage
```

## Configuration

### .nazar-deploy.env

```bash
NAZAR_HOST=192.168.122.x   # VM IP (from: nazar vm ip)
NAZAR_SSH_USER=core         # SSH user (default: core)

# NAZAR_REGISTRY_HOST=192.168.122.1   # Host IP as seen from VM (auto-detected if unset)
# NAZAR_REGISTRY_PORT=5000             # Local registry port (default: 5000)
```

### VM defaults (environment variables)

| Variable | Default | Description |
|----------|---------|-------------|
| `NAZAR_VM_NAME` | `nazar-dev` | VM name in libvirt |
| `NAZAR_VM_MEMORY` | `2048` | RAM in MB |
| `NAZAR_VM_VCPUS` | `2` | Number of vCPUs |
| `NAZAR_VM_DISK_SIZE` | `20G` | Disk size |

## Restoring Production State

On the VM, run:
```bash
nazar update
```

This updates the OS via `bootc update` and pulls the latest container images from GHCR. Reboot to apply OS updates:
```bash
sudo systemctl reboot
```

## Troubleshooting

### VM won't get an IP
- Check the default network: `sudo virsh net-list --all`
- Start it if needed: `sudo virsh net-start default`

### SSH connection refused
- Check VM console: `sudo virsh console nazar-dev` (Ctrl+] to exit)

### Deploy fails with "NAZAR_HOST not set"
- Create `.nazar-deploy.env` from the example: `cp .nazar-deploy.env.example .nazar-deploy.env`
- Set `NAZAR_HOST` to the VM IP from `nazar vm ip`

### Services not starting on VM
- SSH in and check logs: `journalctl -u nazar-signal-bridge.service`
- Re-run setup: `sudo nazar apply`
- Check Quadlet files: `ls /etc/containers/systemd/nazar-*`
