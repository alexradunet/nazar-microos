/**
 * Unit tests for Nazar Pi extension.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createNazarExtension } from "../extension.js";
import type { IObjectStore } from "../ports/object-store.js";
import type { ISystemExecutor } from "../ports/system-executor.js";

/** Minimal mock executor that returns canned output for each command. */
function createMockExecutor(
  overrides: Record<
    string,
    { stdout: string; stderr: string; exitCode: number }
  > = {},
): ISystemExecutor {
  const defaults: Record<
    string,
    { stdout: string; stderr: string; exitCode: number }
  > = {
    bootc: {
      stdout: JSON.stringify({
        status: {
          booted: {
            image: {
              image: { image: "ghcr.io/nazar/os:latest" },
              version: "42.20260301",
              timestamp: "2026-03-01T00:00:00Z",
            },
          },
          staged: null,
          rollback: null,
        },
      }),
      stderr: "",
      exitCode: 0,
    },
    systemctl: {
      stdout:
        "nazar-heartbeat.service  loaded active running  Nazar Heartbeat\n1 units listed.",
      stderr: "",
      exitCode: 0,
    },
    podman: {
      stdout: JSON.stringify([
        {
          Names: ["nazar-heartbeat"],
          Image: "ghcr.io/nazar/heartbeat:latest",
          State: "running",
          Status: "Up 2 hours",
        },
      ]),
      stderr: "",
      exitCode: 0,
    },
  };

  return {
    async exec(cmd: string, _args: string[]) {
      return (
        overrides[cmd] ??
        defaults[cmd] ?? { stdout: "", stderr: "", exitCode: 0 }
      );
    },
    async readFile() {
      return "";
    },
    async writeFile() {},
    async removeFile() {},
    async removeDir() {},
    async mkdirp() {},
    async fileExists() {
      return false;
    },
    async readDir() {
      return [];
    },
    async isDirectory() {
      return false;
    },
  };
}

