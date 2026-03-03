import type {
  Capability,
  CapabilityConfig,
  CapabilityRegistration,
} from "../../capability.js";
import { QuadletSetupGenerator } from "./quadlet-generator.js";

export {
  parseInterval,
  QuadletSetupGenerator,
  renderQuadletContainer,
} from "./quadlet-generator.js";

export class SetupCapability implements Capability {
  readonly name = "setup";
  readonly description = "Quadlet file generation from NazarConfig";

  private generator?: QuadletSetupGenerator;

  init(_config: CapabilityConfig): CapabilityRegistration {
    this.generator = new QuadletSetupGenerator();
    return {};
  }

  getGenerator(): QuadletSetupGenerator {
    if (!this.generator) {
      this.generator = new QuadletSetupGenerator();
    }
    return this.generator;
  }
}
