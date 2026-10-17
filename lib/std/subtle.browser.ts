// zinc:subtle on the web target: the browser's own crypto.subtle (docs/targets/web.md). See web.browser.ts.
const g: any = globalThis;
export const subtle = g.crypto.subtle, CryptoKey = g.CryptoKey, CryptoKeyPair = undefined, FullSubtleCrypto = g.SubtleCrypto, Algorithm = undefined;
