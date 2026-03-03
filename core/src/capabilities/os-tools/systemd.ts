/**
 * systemd integration — Nazar service and timer inspection.
 *
 * Wraps systemctl and journalctl for nazar-* unit management.
 * Restricts queries to nazar-* prefix for security.
 *
 * Does NOT manage non-nazar services.
 * For Quadlet file generation, see capabilities/setup/quadlet-generator.ts.
 */

import type { ISystemExecutor } from "../../ports/system-executor.js";

/**
 * listNazarServices — lists all nazar-* systemd units and their states.
 *
 * Runs `systemctl list-units 'nazar-*'` and formats the output as a table.
 * Returns a message if no units are found.
 */
export async function listNazarServices(
  executor: ISystemExecutor,
): Promise<string> {
  const result = await executor.exec("systemctl", [
    "list-units",
    "nazar-*",
    "--no-pager",
    "--plain",
  ]);

  if (result.exitCode !== 0) {
    return (
      "systemctl list-units failed (exit code " +
      result.exitCode +
      "): " +
      result.stderr.trim()
    );
  }

  const output = result.stdout.trim();
  if (!output || output.includes("0 units listed") || output === "") {
    return "No nazar-* systemd units found.";
  }

  return `=== Nazar Services ===\n${output}`;
}

/**
 * getServiceLogs — retrieves recent journal entries for a nazar-* service.
 *
 * Security: validates that service starts with "nazar-" before running
 * journalctl. Rejects arbitrary service names to prevent information leakage.
 *
 * @param executor  System executor for testability.
 * @param service   Service unit name, e.g. "nazar-heartbeat.service".
 * @param lines     Number of log lines to return (default 50).
 */
export async function getServiceLogs(
  executor: ISystemExecutor,
  service: string,
  lines = 50,
): Promise<string> {
  // Security: only allow nazar-* services to prevent accessing arbitrary units.
  if (!service.startsWith("nazar-")) {
    return `Access denied: service "${service}" does not start with "nazar-". Only nazar-* services are accessible.`;
  }

  const result = await executor.exec("journalctl", [
    "-u",
    service,
    "-n",
    String(lines),
    "--no-pager",
  ]);

  if (result.exitCode !== 0) {
    return (
      "journalctl failed (exit code " +
      result.exitCode +
      "): " +
      result.stderr.trim()
    );
  }

  const output = result.stdout.trim();
  if (!output) {
    return `No log entries found for ${service}.`;
  }

  return `=== Logs: ${service} (last ${lines} lines) ===\n${output}`;
}

/**
 * listNazarTimers — lists all nazar-* systemd timers with their schedules.
 *
 * Runs `systemctl list-timers 'nazar-*'` and returns the schedule table.
 * Returns a message if no timers are configured.
 */
/**
 * restartNazarService — restarts a nazar-* systemd service.
 *
 * Security: validates that service starts with "nazar-" before running
 * systemctl restart. Rejects arbitrary service names.
 *
 * @param executor  System executor for testability.
 * @param service   Service unit name, e.g. "nazar-heartbeat.service".
 */
export async function restartNazarService(
  executor: ISystemExecutor,
  service: string,
): Promise<string> {
  if (!service.startsWith("nazar-")) {
    return `Access denied: service "${service}" does not start with "nazar-". Only nazar-* services can be restarted.`;
  }

  const result = await executor.exec("systemctl", ["restart", service]);

  if (result.exitCode !== 0) {
    return (
      "systemctl restart failed (exit code " +
      result.exitCode +
      "): " +
      result.stderr.trim()
    );
  }

  return `Service ${service} restarted successfully.`;
}

export async function listNazarTimers(
  executor: ISystemExecutor,
): Promise<string> {
  const result = await executor.exec("systemctl", [
    "list-timers",
    "nazar-*",
    "--no-pager",
    "--plain",
  ]);

  if (result.exitCode !== 0) {
    return (
      "systemctl list-timers failed (exit code " +
      result.exitCode +
      "): " +
      result.stderr.trim()
    );
  }

  const output = result.stdout.trim();
  if (!output || output.includes("0 timers listed")) {
    return "No nazar-* systemd timers found.";
  }

  return `=== Nazar Timers ===\n${output}`;
}
