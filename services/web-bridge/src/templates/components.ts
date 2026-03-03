const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

/** Basic markdown to HTML: bold, italic, inline code, code blocks, links. */
export function markdownToHtml(text: string): string {
  // Code blocks first (triple backticks)
  let html = text.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_match, _lang, code) =>
      `<pre><code>${escapeHtml(code.trimEnd())}</code></pre>`,
  );

  // Inline code
  html = html.replace(
    /`([^`]+)`/g,
    (_match, code) => `<code>${escapeHtml(code)}</code>`,
  );

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Links
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>',
  );

  // Line breaks (preserve double newlines as paragraphs)
  html = html
    .split("\n\n")
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n");

  return html;
}
