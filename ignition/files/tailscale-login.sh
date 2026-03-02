#!/bin/bash
# Prompt Tailscale authentication on first interactive login.
# Runs once per session; skips if already authenticated.

[[ $- == *i* ]] || return 0
command -v tailscale >/dev/null 2>&1 || return 0

ts_status="$(tailscale status --json 2>/dev/null | grep -o '"BackendState":"[^"]*"' | cut -d'"' -f4)"

if [[ "$ts_status" != "Running" ]]; then
  echo ""
  echo "Tailscale is not authenticated. Starting login..."
  echo ""
  sudo tailscale up
fi
