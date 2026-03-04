#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { YamlConfigReader } from "./capabilities/config/yaml-config-reader.js";
import {
  parseBridgeManifest,
  validateBridgeManifest,
} from "./capabilities/discovery/bridge-manifest.js";
import { EvolveManager } from "./capabilities/evolution/evolve-manager.js";
import { JsYamlFrontmatterParser } from "./capabilities/frontmatter/js-yaml-parser.js";
import { MarkdownFileStore as ObjectStore } from "./capabilities/object-store/markdown-file-store.js";
import { QuadletSetupGenerator } from "./capabilities/setup/quadlet-generator.js";
import { NodeSystemExecutor } from "./capabilities/system-executor/node-executor.js";
import type { PibloomConfig } from "./types.js";

const _configReader = new YamlConfigReader();
const readConfig = _configReader.read.bind(_configReader);

const _setupGenerator = new QuadletSetupGenerator();
function generateQuadletFiles(config: PibloomConfig, outputDir: string) {
  return _setupGenerator.generate(config, outputDir);
}

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

function printRefs(
  refs: { type: string; slug: string; title?: string }[],
): void {
  for (const ref of refs) {
    if (ref.title) {
      console.log(`${ref.type}/${ref.slug}  ${ref.title}`);
    } else {
      console.log(`${ref.type}/${ref.slug}`);
    }
  }
}

// --- Env defaults ---

const PIBLOOM_CONFIG =
  process.env.PIBLOOM_CONFIG ?? "/etc/pibloom/pibloom.yaml";
const PIBLOOM_OBJECTS_DIR =
  process.env.PIBLOOM_OBJECTS_DIR ?? "/var/lib/pibloom/objects";
const SYSTEMD_UNIT_DIR = process.env.SYSTEMD_UNIT_DIR ?? "/etc/systemd/system";
const QUADLET_OUTPUT_DIR =
  process.env.QUADLET_OUTPUT_DIR ?? "/etc/containers/systemd";

// --- Object subcommands ---

function objectCmd(parsed: ParsedArgs): void {
  const objectsDir = parsed.flags["objects-dir"] ?? PIBLOOM_OBJECTS_DIR;
  const store = new ObjectStore(objectsDir);

  switch (parsed.subcommand) {
    case "create": {
      const type = parsed.positional[0];
      const slug = parsed.positional[1];
      if (!type || !slug) {
        die(
          "usage: pibloom-core object create <type> <slug> [--field=value ...]",
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
        die("usage: pibloom-core object read <type> <slug>");
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
          "usage: pibloom-core object list <type> [--status=X ...] or pibloom-core object list --all",
        );
      }
      const filters: Record<string, string> = {};
      for (const key of ["status", "project", "area", "tag"]) {
        if (parsed.flags[key]) filters[key] = parsed.flags[key];
      }
      const refs = store.list(type, filters);
      printRefs(refs);
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
        die(
          "usage: pibloom-core object update <type> <slug> --field=value ...",
        );
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
        die("usage: pibloom-core object search <pattern>");
      }
      const refs = store.search(pattern);
      printRefs(refs);
      break;
    }
    case "link": {
      const refA = parsed.positional[0];
      const refB = parsed.positional[1];
      if (!refA || !refB) {
        die("usage: pibloom-core object link <type/slug> <type/slug>");
      }
      const result = store.link(refA, refB);
      console.log(result);
      break;
    }
    default:
      die(
        "usage: pibloom-core object <create|read|list|update|search|link> ...",
      );
  }
}

// --- Setup subcommand ---

