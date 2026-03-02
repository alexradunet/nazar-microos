import path from "node:path";
import { configValue } from "./config.js";
import type { ContainerSpec, GeneratedFile, NazarConfig } from "./types.js";

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
export function renderQuadletContainer(
  spec: ContainerSpec & {
    description: string;
    after?: string;
    publishPorts?: string[];
    readOnly?: boolean;
    noNewPrivileges?: boolean;
    serviceType?: string;
    restart?: string;
    wantedBy?: string;
  },
): string {
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

/**
 * Generate all Quadlet files from a NazarConfig.
 * Pure function — returns file content without writing to disk.
 */
export function generateQuadletFiles(
  config: NazarConfig,
  outputDir: string,
): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  // --- Heartbeat (.container + .timer) ---
  const interval = configValue(config, "heartbeat.interval", "30m");
  const onCalendar = parseInterval(interval);

  files.push({
    path: path.join(outputDir, "nazar-heartbeat.container"),
    content: renderQuadletContainer({
      name: "nazar-heartbeat",
      image: "localhost/nazar-heartbeat:latest",
      description: "Nazar Heartbeat Service",
      volumes: [
        "/var/lib/nazar/objects:/data/objects:ro,z",
        "/etc/nazar:/etc/nazar:ro,z",
      ],
      environment: { NAZAR_CONFIG: "/etc/nazar/nazar.yaml" },
      readOnly: true,
      noNewPrivileges: true,
      serviceType: "oneshot",
      restart: "no",
    }),
  });

  files.push({
    path: path.join(outputDir, "nazar-heartbeat.timer"),
    content: [
      "[Unit]",
      "Description=Nazar Heartbeat Timer",
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

  // --- Signal Pod ---
  files.push({
    path: path.join(outputDir, "nazar-signal.pod"),
    content: [
      "[Unit]",
      "Description=Nazar Signal Pod",
      "After=network-online.target",
      "",
      "[Pod]",
      "",
      "[Install]",
      "WantedBy=default.target",
      "",
    ].join("\n"),
  });

  // --- Signal CLI container ---
  files.push({
    path: path.join(outputDir, "nazar-signal-cli.container"),
    content: renderQuadletContainer({
      name: "nazar-signal-cli",
      image: "localhost/nazar-signal-cli:latest",
      description: "Nazar Signal CLI Daemon",
      volumes: ["/var/lib/nazar/signal-storage:/data/signal-storage:rw,z"],
      environment: { NAZAR_SIGNAL_STORAGE_DIR: "/data/signal-storage" },
      pod: "nazar-signal.pod",
    }),
  });

  // --- Signal Bridge container ---
  files.push({
    path: path.join(outputDir, "nazar-signal-bridge.container"),
    content: renderQuadletContainer({
      name: "nazar-signal-bridge",
      image: "localhost/nazar-signal-bridge:latest",
      description: "Nazar Signal Bridge",
      volumes: [
        "/var/lib/nazar/objects:/data/objects:rw,z",
        "/var/lib/nazar/signal-storage:/data/signal-storage:rw,z",
        "/etc/nazar:/etc/nazar:ro,z",
        "/var/lib/nazar/pi-config:/home/nazar/.pi:rw,z",
      ],
      environment: { NAZAR_CONFIG: "/etc/nazar/nazar.yaml" },
      pod: "nazar-signal.pod",
      after: "nazar-signal-cli.service",
    }),
  });

  // --- Syncthing ---
  files.push({
    path: path.join(outputDir, "nazar-syncthing.container"),
    content: renderQuadletContainer({
      name: "nazar-syncthing",
      image: "docker.io/syncthing/syncthing:latest",
      description: "Nazar Syncthing",
      volumes: ["/var/lib/nazar:/var/syncthing:rw,z"],
      publishPorts: [
        "8384:8384",
        "22000:22000/tcp",
        "22000:22000/udp",
        "21027:21027/udp",
      ],
      noNewPrivileges: true,
    }),
  });

  // --- ttyd (web terminal) ---
  const ttydPort = configValue(config, "ttyd.port", 7681);
  files.push({
    path: path.join(outputDir, "nazar-ttyd.container"),
    content: renderQuadletContainer({
      name: "nazar-ttyd",
      image: "docker.io/tsl0922/ttyd:latest",
      description: "Nazar Web Terminal (ttyd)",
      publishPorts: [`${ttydPort}:7681`],
    }),
  });

  return files;
}
