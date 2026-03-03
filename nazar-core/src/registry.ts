/**
 * CapabilityRegistry — composition root that collects and aggregates
 * contributions from all capabilities.
 */

import type {
  Capability,
  CapabilityConfig,
  CapabilityRegistration,
  CliCommand,
} from "./capability.js";
import type { ExtensionFactory } from "./extension.js";
import type { NazarConfig } from "./types.js";

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

  /** Initialize a single capability by name. Skips if already initialized. */
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

  /** Aggregate CLI commands from all capabilities. */
  getCliCommands(): CliCommand[] {
    const commands: CliCommand[] = [];
    for (const reg of this.registrations.values()) {
      if (reg.cliCommands) {
        commands.push(...reg.cliCommands);
      }
    }
    return commands;
  }

  /** Validate config across all capabilities. Returns all error messages. */
  validateConfig(config: NazarConfig): string[] {
    const errors: string[] = [];
    for (const reg of this.registrations.values()) {
      if (reg.validateConfig) {
        errors.push(...reg.validateConfig(config));
      }
    }
    return errors;
  }

  /** Dispose all capabilities in reverse registration order. */
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
