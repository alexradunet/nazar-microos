/**
 * Nazar WhatsApp Bridge — whatsapp-web.js → Pi AgentSession bridge.
 *
 * Architecture (Ports and Adapters):
 * - Port: MessageChannel interface (from @nazar/core)
 * - Adapter: whatsapp-web.js Client with LocalAuth
 * - Core: Message → AgentBridge.processMessage() → streaming events → respond
 *
 * One AgentSession per contact phone number enables persistent conversation
 * history per user. Uses QR code authentication for WhatsApp Web.
 */

import fs from "node:fs";
import path from "node:path";
import type {
  BridgeConfig,
  IncomingMessage,
  MessageChannel,
  NazarConfig,
} from "@nazar/core";
import {
  type AgentSessionCapability,
  createInitializedRegistry,
  formatAffordancesAsText,
  isAllowed,
} from "@nazar/core";

// --- WhatsApp-specific config ---

export interface WhatsAppBridgeConfig extends BridgeConfig {
  storageDir: string;
}

const DEFAULT_CONFIG: WhatsAppBridgeConfig = {
  allowedContacts: (process.env.NAZAR_WHATSAPP_ALLOWED_CONTACTS || "")
    .split(",")
    .filter(Boolean),
  storageDir:
    process.env.NAZAR_WHATSAPP_STORAGE_DIR || "/data/whatsapp-storage",
  personaDir: process.env.NAZAR_PERSONA_DIR || "/usr/local/share/nazar/persona",
  systemMdPath: process.env.NAZAR_SYSTEM_MD || "",
  channelName: "WhatsApp",
  piCommand: process.env.NAZAR_PI_COMMAND || "pi",
  piDir: process.env.PI_CODING_AGENT_DIR || `${process.env.HOME}/.pi/agent`,
  repoRoot: process.env.NAZAR_REPO_ROOT || "/var/lib/nazar",
  objectsDir: process.env.NAZAR_OBJECTS_DIR || "/var/lib/nazar/objects",
  skillsDir: process.env.NAZAR_SKILLS_DIR || "/usr/local/share/nazar/skills",
  timeoutMs: Number(process.env.NAZAR_WHATSAPP_TIMEOUT_MS) || 120_000,
  piModel: process.env.NAZAR_PI_MODEL || undefined,
  piTransport:
    (process.env.NAZAR_PI_TRANSPORT as "sse" | "websocket" | "auto") ||
    undefined,
};

// --- Helpers ---

/**
 * Normalize a WhatsApp chat ID to E.164 phone number.
 * WhatsApp uses `<country><number>@c.us` for individual chats.
 */
export function chatIdToPhone(chatId: string): string {
  const num = chatId.replace(/@c\.us$/, "");
  return num.startsWith("+") ? num : `+${num}`;
}

// --- Adapter: WhatsApp Bot Channel ---

export class WhatsAppBotChannel implements MessageChannel {
  readonly name = "whatsapp";
  private messageHandler?: (msg: IncomingMessage) => Promise<string>;
  private config: WhatsAppBridgeConfig;
  private client?: import("whatsapp-web.js").Client;
  private healthInterval?: ReturnType<typeof setInterval>;
  private processingQueue: Promise<void> = Promise.resolve();
  private queueDepth = 0;
  private static readonly MAX_QUEUE_DEPTH = 100;

  constructor(config: WhatsAppBridgeConfig) {
    this.config = config;
  }

