/**
 * piBloom WhatsApp Bridge — whatsapp-web.js → Pi AgentSession bridge.
 *
 * Architecture (Ports and Adapters):
 * - Port: MessageChannel interface (from @pibloom/core)
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
} from "@pibloom/core";
import {
  bootstrapBridge,
  HealthFileReporter,
  isAllowed,
  loadBaseBridgeConfig,
  MessageQueue,
} from "@pibloom/core";

// --- WhatsApp-specific config ---

export interface WhatsAppBridgeConfig extends BridgeConfig {
  storageDir: string;
}

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
  private readonly queue = new MessageQueue();
  private readonly health = new HealthFileReporter();

  constructor(config: WhatsAppBridgeConfig) {
    this.config = config;
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
    this.health.stop();
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

      this.queue.enqueue(async () => {
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

    this.health.start(path.join(this.config.storageDir, "healthy"));
  }
}

// --- Main ---

async function main(): Promise<void> {
  const config: WhatsAppBridgeConfig = {
    ...loadBaseBridgeConfig("WhatsApp"),
    allowedContacts: (process.env.PIBLOOM_WHATSAPP_ALLOWED_CONTACTS || "")
      .split(",")
      .filter(Boolean),
    storageDir:
      process.env.PIBLOOM_WHATSAPP_STORAGE_DIR || "/data/whatsapp-storage",
    timeoutMs: Number(process.env.PIBLOOM_WHATSAPP_TIMEOUT_MS) || 120_000,
  };

  await bootstrapBridge({
    config,
    createChannel: (c) => new WhatsAppBotChannel(c),
    logExtra: (c) => {
      console.log(`  Storage dir: ${c.storageDir}`);
    },
  });
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
