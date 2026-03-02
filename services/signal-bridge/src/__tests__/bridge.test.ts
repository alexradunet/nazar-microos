/**
 * Unit tests for nazar signal-bridge.
 *
 * Uses node:test + node:assert/strict (zero framework deps).
 * Pure helper tests (isAllowed, validatePhoneNumber) now live in @nazar/core.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { SignalBridgeConfig } from "../index.js";
import { SignalBotChannel } from "../index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(
  overrides: Partial<SignalBridgeConfig> = {},
): SignalBridgeConfig {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nazar-signal-test-"));
  return {
    phoneNumber: "+12345678901",
    allowedContacts: [],
    signalCliHost: "127.0.0.1",
    signalCliPort: 7583,
    storageDir: path.join(tmpDir, "storage"),
    personaDir: path.join(tmpDir, "persona"),
    systemMdPath: "",
    channelName: "Signal",
    piCommand: "printf",
    piDir: tmpDir,
    repoRoot: tmpDir,
    objectsDir: path.join(tmpDir, "objects"),
    skillsDir: path.join(tmpDir, "skills"),
    timeoutMs: 5_000,
    piModel: undefined,
    piTransport: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SignalBotChannel
// ---------------------------------------------------------------------------

describe("SignalBotChannel", () => {
  it("throws if connect() called before onMessage()", async () => {
    const config = makeConfig();
    const channel = new SignalBotChannel(config);
    await assert.rejects(
      () => channel.connect(),
      /onMessage must be called before connect/,
    );
  });

  it("name is 'signal'", () => {
    const config = makeConfig();
    const channel = new SignalBotChannel(config);
    assert.equal(channel.name, "signal");
  });
});
