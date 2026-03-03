import type { IHealthReporter } from "../ports/health-reporter.js";

/** Mock IHealthReporter for tests — records calls, no file I/O. */
export class MockHealthReporter implements IHealthReporter {
  markedHealthy = 0;
  reportingStarted = false;
  reportingStopped = false;
  private intervalMs?: number;

  markHealthy(): void {
    this.markedHealthy++;
  }

  startPeriodicReporting(intervalMs: number): void {
    this.reportingStarted = true;
    this.intervalMs = intervalMs;
  }

  stopReporting(): void {
    this.reportingStopped = true;
  }

  /** Get the interval used in startPeriodicReporting. */
  getIntervalMs(): number | undefined {
    return this.intervalMs;
  }

  /** Test helper: reset state. */
  reset(): void {
    this.markedHealthy = 0;
    this.reportingStarted = false;
    this.reportingStopped = false;
    this.intervalMs = undefined;
  }
}
