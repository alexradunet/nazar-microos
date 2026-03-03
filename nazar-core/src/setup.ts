/**
 * Re-export from capability for backward compatibility.
 * New code should import from capabilities/setup.
 */
export {
  parseInterval,
  QuadletSetupGenerator,
  renderQuadletContainer,
} from "./capabilities/setup/quadlet-generator.js";

import { QuadletSetupGenerator } from "./capabilities/setup/quadlet-generator.js";
import type { GeneratedFile, NazarConfig } from "./types.js";

const _generator = new QuadletSetupGenerator();

/** Generate all Quadlet files from a NazarConfig. */
export function generateQuadletFiles(
  config: NazarConfig,
  outputDir: string,
): GeneratedFile[] {
  return _generator.generate(config, outputDir);
}
