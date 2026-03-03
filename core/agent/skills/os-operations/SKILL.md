---
name: os-operations
description: Inspect, manage, and remediate the NazarOS system — bootc status, services, containers, timers, and evolutions
---

# OS Operations Skill

Use this skill when the user asks about the health or state of the NazarOS system, or when a heartbeat or error condition suggests infrastructure inspection is warranted.

## NazarOS Architecture

NazarOS runs on **Fedora bootc 42** — an immutable, image-based OS:

- `/usr` — read-only, managed by bootc OS image updates
- `/etc` — writable, managed by `nazar setup` and Quadlet files
- `/var` — persistent across reboots, holds object store and runtime data

**Podman Quadlet** containers are managed by systemd. Each nazar service is a `.container` unit file in `/etc/containers/systemd/`. systemd starts and monitors them automatically.

## Available Commands

Run these commands directly via the `bash` tool. No CLI wrapper needed.

### OS Image Status

```bash
# Show booted image, staged update, rollback availability
bootc status
```

Use after: user asks "what OS version am I running?", after a failed upgrade, or during troubleshooting.

### Update Check

```bash
# Check whether a new OS image is available (read-only, no download)
sudo bootc upgrade --check
```

Use after: user asks "are there updates?", or as part of a weekly health check.

### Stage OS Upgrade

```bash
# Download and stage a bootc OS update (does NOT reboot)
sudo bootc upgrade
```

**Requires user confirmation.** Always use the `confirm` affordance before running this command. The staged update is applied on the next reboot.

### Service Inspection

```bash
# List all nazar-* systemd units and their active state
systemctl list-units 'nazar-*' --no-pager

# Show recent logs for a specific service (default: last 50 lines)
journalctl -u nazar-heartbeat.service --no-pager -n 50
journalctl -u nazar-signal.service --no-pager -n 100
```

Use after: a bridge stops responding, user reports missed messages, or a service appears degraded.

### Restart Service

```bash
# Restart a nazar-* systemd service (sudoers allows nazar-* only)
sudo systemctl restart nazar-heartbeat.service
```

**Requires user confirmation.** Always use the `confirm` affordance before restarting a service. Only nazar-* services can be restarted (enforced by sudoers).

### Container Health

```bash
# List running nazar-* containers with state and health status
podman ps --format json --filter 'name=nazar-'
```

Use after: checking if all containers are healthy, after a reboot, or when a service is unexpectedly unavailable.

### Restart Container

```bash
# Restart a nazar-* container (Quadlet containers are systemd units)
sudo systemctl restart nazar-signal-bridge.service
```

**Requires user confirmation.** Always use the `confirm` affordance before restarting. Only nazar-* units can be restarted (enforced by sudoers).

### Timer Schedule

```bash
# List nazar-* systemd timers and their next scheduled run
systemctl list-timers 'nazar-*' --no-pager
```

Use after: user asks when the next heartbeat runs, or to confirm timers survived a reboot.

## Health Assessment

When inspecting system health, analyze the output of the commands above directly. Look for these patterns:

### Healthy signals
- `systemctl list-units`: all nazar-* units show `active running`
- `podman ps`: all containers show running state with healthy status
- `systemctl list-timers`: timers show a future `NEXT` time
- `bootc status`: booted image matches desired image, no staged image pending

### Unhealthy signals
- Unit in `failed` state → check `journalctl -u <service>` for the error, suggest restart
- Container in `exited` or `unhealthy` state → check logs, suggest restart or evolution rollback
- Staged image present → reboot is needed to apply the pending OS update
- No rollback available → extra caution before any OS changes

### Alert Severities

- **CRITICAL**: Immediate attention required. A container has exited or a service has failed.
- **WARNING**: Action may be needed. An OS update is staged awaiting reboot, or a container is unhealthy.
- **INFO**: Informational. No nazar services are running (may be expected on first boot).

### Responding to Issues

For **critical** issues:
1. Inform the user immediately
2. Check logs: `journalctl -u <service> --no-pager -n 100`
3. Suggest remediation with `confirm` affordance:
   - Failed service → restart service
   - Exited container → restart container unit

