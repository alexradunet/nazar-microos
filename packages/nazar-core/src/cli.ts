#!/usr/bin/env node

import fs from "node:fs";
import { readConfig } from "./config.js";
import { EvolveManager } from "./evolve.js";
import { JsYamlFrontmatterParser } from "./frontmatter.js";
import { ObjectStore } from "./object-store.js";
import { generateQuadletFiles } from "./setup.js";
import { NodeSystemExecutor } from "./system-executor.js";

// --- Argument parsing ---

interface ParsedArgs {
  command: string;
  subcommand: string;
  positional: string[];
  flags: Record<string, string>;
  boolFlags: Set<string>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // skip node and script
  const command = args[0] ?? "";
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  const boolFlags = new Set<string>();

  // Parse everything after the command
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else {
        boolFlags.add(arg.slice(2));
      }
    } else {
      positional.push(arg);
    }
  }

  // First positional is the subcommand for object/evolve
  const subcommand = positional.shift() ?? "";

  return { command, subcommand, positional, flags, boolFlags };
}

// --- Env defaults ---

const NAZAR_CONFIG = process.env.NAZAR_CONFIG ?? "/etc/nazar/nazar.yaml";
const NAZAR_OBJECTS_DIR =
  process.env.NAZAR_OBJECTS_DIR ?? "/var/lib/nazar/objects";
const QUADLET_OUTPUT_DIR =
  process.env.QUADLET_OUTPUT_DIR ?? "/etc/containers/systemd";

// --- Object subcommands ---

function objectCmd(parsed: ParsedArgs): void {
  const objectsDir = parsed.flags["objects-dir"] ?? NAZAR_OBJECTS_DIR;
  const store = new ObjectStore(objectsDir);

  switch (parsed.subcommand) {
    case "create": {
      const type = parsed.positional[0];
      const slug = parsed.positional[1];
      if (!type || !slug) {
        die(
          "usage: nazar-core object create <type> <slug> [--field=value ...]",
        );
      }
      const fields: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed.flags)) {
        if (k !== "objects-dir") fields[k] = v;
      }
      const result = store.create(type, slug, fields);
      console.log(result);
      break;
    }
    case "read": {
      const type = parsed.positional[0];
      const slug = parsed.positional[1];
      if (!type || !slug) {
        die("usage: nazar-core object read <type> <slug>");
      }
      const obj = store.read(type, slug);
      // Output the raw file content (matches bash behavior)
      const parser = new JsYamlFrontmatterParser();
      console.log(parser.stringify(obj.data, obj.content).trimEnd());
      break;
    }
    case "list": {
      let type: string | null = parsed.positional[0] ?? null;
      const listAll = parsed.boolFlags.has("all");
      if (listAll) type = null;
      if (!type && !listAll) {
        die(
          "usage: nazar-core object list <type> [--status=X ...] or nazar-core object list --all",
        );
      }
      const filters: Record<string, string> = {};
      for (const key of ["status", "project", "area", "tag"]) {
        if (parsed.flags[key]) filters[key] = parsed.flags[key];
      }
      const refs = store.list(type, filters);
      for (const ref of refs) {
        if (ref.title) {
          console.log(`${ref.type}/${ref.slug}  ${ref.title}`);
        } else {
          console.log(`${ref.type}/${ref.slug}`);
        }
      }
      break;
    }
    case "update": {
      const type = parsed.positional[0];
      const slug = parsed.positional[1];
      if (
        !type ||
        !slug ||
        Object.keys(parsed.flags).filter((k) => k !== "objects-dir").length ===
          0
      ) {
        die("usage: nazar-core object update <type> <slug> --field=value ...");
      }
      const fields: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed.flags)) {
        if (k !== "objects-dir") fields[k] = v;
      }
      store.update(type, slug, fields);
      break;
    }
    case "search": {
      const pattern = parsed.positional[0];
      if (!pattern) {
        die("usage: nazar-core object search <pattern>");
      }
      const refs = store.search(pattern);
      for (const ref of refs) {
        if (ref.title) {
          console.log(`${ref.type}/${ref.slug}  ${ref.title}`);
        } else {
          console.log(`${ref.type}/${ref.slug}`);
        }
      }
      break;
    }
    case "link": {
      const refA = parsed.positional[0];
      const refB = parsed.positional[1];
      if (!refA || !refB) {
        die("usage: nazar-core object link <type/slug> <type/slug>");
      }
      const result = store.link(refA, refB);
      console.log(result);
      break;
    }
    default:
      die("usage: nazar-core object <create|read|list|update|search|link> ...");
  }
}

// --- Setup subcommand ---

function setupCmd(parsed: ParsedArgs): void {
  const configPath = parsed.flags.config ?? NAZAR_CONFIG;
  const outputDir = parsed.flags["output-dir"] ?? QUADLET_OUTPUT_DIR;
  const dryRun = parsed.boolFlags.has("dry-run");

  const config = readConfig(configPath);
  const files = generateQuadletFiles(config, outputDir);

  if (dryRun) {
    for (const f of files) {
      console.log(`--- ${f.path} ---`);
      console.log(f.content);
    }
    console.log(
      `Generated ${files.length} Quadlet file(s) (dry-run mode — no files written)`,
    );
  } else {
    fs.mkdirSync(outputDir, { recursive: true });
    for (const f of files) {
      fs.writeFileSync(f.path, f.content);
    }
    console.log(`Generated ${files.length} Quadlet file(s) in ${outputDir}`);
  }
}

// --- Evolve subcommand ---

async function evolveCmd(parsed: ParsedArgs): Promise<void> {
  const configPath = parsed.flags.config ?? NAZAR_CONFIG;
  const objectsDir = parsed.flags["objects-dir"] ?? NAZAR_OBJECTS_DIR;
  const quadletDir = parsed.flags["quadlet-dir"] ?? QUADLET_OUTPUT_DIR;
  const dryRun = parsed.boolFlags.has("dry-run");

  const store = new ObjectStore(objectsDir);
  const executor = new NodeSystemExecutor();
  const manager = new EvolveManager(store, executor, configPath, quadletDir);

  switch (parsed.subcommand) {
    case "install": {
      const slug = parsed.positional[0];
      if (!slug) die("usage: nazar-core evolve install <slug>");
      const result = await manager.install({
        slug,
        dryRun,
        autoApprove: true,
      });
      console.log(result);
      break;
    }
    case "rollback": {
      const slug = parsed.positional[0];
      if (!slug) die("usage: nazar-core evolve rollback <slug>");
      const result = await manager.rollback({ slug, dryRun });
      console.log(result);
      break;
    }
    case "status": {
      const slug = parsed.positional[0];
      const result = manager.status(slug);
      console.log(result);
      break;
    }
    default:
      die("usage: nazar-core evolve <install|rollback|status> [args]");
  }
}

// --- Helpers ---

function die(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

// --- Main ---

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  try {
    switch (parsed.command) {
      case "object":
        objectCmd(parsed);
        break;
      case "setup":
        setupCmd(parsed);
        break;
      case "evolve":
        await evolveCmd(parsed);
        break;
      default:
        console.error(
          "Usage: nazar-core <object|setup|evolve> [subcommand] [args]",
        );
        console.error("");
        console.error("Commands:");
        console.error(
          "  object <create|read|list|update|search|link>  Object store CRUD",
        );
        console.error(
          "  setup [--dry-run] [--config=] [--output-dir=]  Generate Quadlet files",
        );
        console.error(
          "  evolve <install|rollback|status>               Container evolution",
        );
        process.exit(1);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
}

main();
