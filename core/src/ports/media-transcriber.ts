/**
 * IMediaTranscriber port — transcribes audio/video to text.
 *
 * Implementations may use local Whisper, a cloud API, or any other
 * speech-to-text engine. The port abstracts the underlying engine so
 * the AgentBridge can check availability and degrade gracefully.
 */

/** Result of transcribing an audio/video file. */
export interface TranscriptionResult {
  text: string;
  language?: string;
  durationMs?: number;
}

/** Port for audio/video transcription. */
export interface IMediaTranscriber {
  /** Transcribe base64-encoded audio/video data. */
  transcribe(data: string, mimeType: string): Promise<TranscriptionResult>;
  /** Check whether the transcription backend is available. */
  isAvailable(): Promise<boolean>;
}
