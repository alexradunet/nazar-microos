/**
 * Re-export from capability for backward compatibility.
 * New code should import from capabilities/affordances.
 */
export type {
  Affordance,
  AgentResponse,
} from "./capabilities/affordances/parser.js";
export {
  isAffordance,
  parseAgentResponse,
  validateAffordance,
} from "./capabilities/affordances/parser.js";

import type { Affordance } from "./capabilities/affordances/parser.js";
import { TextAffordanceRenderer } from "./capabilities/affordances/text-renderer.js";

const _renderer = new TextAffordanceRenderer();

/** Render affordances as a numbered text list for text-only channels. */
export function formatAffordancesAsText(affordances: Affordance[]): string {
  return _renderer.render(affordances);
}
