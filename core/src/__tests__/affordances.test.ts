import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Link } from "../capabilities/affordances/parser.js";
import {
  isLink,
  parseAgentOutput,
  toHateoasResponse,
  validateLink,
} from "../capabilities/affordances/parser.js";
import { TextRenderer } from "../capabilities/affordances/text-renderer.js";

describe("isLink", () => {
  const valid: Link = {
    rel: "restart",
    label: "Restart WhatsApp Bridge",
    method: "POST",
    href: "/agents/ops/restart/whatsapp-bridge",
  };

  it("accepts a valid link", () => {
    assert.ok(isLink(valid));
  });

  it("accepts link with optional fields", () => {
    assert.ok(
      isLink({
        ...valid,
        description: "Restart the service",
        confirm: "Are you sure?",
        params: { force: "true" },
      }),
    );
  });

  it("rejects null", () => {
    assert.ok(!isLink(null));
  });

  it("rejects non-object", () => {
    assert.ok(!isLink("string"));
    assert.ok(!isLink(42));
  });

  it("rejects missing rel", () => {
    const { rel, ...rest } = valid;
    assert.ok(!isLink(rest));
  });

  it("rejects missing label", () => {
    const { label, ...rest } = valid;
    assert.ok(!isLink(rest));
  });

  it("rejects empty label", () => {
    assert.ok(!isLink({ ...valid, label: "" }));
  });

  it("rejects label over 100 chars", () => {
    assert.ok(!isLink({ ...valid, label: "x".repeat(101) }));
  });

  it("rejects invalid method", () => {
    assert.ok(!isLink({ ...valid, method: "PUT" }));
    assert.ok(!isLink({ ...valid, method: "DELETE" }));
  });

  it("rejects missing href", () => {
    const { href, ...rest } = valid;
    assert.ok(!isLink(rest));
  });

  it("rejects empty href", () => {
    assert.ok(!isLink({ ...valid, href: "" }));
  });

  it("rejects non-string description", () => {
    assert.ok(!isLink({ ...valid, description: 42 }));
  });

  it("rejects non-string confirm", () => {
    assert.ok(!isLink({ ...valid, confirm: true }));
  });

  it("rejects non-object params", () => {
    assert.ok(!isLink({ ...valid, params: "bad" }));
  });

  it("rejects params with non-string values", () => {
    assert.ok(!isLink({ ...valid, params: { key: 123 } }));
  });
});

describe("parseAgentOutput", () => {
  it("returns text only when no links block", () => {
    const result = parseAgentOutput("Hello, how can I help?");
    assert.equal(result.text, "Hello, how can I help?");
    assert.deepEqual(result.links, []);
  });

  it("parses valid links block", () => {
    const raw = `Here is some text.
---AFFORDANCES---
[{"rel":"restart","label":"Restart","method":"POST","href":"/agents/ops/restart/whatsapp"}]`;
    const result = parseAgentOutput(raw);
    assert.equal(result.text, "Here is some text.");
    assert.equal(result.links.length, 1);
    assert.equal(result.links[0].rel, "restart");
    assert.equal(result.links[0].label, "Restart");
  });

  it("drops malformed JSON silently", () => {
    const raw = "Some text\n---AFFORDANCES---\n{not valid json}";
    const result = parseAgentOutput(raw);
    assert.equal(result.text, "Some text");
    assert.deepEqual(result.links, []);
  });

  it("drops non-array JSON silently", () => {
    const raw = 'Text\n---AFFORDANCES---\n{"not":"array"}';
    const result = parseAgentOutput(raw);
    assert.equal(result.text, "Text");
    assert.deepEqual(result.links, []);
  });

  it("keeps only valid links from a mixed array", () => {
    const raw = `Text
---AFFORDANCES---
[
  {"rel":"ok","label":"Good","method":"GET","href":"/a"},
  {"bad":"object"},
  {"rel":"ok2","label":"Also Good","method":"POST","href":"/b"}
]`;
    const result = parseAgentOutput(raw);
    assert.equal(result.text, "Text");
    assert.equal(result.links.length, 2);
    assert.equal(result.links[0].rel, "ok");
    assert.equal(result.links[1].rel, "ok2");
  });

  it("handles empty links block", () => {
    const raw = "Text\n---AFFORDANCES---\n";
    const result = parseAgentOutput(raw);
    assert.equal(result.text, "Text");
    assert.deepEqual(result.links, []);
  });

  it("handles empty array", () => {
    const raw = "Text\n---AFFORDANCES---\n[]";
    const result = parseAgentOutput(raw);
    assert.equal(result.text, "Text");
    assert.deepEqual(result.links, []);
  });
});

