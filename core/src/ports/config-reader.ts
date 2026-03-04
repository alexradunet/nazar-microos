/**
 * IConfigReader port — reads and provides access to the pibloom.yaml config file.
 *
 * Handles: parsing a YAML file into a typed PibloomConfig, and safely
 * traversing nested config paths with a default fallback.
 * Does NOT handle: env-var overrides, config merging, or config validation.
 * For validation across all capabilities, see CapabilityRegistry.validateConfig()
 * in registry.ts.
 *
 * For implementation, see capabilities/config/yaml-config-reader.ts.
 */
import type { PibloomConfig } from "../types.js";

/** Port for reading and accessing piBloom configuration. */
export interface IConfigReader {
  /** Read and validate a pibloom.yaml config file. */
  read(path: string): PibloomConfig;
  /** Safely access a nested config value with a default fallback. */
  value<T>(config: PibloomConfig, path: string, defaultValue: T): T;
}
