# WhatsApp Bridge — Implementation Plan

Future second messaging channel for Nazar, mirroring the Signal bridge architecture.

## Status: Planning (not yet implemented)

---

## 1. Overview

Add WhatsApp as a second `MessageChannel` adapter alongside Signal. The existing hexagonal architecture (ports and adapters) makes this straightforward — the `MessageChannel` interface in `@nazar/core` already abstracts channel-specific details.

**Goal**: A user can message Nazar on WhatsApp and get the same Pi AgentSession-powered responses as Signal, with per-contact session persistence, persona injection, and the full Nazar extension stack.

## 2. Architecture

### Current Signal Bridge Pattern

```
signal-cli daemon (TCP :7583)
    ↕ JSON-RPC over TCP
signal-bridge (TypeScript)
    ↕ MessageChannel interface
Pi AgentSession (per-contact)
```

Both containers share localhost via a Quadlet pod (`nazar-signal.pod`).

### Proposed WhatsApp Bridge Pattern

```
whatsapp-web.js (headless Chrome)
    ↕ WhatsApp Web protocol
whatsapp-bridge (TypeScript)
    ↕ MessageChannel interface
Pi AgentSession (per-contact)
```

Unlike Signal (which uses a separate signal-cli Java daemon), the WhatsApp bridge uses [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) — a pure Node.js library that connects directly to WhatsApp Web. This means **one container instead of two** (no separate daemon needed).

### Why whatsapp-web.js

| Option | Pros | Cons |
|--------|------|------|
| **whatsapp-web.js** | Pure JS, npm install, active community, no separate daemon | Unofficial API, needs headless Chrome |
| Baileys | Lightweight, no Chrome | Less stable, frequent breaking changes |
| WhatsApp Business API | Official, stable | Requires Meta business verification, costs money, overkill for personal use |

For a self-hosted personal companion, `whatsapp-web.js` is the pragmatic choice.

## 3. New Files

### 3.1 Service: `services/whatsapp-bridge/`

```
services/whatsapp-bridge/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts          # WhatsAppBotChannel + main()
    ├── extension.ts      # Re-export from signal-bridge (or shared)
    ├── persona.ts        # Re-export from signal-bridge (or shared)
    └── __tests__/
        └── bridge.test.ts
```

### 3.2 Container: `containers/whatsapp-bridge/`

```
containers/whatsapp-bridge/
└── Containerfile
```

### 3.3 Config & Quadlet additions

- `nazar.yaml` gains a `whatsapp:` block
- `nazar-core` setup generates new Quadlet files for whatsapp-bridge

## 4. Detailed Implementation

### 4.1 `services/whatsapp-bridge/package.json`

```json
{
  "name": "nazar-whatsapp-bridge",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch",
    "test": "tsc && node --test dist/__tests__/*.test.js"
  },
  "dependencies": {
    "@nazar/core": "*",
    "@mariozechner/pi-coding-agent": "*",
    "whatsapp-web.js": "^1.26.0",
    "qrcode-terminal": "^0.12.0"
  },
  "devDependencies": {
    "@types/node": "^25.0.0",
    "typescript": "^5.7.0"
  }
}
```

### 4.2 `WhatsAppBotChannel` (src/index.ts)

The channel adapter follows the same pattern as `SignalBotChannel`:

```typescript
export interface WhatsAppBridgeConfig extends AgentConfig {
  allowedContacts: string[];  // E.164 phone numbers
  storageDir: string;         // Auth session persistence
  personaDir: string;
  systemMdPath: string;
  piModel?: string;
  piTransport?: "sse" | "websocket" | "auto";
}

export class WhatsAppBotChannel implements MessageChannel {
  readonly name = "whatsapp";

  // Uses whatsapp-web.js Client internally
  // QR code auth on first run → session persisted to storageDir
  // Incoming messages → onMessage handler → processWithAgent() → reply
  // Same per-contact AgentSession pattern as Signal bridge
}
```

Key differences from Signal:

