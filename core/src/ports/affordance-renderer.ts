/**
 * IAffordanceRenderer port — converts agent affordances to a channel-appropriate string.
 *
 * Affordances are structured action suggestions returned by the Pi agent
 * (e.g. "open URL", "confirm action"). Different channels render them
 * differently: Signal and WhatsApp use plain-text bullet lists, while the
 * Web bridge can use HTML buttons or links.
 *
 * Handles: rendering a list of affordances as a string for one specific channel.
 * Does NOT handle: parsing affordances from agent output (that is the Pi SDK's
 * responsibility) or sending the rendered string (that is the MessageChannel's
 * responsibility).
 *
 * For the affordance type definition, see ../affordances.ts.
 * Channel-specific renderer implementations live inside each bridge service.
 */
import type { Affordance } from "../affordances.js";

/** Port for rendering affordances into a channel-appropriate format. */
export interface IAffordanceRenderer {
  /** Render affordances as a string for the target channel. */
  render(affordances: Affordance[]): string;
}
