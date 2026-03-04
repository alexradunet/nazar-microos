/**
 * Default capability wiring — registers all built-in capabilities.
 *
 * Adding a new capability = one `register()` call here.
 *
 * Two factory functions:
 * - `createDefaultRegistry()` — registers all capabilities, caller inits
 * - `createInitializedRegistry(pibloom)` — registers AND inits with phased
 *   bootstrapping (leaf capabilities first, then dependents).
 *
 * Phase diagram for createInitializedRegistry():
 * ```
 * Phase 1 — Leaf capabilities (no service dependencies)
 *   frontmatter, config, system-executor, persona, affordances, setup
 *   → These capabilities ARE the leaf services; they need nothing to init.
 *
 * Phase 2 — Capabilities that need leaf services
 *   object-store  (needs: frontmatterParser, systemExecutor)
 *   discovery     (needs: frontmatterParser, systemExecutor)
 *   → After this phase, IObjectStore is available.
 *
 * Phase 3 — Capabilities that need the full service set
 *   evolution     (needs: objectStore + leaf services)
 *   agent-session (needs: objectStore + full services + registry reference)
 *   → After this phase, all capabilities are initialized.
 * ```
 *
 * For the registry that executes init calls, see registry.ts.
 * For the CapabilityConfig / LeafServices / CoreServices types, see capability.ts.
 */

import { AffordancesCapability } from "./capabilities/affordances/index.js";
import { AgentSessionCapability } from "./capabilities/agent-session/index.js";
import { ConfigCapability } from "./capabilities/config/index.js";
import { DiscoveryCapability } from "./capabilities/discovery/index.js";
import { EvolutionCapability } from "./capabilities/evolution/index.js";
import { FrontmatterCapability } from "./capabilities/frontmatter/index.js";
import { ObjectStoreCapability } from "./capabilities/object-store/index.js";
import { PersonaCapability } from "./capabilities/persona/index.js";
import { SetupCapability } from "./capabilities/setup/index.js";
import { SystemExecutorCapability } from "./capabilities/system-executor/index.js";
import type { CapabilityConfig, LeafServices } from "./capability.js";
import { CapabilityRegistry } from "./registry.js";
import type { PibloomConfig } from "./types.js";

// Register-only factory: all capabilities are known but none are initialized.
// Used by tests that want to selectively init specific capabilities with mock services.
export function createDefaultRegistry(): CapabilityRegistry {
  const registry = new CapabilityRegistry();
  registry.register(new FrontmatterCapability()); // YAML ↔ Markdown frontmatter
  registry.register(new ConfigCapability()); // pibloom.yaml reader
  registry.register(new SystemExecutorCapability()); // Shell command executor
  registry.register(new PersonaCapability()); // Agent identity file loader
  registry.register(new ObjectStoreCapability()); // Flat-file CRUD store
  registry.register(new AffordancesCapability()); // HATEOAS response formatting
  registry.register(new SetupCapability()); // Quadlet file generation
  registry.register(new EvolutionCapability()); // Container deploy/rollback lifecycle
  registry.register(new DiscoveryCapability()); // Bridge manifest parsing
  registry.register(new AgentSessionCapability()); // Pi agent session management
  return registry;
}

/**
 * Create, register, and initialize all capabilities with phased bootstrapping.
 *
 * Phase 1: Init leaf capabilities (no service dependencies)
 * Phase 2: Build CoreServices from leaf capability instances
 * Phase 3: Init dependent capabilities with full CoreServices
 */
export async function createInitializedRegistry(
  pibloom: PibloomConfig,
): Promise<CapabilityRegistry> {
  const registry = new CapabilityRegistry();

  // Instantiate all capabilities. We keep local references so we can call
  // typed getters (e.g. frontmatter.getParser()) after Phase 1 init to
  // build the LeafServices bag for Phase 2.
  const frontmatter = new FrontmatterCapability();
  const configCap = new ConfigCapability();
  const sysExec = new SystemExecutorCapability();
  const persona = new PersonaCapability();
  const objectStore = new ObjectStoreCapability();
  const affordances = new AffordancesCapability();
  const setup = new SetupCapability();
  const evolution = new EvolutionCapability();
  const discovery = new DiscoveryCapability();
  const agentSession = new AgentSessionCapability();

  for (const cap of [
    frontmatter,
    configCap,
    sysExec,
    persona,
    objectStore,
    affordances,
    setup,
    evolution,
    discovery,
    agentSession,
  ]) {
    registry.register(cap);
  }

  // Phase 1: Init leaf capabilities (no service dependencies)
  const phase1Config: CapabilityConfig = { pibloom, services: {} };
  for (const name of [
    "frontmatter",
    "config",
    "system-executor",
    "persona",
    "affordances",
    "setup",
  ]) {
    await registry.initCapability(name, phase1Config);
  }

  // Phase 2: Build leaf services, init capabilities that need them
  // Reason: typed getters on each capability class extract the initialized
  // service instance so it can be passed as a dependency to Phase 2+ caps.
  const leafServices: LeafServices = {
    frontmatterParser: frontmatter.getParser(),
    configReader: configCap.getReader(),
    systemExecutor: sysExec.getExecutor(),
    personaLoader: persona.getLoader(),
  };
  const phase2Config: CapabilityConfig = { pibloom, services: leafServices };

  await registry.initCapability("object-store", phase2Config);
  await registry.initCapability("discovery", phase2Config);

  // Phase 3: Full services (with object store), init dependents
  const fullServices = { ...leafServices, objectStore: objectStore.getStore() };
  const phase3Config: CapabilityConfig = { pibloom, services: fullServices };

  await registry.initCapability("evolution", phase3Config);

  // Reason: agent-session needs a registry reference to discover other
  // capabilities (e.g. extension factories, skill paths) at runtime.
  agentSession.setRegistry(registry);
  await registry.initCapability("agent-session", phase3Config);

  return registry;
}
