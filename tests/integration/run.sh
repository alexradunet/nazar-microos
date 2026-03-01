#!/usr/bin/env bash
set -euo pipefail

# Integration test: spin up Conduit + matrix-bridge, verify Conduit responds.
# Requires: podman-compose or docker-compose

cd "$(dirname "$0")"

COMPOSE_CMD=""
if command -v podman-compose >/dev/null 2>&1; then
  COMPOSE_CMD="podman-compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
elif command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
else
  echo "Error: podman-compose or docker-compose not found" >&2
  exit 1
fi

cleanup() {
  echo "Cleaning up..."
  $COMPOSE_CMD -f compose.yaml down -v 2>/dev/null || true
}
trap cleanup EXIT

echo "=== Starting Conduit ==="
$COMPOSE_CMD -f compose.yaml up -d conduit

echo "=== Waiting for Conduit to be healthy ==="
retries=30
while [ $retries -gt 0 ]; do
  if curl -sf http://localhost:6167/_matrix/client/versions >/dev/null 2>&1; then
    echo "Conduit is responding!"
    break
  fi
  retries=$((retries - 1))
  sleep 2
done

if [ $retries -eq 0 ]; then
  echo "FAIL: Conduit did not become healthy in time"
  $COMPOSE_CMD -f compose.yaml logs
  exit 1
fi

echo "=== Starting bridge ==="
$COMPOSE_CMD -f compose.yaml up -d matrix-bridge

echo ""
echo "=== Running assertions ==="

# Test 1: Conduit returns client versions
versions=$(curl -sf http://localhost:6167/_matrix/client/versions)
if echo "$versions" | grep -q '"versions"'; then
  echo "PASS: Conduit returns client versions"
else
  echo "FAIL: Conduit did not return expected versions response"
  exit 1
fi

# Test 2: Conduit returns supported login types
login=$(curl -sf http://localhost:6167/_matrix/client/v3/login)
if echo "$login" | grep -q '"flows"'; then
  echo "PASS: Conduit returns login flows"
else
  echo "FAIL: Conduit did not return login flows"
  exit 1
fi

echo ""
echo "========================================="
echo "Integration tests passed"
echo "========================================="
