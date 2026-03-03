# Nazar AI Desktop Shell — Architecture & Implementation Plan

## Context

Nazar is currently a headless AI companion on Fedora bootc 42 — interaction is limited to Signal messaging and a web terminal (ttyd). The goal is to add a custom AI-controlled desktop/UI where:

1. The AI can return not just text but **interactive UI** — action buttons, forms, status cards, data views
2. Multiple agents can offer actions dynamically based on current system state
3. It runs natively on-device as a kiosk display AND is accessible from any device (phone/web)
4. No heavy JS frameworks — simple, expandable, open source

## Core Architecture: HATEOAS + HTMX

**The key insight:** HATEOAS (Hypermedia as the Engine of Application State) was always waiting for AI. Traditional machine clients couldn't reason through hypermedia affordances — LLMs can. The AI returns **affordances** (what actions are currently possible), the server renders them as safe HTMX controls, and the browser follows hypermedia links. Every response is a complete hypermedia document: content + available state transitions.

This eliminates the need for a component registry, eliminates XSS risk (AI never generates HTML), and naturally supports multi-agent (each affordance can point to a different agent endpoint).

```
┌─────────────────────────────────────────────────────────────┐
│  Fedora bootc 42                                            │
│                                                             │
│  ┌──────────────┐   ┌──────────────────────────────────┐    │
│  │ cage (Wayland)│   │ nazar-ui container (Hono :3000)  │    │
│  │  └─chromium ──┼──→│                                  │    │
│  │    --kiosk    │   │  User message                    │    │
│  └──────────────┘   │    ↓                              │    │
│                      │  Pi AgentSession                  │    │
│                      │    ↓                              │    │
│                      │  AI returns: { text, affordances }│    │
│                      │    ↓                              │    │
│                      │  Server validates affordances     │    │
│                      │    ↓                              │    │
│                      │  Renders safe HTMX from templates │    │
│                      │    ↓                              │    │
│                      │  Browser: text + action buttons   │    │
│                      │    ↓                              │    │
│                      │  User clicks action → new request │    │
│                      │    ↓                              │    │
│                      │  Agent responds → new affordances │    │
│                      └──────────────────────────────────┘    │
│                            ↑                                 │
│  Phone/Tablet ─── Tailscale ───┘                             │
└─────────────────────────────────────────────────────────────┘
```

### The Affordance Model

The AI responds with structured JSON — never raw HTML:

```typescript
// What the AI returns (via structured output / Zod schema)
interface AgentResponse {
  text: string;                    // Markdown text response
  affordances: Affordance[];       // What actions are available NOW
}

interface Affordance {
  rel: string;                     // Semantic link relation: "restart", "logs", "delegate"
  label: string;                   // Human-readable: "Restart Signal Bridge"
  description?: string;            // Tooltip: "Perform a clean restart"
  method: "GET" | "POST";         // HTTP method
  href: string;                    // Agent endpoint: "/agents/ops/restart/signal-bridge"
  confirm?: string;                // Optional confirmation: "Restart now?"
  params?: Record<string, string>; // Optional form fields for POST
}
```

The server validates each affordance against a whitelist of known agent endpoints, then renders safe HTMX HTML from trusted templates:

```html
<!-- Server-rendered from trusted template — AI never touches HTML -->
<div class="response">
  <div class="text">
    <!-- Rendered markdown from AI text -->
    <p>Signal-bridge restarted 3 times in the last hour due to OOM errors.</p>
  </div>

  <div class="affordances">
    <button hx-post="/agents/ops/restart/signal-bridge"
            hx-target="#conversation" hx-swap="beforeend"
            hx-confirm="Restart signal-bridge now?">
      Restart Signal Bridge
    </button>

    <button hx-get="/agents/ops/logs/signal-bridge?lines=200"
            hx-target="#conversation" hx-swap="beforeend">
      Show Full Logs
    </button>

    <button hx-post="/agents/security/review/signal-bridge"
            hx-target="#conversation" hx-swap="beforeend">
      Ask Security Agent to Review
    </button>
  </div>
</div>
```

