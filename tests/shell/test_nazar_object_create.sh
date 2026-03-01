#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/helpers.sh"

SCRIPT="scripts/nazar-object.sh"
TMPDIR_OBJ="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_OBJ"' EXIT
export NAZAR_OBJECTS_DIR="$TMPDIR_OBJ"

# --- Test 1: basic create produces correct frontmatter ---
out="$("$SCRIPT" create task "buy-milk" --title="Buy milk" --status=active)"
assert_contains "$out" "created task/buy-milk"

content="$("$SCRIPT" read task buy-milk)"
assert_contains "$content" "type: task"
assert_contains "$content" "slug: buy-milk"
assert_contains "$content" "title: Buy milk"
assert_contains "$content" "status: active"
assert_contains "$content" "created:"
assert_contains "$content" "modified:"

echo "PASS: test 1 — basic create produces correct frontmatter"

# --- Test 2: duplicate create fails ---
if "$SCRIPT" create task "buy-milk" --title="Duplicate" 2>/dev/null; then
  fail "expected duplicate create to fail"
fi

echo "PASS: test 2 — duplicate create fails"

# --- Test 3: create with no fields ---
"$SCRIPT" create note "bare-note" >/dev/null
content="$("$SCRIPT" read note bare-note)"
assert_contains "$content" "type: note"
assert_contains "$content" "slug: bare-note"

echo "PASS: test 3 — create with no extra fields works"

# --- Test 4: timestamps are in ISO 8601 format ---
content="$(cat "$TMPDIR_OBJ/note/bare-note.md")"
# Match YYYY-MM-DDTHH:MM:SSZ
if ! echo "$content" | grep -qE '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z'; then
  fail "expected ISO 8601 timestamp in created/modified fields"
fi

echo "PASS: test 4 — timestamps are ISO 8601"

# --- Test 5: invalid field name rejected ---
if "$SCRIPT" create task "bad-field" --"foo.bar"=baz 2>/dev/null; then
  fail "expected invalid field name to be rejected"
fi

echo "PASS: test 5 — invalid field name rejected"

# --- Test 6: missing arguments ---
if "$SCRIPT" create 2>/dev/null; then
  fail "expected create with no args to fail"
fi

if "$SCRIPT" create task 2>/dev/null; then
  fail "expected create with no slug to fail"
fi

echo "PASS: test 6 — missing arguments fail"

echo "PASS: all nazar-object create tests passed"
