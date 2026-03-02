/**
 * AgentBridge — channel-agnostic Pi AgentSession integration.
 *
 * Manages a pool of sessions (one per contact), handles lazy Pi SDK loading,
 * persona composition, and streaming response accumulation. Used by both
 * Signal and WhatsApp bridges.
 */

import { createNazarExtension } from "./extension.js";
import { loadPersonaPrompt, loadSystemContext } from "./persona.js";
import type { AgentConfig } from "./types.js";

/** Base config for any message bridge with Pi agent integration. */
export interface BridgeConfig extends AgentConfig {
  allowedContacts: string[];
  personaDir: string;
  systemMdPath: string;
  channelName: string;
}

// --- Pure helpers ---

export function isAllowed(sender: string, allowedContacts: string[]): boolean {
  if (allowedContacts.length === 0) return true;
  return allowedContacts.includes(sender);
}

/** Validate E.164 phone number format. */
export function validatePhoneNumber(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

// --- AgentSession types (mirrored from Pi SDK to avoid hard dependency) ---

type AgentSessionEvent =
  | {
      type: "message_update";
      assistantMessageEvent?: { type: string; delta: string };
    }
  | { type: "idle" }
  | { type: "agent_end" }
  | { type: "turn_end" }
  | { type: "error"; message: string }
  | { type: "auto_compaction_start" }
  | { type: "auto_compaction_end" };

interface AgentSession {
  subscribe(cb: (event: AgentSessionEvent) => void): () => void;
  prompt(text: string): Promise<void>;
  dispose?(): void;
  compact?(guidance?: string): Promise<unknown>;
}

// --- AgentBridge class ---

const DEFAULT_MAX_SESSIONS = 50;

export class AgentBridge {
  private config: BridgeConfig;
  private maxSessions: number;
  private sessions = new Map<string, AgentSession>();

  constructor(config: BridgeConfig, maxSessions?: number) {
    this.config = config;
    this.maxSessions = maxSessions ?? DEFAULT_MAX_SESSIONS;
  }

  async processMessage(text: string, from: string): Promise<string> {
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

    let session = this.sessions.get(from);
    if (!session) {
      // Evict oldest session if at capacity
      if (this.sessions.size >= this.maxSessions) {
        const oldest = this.sessions.keys().next().value;
        if (oldest !== undefined) {
          const evicted = this.sessions.get(oldest);
          evicted?.dispose?.();
          this.sessions.delete(oldest);
        }
      }

      // Shared auth storage instance
      const authStorage = AuthStorage.create();

      // Resolve model from env var
      const model = this.config.piModel
        ? getModel(this.config.piModel)
        : undefined;

      // Settings with compaction + transport
      const settingsManager = SettingsManager.inMemory({
        compaction: { enabled: true },
        ...(this.config.piTransport
          ? { transport: this.config.piTransport }
          : {}),
      });

      // Extension factory
      const nazarExtension = createNazarExtension();

      // Load persona and system context for system prompt injection
      const personaPrompt = loadPersonaPrompt(
        this.config.personaDir,
        this.config.channelName,
      );
      const systemContext = this.config.systemMdPath
        ? loadSystemContext(this.config.systemMdPath)
        : "";
      const appendSystemPrompt = [systemContext, personaPrompt]
        .filter(Boolean)
        .join("\n\n");

      // Resource loader with skills + extension
      const cwd = this.config.repoRoot;
      const agentDir = this.config.piDir;
      const resourceLoader = new DefaultResourceLoader({
        cwd,
        agentDir,
        settingsManager,
        additionalSkillPaths: [this.config.skillsDir],
        extensionFactories: [nazarExtension],
        noThemes: true,
        noPromptTemplates: true,
        ...(appendSystemPrompt ? { appendSystemPrompt } : {}),
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
      this.sessions.set(from, session);
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
        if (
          event.type === "idle" ||
          event.type === "agent_end" ||
          event.type === "turn_end"
        ) {
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
        this.config.timeoutMs,
      );
    });

    return Promise.race([agentPromise, timeoutPromise]);
  }

  dispose(): void {
    for (const [key, session] of this.sessions) {
      session.dispose?.();
      this.sessions.delete(key);
    }
  }
}
