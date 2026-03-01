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
  local mock_bin="$TEST_BASE/mock-bin"
  local config="$TEST_BASE/nazar.yaml"
  mkdir -p "$objects_dir/evolution" "$evolve_dir" "$mock_bin"

  # Write minimal config
  printf 'evolution:\n  max_packages_per_evolution: 3\n' > "$config"

  # Mock transactional-update
  printf '#!/usr/bin/env bash\necho "MOCK transactional-update: $*" >> "${NAZAR_EVOLVE_DIR}/mock.log"\n' \
    > "$mock_bin/transactional-update"
  chmod +x "$mock_bin/transactional-update"

  # Mock snapper
  printf '#!/usr/bin/env bash\nif [[ "${1:-}" == "list" ]]; then\n  printf "number\\n42\\n"\nelif [[ "${1:-}" == "rollback" ]]; then\n  echo "MOCK snapper rollback: $*" >> "${NAZAR_EVOLVE_DIR}/mock.log"\nfi\n' \
    > "$mock_bin/snapper"
  chmod +x "$mock_bin/snapper"

  # Mock rpm
  printf '#!/usr/bin/env bash\nif [[ "${1:-}" == "-q" ]]; then\n  pkg="${2:-}"\n  if [[ -f "${NAZAR_EVOLVE_DIR}/installed/${pkg}" ]]; then\n    echo "${pkg}-1.0-1.x86_64"\n    exit 0\n  else\n    echo "package ${pkg} is not installed"\n    exit 1\n  fi\nfi\n' \
    > "$mock_bin/rpm"
  chmod +x "$mock_bin/rpm"

  # Mock sudo
  printf '#!/usr/bin/env bash\n"$@"\n' > "$mock_bin/sudo"
  chmod +x "$mock_bin/sudo"

  # Mock reboot
  printf '#!/usr/bin/env bash\necho "MOCK reboot" >> "${NAZAR_EVOLVE_DIR}/mock.log"\n' \
    > "$mock_bin/reboot"
  chmod +x "$mock_bin/reboot"

  # Mock nazar-object
  printf '#!/usr/bin/env bash\necho "MOCK nazar-object: $*" >> "${NAZAR_EVOLVE_DIR}/mock.log"\n' \
    > "$mock_bin/nazar-object"
  chmod +x "$mock_bin/nazar-object"

  # Export environment
  export NAZAR_CONFIG="$config"
  export NAZAR_OBJECTS_DIR="$objects_dir"
  export NAZAR_EVOLVE_DIR="$evolve_dir"
  export NAZAR_OBJECT_CMD="$mock_bin/nazar-object"
  export PATH="$mock_bin:$ORIG_PATH"
}

teardown_evolve_test() {
  [[ -n "$TEST_BASE" ]] && rm -rf "$TEST_BASE"
  export PATH="$ORIG_PATH"
}

# Helper: create a test evolution object with host_packages
create_test_evolution() {
  local slug="$1"
  shift
  local packages=("$@")

  local pkg_yaml=""
  for pkg in "${packages[@]}"; do
    pkg_yaml="${pkg_yaml}
  - ${pkg}"
  done

  cat > "${NAZAR_OBJECTS_DIR}/evolution/${slug}.md" <<EOF
---
type: evolution
slug: ${slug}
title: Test evolution
status: approved
agent: human
risk: low
area: host-packages
host_packages:${pkg_yaml}
created: 2026-03-01T00:00:00Z
modified: 2026-03-01T00:00:00Z
---

Test evolution body.
EOF
}

# Helper: simulate packages as installed (for resume verification)
mark_packages_installed() {
  mkdir -p "${NAZAR_EVOLVE_DIR}/installed"
  for pkg in "$@"; do
    touch "${NAZAR_EVOLVE_DIR}/installed/${pkg}"
  done
}

# ============================================================
# Tests
# ============================================================

# --- Test 1: install reads packages and writes pending state ---
test_install_writes_pending() {
  setup_evolve_test
  create_test_evolution "test-pkg" "whisper-cpp"

  NAZAR_EVOLVE_YES=1 NAZAR_DRY_RUN=1 bash "$EVOLVE_SCRIPT" install test-pkg

  assert_file_exists "${NAZAR_EVOLVE_DIR}/pending.yaml"
  assert_file_contains "${NAZAR_EVOLVE_DIR}/pending.yaml" "slug: test-pkg"
  assert_file_contains "${NAZAR_EVOLVE_DIR}/pending.yaml" "whisper-cpp"
  assert_file_contains "${NAZAR_EVOLVE_DIR}/pending.yaml" "pre_snapshot: 42"

  teardown_evolve_test
  echo "PASS: test 1 — install writes pending state"
}

