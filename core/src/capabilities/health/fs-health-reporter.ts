import fs from "node:fs";
import path from "node:path";
import type { IHealthReporter } from "../../ports/health-reporter.js";

/** Writes a timestamp file to indicate the bridge is healthy. */
export class FsHealthReporter implements IHealthReporter {
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly healthDir: string) {}

  markHealthy(): void {
    fs.mkdirSync(this.healthDir, { recursive: true });
    const healthFile = path.join(this.healthDir, "last-healthy");
    fs.writeFileSync(healthFile, new Date().toISOString());
  }

  startPeriodicReporting(intervalMs: number): void {
    this.stopReporting();
    this.markHealthy();
    this.timer = setInterval(() => this.markHealthy(), intervalMs);
    // Don't hold the process open for health reporting
    if (this.timer.unref) this.timer.unref();
  }

  stopReporting(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
