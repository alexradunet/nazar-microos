/**
 * Nazar Pi extension — adds runtime context, tool guardrails, and compaction guidance.
 *
 * Registered via extensionFactories on DefaultResourceLoader.
 */

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
  | { type: "session_before_compact" };

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

export function createNazarExtension(): ExtensionFactory {
  return {
    create(): Extension {
      return {
        name: "nazar",

        on(event: ExtensionEvent): ExtensionEventResult {
          switch (event.type) {
            case "context": {
              const contextMsg: AgentMessage = {
                role: "user",
                content: [
                  "## Nazar Runtime Context",
                  `- Timestamp: ${new Date().toISOString()}`,
                  `- Host: ${process.env.HOSTNAME || "nazar-box"}`,
                  `- Objects dir: ${process.env.NAZAR_OBJECTS_DIR || "/var/lib/nazar/objects"}`,
                  `- Skills dir: ${process.env.NAZAR_SKILLS_DIR || "/usr/local/share/nazar/skills"}`,
                ].join("\n"),
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
                  instructions:
                    "Preserve: user identity, current task, objects referenced, and conversation tone. " +
                    "Discard: intermediate tool outputs, verbose logs, and redundant context.",
                },
              } satisfies SessionBeforeCompactResult;
            }

            default:
              return;
          }
        },
      };
    },
  };
}
