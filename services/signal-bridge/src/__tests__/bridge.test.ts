/**
 * Unit tests for nazar signal-bridge core functions.
 *
 * Uses node:test + node:assert/strict (zero framework deps).
 * Tests pure functions using real system executables where needed.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { SignalBridgeConfig } from "../index.js";
import { isAllowed, SignalBotChannel, validatePhoneNumber } from "../index.js";

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
// isAllowed
// ---------------------------------------------------------------------------

describe("isAllowed", () => {
  it("returns true for any contact when allowedContacts is empty", () => {
    const config = makeConfig({ allowedContacts: [] });
    assert.equal(isAllowed("+19999999999", config), true);
    assert.equal(isAllowed("+15550001234", config), true);
  });

  it("returns true when contact is in the allowedContacts list", () => {
    const config = makeConfig({
      allowedContacts: ["+19991112222", "+19993334444"],
    });
    assert.equal(isAllowed("+19991112222", config), true);
    assert.equal(isAllowed("+19993334444", config), true);
  });

  it("returns false when contact is NOT in the allowedContacts list", () => {
    const config = makeConfig({
      allowedContacts: ["+19991112222"],
    });
    assert.equal(isAllowed("+19998887777", config), false);
    assert.equal(isAllowed("+15550009999", config), false);
  });
});

// ---------------------------------------------------------------------------
// validatePhoneNumber
// ---------------------------------------------------------------------------

describe("validatePhoneNumber", () => {
  it("accepts valid E.164 number +12345678901", () => {
    assert.equal(validatePhoneNumber("+12345678901"), true);
  });

  it("accepts valid E.164 number with country code +447911123456", () => {
    assert.equal(validatePhoneNumber("+447911123456"), true);
  });

  it("accepts minimum length E.164 +1234567", () => {
    assert.equal(validatePhoneNumber("+1234567"), true);
  });

  it("rejects number without + prefix", () => {
    assert.equal(validatePhoneNumber("12345678901"), false);
  });

  it("rejects number with + but starting with 0", () => {
    assert.equal(validatePhoneNumber("+01234567890"), false);
  });

  it("rejects too short number", () => {
    assert.equal(validatePhoneNumber("+123456"), false);
  });

  it("rejects empty string", () => {
    assert.equal(validatePhoneNumber(""), false);
  });

  it("rejects number with letters", () => {
    assert.equal(validatePhoneNumber("+1abc5678901"), false);
  });

  it("rejects number with spaces", () => {
    assert.equal(validatePhoneNumber("+1 234 567 8901"), false);
  });
});

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
