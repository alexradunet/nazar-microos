import path from "node:path";
import type {
  BridgeInstallOptions,
  IEvolveManager,
} from "../../ports/evolve-manager.js";
import type { IObjectStore } from "../../ports/object-store.js";
import type { ISystemExecutor } from "../../ports/system-executor.js";
import type {
  ContainerSpec,
  EvolveOptions,
  GeneratedFile,
  NazarConfig,
} from "../../types.js";
import { YamlConfigReader } from "../config/yaml-config-reader.js";
import type { BridgeManifest } from "../discovery/bridge-manifest.js";
import { resolveManifestTemplates } from "../discovery/bridge-manifest.js";
import { CapabilityExtractor } from "../discovery/extractor.js";
import { parseManifest, validateManifest } from "../discovery/manifest.js";
import {
  renderQuadletContainer,
  renderQuadletPod,
  renderQuadletTimer,
} from "../setup/quadlet-generator.js";

const CONTAINER_NAME_RE = /^nazar-[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const DEFAULT_HEALTH_TIMEOUT = 30;
const CAPABILITIES_DIR = "/var/lib/nazar/capabilities";
const SKILLS_DIR = "/var/lib/nazar/skills";

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
        // Rollback: stop all, remove Quadlet files, clean up capabilities
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
        await this.cleanupCapabilities(containerNames);
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

    // Extract capability manifests from running containers
    await this.extractCapabilities(containerNames);

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

  async installBridge(
    manifest: BridgeManifest,
    opts: BridgeInstallOptions,
  ): Promise<string> {
    const { dryRun, bridgeConfig = {}, healthCheckTimeout } = opts;

    // Resolve templates
    const resolved = resolveManifestTemplates(manifest, bridgeConfig);

    // Validate all containers
    for (const spec of resolved.containers) {
      this.validateContainer(spec);
    }

    // Generate Quadlet files
    const quadlets: GeneratedFile[] = [];

    // Pods
    for (const pod of resolved.pods ?? []) {
      quadlets.push({
        path: path.join(this.quadletDir, `${pod.name}.pod`),
        content: renderQuadletPod(pod),
      });
    }

    // Containers
    for (const spec of resolved.containers) {
      quadlets.push({
        path: path.join(this.quadletDir, `${spec.name}.container`),
        content: renderQuadletContainer({
          name: spec.name,
          image: spec.image,
          description:
            spec.description ?? `Nazar Bridge Container: ${spec.name}`,
          volumes: spec.volumes,
          environment: spec.environment,
          pod: spec.pod,
          publishPorts: spec.publishPorts,
          readOnly: spec.readOnly,
          noNewPrivileges: spec.noNewPrivileges,
          serviceType: spec.serviceType,
          restart: spec.restart,
        }),
      });
    }

    // Timers
    for (const timer of resolved.timers ?? []) {
      quadlets.push({
        path: path.join(this.quadletDir, `${timer.name}.timer`),
        content: renderQuadletTimer(timer),
      });
    }

    if (dryRun) {
      const lines = ["[dry-run] Would generate Quadlet files:"];
      for (const q of quadlets) {
        lines.push(`  ${q.path}`);
        lines.push(q.content);
      }
      return lines.join("\n");
    }

    // Write files
    await this.executor.mkdirp(this.quadletDir);
    for (const q of quadlets) {
      await this.executor.writeFile(q.path, q.content);
    }

    // Reload systemd
    await this.executor.exec("sudo", ["systemctl", "daemon-reload"]);

    const timeout = healthCheckTimeout ?? DEFAULT_HEALTH_TIMEOUT;
    const podNames = (resolved.pods ?? []).map((p) => p.name);
    const containerNames = resolved.containers.map((c) => c.name);
    const timerNames = (resolved.timers ?? []).map((t) => t.name);

    // Helper to roll back all written files on failure
    const rollbackFiles = async () => {
      for (const name of [...podNames, ...containerNames, ...timerNames]) {
        const ext = podNames.includes(name)
          ? "pod"
          : timerNames.includes(name)
            ? "timer"
            : "container";
        await this.executor.removeFile(
          path.join(this.quadletDir, `${name}.${ext}`),
        );
      }
      await this.executor.exec("sudo", ["systemctl", "daemon-reload"]);
    };

    // Start pods first
    for (const name of podNames) {
      await this.executor.exec("sudo", [
        "systemctl",
        "start",
        `${name}-pod.service`,
      ]);
    }

    // Start containers and health check
    for (const name of containerNames) {
      await this.executor.exec("sudo", [
        "systemctl",
        "start",
        `${name}.service`,
      ]);

      const healthy = await this.healthCheck(name, timeout);
      if (!healthy) {
        for (const n of containerNames) {
          await this.executor.exec("sudo", [
            "systemctl",
            "stop",
            `${n}.service`,
          ]);
        }
        for (const n of podNames) {
          await this.executor.exec("sudo", [
            "systemctl",
            "stop",
            `${n}-pod.service`,
          ]);
        }
        await rollbackFiles();
        throw new Error(
          `bridge '${manifest.metadata.name}' failed health check on '${name}' and was rolled back`,
        );
      }
    }

    // Start timers
    for (const name of timerNames) {
      await this.executor.exec("sudo", ["systemctl", "start", `${name}.timer`]);
    }

    return `bridge '${manifest.metadata.name}' installed successfully`;
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
      await this.cleanupCapabilities(containers.map((c) => c.name));
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

  /**
   * Extract capability manifests and skills from running containers.
   * Silently skips containers without /nazar/capability.yaml.
   */
  private async extractCapabilities(containerNames: string[]): Promise<void> {
    const extractor = new CapabilityExtractor(this.executor);

    for (const name of containerNames) {
      const manifestPath = path.join(CAPABILITIES_DIR, `${name}.yaml`);
      const hasManifest = await extractor.extractManifest(name, manifestPath);
      if (!hasManifest) continue;

      try {
        const raw = await this.executor.readFile(manifestPath);
        const manifest = parseManifest(raw);
        const errors = validateManifest(manifest);
        if (errors.length > 0) continue;

        if (manifest.skills && manifest.skills.length > 0) {
          await extractor.extractSkills(
            name,
            manifest.skills,
            path.join(SKILLS_DIR, manifest.metadata.name),
          );
        }
      } catch {
        // best effort — manifest extraction is non-critical
      }
    }
  }

  /** Remove extracted capability manifest and skills for given containers. */
  private async cleanupCapabilities(containerNames: string[]): Promise<void> {
    for (const name of containerNames) {
      await this.executor.removeFile(
        path.join(CAPABILITIES_DIR, `${name}.yaml`),
      );
      await this.executor.removeDir(path.join(SKILLS_DIR, name));
    }
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
