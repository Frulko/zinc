// Records the vectors of tests/golden/host/discord_voice_rtp.ts with Node's crypto (OpenSSL), independently of the plugin's mbedTLS and
// Monocypher: `node plugins/discord-voice/tests/vectors.mjs`. A voice packet as discord.js builds it (packages/voice Networking.ts):
// the RTP header as additional data, the counter big-endian in the first 4 bytes of a zero nonce (12 bytes for AES-256-GCM, 24 for
// XChaCha20-Poly1305), the tag after the ciphertext, the 4 counter bytes last. XChaCha20-Poly1305 is HChaCha20 then the IETF
// ChaCha20-Poly1305 (draft-irtf-cfrg-xchacha-03 2.3); HChaCha20 is checked here against the draft's vector (2.2.1) first.
import { createCipheriv } from 'node:crypto';

const hex = (b) => Buffer.from(b).toString('hex');
const rotl = (v, n) => ((v << n) | (v >>> (32 - n))) >>> 0;
function hchacha20(key, nonce16) {
  const s = new Uint32Array(16);
  s[0] = 0x61707865; s[1] = 0x3320646e; s[2] = 0x79622d32; s[3] = 0x6b206574;
  for (let i = 0; i < 8; i++) s[4 + i] = key.readUInt32LE(i * 4);
  for (let i = 0; i < 4; i++) s[12 + i] = nonce16.readUInt32LE(i * 4);
  const qr = (a, b, c, d) => {
    s[a] += s[b]; s[d] = rotl(s[d] ^ s[a], 16); s[c] += s[d]; s[b] = rotl(s[b] ^ s[c], 12);
    s[a] += s[b]; s[d] = rotl(s[d] ^ s[a], 8); s[c] += s[d]; s[b] = rotl(s[b] ^ s[c], 7);
  };
  for (let i = 0; i < 10; i++) { qr(0, 4, 8, 12); qr(1, 5, 9, 13); qr(2, 6, 10, 14); qr(3, 7, 11, 15); qr(0, 5, 10, 15); qr(1, 6, 11, 12); qr(2, 7, 8, 13); qr(3, 4, 9, 14); }
  const out = Buffer.alloc(32);
  [0, 1, 2, 3, 12, 13, 14, 15].forEach((w, i) => out.writeUInt32LE(s[w], i * 4));
  return out;
}
const draftKey = Buffer.from('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f', 'hex');
const draftSub = hex(hchacha20(draftKey, Buffer.from('000000090000004a0000000031415927', 'hex')));
if (draftSub !== '82413b4227b27bfed30e42508a877d73a0f9e4d58a74a853c12ec41326d3ecdc') throw new Error(`HChaCha20 ${draftSub}`);

function seal(mode, key, header, counter, payload) {
  const nonce = Buffer.alloc(mode === 'gcm' ? 12 : 24);
  nonce.writeUInt32BE(counter, 0);
  const c = mode === 'gcm'
    ? createCipheriv('aes-256-gcm', key, nonce)
    : createCipheriv('chacha20-poly1305', hchacha20(key, nonce.subarray(0, 16)), Buffer.concat([Buffer.alloc(4), nonce.subarray(16)]), { authTagLength: 16 });
  c.setAAD(header, { plaintextLength: payload.length });
  const ct = Buffer.concat([c.update(payload), c.final()]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(counter, 0);
  return Buffer.concat([header, ct, c.getAuthTag(), tail]);
}

const key = Buffer.from(Array.from({ length: 32 }, (_, i) => (i * 7 + 3) & 255));
const header = Buffer.from('80781234010203' + '04deadbeef', 'hex');
const opus = Buffer.from('fc ff fe 48 65 6c 6c 6f 2c 20 76 6f 69 63 65'.replace(/ /g, ''), 'hex');
// a received packet with a one-byte header extension (0xBEDE, one 32-bit word): its profile and length are additional data, its body is
// encrypted with the Opus frame (and skipped after decryption)
const extHeader = Buffer.from('907800070000c350000004d2bede0001', 'hex');
const extBody = Buffer.from('10ff0000', 'hex');
console.log(`key ${hex(key)}`);
console.log(`header ${hex(header)}`);
console.log(`opus ${hex(opus)}`);
console.log(`gcm ${hex(seal('gcm', key, header, 7, opus))}`);
console.log(`xchacha ${hex(seal('xchacha', key, header, 0xfffffffe, opus))}`);
console.log(`gcm-ext ${hex(seal('gcm', key, extHeader, 1, Buffer.concat([extBody, opus])))}`);
console.log(`xchacha-ext ${hex(seal('xchacha', key, extHeader, 2, Buffer.concat([extBody, opus])))}`);
