import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { NazarConfig } from "@nazar/core";
import {
  type AgentSessionCapability,
  createInitializedRegistry,
} from "@nazar/core";
import { loadConfig } from "./config.js";
import { handleAgentAction } from "./routes/agents.js";
import { handleChat } from "./routes/chat.js";
import { serveStatic } from "./routes/static.js";
import { renderChatPage } from "./templates/chat.js";
import { renderLayout } from "./templates/layout.js";

async function main(): Promise<void> {
  const config = loadConfig();

  // Validate Pi agent config directory has required files
  const authFile = path.join(config.piDir, "auth.json");
  if (!fs.existsSync(authFile)) {
    throw new Error(
      `Pi agent auth not found at ${authFile}. ` +
        "Provision it to /var/lib/nazar/pi-config/agent/ on the host.",
    );
  }

  console.log("Nazar Web Bridge starting...");
  console.log(`  Port: ${config.port}`);
  console.log(`  Pi dir: ${config.piDir}`);
  console.log(`  Objects dir: ${config.objectsDir}`);
  console.log(`  Persona dir: ${config.personaDir}`);
  console.log(`  System MD: ${config.systemMdPath || "(none)"}`);
  console.log(`  Pi model: ${config.piModel || "(default)"}`);
  console.log(`  Pi transport: ${config.piTransport || "(default)"}`);

  const registry = await createInitializedRegistry({} as NazarConfig);
  const agentSession = registry.get<AgentSessionCapability>("agent-session");
  const bridge = agentSession.createBridge(config);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const method = req.method ?? "GET";

    try {
      if (method === "GET" && url.pathname === "/") {
        const page = renderLayout("Nazar", renderChatPage());
        res.writeHead(200, { "Content-Type": "text/html" }).end(page);
        return;
      }
      if (method === "POST" && url.pathname === "/chat") {
        await handleChat(req, res, bridge, config.sessionId);
        return;
      }
      if (method === "GET" && url.pathname.startsWith("/static/")) {
        serveStatic(url.pathname, res);
        return;
      }
      if (url.pathname.startsWith("/agents/")) {
        await handleAgentAction(req, res, url);
        return;
      }
      res.writeHead(404).end("Not Found");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`Request error: ${errMsg}`);
      if (!res.headersSent) {
        res.writeHead(500).end("Internal Server Error");
      }
    }
  });

  server.listen(config.port, () => {
    console.log(
      `Nazar Web Bridge listening on http://localhost:${config.port}`,
    );
  });
}

// Only run main when executed directly
import { fileURLToPath } from "node:url";

const isDirectExecution = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
