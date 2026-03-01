# Nazar

An AI companion system built on Fedora CoreOS with Podman Quadlet containers.

## What is Nazar?

Nazar is a self-hosted AI companion that manages your digital life through a flat-file object store, periodic heartbeat reflections, and Matrix messaging. It runs on an immutable CoreOS base with containerized services managed by Podman Quadlet.

## Architecture

- **Domain logic** (`packages/nazar-core/`): ObjectStore, FrontmatterParser, shared types
- **Shell tools** (`scripts/`): `nazar-object.sh` for flat-file CRUD, `nazar-setup.sh` for config application
- **Containers** (`containers/`): Base, heartbeat, matrix-bridge — all built FROM `nazar-base`
- **Ignition** (`ignition/`): Butane/Ignition config for provisioning CoreOS machines
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

1. Download the Fedora CoreOS ISO from https://fedoraproject.org/coreos/
2. Generate the Ignition config: `make -C ignition`
3. Boot CoreOS and provide `ignition/nazar.ign` via Ignition
4. First boot layers required RPMs and reboots automatically
5. Edit `/etc/nazar/nazar.yaml` to customize, then run `nazar apply`

## CLI

```
nazar apply              # Apply config, generate Quadlet files, reload systemd
nazar status             # Show running services and object store stats
nazar update             # Pull latest container images
nazar rollback           # Show rpm-ostree deployments and rollback instructions
nazar evolve install <s> # Deploy containers from an evolution object
nazar evolve rollback <s># Stop and remove evolution containers
nazar object <cmd>       # Object store CRUD
nazar pi [args]          # Launch Pi agent
nazar setup              # Interactive first-time setup
```

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution tiers and development setup.
