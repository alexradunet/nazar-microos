#!/usr/bin/env bash
set -euo pipefail

# nazar-vm.sh — Local dev VM lifecycle management via libvirt.
#
# Manages a Fedora CoreOS VM for local development and testing.
# Runs on the HOST (not inside a toolbox).
#
# Usage:
#   nazar-vm create    Download FCOS, generate Ignition, create VM
#   nazar-vm start     Start the VM
#   nazar-vm stop      Gracefully shut down the VM
#   nazar-vm destroy   Remove VM and its storage
#   nazar-vm ssh       SSH into the VM as core user
#   nazar-vm ip        Show the VM's IP address
#   nazar-vm status    Show VM state

VM_NAME="${NAZAR_VM_NAME:-nazar-dev}"
VM_MEMORY="${NAZAR_VM_MEMORY:-2048}"
VM_VCPUS="${NAZAR_VM_VCPUS:-2}"
VM_DISK_SIZE="${NAZAR_VM_DISK_SIZE:-20G}"
VIRSH_URI="qemu:///system"

# Resolve project root (parent of scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
IGNITION_DIR="$PROJECT_ROOT/ignition"
AUTH_KEYS="$IGNITION_DIR/files/authorized_keys"

# --- Helpers ---

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo ":: $*"; }
warn() { echo "WARNING: $*" >&2; }

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
  info "Waiting for VM to get an IP address..."
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
  [[ -f "$AUTH_KEYS" ]] || die "SSH key not found: $AUTH_KEYS
Copy your public key:  cp ~/.ssh/id_ed25519.pub $AUTH_KEYS"

  # Download FCOS QCOW2 if not already present
  local qcow2_file
  qcow2_file=$(find "$IGNITION_DIR" -name 'fedora-coreos-*.qcow2' -print -quit 2>/dev/null || true)

  if [[ -z "$qcow2_file" ]]; then
    info "Downloading Fedora CoreOS QCOW2..."
    podman run --rm --security-opt label=disable -v "$IGNITION_DIR:/data" -w /data \
      quay.io/coreos/coreos-installer:release \
      download -s stable -p qemu -f qcow2.xz --decompress -C /data
    qcow2_file=$(find "$IGNITION_DIR" -name 'fedora-coreos-*.qcow2' -print -quit)
    [[ -n "$qcow2_file" ]] || die "FCOS download failed — no QCOW2 found"
  else
    info "Using existing FCOS image: $(basename "$qcow2_file")"
  fi

  # Build Ignition config (runs butane in a container, same as Makefile)
  info "Building Ignition config..."
  podman run --rm --security-opt label=disable -v "$PROJECT_ROOT:/pwd" -w /pwd/ignition \
    quay.io/coreos/butane:release --files-dir /pwd \
    --pretty --strict nazar.bu > "$IGNITION_DIR/nazar.ign" \
    || die "Ignition build failed"

  local ign_file="$IGNITION_DIR/nazar.ign"
  [[ -f "$ign_file" ]] || die "Ignition file not found: $ign_file"

  # Copy VM disk and ignition to libvirt images dir (qemu user needs access)
  local libvirt_dir="/var/lib/libvirt/images"
  local vm_disk="$libvirt_dir/nazar-dev.qcow2"
  local vm_ign="$libvirt_dir/nazar.ign"

  info "Creating VM disk from base image..."
  sudo -n cp "$qcow2_file" "$vm_disk"
  sudo -n qemu-img resize "$vm_disk" "$VM_DISK_SIZE"
  sudo -n cp "$ign_file" "$vm_ign"

  # Create VM
  info "Creating VM '$VM_NAME'..."
  sudo -n virt-install --connect "$VIRSH_URI" \
    --name "$VM_NAME" \
    --memory "$VM_MEMORY" \
    --vcpus "$VM_VCPUS" \
    --import \
    --graphics none \
    --disk "path=$vm_disk" \
    --os-variant fedora-coreos-stable \
    --network network=default \
    --qemu-commandline="-fw_cfg name=opt/com.coreos/config,file=$vm_ign" \
    --noautoconsole

  info "VM '$VM_NAME' created and starting."

  local ip
  ip=$(wait_for_ip)
  info "VM IP: $ip"
  info ""
  info "The VM is provisioning (RPM layering + nazar apply)."
  info "This takes ~5 minutes on first boot. SSH in with:"
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

  # Clean up ignition copy from libvirt dir
  sudo -n rm -f /var/lib/libvirt/images/nazar.ign

  info "VM '$VM_NAME' destroyed."
}

cmd_ssh() {
  ensure_sudo
  vm_exists || die "VM '$VM_NAME' does not exist."
  vm_running || die "VM '$VM_NAME' is not running. Start it with: nazar vm start"

  local ip
  ip=$(get_vm_ip)
  [[ -n "$ip" ]] || die "Could not determine VM IP. Is the VM still booting?"

  exec ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
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
  status)  cmd_status ;;
  *)
    echo "Usage: nazar-vm <create|start|stop|destroy|ssh|ip|status>" >&2
    echo "" >&2
    echo "Commands:" >&2
    echo "  create   Download FCOS, generate Ignition, create VM" >&2
    echo "  start    Start the VM" >&2
    echo "  stop     Gracefully shut down the VM" >&2
    echo "  destroy  Remove VM and its storage" >&2
    echo "  ssh      SSH into the VM as core user" >&2
    echo "  ip       Show the VM's IP address" >&2
    echo "  status   Show VM state" >&2
    exit 1
    ;;
esac
