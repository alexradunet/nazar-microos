#!/usr/bin/env bash
set -euo pipefail

# nazar-deploy.sh — Deploy code changes to a dev VM over SSH.
#
# Dev-iteration tool for quick code pushes. Primary deployment is via
# bootc image rebuild (make image / nazar vm create).
#
# Builds containers locally, transfers them via podman save/load,
# and syncs scripts/persona/skills to the VM. Tags local builds
# with the same ghcr.io names so Quadlet files work unchanged.
#
# Usage:
#   nazar-deploy [--all]       Deploy everything (default)
#   nazar-deploy --images      Build and transfer container images
#   nazar-deploy --scripts     Sync shell scripts only
#   nazar-deploy --persona     Sync persona files only
#   nazar-deploy --skills      Sync skills only
#   nazar-deploy --check       Health check only
#   nazar-deploy --dry-run     Show what would be done
#
# Environment / .nazar-deploy.env:
#   NAZAR_HOST       VM IP or hostname (required)
#   NAZAR_SSH_USER   SSH user (default: core)

# Resolve project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- Helpers ---

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo ":: $*"; }
warn() { echo "WARNING: $*" >&2; }

# --- Load config ---

ENV_FILE="$PROJECT_ROOT/.nazar-deploy.env"
[[ -f "$ENV_FILE" ]] && source "$ENV_FILE"

NAZAR_HOST="${NAZAR_HOST:-}"
NAZAR_SSH_USER="${NAZAR_SSH_USER:-core}"
DRY_RUN=0

SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"

remote() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    info "[dry-run] ssh ${NAZAR_SSH_USER}@${NAZAR_HOST} $*"
    return
  fi
  # shellcheck disable=SC2086
  ssh $SSH_OPTS "${NAZAR_SSH_USER}@${NAZAR_HOST}" "$@"
}

remote_sudo() {
  remote "sudo $*"
}

# --- Parse arguments ---

DEPLOY_ALL=0
DEPLOY_IMAGES=0
DEPLOY_SCRIPTS=0
DEPLOY_PERSONA=0
DEPLOY_SKILLS=0
DEPLOY_CHECK=0

for arg in "$@"; do
  case "$arg" in
    --all)       DEPLOY_ALL=1 ;;
    --images)    DEPLOY_IMAGES=1 ;;
    --scripts)   DEPLOY_SCRIPTS=1 ;;
    --persona)   DEPLOY_PERSONA=1 ;;
    --skills)    DEPLOY_SKILLS=1 ;;
    --check)     DEPLOY_CHECK=1 ;;
    --dry-run)   DRY_RUN=1 ;;
    --help|-h)
      echo "Usage: nazar-deploy [--all|--images|--scripts|--persona|--skills|--check] [--dry-run]"
      exit 0
      ;;
    *) die "unknown argument: $arg" ;;
  esac
done

# Default to --all if no specific targets given
if [[ "$DEPLOY_IMAGES" -eq 0 && "$DEPLOY_SCRIPTS" -eq 0 && \
      "$DEPLOY_PERSONA" -eq 0 && "$DEPLOY_SKILLS" -eq 0 && \
      "$DEPLOY_CHECK" -eq 0 ]]; then
  DEPLOY_ALL=1
fi

# Validate host
[[ -n "$NAZAR_HOST" ]] || die "NAZAR_HOST not set. Create .nazar-deploy.env or export NAZAR_HOST=<ip>"

# --- Deploy functions ---

