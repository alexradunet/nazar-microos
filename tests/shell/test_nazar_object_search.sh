#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/helpers.sh"

SCRIPT="scripts/nazar-object.sh"
TMPDIR_OBJ="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_OBJ"' EXIT
export NAZAR_OBJECTS_DIR="$TMPDIR_OBJ"

# Setup: create test objects with known content.
"$SCRIPT" create task "buy-milk" --title="Buy milk from store" --status=active >/dev/null
"$SCRIPT" create task "fix-fence" --title="Fix the garden fence" --status=pending >/dev/null
"$SCRIPT" create note "meeting-notes" --title="Meeting about fences" >/dev/null

# --- Test 1: search finds matching objects ---
out="$("$SCRIPT" search "milk")"
assert_contains "$out" "task/buy-milk"
assert_not_contains "$out" "task/fix-fence"

echo "PASS: test 1 — search finds matching object"

# --- Test 2: search finds across types ---
out="$("$SCRIPT" search "fence")"
assert_contains "$out" "task/fix-fence"
assert_contains "$out" "note/meeting-notes"

echo "PASS: test 2 — search finds across types"

# --- Test 3: search with no matches returns empty ---
out="$("$SCRIPT" search "nonexistent-pattern-xyz")"
if [[ -n "$out" ]]; then
  fail "expected empty output for no matches, got: $out"
fi

echo "PASS: test 3 — search with no matches returns empty"

# --- Test 4: search deduplicates results ---
# "task" appears in frontmatter (type: task) and possibly elsewhere
out="$("$SCRIPT" search "buy-milk")"
count=$(echo "$out" | grep -c "task/buy-milk" || true)
if [[ "$count" -ne 1 ]]; then
  fail "expected exactly 1 result for buy-milk, got $count"
fi

echo "PASS: test 4 — search deduplicates results"

# --- Test 5: missing pattern fails ---
if "$SCRIPT" search 2>/dev/null; then
  fail "expected search with no pattern to fail"
fi

echo "PASS: test 5 — missing pattern fails"

echo "PASS: all nazar-object search tests passed"