# --- Test 2: install rejects too many packages ---
test_install_rejects_excess_packages() {
  setup_evolve_test
  create_test_evolution "too-many" "pkg1" "pkg2" "pkg3" "pkg4"

  local output
  output=$(NAZAR_EVOLVE_YES=1 NAZAR_DRY_RUN=1 bash "$EVOLVE_SCRIPT" install too-many 2>&1 || true)
  assert_contains "$output" "too many packages"

  teardown_evolve_test
  echo "PASS: test 2 — install rejects too many packages"
}

# --- Test 3: install validates package names ---
test_install_validates_names() {
  setup_evolve_test
  create_test_evolution "bad-name" "valid-pkg" "rm -rf /"

  local output
  output=$(NAZAR_EVOLVE_YES=1 NAZAR_DRY_RUN=1 bash "$EVOLVE_SCRIPT" install bad-name 2>&1 || true)
  assert_contains "$output" "invalid package name"

  teardown_evolve_test
  echo "PASS: test 3 — install validates package names"
}

# --- Test 4: resume verifies packages and marks applied ---
test_resume_success() {
  setup_evolve_test
  create_test_evolution "resume-ok" "whisper-cpp"

  printf 'slug: resume-ok\npackages:\n  - whisper-cpp\npre_snapshot: 42\nstarted: 2026-03-01T14:30:00Z\n' \
    > "${NAZAR_EVOLVE_DIR}/pending.yaml"

  mark_packages_installed "whisper-cpp"

  bash "$EVOLVE_SCRIPT" --resume

  assert_file_not_exists "${NAZAR_EVOLVE_DIR}/pending.yaml"
  assert_file_contains "${NAZAR_EVOLVE_DIR}/mock.log" "status=applied"

  teardown_evolve_test
  echo "PASS: test 4 — resume verifies and marks applied"
}

# --- Test 5: resume triggers rollback on missing package ---
test_resume_rollback() {
  setup_evolve_test
  create_test_evolution "resume-fail" "missing-pkg"

  printf 'slug: resume-fail\npackages:\n  - missing-pkg\npre_snapshot: 42\nstarted: 2026-03-01T14:30:00Z\n' \
    > "${NAZAR_EVOLVE_DIR}/pending.yaml"

  local output
  output=$(bash "$EVOLVE_SCRIPT" --resume 2>&1 || true)
  assert_contains "$output" "Verification failed"
  assert_contains "$output" "Rolling back"

  assert_file_not_exists "${NAZAR_EVOLVE_DIR}/pending.yaml"
  assert_file_contains "${NAZAR_EVOLVE_DIR}/mock.log" "snapper rollback"
  assert_file_contains "${NAZAR_EVOLVE_DIR}/mock.log" "status=rejected"

  teardown_evolve_test
  echo "PASS: test 5 — resume triggers rollback on missing package"
}

# --- Test 6: status shows evolution list ---
test_status_shows_list() {
  setup_evolve_test

  local output
  output=$(bash "$EVOLVE_SCRIPT" status 2>&1)
  assert_contains "$output" "Evolution Objects"
  assert_contains "$output" "No pending evolution"

  teardown_evolve_test
  echo "PASS: test 6 — status shows evolution list"
}

# --- Test 7: rollback uses pre_snapshot from pending ---
test_rollback() {
  setup_evolve_test
  create_test_evolution "rollback-test" "some-pkg"

  printf 'slug: rollback-test\npackages:\n  - some-pkg\npre_snapshot: 41\nstarted: 2026-03-01T14:30:00Z\n' \
    > "${NAZAR_EVOLVE_DIR}/pending.yaml"

  NAZAR_DRY_RUN=1 bash "$EVOLVE_SCRIPT" rollback rollback-test

  assert_file_contains "${NAZAR_EVOLVE_DIR}/mock.log" "status=rejected"
  assert_file_not_exists "${NAZAR_EVOLVE_DIR}/pending.yaml"

  teardown_evolve_test
  echo "PASS: test 7 — rollback uses pending snapshot and cleans up"
}

# --- Test 8: install fails with no slug ---
test_install_no_slug() {
  setup_evolve_test

  local output
  output=$(bash "$EVOLVE_SCRIPT" install 2>&1 || true)
  assert_contains "$output" "usage:"

  teardown_evolve_test
  echo "PASS: test 8 — install fails with no slug"
}

# --- Test 9: install fails with missing evolution object ---
test_install_missing_object() {
  setup_evolve_test

  local output
  output=$(bash "$EVOLVE_SCRIPT" install nonexistent 2>&1 || true)
  assert_contains "$output" "evolution object not found"

  teardown_evolve_test
  echo "PASS: test 9 — install fails with missing evolution object"
}

# --- Run all tests ---

test_install_writes_pending
test_install_rejects_excess_packages
test_install_validates_names
test_resume_success
test_resume_rollback
test_status_shows_list
test_rollback
test_install_no_slug
test_install_missing_object

echo "PASS: all nazar-evolve tests passed"
