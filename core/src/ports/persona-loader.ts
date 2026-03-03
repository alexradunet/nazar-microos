/**
 * IPersonaLoader port — loads and composes the OpenPersona 4-layer identity model.
 *
 * The 4-layer model (SOUL → BODY → FACULTY → SKILL) defines who the agent is,
 * what it can do, and how it communicates. Each layer is a separate markdown file
 * that gets concatenated into a single system prompt string. The optional
 * `channel` parameter allows channel-specific variants (e.g. different tone for
 * WhatsApp vs. Interactive TUI).
 *
 * Handles: loading and concatenating persona layer files, loading SYSTEM.md context.
 * Does NOT handle: skill injection (that is done by the agent session capability),
 * template variable substitution, or caching of loaded prompts.
 *
 * For implementation, see capabilities/persona/persona-loader.ts.
 * Persona layer files live in nazar-core/agent/persona/ by convention.
 * SYSTEM.md lives in nazar-core/agent/context/SYSTEM.md.
 */
export interface IPersonaLoader {
  /** Load and compose OpenPersona 4-layer files into a single prompt string. */
  loadPersonaPrompt(personaDir: string, channel?: string): string;
  /** Load SYSTEM.md content for system context injection. */
  loadSystemContext(systemMdPath: string): string;
}
