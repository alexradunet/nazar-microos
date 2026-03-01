#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/helpers.sh"

SCRIPT="scripts/nazar-setup.sh"

# --- Test 1: Valid config with heartbeat enabled generates Quadlet file ---
TMPDIR1="$(mktemp -d)"
trap 'rm -rf "$TMPDIR1"' EXIT

cat > "$TMPDIR1/nazar.yaml" <<'EOF'
hostname: test-box
primary_user: testuser
timezone: UTC
modules:
  heartbeat:
    enable: true
    interval: 30m
  channels:
    matrix:
      enable: false
  syncthing:
    enable: false
  ttyd:
    enable: false
EOF

NAZAR_CONFIG="$TMPDIR1/nazar.yaml" QUADLET_OUTPUT_DIR="$TMPDIR1/quadlet" \
  bash "$SCRIPT" --dry-run

assert_file_exists "$TMPDIR1/quadlet/nazar-heartbeat.container"
assert_file_exists "$TMPDIR1/quadlet/nazar-heartbeat.timer"
assert_file_contains "$TMPDIR1/quadlet/nazar-heartbeat.container" "Description=Nazar Heartbeat"
assert_file_contains "$TMPDIR1/quadlet/nazar-heartbeat.container" "Type=oneshot"
assert_file_not_contains "$TMPDIR1/quadlet/nazar-heartbeat.container" "[Timer]"
assert_file_contains "$TMPDIR1/quadlet/nazar-heartbeat.timer" "OnCalendar=*:0/30"
assert_file_contains "$TMPDIR1/quadlet/nazar-heartbeat.timer" "WantedBy=timers.target"

echo "PASS: test 1 — heartbeat Quadlet generated correctly (container + timer)"

# --- Test 2: Disabled matrix module produces no conduit/bridge Quadlet files ---
TMPDIR2="$(mktemp -d)"
trap 'rm -rf "$TMPDIR2"' EXIT

cat > "$TMPDIR2/nazar.yaml" <<'EOF'
hostname: test-box
primary_user: testuser
timezone: UTC
modules:
  heartbeat:
    enable: false
  channels:
    matrix:
      enable: false
  syncthing:
    enable: false
  ttyd:
    enable: false
EOF

NAZAR_CONFIG="$TMPDIR2/nazar.yaml" QUADLET_OUTPUT_DIR="$TMPDIR2/quadlet" \
  bash "$SCRIPT" --dry-run

assert_file_not_exists "$TMPDIR2/quadlet/nazar-conduit.container"
assert_file_not_exists "$TMPDIR2/quadlet/nazar-matrix-bridge.container"
assert_file_not_exists "$TMPDIR2/quadlet/nazar-heartbeat.container"
assert_file_not_exists "$TMPDIR2/quadlet/nazar-heartbeat.timer"

echo "PASS: test 2 — disabled modules produce no Quadlet files"

# --- Test 3: Missing required field (hostname) exits with error ---
TMPDIR3="$(mktemp -d)"
trap 'rm -rf "$TMPDIR3"' EXIT

cat > "$TMPDIR3/nazar.yaml" <<'EOF'
primary_user: testuser
timezone: UTC
modules:
  heartbeat:
    enable: false
EOF

if NAZAR_CONFIG="$TMPDIR3/nazar.yaml" QUADLET_OUTPUT_DIR="$TMPDIR3/quadlet" \
  bash "$SCRIPT" --dry-run 2>/dev/null; then
  fail "expected missing hostname to cause exit with error"
fi

echo "PASS: test 3 — missing hostname exits with error"
