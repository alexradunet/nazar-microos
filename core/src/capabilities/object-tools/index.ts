/**
 * ObjectToolsCapability — exposes IObjectStore CRUD as CLI commands.
 *
 * Provides typed CLI subcommands so the Pi agent (and users) can manage
 * objects without constructing raw filesystem operations.
 *
 * Does NOT implement storage logic — delegates to IObjectStore.
 * For storage implementation, see capabilities/object-store/markdown-file-store.ts.
 * For the port interface, see ports/object-store.ts.
 */

import type {
  Capability,
  CapabilityConfig,
  CapabilityRegistration,
  CliCommand,
} from "../../capability.js";
import type { IObjectStore } from "../../ports/object-store.js";

export class ObjectToolsCapability implements Capability {
  readonly name = "object-tools";
  readonly description =
    "Object store CRUD operations as CLI commands for the agent";

  init(config: CapabilityConfig): CapabilityRegistration {
    // Reason: object-tools is a pure CLI adapter — it requires the objectStore
    // service to already be registered by ObjectStoreCapability (Phase 2+).
    if (!config.services.objectStore) {
      throw new Error(
        "ObjectToolsCapability requires objectStore service — ensure ObjectStoreCapability is registered first",
      );
    }

    const objectStore = config.services.objectStore;

    const cliCommands: CliCommand[] = [
      buildCreateCommand(objectStore),
      buildReadCommand(objectStore),
      buildListCommand(objectStore),
      buildUpdateCommand(objectStore),
      buildSearchCommand(objectStore),
      buildLinkCommand(objectStore),
    ];

    return { cliCommands };
  }
}

// ---------------------------------------------------------------------------
// Command builders
// Reason: each command is a named function so stack traces are readable and
// the init() body stays flat (no large inline object literals).
// ---------------------------------------------------------------------------

/**
 * `object create <type> <slug> [--field=value ...]`
 *
 * Example:
 *   object create task fix-bike-tire --title="Fix bike tire" --status=active
 */
function buildCreateCommand(objectStore: IObjectStore): CliCommand {
  return {
    name: "object create",
    description: "Create a new object with optional frontmatter fields",
    run(args, flags) {
      const [type, slug] = args;
      if (!type || !slug) {
        console.error("Usage: object create <type> <slug> [--field=value ...]");
        process.exit(1);
      }
      const result = objectStore.create(type, slug, flags);
      console.log(`Created: ${result}`);
    },
  };
}

/**
 * `object read <type> <slug>`
 *
 * Example:
 *   object read task fix-bike-tire
 */
function buildReadCommand(objectStore: IObjectStore): CliCommand {
  return {
    name: "object read",
    description: "Read an object and print its frontmatter and body",
    run(args) {
      const [type, slug] = args;
      if (!type || !slug) {
        console.error("Usage: object read <type> <slug>");
        process.exit(1);
      }
      const obj = objectStore.read(type, slug);

      // Print frontmatter as YAML key: value pairs, then body content.
      // Reason: avoids a yaml serialization dependency — simple enough for
      // scalar frontmatter values produced by MarkdownFileStore.
      const frontmatterLines = Object.entries(obj.data)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join("\n");
      console.log("---");
      console.log(frontmatterLines);
      console.log("---");
      if (obj.content.trim()) {
        console.log(obj.content);
      }
    },
  };
}

/**
 * `object list [type] [--field=value ...]`
 *
 * Examples:
 *   object list task --status=active
 *   object list          (all types, no filter)
 *   object list task --area=household
 */
function buildListCommand(objectStore: IObjectStore): CliCommand {
  return {
    name: "object list",
    description: "List objects, optionally filtered by type and field values",
    run(args, flags) {
      // Reason: type is optional — pass null to list across all types.
      const type = args[0] ?? null;
      const filters = Object.keys(flags).length > 0 ? flags : undefined;
      const refs = objectStore.list(type, filters);

      if (refs.length === 0) {
        console.log("(no objects found)");
        return;
      }

      // Print a simple table: type/slug  title
      for (const ref of refs) {
        const title = ref.title ? `  ${ref.title}` : "";
        console.log(`${ref.type}/${ref.slug}${title}`);
      }
    },
  };
}

/**
 * `object update <type> <slug> [--field=value ...]`
 *
 * Example:
 *   object update task fix-bike-tire --status=done
 */
function buildUpdateCommand(objectStore: IObjectStore): CliCommand {
  return {
    name: "object update",
    description: "Update frontmatter fields on an existing object",
    run(args, flags) {
      const [type, slug] = args;
      if (!type || !slug) {
        console.error("Usage: object update <type> <slug> [--field=value ...]");
        process.exit(1);
      }
      if (Object.keys(flags).length === 0) {
        console.error(
          "No fields to update — provide at least one --field=value",
        );
        process.exit(1);
      }
      objectStore.update(type, slug, flags);
      console.log(`Updated: ${type}/${slug}`);
    },
  };
}

/**
 * `object search <pattern>`
 *
 * Example:
 *   object search "gratitude"
 */
function buildSearchCommand(objectStore: IObjectStore): CliCommand {
  return {
    name: "object search",
    description: "Full-text search across all objects for a substring pattern",
    run(args) {
      const pattern = args[0];
      if (!pattern) {
        console.error("Usage: object search <pattern>");
        process.exit(1);
      }
      const refs = objectStore.search(pattern);
      if (refs.length === 0) {
        console.log("(no matches)");
        return;
      }
      for (const ref of refs) {
        const title = ref.title ? `  ${ref.title}` : "";
        console.log(`${ref.type}/${ref.slug}${title}`);
      }
    },
  };
}

/**
 * `object link <refA> <refB>`
 *
 * Example:
 *   object link task/fix-bike-tire person/alice
 */
function buildLinkCommand(objectStore: IObjectStore): CliCommand {
  return {
    name: "object link",
    description: "Create a bidirectional link between two objects",
    run(args) {
      const [refA, refB] = args;
      if (!refA || !refB) {
        console.error("Usage: object link <type/slug> <type/slug>");
        process.exit(1);
      }
      const result = objectStore.link(refA, refB);
      console.log(`Linked: ${result}`);
    },
  };
}
