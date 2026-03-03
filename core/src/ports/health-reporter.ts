/**
 * IHealthReporter port — writes periodic health markers for container health checks.
 *
 * Each bridge container has a Podman/Docker HEALTHCHECK that reads a timestamp
 * file (e.g. /tmp/nazar-health). This port's implementation writes that file
 * at a configured interval. If the bridge process hangs or crashes, the file
 * timestamp goes stale and Podman marks the container unhealthy.
 *
 * Handles: writing the health marker file, starting/stopping the periodic timer.
 * Does NOT handle: defining the health file path (that is an env-var concern),
 * or restarting the bridge on failure (Podman's RestartPolicy handles that).
 *
 * For implementation, see bridge-bootstrap.ts (HealthFileReporter class), which
 * is used by all bridge bootstrap flows via bootstrapBridge().
 */
export interface IHealthReporter {
  /** Write a health marker indicating the bridge is healthy. */
  markHealthy(): void;
  /** Start periodic health reporting at the given interval. */
  startPeriodicReporting(intervalMs: number): void;
  /** Stop periodic health reporting. */
  stopReporting(): void;
}
