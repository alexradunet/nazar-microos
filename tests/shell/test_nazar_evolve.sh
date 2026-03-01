#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/helpers.sh"

SCRIPT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
EVOLVE_SCRIPT="${SCRIPT_DIR}/scripts/nazar-evolve.sh"

# Global test base dir — set by setup_evolve_test
TEST_BASE=""
ORIG_PATH="$PATH"

# --- Test setup: create isolated tmpdir with mock commands ---

setup_evolve_test() {
  TEST_BASE=$(mktemp -d)
  local objects_dir="$TEST_BASE/objects"
  local evolve_dir="$TEST_BASE/evolution"
  local quadlet_dir="$TEST_BASE/quadlet"
  local mock_bin="$TEST_BASE/mock-bin"
  local config="$TEST_BASE/nazar.yaml"
  mkdir -p "$objects_dir/evolution" "$evolve_dir" "$quadlet_dir" "$mock_bin"

  # Write minimal config
  printf 'evolution:\n  max_containers_per_evolution: 3\n' > "$config"

  # Mock systemctl
  cat > "$mock_bin/systemctl" <<'MOCK'
#!/usr/bin/env bash
if [[ "${1:-}" == "daemon-reload" ]]; then
  echo "MOCK systemctl daemon-reload" >> "${NAZAR_EVOLVE_DIR}/mock.log"
elif [[ "${1:-}" == "start" ]]; then
  echo "MOCK systemctl start: ${2:-}" >> "${NAZAR_EVOLVE_DIR}/mock.log"
elif [[ "${1:-}" == "stop" ]]; then
  echo "MOCK systemctl stop: ${2:-}" >> "${NAZAR_EVOLVE_DIR}/mock.log"
elif [[ "${1:-}" == "is-active" ]]; then
  service="${2:-}"
  service="${service%.service}"
  if [[ -f "${NAZAR_EVOLVE_DIR}/healthy/${service}" ]]; then
    echo "active"
    exit 0
  else
    echo "inactive"
    exit 3
  fi
fi
MOCK
  chmod +x "$mock_bin/systemctl"

  # Mock sudo (passthrough)
  printf '#!/usr/bin/env bash\n"$@"\n' > "$mock_bin/sudo"
  chmod +x "$mock_bin/sudo"

  # Mock nazar-object
  printf '#!/usr/bin/env bash\necho "MOCK nazar-object: $*" >> "${NAZAR_EVOLVE_DIR}/mock.log"\n' \
    > "$mock_bin/nazar-object"
  chmod +x "$mock_bin/nazar-object"

  # Export environment
  export NAZAR_CONFIG="$config"
  export NAZAR_OBJECTS_DIR="$objects_dir"
  export NAZAR_EVOLVE_DIR="$evolve_dir"
  export QUADLET_DIR="$quadlet_dir"
  export NAZAR_OBJECT_CMD="$mock_bin/nazar-object"
  export HEALTH_CHECK_TIMEOUT=4
  export PATH="$mock_bin:$ORIG_PATH"
}

teardown_evolve_test() {
  [[ -n "$TEST_BASE" ]] && rm -rf "$TEST_BASE"
  export PATH="$ORIG_PATH"
}

# Helper: create a test evolution object with containers.
# Usage: create_test_evolution <slug> "name1:image1" "name2:image2" ...
create_test_evolution() {
  local slug="$1"
  shift
  local pairs=("$@")

  local containers_yaml=""
  for pair in "${pairs[@]}"; do
    local name="${pair%%:*}"
    local image="${pair#*:}"
    containers_yaml="${containers_yaml}
  - name: ${name}
    image: ${image}
    volumes:
      - /var/lib/nazar/objects:/data/objects:ro
    environment:
      MODE: test"
  done

  cat > "${NAZAR_OBJECTS_DIR}/evolution/${slug}.md" <<EOF
---
type: evolution
slug: ${slug}
title: Test evolution
status: approved
agent: human
risk: low
area: containers
containers:${containers_yaml}
created: 2026-03-01T00:00:00Z
modified: 2026-03-01T00:00:00Z
---

Test evolution body.
EOF
}

