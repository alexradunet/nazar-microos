/**
 * IEvolveManager port — manages the lifecycle of container evolutions.
 *
 * An "evolution" is a stored object (type: evolution) that describes one or
 * more containers to install. This port installs, rolls back, and reports
 * status for evolutions by orchestrating Quadlet file generation, systemd
 * unit management, and health-check waiting.
 *
 * Handles: install (validate → generate → start), rollback (stop → remove),
 * and status reporting for evolution objects.
 * Does NOT handle: container image building, container registry access, or
 * object store CRUD (use IObjectStore for that).
 *
 * For implementation, see capabilities/evolution/evolve-manager.ts.
 * Evolution objects are stored in objects/evolution/{slug}.md.
 */
import type { BridgeManifest } from "../capabilities/discovery/bridge-manifest.js";
import type { EvolveOptions } from "../types.js";

/** Options for bridge installation. */
export interface BridgeInstallOptions {
  dryRun?: boolean;
  bridgeConfig?: Record<string, unknown>;
  healthCheckTimeout?: number;
}

/** Port for managing container evolution lifecycle. */
export interface IEvolveManager {
  /** Install an evolution: validate, generate Quadlet files, start services. */
  install(opts: EvolveOptions): Promise<string>;
  /** Rollback an evolution: stop services, remove Quadlet files. */
  rollback(opts: EvolveOptions): Promise<string>;
  /** Show evolution status: single object or list all. */
  status(slug?: string): string;
  /** Install a bridge from a BridgeManifest: resolve templates, generate Quadlet files, start services. */
  installBridge(
    manifest: BridgeManifest,
    opts: BridgeInstallOptions,
  ): Promise<string>;
}
