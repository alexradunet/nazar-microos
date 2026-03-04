#!/usr/bin/env bash
set -euo pipefail

# Nazar heartbeat — runs Pi in print mode with the heartbeat skill to perform
# a single observation cycle, then exits (run as a oneshot by systemd timer).

SKILLS_DIR="${NAZAR_SKILLS_DIR:-/usr/local/share/nazar/skills}"
PERSONA_DIR="${NAZAR_PERSONA_DIR:-/usr/local/share/nazar/persona}"

echo "Nazar heartbeat starting at $(date -u +%Y-%m-%dT%H:%M:%SZ)"

if command -v pi >/dev/null 2>&1; then
  pi -p --skill "${SKILLS_DIR}/heartbeat" \
    "Run a heartbeat cycle: scan recent objects, check overdue tasks, log observations."
else
  echo "Pi agent not available — running basic heartbeat check"
  OBJECTS_DIR="${NAZAR_OBJECTS_DIR:-/var/lib/nazar/objects}"
  if [[ -d "$OBJECTS_DIR" ]]; then
    count=$(find "$OBJECTS_DIR" -name '*.md' -type f 2>/dev/null | wc -l)
    echo "Objects found: $count"
  else
    echo "Objects directory not found: $OBJECTS_DIR"
  fi
fi

echo "Heartbeat complete at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
