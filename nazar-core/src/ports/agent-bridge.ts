import type { AgentResponse } from "../affordances.js";

/** Port for processing messages through the AI agent. */
export interface IAgentBridge {
  /** Process an incoming message and return the agent's response. */
  processMessage(text: string, from: string): Promise<AgentResponse>;
  /** Dispose of all sessions and free resources. */
  dispose(): void;
}
