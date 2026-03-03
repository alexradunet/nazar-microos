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

import type { IObjectStore } from "../../ports/object-store.js";
import type { ISystemExecutor } from "../../ports/system-executor.js";
import { parseBridgeManifest } from "../discovery/bridge-manifest.js";
import { getBootcStatus } from "../os-tools/bootc.js";
import { listContainerHealth } from "../os-tools/containers.js";
import { analyzeHealth, formatAlerts } from "../os-tools/health-analyzer.js";
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
  compactionInstructions?: string;
  systemExecutor?: ISystemExecutor;
  objectStore?: IObjectStore;
  referenceBridgesDir?: string;
  quadletDir?: string;
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
  "- Maintain your persona (Pi/Nazar) and current task state\n" +
  "- Keep any pending action items or promises\n" +
  "- Discard verbose command outputs and intermediate steps";

function getCompactionInstructions(compactionInstructions?: string): string {
  return compactionInstructions ?? DEFAULT_COMPACTION_INSTRUCTIONS;
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
                "OS operations: `nazar-core os status|upgrade-check|upgrade|services|logs|containers|timers|restart-service|restart-container`",
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

                const alerts = analyzeHealth(osStatus, services, containers);
                const alertBlock = formatAlerts(alerts);
                if (alertBlock) {
                  lines.push("", "## Health Alerts", alertBlock);
                }
              }

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

              if (config?.systemExecutor) {
                const refDir =
                  config.referenceBridgesDir ??
                  "/usr/local/share/nazar/reference/bridges";
                lines.push("", "## Available Bridges");
                try {
                  const entries = await config.systemExecutor.readDir(refDir);
                  const bridgeLines: string[] = [];
                  for (const entry of entries) {
                    try {
                      const isDir = await config.systemExecutor.isDirectory(
                        `${refDir}/${entry}`,
                      );
                      if (!isDir) continue;
                      const raw = await config.systemExecutor.readFile(
                        `${refDir}/${entry}/manifest.yaml`,
                      );
                      const manifest = parseBridgeManifest(raw);
                      const { name, description, version } = manifest.metadata;
                      bridgeLines.push(
                        `- ${name}: ${description} (v${version})`,
                      );
                    } catch {
                      // Skip entries with missing or invalid manifests
                    }
                  }
                  if (bridgeLines.length > 0) {
                    lines.push(...bridgeLines);
                  } else {
                    lines.push("No reference bridges found");
                  }
                } catch {
                  lines.push("No reference bridges found");
                }

                const quadletDir =
                  config.quadletDir ?? "/etc/containers/systemd/";
                lines.push("", "## Installed Bridges");
                try {
                  const files = await config.systemExecutor.readDir(quadletDir);
                  const bridgeFiles = files.filter(
                    (f) => f.endsWith(".container") && f.includes("bridge"),
                  );
                  if (bridgeFiles.length > 0) {
                    for (const file of bridgeFiles) {
                      const serviceName = file.replace(/\.container$/, "");
                      let status = "unknown";
                      try {
                        const result = await config.systemExecutor.exec(
                          "systemctl",
                          ["is-active", serviceName],
                        );
                        status =
                          result.exitCode === 0
                            ? result.stdout.trim() || "active"
                            : result.stdout.trim() || "inactive";
                      } catch {
                        // systemctl not available — leave status as unknown
                      }
                      lines.push(`- ${serviceName} (${status})`);
                    }
                  } else {
                    lines.push("No bridges installed");
                  }
                } catch {
                  lines.push("No bridges installed");
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
