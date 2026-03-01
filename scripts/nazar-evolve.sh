#!/usr/bin/env bash
set -euo pipefail

# nazar-evolve.sh — Container-based evolution lifecycle.
#
# Manages evolution by deploying containers via Podman Quadlet files.
# No reboots required — containers start immediately after generation.
#
# Usage:
#   nazar-evolve install <slug>   Read evolution object, deploy containers
#   nazar-evolve rollback <slug>  Stop and remove evolution containers
#   nazar-evolve status [slug]    Show evolution state

NAZAR_CONFIG="${NAZAR_CONFIG:-/etc/nazar/nazar.yaml}"
NAZAR_OBJECTS_DIR="${NAZAR_OBJECTS_DIR:-/var/lib/nazar/objects}"
NAZAR_EVOLVE_DIR="${NAZAR_EVOLVE_DIR:-/var/lib/nazar/evolution}"
NAZAR_OBJECT_CMD="${NAZAR_OBJECT_CMD:-nazar-object}"
QUADLET_DIR="${QUADLET_DIR:-/etc/containers/systemd}"
HEALTH_CHECK_TIMEOUT="${HEALTH_CHECK_TIMEOUT:-30}"

# --- Helpers ---

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo ":: $*"; }
warn() { echo "WARNING: $*" >&2; }

read_config_value() {
  local key="$1"
  yq -r "$key" "$NAZAR_CONFIG" 2>/dev/null | grep -v '^null$' || echo ""
}

get_max_containers() {
  local val
  val=$(read_config_value '.evolution.max_containers_per_evolution')
  echo "${val:-5}"
}

# Read the containers field from an evolution object's frontmatter as JSON array.
read_containers() {
  local slug="$1"
  local file="${NAZAR_OBJECTS_DIR}/evolution/${slug}.md"
  [[ -f "$file" ]] || die "evolution object not found: $slug"

  local frontmatter
  frontmatter=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$file")
  echo "$frontmatter" | yq -o=json '.containers // []' 2>/dev/null
}

# Validate a container entry: name must start with nazar- and contain safe chars, image required.
validate_container() {
  local name="$1"
  local image="$2"

  [[ -n "$name" ]] || die "container entry missing 'name' field"
  [[ -n "$image" ]] || die "container '$name' missing 'image' field"

  if [[ ! "$name" =~ ^nazar-[a-zA-Z0-9][a-zA-Z0-9._-]*$ ]]; then
    die "invalid container name: '$name' (must start with 'nazar-' and contain only alphanumeric, dot, underscore, hyphen)"
  fi
}

# Generate a Quadlet .container file from container spec.
generate_quadlet() {
  local name="$1"
  local image="$2"
  local volumes_json="$3"
  local env_json="$4"
  local quadlet_file="${QUADLET_DIR}/${name}.container"

  local volume_lines=""
  local num_volumes
  num_volumes=$(echo "$volumes_json" | jq -r 'length')
  for ((i = 0; i < num_volumes; i++)); do
    local vol
    vol=$(echo "$volumes_json" | jq -r ".[$i]")
    volume_lines="${volume_lines}Volume=${vol}
"
  done

  local env_lines=""
  local env_keys
  env_keys=$(echo "$env_json" | jq -r 'keys[]' 2>/dev/null || true)
  for key in $env_keys; do
    local val
    val=$(echo "$env_json" | jq -r ".[\"$key\"]")
    env_lines="${env_lines}Environment=${key}=${val}
"
  done

  if [[ "${NAZAR_DRY_RUN:-}" == "1" ]]; then
    info "[dry-run] Would write Quadlet file: $quadlet_file"
    echo "[Unit]"
    echo "Description=Nazar Evolution Container: ${name}"
    echo "After=network-online.target"
    echo ""
    echo "[Container]"
    echo "Image=${image}"
    printf '%s' "$volume_lines"
    printf '%s' "$env_lines"
    echo ""
    echo "[Service]"
    echo "Restart=always"
    echo ""
    echo "[Install]"
    echo "WantedBy=default.target"
    return
  fi

  cat > "$quadlet_file" <<EOF
[Unit]
Description=Nazar Evolution Container: ${name}
After=network-online.target

[Container]
Image=${image}
${volume_lines}${env_lines}
[Service]
Restart=always

[Install]
WantedBy=default.target
EOF

  info "Generated Quadlet: $quadlet_file"
}

# Health check: poll systemctl is-active up to timeout seconds.
health_check() {
  local service="$1"
  local timeout="$HEALTH_CHECK_TIMEOUT"
  local elapsed=0

  info "Health check: waiting up to ${timeout}s for ${service}.service..."

  while [[ $elapsed -lt $timeout ]]; do
    if sudo systemctl is-active "${service}.service" >/dev/null 2>&1; then
      info "  OK: ${service}.service is active"
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done

  warn "${service}.service failed to become active within ${timeout}s"
  return 1
}

# --- Subcommands ---

