// zinc:hash on the web target (docs/targets/web.md): the page has no host crypto, so the digest is web.browser.ts's SHA-256 in JavaScript, and a
// file is the page's own (an asset, a file the app wrote), read whole. The `zinc export --target web` build selects this file instead of hash.ts.
import { sha256 as digest, toHex as hex } from 'zinc:web';
import { readBytes } from 'zinc:fs';

export function sha256(data: number[] | Uint8Array): number[] { return digest(data); }
export function sha256File(path: string): number[] { return digest(readBytes(path)); }
export function toHex(bytes: number[] | Uint8Array): string { return hex(bytes); }
