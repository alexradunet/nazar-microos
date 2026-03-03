/** Port for reporting bridge health status. */
export interface IHealthReporter {
  /** Write a health marker indicating the bridge is healthy. */
  markHealthy(): void;
  /** Start periodic health reporting at the given interval. */
  startPeriodicReporting(intervalMs: number): void;
  /** Stop periodic health reporting. */
  stopReporting(): void;
}
