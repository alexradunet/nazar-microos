import type {
  Capability,
  CapabilityConfig,
  CapabilityRegistration,
} from "../../capability.js";
import type { IObjectStore } from "../../ports/object-store.js";
import type { IPersonaLoader } from "../../ports/persona-loader.js";
import type { ISystemExecutor } from "../../ports/system-executor.js";
import type { CapabilityRegistry } from "../../registry.js";
import { createNazarExtension } from "./extension.js";
import type { BridgeConfig } from "./pi-agent-bridge.js";
import { AgentBridge } from "./pi-agent-bridge.js";

export type { ExtensionFactory, NazarExtensionConfig } from "./extension.js";
export { createNazarExtension } from "./extension.js";
export type { BridgeConfig } from "./pi-agent-bridge.js";
export {
  AgentBridge,
  /** @deprecated Use AgentBridge instead. */
  AgentBridge as PiAgentBridge,
  isAllowed,
  validatePhoneNumber,
} from "./pi-agent-bridge.js";
export { SessionPool } from "./session-pool.js";

export class AgentSessionCapability implements Capability {
  readonly name = "agent-session";
  readonly description =
    "LLM agent session integration with session pooling and extensions";

  private personaLoader?: IPersonaLoader;
  private systemExecutor?: ISystemExecutor;
  private objectStore?: IObjectStore;
  private registry?: CapabilityRegistry;

  /** Optionally bind a registry so createBridge() can aggregate contributions. */
  setRegistry(registry: CapabilityRegistry): void {
    this.registry = registry;
  }

  init(config: CapabilityConfig): CapabilityRegistration {
    this.personaLoader = config.services.personaLoader;
    this.systemExecutor = config.services.systemExecutor;
    this.objectStore = config.services.objectStore;
    return {};
  }

  /**
   * Create a PiAgentBridge wired with extension factories and skill paths
   * from all registered capabilities.
   */
  createBridge(config: BridgeConfig): AgentBridge {
    const extensionFactories = this.registry?.getExtensionFactories() ?? [];
    // Add channel-specific Nazar extension
    extensionFactories.push(
      createNazarExtension({
        channelName: config.channelName,
        systemExecutor: this.systemExecutor,
        objectStore: this.objectStore,
      }),
    );
    const skillPaths = this.registry?.getSkillPaths() ?? [config.skillsDir];
    const personaLoader = this.personaLoader;

    return new AgentBridge(config, {
      extensionFactories,
      skillPaths,
      personaLoader,
    });
  }
}
