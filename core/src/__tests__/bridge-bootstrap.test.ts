import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bridgeNazarConfig,
  HealthFileReporter,
  loadBaseBridgeConfig,
  MessageQueue,
} from "../bridge-bootstrap.js";

describe("loadBaseBridgeConfig", () => {
  it("returns config with specified channel name", () => {
    const config = loadBaseBridgeConfig("Signal");
    assert.equal(config.channelName, "Signal");
  });

  it("returns default values for all fields", () => {
    const config = loadBaseBridgeConfig("Test");
    assert.equal(config.channelName, "Test");
    assert.deepEqual(config.allowedContacts, []);
    assert.equal(config.timeoutMs, 120_000);
    assert.ok(config.agentDir);
    assert.ok(config.objectsDir);
    assert.ok(config.skillsDir);
    assert.ok(config.personaDir);
    assert.ok(config.repoRoot);
    assert.ok(config.agentCommand);
  });
});

describe("bridgeNazarConfig", () => {
  it("returns a valid NazarConfig with defaults", () => {
    const config = bridgeNazarConfig();
    assert.ok(config.hostname);
    assert.ok(config.primary_user);
  });
});

describe("MessageQueue", () => {
  it("processes tasks sequentially", async () => {
    const queue = new MessageQueue();
    const order: number[] = [];

    queue.enqueue(async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push(1);
    });
    queue.enqueue(async () => {
      order.push(2);
    });
    queue.enqueue(async () => {
      order.push(3);
    });

    // Wait for queue to drain
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(order, [1, 2, 3]);
  });

  it("reports pending count", () => {
    const queue = new MessageQueue();
    assert.equal(queue.pending, 0);
  });

  it("drops messages when full", () => {
    const queue = new MessageQueue(2);

    // Fill the queue with slow tasks
    queue.enqueue(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    queue.enqueue(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    // This should be dropped
    queue.enqueue(async () => {
      /* dropped */
    });

    assert.equal(queue.pending, 2);
  });

  it("continues processing after errors", async () => {
    const queue = new MessageQueue();
    const results: string[] = [];

    queue.enqueue(async () => {
      results.push("first");
    });
    queue.enqueue(async () => {
      throw new Error("boom");
    });
    queue.enqueue(async () => {
      results.push("third");
    });

    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(results, ["first", "third"]);
  });
});

describe("HealthFileReporter", () => {
  it("can start and stop without errors", () => {
    const reporter = new HealthFileReporter();
    // Don't actually write to filesystem in tests — just verify the API
    assert.ok(reporter.start);
    assert.ok(reporter.stop);
    // Calling stop without start should be safe
    reporter.stop();
  });
});
