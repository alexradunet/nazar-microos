import type {
  Capability,
  CapabilityConfig,
  CapabilityRegistration,
} from "../../capability.js";
import { FsPersonaLoader } from "./fs-persona-loader.js";

export { extractChannelSection, FsPersonaLoader } from "./fs-persona-loader.js";

export class PersonaCapability implements Capability {
  readonly name = "persona";
  readonly description =
    "OpenPersona 4-layer identity and system context loading";

  private loader?: FsPersonaLoader;

  init(_config: CapabilityConfig): CapabilityRegistration {
    this.loader = new FsPersonaLoader();
    return {};
  }

  getLoader(): FsPersonaLoader {
    if (!this.loader) {
      this.loader = new FsPersonaLoader();
    }
    return this.loader;
  }
}
