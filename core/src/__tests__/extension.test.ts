/**
 * Unit tests for Nazar Pi extension.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createNazarExtension } from "../capabilities/agent-session/extension.js";
import type { IObjectStore } from "../ports/object-store.js";

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

  it("context event includes System Inspection guidance section", async () => {
    const ext = createNazarExtension().create();
    const result = (await ext.on({
      type: "context",
      messages: [],
    })) as { messages?: { role: string; content: string }[] };
    assert.ok(result.messages);
    const content = result.messages[0].content;
    assert.ok(
      content.includes("## System Inspection"),
      "should include System Inspection section",
    );
    assert.ok(
      content.includes("nazar-core os status"),
      "should mention nazar-core os status",
    );
    assert.ok(
      content.includes("nazar-core os services"),
      "should mention nazar-core os services",
    );
    assert.ok(
      content.includes("nazar-core os containers"),
      "should mention nazar-core os containers",
    );
    assert.ok(
      content.includes("nazar-core bridge list"),
      "should mention nazar-core bridge list",
    );
  });

  it("context event does not pre-load OS status, services, or containers", async () => {
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
      "should not pre-load OS Status",
    );
    assert.ok(!content.includes("## Services"), "should not pre-load Services");
    assert.ok(
      !content.includes("## Containers"),
      "should not pre-load Containers",
    );
    assert.ok(
      !content.includes("## Health Alerts"),
      "should not pre-load Health Alerts",
    );
    assert.ok(
      !content.includes("## Available Bridges"),
      "should not pre-load Available Bridges",
    );
    assert.ok(
      !content.includes("## Installed Bridges"),
      "should not pre-load Installed Bridges",
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
    const ext = createNazarExtension().create();
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
});
