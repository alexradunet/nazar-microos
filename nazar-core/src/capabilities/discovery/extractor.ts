import type { ISystemExecutor } from "../../ports/system-executor.js";

/** Extracts capability manifests and skills from container images via podman cp. */
export class CapabilityExtractor {
  constructor(private readonly executor: ISystemExecutor) {}

  /** Extract /nazar/capability.yaml from a container. Returns false if not present. */
  async extractManifest(
    containerName: string,
    outputPath: string,
  ): Promise<boolean> {
    const result = await this.executor.exec("podman", [
      "cp",
      `${containerName}:/nazar/capability.yaml`,
      outputPath,
    ]);
    return result.exitCode === 0;
  }

  /** Extract /nazar/skills/<name>/ from container to host skills dir. */
  async extractSkills(
    containerName: string,
    skills: string[],
    outputDir: string,
  ): Promise<void> {
    await this.executor.mkdirp(outputDir);
    for (const skill of skills) {
      await this.executor.exec("podman", [
        "cp",
        `${containerName}:/nazar/skills/${skill}`,
        `${outputDir}/${skill}`,
      ]);
    }
  }
}
