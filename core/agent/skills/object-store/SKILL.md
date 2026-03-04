---
name: object-store
description: Create, read, update, search, and link objects in the Bloom flat-file store
---

# Object Store Skill

Use this skill when the user wants to create, read, update, search, or link any type of object in the Bloom store. For evolution pipeline tracking, see `object-evolution`.

## Object Model

Every object is a Markdown file with YAML frontmatter stored at:

```
/var/lib/pibloom/objects/<type>/<slug>.md
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
| `evolution` | System configuration changes (pibloom evolve) |
| *(custom)* | Any type the user or agent defines |

## PARA Methodology

Organize objects by PARA category using frontmatter:

- `project`: active project (e.g. `home-renovation`, `work-q1`)
- `area`: ongoing responsibility (e.g. `household`, `career`, `health`, `finance`)
- `resource`: reference topic (e.g. `cooking`, `programming`)
- `archive`: completed or inactive (set `status: archived`)

## Commands

All commands are run as `pibloom-core object <subcommand>`.

### Create an object

```bash
pibloom-core object create <type> <slug> [--field=value ...]
```

Examples:

```bash
# Create a task
pibloom-core object create task fix-bike-tire --title="Fix bike tire" --status=active --priority=high --area=household

# Create a note
pibloom-core object create note sourdough-recipe --title="Sourdough Recipe" --area=resource --tags=cooking,bread

# Create a custom type
pibloom-core object create person alice --title="Alice Smith" --email=alice@example.com
```

### Read an object

```bash
pibloom-core object read <type> <slug>
```

Example:

```bash
pibloom-core object read task fix-bike-tire
```

Prints YAML frontmatter followed by the Markdown body.

### List objects

```bash
pibloom-core object list [type] [--field=value ...]
```

Examples:

```bash
# List all objects across all types
pibloom-core object list

# List all tasks
pibloom-core object list task

# List active tasks in the household area
pibloom-core object list task --status=active --area=household

# List notes tagged "cooking"
pibloom-core object list note --tags=cooking
```

### Update frontmatter fields

```bash
pibloom-core object update <type> <slug> --field=value [--field=value ...]
```

Examples:

```bash
# Complete a task
pibloom-core object update task fix-bike-tire --status=done

# Add a due date
pibloom-core object update task fix-bike-tire --due=2026-03-10

# Change priority
pibloom-core object update task fix-bike-tire --priority=low
```

### Search across all objects

```bash
pibloom-core object search <pattern>
```

Examples:

```bash
# Find any object mentioning "gratitude"
pibloom-core object search gratitude

# Find objects containing a phone number
pibloom-core object search "+49"
```

Returns a list of `type/slug` references for matching objects.

### Link two objects

```bash
pibloom-core object link <type/slug> <type/slug>
```

Example:

```bash
# Link a task to a person
pibloom-core object link task/fix-bike-tire person/alice

# Link a journal entry to a task
pibloom-core object link journal/2026-03-03 task/fix-bike-tire
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
