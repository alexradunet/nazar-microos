/**
 * IConfigReader port — reads and provides access to the nazar.yaml config file.
 *
 * Handles: parsing a YAML file into a typed NazarConfig, and safely
 * traversing nested config paths with a default fallback.
 * Does NOT handle: env-var overrides, config merging, or config validation.
 * For validation across all capabilities, see CapabilityRegistry.validateConfig()
 * in registry.ts.
 *
 * For implementation, see capabilities/config/yaml-config-reader.ts.
 */
import type { NazarConfig } from "../types.js";

/** Port for reading and accessing Nazar configuration. */
export interface IConfigReader {
  /** Read and validate a nazar.yaml config file. */
  read(path: string): NazarConfig;
  /** Safely access a nested config value with a default fallback. */
  value<T>(config: NazarConfig, path: string, defaultValue: T): T;
}
