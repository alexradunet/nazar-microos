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
- `area`: affected area (e.g. system, persona, objects, infra, skills, containers)
- `containers`: YAML list of containers to deploy (for `area: containers` only)
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

## Container Evolution

When `area: containers`, the evolution object includes a `containers` list of services to deploy via Podman Quadlet.

### Creating a container evolution

```bash
nazar-object create evolution "add-whisper-stt" \
  --title="Add Whisper C++ speech recognition" \
  --status=proposed --agent=hermes --risk=medium \
  --area=containers
```

The evolution object body should include a `containers` field in the frontmatter:

```yaml
containers:
  - name: nazar-whisper
    image: ghcr.io/example/whisper-cpp:latest
    volumes:
      - /var/lib/nazar/objects:/data/objects:ro
    environment:
      MODEL: base.en
```

### Installation flow

1. Pipeline reaches `approved` status with human approval.
2. User runs: `nazar evolve install <slug>`
3. Script reads `containers`, shows interactive confirmation, generates Quadlet `.container` files.
4. `systemctl daemon-reload` + `systemctl start` — no reboot needed.
5. Health check verifies container is running. If unhealthy, Quadlet files are removed automatically.

### Safety

- Maximum containers per evolution: configurable in `nazar.yaml` (`evolution.max_containers_per_evolution`, default 5).
- Interactive approval at install time (y/N prompt).
- Automatic rollback on health check failure (Quadlet files removed, daemon reloaded).
- Container names must start with `nazar-` (enforced by validation).
- Restricted sudo: `nazar-agent` can only run `systemctl daemon-reload/start/stop/restart/is-active nazar-*`.
