import type {
  Capability,
  CapabilityConfig,
  CapabilityRegistration,
} from "../../capability.js";
import { JsYamlFrontmatterParser } from "./js-yaml-parser.js";

export { JsYamlFrontmatterParser } from "./js-yaml-parser.js";

export class FrontmatterCapability implements Capability {
  readonly name = "frontmatter";
  readonly description = "YAML frontmatter parsing and serialization";

  private parser?: JsYamlFrontmatterParser;

  init(_config: CapabilityConfig): CapabilityRegistration {
    this.parser = new JsYamlFrontmatterParser();
    return {};
  }

  getParser(): JsYamlFrontmatterParser {
    if (!this.parser) {
      this.parser = new JsYamlFrontmatterParser();
    }
    return this.parser;
  }
}