**Each click → agent endpoint responds → new text + new affordances → HTMX swaps.** The UI state is always the current hypermedia response. No client-side state machine.

### Why HATEOAS over alternatives

| Approach | AI generates HTML? | XSS risk | Component registry? | Multi-agent? | Build step? |
|----------|-------------------|----------|---------------------|-------------|-------------|
| **HATEOAS + HTMX** | No (JSON affordances) | None (server templates) | No (affordances ARE the UI) | Natural (href per agent) | None |
| Raw HTMX | Yes | High (needs DOMPurify) | No | Manual | None |
| JSON + Lit Components | No (JSON) | Low | Yes (must register) | Possible | tsc |
| SvelteKit + AI SDK | No (tool calls) | Low | Yes (tool→component map) | Complex | Vite |
| React + Vercel AI SDK | No (tool calls) | Low | Yes (tool→component map) | Complex | Vite + React |

HATEOAS wins because: the AI describes **intent** (what actions are possible), the server controls **presentation** (how they render), and the client controls **interaction** (when to fire them). Clean separation. The AI can offer "restart service", "show logs", "ask another agent" — all through the same simple affordance protocol.

### Security model

1. AI returns `{ text, affordances[] }` — structured JSON, never HTML
2. Server validates each affordance:
   - `href` must match allowlist pattern: `/agents/{known-agent}/{known-action}/{known-resource}`
   - `method` must be GET or POST (no DELETE/PUT from AI)
   - `params` keys must be in allowed set per endpoint
3. Server renders affordances using trusted templates (AI values are escaped)
4. HTMX `htmx.config.allowEval = false` — disables `hx-on` eval paths
5. Tailscale for network-level auth on remote access

---

## Phase 1: Foundation — HATEOAS Chat Service

### 1.1 New service: `services/nazar-ui/`

**Files to create:**

| File | Purpose |
|------|---------|
| `services/nazar-ui/package.json` | Deps: hono, @hono/node-server, @nazar/core, zod |
| `services/nazar-ui/tsconfig.json` | Composite, references nazar-core |
| `services/nazar-ui/src/index.ts` | Hono app, routes, `serve()` |
| `services/nazar-ui/src/config.ts` | Env-based config (port, Pi settings) |
| `services/nazar-ui/src/agent.ts` | Pi AgentSession → SSE streaming + affordance extraction |
| `services/nazar-ui/src/affordances.ts` | Affordance Zod schema, validation, whitelist, rendering |
| `services/nazar-ui/src/persona.ts` | Persona loader (copied from signal-bridge, channel="Web") |
| `services/nazar-ui/src/extension.ts` | Nazar Pi extension (copied from signal-bridge) |
| `services/nazar-ui/src/templates/layout.ts` | HTML shell with HTMX + SSE ext |
| `services/nazar-ui/src/templates/chat.ts` | Chat page, message rendering |
| `services/nazar-ui/src/templates/affordances.ts` | Affordance → HTMX HTML renderer |
| `services/nazar-ui/src/templates/components.ts` | `escapeHtml()`, markdown renderer |
| `services/nazar-ui/src/static/style.css` | Dark theme, responsive layout |
| `services/nazar-ui/src/static/htmx.min.js` | Vendored HTMX (~14KB) |
| `services/nazar-ui/src/static/sse.js` | Vendored HTMX SSE extension |
| `services/nazar-ui/src/__tests__/affordances.test.ts` | Affordance validation + rendering tests |
| `services/nazar-ui/src/__tests__/config.test.ts` | Config loading tests |
| `services/nazar-ui/src/__tests__/templates.test.ts` | Template output tests |

### 1.2 Affordance system — `services/nazar-ui/src/affordances.ts`

The heart of the architecture:

