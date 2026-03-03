import type { Affordance } from "../affordances.js";

/** Port for rendering affordances into a channel-appropriate format. */
export interface IAffordanceRenderer {
  /** Render affordances as a string for the target channel. */
  render(affordances: Affordance[]): string;
}
