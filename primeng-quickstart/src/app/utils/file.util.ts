/**
 * Parses a Content-Disposition header and returns the suggested filename, if present.
 * Supports RFC 5987 (filename*=UTF-8''...) and plain filename=... fallbacks.
 */
export function extractFilenameFromContentDisposition(
  contentDisposition: string | null | undefined,
): string | null {
  if (!contentDisposition) return null;

  // Try RFC 5987: filename*=UTF-8''<percent-encoded>
  const rfc5987 = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(contentDisposition);
  if (rfc5987?.[1]) {
    try {
      return decodeURIComponent(rfc5987[1]);
    } catch {
      return rfc5987[1];
    }
  }

  // Try quoted filename="..."
  const quoted = /filename\s*=\s*"([^"]+)"/i.exec(contentDisposition);
  if (quoted?.[1]) return quoted[1];

  // Try unquoted filename=...
  const unquoted = /filename\s*=\s*([^;]+)/i.exec(contentDisposition);
  if (unquoted?.[1]) return unquoted[1].trim();

  return null;
}

/**
 * Triggers a client-side download for a given Blob and filename.
 */
export function downloadBlobAsFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
