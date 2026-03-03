import type { ParsedAgentOutput } from "../capabilities/affordances/parser.js";
import type { IAgentBridge } from "../ports/agent-bridge.js";

export interface MockCall {
  text: string;
  from: string;
}

/** Mock IAgentBridge for tests — records calls, returns canned responses. */
export class MockAgentBridge implements IAgentBridge {
  calls: MockCall[] = [];
  private response: ParsedAgentOutput;

  constructor(response?: ParsedAgentOutput) {
    this.response = response ?? { text: "mock response", links: [] };
  }

  async processMessage(text: string, from: string): Promise<ParsedAgentOutput> {
    this.calls.push({ text, from });
    return this.response;
  }

  dispose(): void {
    // no-op
  }

  /** Set the response returned by processMessage. */
  setResponse(response: ParsedAgentOutput): void {
    this.response = response;
  }

  /** Test helper: reset recorded calls. */
  reset(): void {
    this.calls = [];
  }
}
