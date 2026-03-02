import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

/**
 * Run the CLI and return stdout/stderr/exitCode.
 * Requires the project to be built first (dist/cli.js must exist).
 */
function runCli(
  args: string[],
  env: Record<string, string> = {},
): { stdout: string; stderr: string; exitCode: number } {
  const cliPath = path.resolve(
    import.meta.dirname,
    "..",
    "..",
    "dist",
    "cli.js",
  );
  try {
    const stdout = execFileSync("node", [cliPath, ...args], {
      encoding: "utf-8",
      env: { ...process.env, ...env },
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      exitCode: e.status ?? 1,
    };
  }
}

describe("CLI", () => {
  let tmpDir: string;
  let objectsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nazar-cli-"));
    objectsDir = path.join(tmpDir, "objects");
    fs.mkdirSync(objectsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("shows usage when no command given", () => {
    const r = runCli([]);
    assert.equal(r.exitCode, 1);
    assert.ok(r.stderr.includes("Usage:"));
  });

  describe("object create", () => {
    it("creates an object", () => {
      const r = runCli(
        ["object", "create", "journal", "test-1", "--title=Test Entry"],
        { NAZAR_OBJECTS_DIR: objectsDir },
      );
      assert.equal(r.exitCode, 0);
      assert.ok(r.stdout.includes("created journal/test-1"));

      const filePath = path.join(objectsDir, "journal", "test-1.md");
      assert.ok(fs.existsSync(filePath));
      const content = fs.readFileSync(filePath, "utf-8");
      assert.ok(content.includes("title: Test Entry"));
    });

    it("fails on missing args", () => {
      const r = runCli(["object", "create"], {
        NAZAR_OBJECTS_DIR: objectsDir,
      });
      assert.equal(r.exitCode, 1);
      assert.ok(r.stderr.includes("usage:"));
    });
  });

  describe("object read", () => {
    it("reads an object", () => {
      runCli(["object", "create", "note", "test-read", "--title=Read Me"], {
        NAZAR_OBJECTS_DIR: objectsDir,
      });
      const r = runCli(["object", "read", "note", "test-read"], {
        NAZAR_OBJECTS_DIR: objectsDir,
      });
      assert.equal(r.exitCode, 0);
      assert.ok(r.stdout.includes("title: Read Me"));
    });

    it("fails on nonexistent object", () => {
      const r = runCli(["object", "read", "note", "nope"], {
        NAZAR_OBJECTS_DIR: objectsDir,
      });
      assert.equal(r.exitCode, 1);
      assert.ok(r.stderr.includes("object not found"));
    });
  });

  describe("object list", () => {
    it("lists objects by type", () => {
      runCli(["object", "create", "task", "t1", "--title=Task One"], {
        NAZAR_OBJECTS_DIR: objectsDir,
      });
      runCli(["object", "create", "task", "t2", "--title=Task Two"], {
        NAZAR_OBJECTS_DIR: objectsDir,
      });
      const r = runCli(["object", "list", "task"], {
        NAZAR_OBJECTS_DIR: objectsDir,
      });
      assert.equal(r.exitCode, 0);
      assert.ok(r.stdout.includes("task/t1"));
      assert.ok(r.stdout.includes("task/t2"));
    });

    it("lists all objects with --all", () => {
      runCli(["object", "create", "task", "t1", "--title=Task"], {
        NAZAR_OBJECTS_DIR: objectsDir,
      });
      runCli(["object", "create", "note", "n1", "--title=Note"], {
        NAZAR_OBJECTS_DIR: objectsDir,
      });
      const r = runCli(["object", "list", "--all"], {
        NAZAR_OBJECTS_DIR: objectsDir,
      });
      assert.equal(r.exitCode, 0);
      assert.ok(r.stdout.includes("task/t1"));
      assert.ok(r.stdout.includes("note/n1"));
    });
  });

  describe("object search", () => {
    it("finds objects by pattern", () => {
      runCli(
        [
          "object",
          "create",
          "note",
          "searchable",
          "--title=Needle in haystack",
        ],
        { NAZAR_OBJECTS_DIR: objectsDir },
      );
      const r = runCli(["object", "search", "Needle"], {
        NAZAR_OBJECTS_DIR: objectsDir,
      });
      assert.equal(r.exitCode, 0);
      assert.ok(r.stdout.includes("note/searchable"));
    });
  });

  describe("object link", () => {
    it("links two objects", () => {
      runCli(["object", "create", "task", "a", "--title=A"], {
        NAZAR_OBJECTS_DIR: objectsDir,
      });
      runCli(["object", "create", "note", "b", "--title=B"], {
        NAZAR_OBJECTS_DIR: objectsDir,
      });
      const r = runCli(["object", "link", "task/a", "note/b"], {
        NAZAR_OBJECTS_DIR: objectsDir,
      });
      assert.equal(r.exitCode, 0);
      assert.ok(r.stdout.includes("linked task/a <-> note/b"));
    });
  });

  describe("setup", () => {
    it("generates Quadlet files in dry-run mode", () => {
      const configPath = path.join(tmpDir, "nazar.yaml");
      fs.writeFileSync(
        configPath,
        "hostname: nazar-box\nprimary_user: alex\nheartbeat:\n  interval: 30m\nttyd:\n  port: 7681\n",
      );
      const r = runCli(["setup", "--dry-run", `--config=${configPath}`]);
      assert.equal(r.exitCode, 0);
      assert.ok(r.stdout.includes("nazar-heartbeat.container"));
      assert.ok(r.stdout.includes("nazar-ttyd.container"));
      assert.ok(r.stdout.includes("dry-run"));
    });
  });
});
