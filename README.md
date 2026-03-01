# Nazar

An AI companion system built on openSUSE MicroOS with Podman Quadlet containers.

## What is Nazar?

Nazar is a self-hosted AI companion that manages your digital life through a flat-file object store, periodic heartbeat reflections, and Matrix messaging. It runs on an immutable MicroOS base with containerized services managed by Podman Quadlet.

## Architecture

- **Domain logic** (`packages/nazar-core/`): ObjectStore, FrontmatterParser, shared types
- **Shell tools** (`scripts/`): `nazar-object.sh` for flat-file CRUD, `nazar-setup.sh` for config application
- **Containers** (`containers/`): Base, heartbeat, matrix-bridge — all built FROM `nazar-base`
- **KIWI image** (`image/`): MicroOS disk image description for flashing to hardware or VMs
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

1. Download the MicroOS image from GitHub Releases
2. Flash to disk or import into a VM
3. Boot — first-boot setup runs automatically
4. Edit `/etc/nazar/nazar.yaml` to customize
5. Run `nazar apply`

## CLI

```
nazar apply              # Apply config, generate Quadlet files, reload systemd
nazar status             # Show running services and object store stats
nazar update             # Pull latest container images
nazar rollback           # Rollback to previous btrfs snapshot
nazar object <cmd>       # Object store CRUD
nazar pi [args]          # Launch Pi agent
nazar setup              # Interactive first-time setup
```

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution tiers and development setup.