- **Authentication**: QR code scan on first run (printed to terminal via `qrcode-terminal`), then session stored in `storageDir` for subsequent runs. No phone number config needed — the authenticated account IS the bot identity.
- **No separate daemon**: `whatsapp-web.js` runs in-process, connecting via headless Chromium (puppeteer).
- **Contact identification**: WhatsApp uses `<phone>@c.us` format internally; normalize to E.164 for `allowedContacts` matching.
- **Message handling**: Listen for `client.on('message', ...)` instead of TCP JSON-RPC parsing.

### 4.3 Agent Integration (processWithAgent)

Identical to Signal bridge — the `processWithAgent()` function can be extracted to a shared module or copy-pasted (it's ~120 lines). It:

1. Lazy-loads Pi AgentSession SDK
2. Creates/reuses per-contact sessions (bounded Map with LRU eviction)
3. Loads persona with channel = `"WhatsApp"` (extracts `### WhatsApp` from BODY.md)
4. Subscribes to streaming events, accumulates response text
5. Returns accumulated response with timeout

### 4.4 Shared Code Opportunity

Both bridges share significant code. Consider extracting to `@nazar/core` or a shared internal package:

| Code | Signal | WhatsApp | Extract? |
|------|--------|----------|----------|
| `processWithAgent()` | index.ts | index.ts | Yes — to `@nazar/core` |
| `createNazarExtension()` | extension.ts | extension.ts | Yes — already generic |
| `loadPersonaPrompt()` | persona.ts | persona.ts | Yes — already generic |
| `isAllowed()` | index.ts | index.ts | Yes — pure function |
| Channel adapter | SignalBotChannel | WhatsAppBotChannel | No — channel-specific |

**Recommendation**: Extract shared code first, then build WhatsApp bridge importing from shared. This reduces duplication and ensures both bridges stay in sync.

### 4.5 Container: `containers/whatsapp-bridge/Containerfile`

```dockerfile
FROM nazar-base

USER root

# whatsapp-web.js needs Chromium
RUN dnf install -y chromium && dnf clean all

COPY services/whatsapp-bridge/ services/whatsapp-bridge/
RUN npm -w services/whatsapp-bridge run build
USER nazar

ENV NAZAR_OBJECTS_DIR=/data/objects
ENV NAZAR_WHATSAPP_STORAGE_DIR=/data/whatsapp-storage
ENV NAZAR_PI_MODEL=""
ENV NAZAR_PI_TRANSPORT=""
ENV NAZAR_PERSONA_DIR=/usr/local/share/nazar/persona
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD test -f /data/whatsapp-storage/healthy \
    && test "$(find /data/whatsapp-storage/healthy -mmin -1 2>/dev/null)" || exit 1

CMD ["node", "services/whatsapp-bridge/dist/index.js"]
```

**Note**: Unlike Signal (which uses a pod with two containers), WhatsApp is a single standalone container — no daemon, no pod needed.

### 4.6 Config: `nazar.yaml` additions

```yaml
whatsapp:
  allowed_contacts: []
```

No `phone_number` field needed — the WhatsApp account is established via QR code auth, not config.

### 4.7 Types: `NazarConfig` update

```typescript
// packages/nazar-core/src/types.ts
export interface NazarConfig {
  // ... existing fields ...
  whatsapp?: { allowed_contacts?: string[] };
}
```

### 4.8 Setup: Quadlet generation

Add to `generateQuadletFiles()` in `packages/nazar-core/src/setup.ts`:

```typescript
// --- WhatsApp Bridge container ---
const waContacts: string[] = configValue(config, "whatsapp.allowed_contacts", []);

files.push({
  path: path.join(outputDir, "nazar-whatsapp-bridge.container"),
  content: renderQuadletContainer({
    name: "nazar-whatsapp-bridge",
    image: "localhost/nazar-whatsapp-bridge:latest",
    description: "Nazar WhatsApp Bridge",
    volumes: [
      "/var/lib/nazar/objects:/data/objects:rw,z",
      "/var/lib/nazar/whatsapp-storage:/data/whatsapp-storage:rw,z",
      "/var/lib/nazar/pi-config:/home/nazar/.pi:rw,z",
      `${personaDir}:${personaDir}:ro,z`,
    ],
    environment: {
      NAZAR_WHATSAPP_ALLOWED_CONTACTS: waContacts.join(","),
      NAZAR_SKILLS_DIR: skillsDir,
      NAZAR_PERSONA_DIR: personaDir,
      PI_CODING_AGENT_DIR: "/home/nazar/.pi/agent",
    },
  }),
});
```

### 4.9 Persona: BODY.md WhatsApp section

Add a `### WhatsApp` section to `persona/BODY.md`:

```markdown
### WhatsApp
- Casual, conversational tone (WhatsApp is informal)
- Use short paragraphs — WhatsApp renders long messages poorly
- Emoji usage: moderate (more than Signal, this is WhatsApp after all)
- No markdown formatting (WhatsApp has its own: *bold*, _italic_, ~strike~)
```

## 5. QR Code Authentication Flow

The biggest UX difference from Signal. On first run:

1. Container starts, `whatsapp-web.js` Client initializes
2. QR code printed to stdout (visible via `podman logs` or `journalctl`)
3. User scans QR with WhatsApp mobile app → Links as "WhatsApp Web" device
4. Session credentials saved to `/data/whatsapp-storage/.wwebjs_auth/`
5. Subsequent restarts reconnect automatically using stored session

**Container restart considerations**:
- Auth session persists in volume mount → no re-scan needed after restart
- If WhatsApp revokes the web session (happens occasionally), user must re-scan
- Add startup log message with instructions: "Scan QR code with WhatsApp > Linked Devices"

## 6. Build & Makefile

Add to `Makefile` container targets:

```makefile
container-whatsapp-bridge:
	podman build -t nazar-whatsapp-bridge:latest -f containers/whatsapp-bridge/Containerfile .
```

Add to root `tsconfig.json` references:

```json
{ "path": "services/whatsapp-bridge" }
```

## 7. Testing Strategy

### Unit tests (`services/whatsapp-bridge/src/__tests__/bridge.test.ts`)

Mirror Signal bridge test structure:
- `WhatsAppBotChannel` construction and config validation
- `isAllowed()` with WhatsApp contact ID format
- Message handling (mock whatsapp-web.js Client)
- Health file creation on connect

### Integration test (manual)

1. `make container-whatsapp-bridge`
2. `podman run` with volume mounts
3. Scan QR code
4. Send test message from another WhatsApp account
5. Verify response

## 8. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| WhatsApp bans account for bot usage | High — lose WhatsApp number | Rate-limit responses, only respond to allowed contacts, don't auto-initiate |
| whatsapp-web.js breaks on WA protocol update | Medium — bridge down until library updates | Pin version, monitor GitHub issues, have Signal as fallback |
| Chromium memory usage in container | Medium — resource pressure | Set `--max-old-space-size`, consider lightweight Chrome flags (`--no-sandbox --disable-gpu --disable-dev-shm-usage`) |
| QR auth session expires | Low — needs re-scan | Log clear instructions, consider a notification hook |

## 9. Implementation Order

1. **Extract shared code** from signal-bridge → `@nazar/core` or internal shared module
   - `processWithAgent()`, `createNazarExtension()`, `loadPersonaPrompt()`, `isAllowed()`
2. **Scaffold `services/whatsapp-bridge/`** — package.json, tsconfig.json, directory structure
3. **Implement `WhatsAppBotChannel`** — the channel adapter using whatsapp-web.js
4. **Add `### WhatsApp` section** to `persona/BODY.md`
5. **Update `NazarConfig`** type + `nazar.yaml.default` with `whatsapp:` block
6. **Update `generateQuadletFiles()`** in setup.ts
7. **Create `containers/whatsapp-bridge/Containerfile`**
8. **Update Makefile** + root tsconfig references
9. **Write tests**
10. **Manual integration test** — build container, scan QR, send message

## 10. Open Questions

- **Shared code extraction**: Do it as a prerequisite, or duplicate-then-refactor?
- **Multi-channel persona**: Should `BODY.md` grow per-channel sections, or should each channel have its own persona overlay file?
- **Rate limiting**: Add explicit rate limiting in the bridge, or rely on natural response time from Pi AgentSession?
- **Group messages**: Support WhatsApp group chats, or individual DMs only? (Signal bridge is DM-only)
- **Media messages**: Handle images/audio/documents, or text-only like Signal bridge?
