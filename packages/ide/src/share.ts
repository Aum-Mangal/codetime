/**
 * Shareable links: the program is deflate-compressed into the URL fragment
 * (`#code=...`), so a link carries the whole program and nothing is uploaded
 * anywhere. Uses the browser's CompressionStream; no library needed.
 */
const PREFIX = '#code=';

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const blob = new Blob([bytes as BlobPart]);
  return new Uint8Array(await new Response(blob.stream().pipeThrough(stream)).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export async function encodeShareHash(source: string): Promise<string> {
  const compressed = await pipe(new TextEncoder().encode(source), new CompressionStream('deflate-raw'));
  return PREFIX + toBase64Url(compressed);
}

/** The program in a `#code=` fragment, or null when there is none or it is corrupt. */
export async function decodeShareHash(hash: string): Promise<string | null> {
  if (!hash.startsWith(PREFIX)) return null;
  try {
    const bytes = await pipe(fromBase64Url(hash.slice(PREFIX.length)), new DecompressionStream('deflate-raw'));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}
