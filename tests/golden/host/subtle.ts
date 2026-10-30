import { subtle, CryptoKey } from 'zinc:subtle';
import { toHex } from 'zinc:web';
// crypto.subtle known answers (ZN-089): FIPS 180 digests, RFC 4231 HMAC, NIST SP 800-38A AES-CBC/CTR, the GCM spec test case 4, RFC 7914 PBKDF2, RFC 5869 HKDF,
// RFC 5903 ECDH on P-256, ECDSA signing round trips, and RSA-OAEP-SHA256 against OpenSSL.
function hex(s: string): u8[] { const r: u8[] = []; for (let i = 0; i < s.length; i += 2) r.push(parseInt(s.slice(i, i + 2), 16)); return r; }
function text(s: string): u8[] { const r: u8[] = []; for (let i = 0; i < s.length; i++) r.push(s.charCodeAt(i)); return r; }
function check(name: string, got: u8[], want: string): void { console.log(toHex(got) === want ? 'ok  ' : 'FAIL', name, toHex(got) === want ? '' : toHex(got)); }
async function main(): Promise<void> {
  check('md5', await subtle.digest('MD5', text('abc')), '900150983cd24fb0d6963f7d28e17f72');   // RFC 1321
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

  const ed = { name: 'Ed25519' };
  const edk = await subtle.importKey('raw-private', hex('4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb'), ed, false, ['sign']);
  const edp = await subtle.importKey('raw', hex('3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c'), ed, true, ['verify']);
  check('ed25519 rfc8032-2 public', edk.data, '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c');
  const eds = await subtle.sign(ed, edk, hex('72'));
  check('ed25519 rfc8032-2 sign', eds, '92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00');
  console.log('ed25519 verify', await subtle.verify(ed, edp, eds, hex('72')), await subtle.verify(ed, edp, eds, hex('73')));
  const edpair = await subtle.generateKeyPair(ed, true, ['sign']);
  console.log('ed25519 pair', await subtle.verify(ed, edpair.publicKey, await subtle.sign(ed, edpair.privateKey, text('message')), text('message')));

  // RSA-OAEP with SHA-256: a 1024-bit key and a ciphertext made by OpenSSL (pkeyutl, oaep, sha256 and mgf1 sha256)
  const rsa = { name: 'RSA-OAEP', hash: 'SHA-256' };
  const rk = await subtle.importKey('raw-private', hex('3082025c02010002818100b4093d568fe7a7eacb7504992ce35d2faca2252293935fb7022c2111166eb422995d58e552b2155b66679a75b7cc1fc00bb28916442ed5453993e630348642f89d13ab8592088e5b8e26ee0b71f5eedff883c6d7b47da275fce42eea98fefded28c787cc93207ec7baf0d5d6b10b3f69d8c7b5730388b19c2def5c6049e30711020301000102818100a14d09ecad3fd31d352e61714f5b61991e25a3f9c798a98fd0dd72bed98753d30fef277f46c9110373cb6d02fd2a6063f2d701a5b66ef35b734bc457fa27348603845bf4f38c26e37571da28837d96c84fd136e98a6fa7d7e516cfcbb25f1719fa1794461b9f1b097612e75539df7df5ffa34f1871312b522673569477aee541024100db7a36a416835f99e35fb6720307db6d676dcd04257d401e8759244c6e1d48891d02afd0558ae1fbc45f9f5d37e0505dfd76299d5f6d196eff4d8bc2111d7989024100d1fed155dbe76d37d3d9f64cb24268827042054e9c5bff56ce32d2e7a6018d19c8743d9ec608ffa56bd3360bf28d841f4171828164be2584c06cc49706dba74902406c512c965ee60750937eb134237ac538814b175b6c851c17f504717da6fa9cc9ce9f7cd57ce24615531d3e316b5a314fb1bf975a2bb6544f0b80e1f0ad31b6c102402901f7e32a645121bbcf2e97df9fb444f4a30fe2400a7f1c767bda4fbe4d433eabb4776c100425d829ec3efbaa4c1466fe22aa779632c3a4dee6dea51783c17102402802f67e22e9003a6b332daad57dabb1e922500cfa2bc9dee5fe2dab2c822f915733454c05f30ff0c14daa3878e816c7509c413d617bd8def517e8c91c4e7566'), rsa, true, ['decrypt']);
  check('rsa-oaep-sha256 openssl decrypt', await subtle.decrypt(rsa, rk, hex('7d0dddc06a3cb464b09378edc760023cf2e6748daa0775ec0d44cfb93665b2638b6c428c440c1454d66bc676334c8920987b48b5400d3b21ee200a31207fce9b4d2c99cb408d336e1ea6540a92cdbf7aaddc17ae9d8532e6b8a4659705d477933a698a6d58118c5480b229c995328eea9554b4c5b2b5f646135a1749455a80b8')), toHex(text('hello rsa')));
  const rp = await subtle.importKey('spki', hex('30819f300d06092a864886f70d010101050003818d0030818902818100b4093d568fe7a7eacb7504992ce35d2faca2252293935fb7022c2111166eb422995d58e552b2155b66679a75b7cc1fc00bb28916442ed5453993e630348642f89d13ab8592088e5b8e26ee0b71f5eedff883c6d7b47da275fce42eea98fefded28c787cc93207ec7baf0d5d6b10b3f69d8c7b5730388b19c2def5c6049e307110203010001'), rsa, true, ['encrypt']);
  check('rsa spki export', await subtle.exportKey('spki', rp), '30819f300d06092a864886f70d010101050003818d0030818902818100b4093d568fe7a7eacb7504992ce35d2faca2252293935fb7022c2111166eb422995d58e552b2155b66679a75b7cc1fc00bb28916442ed5453993e630348642f89d13ab8592088e5b8e26ee0b71f5eedff883c6d7b47da275fce42eea98fefded28c787cc93207ec7baf0d5d6b10b3f69d8c7b5730388b19c2def5c6049e307110203010001');
  check('rsa-oaep round trip', await subtle.decrypt(rsa, rk, await subtle.encrypt(rsa, rp, text('nonce'))), toHex(text('nonce')));
  const rpair = await subtle.generateKeyPair({ name: 'RSA-OAEP', hash: 'SHA-256', modulusLength: 1024 }, false, ['decrypt']);
  const rspki = await subtle.exportKey('spki', rpair.publicKey);
  const rback = await subtle.importKey('spki', rspki, rsa, false, ['encrypt']);
  console.log('rsa pair', rspki.length, toHex(await subtle.decrypt(rsa, rpair.privateKey, await subtle.encrypt(rsa, rback, text('token')))) === toHex(text('token')));
}
main();
