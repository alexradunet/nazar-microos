/**
 * Persona loader — reads OpenPersona 4-layer files and composes them
 * into a single system prompt string for Pi AgentSession.
 */

import fs from "node:fs";
import path from "node:path";

/** Section labels for the composed persona prompt. */
const SECTION_LABELS: Record<string, string> = {
  "SOUL.md": "Identity & Values",
  "BODY.md": "Channel Behavior",
  "FACULTY.md": "Cognitive Patterns",
  "SKILL.md": "Capabilities",
};

const LAYER_FILES = ["SOUL.md", "BODY.md", "FACULTY.md", "SKILL.md"] as const;

/**
 * Extract a channel-specific section from BODY.md content.
 * Looks for a ### heading matching the channel name and returns
 * everything up to the next ### or ## heading.
 */
export function extractChannelSection(
  bodyContent: string,
  channel: string,
): string {
  const heading = `### ${channel}`;
  const idx = bodyContent.indexOf(heading);
  if (idx === -1) return bodyContent;

  const afterHeading = idx + heading.length;
  // Find the next heading at ### or ## level
  const nextHeading = bodyContent.substring(afterHeading).search(/^##[# ]/m);
  const section =
    nextHeading === -1
      ? bodyContent.substring(afterHeading)
      : bodyContent.substring(afterHeading, afterHeading + nextHeading);

  return `${heading}\n${section.trim()}`;
}

/**
 * Load and compose OpenPersona 4-layer files into a single prompt string.
 *
 * @param personaDir - Directory containing SOUL.md, BODY.md, FACULTY.md, SKILL.md
 * @param channel - Optional channel name (e.g. "Signal") to extract from BODY.md
 * @returns Composed markdown string, or empty string if persona dir doesn't exist
 */
export function loadPersonaPrompt(
  personaDir: string,
  channel?: string,
): string {
  if (!fs.existsSync(personaDir)) {
    return "";
  }

  const sections: string[] = [];

  for (const file of LAYER_FILES) {
    const filePath = path.join(personaDir, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`Persona file not found, skipping: ${filePath}`);
      continue;
    }

    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8").trim();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Failed to read persona file ${filePath}: ${msg}`);
      continue;
    }

    // For BODY.md, extract only the channel-specific section if specified
    if (file === "BODY.md" && channel) {
      content = extractChannelSection(content, channel);
    }

    const label = SECTION_LABELS[file];
    if (file === "BODY.md" && channel) {
      sections.push(`## Channel Behavior — ${channel}\n\n${content}`);
    } else {
      sections.push(`## ${label}\n\n${content}`);
    }
  }

  if (sections.length === 0) return "";

  return `# Nazar — Personal AI Companion\n\n${sections.join("\n\n")}`;
}

/**
 * Load SYSTEM.md content for system context injection.
 *
 * @param systemMdPath - Path to SYSTEM.md file
 * @returns File content, or empty string if not found
 */
export function loadSystemContext(systemMdPath: string): string {
  if (!systemMdPath || !fs.existsSync(systemMdPath)) {
    return "";
  }
  try {
    return fs.readFileSync(systemMdPath, "utf-8").trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`Failed to read system context ${systemMdPath}: ${msg}`);
    return "";
  }
}
