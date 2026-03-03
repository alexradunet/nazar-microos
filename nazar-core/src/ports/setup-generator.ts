import type { GeneratedFile, NazarConfig } from "../types.js";

/** Port for generating deployment files from configuration. */
export interface ISetupGenerator {
  /** Generate deployment files (e.g. Quadlet) from a NazarConfig. */
  generate(config: NazarConfig, outputDir: string): GeneratedFile[];
}
