#!/usr/bin/env bash
set -euo pipefail

# Container smoke tests — build all containers and run basic assertions.
# Requires: podman

command -v podman >/dev/null 2>&1 || { echo "Error: podman not found" >&2; exit 1; }

cd "$(dirname "$0")/../.."  # repo root

passed=0
failed=0

run_test() {
  local name="$1"
  shift
  echo "--- $name ---"
  if "$@"; then
    echo "PASS: $name"
    passed=$((passed + 1))
  else
    echo "FAIL: $name"
    failed=$((failed + 1))
  fi
  echo ""
}

# Build all container images
echo "=== Building containers ==="
podman build -t nazar-base -f core/containers/base/Containerfile .
podman build -t nazar-signal-cli -f containers/signal-cli/Containerfile .
podman build -t nazar-signal-bridge -f containers/signal-bridge/Containerfile .
echo ""

# Test 1: Base image has node
run_test "nazar-base: node works" \
  podman run --rm nazar-base node -e "console.log('OK')"

# Test 2: Base image has nazar-core importable
run_test "nazar-base: @nazar/core importable" \
  podman run --rm nazar-base node -e "
    import('./nazar-core/dist/index.js').then(m => {
      if (typeof m.ObjectStore === 'function') console.log('OK');
      else { console.error('ObjectStore not found'); process.exit(1); }
    })
  "

# Test 3: Signal CLI binary works
run_test "nazar-signal-cli: signal-cli binary exists" \
  podman run --rm nazar-signal-cli signal-cli --version

# Test 5: Signal bridge container has the built JS
run_test "nazar-signal-bridge: dist/index.js exists" \
  podman run --rm nazar-signal-bridge test -f bridges/signal/dist/index.js

echo "========================================="
echo "Results: $passed passed, $failed failed"
echo "========================================="

[ "$failed" -eq 0 ] || exit 1
