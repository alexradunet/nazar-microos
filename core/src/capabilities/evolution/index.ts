import type {
  Capability,
  CapabilityConfig,
  CapabilityRegistration,
} from "../../capability.js";
import { EvolveManager } from "./evolve-manager.js";

export { EvolveManager } from "./evolve-manager.js";

export class EvolutionCapability implements Capability {
  readonly name = "evolution";
  readonly description = "Container evolution lifecycle management";

  private manager?: EvolveManager;

  init(config: CapabilityConfig): CapabilityRegistration {
    if (!config.services.objectStore) {
      throw new Error("EvolutionCapability requires objectStore service");
    }
    if (!config.services.systemExecutor) {
      throw new Error("EvolutionCapability requires systemExecutor service");
    }
    const quadletDir =
      process.env.QUADLET_OUTPUT_DIR ?? "/etc/containers/systemd";
    const configPath =
      process.env.PIBLOOM_CONFIG ?? "/etc/pibloom/pibloom.yaml";
    this.manager = new EvolveManager(
      config.services.objectStore,
      config.services.systemExecutor,
      configPath,
      quadletDir,
    );
    return {};
  }

  getManager(): EvolveManager {
    if (!this.manager) {
      throw new Error("EvolutionCapability not initialized");
    }
    return this.manager;
  }
}
