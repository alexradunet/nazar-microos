# System Context

You are running on a Fedora bootc system managed by Nazar.

## Architecture

- **OS:** Fedora bootc (immutable, image-based updates via `bootc update`)
- **Services:** Podman Quadlet containers managed by systemd
- **Config:** `/etc/nazar/nazar.yaml` — single YAML config, applied via `nazar apply`
- **Data:** `/var/lib/nazar/objects/` — flat-file object store (YAML frontmatter + Markdown)
- **User:** `nazar-agent` (uid 900) — system user running all services

## Key Commands

| Command | Purpose |
|---------|---------|
| `nazar apply` | Read config, generate Quadlet files, reload systemd |
| `nazar apply --dry-run` | Generate Quadlet files without reloading |
| `nazar status` | Show bootc deployments, running services, and object store stats |
| `nazar update` | Update OS via bootc and pull latest container images |
| `nazar rollback` | Show bootc deployments and rollback instructions |
| `nazar evolve install <slug>` | Deploy containers from an approved evolution object |
| `nazar evolve rollback <slug>` | Stop and remove evolution containers |
| `nazar evolve status [slug]` | Show evolution state |
| `nazar object <cmd>` | Object store CRUD (`create`, `read`, `list`, `update`, `search`, `link`) |

## Services (Containers)

| Service | Image | Purpose |
|---------|-------|---------|
| `nazar-heartbeat` | `nazar-heartbeat` | Periodic Pi heartbeat (timer, oneshot) |

Additional services may be installed via bridge manifests. Run `nazar evolve status` or `nazar bridge list` to see installed bridges.

## File Locations

| Path | Contents |
|------|----------|
| `/etc/nazar/nazar.yaml` | System configuration |
| `/var/lib/nazar/objects/` | Object store (journals, tasks, notes, etc.) |
| `/etc/containers/systemd/` | Generated Quadlet .container files |
| `/usr/local/share/nazar/persona/` | OpenPersona identity files |
| `/usr/local/share/nazar/skills/` | Pi agent skills |
| `/var/lib/nazar/evolution/` | Evolution state |
| `/usr/local/bin/nazar` | CLI wrapper |

## Object Store

Objects are Markdown files with YAML frontmatter in `/var/lib/nazar/objects/<type>/<slug>.md`.

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

Note: `/var/lib/nazar/` persists across rollbacks.

## Self-Evolution (Container-Based)

Nazar evolves by adding new containers via Podman Quadlet:

1. An evolution object with `area: containers` and a `containers` list is created and approved through the pipeline.
2. User runs `nazar evolve install <slug>` — interactive confirmation, then Quadlet file generation.
3. `systemctl daemon-reload` + `systemctl start` — no reboot needed.
4. Health check verifies container is running. If unhealthy, Quadlet files are removed automatically.

Safety: restricted sudo (only `systemctl daemon-reload/start/stop/restart/is-active nazar-*`), configurable max containers per evolution, interactive approval, automatic rollback on health check failure.

## Persona

The OpenPersona 4-layer identity model is in `/usr/local/share/nazar/persona/`:
- `SOUL.md` — Identity, values, voice, boundaries
- `BODY.md` — Channel adaptation, presence behavior
- `FACULTY.md` — Reasoning patterns, PARA methodology
- `SKILL.md` — Current capabilities, tool preferences
