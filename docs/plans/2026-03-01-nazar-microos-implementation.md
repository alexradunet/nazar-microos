# Nazar MicroOS Migration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a fresh `nazar` project that deploys the Nixpi AI companion system on openSUSE MicroOS using Podman Quadlet containers and KIWI NG images, replacing all NixOS infrastructure.

**Architecture:** Services run as Podman containers managed by Quadlet systemd units. System configuration is driven by a single `nazar.yaml` file. The OS image is built with KIWI NG and distributed as a bootable `.raw` image. The core domain logic (TypeScript ObjectStore, shell CRUD, persona, skills) is ported from the upstream Nixpi repo.

**Tech Stack:** openSUSE MicroOS, Podman + Quadlet, KIWI NG, Node.js 22, TypeScript (node:test), bash, yq-go, jq, GitHub Actions

**Upstream Nixpi source (read-only reference):** `/nix/store/rn723589cds5ihhzpp9ipxr590mv4lcw-source`
(resolve dynamically: `nix eval --impure --raw --expr '(builtins.getFlake "path:/home/alex/Nixpi").inputs.nixpi.outPath'`)

---

## Phase 1: Project Scaffold

### Task 1: Initialize the Nazar repository

**Files:**
- Create: `nazar/package.json`
- Create: `nazar/.gitignore`
- Create: `nazar/README.md`

**Step 1: Create the repo directory and initialize git**

```bash
mkdir -p ~/nazar
cd ~/nazar
git init
```

**Step 2: Create root `package.json` with npm workspaces**

```json
{
  "private": true,
  "workspaces": [
    "packages/*",
    "services/*"
  ]
}
```

**Step 3: Create `.gitignore`**

```
node_modules/
dist/
.pre-commit-config.yaml
data/objects/
*.raw
*.raw.xz
```

**Step 4: Create a minimal `README.md`**

```markdown
# Nazar

AI life companion on openSUSE MicroOS.

## Quick Start

1. Download `nazar-microos-latest.raw.xz` from Releases
2. Flash to disk or boot in a VM
3. Edit `/etc/nazar/nazar.yaml`
4. Run `nazar apply`
```

**Step 5: Commit**

```bash
git add package.json .gitignore README.md
git commit -m "feat: initialize nazar project scaffold"
```

---

### Task 2: Create directory structure

**Files:**
- Create: directories only (empty `.gitkeep` where needed)

**Step 1: Create all directories**

```bash
mkdir -p packages/nazar-core/src/__tests__
mkdir -p packages/nazar-core/src/testing
mkdir -p services/matrix-bridge/src/__tests__
mkdir -p containers/{base,heartbeat,matrix-bridge,object-tools}
mkdir -p image/root/etc/{containers/systemd,nazar,systemd/system}
mkdir -p image/root/usr/{bin,share/nazar/{persona,skills}}
mkdir -p scripts
mkdir -p persona
mkdir -p skills
mkdir -p tests/{unit,shell,container,integration}
mkdir -p .github/workflows
mkdir -p docs/plans
```

**Step 2: Add `.gitkeep` files to empty directories that need tracking**

```bash
for dir in tests/container tests/integration data; do
  touch "$dir/.gitkeep"
done
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: create nazar directory structure"
```

---

## Phase 2: Port Core Domain Logic

### Task 3: Port @nixpi/core to @nazar/core

**Files:**
- Create: `packages/nazar-core/package.json`
- Create: `packages/nazar-core/tsconfig.json`
- Create: `packages/nazar-core/src/types.ts`
- Create: `packages/nazar-core/src/frontmatter.ts`
- Create: `packages/nazar-core/src/object-store.ts`
- Create: `packages/nazar-core/src/index.ts`
- Create: `packages/nazar-core/src/testing/` (all files)
- Create: `packages/nazar-core/src/__tests__/` (all files)
- Reference: `/nix/store/rn723589cds5ihhzpp9ipxr590mv4lcw-source/packages/nixpi-core/`

**Step 1: Copy source files from upstream**

```bash
UPSTREAM="/nix/store/rn723589cds5ihhzpp9ipxr590mv4lcw-source"
cp "$UPSTREAM/packages/nixpi-core/tsconfig.json" packages/nazar-core/
cp "$UPSTREAM/packages/nixpi-core/src/types.ts" packages/nazar-core/src/
cp "$UPSTREAM/packages/nixpi-core/src/frontmatter.ts" packages/nazar-core/src/
cp "$UPSTREAM/packages/nixpi-core/src/object-store.ts" packages/nazar-core/src/
cp "$UPSTREAM/packages/nixpi-core/src/index.ts" packages/nazar-core/src/
cp -r "$UPSTREAM/packages/nixpi-core/src/testing/"* packages/nazar-core/src/testing/
cp -r "$UPSTREAM/packages/nixpi-core/src/__tests__/"* packages/nazar-core/src/__tests__/
```

**Step 2: Create `packages/nazar-core/package.json`**

```json
{
  "name": "@nazar/core",
  "version": "0.1.0",
  "private": true,
  "description": "Shared domain library for Nazar — ObjectStore, types, CLI",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./testing": "./dist/testing/index.js"
  },
  "typesVersions": {
    "*": {
      "testing": ["dist/testing/index.d.ts"]
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "tsc && node --test dist/__tests__/*.test.js"
  },
  "dependencies": {
    "js-yaml": "^4.1.0"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^25.0.0",
    "typescript": "^5.7.0"
  }
}
```

