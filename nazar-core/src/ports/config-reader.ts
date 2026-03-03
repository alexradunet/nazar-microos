import type { NazarConfig } from "../types.js";

/** Port for reading and accessing Nazar configuration. */
export interface IConfigReader {
  /** Read and validate a nazar.yaml config file. */
  read(path: string): NazarConfig;
  /** Safely access a nested config value with a default fallback. */
  value<T>(config: NazarConfig, path: string, defaultValue: T): T;
}
