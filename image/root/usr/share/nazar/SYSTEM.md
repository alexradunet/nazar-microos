# System Context

You are running on an openSUSE MicroOS system managed by Nazar.

## Architecture

- **OS:** openSUSE MicroOS (immutable, btrfs, transactional-update)
- **Services:** Podman Quadlet containers managed by systemd
- **Config:** `/etc/nazar/nazar.yaml` — single YAML config, applied via `nazar apply`
- **Data:** `/var/lib/nazar/objects/` — flat-file object store (YAML frontmatter + Markdown)
- **User:** `nazar-agent` (uid 900) — system user running all services

## Key Commands

| Command | Purpose |
|---------|---------|
| `nazar apply` | Read config, generate Quadlet files, reload systemd |
| `nazar apply --dry-run` | Generate Quadlet files without reloading |
| `nazar status` | Show running services and object store stats |
| `nazar update` | Pull latest container images |
| `nazar rollback` | Show btrfs snapshots, instructions for rollback |
| `nazar object <cmd>` | Object store CRUD (`create`, `read`, `list`, `update`, `search`, `link`) |

## Services (Containers)

| Service | Image | Purpose |
|---------|-------|---------|
| `nazar-heartbeat` | `nazar-heartbeat` | Periodic Pi heartbeat (timer, oneshot) |
| `nazar-conduit` | `conduwuit` | Self-hosted Matrix homeserver |
| `nazar-matrix-bridge` | `nazar-matrix-bridge` | Matrix → Pi print mode bridge |
| `nazar-syncthing` | `syncthing` | File sync for object store |
| `nazar-ttyd` | `ttyd` | Web terminal access |

## File Locations

| Path | Contents |
|------|----------|
| `/etc/nazar/nazar.yaml` | System configuration |
| `/var/lib/nazar/objects/` | Object store (journals, tasks, notes, etc.) |
| `/var/lib/nazar/conduit/` | Conduit Matrix homeserver data |
| `/etc/containers/systemd/` | Generated Quadlet .container files |
| `/usr/share/nazar/persona/` | OpenPersona identity files |
| `/usr/share/nazar/skills/` | Pi agent skills |
| `/usr/bin/nazar` | CLI wrapper |

## Object Store

Objects are Markdown files with YAML frontmatter in `/var/lib/nazar/objects/<type>/<slug>.md`.

Types: `journal`, `task`, `note`, `evolution`

Fields: `type`, `slug`, `title`, `status`, `priority`, `project`, `area`, `tags`, `links`, `created`, `modified`

## Rollback

MicroOS uses btrfs snapshots. To rollback:

```bash
snapper list                    # Show available snapshots
sudo snapper rollback <number>  # Rollback to snapshot
sudo reboot                     # Apply rollback
```

Note: `/var/lib/nazar/` is on a writable subvolume and survives rollbacks.

## Persona

The OpenPersona 4-layer identity model is in `/usr/share/nazar/persona/`:
- `SOUL.md` — Identity, values, voice, boundaries
- `BODY.md` — Channel adaptation, presence behavior
- `FACULTY.md` — Reasoning patterns, PARA methodology
- `SKILL.md` — Current capabilities, tool preferences