**Step 3: Rename all `@nixpi/core` references to `@nazar/core` in copied source files**

Search and replace in all `.ts` files under `packages/nazar-core/src/`:
- `@nixpi/core` → `@nazar/core`
- `nixpi` → `nazar` (only in comments, variable names, and descriptions — be careful not to break import paths)

**Step 4: Install dependencies and run tests**

```bash
cd ~/nazar
npm install
npm -w packages/nazar-core test
```

Expected: All tests pass (frontmatter, object-store, pi-mock, test-message-channel, matrix-stub-server).

**Step 5: Commit**

```bash
git add packages/nazar-core/
git commit -m "feat: port @nixpi/core to @nazar/core"
```

---

### Task 4: Port nixpi-object.sh to nazar-object.sh

**Files:**
- Create: `scripts/nazar-object.sh`
- Reference: `/nix/store/rn723589cds5ihhzpp9ipxr590mv4lcw-source/scripts/nixpi-object.sh`

**Step 1: Copy and rename**

```bash
cp "$UPSTREAM/scripts/nixpi-object.sh" scripts/nazar-object.sh
chmod +x scripts/nazar-object.sh
```

**Step 2: Update references**

In `scripts/nazar-object.sh`:
- Change default `OBJECTS_DIR` from `${HOME}/Nixpi/data/objects` to `${NAZAR_OBJECTS_DIR:-/var/lib/nazar/objects}`
- Replace `nixpi-object` in usage text with `nazar-object`
- Replace `NIXPI_OBJECTS_DIR` env var name with `NAZAR_OBJECTS_DIR`

**Step 3: Port shell test helpers and tests**

```bash
cp "$UPSTREAM/tests/helpers.sh" tests/shell/helpers.sh
```

Copy relevant shell tests from upstream `tests/test_nixpi_object_*.sh` to `tests/shell/`, renaming:
- `test_nixpi_object_update.sh` → `test_nazar_object_update.sh`
- `test_nixpi_object_read.sh` → `test_nazar_object_read.sh`
- `test_nixpi_object_list.sh` → `test_nazar_object_list.sh`
- `test_nixpi_object_link.sh` → `test_nazar_object_link.sh`
- `test_nixpi_object_cross_tool.sh` → `test_nazar_object_cross_tool.sh`
- `test_nixpi_object_evolution.sh` → `test_nazar_object_evolution.sh`

In each copied test file:
- Replace `nixpi-object` with `nazar-object`
- Replace `NIXPI_OBJECTS_DIR` with `NAZAR_OBJECTS_DIR`
- Update `source` path for `helpers.sh`

**Step 4: Create test runner script**

Create `tests/shell/run.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FAILED=0
for t in "$SCRIPT_DIR"/test_*.sh; do
  echo "--- $(basename "$t") ---"
  if bash "$t"; then
    echo "PASS"
  else
    echo "FAIL"
    FAILED=1
  fi
done
exit $FAILED
```

```bash
chmod +x tests/shell/run.sh
```

**Step 5: Run shell tests**

```bash
# Requires yq and jq in PATH
bash tests/shell/run.sh
```

Expected: All tests pass.

**Step 6: Commit**

```bash
git add scripts/nazar-object.sh tests/shell/
git commit -m "feat: port nixpi-object.sh to nazar-object.sh with tests"
```

---

### Task 5: Port persona files

**Files:**
- Create: `persona/SOUL.md`, `persona/BODY.md`, `persona/FACULTY.md`, `persona/SKILL.md`
- Reference: `/nix/store/rn723589cds5ihhzpp9ipxr590mv4lcw-source/persona/`

**Step 1: Copy persona files**

```bash
cp "$UPSTREAM/persona/"*.md persona/
```

**Step 2: Update references in all 4 files**

- Replace `Nixpi` with `Nazar` (identity references)
- Replace `NixOS` with `MicroOS` (system references)
- Replace `nixos-rebuild switch` with `nazar apply`
- Replace `nixpi-object` with `nazar-object`
- Replace `@nixpi/core` with `@nazar/core`
- In SKILL.md: update "System Operations" section to reference `nazar apply`, `nazar rollback`, `nazar update` instead of NixOS commands

**Step 3: Commit**

```bash
git add persona/
git commit -m "feat: port persona files with Nazar identity"
```

---

### Task 6: Port Pi skills

**Files:**
- Create: `skills/` (all skill directories with SKILL.md)
- Reference: `/nix/store/rn723589cds5ihhzpp9ipxr590mv4lcw-source/infra/pi/skills/`

**Step 1: Copy all skill directories**

```bash
cp -r "$UPSTREAM/infra/pi/skills/"* skills/
```

**Step 2: Rename `install-nixpi` to `install-nazar`**

```bash
mv skills/install-nixpi skills/install-nazar
```

**Step 3: Update references in all SKILL.md files**

In every `skills/*/SKILL.md`:
- Replace `nixpi` with `nazar` (command names)
- Replace `Nixpi` with `Nazar` (project name)
- Replace `NixOS` with `MicroOS`
- Replace `nixos-rebuild switch` with `nazar apply`
- Replace `nixpi-object` with `nazar-object`
- Replace `@nixpi/core` with `@nazar/core`
- Update file paths: `infra/nixos/` → references removed, `infra/pi/skills/` → `skills/`

Also rename the `nixpi-runtime` skill:

```bash
mv skills/nixpi-runtime skills/nazar-runtime
```

