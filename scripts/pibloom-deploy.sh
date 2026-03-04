#!/usr/bin/env bash
set -euo pipefail

# pibloom-deploy.sh — Deploy code changes to a dev VM over SSH.
#
# Dev-iteration tool for quick code pushes. Primary deployment is via
# bootc image rebuild (make image / pibloom vm create).
#
# Builds containers locally, transfers them via podman save/load,
# and syncs scripts/agent content to the VM. Tags local builds
# with localhost/ names matching the Quadlet files.
#
# Usage:
#   pibloom-deploy [--all]       Deploy everything (default)
#   pibloom-deploy --images      Build and transfer container images
#   pibloom-deploy --scripts     Sync shell scripts only
#   pibloom-deploy --persona     Sync persona files only
#   pibloom-deploy --skills      Sync skills only
#   pibloom-deploy --os          Build OS image, push to local registry, bootc upgrade VM
#   pibloom-deploy --check       Health check only
#   pibloom-deploy --dry-run     Show what would be done
#
# Environment / .pibloom-deploy.env:
#   PIBLOOM_HOST            VM IP or hostname (required)
#   PIBLOOM_SSH_USER        SSH user (default: core)
#   PIBLOOM_REGISTRY_HOST   Host IP as seen from VM (auto-detected if unset)
#   PIBLOOM_REGISTRY_PORT   Local registry port (default: 5000)

# Resolve project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- Helpers ---

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo ":: $*"; }
warn() { echo "WARNING: $*" >&2; }

# --- Load config ---

ENV_FILE="$PROJECT_ROOT/.pibloom-deploy.env"
[[ -f "$ENV_FILE" ]] && source "$ENV_FILE"

PIBLOOM_HOST="${PIBLOOM_HOST:-}"
PIBLOOM_SSH_USER="${PIBLOOM_SSH_USER:-core}"
PIBLOOM_REGISTRY_HOST="${PIBLOOM_REGISTRY_HOST:-}"
PIBLOOM_REGISTRY_PORT="${PIBLOOM_REGISTRY_PORT:-5000}"
DRY_RUN=0

# accept-new: accept on first connect, reject if host key changes (safer than StrictHostKeyChecking=no)
SSH_OPTS="-o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"

remote() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    info "[dry-run] ssh ${PIBLOOM_SSH_USER}@${PIBLOOM_HOST} $*"
    return
  fi
  # shellcheck disable=SC2086
  ssh $SSH_OPTS "${PIBLOOM_SSH_USER}@${PIBLOOM_HOST}" "$@"
}

remote_sudo() {
  remote sudo "$@"
}

# --- Parse arguments ---

DEPLOY_ALL=0
DEPLOY_IMAGES=0
DEPLOY_SCRIPTS=0
DEPLOY_PERSONA=0
DEPLOY_SKILLS=0
DEPLOY_OS=0
DEPLOY_CHECK=0

for arg in "$@"; do
  case "$arg" in
    --all)       DEPLOY_ALL=1 ;;
    --images)    DEPLOY_IMAGES=1 ;;
    --scripts)   DEPLOY_SCRIPTS=1 ;;
    --persona)   DEPLOY_PERSONA=1 ;;
    --skills)    DEPLOY_SKILLS=1 ;;
    --os)        DEPLOY_OS=1 ;;
    --check)     DEPLOY_CHECK=1 ;;
    --dry-run)   DRY_RUN=1 ;;
    --help|-h)
      echo "Usage: pibloom-deploy [--all|--images|--scripts|--persona|--skills|--os|--check] [--dry-run]"
      exit 0
      ;;
    *) die "unknown argument: $arg" ;;
  esac
done

# Default to --all if no specific targets given
if [[ "$DEPLOY_IMAGES" -eq 0 && "$DEPLOY_SCRIPTS" -eq 0 && \
      "$DEPLOY_PERSONA" -eq 0 && "$DEPLOY_SKILLS" -eq 0 && \
      "$DEPLOY_OS" -eq 0 && "$DEPLOY_CHECK" -eq 0 ]]; then
  DEPLOY_ALL=1
fi

# Validate host
[[ -n "$PIBLOOM_HOST" ]] || die "PIBLOOM_HOST not set. Create .pibloom-deploy.env or export PIBLOOM_HOST=<ip>"

# --- Deploy functions ---

