/**
 * ISetupGenerator port — produces deployment files from a NazarConfig.
 *
 * Given a fully parsed NazarConfig, this port generates all Podman Quadlet
 * unit files (.container, .pod, .network) needed to deploy Nazar services.
 * It returns file objects rather than writing to disk so the caller can
 * perform a dry-run preview before committing changes.
 *
 * Handles: generating Quadlet .container and .pod files from config.
 * Does NOT handle: writing files to disk, reloading systemd, or starting
 * services. The CLI command in capabilities/setup/ performs those steps
 * after receiving the generated files.
 *
 * For implementation, see capabilities/setup/quadlet-generator.ts.
 * For Quadlet file format details, see os/sysconfig/nazar.yaml.example.
 */
import type { GeneratedFile, NazarConfig } from "../types.js";

/** Port for generating deployment files from configuration. */
export interface ISetupGenerator {
  /** Generate deployment files (e.g. Quadlet) from a NazarConfig. */
  generate(config: NazarConfig, outputDir: string): GeneratedFile[];
}
