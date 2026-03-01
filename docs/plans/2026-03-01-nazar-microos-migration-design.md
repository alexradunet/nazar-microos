# Nazar: MicroOS Migration Design

**Date:** 2026-03-01
**Status:** Approved
**Replaces:** Nixpi (NixOS-based)

## Context

Nixpi is a services project that happens to use NixOS. The NixOS layer creates a high barrier for users who just want a working AI companion system. MicroOS + Podman provides a simpler, more accessible deployment while preserving the core domain logic.

**Key insight:** The valuable parts of Nixpi (ObjectStore, persona system, Pi skills, Matrix bridge, heartbeat) are OS-independent. NixOS modules are just one deployment frontend. Nazar replaces that frontend with MicroOS + KIWI + Podman Quadlet.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Name | Nazar (working name) | New project, new identity |
| Target OS | openSUSE MicroOS | Immutable, btrfs snapshots, transactional-update |
| Target hardware | Any Linux machine | Not tied to specific hardware |
| Service runtime | Podman containers | Reproducible, isolated, familiar |
| Container management | Podman Quadlet | systemd-native, no compose daemon |
| Image build | KIWI NG | MicroOS-native image builder, OBS-compatible |
| User config | YAML (`nazar.yaml`) | Replaces NixOS typed options |
| Testing | Container-based integration tests | Replaces NixOS VM tests |
| Repo strategy | Fresh repo, port what's needed | Clean start, no legacy baggage |
| Pi framework | pi.dev (agentic AI CLI) | Unchanged from Nixpi |

---

## 1. Project Structure

```
nazar/
├── image/                          # KIWI NG image description
│   ├── config.xml                  # Base image spec (packages, users, repos)
│   ├── config.sh                   # Post-install script
│   └── root/                       # Overlay tree baked into image
│       ├── etc/
│       │   ├── containers/systemd/ # Quadlet unit files
│       │   ├── nazar/
│       │   │   └── nazar.yaml.default
│       │   └── systemd/system/
│       │       └── nazar-setup.service
│       └── usr/
│           ├── bin/
│           │   └── nazar           # CLI wrapper
│           └── share/nazar/
│               ├── persona/        # Persona files
│               └── skills/         # Pi skills
├── containers/                     # Containerfiles for each service
│   ├── base/
│   │   └── Containerfile           # Shared base: Node 22 + nazar-core
│   ├── heartbeat/
│   │   └── Containerfile
│   ├── matrix-bridge/
│   │   └── Containerfile
│   └── object-tools/
│       └── Containerfile
├── packages/
│   └── nazar-core/                 # Ported from @nixpi/core
│       ├── src/
│       │   ├── types.ts
│       │   ├── ObjectStore.ts
│       │   └── JsYamlFrontmatterParser.ts
│       ├── test/
│       ├── package.json
│       └── tsconfig.json
├── scripts/
│   ├── nazar-object.sh             # Ported from nixpi-object.sh
│   └── nazar-setup.sh              # Reads nazar.yaml, generates Quadlet files
├── persona/                        # Source persona files
│   ├── SOUL.md
│   ├── BODY.md
│   ├── FACULTY.md
│   └── SKILL.md
├── skills/                         # Pi skills
│   ├── object-journal/
│   ├── object-task/
│   ├── object-note/
│   ├── heartbeat/
│   ├── persona-harvest/
│   └── install-nazar/
├── tests/
│   ├── unit/                       # TypeScript unit tests (node:test)
│   ├── shell/                      # Shell script tests
│   ├── container/                  # Per-container smoke tests
│   └── integration/                # Multi-container integration tests
│       └── compose.yaml
├── nazar.yaml.example              # User config template
├── package.json                    # npm workspaces root
├── README.md
└── .github/
    └── workflows/
        ├── test.yaml               # CI: unit + container + integration
        └── build-image.yaml        # CI: KIWI image build
```

---

## 2. Configuration System

### nazar.yaml

Replaces NixOS module options. Users edit a single YAML file.

```yaml
# /etc/nazar/nazar.yaml

# --- Identity ---
hostname: nazar-box
primary_user: alex
timezone: UTC

# --- Modules ---
modules:
  tailscale:
    enable: true
  syncthing:
    enable: true
  ttyd:
    enable: true
    port: 7681
  desktop:
    enable: true
    environment: gnome    # gnome | kde | sway
  password_policy:
    enable: true
  objects:
    enable: true
    store_path: /var/lib/nazar/objects
  heartbeat:
    enable: true
    interval: 30m
  channels:
    matrix:
      enable: true
      homeserver: conduit
      allowed_users: []

# --- Pi agent ---
pi:
  version: "0.55.3"
  skills_dir: /usr/share/nazar/skills
  persona_dir: /usr/share/nazar/persona

# --- Networking ---
firewall:
  restrict_to_tailscale: true
  open_ports: []
```

### Config Application Flow

