import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mimeFromPath } from "../capabilities/affordances/mime.js";
import type { Link, MediaRef } from "../capabilities/affordances/parser.js";
import {
  isLink,
  isMediaRef,
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

// ---------------------------------------------------------------------------
// isMediaRef
// ---------------------------------------------------------------------------

describe("isMediaRef", () => {
  const valid: MediaRef = {
    path: "/var/lib/pibloom/objects/chart.png",
    type: "image",
  };

  it("accepts a valid media ref", () => {
    assert.ok(isMediaRef(valid));
  });

  it("accepts media ref with caption", () => {
    assert.ok(isMediaRef({ ...valid, caption: "Monthly chart" }));
  });

  it("accepts all valid types", () => {
    for (const type of ["image", "audio", "video", "document"]) {
      assert.ok(isMediaRef({ ...valid, type }));
    }
  });

  it("rejects null", () => {
    assert.ok(!isMediaRef(null));
  });

  it("rejects non-object", () => {
    assert.ok(!isMediaRef("string"));
  });

  it("rejects missing path", () => {
    assert.ok(!isMediaRef({ type: "image" }));
  });

  it("rejects empty path", () => {
    assert.ok(!isMediaRef({ path: "", type: "image" }));
  });

  it("rejects invalid type", () => {
    assert.ok(!isMediaRef({ path: "/a.png", type: "gif" }));
  });

  it("rejects non-string caption", () => {
    assert.ok(!isMediaRef({ ...valid, caption: 42 }));
  });
});

// ---------------------------------------------------------------------------
// parseAgentOutput with ---MEDIA---
// ---------------------------------------------------------------------------

describe("parseAgentOutput with ---MEDIA---", () => {
  it("parses media block only", () => {
    const raw = `Here is your chart.
---MEDIA---
[{"path":"/data/chart.png","type":"image","caption":"Chart"}]`;
    const result = parseAgentOutput(raw);
    assert.equal(result.text, "Here is your chart.");
    assert.deepEqual(result.links, []);
    assert.equal(result.media?.length, 1);
    assert.equal(result.media?.[0].path, "/data/chart.png");
    assert.equal(result.media?.[0].type, "image");
    assert.equal(result.media?.[0].caption, "Chart");
  });

  it("parses media + affordances together", () => {
    const raw = `Response text.
---MEDIA---
[{"path":"/data/file.mp3","type":"audio"}]
---AFFORDANCES---
[{"rel":"status","label":"Check","method":"GET","href":"/s"}]`;
    const result = parseAgentOutput(raw);
    assert.equal(result.text, "Response text.");
    assert.equal(result.media?.length, 1);
    assert.equal(result.media?.[0].type, "audio");
    assert.equal(result.links.length, 1);
    assert.equal(result.links[0].rel, "status");
  });

  it("drops invalid media refs silently", () => {
    const raw = `Text
---MEDIA---
[{"path":"/a.png","type":"image"},{"bad":"object"},{"path":"","type":"image"}]`;
    const result = parseAgentOutput(raw);
    assert.equal(result.media?.length, 1);
    assert.equal(result.media?.[0].path, "/a.png");
  });

  it("returns no media for malformed JSON", () => {
    const raw = "Text\n---MEDIA---\n{not valid}";
    const result = parseAgentOutput(raw);
    assert.equal(result.text, "Text");
    assert.equal(result.media, undefined);
  });

  it("returns no media for empty media block", () => {
    const raw = "Text\n---MEDIA---\n";
    const result = parseAgentOutput(raw);
    assert.equal(result.text, "Text");
    assert.equal(result.media, undefined);
  });
});

// ---------------------------------------------------------------------------
// toHateoasResponse with media
// ---------------------------------------------------------------------------

describe("toHateoasResponse with media", () => {
  it("carries media through to HateoasResponse", () => {
    const parsed = {
      text: "Here",
      links: [],
      media: [
        { path: "/data/img.png", type: "image" as const, caption: "An image" },
      ],
    };
    const response = toHateoasResponse(parsed, "whatsapp");
    assert.equal(response.media?.length, 1);
    assert.equal(response.media?.[0].path, "/data/img.png");
  });

  it("omits media when not present", () => {
    const response = toHateoasResponse({ text: "Hi", links: [] }, "test");
    assert.equal(response.media, undefined);
  });
});

// ---------------------------------------------------------------------------
// mimeFromPath
// ---------------------------------------------------------------------------

describe("mimeFromPath", () => {
  it("resolves common image types", () => {
    assert.equal(mimeFromPath("/data/photo.png"), "image/png");
    assert.equal(mimeFromPath("/data/photo.jpg"), "image/jpeg");
    assert.equal(mimeFromPath("/data/photo.jpeg"), "image/jpeg");
    assert.equal(mimeFromPath("/data/photo.webp"), "image/webp");
    assert.equal(mimeFromPath("/data/photo.gif"), "image/gif");
  });

  it("resolves common audio types", () => {
    assert.equal(mimeFromPath("voice.ogg"), "audio/ogg");
    assert.equal(mimeFromPath("voice.mp3"), "audio/mpeg");
    assert.equal(mimeFromPath("voice.wav"), "audio/wav");
    assert.equal(mimeFromPath("voice.opus"), "audio/opus");
  });

  it("resolves common video types", () => {
    assert.equal(mimeFromPath("video.mp4"), "video/mp4");
    assert.equal(mimeFromPath("video.webm"), "video/webm");
  });

  it("resolves document types", () => {
    assert.equal(mimeFromPath("doc.pdf"), "application/pdf");
    assert.equal(mimeFromPath("data.json"), "application/json");
    assert.equal(mimeFromPath("readme.txt"), "text/plain");
  });

  it("returns octet-stream for unknown extension", () => {
    assert.equal(mimeFromPath("file.xyz"), "application/octet-stream");
  });

  it("returns octet-stream for no extension", () => {
    assert.equal(mimeFromPath("noext"), "application/octet-stream");
  });

  it("is case-insensitive", () => {
    assert.equal(mimeFromPath("PHOTO.PNG"), "image/png");
    assert.equal(mimeFromPath("file.MP4"), "video/mp4");
  });
});
