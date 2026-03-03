import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BridgeManifest } from "../capabilities/discovery/bridge-manifest.js";
import {
  parseBridgeManifest,
  resolveManifestTemplates,
  validateBridgeManifest,
} from "../capabilities/discovery/bridge-manifest.js";

function validManifest(overrides?: Partial<BridgeManifest>): BridgeManifest {
  return {
    apiVersion: "nazar.dev/v1",
    kind: "BridgeManifest",
    metadata: {
      name: "signal",
      description: "Signal messaging bridge",
      version: "1.0.0",
      channel: "signal",
    },
    containers: [
      {
        name: "nazar-signal-bridge",
        image: "localhost/nazar-signal-bridge:latest",
      },
    ],
    ...overrides,
  };
}

describe("parseBridgeManifest", () => {
  it("parses valid YAML into BridgeManifest", () => {
    const yaml = `
apiVersion: nazar.dev/v1
kind: BridgeManifest
metadata:
  name: signal
  description: Signal messaging bridge
  version: "1.0.0"
  channel: signal
containers:
  - name: nazar-signal-bridge
    image: localhost/nazar-signal-bridge:latest
`;
    const manifest = parseBridgeManifest(yaml);
    assert.equal(manifest.apiVersion, "nazar.dev/v1");
    assert.equal(manifest.kind, "BridgeManifest");
    assert.equal(manifest.metadata.name, "signal");
    assert.equal(manifest.containers.length, 1);
    assert.equal(manifest.containers[0].name, "nazar-signal-bridge");
  });

  it("throws on invalid YAML", () => {
    assert.throws(() => parseBridgeManifest("not: [yaml: {"));
  });

  it("throws on empty input", () => {
    assert.throws(() => parseBridgeManifest(""), /invalid/i);
  });

  it("parses manifest with pods, timers, and configSchema", () => {
    const yaml = `
apiVersion: nazar.dev/v1
kind: BridgeManifest
metadata:
  name: signal
  description: Signal messaging bridge
  version: "1.0.0"
  channel: signal
containers:
  - name: nazar-signal-cli
    image: localhost/nazar-signal-cli:latest
  - name: nazar-signal-bridge
    image: localhost/nazar-signal-bridge:latest
    pod: nazar-signal.pod
pods:
  - name: nazar-signal
    description: Signal shared network namespace
timers:
  - name: nazar-signal-health
    description: Signal health check
    onCalendar: "*:0/5"
configSchema:
  - name: phone_number
    type: string
    required: true
    description: Signal phone number
    envVar: SIGNAL_PHONE_NUMBER
`;
    const manifest = parseBridgeManifest(yaml);
    assert.equal(manifest.containers.length, 2);
    assert.equal(manifest.pods?.length, 1);
    assert.equal(manifest.pods?.[0].name, "nazar-signal");
    assert.equal(manifest.timers?.length, 1);
    assert.equal(manifest.timers?.[0].onCalendar, "*:0/5");
    assert.equal(manifest.configSchema?.length, 1);
    assert.equal(manifest.configSchema?.[0].envVar, "SIGNAL_PHONE_NUMBER");
  });
});