function setupCmd(parsed: ParsedArgs): void {
  const configPath = parsed.flags.config ?? PIBLOOM_CONFIG;
  const outputDir = parsed.flags["output-dir"] ?? SYSTEMD_UNIT_DIR;
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
  const configPath = parsed.flags.config ?? PIBLOOM_CONFIG;
  const objectsDir = parsed.flags["objects-dir"] ?? PIBLOOM_OBJECTS_DIR;
  const quadletDir = parsed.flags["quadlet-dir"] ?? QUADLET_OUTPUT_DIR;
  const dryRun = parsed.boolFlags.has("dry-run");

  const store = new ObjectStore(objectsDir);
  const executor = new NodeSystemExecutor();
  const manager = new EvolveManager(store, executor, configPath, quadletDir);

  switch (parsed.subcommand) {
    case "install": {
      const slug = parsed.positional[0];
      if (!slug) die("usage: pibloom-core evolve install <slug>");
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
      if (!slug) die("usage: pibloom-core evolve rollback <slug>");
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
      die("usage: pibloom-core evolve <install|rollback|status> [args]");
  }
}

// --- Bridge subcommand ---

const MANIFESTS_DIR =
  process.env.PIBLOOM_MANIFESTS_DIR ?? "/usr/local/share/pibloom/manifests";

async function bridgeCmd(parsed: ParsedArgs): Promise<void> {
  const configPath = parsed.flags.config ?? PIBLOOM_CONFIG;
  const quadletDir = parsed.flags["quadlet-dir"] ?? QUADLET_OUTPUT_DIR;
  const objectsDir = parsed.flags["objects-dir"] ?? PIBLOOM_OBJECTS_DIR;
  const dryRun = parsed.boolFlags.has("dry-run");

  switch (parsed.subcommand) {
    case "install": {
      const manifestPath = parsed.positional[0];
      if (!manifestPath) {
        die(
          "usage: pibloom-core bridge install <manifest-path> [--dry-run] [--config=path]",
        );
      }

      // Read and parse manifest
      let raw: string;
      try {
        raw = fs.readFileSync(manifestPath, "utf-8");
      } catch {
        die(`cannot read manifest: ${manifestPath}`);
      }

      const manifest = parseBridgeManifest(raw);
      const errors = validateBridgeManifest(manifest);
      if (errors.length > 0) {
        die(`invalid bridge manifest:\n  ${errors.join("\n  ")}`);
      }

      // Read bridge config from pibloom.yaml
      let bridgeConfig: Record<string, unknown> = {};
      try {
        const config = readConfig(configPath);
        const bridges = config.bridges as
          | Record<string, Record<string, unknown>>
          | undefined;
        if (bridges?.[manifest.metadata.name]) {
          bridgeConfig = bridges[manifest.metadata.name];
        }
      } catch {
        // Config not available — templates will remain unresolved
      }

      const store = new ObjectStore(objectsDir);
      const executor = new NodeSystemExecutor();
      const manager = new EvolveManager(
        store,
        executor,
        configPath,
        quadletDir,
      );

      const result = await manager.installBridge(manifest, {
        dryRun,
        bridgeConfig,
      });
      console.log(result);
      break;
    }
    case "list": {
      // Scan manifests directory and installed bridge containers
      const dirs = listReferenceBridges();
      if (dirs.length === 0) {
        console.log("No reference bridges found.");
      } else {
        console.log("Available bridges:");
        for (const d of dirs) {
          const mPath = path.join(MANIFESTS_DIR, d, "manifest.yaml");
          try {
            const raw = fs.readFileSync(mPath, "utf-8");
            const m = parseBridgeManifest(raw);
            console.log(
              `  ${m.metadata.name}  ${m.metadata.description} (v${m.metadata.version})`,
            );
          } catch {
            console.log(`  ${d}  (manifest unreadable)`);
          }
        }
      }

      // Show installed bridge containers
      const installed = listInstalledBridges();
      if (installed.length > 0) {
        console.log("\nInstalled bridge containers:");
        for (const name of installed) {
          console.log(`  ${name}`);
        }
      }
      break;
    }
    case "remove": {
      const bridgeName = parsed.positional[0];
      if (!bridgeName) {
        die("usage: pibloom-core bridge remove <bridge-name>");
      }

      // Find the manifest to know which files to remove
      const mPath = path.join(MANIFESTS_DIR, bridgeName, "manifest.yaml");
      let raw: string;
      try {
        raw = fs.readFileSync(mPath, "utf-8");
      } catch {
        die(`cannot find manifest for bridge '${bridgeName}' at ${mPath}`);
      }

      const manifest = parseBridgeManifest(raw);
      const executor = new NodeSystemExecutor();

      // Stop and remove containers
      for (const c of manifest.containers) {
        if (!dryRun) {
          await executor.exec("sudo", [
            "systemctl",
            "stop",
            `${c.name}.service`,
          ]);
          const containerFile = path.join(quadletDir, `${c.name}.container`);
          try {
            fs.unlinkSync(containerFile);
          } catch {
            // already removed
          }
        }
        console.log(`Removed ${c.name}.container`);
      }

      // Remove pods
      if (manifest.pods) {
        for (const p of manifest.pods) {
          const podFile = path.join(quadletDir, `${p.name}.pod`);
          if (!dryRun) {
            try {
              fs.unlinkSync(podFile);
            } catch {
              // already removed
            }
          }
          console.log(`Removed ${p.name}.pod`);
        }
      }

      // Remove timers
      if (manifest.timers) {
        for (const t of manifest.timers) {
          if (!dryRun) {
            await executor.exec("sudo", [
              "systemctl",
              "stop",
              `${t.name}.timer`,
            ]);
            const timerFile = path.join(quadletDir, `${t.name}.timer`);
            try {
              fs.unlinkSync(timerFile);
            } catch {
              // already removed
            }
          }
          console.log(`Removed ${t.name}.timer`);
        }
      }

      if (!dryRun) {
        await executor.exec("sudo", ["systemctl", "daemon-reload"]);
      }

      console.log(
        `\nBridge '${bridgeName}' removed${dryRun ? " (dry-run)" : ""}`,
      );
      break;
    }
    default:
      die("usage: pibloom-core bridge <install|list|remove> ...");
  }
}

function listReferenceBridges(): string[] {
  try {
    return fs.readdirSync(MANIFESTS_DIR).filter((e) => {
      try {
        return fs.statSync(path.join(MANIFESTS_DIR, e)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

function listInstalledBridges(): string[] {
  const quadletDir = QUADLET_OUTPUT_DIR;
  try {
    return fs
      .readdirSync(quadletDir)
      .filter((f) => f.endsWith(".container") && f.includes("bridge"))
      .map((f) => f.replace(".container", ""));
  } catch {
    return [];
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
      case "bridge":
        await bridgeCmd(parsed);
        break;
      default:
        console.error(
          "Usage: pibloom-core <object|setup|evolve|bridge> [subcommand] [args]",
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
        console.error(
          "  bridge <install|list|remove>                   Bridge management",
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
