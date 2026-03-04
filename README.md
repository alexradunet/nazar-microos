# piBloom

An AI companion system built on Fedora bootc with Podman Quadlet containers.

## What is piBloom?

piBloom is a self-hosted AI companion that manages your digital life through a flat-file object store, periodic heartbeat reflections, and Signal messaging. It runs on an immutable bootc base with containerized services managed by Podman Quadlet.

## Architecture

- **Domain logic** (`packages/pibloom-core/`): ObjectStore, FrontmatterParser, shared types
- **CLI** (`packages/pibloom-core/`): `pibloom-core` TypeScript CLI for object CRUD, config application, evolution
- **Containers** (`containers/`): Base, heartbeat, signal-cli, signal-bridge — all built FROM `pibloom-base` (except signal-cli which uses eclipse-temurin)
- **OS Image** (`os/Containerfile`): Fedora bootc image with all packages, scripts, and config baked in
- **Persona** (`agent/persona/`): OpenPersona 4-layer identity (SOUL, BODY, FACULTY, SKILL)
- **Skills** (`agent/skills/`): Pi agent domain skills (journaling, tasks, notes, heartbeat, etc.)
- **Context** (`agent/context/`): System context for agent prompts
- **Config** (`pibloom.yaml`): Single YAML file replacing NixOS typed options

## Quick Start

### For development

```bash
npm install
npm test                           # TypeScript unit tests
npm run check                      # Biome lint + format check
```

### For deployment

1. Copy `os/bootc/config.toml.example` to `os/bootc/config.toml` and add your SSH public key
2. Build the OS image: `make image`
3. Generate a QCOW2 disk: `make qcow2`
4. Boot the VM: `pibloom vm create`
5. Edit `/etc/pibloom/pibloom.yaml` to customize, then run `pibloom apply`

## CLI

```
pibloom apply              # Apply config, generate Quadlet files, reload systemd
pibloom status             # Show bootc deployments, running services, and object store stats
pibloom update             # Update OS via bootc and pull latest container images
pibloom rollback           # Show bootc deployments and rollback instructions
pibloom evolve install <s> # Deploy containers from an evolution object
pibloom evolve rollback <s># Stop and remove evolution containers
pibloom object <cmd>       # Object store CRUD
pibloom pi [args]          # Launch Pi agent
pibloom setup              # Interactive first-time setup
```

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution tiers and development setup.