```typescript
import { z } from "zod";
import { escapeHtml } from "./templates/components.js";

// Schema the AI must conform to (taught via system prompt)
export const AffordanceSchema = z.object({
  rel: z.string(),
  label: z.string().max(100),
  description: z.string().max(500).optional(),
  method: z.enum(["GET", "POST"]),
  href: z.string(),
  confirm: z.string().max(200).optional(),
  params: z.record(z.string()).optional(),
});

export const AgentResponseSchema = z.object({
  text: z.string(),
  affordances: z.array(AffordanceSchema).max(6).default([]),
});

export type Affordance = z.infer<typeof AffordanceSchema>;
export type AgentResponse = z.infer<typeof AgentResponseSchema>;

// Whitelist of allowed agent endpoint patterns
const ALLOWED_ENDPOINTS: RegExp[] = [
  /^\/agents\/ops\/(restart|status|logs|health)\/.+$/,
  /^\/agents\/security\/review\/.+$/,
  /^\/agents\/store\/(list|read|search)(\/.*)?$/,
  /^\/agents\/skills\/(list|describe)(\/.*)?$/,
  /^\/agents\/chat\/followup$/,
];

export function validateAffordance(aff: Affordance): boolean {
  return ALLOWED_ENDPOINTS.some((pattern) => pattern.test(aff.href));
}

export function renderAffordances(affordances: Affordance[]): string {
  const valid = affordances.filter(validateAffordance);
  if (valid.length === 0) return "";

  const buttons = valid.map((aff) => {
    const method = aff.method === "POST" ? "hx-post" : "hx-get";
    const confirm = aff.confirm
      ? ` hx-confirm="${escapeHtml(aff.confirm)}"` : "";
    const title = aff.description
      ? ` title="${escapeHtml(aff.description)}"` : "";
    return `<button ${method}="${escapeHtml(aff.href)}" `
      + `hx-target="#conversation" hx-swap="beforeend"`
      + `${confirm}${title}>${escapeHtml(aff.label)}</button>`;
  });

  return `<div class="affordances">${buttons.join("\n")}</div>`;
}
```

### 1.3 Agent streaming with affordance extraction — `services/nazar-ui/src/agent.ts`

Two-phase streaming: first stream text tokens via SSE, then parse final response for affordances:

```typescript
// Phase 1: Stream text tokens as SSE events for real-time display
// Phase 2: On turn_end, parse accumulated text for structured affordances
//
// The Pi AgentSession system prompt teaches the AI to end responses with:
//   ---AFFORDANCES---
//   [{"rel":"restart","label":"Restart","method":"POST","href":"/agents/ops/restart/signal-bridge"}]
//
// The agent.ts parser splits text from affordances JSON,
// validates via Zod, and yields a final "affordances" SSE event.

export async function* streamAgentResponse(
  text: string, sessionId: string, config: NazarUiConfig
): AsyncGenerator<{ event: string; data: string }> {
  // ... Pi AgentSession setup (same LRU cache pattern as signal-bridge) ...

  // Yield "token" events during streaming
  // On completion, parse for affordances block
  // Yield final "affordances" event with validated JSON
  // Yield "done" event
}
```

The client-side SSE handler:

```html
<div class="msg assistant"
     hx-ext="sse"
     sse-connect="/chat/stream?sid=local&msg=hello"
     sse-swap="token"
     hx-swap="beforeend">
  <!-- Tokens stream here in real-time -->
  <!-- On "affordances" event, server-rendered buttons appear -->
  <!-- On "done" event, SSE connection closes -->
</div>
```

### 1.4 Agent endpoints — the HATEOAS actions

When the user clicks an affordance button, HTMX fires a request to the agent endpoint. These are separate Hono routes:

