/**
 * Value types — no behavior, no interfaces.
 * All port interfaces live in ./ports/.
 *
 * This file is the canonical schema definition for nazar.yaml and all
 * supporting value types used across the codebase. Adding a new top-level
 * config block = add a field to NazarConfig here.
 */

export type { IncomingMessage } from "./ports/message-channel.js";
// Re-export value types from ports that are also used as standalone types
export type { ObjectData, ObjectRef } from "./ports/object-store.js";

/**
 * Configuration for agent integration.
 *
 * These fields map to the `agent:` block in nazar.yaml plus env-var overrides
 * applied by bridge-bootstrap.ts (loadBaseBridgeConfig). They configure the
 * Pi agent process that handles AI conversations.
 *
 * Field notes:
 *   agentCommand  — the CLI binary to invoke (typically "pi")
 *   agentDir      — Pi agent config directory (contains auth.json)
 *   repoRoot      — base directory for Nazar data (objects, sessions)
 *   objectsDir    — where flat-file objects are stored (PARA structure)
 *   skillsDir     — Pi skill SKILL.md files injected into agent prompts
 *   timeoutMs     — max ms to wait for an agent response before aborting
 *   transport     — Pi SDK transport: "sse" | "websocket" | "auto"
 *   sessionsDir   — persistent conversation history per contact
 */
export interface AgentConfig {
  agentCommand: string;
  agentDir: string;
  repoRoot: string;
  objectsDir: string;
  skillsDir: string;
  timeoutMs: number;
  model?: string;
  transport?: "sse" | "websocket" | "auto";
  sessionsDir?: string;
}

/**
 * Nazar system configuration (nazar.yaml schema).
 *
 * This is the top-level config type parsed from nazar.yaml by IConfigReader.
 * All fields except `hostname` and `primary_user` are optional — capabilities
 * check for their section's presence before activating.
 *
 * @example
 * ```yaml
 * # nazar.yaml
 * hostname: nazar-pi
 * primary_user: alex
 * timezone: Europe/Berlin
 * bridges:
 *   whatsapp:
 *     allowed_contacts: ["+4917699999999"]
 * agent:
 *   skills_dir: /usr/local/share/nazar/skills
 *   persona_dir: /usr/local/share/nazar/persona
 * evolution:
 *   max_containers_per_evolution: 3
 * ```
 *
 * For the YAML file that generates Quadlet files from this config,
 * see os/sysconfig/nazar.yaml.example.
 * For config reading implementation, see capabilities/config/yaml-config-reader.ts.
 */
export interface NazarConfig {
  hostname: string;
  primary_user: string;
  timezone?: string;
  heartbeat?: { interval?: string };
  agent?: { skills_dir?: string; persona_dir?: string };
  evolution?: { max_containers_per_evolution?: number };
  firewall?: { restrict_to_tailscale?: boolean; open_ports?: number[] };
  bridges?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

/** A generated file (path + content), returned by setup/evolve before writing. */
export interface GeneratedFile {
  path: string;
  content: string;
}

/**
 * Container spec from an evolution object's frontmatter.
 *
 * Maps directly to a Podman Quadlet `.container` unit file.
 * The optional `pod` field emits `Pod=<value>` in the `[Container]` section,
 * placing this container in a shared network namespace with other pod members.
 *
 * For the Quadlet generation logic, see capabilities/setup/quadlet-generator.ts.
 */
export interface ContainerSpec {
  name: string;
  image: string;
  description?: string;
  volumes?: string[];
  environment?: Record<string, string>;
  pod?: string;
  after?: string;
  publishPorts?: string[];
  readOnly?: boolean;
  noNewPrivileges?: boolean;
  serviceType?: string;
  restart?: string;
  wantedBy?: string;
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
