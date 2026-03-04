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
import type { PibloomConfig } from "./types.js";

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
  pibloom: PibloomConfig; // Parsed pibloom.yaml — every capability can read system config
  // Partial because Phase 1 caps get {} (they ARE the services), Phase 2 gets
  // LeafServices, Phase 3 gets full CoreServices. Each phase widens the bag.
  services: Partial<CoreServices>;
}

/**
 * Base services from Phase 1 leaf capabilities.
 *
 * These are the capabilities that have no service dependencies themselves
 * and are initialized first. All Phase 2+ capabilities can depend on these.
 */
export interface LeafServices {
  frontmatterParser: IFrontmatterParser; // YAML ↔ Markdown frontmatter parsing
  configReader: IConfigReader; // Read pibloom.yaml from disk
  systemExecutor: ISystemExecutor; // Run shell commands (child_process wrapper)
  personaLoader: IPersonaLoader; // Load agent persona files (SOUL.md, BODY.md, etc.)
}

/**
 * Full services including object store (available after Phase 2+).
 *
 * Reason: the object store depends on frontmatterParser and systemExecutor,
 * so it cannot be a leaf service and must be initialized in Phase 2.
 */
export interface CoreServices extends LeafServices {
  objectStore: IObjectStore; // Flat-file CRUD — available only after Phase 2 (depends on frontmatter + executor)
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
  validateConfig?: (config: PibloomConfig) => string[];
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
  readonly name: string; // Unique key used by registry (e.g. "object-store", "evolution")
  readonly description: string; // Human-readable label for diagnostics/logging
  // Called once during bootstrap. Receives config + available services for this phase.
  // Returns what this capability contributes (extensions, skills, validators).
  // Can be sync or async — the registry awaits either way.
  init(
    config: CapabilityConfig,
  ): Promise<CapabilityRegistration> | CapabilityRegistration;
  // Optional teardown — called by registry.disposeAll() in reverse registration order.
  // Use for closing connections, flushing buffers, cleaning temp files.
  dispose?(): Promise<void> | void;
}