deploy_images() {
  info "=== Building container images ==="

  cd "$PROJECT_ROOT"

  # Build base image
  info "Building pibloom-base..."
  if [[ "$DRY_RUN" -eq 1 ]]; then
    info "[dry-run] podman build -t pibloom-base -f core/containers/base/Containerfile ."
  else
    podman build --format docker -t pibloom-base -f core/containers/base/Containerfile .
  fi

  # Build and deploy each service container
  local containers=(
    "signal-cli|bridges/signal/containers/signal-cli/Containerfile|localhost/pibloom-signal-cli:latest"
    "signal-bridge|bridges/signal/Containerfile|localhost/pibloom-signal-bridge:latest"
    "web-bridge|bridges/web/Containerfile|localhost/pibloom-web-bridge:latest"
    "whatsapp-bridge|bridges/whatsapp/Containerfile|localhost/pibloom-whatsapp-bridge:latest"
  )

  for entry in "${containers[@]}"; do
    IFS='|' read -r name dockerfile full_image <<< "$entry"

    info "Building ${name}..."
    if [[ "$DRY_RUN" -eq 1 ]]; then
      info "[dry-run] podman build -t $full_image -f $dockerfile ."
      info "[dry-run] podman save $full_image | ssh ... sudo podman load"
      continue
    fi

    podman build --format docker -t "$full_image" -f "$dockerfile" .

    info "Transferring ${name} to VM..."
    # shellcheck disable=SC2086
    podman save "$full_image" | ssh $SSH_OPTS "${PIBLOOM_SSH_USER}@${PIBLOOM_HOST}" sudo podman load
  done

  if [[ "$DRY_RUN" -eq 0 ]]; then
    info "Restarting pibloom services on VM..."
    remote_sudo "systemctl daemon-reload"
    remote_sudo "systemctl try-restart pibloom-heartbeat.timer 2>/dev/null" || true
    remote_sudo "systemctl try-restart pibloom-signal-pod.service 2>/dev/null" || true
  fi

  info "Image deploy complete."
}

deploy_scripts() {
  info "=== Syncing scripts ==="

  cd "$PROJECT_ROOT"

  local scripts=(
    "scripts/pibloom:/usr/local/bin/pibloom"
    "scripts/pibloom-vm.sh:/usr/local/bin/pibloom-vm"
    "scripts/pibloom-deploy.sh:/usr/local/bin/pibloom-deploy"
    "scripts/pibloom-signal-setup.sh:/usr/local/bin/pibloom-signal-setup"
  )

  for entry in "${scripts[@]}"; do
    IFS=: read -r src dest <<< "$entry"
    local src_path="$PROJECT_ROOT/$src"
    [[ -f "$src_path" ]] || { warn "Script not found: $src"; continue; }

    if [[ "$DRY_RUN" -eq 1 ]]; then
      info "[dry-run] $src -> $dest"
    else
      # shellcheck disable=SC2086
      cat "$src_path" | ssh $SSH_OPTS "${PIBLOOM_SSH_USER}@${PIBLOOM_HOST}" \
        "sudo tee \"$dest\" > /dev/null && sudo chmod 755 \"$dest\""
      info "  $src -> $dest"
    fi
  done

  info "=== Deploying pibloom-core CLI ==="

  info "Building pibloom-core..."
  if [[ "$DRY_RUN" -eq 1 ]]; then
    info "[dry-run] npm -w core run build"
    info "[dry-run] tar core/{dist,package.json} | ssh ... sudo tar -xf -C /usr/local/lib/pibloom-core/"
    info "[dry-run] ssh ... cd /usr/local/lib/pibloom-core && npm install --omit=dev"
    info "[dry-run] ssh ... ln -sf + create shims"
  else
    npm -w core run build

    info "Syncing pibloom-core to VM..."
    tar -cf - -C "$PROJECT_ROOT/core" dist package.json | \
      # shellcheck disable=SC2086
      ssh $SSH_OPTS "${PIBLOOM_SSH_USER}@${PIBLOOM_HOST}" \
      "sudo mkdir -p /usr/local/lib/pibloom-core && sudo tar -xf - -C /usr/local/lib/pibloom-core/"

    info "Installing pibloom-core dependencies on VM..."
    remote_sudo "cd /usr/local/lib/pibloom-core && npm install --omit=dev"

    info "Creating pibloom-core symlink and shims..."
    remote_sudo "ln -sf /usr/local/lib/pibloom-core/dist/cli.js /usr/local/bin/pibloom-core && chmod +x /usr/local/lib/pibloom-core/dist/cli.js"
    remote_sudo "printf '#!/usr/bin/env bash\nexec pibloom-core object \"\$@\"\n' > /usr/local/bin/pibloom-object && chmod 755 /usr/local/bin/pibloom-object"
    remote_sudo "printf '#!/usr/bin/env bash\nexec pibloom-core setup \"\$@\"\n' > /usr/local/bin/pibloom-setup && chmod 755 /usr/local/bin/pibloom-setup"
    remote_sudo "printf '#!/usr/bin/env bash\nexec pibloom-core evolve \"\$@\"\n' > /usr/local/bin/pibloom-evolve && chmod 755 /usr/local/bin/pibloom-evolve"
  fi

  info "Scripts sync complete."
}

deploy_persona() {
  info "=== Syncing persona files ==="

  cd "$PROJECT_ROOT"
  [[ -d "$PROJECT_ROOT/core/agent/persona" ]] || { warn "core/agent/persona/ directory not found, skipping"; return; }

  if [[ "$DRY_RUN" -eq 1 ]]; then
    info "[dry-run] tar core/agent/persona/ | ssh ... sudo tar -xf - -C /usr/local/share/pibloom/persona/"
    return
  fi

  tar -cf - -C "$PROJECT_ROOT/core/agent/persona" . | \
    # shellcheck disable=SC2086
    ssh $SSH_OPTS "${PIBLOOM_SSH_USER}@${PIBLOOM_HOST}" \
    "sudo tar -xf - -C /usr/local/share/pibloom/persona/"

  info "Persona sync complete."
}

