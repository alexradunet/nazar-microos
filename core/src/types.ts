/**
 * Value types — no behavior, no interfaces.
 * All port interfaces live in ./ports/.
 *
 * This file is the canonical schema definition for pibloom.yaml and all
 * supporting value types used across the codebase. Adding a new top-level
 * config block = add a field to PibloomConfig here.
 */

// Re-export value types that originate in port files but are commonly needed
// by code that doesn't use the full port interface. Using `export type` ensures
// these are erased at runtime — no circular dependency risk.
export type { IncomingMessage } from "./ports/message-channel.js";
export type { ObjectData, ObjectRef } from "./ports/object-store.js";

/**
 * Configuration for agent integration.
 *
 * These fields map to the `agent:` block in pibloom.yaml plus env-var overrides
 * applied by bridge-bootstrap.ts (loadBaseBridgeConfig). They configure the
 * Pi agent process that handles AI conversations.
 *
 * Field notes:
 *   agentCommand  — the CLI binary to invoke (typically "pi")
 *   agentDir      — Pi agent config directory (contains auth.json)
 *   repoRoot      — base directory for piBloom data (objects, sessions)
 *   objectsDir    — where flat-file objects are stored (PARA structure)
 *   skillsDir     — Pi skill SKILL.md files injected into agent prompts
 *   timeoutMs     — max ms to wait for an agent response before aborting
 *   transport     — Pi SDK transport: "sse" | "websocket" | "auto"
 *   sessionsDir   — persistent conversation history per contact
 */
export interface AgentConfig {
  agentCommand: string; // CLI binary to spawn (e.g. "pi")
  agentDir: string; // Pi config dir containing auth.json
  repoRoot: string; // Base piBloom data dir (objects, sessions live under here)
  objectsDir: string; // Flat-file PARA store: /var/lib/pibloom/objects/
  skillsDir: string; // SKILL.md files injected into agent system prompt
  timeoutMs: number; // Abort agent call if no response within this many ms
  model?: string; // Override default LLM model
  transport?: "sse" | "websocket" | "auto"; // Pi SDK communication protocol
  sessionsDir?: string; // Per-contact conversation history (one dir per phone number)
}

/**
 * piBloom system configuration (pibloom.yaml schema).
 *
 * This is the top-level config type parsed from pibloom.yaml by IConfigReader.
 * All fields except `hostname` and `primary_user` are optional — capabilities
 * check for their section's presence before activating.
 *
 * @example
 * ```yaml
 * # pibloom.yaml
 * hostname: pibloom-pi
 * primary_user: alex
 * timezone: Europe/Berlin
 * bridges:
 *   whatsapp:
 *     allowed_contacts: ["+4917699999999"]
 * agent:
 *   skills_dir: /usr/local/share/pibloom/skills
 *   persona_dir: /usr/local/share/pibloom/persona
 * evolution:
 *   max_containers_per_evolution: 3
 * ```
 *
 * For the YAML file that generates Quadlet files from this config,
 * see os/sysconfig/pibloom.yaml.example.
 * For config reading implementation, see capabilities/config/yaml-config-reader.ts.
 */
export interface PibloomConfig {
  hostname: string; // Machine hostname, used in Quadlet unit descriptions
  primary_user: string; // OS user that owns piBloom data dirs
  timezone?: string; // IANA timezone (e.g. "Europe/Berlin")
  heartbeat?: { interval?: string }; // Core health-check container config
  agent?: { skills_dir?: string; persona_dir?: string }; // Override default agent file paths
  evolution?: { max_containers_per_evolution?: number }; // Safety limit for container deploys
  firewall?: { restrict_to_tailscale?: boolean; open_ports?: number[] }; // Network lockdown rules
  // Extensible bridge config: each key is a bridge name (e.g. "whatsapp", "signal"),
  // value is bridge-specific settings. This avoids hardcoding bridge types in core.
  bridges?: Record<string, Record<string, unknown>>;
  // Index signature: allows arbitrary future config sections without breaking the type.
  // Capabilities check for their section's presence before reading it.
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
  name: string; // Container name → becomes systemd unit name (e.g. "pibloom-heartbeat")
  image: string; // OCI image reference (e.g. "localhost/pibloom-heartbeat:latest")
  description?: string; // Human-readable label for the [Unit] section
  volumes?: string[]; // Bind mounts, format: "host:container[:options]"
  environment?: Record<string, string>; // Env vars injected into the container
  pod?: string; // If set, emits Pod=<value> → shared network namespace with other pod members
  after?: string; // systemd ordering: start this unit after the named unit
  publishPorts?: string[]; // Host:container port mappings (e.g. "8080:3000")
  readOnly?: boolean; // Mount root filesystem read-only (security hardening)
  noNewPrivileges?: boolean; // Prevent privilege escalation inside container
  serviceType?: string; // systemd service type (e.g. "notify", "oneshot")
  restart?: string; // Restart policy (e.g. "on-failure", "always")
  wantedBy?: string; // systemd install target (e.g. "default.target")
}

/** Options for the setup generator (pibloom-core setup CLI). */
export interface SetupOptions {
  configPath?: string; // Path to pibloom.yaml (default: /etc/pibloom/pibloom.yaml)
  outputDir?: string; // Where to write Quadlet files (default: /etc/systemd/system)
  dryRun?: boolean; // Print generated files without writing them
}

/** Options for evolution install/rollback (pibloom-core evolve CLI). */
export interface EvolveOptions {
  slug: string; // Object slug identifying the evolution to deploy
  dryRun?: boolean; // Preview changes without executing
  autoApprove?: boolean; // Skip interactive confirmation prompts
  healthCheckTimeout?: number; // Max ms to wait for container health after deploy
}
