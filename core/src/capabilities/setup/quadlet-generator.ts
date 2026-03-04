import path from "node:path";
import type {
  ContainerSpec,
  GeneratedFile,
  PibloomConfig,
} from "../../types.js";
import { configValue } from "../config/config-value.js";
import type { PodSpec, TimerSpec } from "../discovery/bridge-manifest.js";

/**
 * Convert a human interval (30m, 2h, 3d) to a systemd OnCalendar expression.
 */
export function parseInterval(interval: string): string {
  const match = interval.match(/^(\d+)([mhd])$/);
  if (!match) {
    return "*:0/30"; // fallback
  }
  const num = match[1];
  const unit = match[2];
  switch (unit) {
    case "m":
      return `*:0/${num}`;
    case "h":
      return `*-*-* 0/${num}:00:00`;
    case "d":
      return `*-*-1/${num} 00:00:00`;
    default:
      return "*:0/30";
  }
}

/**
 * Render a Quadlet .container file from a container spec.
 * Shared by both setup and evolve.
 */
export function renderQuadletContainer(spec: ContainerSpec): string {
  const lines: string[] = [];

  lines.push("[Unit]");
  lines.push(`Description=${spec.description}`);
  lines.push(`After=${spec.after ?? "network-online.target"}`);
  lines.push("");

  lines.push("[Container]");
  lines.push(`Image=${spec.image}`);

  if (spec.pod) {
    lines.push(`Pod=${spec.pod}`);
  }

  if (spec.volumes) {
    for (const vol of spec.volumes) {
      lines.push(`Volume=${vol}`);
    }
  }

  if (spec.environment) {
    for (const [key, val] of Object.entries(spec.environment)) {
      lines.push(`Environment=${key}=${val}`);
    }
  }

  if (spec.publishPorts) {
    for (const port of spec.publishPorts) {
      lines.push(`PublishPort=${port}`);
    }
  }

  if (spec.readOnly) {
    lines.push("ReadOnly=true");
  }
  if (spec.noNewPrivileges) {
    lines.push("NoNewPrivileges=true");
  }

  lines.push("");
  lines.push("[Service]");
  if (spec.serviceType) {
    lines.push(`Type=${spec.serviceType}`);
  }
  lines.push(`Restart=${spec.restart ?? "always"}`);

  lines.push("");
  lines.push("[Install]");
  lines.push(`WantedBy=${spec.wantedBy ?? "default.target"}`);
  lines.push("");

  return lines.join("\n");
}

/** Render a Quadlet .pod file from a pod spec. */
export function renderQuadletPod(spec: PodSpec): string {
  const lines: string[] = [];
  lines.push("[Unit]");
  lines.push(`Description=${spec.description ?? spec.name}`);
  if (spec.after) {
    lines.push(`After=${spec.after}`);
  }
  lines.push("");
  lines.push("[Pod]");
  lines.push("");
  lines.push("[Install]");
  lines.push(`WantedBy=${spec.wantedBy ?? "default.target"}`);
  lines.push("");
  return lines.join("\n");
}

/** Render a Quadlet .timer file from a timer spec. */
export function renderQuadletTimer(spec: TimerSpec): string {
  const lines: string[] = [];
  lines.push("[Unit]");
  lines.push(`Description=${spec.description}`);
  lines.push("");
  lines.push("[Timer]");
  lines.push(`OnCalendar=${spec.onCalendar}`);
  if (spec.persistent !== false) {
    lines.push("Persistent=true");
  }
  lines.push("");
  lines.push("[Install]");
  lines.push(`WantedBy=${spec.wantedBy ?? "timers.target"}`);
  lines.push("");
  return lines.join("\n");
}

/** Render a plain systemd .service unit file. */
export function renderSystemdService(spec: {
  description: string;
  user?: string;
  environment?: Record<string, string>;
  execStart: string;
}): string {
  const lines: string[] = [];
  lines.push("[Unit]");
  lines.push(`Description=${spec.description}`);
  lines.push("");
  lines.push("[Service]");
  lines.push("Type=oneshot");
  if (spec.user) {
    lines.push(`User=${spec.user}`);
  }
  if (spec.environment) {
    for (const [key, val] of Object.entries(spec.environment)) {
      lines.push(`Environment=${key}=${val}`);
    }
  }
  lines.push(`ExecStart=${spec.execStart}`);
  lines.push("");
  return lines.join("\n");
}

export class QuadletSetupGenerator {
  generate(config: PibloomConfig, outputDir: string): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // --- Heartbeat (.service + .timer) ---
    const interval = configValue(config, "heartbeat.interval", "30m");
    const onCalendar = parseInterval(interval);

    files.push({
      path: path.join(outputDir, "pibloom-heartbeat.service"),
      content: renderSystemdService({
        description: "piBloom Heartbeat Service",
        user: "pibloom-agent",
        environment: {
          PIBLOOM_OBJECTS_DIR: "/var/lib/pibloom/objects",
          PIBLOOM_SKILLS_DIR: "/usr/local/share/pibloom/skills",
          PIBLOOM_PERSONA_DIR: "/usr/local/share/pibloom/persona",
          PIBLOOM_CONFIG: "/etc/pibloom/pibloom.yaml",
        },
        execStart: "/usr/local/bin/pibloom-heartbeat",
      }),
    });

    files.push({
      path: path.join(outputDir, "pibloom-heartbeat.timer"),
      content: [
        "[Unit]",
        "Description=piBloom Heartbeat Timer",
        "",
        "[Timer]",
        `OnCalendar=${onCalendar}`,
        "Persistent=true",
        "",
        "[Install]",
        "WantedBy=timers.target",
        "",
      ].join("\n"),
    });

    return files;
  }
}
