/**
 * Affordance system — structured actions the AI can offer alongside text.
 *
 * Each channel renders affordances differently:
 * - Web: HTMX buttons/forms
 * - Signal/WhatsApp: numbered text options
 *
 * The AI ends responses with a `---AFFORDANCES---` block containing JSON.
 * Core parses and validates this; each bridge renders for its medium.
 */

export interface Affordance {
  rel: string;
  label: string;
  description?: string;
  method: "GET" | "POST";
  href: string;
  confirm?: string;
  params?: Record<string, string>;
}

export interface AgentResponse {
  text: string;
  affordances: Affordance[];
}

const AFFORDANCE_DELIMITER = "---AFFORDANCES---";

/** Hand-written type guard for Affordance objects. */
export function isAffordance(value: unknown): value is Affordance {
  if (value === null || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;

  if (typeof obj.rel !== "string" || obj.rel.length === 0) return false;
  if (typeof obj.label !== "string" || obj.label.length === 0) return false;
  if (obj.label.length > 100) return false;
  if (obj.method !== "GET" && obj.method !== "POST") return false;
  if (typeof obj.href !== "string" || obj.href.length === 0) return false;

  if (obj.description !== undefined && typeof obj.description !== "string")
    return false;
  if (obj.confirm !== undefined && typeof obj.confirm !== "string")
    return false;

  if (obj.params !== undefined) {
    if (typeof obj.params !== "object" || obj.params === null) return false;
    for (const val of Object.values(obj.params as Record<string, unknown>)) {
      if (typeof val !== "string") return false;
    }
  }

  return true;
}

/**
 * Parse an agent response, splitting on the `---AFFORDANCES---` delimiter.
 * Invalid affordances are silently dropped.
 */
export function parseAgentResponse(rawText: string): AgentResponse {
  const delimiterIndex = rawText.indexOf(AFFORDANCE_DELIMITER);
  if (delimiterIndex === -1) {
    return { text: rawText, affordances: [] };
  }

  const text = rawText.slice(0, delimiterIndex).trim();
  const jsonBlock = rawText
    .slice(delimiterIndex + AFFORDANCE_DELIMITER.length)
    .trim();

  if (!jsonBlock) {
    return { text, affordances: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonBlock);
  } catch {
    return { text, affordances: [] };
  }

  if (!Array.isArray(parsed)) {
    return { text, affordances: [] };
  }

  const affordances = parsed.filter(isAffordance);
  return { text, affordances };
}

/** Validate an affordance's href against a whitelist of allowed endpoint patterns. */
export function validateAffordance(
  aff: Affordance,
  allowedEndpoints: RegExp[],
): boolean {
  return allowedEndpoints.some((pattern) => pattern.test(aff.href));
}

/** Render affordances as a numbered text list for text-only channels. */
export function formatAffordancesAsText(affordances: Affordance[]): string {
  if (affordances.length === 0) return "";
  return affordances.map((aff, i) => `${i + 1}. ${aff.label}`).join("\n");
}
