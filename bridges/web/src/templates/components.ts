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

  // Links — escape both label and URL, restrict to safe schemes
  const SAFE_URL_SCHEME = /^https?:|^mailto:/i;
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, label: string, url: string) => {
      const safeUrl = SAFE_URL_SCHEME.test(url) ? escapeHtml(url) : "#";
      return `<a href="${safeUrl}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
    },
  );

  // Line breaks (preserve double newlines as paragraphs)
  html = html
    .split("\n\n")
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n");

  return html;
}
