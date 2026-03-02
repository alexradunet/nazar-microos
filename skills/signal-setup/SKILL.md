---
name: signal-setup
description: Guide the user through connecting Nazar to Signal messenger via signal-cli.
---

# Signal Setup Skill

Guide the user through connecting Nazar to Signal messenger via signal-cli.

## Prerequisites

Container images must be present on the system. After `nazar vm create`, images
are deployed automatically. If images are missing, run from the host:

```bash
nazar deploy --images
```

## Overview

Nazar uses signal-cli running as a JSON-RPC TCP daemon to send and receive Signal messages. The TypeScript bridge connects to this daemon over localhost (shared pod network) and routes messages to the Pi agent.

## Phase 1: Register or Link a Signal Account

Choose one of two options depending on whether you have a dedicated phone number for Nazar.

### Option A: Register a new number (dedicated SIM/VoIP number)

```bash
# Register with captcha (required by Signal)
# 1. Get captcha: open https://signalcaptchas.org/registration/generate.html
#    Solve it, right-click "Open Signal", copy the link
# 2. Register:
sudo podman run --rm -it \
  -v /var/lib/nazar/signal-storage:/data/signal-storage:rw,z \
  localhost/nazar-signal-cli:latest \
  --config /data/signal-storage -a +<YOUR_NUMBER> \
  register --captcha 'signalcaptcha://...'

# 3. Verify with SMS code:
sudo podman run --rm -it \
  -v /var/lib/nazar/signal-storage:/data/signal-storage:rw,z \
  localhost/nazar-signal-cli:latest \
  --config /data/signal-storage -a +<YOUR_NUMBER> \
  verify <CODE>
```

### Option B: Link to existing Signal account (QR code)

```bash
# Generate a QR code link request
sudo podman run --rm -it \
  -v /var/lib/nazar/signal-storage:/data/signal-storage:rw,z \
  localhost/nazar-signal-cli:latest \
  --config /data/signal-storage \
  link --name "Nazar"
```

Scan the displayed QR code with your Signal mobile app:
- Android: Settings → Linked Devices → Link New Device
- iOS: Settings → Linked Devices → Link New Device

## Phase 2: Update nazar.yaml

Edit `/etc/nazar/nazar.yaml` and add the signal configuration:

```yaml
signal:
  phone_number: "+<YOUR_NUMBER>"   # E.164 format
  allowed_contacts: []             # Empty = allow all; or list specific numbers
```

Then apply the configuration:

```bash
sudo nazar apply
```

## Phase 3: Start and Verify Services

```bash
# Check pod and container status
systemctl status nazar-signal-pod
systemctl status nazar-signal-cli
systemctl status nazar-signal-bridge

# Start if not running
sudo systemctl start nazar-signal-pod
```

## Phase 4: Test

Send a Signal message to Nazar's number and verify a response arrives. Example test prompts:
- "Hello, are you there?"
- "What's in my object store?"

Check logs if no response:

```bash
journalctl -u nazar-signal-bridge -f
journalctl -u nazar-signal-cli -f
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `signal-cli daemon` fails to start | Java 25 not found | Rebuild `nazar-signal-cli` container from `eclipse-temurin:25-jre-slim` |
| `Connection refused` on port 7583 | signal-cli not in same pod | Verify both containers have `Pod=nazar-signal.pod` in their Quadlet files |
| `NAZAR_SIGNAL_PHONE is required` | Missing env var | Set `signal.phone_number` in `nazar.yaml` and run `nazar apply` |
| Messages from unknown contacts blocked | `allowed_contacts` is set | Add the number to `allowed_contacts` in `nazar.yaml` |
| No response after message | Agent session error | Check `journalctl -u nazar-signal-bridge` for errors |
| Health check failing | Bridge not writing health file | Verify `/data/signal-storage/healthy` exists and is recent |
| Pod restart loop | signal-cli not registered | Complete registration (Phase 1) before starting the pod |
| Registration fails with 402/captcha error | Signal requires captcha | Get captcha from `signalcaptchas.org/registration/generate.html`, pass via `--captcha` flag |
| Container image not found | Images not deployed to VM | Run `nazar deploy --images` from the host |