1. User edits `/etc/nazar/nazar.yaml`
2. Runs `nazar apply`
3. `nazar-setup.sh` validates YAML (schema check via yq assertions)
4. Generates Quadlet `.container` files for enabled modules only
5. Runs `systemctl daemon-reload` and starts/stops affected services
6. Most changes take effect without reboot (container-level)
7. Changes requiring `transactional-update` (rare: new host packages) prompt for reboot

### Validation

The setup script validates:
- Required fields present (`hostname`, `primary_user`)
- Module-specific constraints (e.g., `heartbeat.interval` is a valid systemd time span)
- Port conflicts (no two services on the same port)
- Path existence for `objects.store_path`

Invalid config produces a clear error and no changes are applied.

---

## 3. Container Architecture

### Base Image

`nazar-base` — shared container image:
- Node.js 22
- `@nazar/core` package
- yq-go, jq
- Non-root user `nazar`

All service containers build `FROM nazar-base`.

### Service Containers

| Container | Base | Purpose | Volumes |
|-----------|------|---------|---------|
| `nazar-heartbeat` | nazar-base | Periodic scan of objects, nudges | `objects:ro`, `nazar-config:ro` |
| `nazar-matrix-bridge` | nazar-base | matrix-bot-sdk to Pi print mode | `objects:rw`, `nazar-config:ro` |
| `nazar-conduit` | matrixconduit/matrix-conduit | Self-hosted Matrix homeserver | `conduit-data` |
| `nazar-syncthing` | syncthing/syncthing | File sync | `objects:rw`, user home |
| `nazar-ttyd` | nazar-base + ttyd | Web terminal | host network |

### Quadlet Unit Example

`/etc/containers/systemd/nazar-heartbeat.container`:

```ini
[Unit]
Description=Nazar Heartbeat Service
After=network-online.target

[Container]
Image=ghcr.io/alexradunet/nazar-heartbeat:latest
Volume=/var/lib/nazar/objects:/data/objects:ro
Volume=/etc/nazar:/etc/nazar:ro
Environment=NAZAR_CONFIG=/etc/nazar/nazar.yaml

[Service]
Type=oneshot
Restart=no

[Timer]
OnCalendar=*:0/30
Persistent=true

[Install]
WantedBy=timers.target
```

### Shared Data

All under `/var/lib/nazar/` (writable btrfs subvolume, survives rollbacks):
- `objects/` — flat-file object store
- `conduit/` — Matrix homeserver data
- `config/` — runtime-generated config

### Container Registry

Images published to `ghcr.io/alexradunet/nazar-*`, built by GitHub Actions, tagged by git SHA + `latest`.

---

## 4. KIWI Image Build

### Image Contents

**Packages (in `config.xml`):**
- `podman` — container runtime
- `yq`, `jq` — YAML/JSON tools for `nazar-object.sh`
- `tailscale` — VPN (host-level, not containerized)
- `git` — user workflows
- MicroOS base (btrfs-progs, transactional-update, snapper, systemd)

**Users:**
- `nazar-agent` — system user, `podman` group, runs containers rootless

**Overlay files (in `root/` tree):**
- `/etc/nazar/nazar.yaml.default` — default config
- `/etc/containers/systemd/nazar-*.container` — Quadlet templates
- `/usr/bin/nazar` — CLI wrapper
- `/usr/share/nazar/persona/` — persona files
- `/usr/share/nazar/skills/` — Pi skills
- `/etc/systemd/system/nazar-setup.service` — first-boot service

**Post-install (`config.sh`):**
- Enable `nazar-setup.service`
- Pre-pull container images (fast first boot)
- Set default firewall rules

### Build Pipeline

```
GitHub Actions:
  1. Build + push container images to ghcr.io
  2. Run KIWI NG to produce .raw disk image
  3. Compress to .raw.xz
  4. Publish as GitHub Release artifact
```

### User Install Flow

```bash
# Download nazar-microos-latest.raw.xz from GitHub Releases
# Flash to disk or import into VM
# Boot → first-boot setup runs automatically
# Edit /etc/nazar/nazar.yaml to customize
# Run: nazar apply
```

---

## 5. The `nazar` CLI

Bash script at `/usr/bin/nazar`. Replaces the NixOS-integrated `nixpi` CLI.

```bash
nazar apply              # Read nazar.yaml, generate Quadlet files, reload systemd
nazar status             # Show running services, object store stats
nazar setup              # Interactive first-time setup (generates nazar.yaml)
nazar update             # Pull latest container images, restart services
nazar rollback           # Rollback to previous btrfs snapshot (via snapper)
nazar object <cmd>       # CRUD wrapper → nazar-object.sh
nazar pi [args]          # Launch Pi agent with persona + skills
```

### `nazar apply` internals

```
1. Read /etc/nazar/nazar.yaml
2. Validate schema
3. For each module in modules.*:
   - If enable: true → generate Quadlet .container file from template
   - If enable: false → remove Quadlet file if exists
4. systemctl daemon-reload
5. Start newly enabled services, stop newly disabled ones
6. Print summary of changes
```

