#!/usr/bin/env bash
set -euo pipefail

# nazar-setup.sh — Read nazar.yaml, validate, generate Podman Quadlet files.
#
# Works on Fedora CoreOS (and any systemd + Podman Quadlet host).
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

[[ -f "$NAZAR_CONFIG" ]] || die "config file not found: $NAZAR_CONFIG"

# --- Validate required fields ---
hostname="$(yq '.hostname // ""' "$NAZAR_CONFIG")"
primary_user="$(yq '.primary_user // ""' "$NAZAR_CONFIG")"

[[ -n "$hostname" && "$hostname" != "null" ]] || die "required field 'hostname' is missing"
[[ -n "$primary_user" && "$primary_user" != "null" ]] || die "required field 'primary_user' is missing"

# --- Validate config schema ---
yq '.' "$NAZAR_CONFIG" > /dev/null 2>&1 || die "invalid YAML syntax in $NAZAR_CONFIG"

hb_interval="$(yq '.modules.heartbeat.interval // ""' "$NAZAR_CONFIG")"
if [[ -n "$hb_interval" && "$hb_interval" != "null" ]]; then
  [[ "$hb_interval" =~ ^[0-9]+[mhd]$ ]] || die "invalid heartbeat interval '$hb_interval' (expected format: 30m, 2h, 1d)"
fi

ttyd_port="$(yq '.modules.ttyd.port // ""' "$NAZAR_CONFIG")"
if [[ -n "$ttyd_port" && "$ttyd_port" != "null" ]]; then
  [[ "$ttyd_port" =~ ^[0-9]+$ ]] || die "invalid ttyd port '$ttyd_port' (must be numeric)"
fi

matrix_enabled="$(yq '.modules.channels.matrix.enable // "false"' "$NAZAR_CONFIG")"
if [[ "$matrix_enabled" == "true" ]]; then
  matrix_homeserver="$(yq '.modules.channels.matrix.homeserver // ""' "$NAZAR_CONFIG")"
  [[ -n "$matrix_homeserver" && "$matrix_homeserver" != "null" ]] || die "matrix is enabled but 'modules.channels.matrix.homeserver' is missing"
fi

if [[ "$DRY_RUN" -eq 0 ]]; then
  [[ -w "$QUADLET_OUTPUT_DIR" ]] || { mkdir -p "$QUADLET_OUTPUT_DIR" 2>/dev/null && [[ -w "$QUADLET_OUTPUT_DIR" ]]; } || die "output directory is not writable: $QUADLET_OUTPUT_DIR"
fi

# --- Helper: read module config ---
module_enabled() {
  local path="$1"
  local val
  val="$(yq "$path" "$NAZAR_CONFIG")"
  [[ "$val" == "true" ]]
}

module_value() {
  local path="$1" default="$2"
  local val
  val="$(yq "$path // \"$default\"" "$NAZAR_CONFIG")"
  echo "$val"
}

# --- Create output directory ---
mkdir -p "$QUADLET_OUTPUT_DIR"

# --- Generate Quadlet files for enabled modules ---
#
# NOTE: The following images use :latest tags. For production reproducibility,
# pin these to specific digests or version tags:
#   - ghcr.io/alexradunet/nazar-heartbeat:latest
#   - docker.io/matrixconduit/matrix-conduit:latest
#   - ghcr.io/alexradunet/nazar-matrix-bridge:latest
#   - docker.io/syncthing/syncthing:latest
#   - docker.io/tsl0922/ttyd:latest

# Heartbeat
if module_enabled '.modules.heartbeat.enable'; then
  interval="$(module_value '.modules.heartbeat.interval' '30m')"
  # Convert interval to OnCalendar format: Xm (minutes), Xh (hours), Xd (daily)
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
Volume=/var/lib/nazar/objects:/data/objects:ro
Volume=/etc/nazar:/etc/nazar:ro
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
fi

# Matrix (Conduit + Bridge)
if module_enabled '.modules.channels.matrix.enable'; then
  cat > "$QUADLET_OUTPUT_DIR/nazar-conduit.container" <<EOF
[Unit]
Description=Nazar Conduit Matrix Homeserver
After=network-online.target

[Container]
Image=docker.io/matrixconduit/matrix-conduit:latest
Volume=/var/lib/nazar/conduit:/var/lib/matrix-conduit:rw
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
Volume=/var/lib/nazar/objects:/data/objects:rw
Volume=/etc/nazar:/etc/nazar:ro
Environment=NAZAR_CONFIG=/etc/nazar/nazar.yaml
Environment=MATRIX_HOMESERVER_URL=http://nazar-conduit:6167

[Service]
Restart=always

[Install]
WantedBy=default.target
EOF
  GENERATED_COUNT=$((GENERATED_COUNT + 1))
fi

# Syncthing
if module_enabled '.modules.syncthing.enable'; then
  cat > "$QUADLET_OUTPUT_DIR/nazar-syncthing.container" <<EOF
[Unit]
Description=Nazar Syncthing
After=network-online.target

[Container]
Image=docker.io/syncthing/syncthing:latest
Volume=/var/lib/nazar:/var/syncthing:rw
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
fi

# ttyd
if module_enabled '.modules.ttyd.enable'; then
  ttyd_port="$(module_value '.modules.ttyd.port' '7681')"
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
fi

# --- Summary ---
echo "Generated $GENERATED_COUNT Quadlet file(s) in $QUADLET_OUTPUT_DIR"

if [[ "$DRY_RUN" -eq 0 ]]; then
  echo "Reloading systemd..."
  systemctl daemon-reload 2>/dev/null || true
  echo "Done. Run 'systemctl list-units nazar-*' to check services."
else
  echo "(dry-run mode — no systemctl reload)"
fi
