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

All commands are exposed via the `nazar-core` CLI as `os <subcommand>`:

### OS Image Status

```bash
# Show booted image, staged update, rollback availability
nazar-core os status
```

Use after: user asks "what OS version am I running?", after a failed upgrade, or during troubleshooting.

### Update Check

```bash
# Check whether a new OS image is available (read-only, no download)
nazar-core os upgrade-check
```

Use after: user asks "are there updates?", or as part of a weekly health check.

### Stage OS Upgrade

```bash
# Download and stage a bootc OS update (does NOT reboot)
nazar-core os upgrade
```

**Requires user confirmation.** Always use the `confirm` affordance before running this command. The staged update is applied on the next reboot.

### Service Inspection

```bash
# List all nazar-* systemd units and their active state
nazar-core os services

# Show recent logs for a specific service (default: last 50 lines)
nazar-core os logs nazar-heartbeat.service
nazar-core os logs nazar-signal.service --lines=100
```

Use after: a bridge stops responding, user reports missed messages, or a service appears degraded.

### Restart Service

```bash
# Restart a nazar-* systemd service
nazar-core os restart-service nazar-heartbeat.service
```

**Requires user confirmation.** Always use the `confirm` affordance before restarting a service. Only nazar-* services can be restarted.

### Container Health

```bash
# List running nazar-* containers with state and health status
nazar-core os containers
```

Use after: checking if all containers are healthy, after a reboot, or when a service is unexpectedly unavailable.

### Restart Container

```bash
# Restart a nazar-* Podman container
nazar-core os restart-container nazar-signal-bridge
```

**Requires user confirmation.** Always use the `confirm` affordance before restarting a container. Only nazar-* containers can be restarted.

### Timer Schedule

```bash
# List nazar-* systemd timers and their next scheduled run
nazar-core os timers
```

Use after: user asks when the next heartbeat runs, or to confirm timers survived a reboot.

## Health Alerts

When `## Health Alerts` appears in the runtime context, proactively inform the user about detected anomalies.

### Alert Severities

- **CRITICAL**: Immediate attention required. A container has exited or a service has failed.
- **WARNING**: Action may be needed. An OS update is staged awaiting reboot, or a container is unhealthy.
- **INFO**: Informational. No nazar services are running (may be expected on first boot).

### Responding to Alerts

For **critical** alerts:
1. Inform the user immediately
2. Check logs for the affected service/container: `nazar-core os logs <service>`
3. Suggest remediation with `confirm` affordance:
   - Failed service → restart-service
   - Exited container → restart-container

For **warning** alerts:
1. Inform the user
2. For staged OS update → remind user to schedule a reboot
3. For unhealthy container → check logs and monitor

For **info** alerts:
1. Mention if relevant to the user's question
2. No action needed unless the user expects services to be running

### Confirmation Affordance Examples

Always include a `confirm` field in affordance JSON before mutations:

```json
{
  "type": "action",
  "confirm": "Restart nazar-heartbeat.service?",
  "command": "nazar-core os restart-service nazar-heartbeat.service"
}
```

```json
{
  "type": "action",
  "confirm": "Stage OS upgrade? A reboot will be needed to apply.",
  "command": "nazar-core os upgrade"
}
```

```json
{
  "type": "action",
  "confirm": "Restart container nazar-signal-bridge?",
  "command": "nazar-core os restart-container nazar-signal-bridge"
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
4. **Monitor health**: after install, check `## Health Alerts` and `os containers`/`os services`
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
| User asks "is everything OK?" | `os services` + `os containers` |
| Missed heartbeat or stale data | `os services`, `os logs nazar-heartbeat.service` |
| Signal messages not arriving | `os logs nazar-signal.service` |
| User asks about OS version | `os status` |
| User asks about updates | `os upgrade-check` |
| After reboot | `os services` + `os containers` + `os timers` |
| Container in unhealthy state | `os logs <service>`, consider `os restart-container` |
| Service has failed | `os logs <service>`, consider `os restart-service` |
| Health alert: critical | Check logs, suggest restart with confirmation |
| Health alert: staged update | Remind user to schedule reboot |
| Pending evolution | Guide through install workflow |

## Interpreting Output

### Healthy state

- `os services`: all nazar-* units show `active running`
- `os containers`: all containers show `State: running`, `Health: healthy`
- `os timers`: timers show a future `NEXT` time
- `os status`: booted image matches desired image, no staged image pending

### Unhealthy signals

- Unit in `failed` state → check `os logs <service>` for the error, suggest restart
- Container in `exited` or `unhealthy` state → check logs, suggest restart or evolution rollback
- Staged image present → reboot is needed to apply the pending OS update
- No rollback available → extra caution before any OS changes

## Safety Rules

- **All mutation commands require user confirmation** via the `confirm` affordance field.
- Only nazar-* services and containers can be managed — other system services are intentionally restricted.
- **Never trigger `bootc upgrade` without explicit user confirmation.** An OS upgrade requires a reboot and should be scheduled by the user.
- **Never install or rollback evolutions without user confirmation.** Always dry-run first.
- Always check health after mutations — use `os services`, `os containers`, and health alerts to verify.

## Rollback Awareness

If `os status` shows rollback is available, it means the previous OS image is still accessible. A rollback reverts the entire OS image and requires a reboot. Only suggest rollback if:

1. The booted image is causing confirmed failures
2. The user has explicitly asked about rollback

In all other cases, report the rollback availability as informational only.
