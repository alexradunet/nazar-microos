/**
 * Capability system — every business feature is a self-contained module
 * that registers its contributions (tools, extensions, skills, CLI commands).
 *
 * Lifecycle diagram:
 * ```
 * register(cap)            → capability is known to the registry
 *   └─ initCapability(name) → cap.init(config) called once, registration stored
 *       └─ getExtensionFactories() / getSkillPaths()
 *           └─ disposeAll() → cap.dispose() called in reverse registration order
 * ```
 *
 * The phased init pattern (Phase 1 → 2 → 3) is orchestrated by defaults.ts,
 * NOT by this file. This file defines only the structural contracts.
 *
 * Does NOT handle: ordering of init, dependency injection between capabilities,
 * or the actual service implementations. For wiring, see defaults.ts.
 */

import type { ExtensionFactory } from "./capabilities/agent-session/extension.js";
import type { IConfigReader } from "./ports/config-reader.js";
import type { IFrontmatterParser } from "./ports/frontmatter-parser.js";
import type { IObjectStore } from "./ports/object-store.js";
import type { IPersonaLoader } from "./ports/persona-loader.js";
import type { ISystemExecutor } from "./ports/system-executor.js";
import type { NazarConfig } from "./types.js";

/**
 * Configuration passed to each capability during init.
 *
 * `services` is partial because Phase 1 capabilities receive no services
 * (they ARE the leaf services). Phase 2+ capabilities receive progressively
 * more services as earlier phases complete.
 *
 * For phase details, see createInitializedRegistry() in defaults.ts.
 */
export interface CapabilityConfig {
  nazar: NazarConfig;
  services: Partial<CoreServices>;
}

/**
 * Base services from Phase 1 leaf capabilities.
 *
 * These are the capabilities that have no service dependencies themselves
 * and are initialized first. All Phase 2+ capabilities can depend on these.
 */
export interface LeafServices {
  frontmatterParser: IFrontmatterParser;
  configReader: IConfigReader;
  systemExecutor: ISystemExecutor;
  personaLoader: IPersonaLoader;
}

/**
 * Full services including object store (available after Phase 2+).
 *
 * Reason: the object store depends on frontmatterParser and systemExecutor,
 * so it cannot be a leaf service and must be initialized in Phase 2.
 */
export interface CoreServices extends LeafServices {
  objectStore: IObjectStore;
}

/**
 * What a capability contributes when initialized.
 *
 * All fields are optional — a capability may contribute nothing (e.g. a
 * pure-service capability whose value is retrieved via a typed getter on
 * the capability class itself, not via the registration object).
 *
 * For the registry that aggregates these registrations, see registry.ts.
 */
export interface CapabilityRegistration {
  /** Pi extension factory for event hooks. */
  extensionFactory?: ExtensionFactory;
  /** Pi skill directories provided by this capability. */
  skillPaths?: string[];

  /** Validate the capability's config section. Returns error messages. */
  validateConfig?: (config: NazarConfig) => string[];
}

/**
 * A self-contained business capability module.
 *
 * Each capability encapsulates one domain (e.g. object store, agent session,
 * evolution management). It is registered once, initialized once per process,
 * and disposed on shutdown.
 *
 * Does NOT extend or inherit from a base class — capabilities are plain objects
 * implementing this interface, which keeps them lightweight and independently testable.
 */
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
