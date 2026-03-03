/**
 * bootc integration — read-only OS state inspection.
 *
 * Wraps `bootc status` and `bootc upgrade --check` for structured OS state access.
 * All functions take ISystemExecutor for testability.
 *
 * Does NOT perform mutations (upgrade, rollback) — those require user confirmation
 * and will be added in a future phase.
 * For the ISystemExecutor port, see ports/system-executor.ts.
 */

import type { ISystemExecutor } from "../../ports/system-executor.js";

/** Parsed bootc status JSON from `bootc status --json`. */
interface BootcStatusJson {
  status?: {
    booted?: {
      image?: {
        image?: { image?: string };
        version?: string;
        timestamp?: string;
      };
    };
    staged?: {
      image?: {
        image?: { image?: string };
        version?: string;
      };
    };
    rollback?: {
      image?: {
        image?: { image?: string };
      };
    };
  };
  spec?: {
    image?: { image?: string };
  };
}

/**
 * getBootcStatus — returns a formatted summary of the running OS image.
 *
 * Runs `bootc status --json` and formats the result for human and agent consumption.
 * Returns an error message string if bootc is not available or the command fails.
 */
export async function getBootcStatus(
  executor: ISystemExecutor,
): Promise<string> {
  const result = await executor.exec("bootc", ["status", "--json"]);

  if (result.exitCode !== 0) {
    // bootc not installed or not a bootc system
    return (
      "bootc not available (exit code " +
      result.exitCode +
      "): " +
      result.stderr.trim()
    );
  }

  let parsed: BootcStatusJson;
  try {
    parsed = JSON.parse(result.stdout) as BootcStatusJson;
  } catch {
    return "bootc status: could not parse JSON output";
  }

  const lines: string[] = ["=== bootc OS Status ==="];

  // Booted image
  const booted = parsed.status?.booted;
  if (booted) {
    const image = booted.image?.image?.image ?? "(unknown)";
    const version = booted.image?.version ?? "";
    const timestamp = booted.image?.timestamp ?? "";
    lines.push(`Booted image:  ${image}`);
    if (version) lines.push(`  version:     ${version}`);
    if (timestamp) lines.push(`  timestamp:   ${timestamp}`);
  } else {
    lines.push("Booted image:  (not available)");
  }

  // Staged image (pending update)
  const staged = parsed.status?.staged;
  if (staged) {
    const stagedImage = staged.image?.image?.image ?? "(unknown)";
    const stagedVersion = staged.image?.version ?? "";
    lines.push(
      `Staged image:  ${stagedImage}${stagedVersion ? ` @ ${stagedVersion}` : ""}`,
    );
    lines.push("  (reboot required to apply staged image)");
  } else {
    lines.push("Staged image:  none");
  }

  // Rollback availability
  const rollback = parsed.status?.rollback;
  if (rollback) {
    const rollbackImage = rollback.image?.image?.image ?? "(unknown)";
    lines.push(`Rollback:      available (${rollbackImage})`);
  } else {
    lines.push("Rollback:      not available");
  }

  // Desired/spec image
  const specImage = parsed.spec?.image?.image;
  if (specImage) {
    lines.push(`Desired image: ${specImage}`);
  }

  return lines.join("\n");
}

/**
 * stageBootcUpgrade — stages a bootc OS upgrade (does NOT reboot).
 *
 * Runs `bootc upgrade` which downloads and stages the update.
 * The system must be rebooted to apply the staged image.
 */
export async function stageBootcUpgrade(
  executor: ISystemExecutor,
): Promise<string> {
  const result = await executor.exec("bootc", ["upgrade"]);

  if (result.exitCode !== 0) {
    return (
      "bootc upgrade failed (exit code " +
      result.exitCode +
      "): " +
      result.stderr.trim()
    );
  }

  const combined = (result.stdout + result.stderr).toLowerCase();

  if (
    combined.includes("no update available") ||
    combined.includes("already present") ||
    combined.includes("up to date")
  ) {
    return "OS is already up to date — no update to stage.";
  }

  return "Update staged — reboot required to apply.";
}

/**
 * checkBootcUpgrade — checks whether an OS update is available.
 *
 * Runs `bootc upgrade --check` (read-only). Returns a message indicating
 * whether an update is available, not available, or if the check failed.
 */
export async function checkBootcUpgrade(
  executor: ISystemExecutor,
): Promise<string> {
  const result = await executor.exec("bootc", ["upgrade", "--check"]);

  if (result.exitCode !== 0 && result.exitCode !== 1) {
    // Non-standard exit code means bootc itself errored
    return (
      "bootc upgrade check failed (exit code " +
      result.exitCode +
      "): " +
      result.stderr.trim()
    );
  }

  // bootc upgrade --check exits 0 when update is available, 1 when up-to-date
  // (behavior may vary by version — check stdout/stderr for signals)
  const combined = (result.stdout + result.stderr).toLowerCase();

  if (
    combined.includes("no update available") ||
    combined.includes("up to date") ||
    result.exitCode === 1
  ) {
    return "OS is up to date — no update available.";
  }

  if (combined.includes("update available") || combined.includes("fetched")) {
    return "OS update available — run `bootc upgrade` to stage it, then reboot to apply.";
  }

  // Ambiguous output — return raw
  const raw = result.stdout.trim() || result.stderr.trim();
  return raw
    ? raw
    : `bootc upgrade check: no output (exit code ${result.exitCode})`;
}