deploy_images() {
  info "=== Building container images ==="

  cd "$PROJECT_ROOT"

  # Build base image
  info "Building nazar-base..."
  if [[ "$DRY_RUN" -eq 1 ]]; then
    info "[dry-run] podman build -t nazar-base -f containers/base/Containerfile ."
  else
    podman build -t nazar-base -f containers/base/Containerfile .
  fi

  # Build and deploy each service container
  local containers=(
    "heartbeat|containers/heartbeat/Containerfile|ghcr.io/alexradunet/nazar-heartbeat:latest"
    "matrix-bridge|containers/matrix-bridge/Containerfile|ghcr.io/alexradunet/nazar-matrix-bridge:latest"
  )

  for entry in "${containers[@]}"; do
    IFS='|' read -r name dockerfile full_image <<< "$entry"

    info "Building ${name}..."
    if [[ "$DRY_RUN" -eq 1 ]]; then
      info "[dry-run] podman build -t $full_image -f $dockerfile ."
      info "[dry-run] podman save $full_image | ssh ... sudo podman load"
      continue
    fi

    podman build -t "$full_image" -f "$dockerfile" .

    info "Transferring ${name} to VM..."
    # shellcheck disable=SC2086
    podman save "$full_image" | ssh $SSH_OPTS "${NAZAR_SSH_USER}@${NAZAR_HOST}" sudo podman load
  done

  if [[ "$DRY_RUN" -eq 0 ]]; then
    info "Restarting nazar services on VM..."
    remote_sudo "systemctl daemon-reload"
    remote_sudo "systemctl try-restart nazar-heartbeat.timer" || warn "heartbeat timer restart failed"
    remote_sudo "systemctl try-restart nazar-conduit.service" || warn "conduit restart failed"
    remote_sudo "systemctl try-restart nazar-matrix-bridge.service" || warn "matrix-bridge restart failed"
  fi

  info "Image deploy complete."
}

deploy_scripts() {
  info "=== Syncing scripts ==="

  cd "$PROJECT_ROOT"

  local scripts=(
    "scripts/nazar:/usr/local/bin/nazar"
    "scripts/nazar-vm.sh:/usr/local/bin/nazar-vm"
    "scripts/nazar-deploy.sh:/usr/local/bin/nazar-deploy"
  )

  for entry in "${scripts[@]}"; do
    IFS=: read -r src dest <<< "$entry"
    local src_path="$PROJECT_ROOT/$src"
    [[ -f "$src_path" ]] || { warn "Script not found: $src"; continue; }

    if [[ "$DRY_RUN" -eq 1 ]]; then
      info "[dry-run] $src -> $dest"
    else
      # shellcheck disable=SC2086
      cat "$src_path" | ssh $SSH_OPTS "${NAZAR_SSH_USER}@${NAZAR_HOST}" \
        "sudo tee \"$dest\" > /dev/null && sudo chmod 755 \"$dest\""
      info "  $src -> $dest"
    fi
  done

  info "=== Deploying nazar-core CLI ==="

  info "Building nazar-core..."
  if [[ "$DRY_RUN" -eq 1 ]]; then
    info "[dry-run] npm -w packages/nazar-core run build"
    info "[dry-run] tar packages/nazar-core/{dist,package.json} | ssh ... sudo tar -xf -C /usr/local/lib/nazar-core/"
    info "[dry-run] ssh ... cd /usr/local/lib/nazar-core && npm install --omit=dev"
    info "[dry-run] ssh ... ln -sf + create shims"
  else
    npm -w packages/nazar-core run build

    info "Syncing nazar-core to VM..."
    tar -cf - -C "$PROJECT_ROOT/packages/nazar-core" dist package.json | \
      # shellcheck disable=SC2086
      ssh $SSH_OPTS "${NAZAR_SSH_USER}@${NAZAR_HOST}" \
      "sudo mkdir -p /usr/local/lib/nazar-core && sudo tar -xf - -C /usr/local/lib/nazar-core/"

    info "Installing nazar-core dependencies on VM..."
    remote_sudo "cd /usr/local/lib/nazar-core && npm install --omit=dev"

    info "Creating nazar-core symlink and shims..."
    remote_sudo "ln -sf /usr/local/lib/nazar-core/dist/cli.js /usr/local/bin/nazar-core && chmod +x /usr/local/lib/nazar-core/dist/cli.js"
    remote_sudo "printf '#!/usr/bin/env bash\nexec nazar-core object \"\$@\"\n' > /usr/local/bin/nazar-object && chmod 755 /usr/local/bin/nazar-object"
    remote_sudo "printf '#!/usr/bin/env bash\nexec nazar-core setup \"\$@\"\n' > /usr/local/bin/nazar-setup && chmod 755 /usr/local/bin/nazar-setup"
    remote_sudo "printf '#!/usr/bin/env bash\nexec nazar-core evolve \"\$@\"\n' > /usr/local/bin/nazar-evolve && chmod 755 /usr/local/bin/nazar-evolve"
  fi

  info "Scripts sync complete."
}