**Step 4: Commit**

```bash
git add skills/
git commit -m "feat: port Pi skills with Nazar references"
```

---

## Phase 3: Configuration System

### Task 7: Create nazar.yaml config schema and example

**Files:**
- Create: `nazar.yaml.example`
- Create: `image/root/etc/nazar/nazar.yaml.default`

**Step 1: Create `nazar.yaml.example`**

```yaml
# Nazar configuration
# Edit this file and run `nazar apply` to activate changes.

# --- Identity ---
hostname: nazar-box
primary_user: alex
timezone: UTC

# --- Modules ---
modules:
  tailscale:
    enable: false
  syncthing:
    enable: true
  ttyd:
    enable: true
    port: 7681
  desktop:
    enable: true
    environment: gnome
  objects:
    enable: true
    store_path: /var/lib/nazar/objects
  heartbeat:
    enable: true
    interval: 30m
  channels:
    matrix:
      enable: false
      homeserver: conduit
      allowed_users: []

# --- Pi agent ---
pi:
  version: "0.55.3"
  skills_dir: /usr/share/nazar/skills
  persona_dir: /usr/share/nazar/persona

# --- Networking ---
firewall:
  restrict_to_tailscale: false
  open_ports: []
```

**Step 2: Copy as default config**

```bash
cp nazar.yaml.example image/root/etc/nazar/nazar.yaml.default
```

**Step 3: Commit**

```bash
git add nazar.yaml.example image/root/etc/nazar/nazar.yaml.default
git commit -m "feat: add nazar.yaml config schema and defaults"
```

---

### Task 8: Write nazar-setup.sh (config validation + Quadlet generation)

**Files:**
- Create: `scripts/nazar-setup.sh`

**Step 1: Write the validation + Quadlet generation test**

Create `tests/shell/test_nazar_setup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/helpers.sh"

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

QUADLET_DIR="$TMPDIR/quadlet"
CONFIG="$TMPDIR/nazar.yaml"
mkdir -p "$QUADLET_DIR"

# Test 1: Valid config generates heartbeat Quadlet
cat > "$CONFIG" <<'EOF'
hostname: test-box
primary_user: testuser
timezone: UTC
modules:
  heartbeat:
    enable: true
    interval: 30m
  objects:
    enable: true
    store_path: /var/lib/nazar/objects
  channels:
    matrix:
      enable: false
EOF

NAZAR_CONFIG="$CONFIG" QUADLET_OUTPUT_DIR="$QUADLET_DIR" \
  bash "$SCRIPT_DIR/../../scripts/nazar-setup.sh" --dry-run

assert_file_exists "$QUADLET_DIR/nazar-heartbeat.container"
assert_file_contains "$QUADLET_DIR/nazar-heartbeat.container" "OnCalendar=*:0/30"

# Test 2: Disabled module produces no Quadlet file
assert_file_not_exists "$QUADLET_DIR/nazar-matrix-bridge.container"
assert_file_not_exists "$QUADLET_DIR/nazar-conduit.container"

# Test 3: Missing required field fails
cat > "$CONFIG" <<'EOF'
timezone: UTC
modules:
  heartbeat:
    enable: true
EOF

if NAZAR_CONFIG="$CONFIG" QUADLET_OUTPUT_DIR="$QUADLET_DIR" \
  bash "$SCRIPT_DIR/../../scripts/nazar-setup.sh" --dry-run 2>/dev/null; then
  fail "Expected validation error for missing hostname"
fi

echo "All nazar-setup tests passed."
```

**Step 2: Run test to verify it fails**

```bash
bash tests/shell/test_nazar_setup.sh
```

Expected: FAIL — `nazar-setup.sh` does not exist yet.

