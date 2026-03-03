/**
 * IFrontmatterParser port — round-trips YAML frontmatter in markdown files.
 *
 * The flat-file object store uses the format:
 * ```
 * ---
 * title: My Note
 * tags: [foo, bar]
 * ---
 * Markdown body content here.
 * ```
 * This port defines parse (raw string → ObjectData) and stringify
 * (ObjectData fields → raw string) so the object store can remain
 * agnostic of the specific YAML library used.
 *
 * Handles: splitting the `---` fence, YAML parsing/serialization, returning
 * the body content separately from frontmatter.
 * Does NOT handle: schema validation of frontmatter fields, type coercion
 * beyond YAML's built-in types, or file I/O.
 *
 * For implementation, see capabilities/frontmatter/frontmatter-parser.ts.
 * For the ObjectData type, see ./object-store.ts.
 */
import type { ObjectData } from "./object-store.js";

/** Parses and serializes YAML frontmatter in markdown files. */
export interface IFrontmatterParser {
  /** Parse a raw markdown string with YAML frontmatter into structured data and body content. */
  parse(raw: string): ObjectData;
  /** Serialize frontmatter data and markdown body content back into a raw markdown string. */
  stringify(data: Record<string, unknown>, content: string): string;
}
