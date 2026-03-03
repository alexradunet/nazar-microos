import type {
  Capability,
  CapabilityConfig,
  CapabilityRegistration,
} from "../../capability.js";
import { NodeSystemExecutor } from "./node-executor.js";

export { NodeSystemExecutor } from "./node-executor.js";

export class SystemExecutorCapability implements Capability {
  readonly name = "system-executor";
  readonly description = "Filesystem and process execution abstraction";

  private executor?: NodeSystemExecutor;

  init(_config: CapabilityConfig): CapabilityRegistration {
    this.executor = new NodeSystemExecutor();
    return {};
  }

  getExecutor(): NodeSystemExecutor {
    if (!this.executor) {
      this.executor = new NodeSystemExecutor();
    }
    return this.executor;
  }
}