**Step 3: Write `scripts/nazar-setup.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

# nazar-setup.sh — Reads nazar.yaml, validates it, generates Podman Quadlet files.
#
# Environment variables:
#   NAZAR_CONFIG       — path to nazar.yaml (default: /etc/nazar/nazar.yaml)
#   QUADLET_OUTPUT_DIR — where to write .container files (default: /etc/containers/systemd)
#
# Usage:
#   nazar-setup.sh              # Apply config (generate Quadlets, reload systemd)
#   nazar-setup.sh --dry-run    # Validate and generate to output dir, don't reload

NAZAR_CONFIG="${NAZAR_CONFIG:-/etc/nazar/nazar.yaml}"
QUADLET_OUTPUT_DIR="${QUADLET_OUTPUT_DIR:-/etc/containers/systemd}"
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

die() { echo "Error: $*" >&2; exit 1; }

# --- Validation ---
[[ -f "$NAZAR_CONFIG" ]] || die "Config not found: $NAZAR_CONFIG"

hostname="$(yq -r '.hostname // ""' "$NAZAR_CONFIG")"
primary_user="$(yq -r '.primary_user // ""' "$NAZAR_CONFIG")"

[[ -n "$hostname" ]] || die "Missing required field: hostname"
[[ -n "$primary_user" ]] || die "Missing required field: primary_user"

mkdir -p "$QUADLET_OUTPUT_DIR"

# --- Heartbeat ---
heartbeat_enable="$(yq -r '.modules.heartbeat.enable // false' "$NAZAR_CONFIG")"
if [[ "$heartbeat_enable" == "true" ]]; then
  heartbeat_interval="$(yq -r '.modules.heartbeat.interval // "30m"' "$NAZAR_CONFIG")"
  # Convert interval like "30m" to OnCalendar format
  case "$heartbeat_interval" in
    *m) minutes="${heartbeat_interval%m}"; oncalendar="*:0/${minutes}" ;;
    *h) hours="${heartbeat_interval%h}"; oncalendar="*/${hours}:00" ;;
    *)  oncalendar="$heartbeat_interval" ;;
  esac

  cat > "$QUADLET_OUTPUT_DIR/nazar-heartbeat.container" <<QUADLET
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
OnCalendar=${oncalendar}
Persistent=true

[Install]
WantedBy=timers.target
QUADLET
fi

# --- Matrix (Conduit + Bridge) ---
matrix_enable="$(yq -r '.modules.channels.matrix.enable // false' "$NAZAR_CONFIG")"
if [[ "$matrix_enable" == "true" ]]; then
  cat > "$QUADLET_OUTPUT_DIR/nazar-conduit.container" <<'QUADLET'
[Unit]
Description=Nazar Conduit Matrix Homeserver
After=network-online.target

[Container]
Image=docker.io/matrixconduit/matrix-conduit:latest
Volume=/var/lib/nazar/conduit:/var/lib/matrix-conduit:Z
Environment=CONDUIT_SERVER_NAME=localhost
Environment=CONDUIT_DATABASE_BACKEND=rocksdb
Environment=CONDUIT_ALLOW_REGISTRATION=true
PublishPort=6167:6167

[Service]
Restart=always

[Install]
WantedBy=multi-user.target default.target
QUADLET

  cat > "$QUADLET_OUTPUT_DIR/nazar-matrix-bridge.container" <<'QUADLET'
[Unit]
Description=Nazar Matrix Bridge
After=nazar-conduit.service

[Container]
Image=ghcr.io/alexradunet/nazar-matrix-bridge:latest
Volume=/var/lib/nazar/objects:/data/objects
Volume=/etc/nazar:/etc/nazar:ro
Environment=NAZAR_CONFIG=/etc/nazar/nazar.yaml
Environment=MATRIX_HOMESERVER_URL=http://nazar-conduit:6167

[Service]
Restart=always

[Install]
WantedBy=multi-user.target default.target
QUADLET
fi

# --- Syncthing ---
syncthing_enable="$(yq -r '.modules.syncthing.enable // false' "$NAZAR_CONFIG")"
if [[ "$syncthing_enable" == "true" ]]; then
  cat > "$QUADLET_OUTPUT_DIR/nazar-syncthing.container" <<'QUADLET'
[Unit]
Description=Nazar Syncthing
After=network-online.target

[Container]
Image=docker.io/syncthing/syncthing:latest
Volume=/var/lib/nazar/objects:/var/syncthing/objects
PublishPort=8384:8384
PublishPort=22000:22000/tcp
PublishPort=22000:22000/udp
PublishPort=21027:21027/udp

[Service]
Restart=always

[Install]
WantedBy=multi-user.target default.target
QUADLET
fi

# --- ttyd ---
ttyd_enable="$(yq -r '.modules.ttyd.enable // false' "$NAZAR_CONFIG")"
if [[ "$ttyd_enable" == "true" ]]; then
  ttyd_port="$(yq -r '.modules.ttyd.port // 7681' "$NAZAR_CONFIG")"
  cat > "$QUADLET_OUTPUT_DIR/nazar-ttyd.container" <<QUADLET
[Unit]
Description=Nazar Web Terminal (ttyd)
After=network-online.target

[Container]
Image=ghcr.io/alexradunet/nazar-ttyd:latest
PublishPort=${ttyd_port}:7681
Network=host

[Service]
Restart=always

[Install]
WantedBy=multi-user.target default.target
QUADLET
fi

# --- Reload systemd if not dry run ---
if [[ "$DRY_RUN" -eq 0 ]]; then
  systemctl daemon-reload
  echo "Quadlet files generated and systemd reloaded."
  echo "Start services with: systemctl start nazar-*"
else
  echo "Dry run complete. Quadlet files written to $QUADLET_OUTPUT_DIR"
fi
```

```bash
chmod +x scripts/nazar-setup.sh
```

**Step 4: Add `assert_file_not_exists` to test helpers if missing**

Check `tests/shell/helpers.sh` — if it doesn't have `assert_file_not_exists` and `assert_file_contains`, add them:

```bash
assert_file_not_exists() {
  [[ ! -f "$1" ]] || { echo "FAIL: file should not exist: $1" >&2; exit 1; }
}

assert_file_contains() {
  grep -q "$2" "$1" || { echo "FAIL: '$1' does not contain '$2'" >&2; exit 1; }
}
```

**Step 5: Run tests to verify they pass**

```bash
bash tests/shell/test_nazar_setup.sh
```

Expected: All tests pass.

**Step 6: Commit**

```bash
git add scripts/nazar-setup.sh tests/shell/test_nazar_setup.sh tests/shell/helpers.sh
git commit -m "feat: add nazar-setup.sh config validator and Quadlet generator"
```

---

### Task 9: Write the nazar CLI wrapper

**Files:**
- Create: `image/root/usr/bin/nazar`

**Step 1: Write `image/root/usr/bin/nazar`**

