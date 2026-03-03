import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, it } from "node:test";
import { EvolveManager } from "../evolve.js";
import { ObjectStore } from "../object-store.js";
import type { ISystemExecutor } from "../ports/system-executor.js";

interface ExecCall {
  cmd: string;
  args: string[];
}

interface WriteCall {
  path: string;
  content: string;
}

class MockSystemExecutor implements ISystemExecutor {
  execCalls: ExecCall[] = [];
  writeCalls: WriteCall[] = [];
  removedFiles: string[] = [];
  removedDirs: string[] = [];
  createdDirs: string[] = [];
  fileContents = new Map<string, string>();
  healthyServices = new Set<string>();

  async exec(
    cmd: string,
    args: string[],
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    this.execCalls.push({ cmd, args });

    // Simulate systemctl is-active
    if (cmd === "sudo" && args[0] === "systemctl" && args[1] === "is-active") {
      const service = args[2];
      const name = service.replace(".service", "");
      return {
        stdout: this.healthyServices.has(name) ? "active\n" : "",
        stderr: "",
        exitCode: this.healthyServices.has(name) ? 0 : 3,
      };
    }

    // Simulate podman cp — fail by default (no manifest)
    if (cmd === "podman" && args[0] === "cp") {
      return { stdout: "", stderr: "no such file", exitCode: 125 };
    }

    return { stdout: "", stderr: "", exitCode: 0 };
  }

  async readFile(filePath: string): Promise<string> {
    const content = this.fileContents.get(filePath);
    if (content === undefined) {
      throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: "ENOENT" });
    }
    return content;
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    this.writeCalls.push({ path: filePath, content });
    this.fileContents.set(filePath, content);
  }

  async removeFile(filePath: string): Promise<void> {
    this.removedFiles.push(filePath);
    this.fileContents.delete(filePath);
  }

  async removeDir(dirPath: string): Promise<void> {
    this.removedDirs.push(dirPath);
  }

  async mkdirp(dirPath: string): Promise<void> {
    this.createdDirs.push(dirPath);
  }

  async fileExists(): Promise<boolean> {
    return false;
  }

  async readDir(dirPath: string): Promise<string[]> {
    throw Object.assign(new Error(`ENOENT: ${dirPath}`), { code: "ENOENT" });
  }

  async isDirectory(): Promise<boolean> {
    return false;
  }
}