# Helper: mark services as healthy (for health check mock)
mark_services_healthy() {
  mkdir -p "${NAZAR_EVOLVE_DIR}/healthy"
  for name in "$@"; do
    touch "${NAZAR_EVOLVE_DIR}/healthy/${name}"
  done
}

# ============================================================
# Tests
# ============================================================

# --- Test 1: install generates Quadlet .container files ---
test_install_generates_quadlet() {
  setup_evolve_test
  create_test_evolution "test-container" "nazar-whisper:ghcr.io/example/whisper-cpp:latest"
  mark_services_healthy "nazar-whisper"

  NAZAR_EVOLVE_YES=1 bash "$EVOLVE_SCRIPT" install test-container

  assert_file_exists "${QUADLET_DIR}/nazar-whisper.container"
  assert_file_contains "${QUADLET_DIR}/nazar-whisper.container" "Image=ghcr.io/example/whisper-cpp:latest"
  assert_file_contains "${QUADLET_DIR}/nazar-whisper.container" "Restart=always"
  assert_file_contains "${NAZAR_EVOLVE_DIR}/mock.log" "systemctl daemon-reload"
  assert_file_contains "${NAZAR_EVOLVE_DIR}/mock.log" "systemctl start"

  teardown_evolve_test
  echo "PASS: test 1 — install generates Quadlet files"
}

# --- Test 2: install rejects too many containers ---
test_install_rejects_excess_containers() {
  setup_evolve_test
  create_test_evolution "too-many" \
    "nazar-a:img:a" "nazar-b:img:b" "nazar-c:img:c" "nazar-d:img:d"

  local output
  output=$(NAZAR_EVOLVE_YES=1 bash "$EVOLVE_SCRIPT" install too-many 2>&1 || true)
  assert_contains "$output" "too many containers"

  teardown_evolve_test
  echo "PASS: test 2 — install rejects too many containers"
}

# --- Test 3: install validates container names (bad chars, missing nazar- prefix) ---
test_install_validates_names() {
  setup_evolve_test
  create_test_evolution "bad-name" "whisper:ghcr.io/example/whisper:latest"

  local output
  output=$(NAZAR_EVOLVE_YES=1 bash "$EVOLVE_SCRIPT" install bad-name 2>&1 || true)
  assert_contains "$output" "invalid container name"

  teardown_evolve_test
  echo "PASS: test 3 — install validates container names"
}

# --- Test 4: install validates required fields (missing name) ---
test_install_validates_missing_name() {
  setup_evolve_test

  # Create evolution with empty container name
  cat > "${NAZAR_OBJECTS_DIR}/evolution/no-name.md" <<'EOF'
---
type: evolution
slug: no-name
title: Test no name
status: approved
area: containers
containers:
  - name: ""
    image: ghcr.io/example/test:latest
---
EOF

  local output
  output=$(NAZAR_EVOLVE_YES=1 bash "$EVOLVE_SCRIPT" install no-name 2>&1 || true)
  assert_contains "$output" "missing 'name' field"

  teardown_evolve_test
  echo "PASS: test 4 — install validates required fields (missing name)"
}

# --- Test 5: install validates required fields (missing image) ---
test_install_validates_missing_image() {
  setup_evolve_test

  cat > "${NAZAR_OBJECTS_DIR}/evolution/no-image.md" <<'EOF'
---
type: evolution
slug: no-image
title: Test no image
status: approved
area: containers
containers:
  - name: nazar-test
    image: ""
---
EOF

  local output
  output=$(NAZAR_EVOLVE_YES=1 bash "$EVOLVE_SCRIPT" install no-image 2>&1 || true)
  assert_contains "$output" "missing 'image' field"

  teardown_evolve_test
  echo "PASS: test 5 — install validates required fields (missing image)"
}

