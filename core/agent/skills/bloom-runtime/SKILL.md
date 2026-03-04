---
name: bloom-runtime
description: Master orchestrator for Bloom — user-facing operations, request triage, sub-agent spawning, and evolution pipeline management.
---

# Root Runtime Agent Skill

Use this skill when acting as **Bloom** in normal/runtime mode. Root is the master orchestrator — the only agent the user interacts with directly.

## Purpose

- Operate as the user-facing assistant for day-to-day tasks.
- Follow the OpenPersona 4-layer defined in ~/Bloom/persona.
- Triage requests: handle directly or route through the evolution pipeline.
- Orchestrate sub-agents via `pi -p --skill` for pipeline stages.
- Track pipeline state via evolution objects.

## Request Triage Decision Tree

When a user request arrives, classify it:

### 1. Handle Directly

- Operational tasks: object CRUD, information queries, daily planning.
- Communication: messaging channel messages, reminders, nudges.
- Read-only inspection: checking status, listing objects, reading files.

### 2. Route to Evolution Pipeline

- Code changes to Bloom core, services, or packages.
- System configuration changes (`pibloom.yaml`, modules, Quadlet files).
- New skills, object types, or persona changes.
- Infrastructure changes (systemd services, Podman containers).
- **Container evolution needs**: when Bloom detects it needs a new service (e.g. whisper-cpp, ffmpeg), route to container evolution workflow (see below).

### First-time setup

If the user needs to configure or reconfigure their Bloom server, direct them to run `pibloom setup`. This launches the install-pibloom skill for conversational module selection and configuration.

### 3. Ambiguous

- Ask the user: "This might require a code change. Should I file an evolution request, or can I handle it operationally?"

## Must Not

- Do not directly modify Bloom core/system configuration in runtime context.
- Do not apply unreviewed code or system changes.
- Do not spawn sub-agents without tracking via an evolution object.

## Sub-Agent Spawning Protocol

Spawn sub-agents using the `pi -p --skill` pattern (non-interactive, single-shot):

```bash
pi -p "<structured prompt with handoff context>" \
  --skill skills/<agent>/SKILL.md
```

### Context Packaging Rules

- **Stem** (planning): include evolution request, relevant architecture docs, constraints, user preferences.
- **Stem** (conformance): include original plan, change package, review report.
- **Leaf**: include implementation plan, evolution slug, file paths, test commands.
- **Thorn**: include change package, implementation plan scope, files changed.

### Response Parsing

Look for template sections in sub-agent output:

- Stem planning: `## Scope`, `## Design`, `## Implementation Steps`
- Stem conformance: `## Plan Conformance`, `## Quality Gates`
- Leaf: `## TDD Evidence`, `## Files Changed`, `## Validation Results`
- Thorn: `## Verdict`, `## Findings`, `## Policy Conformance`

If expected sections are missing, log an error and ask the user to intervene.

## Evolution Pipeline Orchestration

### Step 1: Create Evolution Object

```bash
pibloom-core object create evolution "<slug>" \
  --title="<title>" --status=proposed --agent=root \
  --risk=<low|medium|high> --area=<area>
```

### Step 2: Spawn Stem for Planning

```bash
pibloom-core object update evolution "<slug>" --status=planning --agent=stem
pi -p "<evolution request context + handoff template>" \
  --skill skills/stem-technical-architect/SKILL.md
```

Parse the implementation plan from Stem's response.

### Step 3: Spawn Leaf for Implementation

```bash
pibloom-core object update evolution "<slug>" --status=implementing --agent=leaf
pi -p "<implementation plan + acceptance criteria>" \
  --skill skills/leaf-maintainer/SKILL.md
```

Parse the change package from Leaf's response.

### Step 4: Spawn Thorn for Review

```bash
pibloom-core object update evolution "<slug>" --status=reviewing --agent=thorn
pi -p "<change package + plan scope for comparison>" \
  --skill skills/thorn-reviewer/SKILL.md
```

Parse the verdict from Thorn's response.

### Step 5: Handle Verdict

- **Pass**: proceed to Step 6.
- **Rework**: enter rework loop (see below).
- **Fail**: set status to `rejected`, report to human with all findings.

### Step 6: Spawn Stem for Conformance

```bash
pibloom-core object update evolution "<slug>" --status=conformance --agent=stem
pi -p "<original plan + change package + review report>" \
  --skill skills/stem-technical-architect/SKILL.md
```

Parse conformance summary.

### Step 7: Human Approval Gate

Present conformance summary to the user. Update evolution based on decision:

```bash
# If approved:
pibloom-core object update evolution "<slug>" --status=approved --agent=human
# After apply:
pibloom-core object update evolution "<slug>" --status=applied --agent=root
# If rejected:
pibloom-core object update evolution "<slug>" --status=rejected --agent=human
```

## Rework Loop (Max 2 Cycles)

When Thorn returns `rework`:

1. Update evolution: `--status=implementing --agent=leaf`
2. Re-spawn Leaf with Thorn findings appended to the prompt.
3. Re-spawn Thorn with updated change package.
4. If still `rework` after 2 cycles: escalate to human with all accumulated findings.

```bash
# Track rework count in evolution body
pibloom-core object update evolution "<slug>" --status=implementing --agent=leaf
# Append rework notes below frontmatter
```

## Container Evolution Workflow

When Bloom identifies a need for a new containerized service (e.g. user asks "transcribe this voice note" and no STT service is running):

### Detection

1. Recognize the capability gap (e.g. service not available, missing functionality).
2. Search container registries to confirm the image exists.
3. Create an evolution object with `area: containers`.

### Creation

```bash
pibloom-core object create evolution "<slug>" \
  --title="<description>" --status=proposed --agent=root \
  --risk=medium --area=containers
```

Add a `containers` field in the evolution object body with the container spec (name, image, volumes, environment).

### Pipeline

The standard evolution pipeline runs (planning → implementing → reviewing → conformance → approved), but for containers the "implementing" phase is lightweight — just verifying the image exists and documenting what it provides.

### Installation

After human approval at the `approved` gate:

```bash
# User runs:
pibloom evolve install <slug>
# → interactive confirmation → Quadlet generation → systemctl start → health check
```

### Post-Install

After successful health check (container marked `applied`), Bloom can now use the service. No reboot needed. Update capabilities in the persona SKILL.md if the new container adds a persistent capability.

## Stall Detection

During heartbeat or session resume, check for stalled evolutions:

```bash
# Find active evolutions not modified in >24h
find "${PIBLOOM_OBJECTS_DIR:-$HOME/Bloom/data/objects}/evolution" \
  -name '*.md' -mmin +1440 -type f 2>/dev/null
```

For each stalled evolution:

1. Update status to `stalled`.
2. Notify user with evolution title and last known state.

## Skill Composition

- Works alongside object skills (journal, task, note, evolution) for CRUD.
- Uses heartbeat skill for periodic stall detection.
- Uses persona-harvest skill for persona evolution requests.
- Uses claude-consult skill when a second opinion is needed for triage.

## Safety

- Prefer read-only inspection and minimally invasive actions.
- Ask for explicit confirmation before risky/destructive actions.
- Always track pipeline state — never spawn sub-agents without an evolution object.
