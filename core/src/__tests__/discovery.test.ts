import assert from "node:assert/strict";
import path from "node:path";
import { beforeEach, describe, it } from "node:test";
import {
  CapabilityExtractor,
  DiscoveryCapability,
  parseManifest,
  validateManifest,
} from "../capabilities/discovery/index.js";
import type { CapabilityConfig } from "../capability.js";
import { MockSystemExecutor } from "../testing/mock-system-executor.js";

// --- parseManifest ---

describe("parseManifest", () => {
  it("parses a valid manifest", () => {
    const raw = `
apiVersion: nazar.dev/v1
kind: CapabilityManifest
metadata:
  name: nazar-whisper
  description: Speech-to-text transcription
  version: "1.0.0"
skills:
  - transcribe-audio
provides:
  - name: whisper-stt
    description: Speech-to-text transcription
`;
    const manifest = parseManifest(raw);
    assert.equal(manifest.apiVersion, "nazar.dev/v1");
    assert.equal(manifest.kind, "CapabilityManifest");
    assert.equal(manifest.metadata.name, "nazar-whisper");
    assert.deepEqual(manifest.skills, ["transcribe-audio"]);
    assert.equal(manifest.provides?.length, 1);
    assert.equal(manifest.provides?.[0].name, "whisper-stt");
  });

  it("parses a minimal manifest (skills only)", () => {
    const raw = `
apiVersion: nazar.dev/v1
kind: CapabilityManifest
metadata:
  name: nazar-ha
  description: Home automation
  version: "1.0.0"
skills:
  - home-lights
  - home-temperature
`;
    const manifest = parseManifest(raw);
    assert.deepEqual(manifest.skills, ["home-lights", "home-temperature"]);
    assert.equal(manifest.provides, undefined);
  });

  it("throws on invalid YAML", () => {
    assert.throws(() => parseManifest(":::bad"), /invalid manifest|yaml/i);
  });

  it("throws on empty input", () => {
    assert.throws(() => parseManifest(""), /invalid manifest/);
  });
});

// --- validateManifest ---

describe("validateManifest", () => {
  const validManifest = {
    apiVersion: "nazar.dev/v1" as const,
    kind: "CapabilityManifest" as const,
    metadata: {
      name: "test",
      description: "Test capability",
      version: "1.0.0",
    },
    skills: ["skill-a"],
  };

  it("returns no errors for a valid manifest", () => {
    const errors = validateManifest(validManifest);
    assert.deepEqual(errors, []);
  });

  it("rejects unsupported apiVersion", () => {
    const errors = validateManifest({ ...validManifest, apiVersion: "v2" });
    assert.ok(errors.some((e) => e.includes("apiVersion")));
  });

  it("rejects unsupported kind", () => {
    const errors = validateManifest({
      ...validManifest,
      kind: "Other" as "CapabilityManifest",
    });
    assert.ok(errors.some((e) => e.includes("kind")));
  });

  it("rejects missing metadata.name", () => {
    const errors = validateManifest({
      ...validManifest,
      metadata: { ...validManifest.metadata, name: "" },
    });
    assert.ok(errors.some((e) => e.includes("metadata.name")));
  });

  it("rejects missing metadata.description", () => {
    const errors = validateManifest({
      ...validManifest,
      metadata: { ...validManifest.metadata, description: "" },
    });
    assert.ok(errors.some((e) => e.includes("metadata.description")));
  });

  it("rejects missing metadata.version", () => {
    const errors = validateManifest({
      ...validManifest,
      metadata: { ...validManifest.metadata, version: "" },
    });
    assert.ok(errors.some((e) => e.includes("metadata.version")));
  });

  it("rejects provides entry missing name", () => {
    const errors = validateManifest({
      ...validManifest,
      provides: [{ name: "", description: "desc" }],
    });
    assert.ok(errors.some((e) => e.includes("provides[0].name")));
  });

  it("rejects provides entry missing description", () => {
    const errors = validateManifest({
      ...validManifest,
      provides: [{ name: "svc", description: "" }],
    });
    assert.ok(errors.some((e) => e.includes("provides[0].description")));
  });
});

// --- DiscoveryCapability ---

