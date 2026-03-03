import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../config.js";

describe("loadConfig", () => {
  it("returns default port 3000", () => {
    const config = loadConfig();
    assert.equal(config.port, 3000);
  });

  it("returns web channel name", () => {
    const config = loadConfig();
    assert.equal(config.channelName, "Web");
  });

  it("returns local session id", () => {
    const config = loadConfig();
    assert.equal(config.sessionId, "local");
  });

  it("returns empty allowed contacts", () => {
    const config = loadConfig();
    assert.deepEqual(config.allowedContacts, []);
  });

  it("returns default timeout", () => {
    const config = loadConfig();
    assert.equal(config.timeoutMs, 120_000);
  });
});
