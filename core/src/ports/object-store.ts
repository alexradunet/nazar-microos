/**
 * IObjectStore port — CRUD + search + linking over the flat-file object store.
 *
 * Each object is a markdown file with YAML frontmatter stored under
 * `objects/{type}/{slug}.md`. This port defines the contract; it does NOT
 * implement file I/O or path resolution.
 *
 * For implementation, see capabilities/object-store/markdown-file-store.ts.
 * For the frontmatter serialization contract, see IFrontmatterParser in ./frontmatter-parser.ts.
 */

/** Parsed object data from a flat-file markdown with YAML frontmatter. */
export interface ObjectData {
  /** Frontmatter key-value pairs. */
  data: Record<string, unknown>;
  /** Markdown body content (after frontmatter). */
  content: string;
}

/** Lightweight reference to a stored object. */
export interface ObjectRef {
  type: string;
  slug: string;
  title?: string;
}

/** Filter options for object listing. */
export interface ObjectFilters {
  [key: string]: string | number | undefined;
  /** Objects modified within N minutes. */
  recentMinutes?: number;
}

/**
 * CRUD operations on the flat-file object store.
 *
 * Handles: create, read, update, list, search, link, appendContent.
 * Does NOT handle: file path resolution, frontmatter serialization, or
 * directory bootstrapping. Those concerns belong to the implementation.
 *
 * For implementation, see capabilities/object-store/markdown-file-store.ts.
 *
 * @example
 * ```ts
 * const store: IObjectStore = registry.get<ObjectStoreCapability>("object-store").getStore();
 * store.create("note", "hello-world", { title: "Hello World" });
 * const obj = store.read("note", "hello-world");
 * console.log(obj.data.title); // "Hello World"
 * store.update("note", "hello-world", { status: "done" });
 * const notes = store.list("note", { status: "done" });
 * ```
 */
export interface IObjectStore {
  /**
   * Create a new object file with the given type, slug, and optional frontmatter fields.
   * @returns A confirmation string (e.g. "created type/slug").
   * @throws If an object with the same type/slug already exists.
   */
  create(type: string, slug: string, fields?: Record<string, string>): string;
  /**
   * Read an object by type and slug, returning its parsed frontmatter and body content.
   * @throws If the object does not exist.
   */
  read(type: string, slug: string): ObjectData;
  /**
   * List objects, optionally filtered by type and frontmatter field values.
   * Pass `null` for type to list across all types. Supports tag filtering via `{ tag: "value" }`.
   */
  list(type: string | null, filters?: Record<string, string>): ObjectRef[];
  /**
   * Update frontmatter fields on an existing object. Automatically updates the `modified` timestamp.
   * @throws If the object does not exist.
   */
  update(type: string, slug: string, fields: Record<string, string>): void;
  /**
   * Full-text search across all objects for a substring pattern.
   * @returns Deduplicated references to matching objects.
   * @throws If the objects directory does not exist.
   */
  search(pattern: string): ObjectRef[];
  /**
   * Create a bidirectional link between two objects (specified as "type/slug" references).
   * @returns A confirmation string (e.g. "linked a <-> b").
   * @throws If either object does not exist or the reference format is invalid.
   */
  link(refA: string, refB: string): string;
  /**
   * Append content to an existing object's markdown body.
   * @throws If the object does not exist.
   */
  appendContent(type: string, slug: string, content: string): void;
}