describe("toHateoasResponse", () => {
  it("wraps parsed output with channel metadata", () => {
    const parsed = {
      text: "Hello",
      links: [
        {
          rel: "status",
          label: "Check Status",
          method: "GET" as const,
          href: "/status",
        },
      ],
    };
    const response = toHateoasResponse(parsed, "whatsapp");
    assert.equal(response.text, "Hello");
    assert.equal(response.links.length, 1);
    assert.equal(response.meta.channel, "whatsapp");
    assert.ok(response.meta.timestamp);
  });

  it("produces valid ISO timestamp", () => {
    const response = toHateoasResponse({ text: "Hi", links: [] }, "test");
    assert.ok(!Number.isNaN(Date.parse(response.meta.timestamp)));
  });
});

describe("validateLink", () => {
  const allowed = [
    /^\/agents\/ops\/(restart|status|logs)\/.+$/,
    /^\/agents\/store\/(list|search)(\/.*)?$/,
  ];

  it("accepts whitelisted endpoint", () => {
    const link: Link = {
      rel: "restart",
      label: "Restart",
      method: "POST",
      href: "/agents/ops/restart/whatsapp-bridge",
    };
    assert.ok(validateLink(link, allowed));
  });

  it("accepts store endpoint", () => {
    const link: Link = {
      rel: "list",
      label: "List Objects",
      method: "GET",
      href: "/agents/store/list",
    };
    assert.ok(validateLink(link, allowed));
  });

  it("rejects unknown endpoint", () => {
    const link: Link = {
      rel: "hack",
      label: "Hack",
      method: "POST",
      href: "/admin/delete-all",
    };
    assert.ok(!validateLink(link, allowed));
  });

  it("rejects empty whitelist", () => {
    const link: Link = {
      rel: "ok",
      label: "Ok",
      method: "GET",
      href: "/agents/ops/status/test",
    };
    assert.ok(!validateLink(link, []));
  });
});

describe("TextRenderer", () => {
  const renderer = new TextRenderer();

  it("renders text with numbered link list", () => {
    const response = toHateoasResponse(
      {
        text: "Here are your options:",
        links: [
          {
            rel: "restart",
            label: "Restart WhatsApp Bridge",
            method: "POST" as const,
            href: "/a",
          },
          {
            rel: "logs",
            label: "Show Logs",
            method: "GET" as const,
            href: "/b",
          },
        ],
      },
      "whatsapp",
    );
    const result = renderer.render(response);
    assert.equal(
      result,
      "Here are your options:\n\n1. Restart WhatsApp Bridge\n2. Show Logs",
    );
  });

  it("returns text only when no links", () => {
    const response = toHateoasResponse(
      { text: "Just text", links: [] },
      "whatsapp",
    );
    assert.equal(renderer.render(response), "Just text");
  });

  it("renders single link", () => {
    const response = toHateoasResponse(
      {
        text: "Status:",
        links: [
          {
            rel: "status",
            label: "Check Status",
            method: "GET" as const,
            href: "/s",
          },
        ],
      },
      "whatsapp",
    );
    assert.equal(renderer.render(response), "Status:\n\n1. Check Status");
  });
});
