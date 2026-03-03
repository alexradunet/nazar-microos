/**
 * Re-export from capability for backward compatibility.
 * New code should import from capabilities/agent-session.
 */
export type { ExtensionFactory } from "./capabilities/agent-session/extension.js";
export { createNazarExtension } from "./capabilities/agent-session/extension.js";
