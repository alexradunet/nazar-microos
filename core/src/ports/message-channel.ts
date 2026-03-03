/**
 * MessageChannel port — bidirectional message transport for a single channel.
 *
 * Defines the contract for connecting to a messaging service, receiving
 * incoming messages, and sending replies. It does NOT handle agent routing,
 * session management, affordance rendering, or contact allow-listing —
 * those concerns belong to the AgentBridge layer above this port.
 *
 * For implementations:
 *   Signal  — bridges/signal/src/index.ts (SignalBotChannel)
 *   WhatsApp — bridges/whatsapp/src/index.ts
 *   Web      — bridges/web/src/index.ts
 *
 * @example
 * ```ts
 * channel.onMessage(async (msg) => {
 *   // return value is sent back as a reply
 *   return `Echo: ${msg.text}`;
 * });
 * await channel.connect();
 * ```
 */

/** Incoming message from any channel. */
export interface IncomingMessage {
  from: string;
  text: string;
  timestamp: number;
  channel: string;
}

/** Port interface for message channels (Signal, WhatsApp, Web, etc.). */
export interface MessageChannel {
  readonly name: string;
  /**
   * Register the handler that processes every incoming message.
   * The handler's return value is sent back to the sender.
   * Reason: one handler per channel keeps routing deterministic and avoids
   * fan-out to multiple consumers with differing reply semantics.
   */
  onMessage(handler: (msg: IncomingMessage) => Promise<string>): void;
  sendMessage(to: string, text: string): Promise<void>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}
