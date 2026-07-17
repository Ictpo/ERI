/**
 * Decodes Erine's painting from the obfuscated /eri-art.bin at runtime.
 *
 * Obfuscation, not encryption (the key is right here — it has to be, the app
 * must display the image). Its only job: keep the raw artwork from sitting in
 * the repo as a one-click-downloadable file. See packaging/encode_art.py.
 */

// Keep in sync with packaging/encode_art.py
const KEY = new TextEncoder().encode("eri-fox-erine-chen-bi-ting-2026-mousing");

let cached: string | null = null;

/** Returns an object URL for the fox painting (cached for the session). */
export async function loadFoxArt(): Promise<string> {
  if (cached) return cached;
  const res = await fetch("/eri-art.bin");
  const buf = new Uint8Array(await res.arrayBuffer());
  for (let i = 0; i < buf.length; i++) buf[i] ^= KEY[i % KEY.length];
  cached = URL.createObjectURL(new Blob([buf], { type: "image/jpeg" }));
  return cached;
}
