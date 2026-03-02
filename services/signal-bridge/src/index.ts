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
import path from "node:path";
import type {
  BridgeConfig,
  IncomingMessage,
  MessageChannel,
} from "@nazar/core";
import { AgentBridge, isAllowed, validatePhoneNumber } from "@nazar/core";

// Re-export from @nazar/core for backward compatibility
export { isAllowed, validatePhoneNumber } from "@nazar/core";

// --- Signal-specific config ---

export interface SignalBridgeConfig extends BridgeConfig {
  phoneNumber: string;
  signalCliHost: string;
  signalCliPort: number;
  storageDir: string;
}

const DEFAULT_CONFIG: SignalBridgeConfig = {
  phoneNumber: process.env.NAZAR_SIGNAL_PHONE || "",
  allowedContacts: (process.env.NAZAR_SIGNAL_ALLOWED_CONTACTS || "")
    .split(",")
    .filter(Boolean),
  signalCliHost: process.env.NAZAR_SIGNAL_CLI_HOST || "127.0.0.1",
  signalCliPort: Number(process.env.NAZAR_SIGNAL_CLI_PORT) || 7583,
  storageDir: process.env.NAZAR_SIGNAL_STORAGE_DIR || "/data/signal-storage",
  personaDir: process.env.NAZAR_PERSONA_DIR || "/usr/local/share/nazar/persona",
  systemMdPath: process.env.NAZAR_SYSTEM_MD || "",
  channelName: "Signal",
  piCommand: process.env.NAZAR_PI_COMMAND || "pi",
  piDir: process.env.PI_CODING_AGENT_DIR || `${process.env.HOME}/.pi/agent`,
  repoRoot: process.env.NAZAR_REPO_ROOT || "/var/lib/nazar",
  objectsDir: process.env.NAZAR_OBJECTS_DIR || "/var/lib/nazar/objects",
  skillsDir: process.env.NAZAR_SKILLS_DIR || "/usr/local/share/nazar/skills",
  timeoutMs: Number(process.env.NAZAR_SIGNAL_TIMEOUT_MS) || 120_000,
  piModel: process.env.NAZAR_PI_MODEL || undefined,
  piTransport:
    (process.env.NAZAR_PI_TRANSPORT as "sse" | "websocket" | "auto") ||
    undefined,
};

// --- Adapter: Signal Bot Channel ---

export class SignalBotChannel implements MessageChannel {
  readonly name = "signal";
  private messageHandler?: (msg: IncomingMessage) => Promise<string>;
  private config: SignalBridgeConfig;
  private socket?: net.Socket;
  private rpcId = 0;
  private healthInterval?: ReturnType<typeof setInterval>;
  private processingQueue: Promise<void> = Promise.resolve();
  private lineBuffer = "";

  constructor(config: SignalBridgeConfig) {
    this.config = config;
  }

  private enqueue(fn: () => Promise<void>): void {
    this.processingQueue = this.processingQueue.then(fn).catch((err) => {
      console.error(
        "Queue error:",
        err instanceof Error ? err.message : String(err),
      );
    });
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
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = undefined;
    }
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
        const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
        console.log(
          `Connection attempt ${attempt}/${MAX_RETRIES} failed (${msg}), retrying in ${delay}ms...`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    console.log(
      `Connected to signal-cli at ${this.config.signalCliHost}:${this.config.signalCliPort}`,
    );

    // Write health timestamp for container HEALTHCHECK
    const healthFile = `${this.config.storageDir}/healthy`;
    fs.writeFileSync(healthFile, new Date().toISOString());
    this.healthInterval = setInterval(() => {
      fs.writeFileSync(healthFile, new Date().toISOString());
    }, 15_000);
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

    this.enqueue(async () => {
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
  const config = { ...DEFAULT_CONFIG };

  if (!config.phoneNumber) {
    throw new Error(
      "NAZAR_SIGNAL_PHONE is required (E.164 format, e.g. +12345678901)",
    );
  }

  if (!validatePhoneNumber(config.phoneNumber)) {
    throw new Error(
      `Invalid phone number format: '${config.phoneNumber}' (expected E.164, e.g. +12345678901)`,
    );
  }

  // Validate Pi agent config directory has required files
  const authFile = path.join(config.piDir, "auth.json");
  if (!fs.existsSync(authFile)) {
    throw new Error(
      `Pi agent auth not found at ${authFile}. ` +
        "Provision it to /var/lib/nazar/pi-config/agent/ on the host " +
        "(see: nazar signal setup-agent).",
    );
  }

  console.log("Nazar Signal Bridge starting...");
  console.log(`  Phone: ${config.phoneNumber}`);
  console.log(`  signal-cli: ${config.signalCliHost}:${config.signalCliPort}`);
  console.log(`  Pi dir: ${config.piDir}`);
  console.log(`  Objects dir: ${config.objectsDir}`);
  console.log(`  Persona dir: ${config.personaDir}`);
  console.log(`  System MD: ${config.systemMdPath || "(none)"}`);
  console.log(`  Pi model: ${config.piModel || "(default)"}`);
  console.log(`  Pi transport: ${config.piTransport || "(default)"}`);
  console.log(
    `  Allowed contacts: ${config.allowedContacts.length === 0 ? "all" : config.allowedContacts.join(", ")}`,
  );

  const bridge = new AgentBridge(config);
  const channel = new SignalBotChannel(config);
  channel.onMessage(async (msg) => bridge.processMessage(msg.text, msg.from));
  await channel.connect();
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
