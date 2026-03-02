#!/usr/bin/env bash
set -euo pipefail

# nazar-vm.sh — Local dev VM lifecycle management via libvirt.
#
# Manages a Fedora bootc VM for local development and testing.
# Runs on the HOST (not inside a toolbox).
#
# Usage:
#   nazar-vm create    Build OS image, generate QCOW2, create VM
#   nazar-vm start     Start the VM
#   nazar-vm stop      Gracefully shut down the VM
#   nazar-vm destroy   Remove VM and its storage
#   nazar-vm ssh       SSH into the VM as core user
#   nazar-vm ip        Show the VM's IP address
#   nazar-vm upgrade   bootc upgrade the VM and optionally reboot
#   nazar-vm status    Show VM state

VM_NAME="${NAZAR_VM_NAME:-nazar-dev}"
VM_MEMORY="${NAZAR_VM_MEMORY:-2048}"
VM_VCPUS="${NAZAR_VM_VCPUS:-2}"
VM_DISK_SIZE="${NAZAR_VM_DISK_SIZE:-20G}"
VIRSH_URI="qemu:///system"

IMAGE_NAME="localhost/nazar-os"
IMAGE_TAG="latest"

# --- Helpers ---

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo ":: $*"; }
warn() { echo "WARNING: $*" >&2; }

# Resolve project root (parent of scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BOOTC_CONFIG="$PROJECT_ROOT/bootc/config.toml"

# Cache sudo credentials once upfront, then use sudo -n everywhere
ensure_sudo() {
  sudo -v || die "sudo is required for VM management"
}

virsh_cmd() { sudo -n virsh --connect "$VIRSH_URI" "$@"; }

vm_exists() { virsh_cmd dominfo "$VM_NAME" &>/dev/null; }

vm_running() {
  local state
  state=$(virsh_cmd domstate "$VM_NAME" 2>/dev/null) || return 1
  [[ "$state" == "running" ]]
}

get_vm_ip() {
  local ip
  ip=$(virsh_cmd domifaddr "$VM_NAME" 2>/dev/null \
    | awk '/ipv4/ { split($4, a, "/"); print a[1] }' | head -1)
  echo "$ip"
}

wait_for_ip() {
  local timeout=60 elapsed=0
  info "Waiting for VM to get an IP address..." >&2
  while [[ $elapsed -lt $timeout ]]; do
    local ip
    ip=$(get_vm_ip)
    if [[ -n "$ip" ]]; then
      echo "$ip"
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  die "VM did not get an IP address within ${timeout}s"
}

# --- Commands ---

cmd_create() {
  ensure_sudo
  vm_exists && die "VM '$VM_NAME' already exists. Run 'nazar vm destroy' first."

  [[ -f "$BOOTC_CONFIG" ]] || die "SSH key config not found: $BOOTC_CONFIG
Copy bootc/config.toml.example to bootc/config.toml and add your SSH public key."

  # Build the bootc OS image (must use sudo podman so the image lands in
  # system storage, which bootc-image-builder mounts via /var/lib/containers/storage)
  info "Building bootc OS image..."
  cd "$PROJECT_ROOT"
  sudo -n podman build -t "${IMAGE_NAME}:${IMAGE_TAG}" -f Containerfile . \
    || die "OS image build failed"

  # Refresh sudo credentials (build may have taken longer than the cache timeout)
  ensure_sudo

  # Generate QCOW2 via bootc-image-builder
  info "Generating QCOW2 disk image..."
  mkdir -p "$PROJECT_ROOT/_output"
  sudo -n podman run --rm -i --privileged --pull=newer \
    --security-opt label=type:unconfined_t \
    -v "$BOOTC_CONFIG":/config.toml:ro \
    -v "$PROJECT_ROOT/_output":/output \
    -v /var/lib/containers/storage:/var/lib/containers/storage \
    quay.io/centos-bootc/bootc-image-builder:latest \
    --type qcow2 --rootfs xfs --config /config.toml "${IMAGE_NAME}:${IMAGE_TAG}" \
    || die "QCOW2 generation failed"

  local qcow2_file="$PROJECT_ROOT/_output/qcow2/disk.qcow2"
  [[ -f "$qcow2_file" ]] || die "QCOW2 file not found: $qcow2_file"

  # Copy VM disk to libvirt images dir (qemu user needs access)
  local libvirt_dir="/var/lib/libvirt/images"
  local vm_disk="$libvirt_dir/${VM_NAME}.qcow2"

  info "Creating VM disk..."
  sudo -n cp "$qcow2_file" "$vm_disk"
  sudo -n qemu-img resize "$vm_disk" "$VM_DISK_SIZE"

  # Create VM
  info "Creating VM '$VM_NAME'..."
  sudo -n virt-install --connect "$VIRSH_URI" \
    --name "$VM_NAME" \
    --memory "$VM_MEMORY" \
    --vcpus "$VM_VCPUS" \
    --import \
    --graphics none \
    --disk "path=$vm_disk" \
    --os-variant fedora-unknown \
    --network network=default \
    --noautoconsole

  info "VM '$VM_NAME' created and starting."

  local ip
  ip=$(wait_for_ip)
  info "VM IP: $ip"

  local ssh_opts="-o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"
  info "Waiting for first-boot setup to complete..."
  local timeout=120 elapsed=0
  while ! ssh $ssh_opts "core@${ip}" systemctl is-active nazar-setup.service 2>/dev/null | grep -qE "^(active|inactive)$"; do
    sleep 5
    elapsed=$((elapsed + 5))
    [[ $elapsed -ge $timeout ]] && { warn "Timed out waiting for nazar-setup.service"; break; }
  done

  info ""
  info "Deploying container images to VM..."
  NAZAR_HOST="$ip" "$PROJECT_ROOT/scripts/nazar-deploy.sh" --images
  info ""
  info "VM is ready with all services. SSH in with:"
  info "  nazar vm ssh"
}