describe("DiscoveryCapability", () => {
  let executor: MockSystemExecutor;
  const capDir = "/var/lib/nazar/capabilities";
  const skillsDir = "/var/lib/nazar/skills";

  const makeConfig = (): CapabilityConfig => ({
    nazar: { hostname: "test", primary_user: "test" },
    services: { systemExecutor: executor },
  });

  beforeEach(() => {
    executor = new MockSystemExecutor();
  });

  const addManifest = (
    name: string,
    extra?: {
      skills?: string[];
      provides?: Array<{ name: string; description: string }>;
    },
  ) => {
    const lines = [
      `apiVersion: nazar.dev/v1`,
      `kind: CapabilityManifest`,
      `metadata:`,
      `  name: ${name}`,
      `  description: "${name} cap"`,
      `  version: "1.0.0"`,
    ];
    if (extra?.skills) {
      lines.push("skills:");
      for (const s of extra.skills) lines.push(`  - ${s}`);
    }
    if (extra?.provides) {
      lines.push("provides:");
      for (const p of extra.provides) {
        lines.push(`  - name: ${p.name}`);
        lines.push(`    description: "${p.description}"`);
      }
    }
    // Register file content
    executor.fileContents.set(
      path.join(capDir, `${name}.yaml`),
      lines.join("\n"),
    );
    // Ensure capDir lists this file
    const existing = executor.directories.get(capDir) ?? [];
    existing.push(`${name}.yaml`);
    executor.directories.set(capDir, existing);
  };

  const addSkillDir = (source: string) => {
    const dir = path.join(skillsDir, source);
    executor.directories.set(dir, []);
  };

  it("discovers manifests and resolves skill paths", async () => {
    addManifest("core", { skills: ["nazar-runtime", "object-task"] });
    addSkillDir("core");

    const cap = new DiscoveryCapability({ capabilitiesDir: capDir, skillsDir });
    const reg = await cap.init(makeConfig());

    assert.ok(reg.skillPaths);
    assert.equal(reg.skillPaths.length, 1);
    assert.ok(reg.skillPaths[0].endsWith("/core"));
  });

  it("returns empty when no manifests exist", async () => {
    executor.directories.set(capDir, []);
    executor.directories.set(skillsDir, []);

    const cap = new DiscoveryCapability({ capabilitiesDir: capDir, skillsDir });
    const reg = await cap.init(makeConfig());

    assert.equal(reg.skillPaths, undefined);
    assert.equal(reg.extensionFactory, undefined);
  });

  it("falls back to scanning skills dir when no manifests", async () => {
    // No manifests (capDir doesn't exist), but skills directories exist
    addSkillDir("core");
    addSkillDir("nazar-whisper");
    executor.directories.set(skillsDir, ["core", "nazar-whisper"]);

    const cap = new DiscoveryCapability({
      capabilitiesDir: "/nonexistent/caps",
      skillsDir,
    });
    const reg = await cap.init(makeConfig());

    assert.ok(reg.skillPaths);
    assert.equal(reg.skillPaths.length, 2);
    const names = reg.skillPaths.map((p) => path.basename(p)).sort();
    assert.deepEqual(names, ["core", "nazar-whisper"]);
  });

  it("skips manifests with validation errors", async () => {
    // Add invalid manifest
    executor.fileContents.set(
      path.join(capDir, "bad.yaml"),
      "apiVersion: v2\nkind: Other\nmetadata:\n  name: bad\n  description: bad\n  version: '1'\n",
    );
    addManifest("good", { skills: ["skill-a"] });
    // Add "bad.yaml" to directory listing
    const existing = executor.directories.get(capDir) ?? [];
    existing.push("bad.yaml");
    executor.directories.set(capDir, existing);

    addSkillDir("good");

    const cap = new DiscoveryCapability({ capabilitiesDir: capDir, skillsDir });
    const reg = await cap.init(makeConfig());

    assert.ok(reg.skillPaths);
    assert.equal(reg.skillPaths.length, 1);
    assert.ok(reg.skillPaths[0].endsWith("/good"));
  });

  it("skips manifests whose skill directories do not exist", async () => {
    addManifest("orphan", { skills: ["no-such-skill"] });
    // Don't add the skills directory

    const cap = new DiscoveryCapability({ capabilitiesDir: capDir, skillsDir });
    const reg = await cap.init(makeConfig());

    // No skill paths because the directory doesn't exist
    assert.equal(reg.skillPaths, undefined);
  });

  it("discovers multiple capability sources", async () => {
    addManifest("core", { skills: ["nazar-runtime"] });
    addManifest("nazar-whisper", { skills: ["transcribe-audio"] });
    addSkillDir("core");
    addSkillDir("nazar-whisper");

    const cap = new DiscoveryCapability({ capabilitiesDir: capDir, skillsDir });
    const reg = await cap.init(makeConfig());

    assert.ok(reg.skillPaths);
    assert.equal(reg.skillPaths.length, 2);
  });

  it("creates extension factory when provides entries exist", async () => {
    addManifest("nazar-whisper", {
      skills: ["transcribe-audio"],
      provides: [{ name: "whisper-stt", description: "Speech-to-text" }],
    });
    addSkillDir("nazar-whisper");

    const cap = new DiscoveryCapability({ capabilitiesDir: capDir, skillsDir });
    const reg = await cap.init(makeConfig());

    assert.ok(reg.extensionFactory);
    const ext = reg.extensionFactory.create();
    assert.equal(ext.name, "discovery-provides");

    // Verify the extension injects context
    const result = ext.on({ type: "context", messages: [] }) as {
      messages: Array<{ role: string; content: string }>;
    };
    assert.ok(result?.messages);
    assert.ok(result.messages[0].content.includes("whisper-stt"));
    assert.ok(result.messages[0].content.includes("Speech-to-text"));
  });

  it("does not create extension factory when no provides", async () => {
    addManifest("core", { skills: ["nazar-runtime"] });
    addSkillDir("core");

    const cap = new DiscoveryCapability({ capabilitiesDir: capDir, skillsDir });
    const reg = await cap.init(makeConfig());

    assert.equal(reg.extensionFactory, undefined);
  });

  it("handles nonexistent capabilities directory gracefully", async () => {
    const cap = new DiscoveryCapability({
      capabilitiesDir: "/nonexistent/path",
      skillsDir: "/also/nonexistent",
    });
    const reg = await cap.init(makeConfig());

    assert.equal(reg.skillPaths, undefined);
    assert.equal(reg.extensionFactory, undefined);
  });
});

