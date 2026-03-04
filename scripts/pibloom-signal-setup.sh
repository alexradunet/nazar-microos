#!/usr/bin/env bash
set -euo pipefail

# pibloom-signal-setup.sh — CLI helper for Signal account setup.
#
# Usage:
#   pibloom signal check                        Pre-flight: image, storage, accounts
#   pibloom signal link [--name NAME]           Link to existing Signal account (QR code)
#   pibloom signal register +NUMBER --captcha URL   Register a new number
#   pibloom signal verify +NUMBER CODE          Verify SMS code
#   pibloom signal accounts                     List configured accounts

IMAGE="localhost/pibloom-signal-cli:latest"
STORAGE_DIR="/var/lib/pibloom/signal-storage"
EXPECTED_UID=900

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo ":: $*"; }
warn() { echo "WARNING: $*" >&2; }
ok() { echo "   OK: $*"; }
fail() { echo " FAIL: $*" >&2; }

# --- Pre-flight helpers ---

ensure_image() {
  if ! sudo podman image exists "$IMAGE" 2>/dev/null; then
    fail "Container image not found: $IMAGE"
    echo ""
    echo "Build it from the project root:"
    echo "  podman build -t pibloom-signal-cli -f bridges/signal/containers/signal-cli/Containerfile ."
    echo ""
    echo "Or deploy from the host:"
    echo "  pibloom deploy --images"
    exit 1
  fi
}

ensure_storage() {
  if [[ ! -d "$STORAGE_DIR" ]]; then
    info "Creating storage directory: $STORAGE_DIR"
    sudo install -d -m 0755 -o "$EXPECTED_UID" -g "$EXPECTED_UID" "$STORAGE_DIR"
    ok "Created $STORAGE_DIR (owner UID $EXPECTED_UID)"
    return
  fi

  # Check ownership
  local current_uid
  current_uid=$(stat -c '%u' "$STORAGE_DIR")
  if [[ "$current_uid" != "$EXPECTED_UID" ]]; then
    warn "Storage directory owned by UID $current_uid, expected $EXPECTED_UID"
    info "Fixing ownership..."
    sudo chown -R "$EXPECTED_UID:$EXPECTED_UID" "$STORAGE_DIR"
    ok "Fixed ownership to UID $EXPECTED_UID"
  fi
}

signal_cli_run() {
  sudo podman run --rm \
    -v "${STORAGE_DIR}:/data/signal-storage:rw,z" \
    "$IMAGE" \
    --config /data/signal-storage "$@"
}

signal_cli_run_interactive() {
  sudo podman run --rm -it \
    -v "${STORAGE_DIR}:/data/signal-storage:rw,z" \
    "$IMAGE" \
    --config /data/signal-storage "$@"
}

# --- Commands ---

cmd_check() {
  local all_ok=true

  echo "=== Signal Setup Pre-flight Check ==="
  echo ""

  # Image
  echo "Image:"
  if sudo podman image exists "$IMAGE" 2>/dev/null; then
    ok "$IMAGE exists"
  else
    fail "$IMAGE not found"
    all_ok=false
  fi

  # Storage directory
  echo ""
  echo "Storage:"
  if [[ -d "$STORAGE_DIR" ]]; then
    ok "$STORAGE_DIR exists"
    local current_uid
    current_uid=$(stat -c '%u' "$STORAGE_DIR")
    if [[ "$current_uid" == "$EXPECTED_UID" ]]; then
      ok "Owner UID is $EXPECTED_UID"
    else
      fail "Owner UID is $current_uid (expected $EXPECTED_UID)"
      all_ok=false
    fi
  else
    fail "$STORAGE_DIR does not exist (will be created on first use)"
    all_ok=false
  fi

  # Accounts
  echo ""
  echo "Accounts:"
  if sudo podman image exists "$IMAGE" 2>/dev/null && [[ -d "$STORAGE_DIR" ]]; then
    signal_cli_run listAccounts 2>/dev/null || warn "Could not list accounts (no accounts registered yet?)"
  else
    echo "  (skipped — image or storage not ready)"
  fi

  echo ""
  if [[ "$all_ok" == "true" ]]; then
    info "All checks passed."
  else
    warn "Some checks failed. Fix issues above before proceeding."
    return 1
  fi
}

