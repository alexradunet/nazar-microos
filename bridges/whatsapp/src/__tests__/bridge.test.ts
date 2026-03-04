/**
 * Unit tests for pibloom whatsapp-bridge.
 *
 * Uses node:test + node:assert/strict (zero framework deps).
 * Pure helper tests (isAllowed, validatePhoneNumber) live in @pibloom/core.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { WhatsAppBridgeConfig } from "../index.js";
import {
  chatIdToPhone,
  msgTypeToAttachmentType,
  WhatsAppBotChannel,
} from "../index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(
  overrides: Partial<WhatsAppBridgeConfig> = {},
): WhatsAppBridgeConfig {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "pibloom-whatsapp-test-"),
  );
  return {
    allowedContacts: [],
    storageDir: path.join(tmpDir, "storage"),
    personaDir: path.join(tmpDir, "persona"),
    systemMdPath: "",
    channelName: "WhatsApp",
    agentCommand: "printf",
    agentDir: tmpDir,
    repoRoot: tmpDir,
    objectsDir: path.join(tmpDir, "objects"),
    skillsDir: path.join(tmpDir, "skills"),
    timeoutMs: 5_000,
    model: undefined,
    transport: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// chatIdToPhone
// ---------------------------------------------------------------------------

describe("chatIdToPhone", () => {
  it("strips @c.us and prepends +", () => {
    assert.equal(chatIdToPhone("12345678901@c.us"), "+12345678901");
  });

  it("preserves existing + prefix", () => {
    assert.equal(chatIdToPhone("+12345678901@c.us"), "+12345678901");
  });

  it("handles plain number without @c.us", () => {
    assert.equal(chatIdToPhone("12345678901"), "+12345678901");
  });
});

// ---------------------------------------------------------------------------
// WhatsAppBotChannel
// ---------------------------------------------------------------------------

describe("WhatsAppBotChannel", () => {
  it("throws if connect() called before onMessage()", async () => {
    const config = makeConfig();
    const channel = new WhatsAppBotChannel(config);
    await assert.rejects(
      () => channel.connect(),
      /onMessage must be called before connect/,
    );
  });

  it("name is 'whatsapp'", () => {
    const config = makeConfig();
    const channel = new WhatsAppBotChannel(config);
    assert.equal(channel.name, "whatsapp");
  });
});

// ---------------------------------------------------------------------------
// msgTypeToAttachmentType
// ---------------------------------------------------------------------------

describe("msgTypeToAttachmentType", () => {
  it("maps image to image", () => {
    assert.equal(msgTypeToAttachmentType("image"), "image");
  });

  it("maps sticker to image", () => {
    assert.equal(msgTypeToAttachmentType("sticker"), "image");
  });

  it("maps audio to audio", () => {
    assert.equal(msgTypeToAttachmentType("audio"), "audio");
  });

  it("maps ptt (push-to-talk) to audio", () => {
    assert.equal(msgTypeToAttachmentType("ptt"), "audio");
  });

  it("maps video to video", () => {
    assert.equal(msgTypeToAttachmentType("video"), "video");
  });

  it("maps document to document", () => {
    assert.equal(msgTypeToAttachmentType("document"), "document");
  });

  it("returns undefined for unsupported types", () => {
    assert.equal(msgTypeToAttachmentType("chat"), undefined);
    assert.equal(msgTypeToAttachmentType("location"), undefined);
    assert.equal(msgTypeToAttachmentType("contact"), undefined);
  });
});
