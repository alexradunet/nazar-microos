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
3. Tags them as `ghcr.io/alexradunet/nazar-*:latest` (same names the Quadlet files reference)
4. Transfers via `podman save | ssh sudo podman load`
5. Restarts the relevant systemd services

Since local builds use the same image tags as production, Quadlet files work unchanged. To restore production images, run `nazar update` on the VM.

## VM Management

Run these from the **host** terminal (needs libvirt):

```bash
nazar vm status    # Show VM state and IP
nazar vm ssh       # SSH into the VM
nazar vm stop      # Graceful shutdown
nazar vm start     # Start a stopped VM
nazar vm destroy   # Remove VM and all storage
```

## Configuration

### .nazar-deploy.env

```bash
NAZAR_HOST=192.168.122.x   # VM IP (from: nazar vm ip)
NAZAR_SSH_USER=core         # SSH user (default: core)
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
