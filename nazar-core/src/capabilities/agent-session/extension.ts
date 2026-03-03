/**
 * Nazar Pi extension — adds runtime context, tool guardrails, and compaction guidance.
 *
 * Hooks into Pi SDK extension events to:
 * - Inject OS-aware runtime context on every agent turn (context event)
 * - Block dangerous bash patterns before execution (tool_call event)
 * - Guide compaction with channel-specific instructions (session_before_compact)
 * - Log agent and tool lifecycle events for observability
 *
 * Does NOT register Pi tools directly — tool registration requires the full
 * Pi ExtensionAPI which is only available inside the SDK runtime.
 * For CLI-based tools, see capabilities/object-tools/ and capabilities/os-tools/.
 * For the AgentBridge that wires this extension, see ./pi-agent-bridge.ts.
 *
 * Registered via extensionFactories on DefaultResourceLoader.
 */

import type { ISystemExecutor } from "../../ports/system-executor.js";
import { getBootcStatus } from "../os-tools/bootc.js";
import { listContainerHealth } from "../os-tools/containers.js";
import { listNazarServices } from "../os-tools/systemd.js";

interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

interface ContextEventResult {
  messages?: AgentMessage[];
}

interface ToolCallEventResult {
  block?: boolean;
  reason?: string;
}

interface SessionBeforeCompactResult {
  compaction?: { instructions?: string };
  cancel?: boolean;
}

type ExtensionEvent =
  | { type: "context"; messages: AgentMessage[] }
  | { type: "tool_call"; tool: string; input: Record<string, unknown> }
  | { type: "session_before_compact" }
  | { type: "agent_start" }
  | { type: "agent_end"; messages: unknown[] }
  | {
      type: "tool_execution_start";
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | {
      type: "tool_execution_end";
      toolCallId: string;
      toolName: string;
      result: unknown;
      isError: boolean;
    };

type ExtensionEventResult =
  | ContextEventResult
  | ToolCallEventResult
  | SessionBeforeCompactResult
  | undefined;

interface Extension {
  name: string;
  on(
    event: ExtensionEvent,
  ): ExtensionEventResult | Promise<ExtensionEventResult>;
}

export interface ExtensionFactory {
  create(): Extension;
}

export interface NazarExtensionConfig {
  channelName?: string;
  systemExecutor?: ISystemExecutor;
}

/** Dangerous bash patterns that should be blocked in tool calls. */
const BLOCKED_PATTERNS = [
  /\brm\s+-rf\s+\//, // rm -rf /
  /\bmkfs\b/, // filesystem format
  /\bdd\s+.*of=\/dev\//, // dd to device
  /:\(\)\s*\{/, // fork bomb
  /\bshutdown\b/, // shutdown
  /\breboot\b/, // reboot
];

function isDangerousCommand(command: string): boolean {
  return BLOCKED_PATTERNS.some((p) => p.test(command));
}

function getCompactionInstructions(channelName?: string): string {
  switch (channelName) {
    case "signal":
      return (
        "Preserve: user identity, current task, objects referenced. " +
        "Use concise format — Signal is mobile-first. " +
        "Discard: intermediate tool outputs, verbose logs."
      );
    case "web":
      return (
        "Preserve: user identity, current task, objects referenced, UI navigation state. " +
        "Discard: intermediate tool outputs, verbose logs, redundant context."
      );
    case "whatsapp":
      return (
        "Preserve: user identity, current task, objects referenced. " +
        "Use concise format — WhatsApp is mobile-first. " +
        "Discard: intermediate tool outputs, verbose logs."
      );
    default:
      return (
        "Preserve: user identity, current task, objects referenced, and conversation tone. " +
        "Discard: intermediate tool outputs, verbose logs, and redundant context."
      );
  }
}

export function createNazarExtension(
  config?: NazarExtensionConfig,
): ExtensionFactory {
  return {
    create(): Extension {
      return {
        name: "nazar",

        async on(event: ExtensionEvent): Promise<ExtensionEventResult> {
          switch (event.type) {
            case "context": {
              // Reason: context is injected at the start of every agent turn.
              // It tells the agent what tools are available and where data lives,
              // so it can make informed decisions without guessing paths or commands.
              const lines = [
                "## Nazar Runtime Context",
                `- Timestamp: ${new Date().toISOString()}`,
                `- Host: ${process.env.HOSTNAME || "nazar-box"}`,
                `- Objects dir: ${process.env.NAZAR_OBJECTS_DIR || "/var/lib/nazar/objects"}`,
                `- Skills dir: ${process.env.NAZAR_SKILLS_DIR || "/usr/local/share/nazar/skills"}`,
                `- Sessions dir: ${process.env.NAZAR_SESSIONS_DIR || "/var/lib/nazar/sessions"}`,
                "",
                "## Available CLI Tools",
                "Object store: `nazar-core object create|read|list|update|search|link`",
                "OS inspection: `nazar-core os status|upgrade-check|services|logs|containers|timers`",
              ];

              if (config?.systemExecutor) {
                const [osStatus, services, containers] = await Promise.all([
                  getBootcStatus(config.systemExecutor),
                  listNazarServices(config.systemExecutor),
                  listContainerHealth(config.systemExecutor),
                ]);
                lines.push("", "## OS Status", osStatus);
                lines.push("", "## Services", services);
                lines.push("", "## Containers", containers);
              }

              const contextMsg: AgentMessage = {
                role: "user",
                content: lines.join("\n"),
              };
              return { messages: [contextMsg] } satisfies ContextEventResult;
            }

            case "tool_call": {
              if (event.tool === "bash" || event.tool === "shell") {
                const cmd =
                  typeof event.input.command === "string"
                    ? event.input.command
                    : "";
                if (isDangerousCommand(cmd)) {
                  return {
                    block: true,
                    reason: `Blocked dangerous command: ${cmd.substring(0, 80)}`,
                  } satisfies ToolCallEventResult;
                }
              }
              return;
            }

            case "session_before_compact": {
              return {
                compaction: {
                  instructions: getCompactionInstructions(config?.channelName),
                },
              } satisfies SessionBeforeCompactResult;
            }

            case "agent_start": {
              console.log("[nazar] Agent turn started");
              return;
            }

            case "agent_end": {
              console.log("[nazar] Agent turn completed");
              return;
            }

            case "tool_execution_start": {
              console.log(
                `[nazar] Tool: ${event.toolName} (${event.toolCallId})`,
              );
              return;
            }

            case "tool_execution_end": {
              console.log(
                `[nazar] Tool: ${event.toolName} ${event.isError ? "FAILED" : "OK"}`,
              );
              return;
            }

            default:
              return;
          }
        },
      };
    },
  };
}
