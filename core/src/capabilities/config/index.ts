import type {
  Capability,
  CapabilityConfig,
  CapabilityRegistration,
} from "../../capability.js";
import type { PibloomConfig } from "../../types.js";
import { YamlConfigReader } from "./yaml-config-reader.js";

export { configValue } from "./config-value.js";
export { YamlConfigReader } from "./yaml-config-reader.js";

export class ConfigCapability implements Capability {
  readonly name = "config";
  readonly description = "YAML configuration reading and validation";

  private reader?: YamlConfigReader;

  init(_config: CapabilityConfig): CapabilityRegistration {
    this.reader = new YamlConfigReader();
    return {
      validateConfig: (config: PibloomConfig) => this.validate(config),
    };
  }

  getReader(): YamlConfigReader {
    if (!this.reader) {
      this.reader = new YamlConfigReader();
    }
    return this.reader;
  }

  private validate(config: PibloomConfig): string[] {
    const errors: string[] = [];
    if (!config.hostname) errors.push("required field 'hostname' is missing");
    if (!config.primary_user)
      errors.push("required field 'primary_user' is missing");
    return errors;
  }
}
