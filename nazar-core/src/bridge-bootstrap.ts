/**
 * Shared bridge bootstrap utilities — DRYs up Signal, WhatsApp, and Web bridges.
 *
 * Exports:
 * - loadBaseBridgeConfig() — shared env-var loading for BridgeConfig fields
 * - MessageQueue — sequential message processing with backpressure
 * - HealthFileReporter — periodic health timestamp writer
 * - bootstrapBridge() — full bootstrap for MessageChannel-based bridges
 * - bridgeNazarConfig() — minimal valid NazarConfig from env vars
 */

import fs from "node:fs";
import path from "node:path";
import { formatAffordancesAsText } from "./affordances.js";
import type { AgentSessionCapability } from "./capabilities/agent-session/index.js";
import type {
  BridgeConfig,
  PiAgentBridge,
} from "./capabilities/agent-session/pi-agent-bridge.js";
import { createInitializedRegistry } from "./defaults.js";
import type { IncomingMessage, MessageChannel } from "./ports/index.js";
import type { CapabilityRegistry } from "./registry.js";
import type { NazarConfig } from "./types.js";

/** Load the 12 shared BridgeConfig fields from env vars. */
export function loadBaseBridgeConfig(channelName: string): BridgeConfig {
  return {
    allowedContacts: [],
    personaDir:
      process.env.NAZAR_PERSONA_DIR || "/usr/local/share/nazar/persona",
    systemMdPath: process.env.NAZAR_SYSTEM_MD || "",
    channelName,
    piCommand: process.env.NAZAR_PI_COMMAND || "pi",
    piDir: process.env.PI_CODING_AGENT_DIR || `${process.env.HOME}/.pi/agent`,
    repoRoot: process.env.NAZAR_REPO_ROOT || "/var/lib/nazar",
    objectsDir: process.env.NAZAR_OBJECTS_DIR || "/var/lib/nazar/objects",
    skillsDir: process.env.NAZAR_SKILLS_DIR || "/usr/local/share/nazar/skills",
    timeoutMs: 120_000,
    piModel: process.env.NAZAR_PI_MODEL || undefined,
    piTransport:
      (process.env.NAZAR_PI_TRANSPORT as "sse" | "websocket" | "auto") ||
      undefined,
  };
}

/** Minimal valid NazarConfig from env vars (replaces `{} as NazarConfig`). */
export function bridgeNazarConfig(): NazarConfig {
  return {
    hostname: process.env.NAZAR_HOSTNAME || "nazar",
    primary_user: process.env.NAZAR_PRIMARY_USER || "user",
  };
}

/** Sequential message processing queue with backpressure. */
export class MessageQueue {
  private processingQueue: Promise<void> = Promise.resolve();
  private queueDepth = 0;
  private readonly maxDepth: number;

  constructor(maxDepth = 100) {
    this.maxDepth = maxDepth;
  }

  enqueue(fn: () => Promise<void>): void {
    if (this.queueDepth >= this.maxDepth) {
      console.warn(`Queue full (${this.queueDepth} pending), dropping message`);
      return;
    }
    this.queueDepth++;
    this.processingQueue = this.processingQueue
      .then(fn)
      .catch((err) => {
        console.error(
          "Queue error:",
          err instanceof Error ? err.message : String(err),
        );
      })
      .finally(() => {
        this.queueDepth--;
      });
  }

  get pending(): number {
    return this.queueDepth;
  }
}

/** Periodic health timestamp writer for container HEALTHCHECK. */
export class HealthFileReporter {
  private interval?: ReturnType<typeof setInterval>;

  start(healthFilePath: string, intervalMs = 15_000): void {
    fs.writeFileSync(healthFilePath, new Date().toISOString());
    this.interval = setInterval(() => {
      fs.writeFileSync(healthFilePath, new Date().toISOString());
    }, intervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }
}

/** Options for bootstrapBridge(). */
export interface BootstrapOptions<C extends BridgeConfig> {
  config: C;
  createChannel: (config: C) => MessageChannel;
  validate?: (config: C) => void;
  logExtra?: (config: C) => void;
}

/** Result from bootstrapBridge(). */
export interface BootstrapResult {
  bridge: PiAgentBridge;
  registry: CapabilityRegistry;
  shutdown: () => Promise<void>;
}

/**
 * Full bootstrap for MessageChannel-based bridges.
 *
 * Handles: auth validation, startup logging, registry init with valid NazarConfig,
 * agent session wiring, channel.onMessage, channel.connect, SIGTERM/SIGINT.
 */
export async function bootstrapBridge<C extends BridgeConfig>(
  opts: BootstrapOptions<C>,
): Promise<BootstrapResult> {
  const { config, createChannel, validate, logExtra } = opts;

  // Validate Pi agent config directory has required files
  const authFile = path.join(config.piDir, "auth.json");
  if (!fs.existsSync(authFile)) {
    throw new Error(
      `Pi agent auth not found at ${authFile}. ` +
        "Provision it to /var/lib/nazar/pi-config/agent/ on the host.",
    );
  }

  // Run bridge-specific validation
  validate?.(config);

  // Startup logging
  console.log(`Nazar ${config.channelName} Bridge starting...`);
  console.log(`  Pi dir: ${config.piDir}`);
  console.log(`  Objects dir: ${config.objectsDir}`);
  console.log(`  Persona dir: ${config.personaDir}`);
  console.log(`  System MD: ${config.systemMdPath || "(none)"}`);
  console.log(`  Pi model: ${config.piModel || "(default)"}`);
  console.log(`  Pi transport: ${config.piTransport || "(default)"}`);
  logExtra?.(config);
  console.log(
    `  Allowed contacts: ${config.allowedContacts.length === 0 ? "all" : config.allowedContacts.join(", ")}`,
  );

  // Initialize registry with valid NazarConfig
  const registry = await createInitializedRegistry(bridgeNazarConfig());
  const agentSession = registry.get<AgentSessionCapability>("agent-session");
  const bridge = agentSession.createBridge(config);

  // Wire channel
  const channel = createChannel(config);
  channel.onMessage(async (msg: IncomingMessage) => {
    const response = await bridge.processMessage(msg.text, msg.from);
    const suffix = formatAffordancesAsText(response.affordances);
    return suffix ? `${response.text}\n\n${suffix}` : response.text;
  });
  await channel.connect();

  // Shutdown handlers
  const shutdown = async () => {
    console.log("Shutting down gracefully...");
    bridge.dispose();
    await registry.disposeAll();
    await channel.disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  return { bridge, registry, shutdown };
}
