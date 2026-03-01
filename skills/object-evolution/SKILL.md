---
name: object-evolution
description: Manage evolution objects — track pipeline state for Nazar self-evolution from proposal through apply.
---

# Evolution Object Skill

Use this skill when creating, tracking, or transitioning evolution pipeline items.

## Object Schema

Evolution objects use frontmatter fields:

- `type: evolution` (automatic)
- `slug`: kebab-case identifier (e.g. `add-health-tracking`)
- `title`: human-readable evolution name
- `status`: pipeline state (default: proposed)
- `agent`: current owner — `hermes` | `athena` | `hephaestus` | `themis` | `human`
- `risk`: `low` | `medium` | `high`
- `area`: affected area (e.g. system, persona, objects, infra, skills, host-packages)
- `host_packages`: YAML list of system packages to install (for `area: host-packages` only)
- `tags`: comma-separated tags
- `links`: references to related objects (type/slug)

## Status Values and Transitions

Valid statuses:
`proposed` | `planning` | `implementing` | `reviewing` | `conformance` | `approved` | `applied` | `rejected` | `stalled`

Valid transitions (including rework loop):

```
proposed -> planning -> implementing -> reviewing -> conformance -> approved -> applied
                        ^                |
                        |--- rework -----+
Any -> rejected | stalled
```

- `proposed`: Hermes created the request, awaiting Athena.
- `planning`: Athena is designing the implementation plan.
- `implementing`: Hephaestus is building with TDD.
- `reviewing`: Themis is performing independent review.
- `conformance`: Athena is checking final conformance against plan.
- `approved`: Human approved, ready to apply.
- `applied`: Changes applied via `nazar apply` or `nazar evolve install`.
- `rejected`: Human or agent rejected the evolution (or auto-rollback on verification failure).
- `stalled`: No progress for >24h, needs human attention.

## Commands

### Create an evolution

```bash
nazar-object create evolution "add-health-tracking" \
  --title="Add health tracking object type" \
  --status=proposed --agent=hermes --risk=low --area=objects
```

### Read an evolution

```bash
nazar-object read evolution "add-health-tracking"
```

### Update status and agent

```bash
nazar-object update evolution "add-health-tracking" --status=planning --agent=athena
```

### List evolutions by status

```bash
nazar-object list evolution --status=proposed
nazar-object list evolution --status=implementing
```

### List active evolutions (not terminal)

```bash
nazar-object list evolution | grep -v -E 'status: (applied|rejected)'
```

### Link evolution to related objects

```bash
nazar-object link evolution/add-health-tracking task/research-health-apis
```

## Behavior Guidelines

- Every core/system change should have an evolution object tracking it.
- Update `status` and `agent` together when transitioning pipeline stages.
- On rework: set status back to `implementing`, agent to `hephaestus`.
- Append rework notes to the object body (below frontmatter) with timestamps.
- Terminal statuses (`applied`, `rejected`) should not transition further.
- During heartbeat, flag evolutions with `status` not in a terminal state and modification time >24h as `stalled`.

## Host Package Evolution

When `area: host-packages`, the evolution object includes a `host_packages` list of system packages to install on MicroOS.

### Creating a host-package evolution

```bash
nazar-object create evolution "add-whisper-stt" \
  --title="Install whisper-cpp for speech-to-text" \
  --status=proposed --agent=hermes --risk=medium \
  --area=host-packages --host_packages="whisper-cpp"
```

For multiple packages, use a YAML list in the body or update via:

```bash
nazar-object update evolution "add-whisper-stt" --host_packages="whisper-cpp,libwhisper"
```

### Installation flow

1. Pipeline reaches `approved` status with human approval.
2. User runs: `nazar evolve install <slug>`
3. Script reads `host_packages`, shows interactive confirmation, installs via `transactional-update`.
4. Pending state written to `/var/lib/nazar/evolution/pending.yaml`, system reboots.
5. `nazar-evolve-resume.service` runs on boot, verifies packages, marks `applied` or triggers rollback.

### Safety

- Maximum packages per evolution: configurable in `nazar.yaml` (`evolution.max_packages_per_evolution`, default 5).
- Interactive approval at install time (y/N prompt).
- Automatic rollback via `snapper` if post-reboot verification fails.
- Restricted sudo: `nazar-agent` can only run `transactional-update pkg install`, `snapper rollback`, and `reboot`.
