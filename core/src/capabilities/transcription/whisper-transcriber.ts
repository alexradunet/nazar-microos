/**
 * WhisperTranscriber — local speech-to-text via the `whisper` CLI.
 *
 * Writes base64 audio to a temp file, converts to WAV via ffmpeg if needed
 * (voice notes are typically ogg/opus), runs whisper, reads the transcript.
 *
 * Falls back gracefully: if whisper or ffmpeg are not installed, isAvailable()
 * returns false and the AgentBridge skips transcription.
 */

import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type {
  IMediaTranscriber,
  TranscriptionResult,
} from "../../ports/media-transcriber.js";

const execFileAsync = promisify(execFile);

const WHISPER_MODEL = process.env.PIBLOOM_WHISPER_MODEL || "small";

/** MIME types that need conversion to WAV before whisper can process them. */
const NEEDS_CONVERSION = new Set([
  "audio/ogg",
  "audio/opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
  "audio/amr",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
]);

/** Map MIME type to a reasonable temp file extension. */
function extForMime(mimeType: string): string {
  const map: Record<string, string> = {
    "audio/ogg": ".ogg",
    "audio/opus": ".opus",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/webm": ".webm",
    "audio/mp4": ".m4a",
    "audio/flac": ".flac",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "video/x-matroska": ".mkv",
  };
  return map[mimeType] ?? ".bin";
}

export class WhisperTranscriber implements IMediaTranscriber {
  private available: boolean | undefined;

  async isAvailable(): Promise<boolean> {
    if (this.available !== undefined) return this.available;
    try {
      await execFileAsync("whisper", ["--help"], { timeout: 5000 });
      this.available = true;
    } catch {
      this.available = false;
    }
    return this.available;
  }

  async transcribe(
    data: string,
    mimeType: string,
  ): Promise<TranscriptionResult> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pibloom-whisper-"));
    try {
      // Write base64 data to temp file
      const inputExt = extForMime(mimeType);
      const inputPath = path.join(tmpDir, `input${inputExt}`);
      fs.writeFileSync(inputPath, Buffer.from(data, "base64"));

      // Convert to WAV if needed
      let wavPath = inputPath;
      if (NEEDS_CONVERSION.has(mimeType)) {
        wavPath = path.join(tmpDir, "input.wav");
        await execFileAsync(
          "ffmpeg",
          ["-i", inputPath, "-ar", "16000", "-ac", "1", "-y", wavPath],
          { timeout: 30_000 },
        );
      }

      // Run whisper
      await execFileAsync(
        "whisper",
        [
          wavPath,
          "--model",
          WHISPER_MODEL,
          "--output_format",
          "txt",
          "--output_dir",
          tmpDir,
        ],
        { timeout: 120_000 },
      );

      // Whisper writes <basename>.txt next to or in output_dir
      const baseName = path.basename(wavPath, path.extname(wavPath));
      const txtPath = path.join(tmpDir, `${baseName}.txt`);
      const text = fs.existsSync(txtPath)
        ? fs.readFileSync(txtPath, "utf-8").trim()
        : "";

      return { text };
    } finally {
      // Clean up temp files
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}
