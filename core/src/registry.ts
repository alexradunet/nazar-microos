/**
 * CapabilityRegistry — composition root that collects and aggregates
 * contributions from all capabilities.
 *
 * Responsibilities:
 *   - Store capability instances by name
 *   - Initialize capabilities on demand or all at once
 *   - Aggregate cross-capability outputs (extension factories, skill paths,
 *     config validators)
 *   - Dispose all capabilities in reverse registration order on shutdown
 *
 * Does NOT handle: initialization ordering or phased bootstrapping. That
 * logic lives in defaults.ts (createInitializedRegistry). The registry
 * simply executes whatever init calls it receives, in the order given.
 *
 * Does NOT handle: dependency injection between capabilities. Each capability
 * receives the same CapabilityConfig; it is the caller's responsibility to
 * build a config with the right services for each phase.
 *
 * For phased bootstrap, see defaults.ts.
 * For the Capability interface, see capability.ts.
 */

import type { ExtensionFactory } from "./capabilities/agent-session/extension.js";
import type {
  Capability,
  CapabilityConfig,
  CapabilityRegistration,
} from "./capability.js";

export class CapabilityRegistry {
  // All registered capabilities, keyed by name. Insertion order = registration order.
  private capabilities = new Map<string, Capability>();
  // Results of init() calls, keyed by name. Presence here means "initialized".
  private registrations = new Map<string, CapabilityRegistration>();

  // Register a capability by name. Fails fast on duplicates to catch wiring bugs early.
  // Must be called before any init method.
  register(cap: Capability): void {
    if (this.capabilities.has(cap.name)) {
      throw new Error(`capability already registered: ${cap.name}`);
    }
    this.capabilities.set(cap.name, cap);
  }

  // Initialize every registered capability with the same config. Idempotent per capability.
  // Used in tests where phased bootstrapping isn't needed — just init everything at once.
  // Production code uses initCapability() per-capability instead (see defaults.ts).
  async initAll(config: CapabilityConfig): Promise<void> {
    for (const [name, cap] of this.capabilities) {
      if (!this.registrations.has(name)) {
        const registration = await cap.init(config);
        this.registrations.set(name, registration);
      }
    }
  }

  /**
   * Initialize a single capability by name. Skips if already initialized.
   *
   * Reason: phased bootstrap in defaults.ts calls initCapability() per
   * capability rather than initAll(), so it can pass different CapabilityConfig
   * (with different service sets) to different phases.
   */
  async initCapability(name: string, config: CapabilityConfig): Promise<void> {
    if (this.registrations.has(name)) return;
    const cap = this.capabilities.get(name);
    if (!cap) {
      throw new Error(`capability not found: ${name}`);
    }
    const registration = await cap.init(config);
    this.registrations.set(name, registration);
  }

  // Collect extension factories from all initialized capabilities.
  // Extensions hook into the Pi agent lifecycle (e.g. injecting system context).
  // Called by AgentSessionCapability when creating a new agent session.
  getExtensionFactories(): ExtensionFactory[] {
    const factories: ExtensionFactory[] = [];
    for (const reg of this.registrations.values()) {
      if (reg.extensionFactory) {
        factories.push(reg.extensionFactory);
      }
    }
    return factories;
  }

  // Collect SKILL.md directory paths from all initialized capabilities.
  // These are injected into the agent's system prompt so it knows its abilities.
  getSkillPaths(): string[] {
    const paths: string[] = [];
    for (const reg of this.registrations.values()) {
      if (reg.skillPaths) {
        paths.push(...reg.skillPaths);
      }
    }
    return paths;
  }

  /**
   * Dispose all capabilities in reverse registration order.
   *
   * Reason: reverse order ensures that capabilities which depend on other
   * capabilities are torn down before the capabilities they depend on.
   */
  async disposeAll(): Promise<void> {
    const caps = [...this.capabilities.values()].reverse();
    for (const cap of caps) {
      await cap.dispose?.();
    }
    this.registrations.clear();
  }

  // Typed getter — retrieves a capability instance cast to a specific subtype.
  // Callers use this to access capability-specific methods (e.g. getStore(), getParser())
  // that aren't part of the generic Capability interface.
  // Example: registry.get<ObjectStoreCapability>("object-store").getStore()
  get<T extends Capability>(name: string): T {
    const cap = this.capabilities.get(name);
    if (!cap) {
      throw new Error(`capability not found: ${name}`);
    }
    return cap as T;
  }
}
