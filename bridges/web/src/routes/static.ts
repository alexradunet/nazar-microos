import fs from "node:fs";
import type http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = path.resolve(__dirname, "../static");

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css",
  ".js": "application/javascript",
  ".html": "text/html",
};

export function serveStatic(pathname: string, res: http.ServerResponse): void {
  // Strip /static/ prefix
  const relative = pathname.replace(/^\/static\//, "");
  const filePath = path.join(STATIC_DIR, relative);

  // Prevent directory traversal (trailing sep blocks sibling dir matches)
  if (!filePath.startsWith(STATIC_DIR + path.sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType }).end(content);
  } catch {
    res.writeHead(404).end("Not Found");
  }
}
