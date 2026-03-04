/**
 * Shared bridge bootstrap utilities.
 *
 * Handles:
 *   - loadBaseBridgeConfig()  — shared env-var loading for BridgeConfig fields
 *   - MessageQueue            — sequential message processing with backpressure
 *   - HealthFileReporter      — periodic health timestamp writer (HEALTHCHECK integration)
 *   - bootstrapBridge()       — full bootstrap for MessageChannel-based bridges
 *   - bridgePibloomConfig()     — minimal valid PibloomConfig from env vars
 *
 * Does NOT handle:
 *   - Channel-specific connection logic (e.g. WhatsApp Puppeteer)
 *   - Contact allow-listing (each bridge service handles that in its channel impl)
 *   - Agent session management (delegated to AgentSessionCapability via registry)
 *
 * For the bridge entry point that calls bootstrapBridge(), see:
 *   WhatsApp — bridges/whatsapp/src/index.ts
 */

import fs from "node:fs";
import path from "node:path";
import { mimeFromPath } from "./capabilities/affordances/mime.js";
import { toHateoasResponse } from "./capabilities/affordances/parser.js";
import {
  type ResponseRenderer,
  TextRenderer,
} from "./capabilities/affordances/text-renderer.js";
import type { AgentSessionCapability } from "./capabilities/agent-session/index.js";
import type {
  AgentBridge,
  BridgeConfig,
} from "./capabilities/agent-session/pi-agent-bridge.js";
import { createInitializedRegistry } from "./defaults.js";
import type {
  IncomingMessage,
  MessageChannel,
  OutgoingMedia,
} from "./ports/index.js";
import type { CapabilityRegistry } from "./registry.js";
import type { PibloomConfig } from "./types.js";

/** Load the shared BridgeConfig fields from env vars. */
export function loadBaseBridgeConfig(channelName: string): BridgeConfig {
  return {
    allowedContacts: [],
    personaDir:
      process.env.PIBLOOM_PERSONA_DIR || "/usr/local/share/pibloom/persona",
    systemMdPath: process.env.PIBLOOM_SYSTEM_MD || "",
    channelName,
    agentCommand: process.env.PIBLOOM_PI_COMMAND || "pi",
    agentDir:
      process.env.PI_CODING_AGENT_DIR || `${process.env.HOME}/.pi/agent`,
    repoRoot: process.env.PIBLOOM_REPO_ROOT || "/var/lib/pibloom",
    objectsDir: process.env.PIBLOOM_OBJECTS_DIR || "/var/lib/pibloom/objects",
    skillsDir:
      process.env.PIBLOOM_SKILLS_DIR || "/usr/local/share/pibloom/skills",
    timeoutMs: 120_000,
    model: process.env.PIBLOOM_PI_MODEL || undefined,
    transport:
      (process.env.PIBLOOM_PI_TRANSPORT as "sse" | "websocket" | "auto") ||
      undefined,
    sessionsDir:
      process.env.PIBLOOM_SESSIONS_DIR || "/var/lib/pibloom/sessions",
  };
}

/** Minimal valid PibloomConfig from env vars (replaces `{} as PibloomConfig`). */
export function bridgePibloomConfig(): PibloomConfig {
  return {
    hostname: process.env.PIBLOOM_HOSTNAME || "pibloom",
    primary_user: process.env.PIBLOOM_PRIMARY_USER || "user",
  };
}

/**
 * Sequential message processing queue with backpressure.
 *
 * Messaging channels may deliver bursts of messages faster than the Pi agent
 * can process them. This queue serializes processing and drops messages when
 * full rather than letting memory grow unboundedly.
 */
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

/**
 * Periodic health timestamp writer for container HEALTHCHECK.
 *
 * Podman reads the timestamp file path configured in the Quadlet
 * `.container` unit's `HealthCmd`. If the file is not updated within
 * the configured interval, Podman marks the container unhealthy and
 * may restart it (depending on RestartPolicy).
 *
 * For the IHealthReporter port interface, see ports/health-reporter.ts.
 */
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
  renderer?: ResponseRenderer;
}

