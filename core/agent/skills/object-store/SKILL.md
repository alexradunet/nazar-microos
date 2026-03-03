---
name: object-store
description: Create, read, update, search, and link objects in the Nazar flat-file store
---

# Object Store Skill

Use this skill when the user wants to create, read, update, search, or link any type of object in the Nazar store. This is the general-purpose object management skill — for domain-specific behavior see `object-task`, `object-journal`, `object-note`, and `object-evolution`.

## Object Model

Every object is a Markdown file with YAML frontmatter stored at:

```
/var/lib/nazar/objects/<type>/<slug>.md
```

### Core frontmatter fields (all types)

- `type`: object type (automatic, e.g. `task`, `journal`, `note`, `evolution`)
- `slug`: kebab-case unique identifier within the type
- `title`: human-readable name
- `created`: ISO timestamp (set automatically on create)
- `modified`: ISO timestamp (updated automatically on update)
- `tags`: comma-separated labels
- `links`: references to related objects in `type/slug` format

### Object types

| Type | Purpose |
|------|---------|
| `journal` | Daily entries, reflections, logs |
| `task` | Actionable items with status and priority |
| `note` | Reference notes, permanent records |
| `evolution` | System configuration changes (nazar evolve) |
| *(custom)* | Any type the user or agent defines |

## PARA Methodology

Organize objects by PARA category using frontmatter:

- `project`: active project (e.g. `home-renovation`, `work-q1`)
- `area`: ongoing responsibility (e.g. `household`, `career`, `health`, `finance`)
- `resource`: reference topic (e.g. `cooking`, `programming`)
- `archive`: completed or inactive (set `status: archived`)

## Commands

All commands are run as `nazar-core object <subcommand>`.

### Create an object

```bash
nazar-core object create <type> <slug> [--field=value ...]
```

Examples:

```bash
# Create a task
nazar-core object create task fix-bike-tire --title="Fix bike tire" --status=active --priority=high --area=household

# Create a note
nazar-core object create note sourdough-recipe --title="Sourdough Recipe" --area=resource --tags=cooking,bread

# Create a custom type
nazar-core object create person alice --title="Alice Smith" --email=alice@example.com
```

### Read an object

```bash
nazar-core object read <type> <slug>
```

Example:

```bash
nazar-core object read task fix-bike-tire
```

Prints YAML frontmatter followed by the Markdown body.

### List objects

```bash
nazar-core object list [type] [--field=value ...]
```

Examples:

```bash
# List all objects across all types
nazar-core object list

# List all tasks
nazar-core object list task

# List active tasks in the household area
nazar-core object list task --status=active --area=household

# List notes tagged "cooking"
nazar-core object list note --tags=cooking
```

### Update frontmatter fields

```bash
nazar-core object update <type> <slug> --field=value [--field=value ...]
```

Examples:

```bash
# Complete a task
nazar-core object update task fix-bike-tire --status=done

# Add a due date
nazar-core object update task fix-bike-tire --due=2026-03-10

# Change priority
nazar-core object update task fix-bike-tire --priority=low
```

### Search across all objects

```bash
nazar-core object search <pattern>
```

Examples:

```bash
# Find any object mentioning "gratitude"
nazar-core object search gratitude

# Find objects containing a phone number
nazar-core object search "+49"
```

Returns a list of `type/slug` references for matching objects.

### Link two objects

```bash
nazar-core object link <type/slug> <type/slug>
```

Example:

```bash
# Link a task to a person
nazar-core object link task/fix-bike-tire person/alice

# Link a journal entry to a task
nazar-core object link journal/2026-03-03 task/fix-bike-tire
```

Links are bidirectional — both objects gain a reference to the other in their `links` field.

## When to Use Each Operation

| Operation | When |
|-----------|------|
| `create` | User mentions something new to track, note, or record |
| `read` | User asks about a specific item by name |
| `list` | User asks to see all items of a type, or wants to filter |
| `update` | User wants to change a field (status, priority, due date) |
| `search` | User remembers content but not the exact object |
| `link` | Two objects are related and should be navigable from each other |

## Behavior Guidelines

- When creating objects, always set `title` to a human-readable name.
- Suggest PARA fields (`project` or `area`) when the user has not provided them.
- Prefer `update` over `create` when an object for that type/slug already exists.
- After `search`, offer to `read` one of the matched objects if the user seems to want details.
- Use `link` proactively when the user mentions a connection between two things already in the store.