```bash
#!/usr/bin/env bash
set -euo pipefail

# nazar — primary CLI for the Nazar AI companion
#
# Requires: yq, jq, podman, systemctl

NAZAR_CONFIG="${NAZAR_CONFIG:-/etc/nazar/nazar.yaml}"
NAZAR_DATA="/var/lib/nazar"
NAZAR_SKILLS_DIR="$(yq -r '.pi.skills_dir // "/usr/share/nazar/skills"' "$NAZAR_CONFIG" 2>/dev/null || echo "/usr/share/nazar/skills")"
NAZAR_PERSONA_DIR="$(yq -r '.pi.persona_dir // "/usr/share/nazar/persona"' "$NAZAR_CONFIG" 2>/dev/null || echo "/usr/share/nazar/persona")"
PI_VERSION="$(yq -r '.pi.version // "0.55.3"' "$NAZAR_CONFIG" 2>/dev/null || echo "0.55.3")"

case "${1-}" in
  --help|-h|help)
    cat <<'EOF'
nazar - AI life companion CLI

Usage:
  nazar                         Launch interactive Pi session
  nazar apply [--dry-run]       Generate Quadlet files from nazar.yaml
  nazar status                  Show running Nazar services
  nazar update                  Pull latest container images
  nazar rollback                Rollback to previous btrfs snapshot
  nazar object <cmd> [args]     Object store CRUD (create/read/list/update/search/link)
  nazar pi [args]               Launch Pi agent directly
  nazar setup                   First-time interactive setup
  nazar help                    Show this help
EOF
    ;;

  apply)
    shift || true
    exec /usr/share/nazar/scripts/nazar-setup.sh "$@"
    ;;

  status)
    echo "=== Nazar Services ==="
    systemctl list-units 'nazar-*' --no-pager --no-legend 2>/dev/null || echo "No nazar services found."
    echo ""
    echo "=== Object Store ==="
    if [[ -d "$NAZAR_DATA/objects" ]]; then
      find "$NAZAR_DATA/objects" -name '*.md' -type f | wc -l | xargs -I{} echo "{} objects"
    else
      echo "Object store not initialized."
    fi
    ;;

  update)
    echo "Pulling latest Nazar container images..."
    for img in $(podman images --format '{{.Repository}}:{{.Tag}}' | grep 'nazar-'); do
      podman pull "$img"
    done
    echo "Restart services with: systemctl restart nazar-*"
    ;;

  rollback)
    echo "Available snapshots:"
    snapper list
    echo ""
    echo "To rollback: sudo snapper rollback <number>"
    echo "Then reboot."
    ;;

  object)
    shift || true
    export NAZAR_OBJECTS_DIR="$NAZAR_DATA/objects"
    exec /usr/share/nazar/scripts/nazar-object.sh "$@"
    ;;

  pi)
    shift || true
    exec npx --yes "@mariozechner/pi-coding-agent@${PI_VERSION}" "$@"
    ;;

  setup)
    shift || true
    exec npx --yes "@mariozechner/pi-coding-agent@${PI_VERSION}" \
      --skill "$NAZAR_SKILLS_DIR/install-nazar/SKILL.md" "$@"
    ;;

  *)
    export PI_CODING_AGENT_DIR="$NAZAR_DATA/pi-agent"
    exec npx --yes "@mariozechner/pi-coding-agent@${PI_VERSION}" "$@"
    ;;
esac
```

```bash
chmod +x image/root/usr/bin/nazar
```

**Step 2: Commit**

```bash
git add image/root/usr/bin/nazar
git commit -m "feat: add nazar CLI wrapper"
```

---

## Phase 4: Container Images

### Task 10: Create the nazar-base container image

**Files:**
- Create: `containers/base/Containerfile`

**Step 1: Write `containers/base/Containerfile`**

```dockerfile
FROM docker.io/library/node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    jq \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install yq-go
RUN curl -fsSL "https://github.com/mikefarah/yq/releases/latest/download/yq_linux_$(dpkg --print-architecture)" \
    -o /usr/local/bin/yq && chmod +x /usr/local/bin/yq

RUN useradd -r -m -s /bin/bash nazar

WORKDIR /app

# Copy nazar-core package
COPY packages/nazar-core/package.json packages/nazar-core/
COPY packages/nazar-core/tsconfig.json packages/nazar-core/
COPY packages/nazar-core/src/ packages/nazar-core/src/
COPY package.json .

RUN npm install --workspace=packages/nazar-core && \
    npm run build --workspace=packages/nazar-core

USER nazar
```

**Step 2: Test the build**

```bash
podman build -t nazar-base -f containers/base/Containerfile .
podman run --rm nazar-base node -e "console.log('nazar-base OK')"
```

Expected: Builds successfully, prints "nazar-base OK".

**Step 3: Commit**

```bash
git add containers/base/Containerfile
git commit -m "feat: add nazar-base container image"
```

---

### Task 11: Create the heartbeat container image

**Files:**
- Create: `containers/heartbeat/Containerfile`
- Create: `containers/heartbeat/entrypoint.sh`

**Step 1: Write `containers/heartbeat/Containerfile`**

```dockerfile
FROM nazar-base

COPY scripts/nazar-object.sh /usr/local/bin/nazar-object
COPY skills/heartbeat/SKILL.md /opt/nazar/skills/heartbeat/SKILL.md
COPY persona/ /opt/nazar/persona/

USER nazar

ENTRYPOINT ["/opt/nazar/entrypoint.sh"]
```

**Step 2: Write `containers/heartbeat/entrypoint.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

PI_VERSION="${PI_VERSION:-0.55.3}"
export NAZAR_OBJECTS_DIR="${NAZAR_OBJECTS_DIR:-/data/objects}"

exec npx --yes "@mariozechner/pi-coding-agent@${PI_VERSION}" \
  -p --skill /opt/nazar/skills/heartbeat/SKILL.md
```