cmd_link() {
  local name="Bloom"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --name) name="$2"; shift 2 ;;
      *) die "Unknown option: $1" ;;
    esac
  done

  ensure_image
  ensure_storage

  info "Starting Signal link (device name: $name)..."
  info "Scan the QR code with your Signal app:"
  info "  Android: Settings > Linked Devices > Link New Device"
  info "  iOS: Settings > Linked Devices > Link New Device"
  echo ""

  signal_cli_run_interactive link --name "$name"
}

cmd_register() {
  local number=""
  local captcha=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      +*) number="$1"; shift ;;
      --captcha) captcha="$2"; shift 2 ;;
      *) die "Unknown option: $1" ;;
    esac
  done

  [[ -n "$number" ]] || die "Phone number required. Usage: pibloom signal register +NUMBER --captcha URL"
  [[ -n "$captcha" ]] || die "Captcha required. Usage: pibloom signal register +NUMBER --captcha URL"

  ensure_image
  ensure_storage

  info "Registering $number with Signal..."
  signal_cli_run -a "$number" register --captcha "$captcha"
}

cmd_verify() {
  local number="${1:-}"
  local code="${2:-}"

  [[ -n "$number" ]] || die "Phone number required. Usage: pibloom signal verify +NUMBER CODE"
  [[ -n "$code" ]] || die "Verification code required. Usage: pibloom signal verify +NUMBER CODE"

  ensure_image
  ensure_storage

  info "Verifying $number with code $code..."
  signal_cli_run -a "$number" verify "$code"
}

cmd_accounts() {
  ensure_image
  ensure_storage

  echo "=== Signal Accounts ==="
  signal_cli_run listAccounts
}

cmd_setup_agent() {
  local pi_config_dir="/var/lib/pibloom/pi-config/agent"
  local source_dir="${HOME}/.pi/agent"

  echo "=== Pi Agent Config Setup ==="
  echo ""
  echo "The signal bridge needs Pi agent auth + settings in:"
  echo "  $pi_config_dir"
  echo ""

  # Create target dir
  sudo install -d -m 0755 -o "$EXPECTED_UID" -g "$EXPECTED_UID" "$pi_config_dir"

  # Check if source files exist
  if [[ ! -f "$source_dir/auth.json" ]]; then
    fail "No auth.json found at $source_dir/auth.json"
    echo ""
    echo "Run 'pi /login' first to authenticate, then re-run this command."
    exit 1
  fi

  info "Copying auth.json from $source_dir..."
  sudo cp "$source_dir/auth.json" "$pi_config_dir/auth.json"

  if [[ -f "$source_dir/settings.json" ]]; then
    info "Copying settings.json from $source_dir..."
    sudo cp "$source_dir/settings.json" "$pi_config_dir/settings.json"
  fi

  sudo chown -R "$EXPECTED_UID:$EXPECTED_UID" "$pi_config_dir"
  sudo chmod 600 "$pi_config_dir/auth.json"

  ok "Pi agent config provisioned at $pi_config_dir"
  echo ""
  echo "Files:"
  ls -la "$pi_config_dir/"
}

# --- Main ---

cmd="${1:-}"
shift 2>/dev/null || true

case "$cmd" in
  check)       cmd_check "$@" ;;
  link)        cmd_link "$@" ;;
  register)    cmd_register "$@" ;;
  verify)      cmd_verify "$@" ;;
  accounts)    cmd_accounts "$@" ;;
  setup-agent) cmd_setup_agent "$@" ;;
  --help|-h|help)
    echo "Usage: pibloom signal <check|link|register|verify|accounts|setup-agent>"
    echo ""
    echo "Commands:"
    echo "  check                        Pre-flight: image, storage, accounts"
    echo "  link [--name NAME]           Link to existing Signal account (QR code)"
    echo "  register +NUMBER --captcha URL   Register a new number"
    echo "  verify +NUMBER CODE          Verify SMS code"
    echo "  accounts                     List configured accounts"
    echo "  setup-agent                  Provision Pi agent auth to container volume"
    ;;
  *)
    echo "Error: unknown signal command: ${cmd:-<none>}" >&2
    echo "" >&2
    echo "Usage: pibloom signal <check|link|register|verify|accounts|setup-agent>" >&2
    exit 1
    ;;
esac
