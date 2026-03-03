/**
 * Nazar Signal Bridge — signal-cli TCP daemon → Pi AgentSession bridge.
 *
 * Architecture (Ports and Adapters):
 * - Port: MessageChannel interface (from @nazar/core)
 * - Adapter: TCP JSON-RPC connection to signal-cli daemon
 * - Core: Message → AgentBridge.processMessage() → streaming events → respond
 *
 * One AgentSession per contact phone number enables persistent conversation
 * history per user. Both containers share localhost via a Quadlet pod.
 */

import fs from "node:fs";
import net from "node:net";
import type {
  BridgeConfig,
  IncomingMessage,
  MessageChannel,
} from "@nazar/core";
import {
  bootstrapBridge,
  HealthFileReporter,
  isAllowed,
  loadBaseBridgeConfig,
  MessageQueue,
  validatePhoneNumber,
} from "@nazar/core";

// Re-export from @nazar/core for backward compatibility
export { isAllowed, validatePhoneNumber } from "@nazar/core";

// --- Signal-specific config ---

export interface SignalBridgeConfig extends BridgeConfig {
  phoneNumber: string;
  signalCliHost: string;
  signalCliPort: number;
  storageDir: string;
}

// --- Adapter: Signal Bot Channel ---

export class SignalBotChannel implements MessageChannel {
  readonly name = "signal";
  private messageHandler?: (msg: IncomingMessage) => Promise<string>;
  private config: SignalBridgeConfig;
  private socket?: net.Socket;
  private rpcId = 0;
  private lineBuffer = "";
  private readonly queue = new MessageQueue();
  private readonly health = new HealthFileReporter();

  constructor(config: SignalBridgeConfig) {
    this.config = config;
  }

  onMessage(handler: (msg: IncomingMessage) => Promise<string>): void {
    this.messageHandler = handler;
  }

  async sendMessage(to: string, text: string): Promise<void> {
    if (!this.socket) {
      throw new Error("Cannot send message: not connected");
    }
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id: ++this.rpcId,
      method: "send",
      params: { recipient: [to], message: text },
    });
    this.socket.write(`${payload}\n`);
  }

  async disconnect(): Promise<void> {
    this.health.stop();
    this.socket?.destroy();
    this.socket = undefined;
  }

  async connect(): Promise<void> {
    if (!this.messageHandler) {
      throw new Error("onMessage must be called before connect()");
    }
    const handleMessage = this.messageHandler;

    fs.mkdirSync(this.config.storageDir, { recursive: true });

    // Retry with exponential backoff — signal-cli may not be ready yet.
    const MAX_RETRIES = 10;
    const BASE_DELAY_MS = 1_000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.connectOnce(handleMessage);
        break;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt === MAX_RETRIES) {
          throw new Error(
            `Failed to connect to signal-cli after ${MAX_RETRIES} attempts: ${msg}`,
          );
        }
        const baseDelay = BASE_DELAY_MS * 2 ** (attempt - 1);
        const delay = Math.round(baseDelay * (0.5 + Math.random() * 0.5));
        console.log(
          `Connection attempt ${attempt}/${MAX_RETRIES} failed (${msg}), retrying in ${delay}ms...`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    console.log(
      `Connected to signal-cli at ${this.config.signalCliHost}:${this.config.signalCliPort}`,
    );

    this.health.start(`${this.config.storageDir}/healthy`);
  }

  private connectOnce(
    handleMessage: (msg: IncomingMessage) => Promise<string>,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const socket = net.createConnection(
        { host: this.config.signalCliHost, port: this.config.signalCliPort },
        () => {
          this.socket = socket;
          socket.removeListener("error", onConnectError);
          socket.on("error", (err) => {
            console.error(`signal-cli socket error: ${err.message}`);
          });
          resolve();
        },
      );
      const onConnectError = (err: Error) => reject(err);
      socket.on("error", onConnectError);

      socket.on("data", (chunk: Buffer) => {
        this.lineBuffer += chunk.toString("utf8");
        const lines = this.lineBuffer.split("\n");
        this.lineBuffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          this.handleJsonRpcLine(line, handleMessage);
        }
      });

      socket.on("close", () => {
        console.log("signal-cli connection closed");
      });
    });
  }

  private handleJsonRpcLine(
    line: string,
    handleMessage: (msg: IncomingMessage) => Promise<string>,
  ): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line) as Record<string, unknown>;
    } catch {
      console.warn("Malformed JSON-RPC line:", line.substring(0, 200));
      return;
    }

    // signal-cli sends notifications as JSON-RPC with method "receive"
    if (msg.method !== "receive") return;

    const params = msg.params as Record<string, unknown> | undefined;
    const envelope = params?.envelope as Record<string, unknown> | undefined;
    const dataMessage = envelope?.dataMessage as
      | Record<string, unknown>
      | undefined;
    const from = envelope?.source as string | undefined;
    const text = dataMessage?.message as string | undefined;

    if (!from || !text) return;

    if (!isAllowed(from, this.config.allowedContacts)) {
      console.log(`Blocked message from unauthorized contact: ${from}`);
      return;
    }

    console.log(`Message from ${from}: ${text.substring(0, 50)}...`);

    this.queue.enqueue(async () => {
      const incoming: IncomingMessage = {
        from,
        text,
        timestamp: Date.now(),
        channel: "signal",
      };

      const response = await handleMessage(incoming);

      try {
        await this.sendMessage(from, response);
      } catch (sendErr: unknown) {
        const errMsg =
          sendErr instanceof Error ? sendErr.message : String(sendErr);
        console.error(`Failed to send response: ${errMsg}`);
      }
    });
  }
}

// --- Main ---

async function main(): Promise<void> {
  const config: SignalBridgeConfig = {
    ...loadBaseBridgeConfig("Signal"),
    phoneNumber: process.env.NAZAR_SIGNAL_PHONE || "",
    allowedContacts: (process.env.NAZAR_SIGNAL_ALLOWED_CONTACTS || "")
      .split(",")
      .filter(Boolean),
    signalCliHost: process.env.NAZAR_SIGNAL_CLI_HOST || "127.0.0.1",
    signalCliPort: Number(process.env.NAZAR_SIGNAL_CLI_PORT) || 7583,
    storageDir: process.env.NAZAR_SIGNAL_STORAGE_DIR || "/data/signal-storage",
    timeoutMs: Number(process.env.NAZAR_SIGNAL_TIMEOUT_MS) || 120_000,
  };

  await bootstrapBridge({
    config,
    createChannel: (c) => new SignalBotChannel(c),
    validate: (c) => {
      if (!c.phoneNumber) {
        throw new Error(
          "NAZAR_SIGNAL_PHONE is required (E.164 format, e.g. +12345678901)",
        );
      }
      if (!validatePhoneNumber(c.phoneNumber)) {
        throw new Error(
          `Invalid phone number format: '${c.phoneNumber}' (expected E.164, e.g. +12345678901)`,
        );
      }
    },
    logExtra: (c) => {
      console.log(`  Phone: ${c.phoneNumber}`);
      console.log(`  signal-cli: ${c.signalCliHost}:${c.signalCliPort}`);
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
