#!/usr/bin/env bash
set -euo pipefail

# nazar-evolve.sh — Host package evolution lifecycle.
#
# Manages atomic package installs on MicroOS via transactional-update,
# with pending state persistence across reboots and automatic rollback
# on verification failure.
#
# Usage:
#   nazar-evolve install <slug>   Read evolution object, install host_packages
#   nazar-evolve --resume         Post-reboot verification (called by systemd)
#   nazar-evolve rollback <slug>  Rollback to pre-install snapshot
#   nazar-evolve status [slug]    Show pending/completed evolution state

NAZAR_CONFIG="${NAZAR_CONFIG:-/etc/nazar/nazar.yaml}"
NAZAR_OBJECTS_DIR="${NAZAR_OBJECTS_DIR:-/var/lib/nazar/objects}"
NAZAR_EVOLVE_DIR="${NAZAR_EVOLVE_DIR:-/var/lib/nazar/evolution}"
NAZAR_OBJECT_CMD="${NAZAR_OBJECT_CMD:-nazar-object}"

# --- Helpers ---

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo ":: $*"; }
warn() { echo "WARNING: $*" >&2; }

read_config_value() {
  local key="$1"
  yq -r "$key" "$NAZAR_CONFIG" 2>/dev/null | grep -v '^null$' || echo ""
}

get_max_packages() {
  local val
  val=$(read_config_value '.evolution.max_packages_per_evolution')
  echo "${val:-5}"
}

# Read the host_packages field from an evolution object's frontmatter.
read_host_packages() {
  local slug="$1"
  local file="${NAZAR_OBJECTS_DIR}/evolution/${slug}.md"
  [[ -f "$file" ]] || die "evolution object not found: $slug"

  # Extract YAML frontmatter (between --- markers), then get host_packages array
  local frontmatter
  frontmatter=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$file")
  echo "$frontmatter" | yq -r '.host_packages[]' 2>/dev/null || true
}

# Validate that package names contain only safe characters.
validate_package_names() {
  local pkg
  for pkg in "$@"; do
    if [[ ! "$pkg" =~ ^[a-zA-Z0-9][a-zA-Z0-9._+-]*$ ]]; then
      die "invalid package name: '$pkg'"
    fi
  done
}

# --- Subcommands ---

