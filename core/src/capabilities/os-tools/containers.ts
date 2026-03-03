/**
 * Container health — Podman container inspection for Nazar services.
 *
 * Wraps `podman ps` for container state and health check results.
 * Filters to nazar-* containers only.
 *
 * Does NOT manage container lifecycle (start/stop/restart).
 * For container evolution, see capabilities/evolution/evolve-manager.ts.
 */

import type { ISystemExecutor } from "../../ports/system-executor.js";

/** Subset of fields from `podman ps --format json` output. */
interface PodmanContainer {
  Names?: string[];
  Image?: string;
  State?: string;
  Status?: string;
  StartedAt?: number;
  // Health check result if available
  Healthcheck?: {
    Status?: string;
  };
}

/**
 * listContainerHealth — returns a formatted table of nazar-* container states.
 *
 * Runs `podman ps --format json --filter name=nazar` and formats the result
 * with name, image, state, health status, and start time.
 * Returns a message if no nazar containers are running.
 */
export async function listContainerHealth(
  executor: ISystemExecutor,
): Promise<string> {
  const result = await executor.exec("podman", [
    "ps",
    "--format",
    "json",
    "--filter",
    "name=nazar",
  ]);

  if (result.exitCode !== 0) {
    return (
      "podman ps failed (exit code " +
      result.exitCode +
      "): " +
      result.stderr.trim()
    );
  }

  const output = result.stdout.trim();
  if (!output || output === "[]" || output === "") {
    return "No nazar containers currently running.";
  }

  let containers: PodmanContainer[];
  try {
    containers = JSON.parse(output) as PodmanContainer[];
  } catch {
    return "podman ps: could not parse JSON output";
  }

  if (containers.length === 0) {
    return "No nazar containers currently running.";
  }

  const lines: string[] = ["=== Nazar Container Health ==="];

  // Column headers
  lines.push(
    padRight("NAME", 30) +
      padRight("STATE", 12) +
      padRight("HEALTH", 12) +
      "IMAGE",
  );
  lines.push("-".repeat(80));

  for (const c of containers) {
    const name = (c.Names?.[0] ?? "(unknown)").replace(/^\//, "");
    const state = c.State ?? "(unknown)";
    const health = c.Healthcheck?.Status ?? c.Status ?? "-";
    const image = c.Image ?? "(unknown)";

    // Format start time if available
    let startedLine = "";
    if (c.StartedAt && c.StartedAt > 0) {
      const started = new Date(c.StartedAt * 1000).toISOString();
      startedLine = `  started: ${started}`;
    }

    lines.push(
      padRight(name, 30) + padRight(state, 12) + padRight(health, 12) + image,
    );

    if (startedLine) {
      lines.push(startedLine);
    }
  }

  return lines.join("\n");
}

/**
 * restartNazarContainer — restarts a nazar-* Podman container.
 *
 * Security: validates that the container name starts with "nazar-" before
 * running podman restart. Rejects arbitrary container names.
 *
 * @param executor   System executor for testability.
 * @param container  Container name, e.g. "nazar-signal-bridge".
 */
export async function restartNazarContainer(
  executor: ISystemExecutor,
  container: string,
): Promise<string> {
  if (!container.startsWith("nazar-")) {
    return `Access denied: container "${container}" does not start with "nazar-". Only nazar-* containers can be restarted.`;
  }

  const result = await executor.exec("podman", ["restart", container]);

  if (result.exitCode !== 0) {
    return (
      "podman restart failed (exit code " +
      result.exitCode +
      "): " +
      result.stderr.trim()
    );
  }

  return `Container ${container} restarted successfully.`;
}

/** Pad a string to a fixed width with spaces. */
function padRight(s: string, width: number): string {
  return s.length >= width
    ? `${s.slice(0, width - 1)} `
    : s + " ".repeat(width - s.length);
}
