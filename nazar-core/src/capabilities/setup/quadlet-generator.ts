import path from "node:path";
import type { ISetupGenerator } from "../../ports/setup-generator.js";
import type { ContainerSpec, GeneratedFile, NazarConfig } from "../../types.js";

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

/** Helper to access nested config values safely. */
function cfgValue<T>(
  config: NazarConfig,
  configPath: string,
  defaultValue: T,
): T {
  const parts = configPath.split(".");
  let current: unknown = config;
  for (const part of parts) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object"
    ) {
      return defaultValue;
    }
    current = (current as Record<string, unknown>)[part];
  }
  if (current === undefined || current === null) {
    return defaultValue;
  }
  return current as T;
}

export class QuadletSetupGenerator implements ISetupGenerator {
  generate(config: NazarConfig, outputDir: string): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // --- Heartbeat (.container + .timer) ---
    const interval = cfgValue(config, "heartbeat.interval", "30m");
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
    const signalPhone = cfgValue(config, "signal.phone_number", "");
    const signalContacts: string[] = cfgValue(
      config,
      "signal.allowed_contacts",
      [],
    );
    const skillsDir = cfgValue(
      config,
      "pi.skills_dir",
      "/usr/local/share/nazar/skills",
    );
    const personaDir = cfgValue(
      config,
      "pi.persona_dir",
      "/usr/local/share/nazar/persona",
    );

    files.push({
      path: path.join(outputDir, "nazar-signal-bridge.container"),
      content: renderQuadletContainer({
        name: "nazar-signal-bridge",
        image: "localhost/nazar-signal-bridge:latest",
        description: "Nazar Signal Bridge",
        volumes: [
          "/var/lib/nazar/objects:/data/objects:rw,z",
          "/var/lib/nazar/signal-storage:/data/signal-storage:rw,z",
          "/var/lib/nazar/pi-config:/home/nazar/.pi:rw,z",
          `${personaDir}:${personaDir}:ro,z`,
        ],
        environment: {
          NAZAR_SIGNAL_PHONE: signalPhone,
          NAZAR_SIGNAL_ALLOWED_CONTACTS: signalContacts.join(","),
          NAZAR_SKILLS_DIR: skillsDir,
          NAZAR_PERSONA_DIR: personaDir,
          PI_CODING_AGENT_DIR: "/home/nazar/.pi/agent",
        },
        pod: "nazar-signal.pod",
        after: "nazar-signal-cli.service",
      }),
    });

    // --- WhatsApp Bridge container ---
    const whatsappContacts: string[] = cfgValue(
      config,
      "whatsapp.allowed_contacts",
      [],
    );

    files.push({
      path: path.join(outputDir, "nazar-whatsapp-bridge.container"),
      content: renderQuadletContainer({
        name: "nazar-whatsapp-bridge",
        image: "localhost/nazar-whatsapp-bridge:latest",
        description: "Nazar WhatsApp Bridge",
        volumes: [
          "/var/lib/nazar/objects:/data/objects:rw,z",
          "/var/lib/nazar/whatsapp-storage:/data/whatsapp-storage:rw,z",
          "/var/lib/nazar/pi-config:/home/nazar/.pi:rw,z",
          `${personaDir}:${personaDir}:ro,z`,
        ],
        environment: {
          NAZAR_WHATSAPP_ALLOWED_CONTACTS: whatsappContacts.join(","),
          NAZAR_SKILLS_DIR: skillsDir,
          NAZAR_PERSONA_DIR: personaDir,
          PI_CODING_AGENT_DIR: "/home/nazar/.pi/agent",
        },
      }),
    });

    // --- Web Bridge container ---
    const uiPort = cfgValue(config, "ui.port", 3000);

    files.push({
      path: path.join(outputDir, "nazar-web-bridge.container"),
      content: renderQuadletContainer({
        name: "nazar-web-bridge",
        image: "localhost/nazar-web-bridge:latest",
        description: "Nazar Web Bridge",
        volumes: [
          "/var/lib/nazar/objects:/data/objects:rw,z",
          "/var/lib/nazar/pi-config:/home/nazar/.pi:rw,z",
          `${personaDir}:${personaDir}:ro,z`,
        ],
        environment: {
          NAZAR_UI_PORT: String(uiPort),
          NAZAR_SKILLS_DIR: skillsDir,
          NAZAR_PERSONA_DIR: personaDir,
          PI_CODING_AGENT_DIR: "/home/nazar/.pi/agent",
        },
        publishPorts: [`${uiPort}:${uiPort}`],
        noNewPrivileges: true,
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
    const ttydPort = cfgValue(config, "ttyd.port", 7681);
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
}
