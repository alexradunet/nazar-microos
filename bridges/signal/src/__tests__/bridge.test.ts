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

// ---------------------------------------------------------------------------
// handleJsonRpcLine (tested via TCP server)
// ---------------------------------------------------------------------------

import net from "node:net";

/** Create a local TCP server that sends lines to connected clients. */
function createTestServer(): {
  server: net.Server;
  port: () => number;
  sendLine: (line: string) => void;
  close: () => Promise<void>;
} {
  let client: net.Socket | undefined;
  const server = net.createServer((socket) => {
    client = socket;
  });

  return {
    server,
    port: () => (server.address() as net.AddressInfo).port,
    sendLine: (line: string) => client?.write(`${line}\n`),
    close: () =>
      new Promise<void>((resolve) => {
        client?.destroy();
        server.close(() => resolve());
      }),
  };
}

describe("handleJsonRpcLine (via TCP)", () => {
  it("dispatches valid receive messages to handler", async () => {
    const testServer = createTestServer();
    await new Promise<void>((resolve) =>
      testServer.server.listen(0, "127.0.0.1", resolve),
    );

    const received: Array<{ from: string; text: string }> = [];
    const config = makeConfig({
      signalCliHost: "127.0.0.1",
      signalCliPort: testServer.port(),
    });
    const channel = new SignalBotChannel(config);
    channel.onMessage(async (msg) => {
      received.push({ from: msg.from, text: msg.text });
      return "ok";
    });

    await channel.connect();

    // Send a valid JSON-RPC receive notification
    testServer.sendLine(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "receive",
        params: {
          envelope: {
            source: "+19876543210",
            dataMessage: { message: "hello" },
          },
        },
      }),
    );

    // Wait for processing
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(received.length, 1);
    assert.equal(received[0].from, "+19876543210");
    assert.equal(received[0].text, "hello");

    await channel.disconnect();
    await testServer.close();
  });

  it("ignores non-receive methods", async () => {
    const testServer = createTestServer();
    await new Promise<void>((resolve) =>
      testServer.server.listen(0, "127.0.0.1", resolve),
    );

    const received: string[] = [];
    const config = makeConfig({
      signalCliHost: "127.0.0.1",
      signalCliPort: testServer.port(),
    });
    const channel = new SignalBotChannel(config);
    channel.onMessage(async (msg) => {
      received.push(msg.text);
      return "ok";
    });

    await channel.connect();

    // Send a JSON-RPC response (not a receive notification)
    testServer.sendLine(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }));
    // Send a different method
    testServer.sendLine(
      JSON.stringify({ jsonrpc: "2.0", method: "version", params: {} }),
    );

    await new Promise((r) => setTimeout(r, 100));
    assert.equal(received.length, 0);

    await channel.disconnect();
    await testServer.close();
  });

  it("handles malformed JSON gracefully", async () => {
    const testServer = createTestServer();
    await new Promise<void>((resolve) =>
      testServer.server.listen(0, "127.0.0.1", resolve),
    );

    const received: string[] = [];
    const config = makeConfig({
      signalCliHost: "127.0.0.1",
      signalCliPort: testServer.port(),
    });
    const channel = new SignalBotChannel(config);
    channel.onMessage(async (msg) => {
      received.push(msg.text);
      return "ok";
    });

    await channel.connect();

    // Send malformed JSON — should not crash
    testServer.sendLine("not valid json {{{");
    // Then send a valid message to prove the channel still works
    testServer.sendLine(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "receive",
        params: {
          envelope: {
            source: "+19876543210",
            dataMessage: { message: "after-bad-json" },
          },
        },
      }),
    );

    await new Promise((r) => setTimeout(r, 100));
    assert.equal(received.length, 1);
    assert.equal(received[0], "after-bad-json");

    await channel.disconnect();
    await testServer.close();
  });

  it("ignores messages without text or sender", async () => {
    const testServer = createTestServer();
    await new Promise<void>((resolve) =>
      testServer.server.listen(0, "127.0.0.1", resolve),
    );

    const received: string[] = [];
    const config = makeConfig({
      signalCliHost: "127.0.0.1",
      signalCliPort: testServer.port(),
    });
    const channel = new SignalBotChannel(config);
    channel.onMessage(async (msg) => {
      received.push(msg.text);
      return "ok";
    });

    await channel.connect();

    // No source
    testServer.sendLine(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "receive",
        params: { envelope: { dataMessage: { message: "no-source" } } },
      }),
    );
    // No text
    testServer.sendLine(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "receive",
        params: { envelope: { source: "+19876543210", dataMessage: {} } },
      }),
    );

    await new Promise((r) => setTimeout(r, 100));
    assert.equal(received.length, 0);

    await channel.disconnect();
    await testServer.close();
  });
});
