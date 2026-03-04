/**
 * AgentBridge — channel-agnostic AgentSession integration.
 *
 * Uses the CapabilityRegistry to compose extension factories and skill paths
 * from ALL capabilities when creating new sessions.
 */

import fs from "node:fs";
import type { IAgentBridge } from "../../ports/agent-bridge.js";
import type { IMediaTranscriber } from "../../ports/media-transcriber.js";
import type { MediaAttachment } from "../../ports/message-channel.js";
import type { IPersonaLoader } from "../../ports/persona-loader.js";
import type { AgentConfig } from "../../types.js";
import type { ParsedAgentOutput } from "../affordances/parser.js";
import { parseAgentOutput } from "../affordances/parser.js";
import type { ExtensionFactory } from "./extension.js";
import { SessionPool } from "./session-pool.js";

/** Base config for any message bridge with agent integration. */
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

/** Image content for the Pi SDK prompt() options. */
interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

interface PromptOptions {
  images?: ImageContent[];
}

interface AgentSession {
  subscribe(cb: (event: AgentSessionEvent) => void): () => void;
  prompt(text: string, options?: PromptOptions): Promise<void>;
  dispose?(): void;
  compact?(guidance?: string): Promise<unknown>;
}

// --- AgentBridge class ---

const DEFAULT_MAX_SESSIONS = Number(process.env.PIBLOOM_MAX_SESSIONS) || 50;

export class AgentBridge implements IAgentBridge {
  private config: BridgeConfig;
  private pool: SessionPool<AgentSession>;
  private extensionFactories: ExtensionFactory[];
  private skillPaths: string[];
  private personaLoader: IPersonaLoader;
  private transcriber?: IMediaTranscriber;

  constructor(
    config: BridgeConfig,
    opts?: {
      maxSessions?: number;
      extensionFactories?: ExtensionFactory[];
      skillPaths?: string[];
      personaLoader?: IPersonaLoader;
      transcriber?: IMediaTranscriber;
    },
  ) {
    this.config = config;
    this.pool = new SessionPool(opts?.maxSessions ?? DEFAULT_MAX_SESSIONS);
    this.extensionFactories = opts?.extensionFactories ?? [];
    this.skillPaths = opts?.skillPaths ?? [config.skillsDir];
    this.personaLoader = opts?.personaLoader ?? {
      loadPersonaPrompt: () => "",
      loadSystemContext: () => "",
    };
    this.transcriber = opts?.transcriber;
  }

  async processMessage(
    text: string,
    from: string,
    attachments?: MediaAttachment[],
  ): Promise<ParsedAgentOutput> {
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

    let session = this.pool.get(from);
    if (!session) {
      // Shared auth storage instance
      const authStorage = AuthStorage.create();

      // Resolve model from env var
      const model = this.config.model ? getModel(this.config.model) : undefined;

      // Settings with compaction + transport
      const settingsManager = SettingsManager.inMemory({
        compaction: { enabled: true },
        ...(this.config.transport ? { transport: this.config.transport } : {}),
      });

      // Load persona and system context for system prompt injection
      const personaPrompt = this.personaLoader.loadPersonaPrompt(
        this.config.personaDir,
        this.config.channelName,
      );
      const systemContext = this.config.systemMdPath
        ? this.personaLoader.loadSystemContext(this.config.systemMdPath)
        : "";
      const appendSystemPrompt = [systemContext, personaPrompt]
        .filter(Boolean)
        .join("\n\n");

      // Resource loader with skills + extensions from all capabilities
      const cwd = this.config.repoRoot;
      const agentDir = this.config.agentDir;
      const resourceLoader = new DefaultResourceLoader({
        cwd,
        agentDir,
        settingsManager,
        additionalSkillPaths: this.skillPaths,
        extensionFactories: this.extensionFactories,
        noThemes: true,
        noPromptTemplates: true,
        ...(appendSystemPrompt ? { appendSystemPrompt } : {}),
      });
      await resourceLoader.reload();

      if (this.config.sessionsDir) {
        fs.mkdirSync(this.config.sessionsDir, { recursive: true });
      }
      const { session: s } = await createAgentSession({
        sessionManager: this.config.sessionsDir
          ? SessionManager.create(this.config.sessionsDir)
          : SessionManager.inMemory(),
        authStorage,
        modelRegistry: new ModelRegistry(authStorage),
        settingsManager,
        resourceLoader,
        cwd,
        agentDir,
        ...(model ? { model } : {}),
      });
      session = s as AgentSession;
      this.pool.put(from, session);
    }

    const activeSession = session;
    let unsub: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout>;
    try {
      // Build prompt options from attachments before entering the Promise
      const promptOpts = await this.buildPromptOptions(text, attachments);

      const agentPromise = new Promise<ParsedAgentOutput>((resolve, reject) => {
        let accumulated = "";
        unsub = activeSession.subscribe((event: AgentSessionEvent) => {
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
            unsub?.();
            const raw = accumulated.trim() || "(no response)";
            resolve(parseAgentOutput(raw));
          }
          if (event.type === "error") {
            unsub?.();
            reject(new Error(event.message));
          }
        });
        activeSession.prompt(promptOpts.text, promptOpts.options).catch(reject);
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Agent response timed out")),
          this.config.timeoutMs,
        );
      });

