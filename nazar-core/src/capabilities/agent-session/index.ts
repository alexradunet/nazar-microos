import type {
  Capability,
  CapabilityConfig,
  CapabilityRegistration,
} from "../../capability.js";
import type { IPersonaLoader } from "../../ports/persona-loader.js";
import type { CapabilityRegistry } from "../../registry.js";
import { createNazarExtension } from "./extension.js";
import type { BridgeConfig } from "./pi-agent-bridge.js";
import { PiAgentBridge } from "./pi-agent-bridge.js";

export type { ExtensionFactory } from "./extension.js";
export { createNazarExtension } from "./extension.js";
export type { BridgeConfig } from "./pi-agent-bridge.js";
export {
  isAllowed,
  PiAgentBridge,
  validatePhoneNumber,
} from "./pi-agent-bridge.js";
export { SessionPool } from "./session-pool.js";

export class AgentSessionCapability implements Capability {
  readonly name = "agent-session";
  readonly description =
    "Pi AgentSession integration with session pooling and extensions";

  private personaLoader?: IPersonaLoader;
  private registry?: CapabilityRegistry;

  /** Optionally bind a registry so createBridge() can aggregate contributions. */
  setRegistry(registry: CapabilityRegistry): void {
    this.registry = registry;
  }

  init(config: CapabilityConfig): CapabilityRegistration {
    this.personaLoader = config.services.personaLoader;
    return {
      extensionFactory: createNazarExtension(),
    };
  }

  /**
   * Create a PiAgentBridge wired with extension factories and skill paths
   * from all registered capabilities.
   */
  createBridge(config: BridgeConfig): PiAgentBridge {
    const extensionFactories = this.registry?.getExtensionFactories() ?? [];
    const skillPaths = this.registry?.getSkillPaths() ?? [config.skillsDir];
    const personaLoader = this.personaLoader;

    return new PiAgentBridge(config, {
      extensionFactories,
      skillPaths,
      personaLoader,
    });
  }
}
