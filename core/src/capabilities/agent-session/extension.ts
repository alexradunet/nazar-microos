/**
 * piBloom Pi extension — adds runtime context, tool guardrails, and compaction guidance.
 *
 * Hooks into Pi SDK extension events to:
 * - Inject lightweight runtime context on every agent turn (context event)
 * - Block dangerous bash patterns before execution (tool_call event)
 * - Guide compaction with channel-specific instructions (session_before_compact)
 * - Log agent and tool lifecycle events for observability
 *
 * Heavy OS context (bootc status, services, containers, bridge lists) is NOT
 * pre-loaded here. The agent inspects system state on demand via direct
 * shell commands (bootc, systemctl, podman, journalctl).
 *
 * Does NOT register Pi tools directly — tool registration requires the full
 * Pi ExtensionAPI which is only available inside the SDK runtime.
 * For the object store CLI, see cli.ts (object subcommand).
 * For the AgentBridge that wires this extension, see ./pi-agent-bridge.ts.
 *
 * Registered via extensionFactories on DefaultResourceLoader.
 */

import type { IObjectStore } from "../../ports/object-store.js";

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

export interface PibloomExtensionConfig {
  channelName?: string;
  compactionInstructions?: string;
  objectStore?: IObjectStore;
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

const DEFAULT_COMPACTION_INSTRUCTIONS =
  "You are resuming after context compaction. Key guidelines:\n" +
  "- Preserve the user's name and conversation context\n" +
  "- Maintain your persona (Pi/Bloom) and current task state\n" +
  "- Keep any pending action items or promises\n" +
  "- Discard verbose command outputs and intermediate steps";

function getCompactionInstructions(compactionInstructions?: string): string {
  return compactionInstructions ?? DEFAULT_COMPACTION_INSTRUCTIONS;
}

export function createPibloomExtension(
  config?: PibloomExtensionConfig,
): ExtensionFactory {
  return {
    create(): Extension {
      return {
        name: "pibloom",

        async on(event: ExtensionEvent): Promise<ExtensionEventResult> {
          switch (event.type) {
            case "context": {
              // Lightweight context: paths and guidance only.
              // Use pibloom-core CLI tools to inspect system state on demand.
              const lines = [
                "## piBloom Runtime Context",
                `- Timestamp: ${new Date().toISOString()}`,
                `- Host: ${process.env.HOSTNAME || "pibloom-box"}`,
                `- Config path: ${process.env.PIBLOOM_CONFIG || "/etc/pibloom/pibloom.yaml"}`,
                `- Objects dir: ${process.env.PIBLOOM_OBJECTS_DIR || "/var/lib/pibloom/objects"}`,
                `- Skills dir: ${process.env.PIBLOOM_SKILLS_DIR || "/usr/local/share/pibloom/skills"}`,
                `- Sessions dir: ${process.env.PIBLOOM_SESSIONS_DIR || "/var/lib/pibloom/sessions"}`,
                "",
                "## Available CLI Tools",
                "Object store: `pibloom-core object create|read|list|update|search|link`",
                "OS operations: `bootc status`, `systemctl list-units 'pibloom-*'`, `podman ps --filter name=pibloom-`, `journalctl -u <service>`",
                "Bridge management: `pibloom-core bridge list|install|remove`",
                "",
                "## System Inspection",
                "Use these commands to inspect system state on demand:",
                "- `bootc status` — OS image, staged updates, rollback availability",
                "- `systemctl list-units 'pibloom-*' --no-pager` — list pibloom services and states",
                "- `podman ps --format json --filter 'name=pibloom-'` — running containers and health",
                "- `journalctl -u <service> --no-pager -n 50` — recent service logs",
                "- `systemctl list-timers 'pibloom-*' --no-pager` — scheduled timers",
                "- `pibloom-core bridge list` — available and installed bridges",
              ];

              if (config?.objectStore) {
                try {
                  const pending = config.objectStore.list("evolution", {
                    status: "proposed",
                  });
                  if (pending.length > 0) {
                    lines.push("", "## Pending Evolutions");
                    for (const e of pending) {
                      lines.push(`- ${e.slug}: ${e.title ?? "(untitled)"}`);
                    }
                  }
                } catch {
                  // Object store may not have evolution/ dir yet — ignore
                }
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
                  instructions: getCompactionInstructions(
                    config?.compactionInstructions,
                  ),
                },
              } satisfies SessionBeforeCompactResult;
            }

            case "agent_start": {
              console.log("[pibloom] Agent turn started");
              return;
            }

            case "agent_end": {
              console.log("[pibloom] Agent turn completed");
              return;
            }

            case "tool_execution_start": {
              console.log(
                `[pibloom] Tool: ${event.toolName} (${event.toolCallId})`,
              );
              return;
            }

            case "tool_execution_end": {
              console.log(
                `[pibloom] Tool: ${event.toolName} ${event.isError ? "FAILED" : "OK"}`,
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
