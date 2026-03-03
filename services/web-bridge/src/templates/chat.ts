import { escapeHtml, markdownToHtml } from "./components.js";

export function renderChatPage(): string {
  return `
<div id="chat">
  <div id="conversation"></div>
  <form hx-post="/chat" hx-target="#conversation" hx-swap="beforeend" hx-on::after-request="this.reset(); document.getElementById('conversation').scrollTop = document.getElementById('conversation').scrollHeight;">
    <input type="text" name="message" placeholder="Message Nazar..." autocomplete="off" autofocus required>
    <button type="submit">Send</button>
  </form>
</div>`;
}

export function renderMessageBubble(
  role: "user" | "assistant",
  text: string,
): string {
  const content =
    role === "assistant" ? markdownToHtml(text) : escapeHtml(text);
  return `<div class="message ${role}">${content}</div>\n`;
}
