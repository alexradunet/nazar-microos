/**
 * Re-export from capability for backward compatibility.
 * New code should import from capabilities/object-store.
 */

// Export as ObjectStore for backward compat (bridges + CLI use this name)
export { MarkdownFileStore as ObjectStore } from "./capabilities/object-store/markdown-file-store.js";
