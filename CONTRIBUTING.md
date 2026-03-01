# Contributing to Nazar

Contributions are welcome! This guide helps you find the right level of involvement.

## Contribution Tiers

| Tier | Area | What you need |
|------|------|---------------|
| 0 | Docs, persona, skills | Git |
| 1 | TypeScript, shell scripts | Node.js 22 / bash + yq + jq |
| 2 | Containerfiles | Podman basics |
| 3 | KIWI image, Quadlet, CI | MicroOS + systemd knowledge |

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
npm -w packages/nazar-core test

# Shell tests (needs yq + jq)
bash tests/shell/run.sh
```

Key files:
- `packages/nazar-core/src/` — ObjectStore, FrontmatterParser, types
- `scripts/nazar-object.sh` — Shell CRUD tool
- `scripts/nazar-setup.sh` — Config → Quadlet generator

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

### Tier 3: KIWI Image and System

Full MicroOS image building and systemd integration.

Key files:
- `image/config.xml` — KIWI image spec
- `image/config.sh` — Post-install script
- `image/root/` — Overlay tree baked into image
- `nazar.yaml.example` — Config template
- `.github/workflows/` — CI/CD

## Development Conventions

- **TDD first** — Write failing tests before implementation
- **node:test** for TypeScript tests — zero framework deps
- **yq-go** for shell YAML, **js-yaml** for TypeScript YAML
- **Hexagonal architecture** — Ports (interfaces) and Adapters (implementations)
- **PARA methodology** — Projects, Areas, Resources, Archives for object organization

## Code Style

- Shell: `set -euo pipefail`, functions prefixed with `cmd_` for subcommands
- TypeScript: strict mode, ESM modules, Node16 resolution
- Commit messages: conventional commits (`feat:`, `fix:`, `docs:`, etc.)

## Testing

```bash
# All TypeScript unit tests
npm -w packages/nazar-core test

# All shell tests
bash tests/shell/run.sh

# Setup script dry-run
NAZAR_CONFIG=nazar.yaml.example QUADLET_OUTPUT_DIR=/tmp/q bash scripts/nazar-setup.sh --dry-run
```