---

## 6. Testing Strategy

### Test Layers

| Layer | Tool | Tests | CI |
|-------|------|-------|-----|
| Unit | `node:test` | ObjectStore, FrontmatterParser, types | Yes |
| Shell | bash + helpers.sh | `nazar-object.sh` CRUD | Yes |
| Container smoke | `podman run` + health | Each container starts and is healthy | Yes |
| Integration | `podman-compose` | Multi-container scenarios | Yes |
| Config validation | `nazar apply --dry-run` | YAML schema, Quadlet generation | Yes |

### Replacing NixOS VM Tests

| NixOS VM test | Nazar replacement |
|---------------|-------------------|
| Service starts correctly | Container smoke test (health check) |
| PAM password policy | Dropped (host concern, not containerized) |
| Firewall rules correct | Integration test (port reachability assertions) |
| Activation scripts create dirs | Config validation test (`nazar apply --dry-run`) |
| Object store operations | Unit tests (ported, already exist) |
| Matrix bridge connects | Integration test (compose up conduit + bridge) |
| Syncthing discovers peers | Integration test (two syncthing containers) |

### CI Pipeline

```yaml
# .github/workflows/test.yaml
jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps: [npm ci, npm test]

  shell-tests:
    runs-on: ubuntu-latest
    steps: [install yq jq, ./tests/shell/run.sh]

  container-tests:
    runs-on: ubuntu-latest
    needs: []
    steps:
      - Build all containers
      - Run health checks per container

  integration-tests:
    runs-on: ubuntu-latest
    needs: [container-tests]
    steps:
      - podman-compose up
      - Run integration test scripts
      - podman-compose down
```

---

## 7. Migration Map

### Port (rename + adapt)

| Source (Nixpi) | Target (Nazar) | Changes needed |
|----------------|----------------|----------------|
| `packages/nixpi-core/` | `packages/nazar-core/` | Rename package, update imports |
| `scripts/nixpi-object.sh` | `scripts/nazar-object.sh` | Rename, update paths |
| `services/matrix-bridge/` | `containers/matrix-bridge/` | Wrap in Containerfile, env-var config |
| `persona/` | `persona/` | Verbatim copy |
| `infra/pi/skills/` | `skills/` | Update system refs (NixOS → MicroOS) |
| `tests/test_*.sh` | `tests/shell/` | Rename, update paths |
| TS tests | `tests/unit/` | Rename package refs |

### Rewrite

| Component | What changes |
|-----------|-------------|
| SYSTEM.md | Remove NixOS refs, add MicroOS/Podman context |
| CLI wrapper | `nixpi` → `nazar` bash script with new subcommands |
| Config system | NixOS modules → `nazar.yaml` + `nazar-setup.sh` |
| Activation scripts | NixOS activation → Combustion first-boot + `nazar apply` |
| Consumer template | `nix flake init` → KIWI image download |

### Drop

| Component | Reason |
|-----------|--------|
| `infra/nixos/modules/` (10 files) | Replaced by YAML config + Quadlet |
| `infra/nixos/lib/mk-nixpi-service.nix` | Replaced by Quadlet templates |
| `flake.nix` | No longer Nix-based |
| `tests/vm/` (25 files) | Replaced by container tests |
| `templates/default/` | Replaced by KIWI image |

---

## 8. What We Gain

- **10x larger potential user base** — no Nix knowledge required
- **Simpler onboarding** — flash image, edit YAML, run `nazar apply`
- **Familiar tooling** — bash, YAML, Podman, systemd
- **Container reproducibility** — pinned image tags = identical services everywhere
- **btrfs rollback** — snapshot-based system rollback via snapper
- **GitHub Actions CI** — standard, widely understood, free for open source

## 9. What We Lose

- **Typed config validation** — NixOS `lib.mkOption` with type checking → bash assertions (weaker)
- **Atomic `/etc` rollback** — MicroOS rolls back `/usr` snapshots but `/etc` overlay is separate
- **25 VM integration tests** — replaced by container tests (less coverage of host-level config)
- **Single-command full rebuild** — `nixos-rebuild switch` → `nazar apply` (container-level only, not full system)
- **nixpkgs ecosystem** — 100k+ packages → RPM repos + Flatpak + Distrobox
- **Hermetic builds** — Nix sandbox → Containerfile builds (reproducible but not hermetic)

## 10. Open Questions

- **Tailscale:** Host-level or containerized? Host is simpler (needs `transactional-update pkg install tailscale`).
- **Desktop module:** KIWI can build Aeon (GNOME) or Kalpa (KDE) variants. Ship one or both?
- **OBS publishing:** Start with GitHub Releases for images, migrate to OBS later?
- **Secrets management:** How to handle Matrix tokens, Tailscale auth keys? `.env` file in `/etc/nazar/`?