// --- CapabilityExtractor ---

describe("CapabilityExtractor", () => {
  let executor: MockSystemExecutor;
  let extractor: CapabilityExtractor;

  beforeEach(() => {
    executor = new MockSystemExecutor();
    extractor = new CapabilityExtractor(executor);
  });

  describe("extractManifest", () => {
    it("returns true when podman cp succeeds", async () => {
      // Override exec to succeed for podman cp
      executor.exec = async (cmd: string, args: string[]) => {
        executor.execCalls.push({ cmd, args });
        return { stdout: "", stderr: "", exitCode: 0 };
      };

      const result = await extractor.extractManifest(
        "nazar-whisper",
        "/var/lib/nazar/capabilities/nazar-whisper.yaml",
      );
      assert.equal(result, true);

      const cpCall = executor.execCalls.find(
        (c) => c.cmd === "podman" && c.args[0] === "cp",
      );
      assert.ok(cpCall);
      assert.equal(cpCall.args[1], "nazar-whisper:/nazar/capability.yaml");
      assert.equal(
        cpCall.args[2],
        "/var/lib/nazar/capabilities/nazar-whisper.yaml",
      );
    });

    it("returns false when container has no manifest", async () => {
      // Simulate podman cp failure (file not found in container)
      executor.exec = async (cmd: string, args: string[]) => {
        executor.execCalls.push({ cmd, args });
        if (cmd === "podman" && args[0] === "cp") {
          return { stdout: "", stderr: "no such file", exitCode: 125 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      };

      const result = await extractor.extractManifest(
        "nazar-plain",
        "/var/lib/nazar/capabilities/nazar-plain.yaml",
      );
      assert.equal(result, false);
    });
  });

  describe("extractSkills", () => {
    it("creates output dir and extracts each skill", async () => {
      await extractor.extractSkills(
        "nazar-whisper",
        ["transcribe-audio", "speech-detect"],
        "/var/lib/nazar/skills/nazar-whisper",
      );

      assert.ok(
        executor.createdDirs.includes("/var/lib/nazar/skills/nazar-whisper"),
      );

      const cpCalls = executor.execCalls.filter(
        (c) => c.cmd === "podman" && c.args[0] === "cp",
      );
      assert.equal(cpCalls.length, 2);
      assert.equal(
        cpCalls[0].args[1],
        "nazar-whisper:/nazar/skills/transcribe-audio",
      );
      assert.equal(
        cpCalls[0].args[2],
        "/var/lib/nazar/skills/nazar-whisper/transcribe-audio",
      );
      assert.equal(
        cpCalls[1].args[1],
        "nazar-whisper:/nazar/skills/speech-detect",
      );
    });
  });
});
