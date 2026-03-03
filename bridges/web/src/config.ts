import type { BridgeConfig } from "@nazar/core";
import { loadBaseBridgeConfig } from "@nazar/core";

export interface WebBridgeConfig extends BridgeConfig {
  port: number;
  sessionId: string;
}

export function loadConfig(): WebBridgeConfig {
  return {
    ...loadBaseBridgeConfig("Web"),
    port: Number(process.env.NAZAR_UI_PORT) || 3000,
    sessionId: "local",
    allowedContacts: [],
    timeoutMs: Number(process.env.NAZAR_WEB_TIMEOUT_MS) || 120_000,
  };
}
