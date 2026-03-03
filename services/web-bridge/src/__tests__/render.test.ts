import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Affordance } from "@nazar/core";
import { renderAffordances } from "../render.js";

describe("renderAffordances", () => {
  it("renders GET button with hx-get", () => {
    const affordances: Affordance[] = [
      {
        rel: "status",
        label: "Check Status",
        method: "GET",
        href: "/agents/ops/status/signal-bridge",
      },
    ];
    const html = renderAffordances(affordances);
    assert.ok(html.includes("hx-get="));
    assert.ok(html.includes("/agents/ops/status/signal-bridge"));
    assert.ok(html.includes("Check Status"));
    assert.ok(html.includes('class="affordances"'));
  });

  it("renders POST button with hx-post", () => {
    const affordances: Affordance[] = [
      {
        rel: "restart",
        label: "Restart",
        method: "POST",
        href: "/agents/ops/restart/signal-bridge",
      },
    ];
    const html = renderAffordances(affordances);
    assert.ok(html.includes("hx-post="));
  });

  it("renders confirm attribute", () => {
    const affordances: Affordance[] = [
      {
        rel: "restart",
        label: "Restart",
        method: "POST",
        href: "/agents/ops/restart/signal-bridge",
        confirm: "Are you sure?",
      },
    ];
    const html = renderAffordances(affordances);
    assert.ok(html.includes('hx-confirm="Are you sure?"'));
  });

  it("renders title from description", () => {
    const affordances: Affordance[] = [
      {
        rel: "logs",
        label: "Logs",
        method: "GET",
        href: "/agents/ops/logs/signal-bridge",
        description: "View recent logs",
      },
    ];
    const html = renderAffordances(affordances);
    assert.ok(html.includes('title="View recent logs"'));
  });

  it("filters out invalid endpoints", () => {
    const affordances: Affordance[] = [
      {
        rel: "hack",
        label: "Bad Action",
        method: "POST",
        href: "/admin/delete",
      },
    ];
    const html = renderAffordances(affordances);
    assert.equal(html, "");
  });

  it("returns empty string for empty array", () => {
    assert.equal(renderAffordances([]), "");
  });

  it("escapes HTML in label", () => {
    const affordances: Affordance[] = [
      {
        rel: "test",
        label: '<script>alert("xss")</script>',
        method: "GET",
        href: "/agents/ops/status/test",
      },
    ];
    const html = renderAffordances(affordances);
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;"));
  });
});
