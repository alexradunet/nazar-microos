import type { BridgeConfig } from "@nazar/core";

export interface WebBridgeConfig extends BridgeConfig {
  port: number;
  sessionId: string;
}

export function loadConfig(): WebBridgeConfig {
  return {
    port: Number(process.env.NAZAR_UI_PORT) || 3000,
    sessionId: "local",
    allowedContacts: [],
    personaDir:
      process.env.NAZAR_PERSONA_DIR || "/usr/local/share/nazar/persona",
    systemMdPath: process.env.NAZAR_SYSTEM_MD || "",
    channelName: "Web",
    piCommand: process.env.NAZAR_PI_COMMAND || "pi",
    piDir: process.env.PI_CODING_AGENT_DIR || `${process.env.HOME}/.pi/agent`,
    repoRoot: process.env.NAZAR_REPO_ROOT || "/var/lib/nazar",
    objectsDir: process.env.NAZAR_OBJECTS_DIR || "/var/lib/nazar/objects",
    skillsDir: process.env.NAZAR_SKILLS_DIR || "/usr/local/share/nazar/skills",
    timeoutMs: Number(process.env.NAZAR_WEB_TIMEOUT_MS) || 120_000,
    piModel: process.env.NAZAR_PI_MODEL || undefined,
    piTransport:
      (process.env.NAZAR_PI_TRANSPORT as "sse" | "websocket" | "auto") ||
      undefined,
  };
}
