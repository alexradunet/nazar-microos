import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Affordance } from "../affordances.js";
import {
  formatAffordancesAsText,
  isAffordance,
  parseAgentResponse,
  validateAffordance,
} from "../affordances.js";

describe("isAffordance", () => {
  const valid: Affordance = {
    rel: "restart",
    label: "Restart Signal Bridge",
    method: "POST",
    href: "/agents/ops/restart/signal-bridge",
  };

  it("accepts a valid affordance", () => {
    assert.ok(isAffordance(valid));
  });

  it("accepts affordance with optional fields", () => {
    assert.ok(
      isAffordance({
        ...valid,
        description: "Restart the service",
        confirm: "Are you sure?",
        params: { force: "true" },
      }),
    );
  });

  it("rejects null", () => {
    assert.ok(!isAffordance(null));
  });

  it("rejects non-object", () => {
    assert.ok(!isAffordance("string"));
    assert.ok(!isAffordance(42));
  });

  it("rejects missing rel", () => {
    const { rel, ...rest } = valid;
    assert.ok(!isAffordance(rest));
  });

  it("rejects missing label", () => {
    const { label, ...rest } = valid;
    assert.ok(!isAffordance(rest));
  });

  it("rejects empty label", () => {
    assert.ok(!isAffordance({ ...valid, label: "" }));
  });

  it("rejects label over 100 chars", () => {
    assert.ok(!isAffordance({ ...valid, label: "x".repeat(101) }));
  });

  it("rejects invalid method", () => {
    assert.ok(!isAffordance({ ...valid, method: "PUT" }));
    assert.ok(!isAffordance({ ...valid, method: "DELETE" }));
  });

  it("rejects missing href", () => {
    const { href, ...rest } = valid;
    assert.ok(!isAffordance(rest));
  });

  it("rejects empty href", () => {
    assert.ok(!isAffordance({ ...valid, href: "" }));
  });

  it("rejects non-string description", () => {
    assert.ok(!isAffordance({ ...valid, description: 42 }));
  });

  it("rejects non-string confirm", () => {
    assert.ok(!isAffordance({ ...valid, confirm: true }));
  });

  it("rejects non-object params", () => {
    assert.ok(!isAffordance({ ...valid, params: "bad" }));
  });

  it("rejects params with non-string values", () => {
    assert.ok(!isAffordance({ ...valid, params: { key: 123 } }));
  });
});

describe("parseAgentResponse", () => {
  it("returns text only when no affordances block", () => {
    const result = parseAgentResponse("Hello, how can I help?");
    assert.equal(result.text, "Hello, how can I help?");
    assert.deepEqual(result.affordances, []);
  });

  it("parses valid affordances block", () => {
    const raw = `Here is some text.
---AFFORDANCES---
[{"rel":"restart","label":"Restart","method":"POST","href":"/agents/ops/restart/signal"}]`;
    const result = parseAgentResponse(raw);
    assert.equal(result.text, "Here is some text.");
    assert.equal(result.affordances.length, 1);
    assert.equal(result.affordances[0].rel, "restart");
    assert.equal(result.affordances[0].label, "Restart");
  });

  it("drops malformed JSON silently", () => {
    const raw = "Some text\n---AFFORDANCES---\n{not valid json}";
    const result = parseAgentResponse(raw);
    assert.equal(result.text, "Some text");
    assert.deepEqual(result.affordances, []);
  });

  it("drops non-array JSON silently", () => {
    const raw = 'Text\n---AFFORDANCES---\n{"not":"array"}';
    const result = parseAgentResponse(raw);
    assert.equal(result.text, "Text");
    assert.deepEqual(result.affordances, []);
  });

  it("keeps only valid affordances from a mixed array", () => {
    const raw = `Text
---AFFORDANCES---
[
  {"rel":"ok","label":"Good","method":"GET","href":"/a"},
  {"bad":"object"},
  {"rel":"ok2","label":"Also Good","method":"POST","href":"/b"}
]`;
    const result = parseAgentResponse(raw);
    assert.equal(result.text, "Text");
    assert.equal(result.affordances.length, 2);
    assert.equal(result.affordances[0].rel, "ok");
    assert.equal(result.affordances[1].rel, "ok2");
  });

  it("handles empty affordances block", () => {
    const raw = "Text\n---AFFORDANCES---\n";
    const result = parseAgentResponse(raw);
    assert.equal(result.text, "Text");
    assert.deepEqual(result.affordances, []);
  });

  it("handles empty array", () => {
    const raw = "Text\n---AFFORDANCES---\n[]";
    const result = parseAgentResponse(raw);
    assert.equal(result.text, "Text");
    assert.deepEqual(result.affordances, []);
  });
});

describe("validateAffordance", () => {
  const allowed = [
    /^\/agents\/ops\/(restart|status|logs)\/.+$/,
    /^\/agents\/store\/(list|search)(\/.*)?$/,
  ];

  it("accepts whitelisted endpoint", () => {
    const aff: Affordance = {
      rel: "restart",
      label: "Restart",
      method: "POST",
      href: "/agents/ops/restart/signal-bridge",
    };
    assert.ok(validateAffordance(aff, allowed));
  });

  it("accepts store endpoint", () => {
    const aff: Affordance = {
      rel: "list",
      label: "List Objects",
      method: "GET",
      href: "/agents/store/list",
    };
    assert.ok(validateAffordance(aff, allowed));
  });

  it("rejects unknown endpoint", () => {
    const aff: Affordance = {
      rel: "hack",
      label: "Hack",
      method: "POST",
      href: "/admin/delete-all",
    };
    assert.ok(!validateAffordance(aff, allowed));
  });

  it("rejects empty whitelist", () => {
    const aff: Affordance = {
      rel: "ok",
      label: "Ok",
      method: "GET",
      href: "/agents/ops/status/test",
    };
    assert.ok(!validateAffordance(aff, []));
  });
});

describe("formatAffordancesAsText", () => {
  it("renders numbered list", () => {
    const affordances: Affordance[] = [
      {
        rel: "restart",
        label: "Restart Signal Bridge",
        method: "POST",
        href: "/a",
      },
      { rel: "logs", label: "Show Logs", method: "GET", href: "/b" },
    ];
    const result = formatAffordancesAsText(affordances);
    assert.equal(result, "1. Restart Signal Bridge\n2. Show Logs");
  });

  it("returns empty string for empty array", () => {
    assert.equal(formatAffordancesAsText([]), "");
  });

  it("renders single item", () => {
    const affordances: Affordance[] = [
      { rel: "status", label: "Check Status", method: "GET", href: "/s" },
    ];
    assert.equal(formatAffordancesAsText(affordances), "1. Check Status");
  });
});
