#!/usr/bin/env bash
set -euo pipefail

# Shell test runner — runs all test_*.sh files in this directory.
# Requires: yq (yq-go), jq

cd "$(dirname "$0")/../.."  # repo root

command -v yq >/dev/null 2>&1 || { echo "Error: yq not found in PATH" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "Error: jq not found in PATH" >&2; exit 1; }

passed=0
failed=0

for test in tests/shell/test_*.sh; do
  echo "--- Running: $test ---"
  if bash "$test"; then
    passed=$((passed + 1))
  else
    echo "FAIL: $test"
    failed=$((failed + 1))
  fi
  echo ""
done

echo "========================================="
echo "Results: $passed passed, $failed failed"
echo "========================================="

[ "$failed" -eq 0 ] || exit 1