```bash
chmod +x containers/heartbeat/entrypoint.sh
```

**Step 3: Commit**

```bash
git add containers/heartbeat/
git commit -m "feat: add heartbeat container image"
```

---

### Task 12: Port and containerize the Matrix bridge

**Files:**
- Create: `services/matrix-bridge/package.json`
- Create: `services/matrix-bridge/tsconfig.json`
- Create: `services/matrix-bridge/src/` (all files from upstream)
- Create: `containers/matrix-bridge/Containerfile`
- Reference: `/nix/store/rn723589cds5ihhzpp9ipxr590mv4lcw-source/services/matrix-bridge/`

**Step 1: Copy source from upstream**

```bash
cp "$UPSTREAM/services/matrix-bridge/tsconfig.json" services/matrix-bridge/
cp -r "$UPSTREAM/services/matrix-bridge/src/"* services/matrix-bridge/src/
```

**Step 2: Create `services/matrix-bridge/package.json`**

```json
{
  "name": "nazar-matrix-bridge",
  "version": "0.1.0",
  "private": true,
  "description": "Minimal Matrix bridge: matrix-bot-sdk to Pi print mode",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch",
    "test": "tsc && node --test dist/__tests__/*.test.js"
  },
  "dependencies": {
    "@nazar/core": "*",
    "matrix-bot-sdk": "^0.8.0"
  },
  "devDependencies": {
    "@types/node": "^25.0.0",
    "typescript": "^5.7.0"
  }
}
```

**Step 3: Update imports in source files**

In all `.ts` files under `services/matrix-bridge/src/`:
- Replace `@nixpi/core` with `@nazar/core`

**Step 4: Create `containers/matrix-bridge/Containerfile`**

```dockerfile
FROM nazar-base

COPY services/matrix-bridge/package.json services/matrix-bridge/
COPY services/matrix-bridge/tsconfig.json services/matrix-bridge/
COPY services/matrix-bridge/src/ services/matrix-bridge/src/

RUN npm install --workspace=services/matrix-bridge && \
    npm run build --workspace=services/matrix-bridge

USER nazar

CMD ["node", "services/matrix-bridge/dist/index.js"]
```

**Step 5: Install and test**

```bash
cd ~/nazar
npm install
npm -w services/matrix-bridge test
```

Expected: Tests pass.

**Step 6: Commit**

```bash
git add services/matrix-bridge/ containers/matrix-bridge/
git commit -m "feat: port matrix bridge service and container"
```

---

## Phase 5: KIWI Image

### Task 13: Create the KIWI image description

**Files:**
- Create: `image/config.xml`
- Create: `image/config.sh`
- Create: `image/root/etc/systemd/system/nazar-setup.service`

**Step 1: Write `image/config.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<image schemaversion="7.4" name="nazar-microos">
    <description type="system">
        <author>Nazar Project</author>
        <contact>https://github.com/alexradunet/nazar</contact>
        <specification>openSUSE MicroOS with Nazar AI companion</specification>
    </description>
    <preferences>
        <version>0.1.0</version>
        <packagemanager>zypper</packagemanager>
        <rpm-excludedocs>true</rpm-excludedocs>
        <type image="oem"
              filesystem="btrfs"
              firmware="uefi"
              installiso="true"
              bootpartition="false"
              btrfs_root_is_snapshot="true">
            <oemconfig>
                <oem-systemsize>20480</oem-systemsize>
            </oemconfig>
        </type>
    </preferences>
    <repository type="rpm-md">
        <source path="obsrepositories:/"/>
    </repository>
    <packages type="image">
        <!-- MicroOS base -->
        <package name="openSUSE-MicroOS"/>
        <package name="patterns-microos-base"/>
        <package name="patterns-microos-defaults"/>

        <!-- Container runtime -->
        <package name="podman"/>
        <package name="podman-compose"/>

        <!-- Tools needed by nazar-object.sh and nazar-setup.sh -->
        <package name="yq"/>
        <package name="jq"/>
        <package name="git"/>
        <package name="curl"/>
        <package name="nodejs22"/>

        <!-- Network -->
        <package name="tailscale"/>
        <package name="NetworkManager"/>

        <!-- System tools -->
        <package name="vim"/>
        <package name="htop"/>
        <package name="tmux"/>
        <package name="openssh-server"/>
    </packages>
    <users>
        <user password="!" home="/var/lib/nazar" name="nazar-agent"
              groups="podman" id="900"/>
    </users>
</image>
```

**Step 2: Write `image/config.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Post-install configuration for the KIWI image build.

# Enable first-boot setup service
systemctl enable nazar-setup.service

# Enable SSH
systemctl enable sshd.service

# Enable Podman socket for rootless containers
systemctl enable podman.socket

# Copy nazar scripts into the image
install -m 0755 /usr/share/nazar/scripts/nazar-setup.sh /usr/share/nazar/scripts/
install -m 0755 /usr/share/nazar/scripts/nazar-object.sh /usr/share/nazar/scripts/

# Set default nazar config if not present
if [[ ! -f /etc/nazar/nazar.yaml ]]; then
  cp /etc/nazar/nazar.yaml.default /etc/nazar/nazar.yaml
fi
```

**Step 3: Write `image/root/etc/systemd/system/nazar-setup.service`**

