import type {
  Capability,
  CapabilityConfig,
  CapabilityRegistration,
} from "../../capability.js";
import { MarkdownFileStore } from "./markdown-file-store.js";

export { MarkdownFileStore } from "./markdown-file-store.js";

export class ObjectStoreCapability implements Capability {
  readonly name = "object-store";
  readonly description =
    "Flat-file markdown object store with CRUD, search, and linking";

  private store?: MarkdownFileStore;

  init(config: CapabilityConfig): CapabilityRegistration {
    const objectsDir =
      process.env.NAZAR_OBJECTS_DIR ?? "/var/lib/nazar/objects";
    this.store = new MarkdownFileStore(
      objectsDir,
      config.services.frontmatterParser,
    );
    return {};
  }

  getStore(): MarkdownFileStore {
    if (!this.store) {
      throw new Error("ObjectStoreCapability not initialized");
    }
    return this.store;
  }
}