deploy_persona() {
  info "=== Syncing persona files ==="

  cd "$PROJECT_ROOT"
  [[ -d "$PROJECT_ROOT/persona" ]] || { warn "persona/ directory not found, skipping"; return; }

  if [[ "$DRY_RUN" -eq 1 ]]; then
    info "[dry-run] tar persona/ | ssh ... sudo tar -xf - -C /usr/local/share/nazar/persona/"
    return
  fi

  tar -cf - -C "$PROJECT_ROOT/persona" . | \
    # shellcheck disable=SC2086
    ssh $SSH_OPTS "${NAZAR_SSH_USER}@${NAZAR_HOST}" \
    "sudo tar -xf - -C /usr/local/share/nazar/persona/"

  info "Persona sync complete."
}

deploy_skills() {
  info "=== Syncing skills ==="

  cd "$PROJECT_ROOT"
  [[ -d "$PROJECT_ROOT/skills" ]] || { warn "skills/ directory not found, skipping"; return; }

  if [[ "$DRY_RUN" -eq 1 ]]; then
    info "[dry-run] tar skills/ | ssh ... sudo tar -xf - -C /usr/local/share/nazar/skills/"
    return
  fi

  tar -cf - -C "$PROJECT_ROOT/skills" . | \
    # shellcheck disable=SC2086
    ssh $SSH_OPTS "${NAZAR_SSH_USER}@${NAZAR_HOST}" \
    "sudo tar -xf - -C /usr/local/share/nazar/skills/"

  info "Skills sync complete."
}

health_check() {
  info "=== Health Check ==="

  local services=(
    "nazar-heartbeat.timer"
    "nazar-conduit.service"
    "nazar-matrix-bridge.service"
  )

  local all_ok=true
  for svc in "${services[@]}"; do
    if [[ "$DRY_RUN" -eq 1 ]]; then
      info "[dry-run] systemctl is-active $svc"
      continue
    fi

    local status
    status=$(remote "systemctl is-active $svc" 2>/dev/null) || status="unknown"
    case "$status" in
      active|activating)
        info "  OK: $svc ($status)" ;;
      inactive)
        warn "  INACTIVE: $svc (exists but not running)"
        all_ok=false ;;
      unknown)
        warn "  NOT FOUND: $svc (unit does not exist)"
        all_ok=false ;;
      *)
        warn "  FAIL: $svc ($status)"
        all_ok=false ;;
    esac
  done

  if [[ "$DRY_RUN" -eq 0 ]]; then
    info ""
    info "--- nazar status ---"
    remote "nazar status" 2>/dev/null || warn "nazar status command failed"
  fi

  if [[ "$all_ok" == "false" ]]; then
    warn "Some services are not healthy."
    return 1
  fi

  info "All services healthy."
}

# --- Main ---

if [[ "$DEPLOY_ALL" -eq 1 ]]; then
  deploy_images
  deploy_scripts
  deploy_persona
  deploy_skills
  health_check
else
  [[ "$DEPLOY_IMAGES" -eq 1 ]] && deploy_images
  [[ "$DEPLOY_SCRIPTS" -eq 1 ]] && deploy_scripts
  [[ "$DEPLOY_PERSONA" -eq 1 ]] && deploy_persona
  [[ "$DEPLOY_SKILLS" -eq 1 ]] && deploy_skills
  [[ "$DEPLOY_CHECK" -eq 1 ]] && health_check
fi

info "Done."
