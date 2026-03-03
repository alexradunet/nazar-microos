/**
 * Unit tests for agent-bridge pure helpers.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAllowed, validatePhoneNumber } from "../agent-bridge.js";

// ---------------------------------------------------------------------------
// isAllowed
// ---------------------------------------------------------------------------

describe("isAllowed", () => {
  it("returns true for any contact when allowedContacts is empty", () => {
    assert.equal(isAllowed("+19999999999", []), true);
    assert.equal(isAllowed("+15550001234", []), true);
  });

  it("returns true when contact is in the allowedContacts list", () => {
    const allowed = ["+19991112222", "+19993334444"];
    assert.equal(isAllowed("+19991112222", allowed), true);
    assert.equal(isAllowed("+19993334444", allowed), true);
  });

  it("returns false when contact is NOT in the allowedContacts list", () => {
    const allowed = ["+19991112222"];
    assert.equal(isAllowed("+19998887777", allowed), false);
    assert.equal(isAllowed("+15550009999", allowed), false);
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
