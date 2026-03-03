/** Incoming message from any channel. */
export interface IncomingMessage {
  from: string;
  text: string;
  timestamp: number;
  channel: string;
}

/** Port interface for message channels (Signal, Telegram, etc.). */
export interface MessageChannel {
  readonly name: string;
  onMessage(handler: (msg: IncomingMessage) => Promise<string>): void;
  sendMessage(to: string, text: string): Promise<void>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}