describe("validateBridgeManifest", () => {
  it("returns empty for valid manifest", () => {
    const errors = validateBridgeManifest(validManifest());
    assert.deepEqual(errors, []);
  });

  it("rejects wrong apiVersion", () => {
    const errors = validateBridgeManifest(
      validManifest({ apiVersion: "v2" as "nazar.dev/v1" }),
    );
    assert.ok(errors.some((e) => e.includes("apiVersion")));
  });

  it("rejects wrong kind", () => {
    const errors = validateBridgeManifest(
      validManifest({ kind: "Other" as "BridgeManifest" }),
    );
    assert.ok(errors.some((e) => e.includes("kind")));
  });

  it("requires metadata fields", () => {
    const manifest = validManifest();
    manifest.metadata = { name: "", description: "", version: "", channel: "" };
    const errors = validateBridgeManifest(manifest);
    assert.ok(errors.some((e) => e.includes("metadata.name")));
    assert.ok(errors.some((e) => e.includes("metadata.description")));
    assert.ok(errors.some((e) => e.includes("metadata.version")));
    assert.ok(errors.some((e) => e.includes("metadata.channel")));
  });

  it("requires at least one container", () => {
    const errors = validateBridgeManifest(validManifest({ containers: [] }));
    assert.ok(errors.some((e) => e.includes("at least one container")));
  });

  it("validates container fields", () => {
    const errors = validateBridgeManifest(
      validManifest({
        containers: [{ name: "", image: "" }],
      }),
    );
    assert.ok(errors.some((e) => e.includes("containers[0].name")));
    assert.ok(errors.some((e) => e.includes("containers[0].image")));
  });

  it("validates pod fields", () => {
    const errors = validateBridgeManifest(
      validManifest({ pods: [{ name: "" }] }),
    );
    assert.ok(errors.some((e) => e.includes("pods[0].name")));
  });

  it("validates timer fields", () => {
    const errors = validateBridgeManifest(
      validManifest({
        timers: [{ name: "", description: "test", onCalendar: "" }],
      }),
    );
    assert.ok(errors.some((e) => e.includes("timers[0].name")));
    assert.ok(errors.some((e) => e.includes("timers[0].onCalendar")));
  });

  it("validates configSchema field types", () => {
    const errors = validateBridgeManifest(
      validManifest({
        configSchema: [
          {
            name: "foo",
            type: "invalid" as "string",
            required: true,
            description: "test",
          },
        ],
      }),
    );
    assert.ok(errors.some((e) => e.includes("configSchema[0].type")));
  });

  it("validates provides fields", () => {
    const errors = validateBridgeManifest(
      validManifest({
        provides: [{ name: "", description: "" }],
      }),
    );
    assert.ok(errors.some((e) => e.includes("provides[0].name")));
    assert.ok(errors.some((e) => e.includes("provides[0].description")));
  });

  it("validates requiredImages fields", () => {
    const errors = validateBridgeManifest(
      validManifest({
        requiredImages: [{ name: "", context: ".", containerfile: "" }],
      }),
    );
    assert.ok(errors.some((e) => e.includes("requiredImages[0].name")));
    assert.ok(
      errors.some((e) => e.includes("requiredImages[0].containerfile")),
    );
  });

  it("accepts full valid manifest with all optional fields", () => {
    const errors = validateBridgeManifest(
      validManifest({
        pods: [{ name: "nazar-signal" }],
        timers: [
          { name: "nazar-health", description: "Health", onCalendar: "*:0/5" },
        ],
        configSchema: [
          {
            name: "phone",
            type: "string",
            required: true,
            description: "Phone number",
          },
        ],
        provides: [{ name: "signal-messaging", description: "Send/receive" }],
        requiredImages: [
          {
            name: "nazar-signal-bridge",
            context: "bridges/signal",
            containerfile: "Containerfile",
          },
        ],
        setupInstructions: "Register with signal-cli",
        compactionInstructions: "Keep phone number context",
        skills: ["signal-setup"],
      }),
    );
    assert.deepEqual(errors, []);
  });
});

describe("resolveManifestTemplates", () => {
  it("replaces {{key}} with config values", () => {
    const manifest = validManifest({
      containers: [
        {
          name: "nazar-signal-bridge",
          image: "localhost/nazar-signal-bridge:latest",
          environment: { SIGNAL_PHONE: "{{phone_number}}" },
        },
      ],
    });
    const resolved = resolveManifestTemplates(manifest, {
      phone_number: "+4917612345678",
    });
    assert.equal(
      resolved.containers[0].environment?.SIGNAL_PHONE,
      "+4917612345678",
    );
  });

  it("leaves unresolved templates as-is", () => {
    const manifest = validManifest({
      containers: [
        {
          name: "nazar-signal-bridge",
          image: "localhost/nazar-signal-bridge:latest",
          environment: { MISSING: "{{not_in_config}}" },
        },
      ],
    });
    const resolved = resolveManifestTemplates(manifest, {});
    assert.equal(
      resolved.containers[0].environment?.MISSING,
      "{{not_in_config}}",
    );
  });

  it("resolves dotted key paths", () => {
    const manifest = validManifest({
      containers: [
        {
          name: "nazar-test",
          image: "test:latest",
          environment: { NESTED: "{{auth.token}}" },
        },
      ],
    });
    const resolved = resolveManifestTemplates(manifest, {
      auth: { token: "secret123" },
    });
    assert.equal(resolved.containers[0].environment?.NESTED, "secret123");
  });

  it("handles numeric values", () => {
    const manifest = validManifest({
      containers: [
        {
          name: "nazar-test",
          image: "test:latest",
          publishPorts: ["{{port}}:3000"],
        },
      ],
    });
    const resolved = resolveManifestTemplates(manifest, { port: 8080 });
    assert.equal(resolved.containers[0].publishPorts?.[0], "8080:3000");
  });

  it("escapes special characters in string values", () => {
    const manifest = validManifest({
      setupInstructions: "Use phone {{phone}}",
    });
    const resolved = resolveManifestTemplates(manifest, {
      phone: '+49 "test"',
    });
    assert.equal(resolved.setupInstructions, 'Use phone +49 "test"');
  });

  it("does not mutate original manifest", () => {
    const manifest = validManifest({
      containers: [
        {
          name: "nazar-test",
          image: "test:latest",
          environment: { VAL: "{{key}}" },
        },
      ],
    });
    resolveManifestTemplates(manifest, { key: "resolved" });
    assert.equal(manifest.containers[0].environment?.VAL, "{{key}}");
  });
});