```typescript
// services/nazar-ui/src/routes/agents.ts
import { Hono } from "hono";

const agents = new Hono();

// Ops agent endpoints
agents.post("/agents/ops/restart/:service", async (c) => {
  const service = c.req.param("service");
  // Execute: systemctl --user restart nazar-${service}
  // Return: new hypermedia response with status + new affordances
  return c.html(renderAgentResponse({
    text: `Restarted ${service}. Current status: running.`,
    affordances: [
      { rel: "logs", label: "Show Logs", method: "GET",
        href: `/agents/ops/logs/${service}?lines=50` },
      { rel: "health", label: "Health Check", method: "GET",
        href: `/agents/ops/health/${service}` },
    ],
  }));
});

agents.get("/agents/ops/logs/:service", async (c) => {
  // Fetch container logs, return as formatted response
});

agents.get("/agents/ops/status/:service", async (c) => {
  // Return service status with relevant affordances
});

// Security agent endpoints
agents.post("/agents/security/review/:service", async (c) => {
  // Run security analysis, return findings + affordances
});

// Object store endpoints
agents.get("/agents/store/list", async (c) => {
  // List objects with type filter affordances
});

export { agents };
```

### 1.5 Teaching the AI about affordances

The AI learns available affordances through its system prompt (persona). Add to `agent/context/SYSTEM.md` or `agent/context/APPEND_SYSTEM.md`:

```markdown
## Response Format

You can offer interactive actions by ending your response with an affordances block.
Only offer actions that are relevant to the current conversation.

Format:
---AFFORDANCES---
[array of affordance objects]

Available actions:
- restart service: POST /agents/ops/restart/{service}
- show logs: GET /agents/ops/logs/{service}?lines={n}
- check health: GET /agents/ops/health/{service}
- security review: POST /agents/security/review/{service}
- list objects: GET /agents/store/list?type={type}
- read object: GET /agents/store/read/{type}/{slug}
- search objects: GET /agents/store/search?q={query}
- follow up: POST /agents/chat/followup

Each affordance: { rel, label, method, href, description?, confirm? }
Only include confirm for destructive actions (restart, delete).
```

### 1.6 Config schema additions

**Modify: `packages/nazar-core/src/types.ts`** — Add to NazarConfig:

```typescript
ui?: { port?: number; kiosk?: boolean };
```

**Modify: `packages/nazar-core/src/config.ts`** — Add ui port validation (same pattern as ttyd)

### 1.7 Quadlet generation

**Modify: `packages/nazar-core/src/setup.ts`** — Add after ttyd block:

```typescript
const uiPort = configValue(config, "ui.port", 3000);
files.push({
  path: path.join(outputDir, "nazar-ui.container"),
  content: renderQuadletContainer({
    name: "nazar-ui",
    image: "localhost/nazar-ui:latest",
    description: "Nazar Web UI",
    volumes: [
      "/var/lib/nazar/objects:/data/objects:rw,z",
      "/var/lib/nazar/pi-config:/home/nazar/.pi:rw,z",
      `${personaDir}:${personaDir}:ro,z`,
    ],
    environment: {
      NAZAR_UI_PORT: String(uiPort),
      NAZAR_SKILLS_DIR: skillsDir,
      NAZAR_PERSONA_DIR: personaDir,
      PI_CODING_AGENT_DIR: "/home/nazar/.pi/agent",
    },
    publishPorts: [`${uiPort}:${uiPort}`],
    noNewPrivileges: true,
  }),
});
```

### 1.8 Container & build infrastructure

| Action | File | Change |
|--------|------|--------|
| CREATE | `containers/nazar-ui/Containerfile` | FROM nazar-base, build + run service |
| CREATE | `sysconfig/bound-images/nazar-ui.image` | Bound image declaration |
| MODIFY | `core/containers/base/Containerfile` | Add `COPY services/nazar-ui/package.json` |
| MODIFY | `tsconfig.json` (root) | Add `{ "path": "services/nazar-ui" }` to references |
| MODIFY | `Makefile` | Add nazar-ui to containers target |
| MODIFY | `sysconfig/nazar.yaml.default` | Add `ui:` block |
| MODIFY | `nazar.yaml.example` | Add `ui:` block |

### 1.9 Tests