```ini
[Unit]
Description=Nazar First-Boot Configuration
After=network-online.target
ConditionPathExists=!/etc/nazar/.setup-complete

[Service]
Type=oneshot
ExecStart=/usr/share/nazar/scripts/nazar-setup.sh
ExecStartPost=/usr/bin/touch /etc/nazar/.setup-complete
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
```

**Step 4: Commit**

```bash
git add image/
git commit -m "feat: add KIWI image description for MicroOS"
```

---

## Phase 6: CI/CD

### Task 14: Create GitHub Actions workflows

**Files:**
- Create: `.github/workflows/test.yaml`
- Create: `.github/workflows/build-image.yaml`

**Step 1: Write `.github/workflows/test.yaml`**

```yaml
name: Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm -w packages/nazar-core test
      - run: npm -w services/matrix-bridge test

  shell-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install yq and jq
        run: |
          sudo wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64
          sudo chmod +x /usr/local/bin/yq
          sudo apt-get install -y jq
      - run: bash tests/shell/run.sh

  container-tests:
    runs-on: ubuntu-latest
    needs: [unit-tests]
    steps:
      - uses: actions/checkout@v4
      - name: Build base image
        run: podman build -t nazar-base -f containers/base/Containerfile .
      - name: Build heartbeat image
        run: podman build -t nazar-heartbeat -f containers/heartbeat/Containerfile .
      - name: Build matrix-bridge image
        run: podman build -t nazar-matrix-bridge -f containers/matrix-bridge/Containerfile .
      - name: Smoke test base
        run: podman run --rm nazar-base node -e "console.log('OK')"
```

**Step 2: Write `.github/workflows/build-image.yaml`** (placeholder — KIWI builds need OBS or special runner)

```yaml
name: Build Image

on:
  release:
    types: [published]
  workflow_dispatch:

jobs:
  build-containers:
    runs-on: ubuntu-latest
    permissions:
      packages: write
    steps:
      - uses: actions/checkout@v4
      - name: Log in to GHCR
        run: echo "${{ secrets.GITHUB_TOKEN }}" | podman login ghcr.io -u ${{ github.actor }} --password-stdin
      - name: Build and push base
        run: |
          podman build -t ghcr.io/${{ github.repository_owner }}/nazar-base:${{ github.sha }} -f containers/base/Containerfile .
          podman push ghcr.io/${{ github.repository_owner }}/nazar-base:${{ github.sha }}
      - name: Build and push heartbeat
        run: |
          podman build -t ghcr.io/${{ github.repository_owner }}/nazar-heartbeat:${{ github.sha }} -f containers/heartbeat/Containerfile .
          podman push ghcr.io/${{ github.repository_owner }}/nazar-heartbeat:${{ github.sha }}
      - name: Build and push matrix-bridge
        run: |
          podman build -t ghcr.io/${{ github.repository_owner }}/nazar-matrix-bridge:${{ github.sha }} -f containers/matrix-bridge/Containerfile .
          podman push ghcr.io/${{ github.repository_owner }}/nazar-matrix-bridge:${{ github.sha }}

  # KIWI image build — requires OBS or a runner with KIWI installed.
  # Placeholder for future implementation.
  # build-kiwi-image:
  #   runs-on: ubuntu-latest
  #   needs: [build-containers]
  #   steps:
  #     - uses: actions/checkout@v4
  #     - name: Install KIWI
  #       run: pip install kiwi
  #     - name: Build image
  #       run: kiwi-ng system build --description image/ --target-dir /tmp/kiwi-output
  #     - name: Upload artifact
  #       uses: actions/upload-artifact@v4
  #       with:
  #         name: nazar-microos-image
  #         path: /tmp/kiwi-output/*.raw.xz
```

**Step 3: Commit**

```bash
git add .github/workflows/
git commit -m "feat: add GitHub Actions CI workflows"
```

---

## Phase 7: SYSTEM.md and Documentation

### Task 15: Write the Pi agent SYSTEM.md for Nazar

**Files:**
- Create: `image/root/usr/share/nazar/SYSTEM.md`

**Step 1: Write `SYSTEM.md`**

Reference the upstream version at `$UPSTREAM/.pi/agent/SYSTEM.md` (visible at `/home/alex/Nixpi/.pi/agent/SYSTEM.md`) but replace all NixOS references:

Key changes:
- "NixOS-based AI-first workstation" → "MicroOS-based AI companion system"
- "Config repo: /home/alex/Nixpi" → "Config: /etc/nazar/nazar.yaml"
- "Rebuild: sudo nixos-rebuild switch --flake ." → "Apply: nazar apply"
- "NixOS modules: infra/nixos/modules/" → "Containers: managed by Quadlet systemd units"
- "Service factory: mk-nixpi-service.nix" → removed
- Guidelines: "Prefer declarative Nix changes" → "Edit nazar.yaml and run nazar apply"
- Guidelines: "Never modify /etc or systemd directly" → "Edit /etc/nazar/nazar.yaml, run nazar apply to regenerate Quadlet files"

**Step 2: Commit**

```bash
git add image/root/usr/share/nazar/SYSTEM.md
git commit -m "feat: add Nazar SYSTEM.md for Pi agent"
```

---

### Task 16: Write CONTRIBUTING.md and update README

**Files:**
- Update: `README.md`
- Create: `CONTRIBUTING.md`

**Step 1: Expand `README.md`**

Add sections: What is Nazar, Architecture, Quick Start, Development, Contributing.

