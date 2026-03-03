import { type Affordance, validateAffordance } from "@nazar/core";
import { escapeHtml } from "./templates/components.js";

const ALLOWED_ENDPOINTS: RegExp[] = [
  /^\/agents\/ops\/(restart|status|logs|health)\/.+$/,
  /^\/agents\/security\/review\/.+$/,
  /^\/agents\/store\/(list|read|search)(\/.*)?$/,
  /^\/agents\/chat\/followup$/,
];

export function renderAffordances(affordances: Affordance[]): string {
  const valid = affordances.filter((a) =>
    validateAffordance(a, ALLOWED_ENDPOINTS),
  );
  if (valid.length === 0) return "";

  const buttons = valid.map((aff) => {
    const attr = aff.method === "POST" ? "hx-post" : "hx-get";
    const confirm = aff.confirm
      ? ` hx-confirm="${escapeHtml(aff.confirm)}"`
      : "";
    const title = aff.description
      ? ` title="${escapeHtml(aff.description)}"`
      : "";
    return `<button ${attr}="${escapeHtml(aff.href)}" hx-target="#conversation" hx-swap="beforeend"${confirm}${title}>${escapeHtml(aff.label)}</button>`;
  });

  return `<div class="affordances">${buttons.join("\n")}</div>`;
}
