import type { ObjectData } from "./object-store.js";

/** Parses and serializes YAML frontmatter in markdown files. */
export interface IFrontmatterParser {
  /** Parse a raw markdown string with YAML frontmatter into structured data and body content. */
  parse(raw: string): ObjectData;
  /** Serialize frontmatter data and markdown body content back into a raw markdown string. */
  stringify(data: Record<string, unknown>, content: string): string;
}
