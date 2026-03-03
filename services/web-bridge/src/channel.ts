import type { IncomingMessage, MessageChannel } from "@nazar/core";

/**
 * WebChannel — HTTP request/response message channel.
 *
 * Unlike Signal (persistent TCP), Web is request/response.
 * Each POST to /chat creates a message, calls the handler, returns HTML.
 */
export class WebChannel implements MessageChannel {
  readonly name = "web";
  private messageHandler?: (msg: IncomingMessage) => Promise<string>;

  onMessage(handler: (msg: IncomingMessage) => Promise<string>): void {
    this.messageHandler = handler;
  }

  async handleRequest(text: string, from: string): Promise<string> {
    if (!this.messageHandler) {
      throw new Error("onMessage must be called before handleRequest()");
    }
    const msg: IncomingMessage = {
      from,
      text,
      timestamp: Date.now(),
      channel: "web",
    };
    return this.messageHandler(msg);
  }

  async sendMessage(_to: string, _text: string): Promise<void> {
    // Web channel sends responses inline via HTTP, not out-of-band
  }

  async connect(): Promise<void> {
    // No persistent connection needed for HTTP
  }

  async disconnect(): Promise<void> {
    // No persistent connection to close
  }
}
