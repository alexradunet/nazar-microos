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
  private capabilities = new Map<string, Capability>();
  private registrations = new Map<string, CapabilityRegistration>();

  /** Register a capability. Must be called before initAll(). */
  register(cap: Capability): void {
    if (this.capabilities.has(cap.name)) {
      throw new Error(`capability already registered: ${cap.name}`);
    }
    this.capabilities.set(cap.name, cap);
  }

  /** Initialize all registered capabilities with the given config. */
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

  /** Aggregate extension factories from all capabilities. */
  getExtensionFactories(): ExtensionFactory[] {
    const factories: ExtensionFactory[] = [];
    for (const reg of this.registrations.values()) {
      if (reg.extensionFactory) {
        factories.push(reg.extensionFactory);
      }
    }
    return factories;
  }

  /** Aggregate skill paths from all capabilities. */
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

  /** Get a registered capability by name. */
  get<T extends Capability>(name: string): T {
    const cap = this.capabilities.get(name);
    if (!cap) {
      throw new Error(`capability not found: ${name}`);
    }
    return cap as T;
  }
}
