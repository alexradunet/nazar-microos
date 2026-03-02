# Nazar

An AI companion system built on Fedora bootc with Podman Quadlet containers.

## What is Nazar?

Nazar is a self-hosted AI companion that manages your digital life through a flat-file object store, periodic heartbeat reflections, and Matrix messaging. It runs on an immutable bootc base with containerized services managed by Podman Quadlet.

## Architecture

- **Domain logic** (`packages/nazar-core/`): ObjectStore, FrontmatterParser, shared types
- **Shell tools** (`scripts/`): `nazar-object.sh` for flat-file CRUD, `nazar-setup.sh` for config application
- **Containers** (`containers/`): Base, heartbeat, matrix-bridge — all built FROM `nazar-base`
- **OS Image** (`Containerfile`): Fedora bootc image with all packages, scripts, and config baked in
- **Persona** (`persona/`): OpenPersona 4-layer identity (SOUL, BODY, FACULTY, SKILL)
- **Skills** (`skills/`): Pi agent domain skills (journaling, tasks, notes, heartbeat, etc.)
- **Config** (`nazar.yaml`): Single YAML file replacing NixOS typed options

## Quick Start

### For development

```bash
npm install
npm -w packages/nazar-core test    # TypeScript unit tests
bash tests/shell/run.sh            # Shell tests (needs yq + jq)
```

### For deployment

1. Copy `bootc/config.toml.example` to `bootc/config.toml` and add your SSH public key
2. Build the OS image: `make image`
3. Generate a QCOW2 disk: `make qcow2`
4. Boot the VM: `nazar vm create`
5. Edit `/etc/nazar/nazar.yaml` to customize, then run `nazar apply`

## CLI

```
nazar apply              # Apply config, generate Quadlet files, reload systemd
nazar status             # Show bootc deployments, running services, and object store stats
nazar update             # Update OS via bootc and pull latest container images
nazar rollback           # Show bootc deployments and rollback instructions
nazar evolve install <s> # Deploy containers from an evolution object
nazar evolve rollback <s># Stop and remove evolution containers
nazar object <cmd>       # Object store CRUD
nazar pi [args]          # Launch Pi agent
nazar setup              # Interactive first-time setup
```

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution tiers and development setup.
