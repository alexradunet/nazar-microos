/**
 * Unit tests for nazar matrix-bridge core functions.
 *
 * Uses node:test + node:assert/strict (zero framework deps).
 * processMessage tests use real executables (printf, false) to avoid
 * complex mocking while still validating behaviour end-to-end.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isAllowed, validateMatrixUserId, processMessage } from "../index.js";
import type { MatrixBridgeConfig } from "../index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal MatrixBridgeConfig for testing. */
function makeConfig(overrides: Partial<MatrixBridgeConfig> = {}): MatrixBridgeConfig {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nazar-bridge-test-"));
  return {
    homeserverUrl: "http://localhost:6167",
    accessToken: "test-token",
    allowedUsers: [],
    storageDir: path.join(tmpDir, "storage"),
    piCommand: "printf",
    piDir: tmpDir,
    repoRoot: tmpDir,
    objectsDir: path.join(tmpDir, "objects"),
    skillsDir: path.join(tmpDir, "skills"),
    timeoutMs: 5_000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isAllowed
// ---------------------------------------------------------------------------

describe("isAllowed", () => {
  it("returns true for any user when allowedUsers is empty", () => {
    const config = makeConfig({ allowedUsers: [] });
    assert.equal(isAllowed("@anyone:example.com", config), true);
    assert.equal(isAllowed("@random:matrix.org", config), true);
  });

  it("returns true when user is in the allowedUsers list", () => {
    const config = makeConfig({
      allowedUsers: ["@alice:example.com", "@bob:example.com"],
    });
    assert.equal(isAllowed("@alice:example.com", config), true);
    assert.equal(isAllowed("@bob:example.com", config), true);
  });

  it("returns false when user is NOT in the allowedUsers list", () => {
    const config = makeConfig({
      allowedUsers: ["@alice:example.com"],
    });
    assert.equal(isAllowed("@eve:example.com", config), false);
    assert.equal(isAllowed("@bob:matrix.org", config), false);
  });
});

// ---------------------------------------------------------------------------
// validateMatrixUserId
// ---------------------------------------------------------------------------

describe("validateMatrixUserId", () => {
  it("accepts valid user ID @alice:example.com", () => {
    assert.equal(validateMatrixUserId("@alice:example.com"), true);
  });

  it("accepts valid user ID with dots @user.name:matrix.org", () => {
    assert.equal(validateMatrixUserId("@user.name:matrix.org"), true);
  });

  it("accepts valid user ID with allowed special chars", () => {
    assert.equal(validateMatrixUserId("@user_name+tag=1/2:server.co"), true);
  });

  it("rejects missing @ prefix", () => {
    assert.equal(validateMatrixUserId("alice:example.com"), false);
  });

  it("rejects missing :domain", () => {
    assert.equal(validateMatrixUserId("@alice"), false);
  });

  it("rejects empty string", () => {
    assert.equal(validateMatrixUserId(""), false);
  });

  it("rejects empty localpart (@:domain)", () => {
    assert.equal(validateMatrixUserId("@:domain.com"), false);
  });

  it("rejects user ID with spaces", () => {
    assert.equal(validateMatrixUserId("@alice bob:example.com"), false);
  });
});

// ---------------------------------------------------------------------------
// processMessage
// ---------------------------------------------------------------------------

describe("processMessage", () => {
  it("returns trimmed stdout on success", async () => {
    // printf with args: printf -p "hello world"
    // printf interprets first arg as format string, so "-p" is the format, "hello world" is unused.
    // Use a different approach: use /bin/sh -c to produce predictable output.
    // Actually, processMessage calls execFile(piCommand, ["-p", text]).
    // We can use "echo" which ignores that -p is intended for pi and just prints both args.
    const config = makeConfig({ piCommand: "echo" });
    const result = await processMessage("hello world", config);
    // echo produces: "-p hello world\n" which trims to "-p hello world"
    assert.equal(result, "-p hello world");
  });

  it("returns '(no response)' when stdout is empty", async () => {
    // "true" produces no output and exits 0
    const config = makeConfig({ piCommand: "true" });
    const result = await processMessage("anything", config);
    assert.equal(result, "(no response)");
  });

  it("returns error message when command fails", async () => {
    // "false" exits with code 1
    const config = makeConfig({ piCommand: "false" });
    const result = await processMessage("anything", config);
    assert.equal(
      result,
      "Sorry, I encountered an error processing your message. Please try again.",
    );
  });

  it("returns error message when command does not exist", async () => {
    const config = makeConfig({ piCommand: "/nonexistent/command" });
    const result = await processMessage("anything", config);
    assert.equal(
      result,
      "Sorry, I encountered an error processing your message. Please try again.",
    );
  });

  it("passes correct arguments to piCommand", async () => {
    // Use printf "%s\n" to print each arg on its own line — verifies the args array.
    // execFile("printf", ["-p", "test input"]) → printf receives "-p" and "test input".
    // printf treats first positional arg as format string: format = "-p", arg = "test input".
    // But printf -p just prints "-p" literally (no format specifier).
    // Use a wrapper: /bin/sh -c 'echo "$@"' -- to inspect args? No — execFile doesn't use shell.
    //
    // Simplest: use "echo" and verify the output contains the expected text.
    const config = makeConfig({ piCommand: "echo" });
    const text = "what is the weather?";
    const result = await processMessage(text, config);
    // echo outputs all args space-separated: "-p what is the weather?"
    assert.equal(result, `-p ${text}`);
  });

  it("trims leading and trailing whitespace from output", async () => {
    // printf "  hello  " (no newline) — but execFile("printf", ["-p", "  hello  "])
    // printf format = "-p", which outputs "-p" literally (no format specifiers).
    // Actually printf with format "-p" outputs "-p" and ignores remaining args.
    // Use echo which adds trailing newline — trim should remove it.
    const config = makeConfig({ piCommand: "echo" });
    const result = await processMessage("test", config);
    // echo adds \n, trim removes it. Verify no trailing newline.
    assert.ok(!result.endsWith("\n"), "output should be trimmed");
    assert.equal(result, "-p test");
  });

  it("respects the configured repoRoot as cwd", async () => {
    // Create a small script that prints its working directory.
    // processMessage calls execFile(piCommand, ["-p", text]), so our script
    // receives "-p" and the text as arguments but we ignore them.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nazar-cwd-test-"));
    const scriptPath = path.join(tmpDir, "print-cwd.sh");
    fs.writeFileSync(scriptPath, '#!/bin/sh\npwd\n', { mode: 0o755 });

    const config = makeConfig({ piCommand: scriptPath, repoRoot: tmpDir });
    const result = await processMessage("ignored", config);
    // Resolve both to handle symlinks (e.g. /tmp → /private/tmp on macOS)
    assert.equal(fs.realpathSync(result), fs.realpathSync(tmpDir));
  });
});