**Modify: `packages/nazar-core/src/__tests__/setup.test.ts`**:
- Update expected file list to include `"nazar-ui.container"`
- Add tests for default port 3000 and custom port

**New: `services/nazar-ui/src/__tests__/affordances.test.ts`**:
- Validate AffordanceSchema accepts valid affordances
- Validate AffordanceSchema rejects malformed affordances
- `validateAffordance()` accepts whitelisted endpoints
- `validateAffordance()` rejects unknown endpoints
- `renderAffordances()` produces correct HTMX HTML
- `renderAffordances()` escapes all AI-provided strings
- `renderAffordances()` filters out invalid affordances silently

---

## Phase 2: Kiosk Display

### 2.1 System packages

**Modify: `os/Containerfile`** — Add to dnf install:

```dockerfile
RUN dnf install -y \
      git-core nodejs22 tailscale vim-minimal htop tmux \
      cage chromium \
    && dnf clean all
```

cage = Wayland kiosk compositor (single fullscreen app, wlroots-based, production-proven in ATMs/POS/signage). Runs from TTY via systemd — no display manager needed.

### 2.2 Kiosk systemd service

**Create: `sysconfig/systemd/nazar-kiosk.service`**

```ini
[Unit]
Description=Nazar Kiosk Display
After=nazar-ui.service
ConditionPathExists=/etc/nazar/kiosk-enabled

[Service]
User=nazar-agent
Environment=WLR_LIBINPUT_NO_DEVICES=1
ExecStart=/usr/bin/cage -- /usr/bin/chromium \
  --kiosk --app=http://localhost:3000 \
  --no-first-run --disable-infobars --noerrdialogs
Restart=on-failure

[Install]
WantedBy=graphical.target
```

`ConditionPathExists` sentinel — kiosk only starts when enabled via config.

### 2.3 Auto-login

**Create: `sysconfig/systemd/getty@tty1.service.d/autologin.conf`** — systemd drop-in for auto-login on TTY1.

### 2.4 Setup integration

**Modify: `packages/nazar-core/src/setup.ts`** — Add `generateSystemFiles()` that creates/removes `/etc/nazar/kiosk-enabled` based on `ui.kiosk` config.

---

## Phase 3: Cross-Device Access

### 3.1 PWA support

- `manifest.json` + service worker → installable on phone home screen
- Same HTMX app serves all devices: kiosk (localhost), phone (Tailscale), tablet (Tailscale)
- Offline UI shell via service worker cache; AI responses require server connectivity

### 3.2 Auth middleware

- Localhost always passes (kiosk display)
- Tailscale IPs (100.64-127.x.x): require session token cookie
- Login via `/auth?token=SECRET` → sets HttpOnly cookie

### 3.3 Responsive CSS

- Desktop: full-width chat, left sidebar nav
- Mobile: bottom nav, collapsible sidebar, 48px touch targets

---

## Phase 4: Expanding the Hypermedia Surface

Once the HATEOAS chat is working, expand the affordance vocabulary. Each new capability is just new agent endpoints + new affordance types the AI can offer:

### 4.1 Rich affordance types

Extend the affordance schema with form fields for interactive input:

```typescript
// Affordance with parameters → renders as a form
{
  rel: "configure",
  label: "Update Heartbeat Interval",
  method: "POST",
  href: "/agents/config/heartbeat",
  params: { interval: "30m" }  // Pre-filled form field
}
// Renders as:
// <form hx-post="/agents/config/heartbeat" ...>
//   <input name="interval" value="30m">
//   <button type="submit">Update Heartbeat Interval</button>
// </form>
```

### 4.2 New agent endpoints to add over time

| Agent | Endpoint Pattern | Affordance Examples |
|-------|-----------------|---------------------|
| ops | `/agents/ops/{action}/{service}` | restart, status, logs, health |
| security | `/agents/security/{action}/{target}` | review, audit, report |
| store | `/agents/store/{action}` | list, read, search, create, link |
| skills | `/agents/skills/{action}` | list, describe, enable, disable |
| config | `/agents/config/{section}` | view, update heartbeat/signal/ui |
| system | `/agents/system/{metric}` | disk, memory, uptime, containers |

