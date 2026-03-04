import type { IConfigReader } from "../ports/config-reader.js";
import type { PibloomConfig } from "../types.js";

/** Mock IConfigReader for tests — returns canned config. */
export class MockConfigReader implements IConfigReader {
  constructor(private config: PibloomConfig) {}

  read(_path: string): PibloomConfig {
    return this.config;
  }

  value<T>(config: PibloomConfig, keyPath: string, defaultVal: T): T {
    const keys = keyPath.split(".");
    let current: unknown = config;
    for (const key of keys) {
      if (
        current === null ||
        current === undefined ||
        typeof current !== "object"
      ) {
        return defaultVal;
      }
      current = (current as Record<string, unknown>)[key];
    }
    return (current as T) ?? defaultVal;
  }
}
