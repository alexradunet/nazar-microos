/**
 * Nazar Signal Bridge — signal-cli TCP daemon → Pi AgentSession bridge.
 *
 * Architecture (Ports and Adapters):
 * - Port: MessageChannel interface (from @nazar/core)
 * - Adapter: TCP JSON-RPC connection to signal-cli daemon
 * - Core: Message → AgentSession.prompt() → streaming events → respond
 *
 * One AgentSession per contact phone number enables persistent conversation
 * history per user. Both containers share localhost via a Quadlet pod.
 */

import fs from "node:fs";
import net from "node:net";
import type { AgentConfig, IncomingMessage, MessageChannel } from "@nazar/core";

// --- Signal-specific config ---

export interface SignalBridgeConfig extends AgentConfig {
  phoneNumber: string;
  allowedContacts: string[];
  signalCliHost: string;
  signalCliPort: number;
  storageDir: string;
  piModel?: string;
  piTransport?: "sse" | "websocket" | "auto";
}

const DEFAULT_CONFIG: SignalBridgeConfig = {
  phoneNumber: process.env.NAZAR_SIGNAL_PHONE || "",
  allowedContacts: (process.env.NAZAR_SIGNAL_ALLOWED_CONTACTS || "")
    .split(",")
    .filter(Boolean),
  signalCliHost: process.env.NAZAR_SIGNAL_CLI_HOST || "127.0.0.1",
  signalCliPort: Number(process.env.NAZAR_SIGNAL_CLI_PORT) || 7583,
  storageDir: process.env.NAZAR_SIGNAL_STORAGE_DIR || "/data/signal-storage",
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

// --- Pure helpers ---

export function isAllowed(sender: string, config: SignalBridgeConfig): boolean {
  if (config.allowedContacts.length === 0) return true;
  return config.allowedContacts.includes(sender);
}

/** Validate E.164 phone number format. */
export function validatePhoneNumber(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

// --- AgentSession integration ---
// Dynamic import so the module can be tested without the full SDK installed.

type AgentSessionEvent =
  | {
      type: "message_update";
      assistantMessageEvent?: { type: string; delta: string };
    }
  | { type: "idle" }
  | { type: "error"; message: string }
  | { type: "auto_compaction_start" }
  | { type: "auto_compaction_end" };

interface AgentSession {
  subscribe(cb: (event: AgentSessionEvent) => void): () => void;
  prompt(text: string): Promise<void>;
  dispose?(): void;
  compact?(guidance?: string): Promise<unknown>;
}

// One session per contact phone number, bounded to prevent memory leaks.
const MAX_SESSIONS = 50;
const sessions = new Map<string, AgentSession>();

async function processWithAgent(
  text: string,
  from: string,
  config: SignalBridgeConfig,
): Promise<string> {
  // Lazy-load the Pi AgentSession SDK to allow testing without it installed.
  const {
    createAgentSession,
    SessionManager,
    AuthStorage,
    ModelRegistry,
    SettingsManager,
    DefaultResourceLoader,
  } = (await import("@mariozechner/pi-coding-agent")) as any;
  const { getModel } = (await import("@mariozechner/pi-ai")) as any;
  const { createNazarExtension } = await import("./extension.js");

  let session = sessions.get(from);
  if (!session) {
    // Evict oldest session if at capacity
    if (sessions.size >= MAX_SESSIONS) {
      const oldest = sessions.keys().next().value;
      if (oldest !== undefined) {
        const evicted = sessions.get(oldest);
        evicted?.dispose?.();
        sessions.delete(oldest);
      }
    }

    // Shared auth storage instance (item 1)
    const authStorage = AuthStorage.create();

    // Resolve model from env var (item 3)
    const model = config.piModel ? getModel(config.piModel) : undefined;

    // Settings with compaction + transport (items 6, 10)
    const settingsManager = SettingsManager.inMemory({
      compaction: { enabled: true },
      ...(config.piTransport ? { transport: config.piTransport } : {}),
    });

    // Extension factory (item 9)
    const nazarExtension = createNazarExtension();

    // Resource loader with skills + extension (item 7)
    const cwd = config.repoRoot;
    const agentDir = config.piDir;
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      additionalSkillPaths: [config.skillsDir],
      extensionFactories: [nazarExtension],
      noThemes: true,
      noPromptTemplates: true,
    });
    await resourceLoader.reload();

    const { session: s } = await createAgentSession({
      sessionManager: SessionManager.inMemory(),
      authStorage,
      modelRegistry: new ModelRegistry(authStorage),
      settingsManager,
      resourceLoader,
      cwd,
      agentDir,
      ...(model ? { model } : {}),
    });
    session = s as AgentSession;
    sessions.set(from, session);
  }

  const activeSession = session;
  const agentPromise = new Promise<string>((resolve, reject) => {
    let accumulated = "";
    const unsub = activeSession.subscribe((event: AgentSessionEvent) => {
      if (
        event.type === "message_update" &&
        event.assistantMessageEvent?.type === "text_delta"
      ) {
        accumulated += event.assistantMessageEvent.delta;
      }
      if (event.type === "auto_compaction_start") {
        console.log(`[${from}] Auto-compaction started`);
      }
      if (event.type === "auto_compaction_end") {
        console.log(`[${from}] Auto-compaction completed`);
      }
      if (event.type === "idle") {
        unsub();
        resolve(accumulated.trim() || "(no response)");
      }
      if (event.type === "error") {
        unsub();
        reject(new Error(event.message));
      }
    });
    activeSession.prompt(text).catch(reject);
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error("Agent response timed out")),
      config.timeoutMs,
    );
  });

  return Promise.race([agentPromise, timeoutPromise]);
}

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

    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection(
        { host: this.config.signalCliHost, port: this.config.signalCliPort },
        () => {
          this.socket = socket;
          // Replace the connect-phase error handler with a persistent one
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

    if (!isAllowed(from, this.config)) {
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

  console.log("Nazar Signal Bridge starting...");
  console.log(`  Phone: ${config.phoneNumber}`);
  console.log(`  signal-cli: ${config.signalCliHost}:${config.signalCliPort}`);
  console.log(`  Pi dir: ${config.piDir}`);
  console.log(`  Objects dir: ${config.objectsDir}`);
  console.log(`  Pi model: ${config.piModel || "(default)"}`);
  console.log(`  Pi transport: ${config.piTransport || "(default)"}`);
  console.log(
    `  Allowed contacts: ${config.allowedContacts.length === 0 ? "all" : config.allowedContacts.join(", ")}`,
  );

  const channel = new SignalBotChannel(config);
  channel.onMessage(async (msg) =>
    processWithAgent(msg.text, msg.from, config),
  );
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
