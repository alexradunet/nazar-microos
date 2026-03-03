/**
 * IAgentBridge port — routes a message through the AI agent and returns a response.
 *
 * One bridge instance manages per-contact Pi agent sessions. It handles
 * session lifetime (create on first message, reuse on subsequent ones) and
 * returns structured responses that include both text and affordances.
 *
 * Does NOT handle: message transport, contact allow-listing, or affordance
 * rendering. Those are the responsibility of the calling bridge service
 * and the IAffordanceRenderer port.
 *
 * For implementation, see capabilities/agent-session/pi-agent-bridge.ts.
 * For the session SDK, see @mariozechner/pi-coding-agent (node_modules).
 */
import type { AgentResponse } from "../capabilities/affordances/parser.js";

/** Port for processing messages through the AI agent. */
export interface IAgentBridge {
  /** Process an incoming message and return the agent's response. */
  processMessage(text: string, from: string): Promise<AgentResponse>;
  /** Dispose of all sessions and free resources. */
  dispose(): void;
}