deploy_skills() {
  info "=== Syncing skills ==="

  cd "$PROJECT_ROOT"
  [[ -d "$PROJECT_ROOT/core/agent/skills" ]] || { warn "core/agent/skills/ directory not found, skipping"; return; }

  if [[ "$DRY_RUN" -eq 1 ]]; then
    info "[dry-run] tar core/agent/skills/ | ssh ... sudo tar -xf - -C /usr/local/share/pibloom/skills/"
    return
  fi

  tar -cf - -C "$PROJECT_ROOT/core/agent/skills" . | \
    # shellcheck disable=SC2086
    ssh $SSH_OPTS "${PIBLOOM_SSH_USER}@${PIBLOOM_HOST}" \
    "sudo tar -xf - -C /usr/local/share/pibloom/skills/"

  info "Skills sync complete."
}

deploy_os() {
  info "=== OS Image Deploy (bootc) ==="

  cd "$PROJECT_ROOT"

  # Build and push OS image to local registry
  info "Building OS image and pushing to local registry..."
  if [[ "$DRY_RUN" -eq 1 ]]; then
    info "[dry-run] make push"
  else
    make push || die "Failed to build/push OS image. Is the registry running? Try: make registry"
  fi

  # Determine registry host IP as seen from the VM
  local registry_host="$PIBLOOM_REGISTRY_HOST"
  if [[ -z "$registry_host" ]]; then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      info "[dry-run] Auto-detecting host IP from VM (ip route show default)"
      registry_host="192.168.122.1"
    else
      registry_host=$(remote "ip route show default | awk '/default/ {print \$3}'") \
        || die "Failed to detect host IP from VM. Set PIBLOOM_REGISTRY_HOST manually."
      [[ -n "$registry_host" ]] || die "Could not determine host IP from VM default route. Set PIBLOOM_REGISTRY_HOST."
      info "Detected host IP from VM: $registry_host"
    fi
  fi

  local registry_ref="${registry_host}:${PIBLOOM_REGISTRY_PORT}/pibloom-os:latest"

  # Check current bootc status to determine switch vs upgrade
  if [[ "$DRY_RUN" -eq 1 ]]; then
    info "[dry-run] Checking bootc status on VM..."
    info "[dry-run] Would run: bootc switch or bootc upgrade to $registry_ref"
    info "[dry-run] Would prompt to reboot VM"
    return
  fi

  local current_image
  current_image=$(remote_sudo "bootc status --format=json" 2>/dev/null \
    | grep -o '"image":"[^"]*"' | head -1 | cut -d'"' -f4) || current_image=""

  if [[ "$current_image" == *"${registry_host}:${PIBLOOM_REGISTRY_PORT}"* ]]; then
    info "VM already tracking local registry. Running bootc upgrade..."
    remote_sudo "bootc upgrade" \
      || die "bootc upgrade failed. Check VM connectivity to ${registry_ref}"
  else
    info "Switching VM to local registry image: $registry_ref"
    remote_sudo "bootc switch --transport registry ${registry_ref}" \
      || {
        warn "bootc switch failed. If this is a TLS error, the VM may not have the insecure registry config."
        warn ""
        warn "Fix options:"
        warn "  1. Recreate the VM: pibloom vm destroy && pibloom vm create"
        warn "  2. Manually add the config:"
        warn "     pibloom vm ssh -- 'sudo mkdir -p /etc/containers/registries.conf.d && sudo tee /etc/containers/registries.conf.d/pibloom-dev-registry.conf <<EOF"
        warn "[[registry]]"
        warn "location = \"${registry_host}:${PIBLOOM_REGISTRY_PORT}\""
        warn "insecure = true"
        warn "EOF'"
        die "bootc switch failed"
      }
  fi

  info ""
  info "OS image staged. A reboot is required to apply."
  read -r -p "Reboot VM now? [Y/n] " confirm
  if [[ ! "$confirm" =~ ^[Nn]$ ]]; then
    info "Rebooting VM..."
    remote_sudo "systemctl reboot" || true
    info "VM is rebooting. Wait ~30s then reconnect with: pibloom vm ssh"
  else
    info "Skipped reboot. Apply later with: pibloom vm ssh -- sudo systemctl reboot"
  fi

  info "OS deploy complete."
}

health_check() {
  info "=== Health Check ==="

  local services=(
    "pibloom-heartbeat.timer"
    "pibloom-signal-cli.service"
    "pibloom-signal-bridge.service"
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
    info "--- pibloom status ---"
    remote "pibloom status" 2>/dev/null || warn "pibloom status command failed"
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
  [[ "$DEPLOY_OS" -eq 1 ]] && deploy_os
  [[ "$DEPLOY_CHECK" -eq 1 ]] && health_check
fi

info "Done."