cmd_start() {
  ensure_sudo
  vm_exists || die "VM '$VM_NAME' does not exist. Run 'nazar vm create' first."
  vm_running && { info "VM '$VM_NAME' is already running."; return; }
  info "Starting VM '$VM_NAME'..."
  virsh_cmd start "$VM_NAME"
  local ip
  ip=$(wait_for_ip)
  info "VM started. IP: $ip"
}

cmd_stop() {
  ensure_sudo
  vm_exists || die "VM '$VM_NAME' does not exist."
  vm_running || { info "VM '$VM_NAME' is not running."; return; }
  info "Shutting down VM '$VM_NAME'..."
  virsh_cmd shutdown "$VM_NAME"
  info "Shutdown signal sent. VM will stop gracefully."
}

cmd_destroy() {
  ensure_sudo
  vm_exists || die "VM '$VM_NAME' does not exist."

  read -r -p "Destroy VM '$VM_NAME' and remove all storage? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || { info "Aborted."; exit 0; }

  if vm_running; then
    info "Stopping VM..."
    virsh_cmd destroy "$VM_NAME" 2>/dev/null || true
  fi

  info "Removing VM and storage..."
  virsh_cmd undefine --remove-all-storage "$VM_NAME" 2>/dev/null || true

  info "VM '$VM_NAME' destroyed."
}

cmd_ssh() {
  ensure_sudo
  vm_exists || die "VM '$VM_NAME' does not exist."
  vm_running || die "VM '$VM_NAME' is not running. Start it with: nazar vm start"

  local ip
  ip=$(get_vm_ip)
  [[ -n "$ip" ]] || die "Could not determine VM IP. Is the VM still booting?"

  exec ssh -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/dev/null \
    "core@${ip}" "$@"
}

cmd_ip() {
  ensure_sudo
  vm_exists || die "VM '$VM_NAME' does not exist."
  vm_running || die "VM '$VM_NAME' is not running."

  local ip
  ip=$(get_vm_ip)
  [[ -n "$ip" ]] || die "Could not determine VM IP. Is the VM still booting?"
  echo "$ip"
}

cmd_upgrade() {
  ensure_sudo
  vm_exists || die "VM '$VM_NAME' does not exist."
  vm_running || die "VM '$VM_NAME' is not running. Start it with: nazar vm start"

  local ip
  ip=$(get_vm_ip)
  [[ -n "$ip" ]] || die "Could not determine VM IP. Is the VM still booting?"

  local ssh_opts="-o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"

  info "Running bootc upgrade on VM..."
  # shellcheck disable=SC2086
  ssh $ssh_opts "core@${ip}" sudo bootc upgrade \
    || die "bootc upgrade failed. Has the VM been switched to a registry image? Try: nazar deploy --os"

  info ""
  info "Upgrade staged. A reboot is required to apply."
  read -r -p "Reboot VM now? [Y/n] " confirm
  if [[ ! "$confirm" =~ ^[Nn]$ ]]; then
    info "Rebooting VM..."
    # shellcheck disable=SC2086
    ssh $ssh_opts "core@${ip}" sudo systemctl reboot || true
    info "VM is rebooting. Wait ~30s then reconnect with: nazar vm ssh"
  else
    info "Skipped reboot. Apply later with: nazar vm ssh -- sudo systemctl reboot"
  fi
}

cmd_status() {
  ensure_sudo
  if ! vm_exists; then
    echo "VM '$VM_NAME': not created"
    return
  fi

  local state
  state=$(virsh_cmd domstate "$VM_NAME" 2>/dev/null)
  echo "VM '$VM_NAME': $state"

  if vm_running; then
    local ip
    ip=$(get_vm_ip)
    if [[ -n "$ip" ]]; then
      echo "IP: $ip"
    else
      echo "IP: (not yet assigned)"
    fi
  fi
}

# --- Main ---

subcmd="${1:-}"
shift 2>/dev/null || true

case "$subcmd" in
  create)  cmd_create ;;
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  destroy) cmd_destroy ;;
  ssh)     cmd_ssh "$@" ;;
  ip)      cmd_ip ;;
  upgrade) cmd_upgrade ;;
  status)  cmd_status ;;
  *)
    echo "Usage: nazar-vm <create|start|stop|destroy|ssh|ip|upgrade|status>" >&2
    echo "" >&2
    echo "Commands:" >&2
    echo "  create   Build OS image, generate QCOW2, create VM" >&2
    echo "  start    Start the VM" >&2
    echo "  stop     Gracefully shut down the VM" >&2
    echo "  destroy  Remove VM and its storage" >&2
    echo "  ssh      SSH into the VM as core user" >&2
    echo "  ip       Show the VM's IP address" >&2
    echo "  upgrade  bootc upgrade the VM and optionally reboot" >&2
    echo "  status   Show VM state" >&2
    exit 1
    ;;
esac