For **warning** issues:
1. Inform the user
2. For staged OS update → remind user to schedule a reboot
3. For unhealthy container → check logs and monitor

For **info** issues:
1. Mention if relevant to the user's question
2. No action needed unless the user expects services to be running

### Confirmation Affordance Examples

Always include a `confirm` field in affordance JSON before mutations:

```json
{
  "type": "action",
  "confirm": "Restart nazar-heartbeat.service?",
  "command": "sudo systemctl restart nazar-heartbeat.service"
}
```

```json
{
  "type": "action",
  "confirm": "Stage OS upgrade? A reboot will be needed to apply.",
  "command": "sudo bootc upgrade"
}
```

```json
{
  "type": "action",
  "confirm": "Restart container nazar-signal-bridge?",
  "command": "sudo systemctl restart nazar-signal-bridge.service"
}
```

## Evolution Workflow

Evolutions are managed changes to NazarOS containers and configuration. Use the `nazar-core evolve` CLI for structured evolution management.

### Available Evolution Commands

```bash
# Check current evolution status
nazar-core evolve status

# Install an evolution (dry-run first to preview changes)
nazar-core evolve install <slug> --dry-run
nazar-core evolve install <slug>

# Rollback a previously installed evolution
nazar-core evolve rollback <slug>
```

### Evolution Workflow Steps

1. **Check status**: `nazar-core evolve status` — see pending and installed evolutions
2. **Preview changes**: `nazar-core evolve install <slug> --dry-run` — always dry-run first
3. **Confirm and install**: use `confirm` affordance, then `nazar-core evolve install <slug>`
4. **Monitor health**: after install, check services and containers for health
5. **Rollback if needed**: if health degrades, use `confirm` affordance then `nazar-core evolve rollback <slug>`

### Pending Evolutions in Context

When `## Pending Evolutions` appears in the runtime context, it lists evolutions with status "proposed". Inform the user about pending evolutions when relevant and guide them through the install workflow.

### Evolution Confirmation Examples

```json
{
  "type": "action",
  "confirm": "Install evolution 'upgrade-signal-cli'? (dry-run passed)",
  "command": "nazar-core evolve install upgrade-signal-cli"
}
```

```json
{
  "type": "action",
  "confirm": "Rollback evolution 'upgrade-signal-cli'? This will revert changes.",
  "command": "nazar-core evolve rollback upgrade-signal-cli"
}
```

## When to Use Each Command

| Situation | Command |
|---|---|
| User asks "is everything OK?" | `systemctl list-units 'nazar-*'` + `podman ps --filter name=nazar-` |
| Missed heartbeat or stale data | `systemctl list-units 'nazar-*'`, `journalctl -u nazar-heartbeat.service` |
| Signal messages not arriving | `journalctl -u nazar-signal.service --no-pager -n 100` |
| User asks about OS version | `bootc status` |
| User asks about updates | `sudo bootc upgrade --check` |
| After reboot | `systemctl list-units 'nazar-*'` + `podman ps --filter name=nazar-` + `systemctl list-timers 'nazar-*'` |
| Container in unhealthy state | `journalctl -u <service>`, consider restarting |
| Service has failed | `journalctl -u <service>`, consider restarting |
| Pending evolution | Guide through install workflow |

## Safety Rules

- **All mutation commands require user confirmation** via the `confirm` affordance field.
- Only nazar-* services and containers can be managed — sudoers restricts to `nazar-*` prefix.
- **Never trigger `bootc upgrade` without explicit user confirmation.** An OS upgrade requires a reboot and should be scheduled by the user.
- **Never install or rollback evolutions without user confirmation.** Always dry-run first.
- Always check health after mutations — inspect services and containers to verify.

## Rollback Awareness

If `bootc status` shows rollback is available, it means the previous OS image is still accessible. A rollback reverts the entire OS image and requires a reboot. Only suggest rollback if:

1. The booted image is causing confirmed failures
2. The user has explicitly asked about rollback

In all other cases, report the rollback availability as informational only.
