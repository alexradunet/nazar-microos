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

- `persona/` — OpenPersona identity (SOUL, BODY, FACULTY, SKILL)
- `skills/*/SKILL.md` — Pi agent skills
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
podman build -t nazar-base -f containers/base/Containerfile .
podman build -t nazar-heartbeat -f containers/heartbeat/Containerfile .
podman build -t nazar-matrix-bridge -f containers/matrix-bridge/Containerfile .
```

Key files:
- `containers/*/Containerfile`
- `services/matrix-bridge/` — Matrix bot bridge

### Tier 3: Containerfile, bootc, and System

OS image building and systemd integration.

Key files:
- `Containerfile` — bootc OS image (packages, scripts, config baked in)
- `sysconfig/` — systemd sysusers, tmpfiles, sudoers, service units
- `bootc/config.toml.example` — SSH key config for bootc-image-builder
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