/** Result from bootstrapBridge(). */
export interface BootstrapResult {
  bridge: AgentBridge;
  registry: CapabilityRegistry;
  shutdown: () => Promise<void>;
}

/**
 * Full bootstrap for MessageChannel-based bridges.
 *
 * Handles: auth validation, startup logging, registry init with valid PibloomConfig,
 * agent session wiring, channel.onMessage, channel.connect, SIGTERM/SIGINT.
 *
 * Does NOT handle: channel-specific connection protocols, contact allow-listing,
 * or health file writing (callers add HealthFileReporter separately if needed).
 *
 * Bootstrap sequence:
 * 1. Verify Pi agent auth.json exists (fails fast before any network connections)
 * 2. Run bridge-specific validation via validate() callback
 * 3. Log startup info
 * 4. createInitializedRegistry() — 3-phase capability init (see defaults.ts)
 * 5. createBridge() — wire AgentSessionCapability to BridgeConfig
 * 6. channel.onMessage() — route messages through bridge, render HATEOAS response
 * 7. channel.connect() — start listening
 * 8. Register SIGTERM/SIGINT for graceful shutdown
 */
export async function bootstrapBridge<C extends BridgeConfig>(
  opts: BootstrapOptions<C>,
): Promise<BootstrapResult> {
  const { config, createChannel, validate, logExtra } = opts;
  const renderer = opts.renderer ?? new TextRenderer();

  // Validate agent config directory has required files
  const authFile = path.join(config.agentDir, "auth.json");
  if (!fs.existsSync(authFile)) {
    throw new Error(
      `Agent auth not found at ${authFile}. ` +
        "Provision it to /var/lib/pibloom/pi-config/agent/ on the host.",
    );
  }

  // Run bridge-specific validation
  validate?.(config);

  // Startup logging
  console.log(`piBloom ${config.channelName} Bridge starting...`);
  console.log(`  Agent dir: ${config.agentDir}`);
  console.log(`  Objects dir: ${config.objectsDir}`);
  console.log(`  Persona dir: ${config.personaDir}`);
  console.log(`  System MD: ${config.systemMdPath || "(none)"}`);
  console.log(`  Model: ${config.model || "(default)"}`);
  console.log(`  Transport: ${config.transport || "(default)"}`);
  logExtra?.(config);
  console.log(
    `  Allowed contacts: ${config.allowedContacts.length === 0 ? "all" : config.allowedContacts.join(", ")}`,
  );

  // Initialize registry with valid PibloomConfig
  const registry = await createInitializedRegistry(bridgePibloomConfig());
  const agentSession = registry.get<AgentSessionCapability>("agent-session");
  const bridge = agentSession.createBridge(config);

  // Wire channel
  const channel = createChannel(config);
  channel.onMessage(async (msg: IncomingMessage) => {
    const parsed = await bridge.processMessage(
      msg.text,
      msg.from,
      msg.attachments,
    );

    // Send media files before the text response
    if (parsed.media && parsed.media.length > 0 && channel.sendMedia) {
      for (const ref of parsed.media) {
        try {
          if (!fs.existsSync(ref.path)) {
            console.warn(`Media file not found: ${ref.path}`);
            continue;
          }
          const fileData = fs.readFileSync(ref.path);
          const media: OutgoingMedia = {
            type: ref.type,
            mimeType: mimeFromPath(ref.path),
            data: fileData.toString("base64"),
            filename: path.basename(ref.path),
            caption: ref.caption,
          };
          await channel.sendMedia(msg.from, media);
        } catch (err) {
          console.error(
            `Failed to send media ${ref.path}:`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    }

    const response = toHateoasResponse(parsed, channel.name);
    return renderer.render(response);
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
