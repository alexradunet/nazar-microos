/** A hypermedia link (HATEOAS affordance). */
export interface Link {
  rel: string;
  href: string;
  method: "GET" | "POST";
  label: string;
  description?: string;
  confirm?: string;
  params?: Record<string, string>;
}

/** Intermediate parse result — text + links, no metadata. */
export interface ParsedAgentOutput {
  text: string;
  links: Link[];
}

/** HATEOAS response — the canonical format for all bridge communication. */
export interface HateoasResponse {
  text: string;
  links: Link[];
  meta: {
    channel: string;
    timestamp: string;
  };
}

const DELIMITER = "---AFFORDANCES---";

/** Hand-written type guard for Link objects. */
export function isLink(value: unknown): value is Link {
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
 * Parse raw agent output, splitting on the `---AFFORDANCES---` delimiter.
 * Invalid links are silently dropped.
 */
export function parseAgentOutput(raw: string): ParsedAgentOutput {
  const delimiterIndex = raw.indexOf(DELIMITER);
  if (delimiterIndex === -1) {
    return { text: raw, links: [] };
  }

  const text = raw.slice(0, delimiterIndex).trim();
  const jsonBlock = raw.slice(delimiterIndex + DELIMITER.length).trim();

  if (!jsonBlock) {
    return { text, links: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonBlock);
  } catch {
    return { text, links: [] };
  }

  if (!Array.isArray(parsed)) {
    return { text, links: [] };
  }

  const links = parsed.filter(isLink);
  return { text, links };
}

/** Wrap a ParsedAgentOutput with channel metadata to produce a full HateoasResponse. */
export function toHateoasResponse(
  parsed: ParsedAgentOutput,
  channel: string,
): HateoasResponse {
  return {
    text: parsed.text,
    links: parsed.links,
    meta: { channel, timestamp: new Date().toISOString() },
  };
}

/** Validate a link's href against a whitelist of allowed endpoint patterns. */
export function validateLink(link: Link, allowedEndpoints: RegExp[]): boolean {
  return allowedEndpoints.some((pattern) => pattern.test(link.href));
}
