/**
 * Default capability wiring — registers all built-in capabilities.
 *
 * Adding a new capability = one `register()` call here.
 *
 * Two factory functions:
 * - `createDefaultRegistry()` — registers all capabilities, caller inits
 * - `createInitializedRegistry(nazar)` — registers AND inits with phased
 *   bootstrapping (leaf capabilities first, then dependents).
 *
 * Phase diagram for createInitializedRegistry():
 * ```
 * Phase 1 — Leaf capabilities (no service dependencies)
 *   frontmatter, config, system-executor, persona, affordances, health, setup
 *   → These capabilities ARE the leaf services; they need nothing to init.
 *
 * Phase 2 — Capabilities that need leaf services
 *   object-store  (needs: frontmatterParser, systemExecutor)
 *   os-tools      (needs: systemExecutor)
 *   discovery     (needs: frontmatterParser, systemExecutor)
 *   → After this phase, IObjectStore is available.
 *
 * Phase 3 — Capabilities that need the full service set
 *   object-tools  (needs: objectStore)
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
import { HealthCapability } from "./capabilities/health/index.js";
import { ObjectStoreCapability } from "./capabilities/object-store/index.js";
import { ObjectToolsCapability } from "./capabilities/object-tools/index.js";
import { OsToolsCapability } from "./capabilities/os-tools/index.js";
import { PersonaCapability } from "./capabilities/persona/index.js";
import { SetupCapability } from "./capabilities/setup/index.js";
import { SystemExecutorCapability } from "./capabilities/system-executor/index.js";
import type { CapabilityConfig, LeafServices } from "./capability.js";
import { CapabilityRegistry } from "./registry.js";
import type { NazarConfig } from "./types.js";

/** Create a registry with all built-in capabilities registered (not initialized). */
export function createDefaultRegistry(): CapabilityRegistry {
  const registry = new CapabilityRegistry();
  registry.register(new FrontmatterCapability());
  registry.register(new ConfigCapability());
  registry.register(new SystemExecutorCapability());
  registry.register(new PersonaCapability());
  registry.register(new ObjectStoreCapability());
  registry.register(new AffordancesCapability());
  registry.register(new HealthCapability());
  registry.register(new SetupCapability());
  registry.register(new ObjectToolsCapability());
  registry.register(new OsToolsCapability());
  registry.register(new EvolutionCapability());
  registry.register(new DiscoveryCapability());
  registry.register(new AgentSessionCapability());
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
  nazar: NazarConfig,
): Promise<CapabilityRegistry> {
  const registry = new CapabilityRegistry();

  // Register all capabilities
  const frontmatter = new FrontmatterCapability();
  const configCap = new ConfigCapability();
  const sysExec = new SystemExecutorCapability();
  const persona = new PersonaCapability();
  const objectStore = new ObjectStoreCapability();
  const affordances = new AffordancesCapability();
  const health = new HealthCapability();
  const setup = new SetupCapability();
  const objectTools = new ObjectToolsCapability();
  const osTools = new OsToolsCapability();
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
    health,
    setup,
    objectTools,
    osTools,
    evolution,
    discovery,
    agentSession,
  ]) {
    registry.register(cap);
  }

  // Phase 1: Init leaf capabilities (no service dependencies)
  const phase1Config: CapabilityConfig = { nazar, services: {} };
  for (const name of [
    "frontmatter",
    "config",
    "system-executor",
    "persona",
    "affordances",
    "health",
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
  const phase2Config: CapabilityConfig = { nazar, services: leafServices };

  await registry.initCapability("object-store", phase2Config);
  await registry.initCapability("os-tools", phase2Config);
  await registry.initCapability("discovery", phase2Config);

  // Phase 3: Full services (with object store), init dependents
  const fullServices = { ...leafServices, objectStore: objectStore.getStore() };
  const phase3Config: CapabilityConfig = { nazar, services: fullServices };

  await registry.initCapability("object-tools", phase3Config);
  await registry.initCapability("evolution", phase3Config);

  // Reason: agent-session needs a registry reference to discover other
  // capabilities (e.g. extension factories, skill paths) at runtime.
  agentSession.setRegistry(registry);
  await registry.initCapability("agent-session", phase3Config);

  return registry;
}