      return await Promise.race([agentPromise, timeoutPromise]);
    } finally {
      clearTimeout(timer!);
      unsub?.();
    }
  }

  /**
   * Convert media attachments into prompt text augmentations and image options.
   *
   * - Images → Pi SDK ImageContent via PromptOptions.images
   * - Audio → transcribed via Whisper (if available), prepended to text
   * - Video → audio extracted + transcribed, keyframes sent as images
   * - Other → noted as attachment in text
   */
  private async buildPromptOptions(
    text: string,
    attachments?: MediaAttachment[],
  ): Promise<{ text: string; options?: PromptOptions }> {
    if (!attachments || attachments.length === 0) {
      return { text };
    }

    const images: ImageContent[] = [];
    const textParts: string[] = [];

    const canTranscribe =
      this.transcriber && (await this.transcriber.isAvailable());

    for (const att of attachments) {
      switch (att.type) {
        case "image":
          images.push({
            type: "image",
            data: att.data,
            mimeType: att.mimeType,
          });
          break;

        case "audio":
          if (canTranscribe) {
            try {
              const result = await this.transcriber?.transcribe(
                att.data,
                att.mimeType,
              );
              if (result?.text) {
                textParts.push(`[Voice message]: "${result.text}"`);
              }
            } catch (err) {
              console.error(
                "Transcription failed:",
                err instanceof Error ? err.message : String(err),
              );
              textParts.push(
                `[Attachment: voice message (${att.mimeType}) — transcription failed]`,
              );
            }
          } else {
            textParts.push(
              `[Attachment: voice message (${att.mimeType}) — transcription unavailable]`,
            );
          }
          break;

        case "video":
          if (canTranscribe) {
            try {
              const result = await this.transcriber?.transcribe(
                att.data,
                att.mimeType,
              );
              if (result?.text) {
                textParts.push(`[Video message audio]: "${result.text}"`);
              }
            } catch (err) {
              console.error(
                "Video transcription failed:",
                err instanceof Error ? err.message : String(err),
              );
              textParts.push(
                `[Attachment: video (${att.mimeType}) — transcription failed]`,
              );
            }
          } else {
            textParts.push(
              `[Attachment: video (${att.mimeType}) — transcription unavailable]`,
            );
          }
          break;

        case "document":
          textParts.push(
            `[Attachment: document${att.filename ? ` "${att.filename}"` : ""} (${att.mimeType})]`,
          );
          break;
      }
    }

    // Prepend attachment context to the user's text
    const augmented = [...textParts, text].filter(Boolean).join("\n\n");
    const options = images.length > 0 ? { images } : undefined;
    return { text: augmented, options };
  }

  dispose(): void {
    this.pool.disposeAll();
  }
}
