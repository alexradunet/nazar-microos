#!/usr/bin/env bash
set -euo pipefail

# nazar-setup.sh — Read nazar.yaml, validate, generate Podman Quadlet files.
#
# Works on Fedora bootc (and any systemd + Podman Quadlet host).
#
# Usage:
#   nazar-setup.sh [--dry-run]
#
# Environment:
#   NAZAR_CONFIG       Path to nazar.yaml (default: /etc/nazar/nazar.yaml)
#   QUADLET_OUTPUT_DIR Directory for generated .container files (default: /etc/containers/systemd)

NAZAR_CONFIG="${NAZAR_CONFIG:-/etc/nazar/nazar.yaml}"
QUADLET_OUTPUT_DIR="${QUADLET_OUTPUT_DIR:-/etc/containers/systemd}"
DRY_RUN=0
GENERATED_COUNT=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "Error: unknown argument: $arg" >&2; exit 1 ;;
  esac
done

die() { echo "Error: $*" >&2; exit 1; }

command -v yq >/dev/null || die "yq required"
[[ -f "$NAZAR_CONFIG" ]] || die "config file not found: $NAZAR_CONFIG"

# --- Validate required fields ---
hostname="$(yq '.hostname // ""' "$NAZAR_CONFIG")"
primary_user="$(yq '.primary_user // ""' "$NAZAR_CONFIG")"

[[ -n "$hostname" && "$hostname" != "null" ]] || die "required field 'hostname' is missing"
[[ -n "$primary_user" && "$primary_user" != "null" ]] || die "required field 'primary_user' is missing"

# --- Validate config schema ---
yq '.' "$NAZAR_CONFIG" > /dev/null 2>&1 || die "invalid YAML syntax in $NAZAR_CONFIG"

# --- Helper: read config value with default ---
config_value() {
  local path="$1" default="$2"
  local val
  val="$(yq "$path // \"$default\"" "$NAZAR_CONFIG")"
  echo "$val"
}

if [[ "$DRY_RUN" -eq 0 ]]; then
  mkdir -p "$QUADLET_OUTPUT_DIR" 2>/dev/null || true
  [[ -w "$QUADLET_OUTPUT_DIR" ]] || die "output directory is not writable: $QUADLET_OUTPUT_DIR"
fi

# --- Generate Quadlet files ---

# Heartbeat
interval="$(config_value '.heartbeat.interval' '30m')"
if [[ "$interval" =~ ^([0-9]+)m$ ]]; then
  on_calendar="*:0/${BASH_REMATCH[1]}"
elif [[ "$interval" =~ ^([0-9]+)h$ ]]; then
  on_calendar="*-*-* 0/${BASH_REMATCH[1]}:00:00"
elif [[ "$interval" =~ ^([0-9]+)d$ ]]; then
  on_calendar="*-*-1/${BASH_REMATCH[1]} 00:00:00"
else
  echo "Warning: unrecognized interval '$interval', defaulting to 30m" >&2
  on_calendar="*:0/30"
fi

cat > "$QUADLET_OUTPUT_DIR/nazar-heartbeat.container" <<EOF
[Unit]
Description=Nazar Heartbeat Service
After=network-online.target

[Container]
Image=ghcr.io/alexradunet/nazar-heartbeat:latest
Volume=/var/lib/nazar/objects:/data/objects:ro,z
Volume=/etc/nazar:/etc/nazar:ro,z
Environment=NAZAR_CONFIG=/etc/nazar/nazar.yaml
ReadOnly=true
NoNewPrivileges=true

[Service]
Type=oneshot
Restart=no
EOF

cat > "$QUADLET_OUTPUT_DIR/nazar-heartbeat.timer" <<EOF
[Unit]
Description=Nazar Heartbeat Timer

[Timer]
OnCalendar=${on_calendar}
Persistent=true

[Install]
WantedBy=timers.target
EOF
GENERATED_COUNT=$((GENERATED_COUNT + 2))

# Matrix (Conduit + Bridge)
cat > "$QUADLET_OUTPUT_DIR/nazar-conduit.container" <<EOF
[Unit]
Description=Nazar Conduit Matrix Homeserver
After=network-online.target

[Container]
Image=docker.io/matrixconduit/matrix-conduit:latest
Volume=/var/lib/nazar/conduit:/var/lib/matrix-conduit:rw,z
Environment=CONDUIT_SERVER_NAME=${hostname}
Environment=CONDUIT_DATABASE_BACKEND=rocksdb
Environment=CONDUIT_DATABASE_PATH=/var/lib/matrix-conduit
Environment=CONDUIT_PORT=6167
Environment=CONDUIT_CONFIG=
PublishPort=6167:6167

[Service]
Restart=always

[Install]
WantedBy=default.target
EOF
GENERATED_COUNT=$((GENERATED_COUNT + 1))

cat > "$QUADLET_OUTPUT_DIR/nazar-matrix-bridge.container" <<EOF
[Unit]
Description=Nazar Matrix Bridge
After=nazar-conduit.service

[Container]
Image=ghcr.io/alexradunet/nazar-matrix-bridge:latest
Volume=/var/lib/nazar/objects:/data/objects:rw,z
Volume=/etc/nazar:/etc/nazar:ro,z
Environment=NAZAR_CONFIG=/etc/nazar/nazar.yaml
Environment=MATRIX_HOMESERVER_URL=http://nazar-conduit:6167

[Service]
Restart=always

[Install]
WantedBy=default.target
EOF
GENERATED_COUNT=$((GENERATED_COUNT + 1))

# Syncthing
cat > "$QUADLET_OUTPUT_DIR/nazar-syncthing.container" <<EOF
[Unit]
Description=Nazar Syncthing
After=network-online.target

[Container]
Image=docker.io/syncthing/syncthing:latest
Volume=/var/lib/nazar:/var/syncthing:rw,z
PublishPort=8384:8384
PublishPort=22000:22000/tcp
PublishPort=22000:22000/udp
PublishPort=21027:21027/udp
NoNewPrivileges=true

[Service]
Restart=always

[Install]
WantedBy=default.target
EOF
GENERATED_COUNT=$((GENERATED_COUNT + 1))

# ttyd
ttyd_port="$(config_value '.ttyd.port' '7681')"
cat > "$QUADLET_OUTPUT_DIR/nazar-ttyd.container" <<EOF
[Unit]
Description=Nazar Web Terminal (ttyd)
After=network-online.target

[Container]
Image=docker.io/tsl0922/ttyd:latest
PublishPort=${ttyd_port}:7681

[Service]
Restart=always

[Install]
WantedBy=default.target
EOF
GENERATED_COUNT=$((GENERATED_COUNT + 1))

# --- Summary ---
echo "Generated $GENERATED_COUNT Quadlet file(s) in $QUADLET_OUTPUT_DIR"

if [[ "$DRY_RUN" -eq 0 ]]; then
  echo "Reloading systemd..."
  systemctl daemon-reload 2>/dev/null || true
  echo "Done. Run 'systemctl list-units nazar-*' to check services."
else
  echo "(dry-run mode — no systemctl reload)"
fi
