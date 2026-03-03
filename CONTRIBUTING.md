# Contributing to Nazar

Contributions are welcome! This guide helps you find the right level of involvement.

## Contribution Tiers

| Tier | Area | What you need |
|------|------|---------------|
| 0 | Docs, persona, skills | Git |
| 1 | TypeScript, shell scripts | Node.js 22 |
| 2 | Containerfiles | Podman basics |
| 3 | Containerfile, bootc, Quadlet, CI | bootc + systemd knowledge |

### Tier 0: Docs, Persona, Skills

Edit markdown files. No build tools needed.

- `agent/persona/` — OpenPersona identity (SOUL, BODY, FACULTY, SKILL)
- `agent/skills/*/SKILL.md` — Pi agent skills
- `docs/` — Project documentation
- `README.md`, `CONTRIBUTING.md`

### Tier 1: TypeScript and Shell

Core domain logic and shell tools.

```bash
# Setup
npm install

# TypeScript tests
npm test

# Lint check
npm run check
```

Key files:
- `packages/nazar-core/src/` — ObjectStore, FrontmatterParser, SetupAdapter, EvolutionAdapter
- `scripts/nazar` — CLI router (delegates to nazar-core)

### Tier 2: Containers

Build and test container images.

```bash
podman build -t nazar-base -f core/containers/base/Containerfile .
podman build -t nazar-heartbeat -f core/containers/heartbeat/Containerfile .
podman build -t nazar-signal-cli -f bridges/signal/containers/signal-cli/Containerfile .
podman build -t nazar-signal-bridge -f containers/signal-bridge/Containerfile .
```

Key files:
- `containers/*/Containerfile`
- `services/signal-bridge/` — Signal bridge (signal-cli TCP → Pi AgentSession)

### Tier 3: Containerfile, bootc, and System

OS image building and systemd integration.

Key files:
- `os/Containerfile` — bootc OS image (packages, scripts, config baked in)
- `os/sysconfig/` — systemd sysusers, tmpfiles, sudoers, service units
- `os/bootc/config.toml.example` — SSH key config for bootc-image-builder
- `Makefile` — Build OS image and QCOW2 disk
- `nazar.yaml.example` — Config template
- `.github/workflows/` — CI/CD

## Development Conventions

- **TDD first** — Write failing tests before implementation
- **node:test** for TypeScript tests — zero framework deps
- **js-yaml** for YAML parsing (via nazar-core)
- **Hexagonal architecture** — Ports (interfaces) and Adapters (implementations)
- **PARA methodology** — Projects, Areas, Resources, Archives for object organization

## Code Style

- Shell: `set -euo pipefail`, functions prefixed with `cmd_` for subcommands
- TypeScript: strict mode, ESM modules, Node16 resolution
- Commit messages: conventional commits (`feat:`, `fix:`, `docs:`, etc.)

## Testing

```bash
# All tests
npm test

# Lint + format check
npm run check

# Setup dry-run
NAZAR_CONFIG=nazar.yaml.example QUADLET_OUTPUT_DIR=/tmp/q nazar-core setup --dry-run

# Build bootc OS image
make image
```
