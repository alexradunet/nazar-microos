/**
 * Value types — no behavior, no interfaces.
 * All port interfaces live in ./ports/.
 */

export type { IncomingMessage } from "./ports/message-channel.js";
// Re-export value types from ports that are also used as standalone types
export type { ObjectData, ObjectRef } from "./ports/object-store.js";

/** Configuration for Pi agent integration. */
export interface AgentConfig {
  piCommand: string;
  piDir: string;
  repoRoot: string;
  objectsDir: string;
  skillsDir: string;
  timeoutMs: number;
  piModel?: string;
  piTransport?: "sse" | "websocket" | "auto";
}

/** Nazar system configuration (nazar.yaml schema). */
export interface NazarConfig {
  hostname: string;
  primary_user: string;
  timezone?: string;
  heartbeat?: { interval?: string };
  ttyd?: { port?: number };
  signal?: { phone_number?: string; allowed_contacts?: string[] };
  whatsapp?: { allowed_contacts?: string[] };
  ui?: { port?: number };
  pi?: { skills_dir?: string; persona_dir?: string };
  evolution?: { max_containers_per_evolution?: number };
  firewall?: { restrict_to_tailscale?: boolean; open_ports?: number[] };
}

/** A generated file (path + content), returned by setup/evolve before writing. */
export interface GeneratedFile {
  path: string;
  content: string;
}

/** Container spec from an evolution object's frontmatter. */
export interface ContainerSpec {
  name: string;
  image: string;
  volumes?: string[];
  environment?: Record<string, string>;
  pod?: string;
}

/** Options for the setup generator. */
export interface SetupOptions {
  configPath?: string;
  outputDir?: string;
  dryRun?: boolean;
}

/** Options for evolution install/rollback. */
export interface EvolveOptions {
  slug: string;
  dryRun?: boolean;
  autoApprove?: boolean;
  healthCheckTimeout?: number;
}
