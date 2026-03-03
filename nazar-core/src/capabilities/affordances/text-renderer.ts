import type { IAffordanceRenderer } from "../../ports/affordance-renderer.js";
import type { Affordance } from "./parser.js";

/** Render affordances as a numbered text list for text-only channels. */
export class TextAffordanceRenderer implements IAffordanceRenderer {
  render(affordances: Affordance[]): string {
    if (affordances.length === 0) return "";
    return affordances.map((aff, i) => `${i + 1}. ${aff.label}`).join("\n");
  }
}
