import type { IPersonaLoader } from "../ports/persona-loader.js";

/** Mock IPersonaLoader for tests — returns configurable strings. */
export class MockPersonaLoader implements IPersonaLoader {
  personaPrompt: string;
  systemContext: string;

  constructor(opts?: { personaPrompt?: string; systemContext?: string }) {
    this.personaPrompt = opts?.personaPrompt ?? "";
    this.systemContext = opts?.systemContext ?? "";
  }

  loadPersonaPrompt(_dir: string, _channel?: string): string {
    return this.personaPrompt;
  }

  loadSystemContext(_path: string): string {
    return this.systemContext;
  }
}
