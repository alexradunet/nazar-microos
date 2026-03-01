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

# --- Test 4: Invalid YAML syntax exits with error ---
TMPDIR4="$(mktemp -d)"
trap 'rm -rf "$TMPDIR4"' EXIT

cat > "$TMPDIR4/nazar.yaml" <<'EOF'
hostname: test-box
primary_user: testuser
  bad_indent: broken
EOF

if NAZAR_CONFIG="$TMPDIR4/nazar.yaml" QUADLET_OUTPUT_DIR="$TMPDIR4/quadlet" \
  bash "$SCRIPT" --dry-run 2>/dev/null; then
  fail "expected invalid YAML to cause exit with error"
fi

echo "PASS: test 4 — invalid YAML syntax exits with error"

# --- Test 5: Invalid heartbeat interval exits with error ---
TMPDIR5="$(mktemp -d)"
trap 'rm -rf "$TMPDIR5"' EXIT

cat > "$TMPDIR5/nazar.yaml" <<'EOF'
hostname: test-box
primary_user: testuser
modules:
  heartbeat:
    enable: true
    interval: 30x
  channels:
    matrix:
      enable: false
  syncthing:
    enable: false
  ttyd:
    enable: false
EOF

if NAZAR_CONFIG="$TMPDIR5/nazar.yaml" QUADLET_OUTPUT_DIR="$TMPDIR5/quadlet" \
  bash "$SCRIPT" --dry-run 2>/dev/null; then
  fail "expected invalid heartbeat interval '30x' to cause exit with error"
fi

echo "PASS: test 5 — invalid heartbeat interval exits with error"

# --- Test 6: Invalid ttyd port exits with error ---
TMPDIR6="$(mktemp -d)"
trap 'rm -rf "$TMPDIR6"' EXIT

cat > "$TMPDIR6/nazar.yaml" <<'EOF'
hostname: test-box
primary_user: testuser
modules:
  heartbeat:
    enable: false
  channels:
    matrix:
      enable: false
  syncthing:
    enable: false
  ttyd:
    enable: true
    port: abc
EOF

if NAZAR_CONFIG="$TMPDIR6/nazar.yaml" QUADLET_OUTPUT_DIR="$TMPDIR6/quadlet" \
  bash "$SCRIPT" --dry-run 2>/dev/null; then
  fail "expected invalid ttyd port 'abc' to cause exit with error"
fi

echo "PASS: test 6 — invalid ttyd port exits with error"

# --- Test 7: Matrix enabled without homeserver exits with error ---
TMPDIR7="$(mktemp -d)"
trap 'rm -rf "$TMPDIR7"' EXIT

cat > "$TMPDIR7/nazar.yaml" <<'EOF'
hostname: test-box
primary_user: testuser
modules:
  heartbeat:
    enable: false
  channels:
    matrix:
      enable: true
  syncthing:
    enable: false
  ttyd:
    enable: false
EOF

if NAZAR_CONFIG="$TMPDIR7/nazar.yaml" QUADLET_OUTPUT_DIR="$TMPDIR7/quadlet" \
  bash "$SCRIPT" --dry-run 2>/dev/null; then
  fail "expected matrix enabled without homeserver to cause exit with error"
fi

echo "PASS: test 7 — matrix enabled without homeserver exits with error"

# --- Test 8: Valid heartbeat intervals (5m, 2h, 1d) are accepted ---
for interval in 5m 2h 1d; do
  TMPDIR8="$(mktemp -d)"
  trap 'rm -rf "$TMPDIR8"' EXIT

  cat > "$TMPDIR8/nazar.yaml" <<EOF
hostname: test-box
primary_user: testuser
modules:
  heartbeat:
    enable: true
    interval: ${interval}
  channels:
    matrix:
      enable: false
  syncthing:
    enable: false
  ttyd:
    enable: false
EOF

  NAZAR_CONFIG="$TMPDIR8/nazar.yaml" QUADLET_OUTPUT_DIR="$TMPDIR8/quadlet" \
    bash "$SCRIPT" --dry-run || fail "heartbeat interval '$interval' should be accepted"
done

echo "PASS: test 8 — valid heartbeat intervals (5m, 2h, 1d) are accepted"
