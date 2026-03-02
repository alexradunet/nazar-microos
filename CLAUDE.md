# CLAUDE.md

## Project

Nazar — self-hosted AI companion on Fedora bootc. Podman Quadlet containers, systemd, flat-file object store.

## Architecture

- **Monorepo**: npm workspaces — `packages/nazar-core` (shared library), `services/matrix-bridge` (Matrix bot)
- **Shell scripts**: `scripts/` — bash CLI tools baked into the bootc OS image
- **Containers**: `containers/{base,heartbeat,matrix-bridge}` — all build FROM nazar-base
- **OS image**: Root `Containerfile` — Fedora bootc 42
- **Persona**: `persona/` — OpenPersona 4-layer (SOUL, BODY, FACULTY, SKILL)
- **Skills**: `skills/*/SKILL.md` — Pi agent domain skills
- **Config**: `nazar.yaml` applied by `nazar-setup.sh` → Podman Quadlet files

## Build and Test

npm install                    # install all workspace deps
npm run build                  # tsc --build (all workspaces)
npm test                       # TypeScript tests (all workspaces)
npm run test:shell             # shell tests (needs yq + jq)
npm run test:all               # both
npm run check                  # biome lint + format check
npm run check:fix              # biome auto-fix
make image                     # build bootc OS image
make containers                # build service containers

## Conventions

- **TypeScript**: strict, ES2022, NodeNext, composite project references
- **Formatting**: Biome (2-space, double quotes). No eslint/prettier.
- **Shell**: `#!/usr/bin/env bash` + `set -euo pipefail`
- **Testing**: `node:test` for TS, bash test scripts in `tests/shell/`
- **Containers**: `Containerfile` (not Dockerfile), `podman` (not docker)
- **Architecture**: Hexagonal. PARA for object organization.

## Do Not

- Add eslint, prettier, or formatting tools besides Biome
- Use `Dockerfile` naming — always `Containerfile`
- Use `docker` CLI — always `podman`
- Add pnpm or yarn — npm workspaces only
- Commit `.nazar-deploy.env` or `bootc/config.toml`
