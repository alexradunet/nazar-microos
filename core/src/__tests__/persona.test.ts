/**
 * Unit tests for persona loader.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  extractChannelSection,
  FsPersonaLoader,
} from "../capabilities/persona/fs-persona-loader.js";

const _personaLoader = new FsPersonaLoader();
const loadPersonaPrompt = _personaLoader.loadPersonaPrompt.bind(_personaLoader);
const loadSystemContext = _personaLoader.loadSystemContext.bind(_personaLoader);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pibloom-persona-test-"));
}

function writePersonaFiles(dir: string, files: Record<string, string>): void {
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
}

const tmpDirs: string[] = [];
function trackDir(dir: string): string {
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

// ---------------------------------------------------------------------------
// extractChannelSection
// ---------------------------------------------------------------------------

describe("extractChannelSection", () => {
  const body = [
    "# Body",
    "",
    "## Channel Adaptation",
    "",
    "### Interactive TUI",
    "",
    "- Full conversational mode.",
    "",
    "### Signal",
    "",
    "- Mobile-first. Short messages.",
    "- Warm and casual tone.",
    "",
    "## Presence Behavior",
    "",
    "- During heartbeat: observational.",
  ].join("\n");

  it("extracts the Signal section", () => {
    const result = extractChannelSection(body, "Signal");
    assert.ok(result.includes("### Signal"));
    assert.ok(result.includes("Mobile-first"));
    assert.ok(result.includes("Warm and casual"));
    assert.ok(!result.includes("Presence Behavior"));
    assert.ok(!result.includes("Interactive TUI"));
  });

  it("extracts the Interactive TUI section", () => {
    const result = extractChannelSection(body, "Interactive TUI");
    assert.ok(result.includes("### Interactive TUI"));
    assert.ok(result.includes("Full conversational mode"));
    assert.ok(!result.includes("Signal"));
  });

  it("returns full content when channel not found", () => {
    const result = extractChannelSection(body, "Telegram");
    assert.equal(result, body);
  });
});

// ---------------------------------------------------------------------------
// loadPersonaPrompt
// ---------------------------------------------------------------------------

describe("loadPersonaPrompt", () => {
  it("returns empty string when persona dir does not exist", () => {
    const result = loadPersonaPrompt("/nonexistent/persona/dir");
    assert.equal(result, "");
  });

  it("composes all four layers into a single prompt", () => {
    const dir = trackDir(makeTmpDir());
    const personaDir = path.join(dir, "persona");
    writePersonaFiles(personaDir, {
      "SOUL.md": "# Soul\n\nI am Bloom.",
      "BODY.md": "# Body\n\n## Channel\n\n### Signal\n\n- Short messages.",
      "FACULTY.md": "# Faculty\n\nThink step by step.",
      "SKILL.md": "# Skill\n\nObject management.",
    });

    const result = loadPersonaPrompt(personaDir);
    assert.ok(result.startsWith("# piBloom — Personal AI Companion"));
    assert.ok(result.includes("## Identity & Values"));
    assert.ok(result.includes("I am Bloom"));
    assert.ok(result.includes("## Channel Behavior"));
    assert.ok(result.includes("## Cognitive Patterns"));
    assert.ok(result.includes("## Capabilities"));
  });

  it("extracts channel-specific section from BODY.md when channel specified", () => {
    const dir = trackDir(makeTmpDir());
    const personaDir = path.join(dir, "persona");
    writePersonaFiles(personaDir, {
      "SOUL.md": "# Soul\n\nI am Bloom.",
      "BODY.md":
        "# Body\n\n### Interactive TUI\n\n- Rich.\n\n### Signal\n\n- Mobile-first.\n\n## Presence\n\n- Responsive.",
      "FACULTY.md": "# Faculty\n\nReason.",
      "SKILL.md": "# Skill\n\nSkills.",
    });

    const result = loadPersonaPrompt(personaDir, "Signal");
    assert.ok(result.includes("## Channel Behavior — Signal"));
    assert.ok(result.includes("Mobile-first"));
    assert.ok(!result.includes("Interactive TUI"));
    assert.ok(!result.includes("Presence"));
  });

  it("skips missing layer files gracefully", () => {
    const dir = trackDir(makeTmpDir());
    const personaDir = path.join(dir, "persona");
    writePersonaFiles(personaDir, {
      "SOUL.md": "# Soul\n\nI am Bloom.",
    });

    const result = loadPersonaPrompt(personaDir);
    assert.ok(result.includes("Identity & Values"));
    assert.ok(result.includes("I am Bloom"));
    // No BODY/FACULTY/SKILL sections
    assert.ok(!result.includes("Channel Behavior"));
    assert.ok(!result.includes("Cognitive Patterns"));
    assert.ok(!result.includes("Capabilities"));
  });

  it("returns empty string when persona dir exists but is empty", () => {
    const dir = trackDir(makeTmpDir());
    const personaDir = path.join(dir, "persona");
    fs.mkdirSync(personaDir, { recursive: true });

    const result = loadPersonaPrompt(personaDir);
    assert.equal(result, "");
  });
});

// ---------------------------------------------------------------------------
// loadSystemContext
// ---------------------------------------------------------------------------

describe("loadSystemContext", () => {
  it("returns empty string for empty path", () => {
    assert.equal(loadSystemContext(""), "");
  });

  it("returns empty string when file does not exist", () => {
    assert.equal(loadSystemContext("/nonexistent/SYSTEM.md"), "");
  });

  it("reads and trims file content", () => {
    const dir = trackDir(makeTmpDir());
    const filePath = path.join(dir, "SYSTEM.md");
    fs.writeFileSync(filePath, "  # System Context\n\nSome content.\n  ");

    const result = loadSystemContext(filePath);
    assert.equal(result, "# System Context\n\nSome content.");
  });
});
