import path from "node:path";
import type { IEvolveManager } from "../../ports/evolve-manager.js";
import type { IObjectStore } from "../../ports/object-store.js";
import type { ISystemExecutor } from "../../ports/system-executor.js";
import type {
  ContainerSpec,
  EvolveOptions,
  GeneratedFile,
  NazarConfig,
} from "../../types.js";
import { YamlConfigReader } from "../config/yaml-config-reader.js";
import { renderQuadletContainer } from "../setup/quadlet-generator.js";

const CONTAINER_NAME_RE = /^nazar-[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const DEFAULT_HEALTH_TIMEOUT = 30;

export class EvolveManager implements IEvolveManager {
  private readonly cfgReader: YamlConfigReader;

  constructor(
    private readonly store: IObjectStore,
    private readonly executor: ISystemExecutor,
    private readonly configPath: string,
    private readonly quadletDir: string,
  ) {
    this.cfgReader = new YamlConfigReader();
  }

  /**
   * Read the containers array from an evolution object's frontmatter.
   */
  private readContainers(slug: string): ContainerSpec[] {
    const obj = this.store.read("evolution", slug);
    const containers = obj.data.containers;
    if (!Array.isArray(containers) || containers.length === 0) {
      throw new Error(`no containers found in evolution/${slug}`);
    }
    return containers as ContainerSpec[];
  }

  /**
   * Validate a container spec: name must start with nazar-, image required.
   */
  private validateContainer(spec: ContainerSpec): void {
    if (!spec.name) {
      throw new Error("container entry missing 'name' field");
    }
    if (!spec.image) {
      throw new Error(`container '${spec.name}' missing 'image' field`);
    }
    if (!CONTAINER_NAME_RE.test(spec.name)) {
      throw new Error(
        `invalid container name: '${spec.name}' (must start with 'nazar-' and contain only alphanumeric, dot, underscore, hyphen)`,
      );
    }
  }

  /**
   * Generate Quadlet files for evolution containers.
   */
  private generateQuadlets(containers: ContainerSpec[]): GeneratedFile[] {
    return containers.map((spec) => ({
      path: path.join(this.quadletDir, `${spec.name}.container`),
      content: renderQuadletContainer({
        name: spec.name,
        image: spec.image,
        description: `Nazar Evolution Container: ${spec.name}`,
        volumes: spec.volumes,
        environment: spec.environment,
      }),
    }));
  }

  /**
   * Health check: poll systemctl is-active every 2s up to timeout.
   */
  private async healthCheck(
    serviceName: string,
    timeout: number,
  ): Promise<boolean> {
    let elapsed = 0;
    while (elapsed < timeout) {
      const result = await this.executor.exec("sudo", [
        "systemctl",
        "is-active",
        `${serviceName}.service`,
      ]);
      if (result.exitCode === 0) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 2000));
      elapsed += 2;
    }
    return false;
  }

  private readNazarConfig(): NazarConfig {
    return this.cfgReader.read(this.configPath);
  }

  private readConfigValue<T>(
    config: NazarConfig,
    cfgPath: string,
    defaultValue: T,
  ): T {
    return this.cfgReader.value(config, cfgPath, defaultValue);
  }

  async install(opts: EvolveOptions): Promise<string> {
    const { slug, dryRun, healthCheckTimeout } = opts;
    const containers = this.readContainers(slug);

    // Load config for max container limit
    let config: NazarConfig;
    try {
      config = this.readNazarConfig();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Warning: config load failed (${msg}), using defaults`);
      config = { hostname: "", primary_user: "" };
    }

    const maxContainers = this.readConfigValue(
      config,
      "evolution.max_containers_per_evolution",
      5,
    );
    if (containers.length > maxContainers) {
      throw new Error(
        `too many containers (${containers.length} > max ${maxContainers}). Increase evolution.max_containers_per_evolution in nazar.yaml`,
      );
    }

    // Validate all containers first
    for (const spec of containers) {
      this.validateContainer(spec);
    }

    const quadlets = this.generateQuadlets(containers);

    if (dryRun) {
      const lines = ["[dry-run] Would generate Quadlet files:"];
      for (const q of quadlets) {
        lines.push(`  ${q.path}`);
        lines.push(q.content);
      }
      return lines.join("\n");
    }

    // Write Quadlet files
    await this.executor.mkdirp(this.quadletDir);
    for (const q of quadlets) {
      await this.executor.writeFile(q.path, q.content);
    }

    // Reload systemd
    await this.executor.exec("sudo", ["systemctl", "daemon-reload"]);

    // Start services and health check
    const timeout = healthCheckTimeout ?? DEFAULT_HEALTH_TIMEOUT;
    const containerNames = containers.map((c) => c.name);

    for (const name of containerNames) {
      await this.executor.exec("sudo", [
        "systemctl",
        "start",
        `${name}.service`,
      ]);

      const healthy = await this.healthCheck(name, timeout);
      if (!healthy) {
        // Rollback: stop all, remove Quadlet files
        for (const n of containerNames) {
          await this.executor.exec("sudo", [
            "systemctl",
            "stop",
            `${n}.service`,
          ]);
          await this.executor.removeFile(
            path.join(this.quadletDir, `${n}.container`),
          );
        }
        await this.executor.exec("sudo", ["systemctl", "daemon-reload"]);

        try {
          this.store.update("evolution", slug, {
            status: "rejected",
            agent: "hermes",
          });
        } catch {
          // best effort
        }

        throw new Error(
          `evolution '${slug}' failed health check and was rolled back`,
        );
      }
    }

    // All healthy — mark as applied
    try {
      this.store.update("evolution", slug, {
        status: "applied",
        agent: "hermes",
      });
    } catch {
      // best effort
    }

    return `evolution '${slug}' applied successfully`;
  }

  async rollback(opts: EvolveOptions): Promise<string> {
    const { slug, dryRun } = opts;
    const containers = this.readContainers(slug);

    for (const spec of containers) {
      if (dryRun) {
        continue;
      }
      await this.executor.exec("sudo", [
        "systemctl",
        "stop",
        `${spec.name}.service`,
      ]);
      await this.executor.removeFile(
        path.join(this.quadletDir, `${spec.name}.container`),
      );
    }

    if (!dryRun) {
      await this.executor.exec("sudo", ["systemctl", "daemon-reload"]);
    }

    try {
      this.store.update("evolution", slug, {
        status: "rejected",
        agent: "hermes",
      });
    } catch {
      // best effort
    }

    return `evolution '${slug}' rolled back`;
  }

  status(slug?: string): string {
    if (slug) {
      const obj = this.store.read("evolution", slug);
      const lines: string[] = [];
      for (const [key, val] of Object.entries(obj.data)) {
        lines.push(`${key}: ${Array.isArray(val) ? val.join(", ") : val}`);
      }
      if (obj.content.trim()) {
        lines.push("");
        lines.push(obj.content.trim());
      }
      return lines.join("\n");
    }

    const refs = this.store.list("evolution");
    if (refs.length === 0) {
      return "(none)";
    }
    return refs
      .map((r) =>
        r.title ? `${r.type}/${r.slug}  ${r.title}` : `${r.type}/${r.slug}`,
      )
      .join("\n");
  }
}
