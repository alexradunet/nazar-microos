/**
 * Capability system — every business feature is a self-contained module
 * that registers its contributions (tools, extensions, skills, CLI commands).
 */

import type { ExtensionFactory } from "./extension.js";
import type { IConfigReader } from "./ports/config-reader.js";
import type { IFrontmatterParser } from "./ports/frontmatter-parser.js";
import type { IObjectStore } from "./ports/object-store.js";
import type { IPersonaLoader } from "./ports/persona-loader.js";
import type { ISystemExecutor } from "./ports/system-executor.js";
import type { NazarConfig } from "./types.js";

/** Configuration passed to each capability during init. */
export interface CapabilityConfig {
  nazar: NazarConfig;
  services: CoreServices;
}

/** Shared services available to all capabilities. */
export interface CoreServices {
  objectStore: IObjectStore;
  frontmatterParser: IFrontmatterParser;
  systemExecutor: ISystemExecutor;
  configReader: IConfigReader;
  personaLoader: IPersonaLoader;
}

/** CLI command contributed by a capability. */
export interface CliCommand {
  name: string;
  description: string;
  run(
    args: string[],
    flags: Record<string, string>,
    boolFlags: Set<string>,
  ): Promise<void> | void;
}

/** What a capability contributes when initialized. */
export interface CapabilityRegistration {
  /** Pi extension factory for event hooks. */
  extensionFactory?: ExtensionFactory;
  /** Pi skill directories provided by this capability. */
  skillPaths?: string[];
  /** CLI subcommands provided by this capability. */
  cliCommands?: CliCommand[];
  /** Validate the capability's config section. Returns error messages. */
  validateConfig?: (config: NazarConfig) => string[];
}

/** A self-contained business capability module. */
export interface Capability {
  readonly name: string;
  readonly description: string;
  /** Initialize the capability and return its registrations. */
  init(
    config: CapabilityConfig,
  ): Promise<CapabilityRegistration> | CapabilityRegistration;
  /** Dispose of resources held by this capability. */
  dispose?(): Promise<void> | void;
}
