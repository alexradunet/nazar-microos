import type {
  Capability,
  CapabilityConfig,
  CapabilityRegistration,
} from "../../capability.js";
import { TextAffordanceRenderer } from "./text-renderer.js";

export {
  type Affordance,
  type AgentResponse,
  isAffordance,
  parseAgentResponse,
  validateAffordance,
} from "./parser.js";
export { TextAffordanceRenderer } from "./text-renderer.js";

export class AffordancesCapability implements Capability {
  readonly name = "affordances";
  readonly description = "Structured action parsing, validation, and rendering";

  private renderer?: TextAffordanceRenderer;

  init(_config: CapabilityConfig): CapabilityRegistration {
    this.renderer = new TextAffordanceRenderer();
    return {};
  }

  getRenderer(): TextAffordanceRenderer {
    if (!this.renderer) {
      this.renderer = new TextAffordanceRenderer();
    }
    return this.renderer;
  }
}
