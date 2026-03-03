import type http from "node:http";
import type { AgentResponse, IAgentBridge } from "@nazar/core";
import { renderAffordances } from "../render.js";
import { renderMessageBubble } from "../templates/chat.js";

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

export async function handleChat(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  bridge: IAgentBridge,
  sessionId: string,
): Promise<void> {
  const body = await readBody(req);
  const params = new URLSearchParams(body);
  const message = params.get("message")?.trim();

  if (!message) {
    res
      .writeHead(400, { "Content-Type": "text/html" })
      .end(renderMessageBubble("assistant", "Please enter a message."));
    return;
  }

  // Render user bubble immediately
  let html = renderMessageBubble("user", message);

  try {
    const response: AgentResponse = await bridge.processMessage(
      message,
      sessionId,
    );
    html += renderMessageBubble("assistant", response.text);
    html += renderAffordances(response.affordances);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    html += renderMessageBubble("assistant", `Error: ${errMsg}`);
  }

  res.writeHead(200, { "Content-Type": "text/html" }).end(html);
}
