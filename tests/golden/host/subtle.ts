import { subtle, CryptoKey } from 'zinc:subtle';
import { toHex } from 'zinc:web';
// crypto.subtle known answers (ZN-089): FIPS 180 digests, RFC 4231 HMAC, NIST SP 800-38A AES-CBC/CTR, the GCM spec test case 4, RFC 7914 PBKDF2, RFC 5869 HKDF,
// RFC 5903 ECDH on P-256, and ECDSA signing round trips.
function hex(s: string): u8[] { const r: u8[] = []; for (let i = 0; i < s.length; i += 2) r.push(parseInt(s.slice(i, i + 2), 16)); return r; }
function text(s: string): u8[] { const r: u8[] = []; for (let i = 0; i < s.length; i++) r.push(s.charCodeAt(i)); return r; }
function check(name: string, got: u8[], want: string): void { console.log(toHex(got) === want ? 'ok  ' : 'FAIL', name, toHex(got) === want ? '' : toHex(got)); }
async function main(): Promise<void> {
  check('sha-1', await subtle.digest('SHA-1', text('abc')), 'a9993e364706816aba3e25717850c26c9cd0d89d');
  check('sha-256', await subtle.digest('SHA-256', text('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  check('sha-384', await subtle.digest('SHA-384', text('abc')), 'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7');
  check('sha-512', await subtle.digest('SHA-512', text('abc')), 'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f');

  const hk = await subtle.importKey('raw', hex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  const mac = await subtle.sign({ name: 'HMAC' }, hk, text('Hi There'));
  check('hmac-sha256 rfc4231-1', mac, 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
  console.log('hmac verify', await subtle.verify({ name: 'HMAC' }, hk, mac, text('Hi There')), await subtle.verify({ name: 'HMAC' }, hk, mac, text('Hi there')));

  const k128 = hex('2b7e151628aed2a6abf7158809cf4f3c');
  const cbc = await subtle.importKey('raw', k128, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']);
  const cbcOut = await subtle.encrypt({ name: 'AES-CBC', iv: hex('000102030405060708090a0b0c0d0e0f') }, cbc, hex('6bc1bee22e409f96e93d7e117393172a'));
  check('aes-128-cbc sp800-38a F.2.1', cbcOut.slice(0, 16), '7649abac8119b246cee98e9b12e9197d');
  check('aes-128-cbc decrypt', await subtle.decrypt({ name: 'AES-CBC', iv: hex('000102030405060708090a0b0c0d0e0f') }, cbc, cbcOut), '6bc1bee22e409f96e93d7e117393172a');
  const ctr = await subtle.importKey('raw', k128, { name: 'AES-CTR' }, false, ['encrypt']);
  check('aes-128-ctr sp800-38a F.5.1', await subtle.encrypt({ name: 'AES-CTR', counter: hex('f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff'), length: 64 }, ctr, hex('6bc1bee22e409f96e93d7e117393172a')), '874d6191b620e3261bef6864990db6ce');

  const gcm = await subtle.importKey('raw', hex('feffe9928665731c6d6a8f9467308308'), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  const gp = hex('d9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b39');
  const galg = { name: 'AES-GCM', iv: hex('cafebabefacedbaddecaf888'), additionalData: hex('feedfacedeadbeeffeedfacedeadbeefabaddad2'), tagLength: 128 };
  const gc = await subtle.encrypt(galg, gcm, gp);
  check('aes-128-gcm test case 4', gc, '42831ec2217774244b7221b784d0d49ce3aa212f2c02a4e035c17e2329aca12e21d514b25466931c7d8f6a5aac84aa051ba30b396a0aac973d58e0915bc94fbc3221a5db94fae95ae7121a47');
  check('aes-128-gcm decrypt', await subtle.decrypt(galg, gcm, gc), toHex(gp));
  gc[3] ^= 1;
  try { await subtle.decrypt(galg, gcm, gc); console.log('FAIL tampered gcm accepted'); } catch (e) { console.log('ok   gcm tamper rejected', (e as Error).name); }

  const pb = await subtle.importKey('raw', text('passwd'), { name: 'PBKDF2' }, false, ['deriveBits']);
  check('pbkdf2-sha256 rfc7914', await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: text('salt'), iterations: 1 }, pb, 512),
    '55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783');
  const hd = await subtle.importKey('raw', hex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b'), { name: 'HKDF' }, false, ['deriveBits']);
  check('hkdf-sha256 rfc5869-1', await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: hex('000102030405060708090a0b0c'), info: hex('f0f1f2f3f4f5f6f7f8f9') }, hd, 336),
    '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865');

  const ecdh = { name: 'ECDH', namedCurve: 'P-256' };
  const mine = await subtle.importKey('raw-private', hex('c88f01f510d9ac3f70a292daa2316de544e9aab8afe84049c62a9c57862d1433'), ecdh, false, ['deriveBits']);
  const theirs = await subtle.importKey('raw', hex('04d12dfb5289c8d4f81208b70270398c342296970a0bccb74c736fc7554494bf6356fbf3ca366cc23e8157854c13c58d6aac23f046ada30f8353e74f33039872ab'), ecdh, true, []);
  check('ecdh p-256 rfc5903', await subtle.deriveBits({ name: 'ECDH', namedCurve: 'P-256', public: theirs }, mine, 256), 'd6840f6b42f6edafd13116e0e12565202fef8e9ece7dce03812464d04b9442de');

  const pair = await subtle.generateKeyPair({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, text('message'));
  console.log('ecdsa', sig.length, await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, sig, text('message')), await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, sig, text('massage')));
  const a = await subtle.generateKeyPair(ecdh, true, ['deriveBits']);
  const b = await subtle.generateKeyPair(ecdh, true, ['deriveBits']);
  const s1 = await subtle.deriveBits({ name: 'ECDH', namedCurve: 'P-256', public: b.publicKey }, a.privateKey, 256);
  const s2 = await subtle.deriveBits({ name: 'ECDH', namedCurve: 'P-256', public: a.publicKey }, b.privateKey, 256);
  console.log('ecdh agree', toHex(s1) === toHex(s2), s1.length);
  const aes = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  console.log('aes key', (await subtle.exportKey('raw', aes)).length);
}
main();