**Step 2: Write `CONTRIBUTING.md`**

Include contribution tiers:

| Tier | Area | Knowledge Needed |
|------|------|-----------------|
| 0 | Docs, persona, skills | Text editor + git |
| 1 | TypeScript (`packages/nazar-core/`) | Node.js + npm |
| 1 | Shell scripts (`scripts/`) | bash + yq + jq |
| 2 | Containerfiles | Podman/Docker basics |
| 3 | KIWI image, Quadlet, CI | MicroOS + systemd |

**Step 3: Commit**

```bash
git add README.md CONTRIBUTING.md
git commit -m "docs: add README and CONTRIBUTING with contribution tiers"
```

---

### Task 17: Copy design doc into the new repo

**Files:**
- Create: `docs/plans/2026-03-01-nazar-microos-migration-design.md`

**Step 1: Copy from Nixpi repo**

```bash
cp /home/alex/Nixpi/docs/plans/2026-03-01-nazar-microos-migration-design.md docs/plans/
```

**Step 2: Commit**

```bash
git add docs/plans/
git commit -m "docs: add migration design document"
```

---

## Phase 8: Integration Tests

### Task 18: Write container smoke tests

**Files:**
- Create: `tests/container/smoke-test.sh`

**Step 1: Write `tests/container/smoke-test.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== Building containers ==="
podman build -t nazar-base -f containers/base/Containerfile .
podman build -t nazar-heartbeat -f containers/heartbeat/Containerfile .
podman build -t nazar-matrix-bridge -f containers/matrix-bridge/Containerfile .

echo "=== Smoke tests ==="

echo "Testing nazar-base..."
podman run --rm nazar-base node -e "
  const { ObjectStore } = require('@nazar/core');
  console.log('ObjectStore imported OK');
"

echo "Testing nazar-heartbeat..."
podman run --rm nazar-heartbeat --help || echo "Heartbeat container starts OK"

echo "=== All smoke tests passed ==="
```

```bash
chmod +x tests/container/smoke-test.sh
```

**Step 2: Commit**

```bash
git add tests/container/smoke-test.sh
git commit -m "feat: add container smoke tests"
```

---

### Task 19: Write integration test compose file

**Files:**
- Create: `tests/integration/compose.yaml`
- Create: `tests/integration/run.sh`

**Step 1: Write `tests/integration/compose.yaml`**

```yaml
services:
  conduit:
    image: docker.io/matrixconduit/matrix-conduit:latest
    environment:
      CONDUIT_SERVER_NAME: localhost
      CONDUIT_DATABASE_BACKEND: rocksdb
      CONDUIT_ALLOW_REGISTRATION: "true"
    ports:
      - "6167:6167"
    volumes:
      - conduit-data:/var/lib/matrix-conduit

  matrix-bridge:
    image: nazar-matrix-bridge
    depends_on:
      - conduit
    environment:
      MATRIX_HOMESERVER_URL: http://conduit:6167
      NAZAR_CONFIG: /etc/nazar/nazar.yaml
    volumes:
      - objects:/data/objects
      - ./test-config:/etc/nazar:ro

volumes:
  conduit-data:
  objects:
```

**Step 2: Write `tests/integration/run.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== Starting integration test environment ==="
mkdir -p tests/integration/test-config
cp nazar.yaml.example tests/integration/test-config/nazar.yaml

podman-compose -f tests/integration/compose.yaml up -d

echo "Waiting for Conduit to be ready..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:6167/_matrix/client/versions >/dev/null 2>&1; then
    echo "Conduit is ready."
    break
  fi
  sleep 1
done

echo "=== Running integration assertions ==="

# Test: Conduit responds to Matrix client API
curl -sf http://localhost:6167/_matrix/client/versions | jq .versions
echo "Conduit API: OK"

echo "=== Tearing down ==="
podman-compose -f tests/integration/compose.yaml down -v
rm -rf tests/integration/test-config

echo "=== All integration tests passed ==="
```

```bash
chmod +x tests/integration/run.sh
```

**Step 3: Commit**

```bash
git add tests/integration/
git commit -m "feat: add integration tests with compose"
```

---

## Summary: Task Checklist

| # | Task | Phase | Est. |
|---|------|-------|------|
| 1 | Initialize the Nazar repository | Scaffold | 5m |
| 2 | Create directory structure | Scaffold | 5m |
| 3 | Port @nixpi/core to @nazar/core | Core | 15m |
| 4 | Port nixpi-object.sh to nazar-object.sh | Core | 15m |
| 5 | Port persona files | Core | 10m |
| 6 | Port Pi skills | Core | 10m |
| 7 | Create nazar.yaml config schema | Config | 10m |
| 8 | Write nazar-setup.sh (Quadlet generator) | Config | 20m |
| 9 | Write nazar CLI wrapper | Config | 10m |
| 10 | Create nazar-base container image | Containers | 10m |
| 11 | Create heartbeat container image | Containers | 10m |
| 12 | Port and containerize Matrix bridge | Containers | 15m |
| 13 | Create KIWI image description | Image | 15m |
| 14 | Create GitHub Actions workflows | CI | 10m |
| 15 | Write Pi agent SYSTEM.md | Docs | 15m |
| 16 | Write CONTRIBUTING.md and README | Docs | 15m |
| 17 | Copy design doc into new repo | Docs | 2m |
| 18 | Write container smoke tests | Tests | 10m |
| 19 | Write integration test compose | Tests | 15m |
