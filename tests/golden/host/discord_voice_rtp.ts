// zinc:discord-voice's RTP framing and transport encryption against vectors recorded with Node's crypto (OpenSSL), not with the plugin's
// libraries (plugins/discord-voice/tests/vectors.mjs, which also checks its HChaCha20 against draft-irtf-cfrg-xchacha): a voice packet in
// aead_aes256_gcm_rtpsize and aead_xchacha20_poly1305_rtpsize as the client sends it, the same opened, a received packet with a header
// extension (authenticated header, encrypted body skipped), and a packet with one flipped bit or the wrong key refused; then the audio devices
// a call can choose (the fake ones: ZINC_FAKE_MICROPHONE=1). tests/t1/discord_voice.sh, on the three engines.
import { rtpHeader, seal, unseal, modes, inputDevices, outputDevices, AudioDevice } from 'zinc:discord-voice';

const GCM = 'aead_aes256_gcm_rtpsize', XCHACHA = 'aead_xchacha20_poly1305_rtpsize';
const bytes = (h: string): u8[] => { const out: u8[] = []; for (let i = 0; i < h.length; i += 2) out.push(parseInt(h.substring(i, i + 2), 16)); return out; };
const hex = (b: u8[]): string => b.map((x: u8) => (x < 16 ? '0' : '') + x.toString(16)).join('');
const check = (what: string, got: string, want: string): void => { console.log(`${what} ${got === want ? 'ok' : `FAIL ${got} != ${want}`}`); };

const key = bytes('030a11181f262d343b424950575e656c737a81888f969da4abb2b9c0c7ced5dc');
const opus = 'fcfffe48656c6c6f2c20766f696365';
const header = rtpHeader(0x1234, 0x01020304, 0xdeadbeef);
const gcm = '8078123401020304deadbeef84303c786b0c0f71b172269c95c5caa70be42578e15e49ec8335ff686bcf2700000007';
const xchacha = '8078123401020304deadbeeffea7366c7a580be8e7f53a8548aea5701f08c956c5bdece186048b9eb0597efffffffe';
const gcmExt = '907800070000c350000004d2bede00010563a8df4c33ba5643bea2d22d513b753b8b55122c67837403eeff1118fb92def34ee600000001';
const xchachaExt = '907800070000c350000004d2bede0001cbe3d18be2762d93ea25b060dba868d65379eaedf1bbeb47080a0a88d4a9b0fb7285f200000002';

console.log(`modes ${modes().join(' ')}`);
check('rtp header', hex(header), '8078123401020304deadbeef');
check('aes-gcm seal', hex(seal(GCM, key, header, 7, bytes(opus))), gcm);
check('xchacha seal', hex(seal(XCHACHA, key, header, 0xfffffffe, bytes(opus))), xchacha);
check('aes-gcm open', hex(unseal(GCM, key, bytes(gcm))), opus);
check('xchacha open', hex(unseal(XCHACHA, key, bytes(xchacha))), opus);
check('aes-gcm open, extension', hex(unseal(GCM, key, bytes(gcmExt))), opus);
check('xchacha open, extension', hex(unseal(XCHACHA, key, bytes(xchachaExt))), opus);
const flipped = bytes(gcm);
flipped[3] = flipped[3] ^ 1;   // the sequence number: authenticated, not encrypted
check('aes-gcm header changed', hex(unseal(GCM, key, flipped)), '');
const body = bytes(xchacha);
body[14] = body[14] ^ 0x80;
check('xchacha payload changed', hex(unseal(XCHACHA, key, body)), '');
const other = bytes('030a11181f262d343b424950575e656c737a81888f969da4abb2b9c0c7ced5dd');
check('aes-gcm wrong key', hex(unseal(GCM, other, bytes(gcm))), '');
check('unknown mode', hex(seal('xsalsa20_poly1305', key, header, 1, bytes(opus))), '');
const names = (l: AudioDevice[]): string => l.map((d: AudioDevice) => `${d.name} (${d.id})`).join(', ');
console.log(`inputs ${names(inputDevices())}`);
console.log(`outputs ${names(outputDevices())}`);