describe("createNazarExtension", () => {
  it("returns an ExtensionFactory with create()", () => {
    const factory = createNazarExtension();
    assert.ok(typeof factory.create === "function");
    const ext = factory.create();
    assert.equal(ext.name, "nazar");
    assert.ok(typeof ext.on === "function");
  });

  it("context event returns runtime context message", async () => {
    const ext = createNazarExtension().create();
    const result = (await ext.on({
      type: "context",
      messages: [],
    })) as { messages?: { role: string; content: string }[] };
    assert.ok(result.messages);
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].role, "user");
    assert.ok(result.messages[0].content.includes("Nazar Runtime Context"));
    assert.ok(result.messages[0].content.includes("Timestamp:"));
    assert.ok(result.messages[0].content.includes("Host:"));
  });

  it("context event includes OS status when systemExecutor is provided", async () => {
    const ext = createNazarExtension({
      systemExecutor: createMockExecutor(),
    }).create();
    const result = (await ext.on({
      type: "context",
      messages: [],
    })) as { messages?: { role: string; content: string }[] };
    assert.ok(result.messages);
    const content = result.messages[0].content;
    assert.ok(
      content.includes("## OS Status"),
      "should include OS Status section",
    );
    assert.ok(content.includes("bootc"), "should include bootc output");
    assert.ok(
      content.includes("## Services"),
      "should include Services section",
    );
    assert.ok(
      content.includes("nazar-heartbeat"),
      "should include service name",
    );
    assert.ok(
      content.includes("## Containers"),
      "should include Containers section",
    );
    assert.ok(content.includes("running"), "should include container state");
  });

  it("context event skips OS data when systemExecutor is not provided", async () => {
    const ext = createNazarExtension({ channelName: "signal" }).create();
    const result = (await ext.on({
      type: "context",
      messages: [],
    })) as { messages?: { role: string; content: string }[] };
    assert.ok(result.messages);
    const content = result.messages[0].content;
    assert.ok(
      content.includes("Nazar Runtime Context"),
      "should have static context",
    );
    assert.ok(
      !content.includes("## OS Status"),
      "should not include OS Status",
    );
    assert.ok(!content.includes("## Services"), "should not include Services");
    assert.ok(
      !content.includes("## Containers"),
      "should not include Containers",
    );
  });

  it("context event handles OS command failures gracefully", async () => {
    const failingExecutor = createMockExecutor({
      bootc: { stdout: "", stderr: "command not found", exitCode: 127 },
      systemctl: { stdout: "", stderr: "access denied", exitCode: 1 },
      podman: { stdout: "", stderr: "not installed", exitCode: 127 },
    });
    const ext = createNazarExtension({
      systemExecutor: failingExecutor,
    }).create();
    const result = (await ext.on({
      type: "context",
      messages: [],
    })) as { messages?: { role: string; content: string }[] };
    assert.ok(result.messages, "should still return messages");
    assert.equal(result.messages.length, 1);
    const content = result.messages[0].content;
    assert.ok(
      content.includes("Nazar Runtime Context"),
      "should have static context",
    );
    assert.ok(
      content.includes("## OS Status"),
      "should have OS Status section even on failure",
    );
    assert.ok(
      content.includes("## Services"),
      "should have Services section even on failure",
    );
    assert.ok(
      content.includes("## Containers"),
      "should have Containers section even on failure",
    );
  });

  it("tool_call event blocks dangerous commands", async () => {
    const ext = createNazarExtension().create();
    const dangerous = [
      "rm -rf /",
      "mkfs.ext4 /dev/sda1",
      "dd if=/dev/zero of=/dev/sda",
      ":(){ :|:& };:",
      "shutdown -h now",
      "reboot",
    ];
    for (const cmd of dangerous) {
      const result = (await ext.on({
        type: "tool_call",
        tool: "bash",
        input: { command: cmd },
      })) as { block?: boolean; reason?: string };
      assert.ok(
        result?.block,
        `Expected '${cmd}' to be blocked but it was not`,
      );
    }
  });

  it("tool_call event allows safe commands", async () => {
    const ext = createNazarExtension().create();
    const safe = ["ls -la", "cat /etc/hostname", "echo hello", "git status"];
    for (const cmd of safe) {
      const result = await ext.on({
        type: "tool_call",
        tool: "bash",
        input: { command: cmd },
      });
      const blocked = result && "block" in result && result.block;
      assert.ok(!blocked, `Expected '${cmd}' to be allowed but it was blocked`);
    }
  });

  it("session_before_compact event returns generic default compaction instructions", async () => {
    const ext = createNazarExtension().create();
    const result = (await ext.on({
      type: "session_before_compact",
    })) as { compaction?: { instructions?: string } };
    assert.ok(result.compaction);
    assert.ok(result.compaction.instructions);
    assert.ok(
      result.compaction.instructions.includes("context compaction"),
      "should mention context compaction",
    );
    assert.ok(
      result.compaction.instructions.includes("persona"),
      "should mention persona",
    );
    assert.ok(
      result.compaction.instructions.includes("Discard verbose"),
      "should mention discarding verbose output",
    );
  });

  it("session_before_compact event uses custom compaction instructions when provided", async () => {
    const customInstructions = "Custom: preserve only the secret word.";
    const ext = createNazarExtension({
      compactionInstructions: customInstructions,
    }).create();
    const result = (await ext.on({
      type: "session_before_compact",
    })) as { compaction?: { instructions?: string } };
    assert.ok(result.compaction);
    assert.equal(result.compaction.instructions, customInstructions);
  });

  it("context event includes health alerts for unhealthy state", async () => {
    const unhealthyExecutor = createMockExecutor({
      bootc: {
        stdout: JSON.stringify({
          status: {
            booted: {
              image: { image: { image: "ghcr.io/nazar/os:latest" } },
            },
            staged: null,
          },
        }),
        stderr: "",
        exitCode: 0,
      },
      podman: {
        stdout: JSON.stringify([
          {
            Names: ["nazar-signal-bridge"],
            Image: "ghcr.io/nazar/signal:latest",
            State: "exited",
            Status: "Exited (1) 5 minutes ago",
          },
        ]),
        stderr: "",
        exitCode: 0,
      },
    });
    const ext = createNazarExtension({
      systemExecutor: unhealthyExecutor,
    }).create();
    const result = (await ext.on({
      type: "context",
      messages: [],
    })) as { messages?: { role: string; content: string }[] };
    assert.ok(result.messages);
    const content = result.messages[0].content;
    assert.ok(
      content.includes("## Health Alerts"),
      "should include Health Alerts section",
    );
    assert.ok(content.includes("CRITICAL"), "should include critical severity");
    assert.ok(
      content.includes("nazar-signal-bridge"),
      "should include container name in alert",
    );
  });

  it("context event skips health alerts when all healthy", async () => {
    const ext = createNazarExtension({
      systemExecutor: createMockExecutor(),
    }).create();
    const result = (await ext.on({
      type: "context",
      messages: [],
    })) as { messages?: { role: string; content: string }[] };
    assert.ok(result.messages);
    const content = result.messages[0].content;
    assert.ok(
      !content.includes("## Health Alerts"),
      "should not include Health Alerts when all healthy",
    );
  });

  it("context event includes pending evolutions when objectStore is provided", async () => {
    const mockObjectStore: IObjectStore = {
      create() {
        return "";
      },
      read() {
        return { data: {}, content: "" };
      },
      list(type, filters) {
        if (type === "evolution" && filters?.status === "proposed") {
          return [
            {
              type: "evolution",
              slug: "upgrade-signal-cli",
              title: "Upgrade signal-cli to v0.15",
            },
            {
              type: "evolution",
              slug: "add-healthcheck",
              title: "Add healthcheck to web bridge",
            },
          ];
        }
        return [];
      },
      update() {},
      search() {
        return [];
      },
      link() {
        return "";
      },
      appendContent() {},
    };
    const ext = createNazarExtension({
      objectStore: mockObjectStore,
    }).create();
    const result = (await ext.on({
      type: "context",
      messages: [],
    })) as { messages?: { role: string; content: string }[] };
    assert.ok(result.messages);
    const content = result.messages[0].content;
    assert.ok(
      content.includes("## Pending Evolutions"),
      "should include Pending Evolutions section",
    );
    assert.ok(
      content.includes("upgrade-signal-cli"),
      "should include evolution slug",
    );
    assert.ok(
      content.includes("Upgrade signal-cli to v0.15"),
      "should include evolution title",
    );
    assert.ok(
      content.includes("add-healthcheck"),
      "should include second evolution",
    );
  });

  it("context event skips evolutions when objectStore is not provided", async () => {
    const ext = createNazarExtension({
      systemExecutor: createMockExecutor(),
    }).create();
    const result = (await ext.on({
      type: "context",
      messages: [],
    })) as { messages?: { role: string; content: string }[] };
    assert.ok(result.messages);
    const content = result.messages[0].content;
    assert.ok(
      !content.includes("## Pending Evolutions"),
      "should not include Pending Evolutions without objectStore",
    );
  });

  it("context event includes Available Bridges and Installed Bridges sections when systemExecutor is provided", async () => {
    const manifestYaml = [
      "apiVersion: nazar.dev/v1",
      "kind: BridgeManifest",
      "metadata:",
      "  name: signal",
      "  description: Signal messaging bridge via signal-cli JSON-RPC",
      "  version: 1.0.0",
      "  channel: signal",
      "containers:",
      "  - name: nazar-signal-bridge",
      "    image: ghcr.io/nazar/signal:latest",
    ].join("\n");

    const bridgeExecutor = createMockExecutor({
      systemctl: {
        stdout: "active",
        stderr: "",
        exitCode: 0,
      },
    });
    // Override readDir and readFile and isDirectory for bridge discovery
    const executor = {
      ...bridgeExecutor,
      async readDir(path: string) {
        if (path === "/test/reference/bridges") return ["signal"];
        if (path === "/test/quadlet/") return ["nazar-signal-bridge.container"];
        return [];
      },
      async isDirectory(path: string) {
        return path === "/test/reference/bridges/signal";
      },
      async readFile(path: string) {
        if (path === "/test/reference/bridges/signal/manifest.yaml")
          return manifestYaml;
        return "";
      },
    };

    const ext = createNazarExtension({
      systemExecutor: executor,
      referenceBridgesDir: "/test/reference/bridges",
      quadletDir: "/test/quadlet/",
    }).create();

    const result = (await ext.on({
      type: "context",
      messages: [],
    })) as { messages?: { role: string; content: string }[] };
    assert.ok(result.messages);
    const content = result.messages[0].content;

    assert.ok(
      content.includes("## Available Bridges"),
      "should include Available Bridges section",
    );
    assert.ok(
      content.includes(
        "signal: Signal messaging bridge via signal-cli JSON-RPC (v1.0.0)",
      ),
      "should include signal bridge description",
    );
    assert.ok(
      content.includes("## Installed Bridges"),
      "should include Installed Bridges section",
    );
    assert.ok(
      content.includes("nazar-signal-bridge (active)"),
      "should include installed bridge with status",
    );
  });

  it("context event shows fallback text when no bridges are found", async () => {
    const emptyExecutor = createMockExecutor();
    const executor = {
      ...emptyExecutor,
      async readDir(_path: string) {
        return [] as string[];
      },
      async isDirectory(_path: string) {
        return false;
      },
      async readFile(_path: string) {
        return "";
      },
    };

    const ext = createNazarExtension({
      systemExecutor: executor,
      referenceBridgesDir: "/test/reference/bridges",
      quadletDir: "/test/quadlet/",
    }).create();

    const result = (await ext.on({
      type: "context",
      messages: [],
    })) as { messages?: { role: string; content: string }[] };
    assert.ok(result.messages);
    const content = result.messages[0].content;

    assert.ok(
      content.includes("No reference bridges found"),
      "should show fallback for available bridges",
    );
    assert.ok(
      content.includes("No bridges installed"),
      "should show fallback for installed bridges",
    );
  });
});
