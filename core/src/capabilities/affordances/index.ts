import type {
  Capability,
  CapabilityConfig,
  CapabilityRegistration,
} from "../../capability.js";

export {
  type HateoasResponse,
  isLink,
  type Link,
  type ParsedAgentOutput,
  parseAgentOutput,
  toHateoasResponse,
  validateLink,
} from "./parser.js";
export { type ResponseRenderer, TextRenderer } from "./text-renderer.js";

export class AffordancesCapability implements Capability {
  readonly name = "affordances";
  readonly description = "HATEOAS link parsing, validation, and rendering";

  init(_config: CapabilityConfig): CapabilityRegistration {
    return {};
  }
}
