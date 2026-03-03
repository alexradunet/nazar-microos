import type http from "node:http";
import { renderMessageBubble } from "../templates/chat.js";

export async function handleAgentAction(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const parts = url.pathname.split("/").filter(Boolean);
  // /agents/<domain>/<action>/<target>
  const domain = parts[1];
  const action = parts[2];
  const target = parts[3];

  let html: string;

  if (domain === "ops") {
    html = renderMessageBubble(
      "assistant",
      `[stub] ${action} ${target || ""} — agent ops not yet wired`,
    );
  } else if (domain === "store") {
    html = renderMessageBubble(
      "assistant",
      `[stub] store ${action} — object store browsing not yet wired`,
    );
  } else {
    html = renderMessageBubble("assistant", `Unknown agent domain: ${domain}`);
  }

  res.writeHead(200, { "Content-Type": "text/html" }).end(html);
}
