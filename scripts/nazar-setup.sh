#!/usr/bin/env bash
set -euo pipefail

# nazar-setup.sh — Read nazar.yaml, validate, generate Podman Quadlet files.
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

# Heartbeat
if module_enabled '.modules.heartbeat.enable'; then
  interval="$(module_value '.modules.heartbeat.interval' '30m')"
  # Convert interval like "30m" to OnCalendar format
  # Simple: extract minutes for "Xm" format
  if [[ "$interval" =~ ^([0-9]+)m$ ]]; then
    minutes="${BASH_REMATCH[1]}"
    on_calendar="*:0/${minutes}"
  else
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

[Service]
Type=oneshot
Restart=no

[Timer]
OnCalendar=${on_calendar}
Persistent=true

[Install]
WantedBy=timers.target
EOF
fi

# Matrix (Conduit + Bridge)
if module_enabled '.modules.channels.matrix.enable'; then
  cat > "$QUADLET_OUTPUT_DIR/nazar-conduit.container" <<EOF
[Unit]
Description=Nazar Conduit Matrix Homeserver
After=network-online.target

[Container]
Image=ghcr.io/girlbossceo/conduwuit:latest
Volume=/var/lib/nazar/conduit:/var/lib/conduwuit:rw
Environment=CONDUWUIT_SERVER_NAME=${hostname}
Environment=CONDUWUIT_DATABASE_PATH=/var/lib/conduwuit
Environment=CONDUWUIT_PORT=6167
PublishPort=6167:6167

[Service]
Restart=always

[Install]
WantedBy=default.target
EOF

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

[Service]
Restart=always

[Install]
WantedBy=default.target
EOF
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
fi

# --- Summary ---
generated=$(find "$QUADLET_OUTPUT_DIR" -maxdepth 1 -name '*.container' 2>/dev/null | wc -l)
echo "Generated $generated Quadlet file(s) in $QUADLET_OUTPUT_DIR"

if [[ "$DRY_RUN" -eq 0 ]]; then
  echo "Reloading systemd..."
  systemctl daemon-reload 2>/dev/null || true
  echo "Done. Run 'systemctl list-units nazar-*' to check services."
else
  echo "(dry-run mode — no systemctl reload)"
fi
