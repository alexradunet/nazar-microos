/**
 * Health analyzer — detects anomalies in OS data already gathered by the context event.
 *
 * Inspects the string output from getBootcStatus, listNazarServices, and
 * listContainerHealth for known problem patterns. Returns structured alerts
 * that the extension injects as a `## Health Alerts` section.
 *
 * Does NOT perform any system calls — it only parses existing output strings.
 */

export interface HealthAlert {
  severity: "critical" | "warning" | "info";
  message: string;
}

/**
 * analyzeHealth — scans OS status, services, and container strings for anomalies.
 *
 * Detection rules:
 * - critical: container state "exited" or "dead"
 * - critical: service output contains "failed"
 * - warning: osStatus contains a staged image (not "none")
 * - warning: container health contains "unhealthy"
 * - info: no nazar services running
 */
export function analyzeHealth(
  osStatus: string,
  services: string,
  containers: string,
): HealthAlert[] {
  const alerts: HealthAlert[] = [];

  // --- Container state anomalies ---
  // Parse container lines for exited/dead states.
  // Container output is a table with NAME, STATE, HEALTH, IMAGE columns.
  for (const line of containers.split("\n")) {
    const lower = line.toLowerCase();
    if (lower.includes("exited") || lower.includes("dead")) {
      // Extract container name (first non-whitespace token on the line)
      const name = line.trim().split(/\s+/)[0];
      if (name && name !== "NAME" && !name.startsWith("-")) {
        alerts.push({
          severity: "critical",
          message: `Container ${name} has exited`,
        });
      }
    }
    if (lower.includes("unhealthy")) {
      const name = line.trim().split(/\s+/)[0];
      if (name && name !== "NAME" && !name.startsWith("-")) {
        alerts.push({
          severity: "warning",
          message: `Container ${name} is unhealthy`,
        });
      }
    }
  }

  // --- Service anomalies ---
  for (const line of services.split("\n")) {
    const lower = line.toLowerCase();
    if (lower.includes("failed")) {
      // Extract service unit name
      const name = line.trim().split(/\s+/)[0];
      if (name && name !== "UNIT" && !name.startsWith("-")) {
        alerts.push({
          severity: "critical",
          message: `Service ${name} has failed`,
        });
      }
    }
  }

  // --- OS staged update ---
  // The getBootcStatus output has "Staged image:  none" when no update is pending.
  // Any other value after "Staged image:" means an update is staged.
  const stagedMatch = osStatus.match(/Staged image:\s+(.+)/);
  if (stagedMatch) {
    const stagedValue = stagedMatch[1].trim().toLowerCase();
    if (stagedValue !== "none") {
      alerts.push({
        severity: "warning",
        message: "OS update staged — reboot required",
      });
    }
  }

  // --- No services running ---
  if (
    services.toLowerCase().includes("no nazar-* systemd units found") ||
    services.toLowerCase().includes("no nazar")
  ) {
    alerts.push({
      severity: "info",
      message: "No nazar services running",
    });
  }

  return alerts;
}

const SEVERITY_PREFIX: Record<HealthAlert["severity"], string> = {
  critical: "⚠ CRITICAL",
  warning: "⚠ WARNING",
  info: "ℹ INFO",
};

/**
 * formatAlerts — renders alerts into a text block for context injection.
 *
 * Returns empty string if no alerts, otherwise formatted lines.
 */
export function formatAlerts(alerts: HealthAlert[]): string {
  if (alerts.length === 0) return "";
  return alerts
    .map((a) => `${SEVERITY_PREFIX[a.severity]}: ${a.message}`)
    .join("\n");
}
