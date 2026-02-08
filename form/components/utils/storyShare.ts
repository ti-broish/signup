/**
 * Story sharing utilities.
 * Uses Web Share API Level 2 (with files) when available,
 * falls back so the caller can show a preview + manual download.
 */

export type ShareResult = { method: 'webshare' | 'fallback' };

export async function shareStory(imageBlob: Blob): Promise<ShareResult> {
  const file = new File([imageBlob], 'tibroish-story.png', { type: 'image/png' });

  // Try Web Share API Level 2 on any platform that supports it
  if (navigator.share && navigator.canShare) {
    const shareData: ShareData = { files: [file] };
    try {
      if (navigator.canShare(shareData)) {
        await navigator.share(shareData);
        return { method: 'webshare' };
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        // User cancelled - not an error
        return { method: 'webshare' };
      }
      // NotAllowedError often means iframe permissions issue - fall through
    }
  }

  // Don't auto-download. Let the caller show a preview instead.
  return { method: 'fallback' };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
