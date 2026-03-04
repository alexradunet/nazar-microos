/**
 * Minimal MIME-type lookup from file extension.
 *
 * Covers common media types exchanged via messaging channels.
 * Falls back to application/octet-stream for unknown extensions.
 */

const EXT_TO_MIME: Record<string, string> = {
  // Images
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  // Audio
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".opus": "audio/opus",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  // Video
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  // Documents
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".json": "application/json",
  ".csv": "text/csv",
};

/** Resolve a MIME type from a file path's extension. */
export function mimeFromPath(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  if (dot === -1) return "application/octet-stream";
  const ext = filePath.slice(dot).toLowerCase();
  return EXT_TO_MIME[ext] ?? "application/octet-stream";
}