cmd_install() {
  local slug="${1:-}"
  [[ -n "$slug" ]] || die "usage: nazar-evolve install <slug>"

  info "Reading evolution object: $slug"

  # Read packages from the evolution object
  local packages=()
  while IFS= read -r pkg; do
    [[ -n "$pkg" ]] && packages+=("$pkg")
  done < <(read_host_packages "$slug")

  [[ ${#packages[@]} -gt 0 ]] || die "no host_packages found in evolution/$slug"

  # Validate package names
  validate_package_names "${packages[@]}"

  # Check package count limit
  local max
  max=$(get_max_packages)
  if [[ ${#packages[@]} -gt $max ]]; then
    die "too many packages (${#packages[@]} > max $max). Increase evolution.max_packages_per_evolution in nazar.yaml"
  fi

  # Interactive approval
  echo ""
  echo "The following packages will be installed:"
  for pkg in "${packages[@]}"; do
    echo "  - $pkg"
  done
  echo ""

  if [[ "${NAZAR_EVOLVE_YES:-}" == "1" ]]; then
    info "Auto-approved (NAZAR_EVOLVE_YES=1)"
  else
    read -r -p "Install these packages? [y/N] " confirm
    [[ "$confirm" =~ ^[Yy]$ ]] || { info "Aborted."; exit 0; }
  fi

  # Ensure evolve directory exists
  mkdir -p "$NAZAR_EVOLVE_DIR"

  # Record pre-install snapshot number
  local pre_snapshot
  pre_snapshot=$(snapper list --columns number | tail -1 | tr -d ' ')

  info "Pre-install snapshot: $pre_snapshot"
  info "Installing packages via transactional-update..."

  # Install packages atomically
  if [[ "${NAZAR_DRY_RUN:-}" == "1" ]]; then
    info "[dry-run] Would run: transactional-update pkg install ${packages[*]}"
  else
    sudo transactional-update pkg install "${packages[@]}"
  fi

  # Write pending state (survives reboot)
  local pending_file="${NAZAR_EVOLVE_DIR}/pending.yaml"
  cat > "$pending_file" <<EOF
slug: ${slug}
packages:
$(printf '  - %s\n' "${packages[@]}")
pre_snapshot: ${pre_snapshot}
started: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF

  info "Pending state written to: $pending_file"

  if [[ "${NAZAR_DRY_RUN:-}" == "1" ]]; then
    info "[dry-run] Would reboot to apply snapshot"
  else
    info "Rebooting to apply new snapshot..."
    sudo reboot
  fi
}

cmd_resume() {
  local pending_file="${NAZAR_EVOLVE_DIR}/pending.yaml"
  [[ -f "$pending_file" ]] || die "no pending evolution found at $pending_file"

  info "Resuming evolution after reboot..."

  local slug packages_raw pre_snapshot
  slug=$(yq -r '.slug' "$pending_file")
  pre_snapshot=$(yq -r '.pre_snapshot' "$pending_file")

  # Read packages as array
  local packages=()
  while IFS= read -r pkg; do
    [[ -n "$pkg" ]] && packages+=("$pkg")
  done < <(yq -r '.packages[]' "$pending_file")

  info "Evolution: $slug"
  info "Packages: ${packages[*]}"
  info "Pre-install snapshot: $pre_snapshot"

  # Verify each package is installed
  local failed=()
  for pkg in "${packages[@]}"; do
    if rpm -q "$pkg" >/dev/null 2>&1; then
      info "  OK: $pkg installed"
    else
      warn "  MISSING: $pkg not found"
      failed+=("$pkg")
    fi
  done

  if [[ ${#failed[@]} -gt 0 ]]; then
    warn "Verification failed for ${#failed[@]} package(s): ${failed[*]}"
    warn "Rolling back to snapshot $pre_snapshot..."
    sudo snapper rollback "$pre_snapshot"
    rm -f "$pending_file"

    # Update evolution object status to rejected
    "$NAZAR_OBJECT_CMD" update evolution "$slug" \
      --status=rejected --agent=hermes 2>/dev/null || true

    die "Rollback complete. Reboot to restore previous state."
  fi

  info "All packages verified successfully."

  # Update evolution object to applied
  "$NAZAR_OBJECT_CMD" update evolution "$slug" \
    --status=applied --agent=hermes 2>/dev/null || true

  # Clean up pending state
  rm -f "$pending_file"

  info "Evolution '$slug' applied successfully."
}

cmd_rollback() {
  local slug="${1:-}"
  [[ -n "$slug" ]] || die "usage: nazar-evolve rollback <slug>"

  # Check for pending state first
  local pending_file="${NAZAR_EVOLVE_DIR}/pending.yaml"
  local pre_snapshot=""

  if [[ -f "$pending_file" ]]; then
    local pending_slug
    pending_slug=$(yq -r '.slug' "$pending_file")
    if [[ "$pending_slug" == "$slug" ]]; then
      pre_snapshot=$(yq -r '.pre_snapshot' "$pending_file")
    fi
  fi

  if [[ -z "$pre_snapshot" ]]; then
    die "no pending evolution found for '$slug'. Manual rollback: snapper list, then snapper rollback <number>"
  fi

  info "Rolling back evolution '$slug' to snapshot $pre_snapshot..."

  if [[ "${NAZAR_DRY_RUN:-}" == "1" ]]; then
    info "[dry-run] Would run: snapper rollback $pre_snapshot"
  else
    sudo snapper rollback "$pre_snapshot"
  fi

  rm -f "$pending_file"

  "$NAZAR_OBJECT_CMD" update evolution "$slug" \
    --status=rejected --agent=hermes 2>/dev/null || true

  info "Rollback complete. Reboot to restore previous state."
}

cmd_status() {
  local slug="${1:-}"

  if [[ -n "$slug" ]]; then
    # Show specific evolution status
    local file="${NAZAR_OBJECTS_DIR}/evolution/${slug}.md"
    if [[ -f "$file" ]]; then
      "$NAZAR_OBJECT_CMD" read evolution "$slug"
    else
      die "evolution object not found: $slug"
    fi

    # Show pending state if exists
    local pending_file="${NAZAR_EVOLVE_DIR}/pending.yaml"
    if [[ -f "$pending_file" ]]; then
      local pending_slug
      pending_slug=$(yq -r '.slug' "$pending_file")
      if [[ "$pending_slug" == "$slug" ]]; then
        echo ""
        echo "=== Pending State ==="
        cat "$pending_file"
      fi
    fi
  else
    # Show all evolutions and pending state
    echo "=== Evolution Objects ==="
    "$NAZAR_OBJECT_CMD" list evolution 2>/dev/null || echo "(none)"
    echo ""

    local pending_file="${NAZAR_EVOLVE_DIR}/pending.yaml"
    if [[ -f "$pending_file" ]]; then
      echo "=== Pending Evolution (awaiting reboot) ==="
      cat "$pending_file"
    else
      echo "No pending evolution."
    fi
  fi
}

# --- Main ---

subcmd="${1:-}"
shift 2>/dev/null || true

case "$subcmd" in
  install)   cmd_install "$@" ;;
  --resume)  cmd_resume ;;
  rollback)  cmd_rollback "$@" ;;
  status)    cmd_status "$@" ;;
  *)
    echo "Usage: nazar-evolve <install|--resume|rollback|status> [args]" >&2
    echo "" >&2
    echo "Commands:" >&2
    echo "  install <slug>   Install host_packages from evolution object" >&2
    echo "  --resume         Post-reboot verification (systemd)" >&2
    echo "  rollback <slug>  Rollback to pre-install snapshot" >&2
    echo "  status [slug]    Show evolution state" >&2
    exit 1
    ;;
esac
