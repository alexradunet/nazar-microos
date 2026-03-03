import fs from "node:fs";
import path from "node:path";
import type {
  Capability,
  CapabilityConfig,
  CapabilityRegistration,
} from "../../capability.js";
import type { ExtensionFactory } from "../agent-session/extension.js";
import {
  type CapabilityManifest,
  parseManifest,
  validateManifest,
} from "./manifest.js";

export { CapabilityExtractor } from "./extractor.js";
export type { CapabilityManifest } from "./manifest.js";
export { parseManifest, validateManifest } from "./manifest.js";

const DEFAULT_CAPABILITIES_DIR = "/var/lib/nazar/capabilities";
const DEFAULT_SKILLS_DIR = "/var/lib/nazar/skills";

/**
 * Discovers capability manifests from host filesystem and aggregates
 * skill paths + provides context for the Pi agent.
 *
 * Scans capabilities/*.yaml for manifests, resolves skill directories
 * under skills/<name>/, and optionally injects "provides" context
 * into agent sessions via an extension factory.
 *
 * Falls back to scanning the skills directory for subdirectories
 * when no manifests are available (e.g. inside bridge containers
 * without capabilities/ mounted).
 */
export class DiscoveryCapability implements Capability {
  readonly name = "discovery";
  readonly description =
    "Discovers capability manifests and aggregates skill paths from host filesystem";

  private readonly capabilitiesDir: string;
  private readonly skillsDir: string;

  constructor(opts?: { capabilitiesDir?: string; skillsDir?: string }) {
    this.capabilitiesDir = opts?.capabilitiesDir ?? DEFAULT_CAPABILITIES_DIR;
    this.skillsDir = opts?.skillsDir ?? DEFAULT_SKILLS_DIR;
  }

  init(_config: CapabilityConfig): CapabilityRegistration {
    const manifests = this.scanManifests();
    let skillPaths: string[];

    if (manifests.length > 0) {
      skillPaths = this.resolveSkillPaths(manifests);
    } else {
      // Fallback: scan skills directory directly for subdirectories
      skillPaths = this.scanSkillsDir();
    }

    const provides = manifests.flatMap((m) => m.provides ?? []);
    const registration: CapabilityRegistration = {};

    if (skillPaths.length > 0) {
      registration.skillPaths = skillPaths;
    }

    if (provides.length > 0) {
      registration.extensionFactory = createProvidesExtension(provides);
    }

    return registration;
  }

  /** Scan capabilities directory for *.yaml manifests. */
  private scanManifests(): CapabilityManifest[] {
    const manifests: CapabilityManifest[] = [];

    let entries: string[];
    try {
      entries = fs.readdirSync(this.capabilitiesDir);
    } catch {
      return manifests;
    }

    for (const entry of entries) {
      if (!entry.endsWith(".yaml")) continue;

      const filePath = path.join(this.capabilitiesDir, entry);
      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const manifest = parseManifest(raw);
        const errors = validateManifest(manifest);
        if (errors.length > 0) {
          console.warn(
            `Skipping invalid manifest ${entry}: ${errors.join(", ")}`,
          );
          continue;
        }
        manifests.push(manifest);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`Skipping unreadable manifest ${entry}: ${msg}`);
      }
    }

    return manifests;
  }

  /**
   * Resolve skill paths from manifests.
   * Each manifest's skills live under skillsDir/<metadata.name>/.
   */
  private resolveSkillPaths(manifests: CapabilityManifest[]): string[] {
    const paths: string[] = [];

    for (const manifest of manifests) {
      const base = path.join(this.skillsDir, manifest.metadata.name);
      try {
        if (fs.statSync(base).isDirectory()) {
          paths.push(base);
        }
      } catch {
        // Skills directory doesn't exist for this manifest
      }
    }

    return paths;
  }

  /** Fallback: scan skills dir for subdirectories when no manifests available. */
  private scanSkillsDir(): string[] {
    const paths: string[] = [];

    let entries: string[];
    try {
      entries = fs.readdirSync(this.skillsDir);
    } catch {
      return paths;
    }

    for (const entry of entries) {
      const full = path.join(this.skillsDir, entry);
      try {
        if (fs.statSync(full).isDirectory()) {
          paths.push(full);
        }
      } catch {
        // skip non-stat-able entries
      }
    }

    return paths;
  }
}

/** Create an extension factory that injects provides context into agent sessions. */
function createProvidesExtension(
  provides: Array<{ name: string; description: string }>,
): ExtensionFactory {
  return {
    create() {
      return {
        name: "discovery-provides",
        on(event: { type: string }) {
          if (event.type === "context") {
            const lines = provides.map((p) => `- ${p.name}: ${p.description}`);
            return {
              messages: [
                {
                  role: "user" as const,
                  content: `## Available Services\n${lines.join("\n")}`,
                },
              ],
            };
          }
          return undefined;
        },
      };
    },
  };
}
