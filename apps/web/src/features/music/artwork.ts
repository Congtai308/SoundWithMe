const YOUTUBE_THUMBNAIL = /^(https:\/\/i\.ytimg\.com\/vi\/[\w-]{11}\/)(?:default|mqdefault|hqdefault|sddefault|maxresdefault)\.jpg$/;

/**
 * The artwork URL at the size it's shown. YouTube serves each thumbnail in
 * several sizes, and the catalog stores the 480×360 one (~25 KB): a 48 px
 * row or a heavily blurred backdrop needs the 120×90 one (~4 KB), a card
 * the 320×180 one. `cssPx` is the larger side as displayed; hi-dpi screens
 * get twice that. Other hosts' URLs come back unchanged.
 */
export function artworkAt(url: string, cssPx: number): string;
export function artworkAt(url: string | null, cssPx: number): string | null;
export function artworkAt(url: string | null, cssPx: number): string | null {
  const match = url ? YOUTUBE_THUMBNAIL.exec(url) : null;
  if (!match) return url;
  const needed = cssPx * 2;
  const variant = needed <= 120 ? "default" : needed <= 320 ? "mqdefault" : "hqdefault";
  return `${match[1]}${variant}.jpg`;
}

/** Blurred backdrops show no detail: the smallest thumbnail is plenty. */
export function backdropArtwork(url: string | null): string | null {
  return artworkAt(url, 1);
}
