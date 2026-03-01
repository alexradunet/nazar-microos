---
name: object-note
description: Manage notes — create, search, and link knowledge objects with PARA methodology.
---

# Note Object Skill

Use this skill when the user wants to capture, organize, or retrieve knowledge and ideas.

## Object Schema

Note objects use frontmatter fields:

- `type: note` (automatic)
- `slug`: kebab-case identifier (e.g. `microos-gpu-passthrough`)
- `title`: human-readable note title
- `status`: `draft` | `published` | `archived` (default: published)
- `project`: PARA project if relevant
- `area`: PARA area (e.g. tech, health, finance, learning)
- `resource`: PARA resource category (e.g. nix-reference, cooking-recipes)
- `tags`: comma-separated tags
- `links`: references to related objects (type/slug)

## Commands

### Create a note

```bash
nazar-object create note "microos-gpu-passthrough" --title="MicroOS GPU Passthrough" --area=tech --tags=microos,gpu,virtualization
```

Then append body content by editing the file directly.

### Read a note

```bash
nazar-object read note microos-gpu-passthrough
```

### Search notes

```bash
nazar-object search "GPU passthrough"
```

### List notes by area

```bash
nazar-object list note --area=tech
```

### Link notes to other objects

```bash
nazar-object link note/microos-gpu-passthrough task/setup-vm
```

## Behavior Guidelines

- Notes are the PARA "Resources" — reference material and knowledge.
- When the user shares information worth remembering, suggest creating a note.
- Use the `resource` field for PARA resource categorization.
- Suggest linking notes to related tasks, journal entries, or other notes.
- For archiving outdated notes, update status to `archived` rather than deleting.
- When searching, prefer `nazar-object search` for full-text and `nazar-object list note --area=X` for categorical browsing.