  private enqueue(fn: () => Promise<void>): void {
    if (this.queueDepth >= WhatsAppBotChannel.MAX_QUEUE_DEPTH) {
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

  onMessage(handler: (msg: IncomingMessage) => Promise<string>): void {
    this.messageHandler = handler;
  }

  async sendMessage(to: string, text: string): Promise<void> {
    if (!this.client) {
      throw new Error("Cannot send message: not connected");
    }
    // WhatsApp expects chatId format: <number>@c.us
    const chatId = to.includes("@") ? to : `${to.replace(/^\+/, "")}@c.us`;
    await this.client.sendMessage(chatId, text);
  }

  async disconnect(): Promise<void> {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = undefined;
    }
    if (this.client) {
      await this.client.destroy();
      this.client = undefined;
    }
  }

  async connect(): Promise<void> {
    if (!this.messageHandler) {
      throw new Error("onMessage must be called before connect()");
    }
    const handleMessage = this.messageHandler;

    fs.mkdirSync(this.config.storageDir, { recursive: true });

    // Dynamic imports for whatsapp-web.js and qrcode-terminal
    const { Client, LocalAuth } = await import("whatsapp-web.js");
    const qrcode = await import("qrcode-terminal");

    const authDir = path.join(this.config.storageDir, ".wwebjs_auth");
    const client = new Client({
      authStrategy: new LocalAuth({ dataPath: authDir }),
      puppeteer: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      },
    });

    client.on("qr", (qr: string) => {
      console.log("Scan this QR code to authenticate WhatsApp:");
      qrcode.generate(qr, { small: true });
    });

    client.on("authenticated", () => {
      console.log("WhatsApp authenticated successfully");
    });

    client.on("auth_failure", (msg: string) => {
      console.error(`WhatsApp auth failure: ${msg}`);
    });

    client.on("disconnected", (reason: string) => {
      console.log(`WhatsApp disconnected: ${reason}`);
    });

    client.on("message", (msg: import("whatsapp-web.js").Message) => {
      // Skip group messages — only handle individual chats
      if (msg.from.endsWith("@g.us")) return;
      // Skip status broadcasts
      if (msg.from === "status@broadcast") return;

      const from = chatIdToPhone(msg.from);

      if (!isAllowed(from, this.config.allowedContacts)) {
        console.log(`Blocked message from unauthorized contact: ${from}`);
        return;
      }

      const text = msg.body;
      if (!text) return;

      console.log(`Message from ${from}: ${text.substring(0, 50)}...`);

      this.enqueue(async () => {
        const incoming: IncomingMessage = {
          from,
          text,
          timestamp: Date.now(),
          channel: "whatsapp",
        };

        const response = await handleMessage(incoming);

        try {
          await this.sendMessage(msg.from, response);
        } catch (sendErr: unknown) {
          const errMsg =
            sendErr instanceof Error ? sendErr.message : String(sendErr);
          console.error(`Failed to send response: ${errMsg}`);
        }
      });
    });

    const initTimeout = 60_000;
    await Promise.race([
      client.initialize(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `WhatsApp client.initialize() timed out after ${initTimeout}ms`,
              ),
            ),
          initTimeout,
        ),
      ),
    ]);
    this.client = client;

    console.log("WhatsApp client initialized");

    // Write health timestamp for container HEALTHCHECK
    const healthFile = path.join(this.config.storageDir, "healthy");
    fs.writeFileSync(healthFile, new Date().toISOString());
    this.healthInterval = setInterval(() => {
      fs.writeFileSync(healthFile, new Date().toISOString());
    }, 15_000);
  }
}

// --- Main ---

async function main(): Promise<void> {
  const config = { ...DEFAULT_CONFIG };

  // Validate Pi agent config directory has required files
  const authFile = path.join(config.piDir, "auth.json");
  if (!fs.existsSync(authFile)) {
    throw new Error(
      `Pi agent auth not found at ${authFile}. ` +
        "Provision it to /var/lib/nazar/pi-config/agent/ on the host.",
    );
  }

  console.log("Nazar WhatsApp Bridge starting...");
  console.log(`  Pi dir: ${config.piDir}`);
  console.log(`  Objects dir: ${config.objectsDir}`);
  console.log(`  Persona dir: ${config.personaDir}`);
  console.log(`  System MD: ${config.systemMdPath || "(none)"}`);
  console.log(`  Pi model: ${config.piModel || "(default)"}`);
  console.log(`  Pi transport: ${config.piTransport || "(default)"}`);
  console.log(`  Storage dir: ${config.storageDir}`);
  console.log(
    `  Allowed contacts: ${config.allowedContacts.length === 0 ? "all" : config.allowedContacts.join(", ")}`,
  );

  const registry = await createInitializedRegistry({} as NazarConfig);
  const agentSession = registry.get<AgentSessionCapability>("agent-session");
  const bridge = agentSession.createBridge(config);

  const channel = new WhatsAppBotChannel(config);
  channel.onMessage(async (msg) => {
    const response = await bridge.processMessage(msg.text, msg.from);
    const suffix = formatAffordancesAsText(response.affordances);
    return suffix ? `${response.text}\n\n${suffix}` : response.text;
  });
  await channel.connect();

  const shutdown = async () => {
    console.log("Shutting down gracefully...");
    bridge.dispose();
    await registry.disposeAll();
    await channel.disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

// Only run main when executed directly (not when imported for tests).
import { fileURLToPath } from "node:url";

const isDirectExecution = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