### 4.3 Multi-agent delegation

An affordance can point to a different agent. When the ops-agent says "Ask Security Agent to Review", clicking that button hits `/agents/security/review/signal-bridge`. The security agent responds with its own analysis + its own affordances. The conversation flows naturally between agents.

### 4.4 Navigation as affordances

Even page navigation is hypermedia — the AI can offer navigation affordances:

```json
{ "rel": "navigate", "label": "View Object Store", "method": "GET", "href": "/agents/store/list" }
```

Use `hx-push-url="true"` to update the browser URL for bookmarkability.

### 4.5 Upgrade path: cage → sway

When overlay HUD is needed (system status bar, notification badges), swap cage for sway with minimal config + eww/ags for wlr-layer-shell widgets. The web UI is unchanged — overlays read from the same Hono API.

---

## Key Architecture Decisions

| Decision | Why |
|----------|-----|
| **HATEOAS affordances** over component registry | AI describes intent, server controls presentation. No XSS. No registry. |
| **Hono** over Express/Fastify | 14KB, TS-native, built-in `streamSSE()`, Web Standards |
| **HTMX + SSE** over React/Vue/Svelte | Zero JS framework, ~14KB, HATEOAS client by design |
| **Zod** for affordance validation | Type-safe validation, same schema teaches AI via system prompt |
| **cage** over Sway/custom compositor | Single-purpose kiosk, no config, clear upgrade path |
| **Pure TS templates** over Handlebars | Same tsc build, type-safe, no extra deps |
| **Token auth** over OAuth | Self-hosted single-user, Tailscale provides network auth |
| **Vendored HTMX** over CDN | Offline-capable, pinned version, no supply chain risk |

---

## Critical files to modify

| File | Change |
|------|--------|
| `packages/nazar-core/src/types.ts` | Add `ui?` to NazarConfig |
| `packages/nazar-core/src/config.ts` | Add ui port validation |
| `packages/nazar-core/src/setup.ts` | Add nazar-ui Quadlet generation |
| `packages/nazar-core/src/__tests__/setup.test.ts` | Update file list assertion |
| `core/containers/base/Containerfile` | Add nazar-ui package.json |
| `tsconfig.json` (root) | Add nazar-ui reference |
| `Makefile` | Add nazar-ui container build |
| `sysconfig/nazar.yaml.default` | Add `ui:` block |
| `nazar.yaml.example` | Add `ui:` block |
| `os/Containerfile` (Phase 2) | Add cage + chromium packages |

## Existing code to reuse

| Source | Reuse in nazar-ui |
|--------|-------------------|
| `services/signal-bridge/src/index.ts` lines 98-172 | AgentSession creation pattern |
| `services/signal-bridge/src/index.ts` lines 176-214 | Event subscription + text_delta handling |
| `services/signal-bridge/src/persona.ts` | Copy, change channel to "Web" |
| `services/signal-bridge/src/extension.ts` | Copy as-is |
| `packages/nazar-core/src/setup.ts` `renderQuadletContainer()` | Generate nazar-ui.container |
| `packages/nazar-core/src/config.ts` `configValue()` | Read ui.port with default |

---

## Verification

After Phase 1:
1. `npm install` — workspace deps resolve
2. `npm run build` — tsc succeeds for all workspaces
3. `npm test` — all tests pass (setup + affordance tests)
4. `npm run check` — biome lint clean
5. `make containers` — nazar-ui container builds
6. Manual: run `node services/nazar-ui/dist/index.js`, open http://localhost:3000
7. Send a message → text streams via SSE → affordance buttons appear → clicking one triggers agent endpoint → new response with new affordances

After Phase 2:
8. `make image` — bootc image builds with cage + chromium
9. Boot VM with `ui.kiosk: true` → cage launches Chromium fullscreen → HATEOAS chat UI renders
