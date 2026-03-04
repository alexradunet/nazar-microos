# CLAUDE.md

## Project

piBloom — self-hosted AI companion on Fedora bootc. Podman Quadlet containers, systemd, flat-file object store.

## Architecture

- **Monorepo**: npm workspaces — `core` (shared library, package: `@pibloom/core`), `bridges/*` (bridge services)
- **Shell scripts**: `scripts/` — bash CLI tools (pibloom router, deploy, vm)
- **pibloom-core CLI**: `pibloom-core object|setup|evolve|bridge` — TypeScript CLI replacing yq/jq bash scripts
- **Agent**: `core/agent/persona/` — OpenPersona 4-layer (SOUL, BODY, FACULTY, SKILL)
- **Agent**: `core/agent/skills/*/SKILL.md` — Pi agent domain skills
- **Agent**: `core/agent/context/` — System context for agent prompts (SYSTEM.md, APPEND_SYSTEM.md)
- **Bridges**: `bridges/{signal,web,whatsapp}/` — bridge services, each with manifest.yaml, body-channel.md, Containerfile
- **Containers**: `core/containers/base/` — shared base container, `core/containers/heartbeat/` — core health service
- **OS image**: `os/Containerfile` — Fedora bootc 42
- **Config**: `pibloom.yaml` applied by `pibloom-core setup` → Podman Quadlet files

## Build and Test

npm install                    # install all workspace deps
npm run build                  # tsc --build (all workspaces)
npm test                       # TypeScript tests (all workspaces)
npm run check                  # biome lint + format check
npm run check:fix              # biome auto-fix
make image                     # build bootc OS image
make containers                # build service containers

## Conventions

- **TypeScript**: strict, ES2022, NodeNext, composite project references
- **Formatting**: Biome (2-space, double quotes). No eslint/prettier.
- **Shell**: `#!/usr/bin/env bash` + `set -euo pipefail`
- **Testing**: `node:test` for TS
- **Containers**: `Containerfile` (not Dockerfile), `podman` (not docker)
- **Architecture**: Hexagonal. PARA for object organization.

## Do Not

- Add eslint, prettier, or formatting tools besides Biome
- Use `Dockerfile` naming — always `Containerfile`
- Use `docker` CLI — always `podman`
- Add pnpm or yarn — npm workspaces only
- Commit `.pibloom-deploy.env` or `os/bootc/config.toml`
