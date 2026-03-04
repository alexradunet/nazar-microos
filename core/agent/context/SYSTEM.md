# System Context

You are running on a Fedora bootc system managed by Bloom.

## Architecture

- **OS:** Fedora bootc (immutable, image-based updates via `bootc update`)
- **Services:** Podman Quadlet containers managed by systemd
- **Config:** `/etc/pibloom/pibloom.yaml` — single YAML config, applied via `pibloom apply`
- **Data:** `/var/lib/pibloom/objects/` — flat-file object store (YAML frontmatter + Markdown)
- **User:** `pibloom-agent` (uid 900) — system user running all services

## Key Commands

| Command | Purpose |
|---------|---------|
| `pibloom apply` | Read config, generate Quadlet files, reload systemd |
| `pibloom apply --dry-run` | Generate Quadlet files without reloading |
| `pibloom status` | Show bootc deployments, running services, and object store stats |
| `pibloom update` | Update OS via bootc and pull latest container images |
| `pibloom rollback` | Show bootc deployments and rollback instructions |
| `pibloom evolve install <slug>` | Deploy containers from an approved evolution object |
| `pibloom evolve rollback <slug>` | Stop and remove evolution containers |
| `pibloom evolve status [slug]` | Show evolution state |
| `pibloom object <cmd>` | Object store CRUD (`create`, `read`, `list`, `update`, `search`, `link`) |

## Core Services

| Service | Type | Purpose |
|---------|------|---------|
| `pibloom-heartbeat.service` | Native systemd oneshot | Periodic Pi heartbeat (triggered by timer) |
| `pibloom-heartbeat.timer` | Native systemd timer | Schedules heartbeat runs |

Additional services (bridges) may be installed as Podman Quadlet containers via bridge manifests. Run `pibloom evolve status` or `pibloom bridge list` to see installed bridges.

## File Locations

| Path | Contents |
|------|----------|
| `/etc/pibloom/pibloom.yaml` | System configuration |
| `/var/lib/pibloom/objects/` | Object store (journals, tasks, notes, etc.) |
| `/etc/systemd/system/` | Heartbeat .service + .timer |
| `/etc/containers/systemd/` | Generated Quadlet .container files (bridges) |
| `/usr/local/share/pibloom/persona/` | OpenPersona identity files |
| `/usr/local/share/pibloom/skills/` | Pi agent skills |
| `/var/lib/pibloom/evolution/` | Evolution state |
| `/usr/local/bin/pibloom` | CLI wrapper |

## Object Store

Objects are Markdown files with YAML frontmatter in `/var/lib/pibloom/objects/<type>/<slug>.md`.

Types: `journal`, `task`, `note`, `evolution`

Evolution objects with `area: containers` include a `containers` field listing services to deploy via Podman Quadlet.

Fields: `type`, `slug`, `title`, `status`, `priority`, `project`, `area`, `tags`, `links`, `created`, `modified`

## Rollback

Fedora bootc uses image-based atomic updates. To rollback:

```bash
sudo bootc status                 # Show current and previous deployments
sudo bootc rollback               # Switch to previous deployment
sudo systemctl reboot             # Apply rollback
```

Note: `/var/lib/pibloom/` persists across rollbacks.

## Self-Evolution (Container-Based)

Bloom evolves by adding new containers via Podman Quadlet:

1. An evolution object with `area: containers` and a `containers` list is created and approved through the pipeline.
2. User runs `pibloom evolve install <slug>` — interactive confirmation, then Quadlet file generation.
3. `systemctl daemon-reload` + `systemctl start` — no reboot needed.
4. Health check verifies container is running. If unhealthy, Quadlet files are removed automatically.

Safety: restricted sudo (only `systemctl daemon-reload/start/stop/restart/is-active pibloom-*`), configurable max containers per evolution, interactive approval, automatic rollback on health check failure.

## Persona

The OpenPersona 4-layer identity model is in `/usr/local/share/pibloom/persona/`:
- `SOUL.md` — Identity, values, voice, boundaries
- `BODY.md` — Channel adaptation, presence behavior
- `FACULTY.md` — Reasoning patterns, PARA methodology
- `SKILL.md` — Current capabilities, tool preferences
