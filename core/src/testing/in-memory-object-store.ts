import type {
  IObjectStore,
  ObjectData,
  ObjectRef,
} from "../ports/object-store.js";

/** In-memory IObjectStore for tests — no file system required. */
export class InMemoryObjectStore implements IObjectStore {
  private objects = new Map<
    string,
    { data: Record<string, unknown>; content: string }
  >();

  private key(type: string, slug: string): string {
    return `${type}/${slug}`;
  }

  private nowIso(): string {
    return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  create(
    type: string,
    slug: string,
    fields: Record<string, string> = {},
  ): string {
    const k = this.key(type, slug);
    if (this.objects.has(k)) {
      throw new Error(`object already exists: ${k}`);
    }
    const now = this.nowIso();
    const data: Record<string, unknown> = {
      type,
      slug,
      ...fields,
      created: now,
      modified: now,
    };
    if (typeof data.tags === "string") {
      data.tags = (data.tags as string)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    const title = data.title as string | undefined;
    const content = title ? `# ${title}\n` : "";
    this.objects.set(k, { data, content });
    return `created ${k}`;
  }

  read(type: string, slug: string): ObjectData {
    const k = this.key(type, slug);
    const obj = this.objects.get(k);
    if (!obj) {
      throw new Error(`object not found: ${k}`);
    }
    return { data: { ...obj.data }, content: obj.content };
  }

  list(type: string | null, filters: Record<string, string> = {}): ObjectRef[] {
    const results: ObjectRef[] = [];
    for (const [, obj] of this.objects) {
      const d = obj.data;
      if (type !== null && d.type !== type) continue;

      let match = true;
      for (const [key, val] of Object.entries(filters)) {
        if (key === "tag") {
          const tags = Array.isArray(d.tags) ? d.tags : [];
          if (!tags.includes(val)) {
            match = false;
            break;
          }
        } else {
          if (String(d[key] ?? "") !== val) {
            match = false;
            break;
          }
        }
      }

      if (match) {
        const ref: ObjectRef = {
          type: String(d.type ?? ""),
          slug: String(d.slug ?? ""),
        };
        if (d.title) ref.title = String(d.title);
        results.push(ref);
      }
    }
    return results;
  }

  update(type: string, slug: string, fields: Record<string, string>): void {
    const k = this.key(type, slug);
    const obj = this.objects.get(k);
    if (!obj) {
      throw new Error(`object not found: ${k}`);
    }
    for (const [key, val] of Object.entries(fields)) {
      if (key === "type" || key === "slug" || key === "created") {
        throw new Error(`cannot update protected field: ${key}`);
      }
      obj.data[key] = val;
    }
    obj.data.modified = this.nowIso();
  }

  search(pattern: string): ObjectRef[] {
    const results: ObjectRef[] = [];
    for (const [, obj] of this.objects) {
      const raw = JSON.stringify(obj.data) + obj.content;
      if (raw.includes(pattern)) {
        results.push({
          type: String(obj.data.type ?? ""),
          slug: String(obj.data.slug ?? ""),
          ...(obj.data.title ? { title: String(obj.data.title) } : {}),
        });
      }
    }
    return results;
  }

  link(refA: string, refB: string): string {
    const parseRef = (ref: string) => {
      const slash = ref.indexOf("/");
      if (slash === -1) throw new Error(`invalid reference: ${ref}`);
      return { type: ref.slice(0, slash), slug: ref.slice(slash + 1) };
    };
    const a = parseRef(refA);
    const b = parseRef(refB);

    const objA = this.objects.get(this.key(a.type, a.slug));
    const objB = this.objects.get(this.key(b.type, b.slug));
    if (!objA) throw new Error(`object not found: ${refA}`);
    if (!objB) throw new Error(`object not found: ${refB}`);

    const addLink = (obj: { data: Record<string, unknown> }, ref: string) => {
      const links: string[] = Array.isArray(obj.data.links)
        ? [...obj.data.links]
        : [];
      if (!links.includes(ref)) {
        links.push(ref);
        obj.data.links = links;
      }
    };
    addLink(objA, refB);
    addLink(objB, refA);
    return `linked ${refA} <-> ${refB}`;
  }

  appendContent(type: string, slug: string, content: string): void {
    const k = this.key(type, slug);
    const obj = this.objects.get(k);
    if (!obj) {
      throw new Error(`object not found: ${k}`);
    }
    obj.content = `${obj.content.trimEnd()}\n${content}`;
    obj.data.modified = this.nowIso();
  }

  /** Test helper: clear all objects. */
  clear(): void {
    this.objects.clear();
  }

  /** Test helper: number of stored objects. */
  get size(): number {
    return this.objects.size;
  }
}
