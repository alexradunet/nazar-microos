import fs from "node:fs";
import YAML from "js-yaml";
import type { NazarConfig } from "./types.js";

/**
 * Read and validate a nazar.yaml config file.
 * @throws If the file is missing, invalid YAML, or missing required fields.
 */
export function readConfig(configPath: string): NazarConfig {
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`config file not found: ${configPath}`);
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = YAML.load(raw, { schema: YAML.JSON_SCHEMA });
  } catch {
    throw new Error(`invalid YAML syntax in ${configPath}`);
  }

  if (parsed === null || parsed === undefined || typeof parsed !== "object") {
    throw new Error(`invalid YAML syntax in ${configPath}`);
  }

  const config = parsed as Record<string, unknown>;

  if (!config.hostname || config.hostname === "null") {
    throw new Error("required field 'hostname' is missing");
  }
  if (!config.primary_user || config.primary_user === "null") {
    throw new Error("required field 'primary_user' is missing");
  }

  // Validate heartbeat interval format if present
  const heartbeat = config.heartbeat as Record<string, unknown> | undefined;
  if (heartbeat?.interval !== undefined) {
    const interval = String(heartbeat.interval);
    if (!/^\d+[mhd]$/.test(interval)) {
      throw new Error(
        `invalid heartbeat interval: '${interval}' (must match /^\\d+[mhd]$/)`,
      );
    }
  }

  // Validate ttyd port if present
  const ttyd = config.ttyd as Record<string, unknown> | undefined;
  if (ttyd?.port !== undefined) {
    const port = Number(ttyd.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(
        `invalid ttyd port: '${ttyd.port}' (must be integer 1-65535)`,
      );
    }
  }

  // Validate ui port if present
  const ui = config.ui as Record<string, unknown> | undefined;
  if (ui?.port !== undefined) {
    const port = Number(ui.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(
        `invalid ui port: '${ui.port}' (must be integer 1-65535)`,
      );
    }
  }

  return {
    hostname: config.hostname as string,
    primary_user: config.primary_user as string,
    timezone: config.timezone as string | undefined,
    heartbeat: heartbeat as NazarConfig["heartbeat"],
    ttyd: ttyd as NazarConfig["ttyd"],
    signal: config.signal as NazarConfig["signal"],
    whatsapp: config.whatsapp as NazarConfig["whatsapp"],
    ui: ui as NazarConfig["ui"],
    pi: config.pi as NazarConfig["pi"],
    evolution: config.evolution as NazarConfig["evolution"],
    firewall: config.firewall as NazarConfig["firewall"],
  };
}

/**
 * Safely access a nested config value with a default fallback.
 */
export function configValue<T>(
  config: NazarConfig,
  path: string,
  defaultValue: T,
): T {
  const parts = path.split(".");
  let current: unknown = config;
  for (const part of parts) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object"
    ) {
      return defaultValue;
    }
    current = (current as Record<string, unknown>)[part];
  }
  if (current === undefined || current === null) {
    return defaultValue;
  }
  return current as T;
}
