/**
 * OsToolsCapability — gives the Pi agent awareness of its own infrastructure.
 *
 * Provides CLI commands for inspecting bootc OS state, systemd services,
 * and Podman containers. All commands are read-only.
 *
 * Does NOT perform mutations (upgrades, restarts). Mutation commands
 * will be added after core service architecture (Phase 6).
 * For the agent skill document, see agent/skills/os-operations/SKILL.md.
 */

import type {
  Capability,
  CapabilityConfig,
  CapabilityRegistration,
  CliCommand,
} from "../../capability.js";
import type { ISystemExecutor } from "../../ports/system-executor.js";
import {
  checkBootcUpgrade,
  getBootcStatus,
  stageBootcUpgrade,
} from "./bootc.js";
import { listContainerHealth, restartNazarContainer } from "./containers.js";
import {
  getServiceLogs,
  listNazarServices,
  listNazarTimers,
  restartNazarService,
} from "./systemd.js";

export class OsToolsCapability implements Capability {
  readonly name = "os-tools";
  readonly description =
    "OS integration: bootc, systemd, and container lifecycle inspection";

  init(config: CapabilityConfig): CapabilityRegistration {
    // Reason: os-tools wraps system commands and requires the executor
    // service to already be registered by SystemExecutorCapability.
    if (!config.services.systemExecutor) {
      throw new Error(
        "OsToolsCapability requires systemExecutor service — ensure SystemExecutorCapability is registered first",
      );
    }

    const executor = config.services.systemExecutor;

    const cliCommands: CliCommand[] = [
      buildStatusCommand(executor),
      buildUpgradeCheckCommand(executor),
      buildUpgradeCommand(executor),
      buildServicesCommand(executor),
      buildLogsCommand(executor),
      buildContainersCommand(executor),
      buildTimersCommand(executor),
      buildRestartServiceCommand(executor),
      buildRestartContainerCommand(executor),
    ];

    return { cliCommands };
  }
}

// ---------------------------------------------------------------------------
// Command builders
// Reason: named functions keep init() flat and make stack traces readable.
// ---------------------------------------------------------------------------

/**
 * `os status`
 *
 * Example:
 *   os status
 */
function buildStatusCommand(executor: ISystemExecutor): CliCommand {
  return {
    name: "os status",
    description:
      "Show booted bootc OS image, staged update, and rollback availability",
    async run() {
      const output = await getBootcStatus(executor);
      console.log(output);
    },
  };
}

/**
 * `os upgrade-check`
 *
 * Example:
 *   os upgrade-check
 */
function buildUpgradeCheckCommand(executor: ISystemExecutor): CliCommand {
  return {
    name: "os upgrade-check",
    description: "Check whether a bootc OS update is available (read-only)",
    async run() {
      const output = await checkBootcUpgrade(executor);
      console.log(output);
    },
  };
}

/**
 * `os services`
 *
 * Example:
 *   os services
 */
function buildServicesCommand(executor: ISystemExecutor): CliCommand {
  return {
    name: "os services",
    description: "List all nazar-* systemd units and their active state",
    async run() {
      const output = await listNazarServices(executor);
      console.log(output);
    },
  };
}

/**
 * `os logs <service> [--lines=N]`
 *
 * Example:
 *   os logs nazar-heartbeat.service --lines=100
 */
function buildLogsCommand(executor: ISystemExecutor): CliCommand {
  return {
    name: "os logs",
    description:
      "Show recent journal logs for a nazar-* service (default: last 50 lines)",
    async run(args, flags) {
      const service = args[0];
      if (!service) {
        console.error("Usage: os logs <service> [--lines=N]");
        console.error("Example: os logs nazar-heartbeat.service --lines=100");
        process.exit(1);
      }
      const lines = flags.lines ? parseInt(flags.lines, 10) : 50;
      const output = await getServiceLogs(executor, service, lines);
      console.log(output);
    },
  };
}

/**
 * `os containers`
 *
 * Example:
 *   os containers
 */
function buildContainersCommand(executor: ISystemExecutor): CliCommand {
  return {
    name: "os containers",
    description: "List nazar-* Podman containers with state and health status",
    async run() {
      const output = await listContainerHealth(executor);
      console.log(output);
    },
  };
}

/**
 * `os timers`
 *
 * Example:
 *   os timers
 */
function buildTimersCommand(executor: ISystemExecutor): CliCommand {
  return {
    name: "os timers",
    description: "List nazar-* systemd timers and their next scheduled run",
    async run() {
      const output = await listNazarTimers(executor);
      console.log(output);
    },
  };
}

/**
 * `os restart-service <service>`
 *
 * Example:
 *   os restart-service nazar-heartbeat.service
 */
function buildRestartServiceCommand(executor: ISystemExecutor): CliCommand {
  return {
    name: "os restart-service",
    description: "Restart a nazar-* systemd service",
    async run(args) {
      const service = args[0];
      if (!service) {
        console.error("Usage: os restart-service <service>");
        console.error("Example: os restart-service nazar-heartbeat.service");
        process.exit(1);
      }
      const output = await restartNazarService(executor, service);
      console.log(output);
    },
  };
}

/**
 * `os upgrade`
 *
 * Example:
 *   os upgrade
 */
function buildUpgradeCommand(executor: ISystemExecutor): CliCommand {
  return {
    name: "os upgrade",
    description:
      "Stage a bootc OS upgrade (does NOT reboot — reboot manually to apply)",
    async run() {
      const output = await stageBootcUpgrade(executor);
      console.log(output);
    },
  };
}

/**
 * `os restart-container <container>`
 *
 * Example:
 *   os restart-container nazar-signal-bridge
 */
function buildRestartContainerCommand(executor: ISystemExecutor): CliCommand {
  return {
    name: "os restart-container",
    description: "Restart a nazar-* Podman container",
    async run(args) {
      const container = args[0];
      if (!container) {
        console.error("Usage: os restart-container <container>");
        console.error("Example: os restart-container nazar-signal-bridge");
        process.exit(1);
      }
      const output = await restartNazarContainer(executor, container);
      console.log(output);
    },
  };
}
