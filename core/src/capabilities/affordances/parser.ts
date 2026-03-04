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

/** A reference to a media file the agent wants to send to the user. */
export interface MediaRef {
  path: string;
  type: "image" | "audio" | "video" | "document";
  caption?: string;
}

/** Intermediate parse result — text + links + media, no metadata. */
export interface ParsedAgentOutput {
  text: string;
  links: Link[];
  media?: MediaRef[];
}

/** HATEOAS response — the canonical format for all bridge communication. */
export interface HateoasResponse {
  text: string;
  links: Link[];
  media?: MediaRef[];
  meta: {
    channel: string;
    timestamp: string;
  };
}

const MEDIA_DELIMITER = "---MEDIA---";
const DELIMITER = "---AFFORDANCES---";

/** Hand-written type guard for MediaRef objects. */
export function isMediaRef(value: unknown): value is MediaRef {
  if (value === null || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;

  if (typeof obj.path !== "string" || obj.path.length === 0) return false;
  const validTypes = ["image", "audio", "video", "document"];
  if (!validTypes.includes(obj.type as string)) return false;
  if (obj.caption !== undefined && typeof obj.caption !== "string")
    return false;

  return true;
}

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
 * Parse raw agent output, splitting on `---MEDIA---` then `---AFFORDANCES---`.
 * Invalid links and media refs are silently dropped.
 *
 * Expected order in agent output:
 *   text...
 *   ---MEDIA---
 *   [{"path":...}]
 *   ---AFFORDANCES---
 *   [{"rel":...}]
 */
export function parseAgentOutput(raw: string): ParsedAgentOutput {
  let remainder = raw;
  let media: MediaRef[] | undefined;

  // Split on ---MEDIA--- first
  const mediaIndex = remainder.indexOf(MEDIA_DELIMITER);
  if (mediaIndex !== -1) {
    const beforeMedia = remainder.slice(0, mediaIndex).trim();
    const afterMedia = remainder.slice(mediaIndex + MEDIA_DELIMITER.length);
    // The media JSON block extends until ---AFFORDANCES--- or end of string
    const affInMedia = afterMedia.indexOf(DELIMITER);
    const mediaBlock =
      affInMedia !== -1
        ? afterMedia.slice(0, affInMedia).trim()
        : afterMedia.trim();
    const restAfterMedia =
      affInMedia !== -1 ? afterMedia.slice(affInMedia) : "";

    media = parseMediaBlock(mediaBlock);
    remainder = beforeMedia + (restAfterMedia ? `\n${restAfterMedia}` : "");
  }

  // Split on ---AFFORDANCES---
  const delimiterIndex = remainder.indexOf(DELIMITER);
  if (delimiterIndex === -1) {
    const text = remainder.trim();
    return media ? { text, links: [], media } : { text, links: [] };
  }

  const text = remainder.slice(0, delimiterIndex).trim();
  const jsonBlock = remainder.slice(delimiterIndex + DELIMITER.length).trim();

  if (!jsonBlock) {
    return media ? { text, links: [], media } : { text, links: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonBlock);
  } catch {
    return media ? { text, links: [], media } : { text, links: [] };
  }

  if (!Array.isArray(parsed)) {
    return media ? { text, links: [], media } : { text, links: [] };
  }

  const links = parsed.filter(isLink);
  return media ? { text, links, media } : { text, links };
}

/** Parse a JSON block of MediaRef objects. Returns undefined if empty/invalid. */
function parseMediaBlock(block: string): MediaRef[] | undefined {
  if (!block) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(block);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  const refs = parsed.filter(isMediaRef);
  return refs.length > 0 ? refs : undefined;
}

/** Wrap a ParsedAgentOutput with channel metadata to produce a full HateoasResponse. */
export function toHateoasResponse(
  parsed: ParsedAgentOutput,
  channel: string,
): HateoasResponse {
  const response: HateoasResponse = {
    text: parsed.text,
    links: parsed.links,
    meta: { channel, timestamp: new Date().toISOString() },
  };
  if (parsed.media) {
    response.media = parsed.media;
  }
  return response;
}

/** Validate a link's href against a whitelist of allowed endpoint patterns. */
export function validateLink(link: Link, allowedEndpoints: RegExp[]): boolean {
  return allowedEndpoints.some((pattern) => pattern.test(link.href));
}
