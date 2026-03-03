/** Port for loading OpenPersona 4-layer files and system context. */
export interface IPersonaLoader {
  /** Load and compose OpenPersona 4-layer files into a single prompt string. */
  loadPersonaPrompt(personaDir: string, channel?: string): string;
  /** Load SYSTEM.md content for system context injection. */
  loadSystemContext(systemMdPath: string): string;
}