describe("EvolveManager", () => {
  let tmpDir: string;
  let objectsDir: string;
  let quadletDir: string;
  let configPath: string;
  let store: ObjectStore;
  let executor: MockSystemExecutor;
  let manager: EvolveManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nazar-evolve-"));
    objectsDir = path.join(tmpDir, "objects");
    quadletDir = path.join(tmpDir, "quadlet");
    configPath = path.join(tmpDir, "nazar.yaml");

    fs.mkdirSync(objectsDir, { recursive: true });
    fs.mkdirSync(quadletDir, { recursive: true });
    fs.writeFileSync(
      configPath,
      "hostname: nazar-box\nprimary_user: alex\nevolution:\n  max_containers_per_evolution: 3\n",
    );

    store = new ObjectStore(objectsDir);
    executor = new MockSystemExecutor();
    manager = new EvolveManager(store, executor, configPath, quadletDir);
  });

  const createEvolution = (
    slug: string,
    containers: Record<string, unknown>[],
  ) => {
    store.create("evolution", slug, {
      title: `Test Evolution: ${slug}`,
      status: "proposed",
    });
    // Manually write the containers array into the frontmatter
    const filePath = path.join(objectsDir, "evolution", `${slug}.md`);
    const raw = fs.readFileSync(filePath, "utf-8");
    const updated = raw.replace(
      "---\n",
      `---\ncontainers:\n${containers.map((c) => `  - name: '${c.name}'\n    image: '${c.image}'`).join("\n")}\n`,
      // Only replace the first occurrence
    );
    fs.writeFileSync(filePath, updated);
  };

  describe("install", () => {
    it("generates Quadlet files and starts services", async () => {
      createEvolution("test-evo", [
        { name: "nazar-foo", image: "docker.io/foo:latest" },
      ]);
      executor.healthyServices.add("nazar-foo");

      const result = await manager.install({
        slug: "test-evo",
        healthCheckTimeout: 2,
      });
      assert.ok(result.includes("applied successfully"));

      // Should have written a Quadlet file
      assert.equal(executor.writeCalls.length, 1);
      assert.ok(executor.writeCalls[0].path.endsWith("nazar-foo.container"));
      assert.ok(
        executor.writeCalls[0].content.includes("Image=docker.io/foo:latest"),
      );

      // Should have called daemon-reload and start
      const daemonReload = executor.execCalls.find(
        (c) =>
          c.cmd === "sudo" &&
          c.args[0] === "systemctl" &&
          c.args[1] === "daemon-reload",
      );
      assert.ok(daemonReload);

      const startCall = executor.execCalls.find(
        (c) =>
          c.cmd === "sudo" &&
          c.args[0] === "systemctl" &&
          c.args[1] === "start" &&
          c.args[2] === "nazar-foo.service",
      );
      assert.ok(startCall);
    });

    it("rejects when container count exceeds max", async () => {
      createEvolution("big-evo", [
        { name: "nazar-a", image: "img:1" },
        { name: "nazar-b", image: "img:2" },
        { name: "nazar-c", image: "img:3" },
        { name: "nazar-d", image: "img:4" },
      ]);

      await assert.rejects(
        () => manager.install({ slug: "big-evo" }),
        /too many containers/,
      );
    });

    it("rejects invalid container name", async () => {
      createEvolution("bad-name", [{ name: "invalid-name", image: "img:1" }]);

      await assert.rejects(
        () => manager.install({ slug: "bad-name" }),
        /invalid container name/,
      );
    });

    it("rejects missing image field", async () => {
      // Manually create an evolution object with a container missing image
      store.create("evolution", "no-image", { title: "No Image" });
      const filePath = path.join(objectsDir, "evolution", "no-image.md");
      const raw = fs.readFileSync(filePath, "utf-8");
      const updated = raw.replace(
        "---\n",
        "---\ncontainers:\n  - name: 'nazar-test'\n",
      );
      fs.writeFileSync(filePath, updated);

      await assert.rejects(
        () => manager.install({ slug: "no-image" }),
        /missing 'image' field/,
      );
    });

    it("rolls back on health check failure", async () => {
      createEvolution("unhealthy", [{ name: "nazar-sick", image: "img:1" }]);
      // Don't add to healthyServices — health check will fail

      await assert.rejects(
        () => manager.install({ slug: "unhealthy", healthCheckTimeout: 1 }),
        /failed health check/,
      );

      // Should have removed the Quadlet file
      assert.ok(
        executor.removedFiles.some((f) => f.includes("nazar-sick.container")),
      );
    });

    it("dry-run does not write files or start services", async () => {
      createEvolution("dry-evo", [{ name: "nazar-dry", image: "img:1" }]);

      const result = await manager.install({
        slug: "dry-evo",
        dryRun: true,
      });
      assert.ok(result.includes("[dry-run]"));
      assert.equal(executor.writeCalls.length, 0);
      assert.equal(executor.execCalls.length, 0);
    });
  });

  describe("rollback", () => {
    it("stops services and removes Quadlet files", async () => {
      createEvolution("roll-evo", [{ name: "nazar-roll", image: "img:1" }]);

      const result = await manager.rollback({ slug: "roll-evo" });
      assert.ok(result.includes("rolled back"));

      const stopCall = executor.execCalls.find(
        (c) =>
          c.cmd === "sudo" && c.args[0] === "systemctl" && c.args[1] === "stop",
      );
      assert.ok(stopCall);
      assert.ok(
        executor.removedFiles.some((f) => f.includes("nazar-roll.container")),
      );
    });
  });

  describe("status", () => {
    it("returns formatted status for a single evolution", () => {
      store.create("evolution", "status-evo", {
        title: "Status Test",
        status: "proposed",
      });

      const result = manager.status("status-evo");
      assert.ok(result.includes("type: evolution"));
      assert.ok(result.includes("slug: status-evo"));
      assert.ok(result.includes("title: Status Test"));
    });

    it("lists all evolutions", () => {
      store.create("evolution", "evo-1", { title: "First" });
      store.create("evolution", "evo-2", { title: "Second" });

      const result = manager.status();
      assert.ok(result.includes("evolution/evo-1"));
      assert.ok(result.includes("evolution/evo-2"));
    });

    it("returns (none) when no evolutions exist", () => {
      const result = manager.status();
      assert.equal(result, "(none)");
    });

    it("throws for nonexistent slug", () => {
      assert.throws(() => manager.status("nope"), /object not found/);
    });
  });
});
