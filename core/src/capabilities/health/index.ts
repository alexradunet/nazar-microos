import type {
  Capability,
  CapabilityConfig,
  CapabilityRegistration,
} from "../../capability.js";
import { FsHealthReporter } from "./fs-health-reporter.js";

export { FsHealthReporter } from "./fs-health-reporter.js";

export class HealthCapability implements Capability {
  readonly name = "health";
  readonly description = "Bridge health status reporting";

  private reporter?: FsHealthReporter;

  init(_config: CapabilityConfig): CapabilityRegistration {
    const healthDir = process.env.NAZAR_HEALTH_DIR ?? "/var/lib/nazar/health";
    this.reporter = new FsHealthReporter(healthDir);
    return {};
  }

  getReporter(): FsHealthReporter {
    if (!this.reporter) {
      throw new Error("HealthCapability not initialized");
    }
    return this.reporter;
  }

  dispose(): void {
    this.reporter?.stopReporting();
  }
}
