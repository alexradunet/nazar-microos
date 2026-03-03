/**
 * Re-export from capability for backward compatibility.
 * New code should import from capabilities/persona.
 */
export {
  extractChannelSection,
  FsPersonaLoader,
} from "./capabilities/persona/fs-persona-loader.js";

// Re-export the free functions using a default loader instance for backward compat
import { FsPersonaLoader } from "./capabilities/persona/fs-persona-loader.js";

const _defaultLoader = new FsPersonaLoader();
export const loadPersonaPrompt =
  _defaultLoader.loadPersonaPrompt.bind(_defaultLoader);
export const loadSystemContext =
  _defaultLoader.loadSystemContext.bind(_defaultLoader);