# --- Test 6: install marks applied on healthy container ---
test_install_marks_applied() {
  setup_evolve_test
  create_test_evolution "healthy-evo" "nazar-healthy:ghcr.io/example/healthy:latest"
  mark_services_healthy "nazar-healthy"

  NAZAR_EVOLVE_YES=1 bash "$EVOLVE_SCRIPT" install healthy-evo

  assert_file_contains "${NAZAR_EVOLVE_DIR}/mock.log" "status=applied"

  teardown_evolve_test
  echo "PASS: test 6 — install marks applied on healthy container"
}

# --- Test 7: install rolls back on health check failure ---
test_install_rollback_on_failure() {
  setup_evolve_test
  create_test_evolution "unhealthy-evo" "nazar-unhealthy:ghcr.io/example/unhealthy:latest"
  # Do NOT mark as healthy — health check will fail

  local output
  output=$(NAZAR_EVOLVE_YES=1 bash "$EVOLVE_SCRIPT" install unhealthy-evo 2>&1 || true)
  assert_contains "$output" "failed health check"

  # Quadlet file should be removed after rollback
  assert_file_not_exists "${QUADLET_DIR}/nazar-unhealthy.container"
  assert_file_contains "${NAZAR_EVOLVE_DIR}/mock.log" "status=rejected"
  assert_file_contains "${NAZAR_EVOLVE_DIR}/mock.log" "systemctl stop"

  teardown_evolve_test
  echo "PASS: test 7 — install rolls back on health check failure"
}

# --- Test 8: rollback stops service and removes Quadlet files ---
test_rollback() {
  setup_evolve_test
  create_test_evolution "rollback-test" "nazar-rollme:ghcr.io/example/rollme:latest"

  # Pre-create a Quadlet file to be removed
  echo "[Container]" > "${QUADLET_DIR}/nazar-rollme.container"

  bash "$EVOLVE_SCRIPT" rollback rollback-test

  assert_file_not_exists "${QUADLET_DIR}/nazar-rollme.container"
  assert_file_contains "${NAZAR_EVOLVE_DIR}/mock.log" "systemctl stop"
  assert_file_contains "${NAZAR_EVOLVE_DIR}/mock.log" "systemctl daemon-reload"
  assert_file_contains "${NAZAR_EVOLVE_DIR}/mock.log" "status=rejected"

  teardown_evolve_test
  echo "PASS: test 8 — rollback stops service and removes Quadlet files"
}

# --- Test 9: status shows evolution list ---
test_status_shows_list() {
  setup_evolve_test

  local output
  output=$(bash "$EVOLVE_SCRIPT" status 2>&1)
  assert_contains "$output" "Evolution Objects"

  teardown_evolve_test
  echo "PASS: test 9 — status shows evolution list"
}

# --- Test 10: install fails with no slug ---
test_install_no_slug() {
  setup_evolve_test

  local output
  output=$(bash "$EVOLVE_SCRIPT" install 2>&1 || true)
  assert_contains "$output" "usage:"

  teardown_evolve_test
  echo "PASS: test 10 — install fails with no slug"
}

# --- Test 11: install fails with missing evolution object ---
test_install_missing_object() {
  setup_evolve_test

  local output
  output=$(bash "$EVOLVE_SCRIPT" install nonexistent 2>&1 || true)
  assert_contains "$output" "evolution object not found"

  teardown_evolve_test
  echo "PASS: test 11 — install fails with missing evolution object"
}

# --- Run all tests ---

test_install_generates_quadlet
test_install_rejects_excess_containers
test_install_validates_names
test_install_validates_missing_name
test_install_validates_missing_image
test_install_marks_applied
test_install_rollback_on_failure
test_rollback
test_status_shows_list
test_install_no_slug
test_install_missing_object

echo "PASS: all nazar-evolve tests passed"
