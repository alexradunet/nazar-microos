import fs from "node:fs";
import YAML from "js-yaml";
import type { IConfigReader } from "../../ports/config-reader.js";
import type { PibloomConfig } from "../../types.js";
import { configValue } from "./config-value.js";

export class YamlConfigReader implements IConfigReader {
  read(configPath: string): PibloomConfig {
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

    return {
      ...config,
      hostname: config.hostname as string,
      primary_user: config.primary_user as string,
      timezone: config.timezone as string | undefined,
      heartbeat: heartbeat as PibloomConfig["heartbeat"],
      agent: config.agent as PibloomConfig["agent"],
      evolution: config.evolution as PibloomConfig["evolution"],
      firewall: config.firewall as PibloomConfig["firewall"],
      bridges: config.bridges as PibloomConfig["bridges"],
    };
  }

  value<T>(config: PibloomConfig, path: string, defaultValue: T): T {
    return configValue(config, path, defaultValue);
  }
}
