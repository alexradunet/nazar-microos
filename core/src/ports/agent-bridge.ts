/**
 * IAgentBridge port — routes a message through the AI agent and returns a response.
 *
 * One bridge instance manages per-contact Pi agent sessions. It handles
 * session lifetime (create on first message, reuse on subsequent ones) and
 * returns parsed output containing text and HATEOAS links.
 *
 * Does NOT handle: message transport, contact allow-listing, or response
 * rendering. Those are the responsibility of the calling bridge service
 * and the ResponseRenderer.
 *
 * For implementation, see capabilities/agent-session/pi-agent-bridge.ts.
 * For the session SDK, see @mariozechner/pi-coding-agent (node_modules).
 */
import type { ParsedAgentOutput } from "../capabilities/affordances/parser.js";
import type { MediaAttachment } from "./message-channel.js";

/** Port for processing messages through the AI agent. */
export interface IAgentBridge {
  /** Process an incoming message and return the agent's parsed output. */
  processMessage(
    text: string,
    from: string,
    attachments?: MediaAttachment[],
  ): Promise<ParsedAgentOutput>;
  /** Dispose of all sessions and free resources. */
  dispose(): void;
}