cmd_install() {
  local slug="${1:-}"
  [[ -n "$slug" ]] || die "usage: nazar-evolve install <slug>"

  info "Reading evolution object: $slug"

  # Read containers from the evolution object
  local containers_json
  containers_json=$(read_containers "$slug")

  local num_containers
  num_containers=$(echo "$containers_json" | jq 'length')
  [[ "$num_containers" -gt 0 ]] || die "no containers found in evolution/$slug"

  # Check container count limit
  local max
  max=$(get_max_containers)
  if [[ "$num_containers" -gt "$max" ]]; then
    die "too many containers ($num_containers > max $max). Increase evolution.max_containers_per_evolution in nazar.yaml"
  fi

  # Validate all containers first
  local container_names=()
  for ((i = 0; i < num_containers; i++)); do
    local name image
    name=$(echo "$containers_json" | jq -r ".[$i].name")
    image=$(echo "$containers_json" | jq -r ".[$i].image")
    validate_container "$name" "$image"
    container_names+=("$name")
  done

  # Interactive approval
  echo ""
  echo "The following containers will be deployed:"
  for ((i = 0; i < num_containers; i++)); do
    local name image
    name=$(echo "$containers_json" | jq -r ".[$i].name")
    image=$(echo "$containers_json" | jq -r ".[$i].image")
    echo "  - $name ($image)"
  done
  echo ""

  if [[ "${NAZAR_EVOLVE_YES:-}" == "1" ]]; then
    info "Auto-approved (NAZAR_EVOLVE_YES=1)"
  else
    read -r -p "Deploy these containers? [y/N] " confirm
    [[ "$confirm" =~ ^[Yy]$ ]] || { info "Aborted."; exit 0; }
  fi

  # Ensure directories exist
  mkdir -p "$NAZAR_EVOLVE_DIR"
  mkdir -p "$QUADLET_DIR"

  # Generate Quadlet files for each container
  for ((i = 0; i < num_containers; i++)); do
    local name image volumes_json env_json
    name=$(echo "$containers_json" | jq -r ".[$i].name")
    image=$(echo "$containers_json" | jq -r ".[$i].image")
    volumes_json=$(echo "$containers_json" | jq ".[$i].volumes // []")
    env_json=$(echo "$containers_json" | jq ".[$i].environment // {}")
    generate_quadlet "$name" "$image" "$volumes_json" "$env_json"
  done

  if [[ "${NAZAR_DRY_RUN:-}" == "1" ]]; then
    info "[dry-run] Would run: systemctl daemon-reload and start services"
    return
  fi

  # Reload systemd and start services
  sudo systemctl daemon-reload

  local all_healthy=true
  for name in "${container_names[@]}"; do
    info "Starting ${name}.service..."
    sudo systemctl start "${name}.service"

    if ! health_check "$name"; then
      all_healthy=false
      break
    fi
  done

  if [[ "$all_healthy" == "true" ]]; then
    info "All containers healthy."

    "$NAZAR_OBJECT_CMD" update evolution "$slug" \
      --status=applied --agent=hermes 2>/dev/null || true

    info "Evolution '$slug' applied successfully."
  else
    warn "Health check failed. Rolling back Quadlet files..."

    for name in "${container_names[@]}"; do
      sudo systemctl stop "${name}.service" 2>/dev/null || true
      rm -f "${QUADLET_DIR}/${name}.container"
    done
    sudo systemctl daemon-reload

    "$NAZAR_OBJECT_CMD" update evolution "$slug" \
      --status=rejected --agent=hermes 2>/dev/null || true

    die "Evolution '$slug' failed health check and was rolled back."
  fi
}

cmd_rollback() {
  local slug="${1:-}"
  [[ -n "$slug" ]] || die "usage: nazar-evolve rollback <slug>"

  info "Reading evolution object: $slug"

  local containers_json
  containers_json=$(read_containers "$slug")

  local num_containers
  num_containers=$(echo "$containers_json" | jq 'length')
  [[ "$num_containers" -gt 0 ]] || die "no containers found in evolution/$slug"

  for ((i = 0; i < num_containers; i++)); do
    local name
    name=$(echo "$containers_json" | jq -r ".[$i].name")

    info "Stopping ${name}.service..."
    if [[ "${NAZAR_DRY_RUN:-}" == "1" ]]; then
      info "[dry-run] Would stop ${name}.service and remove Quadlet file"
    else
      sudo systemctl stop "${name}.service" 2>/dev/null || true
      rm -f "${QUADLET_DIR}/${name}.container"
      info "Removed Quadlet: ${QUADLET_DIR}/${name}.container"
    fi
  done

  if [[ "${NAZAR_DRY_RUN:-}" != "1" ]]; then
    sudo systemctl daemon-reload
  fi

  "$NAZAR_OBJECT_CMD" update evolution "$slug" \
    --status=rejected --agent=hermes 2>/dev/null || true

  info "Evolution '$slug' rolled back."
}

cmd_status() {
  local slug="${1:-}"

  if [[ -n "$slug" ]]; then
    local file="${NAZAR_OBJECTS_DIR}/evolution/${slug}.md"
    if [[ -f "$file" ]]; then
      "$NAZAR_OBJECT_CMD" read evolution "$slug"
    else
      die "evolution object not found: $slug"
    fi
  else
    echo "=== Evolution Objects ==="
    "$NAZAR_OBJECT_CMD" list evolution 2>/dev/null || echo "(none)"
  fi
}

# --- Main ---

subcmd="${1:-}"
shift 2>/dev/null || true

case "$subcmd" in
  install)   cmd_install "$@" ;;
  rollback)  cmd_rollback "$@" ;;
  status)    cmd_status "$@" ;;
  *)
    echo "Usage: nazar-evolve <install|rollback|status> [args]" >&2
    echo "" >&2
    echo "Commands:" >&2
    echo "  install <slug>   Deploy containers from evolution object" >&2
    echo "  rollback <slug>  Stop and remove evolution containers" >&2
    echo "  status [slug]    Show evolution state" >&2
    exit 1
    ;;
esac
