/**
 * Unit tests for Nazar Pi extension.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createNazarExtension } from "../extension.js";

describe("createNazarExtension", () => {
  it("returns an ExtensionFactory with create()", () => {
    const factory = createNazarExtension();
    assert.ok(typeof factory.create === "function");
    const ext = factory.create();
    assert.equal(ext.name, "nazar");
    assert.ok(typeof ext.on === "function");
  });

  it("context event returns runtime context message", () => {
    const ext = createNazarExtension().create();
    const result = ext.on({
      type: "context",
      messages: [],
    }) as { messages?: { role: string; content: string }[] };
    assert.ok(result.messages);
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].role, "user");
    assert.ok(result.messages[0].content.includes("Nazar Runtime Context"));
    assert.ok(result.messages[0].content.includes("Timestamp:"));
    assert.ok(result.messages[0].content.includes("Host:"));
  });

  it("tool_call event blocks dangerous commands", () => {
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
      const result = ext.on({
        type: "tool_call",
        tool: "bash",
        input: { command: cmd },
      }) as { block?: boolean; reason?: string };
      assert.ok(
        result?.block,
        `Expected '${cmd}' to be blocked but it was not`,
      );
    }
  });

  it("tool_call event allows safe commands", () => {
    const ext = createNazarExtension().create();
    const safe = ["ls -la", "cat /etc/hostname", "echo hello", "git status"];
    for (const cmd of safe) {
      const result = ext.on({
        type: "tool_call",
        tool: "bash",
        input: { command: cmd },
      });
      const blocked = result && "block" in result && result.block;
      assert.ok(!blocked, `Expected '${cmd}' to be allowed but it was blocked`);
    }
  });

  it("session_before_compact event returns compaction instructions", () => {
    const ext = createNazarExtension().create();
    const result = ext.on({
      type: "session_before_compact",
    }) as { compaction?: { instructions?: string } };
    assert.ok(result.compaction);
    assert.ok(result.compaction.instructions);
    assert.ok(result.compaction.instructions.includes("Preserve:"));
    assert.ok(result.compaction.instructions.includes("Discard:"));
  });
});
