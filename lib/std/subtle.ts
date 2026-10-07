// zinc:subtle — Web Crypto (crypto.subtle) beyond digest, on PSA / mbedTLS through the host (src/host/crypto.cpp): HMAC, AES-GCM / AES-CBC / AES-CTR, PBKDF2, HKDF,
// ECDSA and ECDH on P-256. Zinc Next only (the prototype's lib/std/web.ts has digest). Keys import and export as 'raw' (an EC private key as 'raw-private', its 32-byte
// scalar); jwk, pkcs8, spki and RSA are not supported. generateKey makes a symmetric key, generateKeyPair (not in the Web Crypto API) an EC pair.
import { op as cryptoOp } from 'zinc:__crypto';
import { DOMException } from 'zinc:web';

/** What an algorithm needs: `name` always; the rest by algorithm (the fields of the Web Crypto dictionaries that Zinc supports). */
export interface Algorithm {
  name: string;
  hash?: string;
  length?: i32;
  iv?: u8[];
  counter?: u8[];
  additionalData?: u8[];
  tagLength?: i32;
  salt?: u8[];
  iterations?: i32;
  info?: u8[];
  namedCurve?: string;
  /** ECDH: the other party's public key. */
  public?: CryptoKey;
}
/** A key: its bytes stay inside (`data`, and for an EC private key `priv`); `type` is 'secret', 'private' or 'public'. */
export class CryptoKey {
  readonly type: string;
  readonly extractable: boolean;
  readonly algorithm: Algorithm;
  readonly usages: string[];
  data: u8[];
  priv: u8[];
  constructor(type: string, extractable: boolean, algorithm: Algorithm, usages: string[], data: u8[], priv: u8[]) {
    this.type = type; this.extractable = extractable; this.algorithm = algorithm; this.usages = usages; this.data = data; this.priv = priv;
  }
}
export class CryptoKeyPair { publicKey: CryptoKey; privateKey: CryptoKey; constructor(p: CryptoKey, k: CryptoKey) { this.publicKey = p; this.privateKey = k; } }

function hashName(h: string | undefined): string {
  const x = (h === undefined ? 'SHA-256' : h as string).toUpperCase();
  if (x !== 'SHA-1' && x !== 'SHA-256' && x !== 'SHA-384' && x !== 'SHA-512') throw new DOMException('Unrecognized hash name', 'NotSupportedError');
  return x.toLowerCase();
}
function need(key: CryptoKey, usage: string, name: string): void {
  if (key.algorithm.name.toUpperCase() !== name) throw new DOMException('key algorithm mismatch', 'InvalidAccessError');
  if (key.usages.indexOf(usage) < 0) throw new DOMException('key does not support the requested operation', 'InvalidAccessError');
}
const NONE: u8[] = [];
function op(name: string, a: u8[], b: u8[], c: u8[], d: u8[], n: i32, m: i32): u8[] {
  try { return cryptoOp(name, a, b, c, d, n, m); } catch (e) { throw new DOMException((e as Error).message, 'OperationError'); }
}

export class FullSubtleCrypto {
  /** 'SHA-1', 'SHA-256', 'SHA-384' or 'SHA-512' (case-insensitive). Rejects with NotSupportedError otherwise. */
  async digest(algorithm: string, data: u8[]): Promise<u8[]> {
    const a = algorithm.toUpperCase();
    if (a === 'SHA-256' || a === 'SHA-1' || a === 'SHA-384' || a === 'SHA-512') return op('digest:' + a.toLowerCase(), data, NONE, NONE, NONE, 0, 0);
    throw new DOMException(`Unrecognized algorithm name`, 'NotSupportedError');
  }
  async importKey(format: string, keyData: u8[], algorithm: Algorithm, extractable: boolean, usages: string[]): Promise<CryptoKey> {
    const name = algorithm.name.toUpperCase();
    if (format === 'raw' || format === 'raw-private') {
      if (name === 'ECDH' || name === 'ECDSA') {
        if (algorithm.namedCurve !== 'P-256') throw new DOMException('only P-256', 'NotSupportedError');
        if (format === 'raw-private') return new CryptoKey('private', extractable, algorithm, usages, op('ec-public', keyData, NONE, NONE, NONE, 0, 0), keyData);
        if (keyData.length !== 65 || keyData[0] !== 4) throw new DOMException('an uncompressed P-256 point is 65 bytes', 'DataError');
        return new CryptoKey('public', extractable, algorithm, usages, keyData, NONE);
      }
      if (name === 'AES-GCM' || name === 'AES-CBC' || name === 'AES-CTR') {
        if (keyData.length !== 16 && keyData.length !== 24 && keyData.length !== 32) throw new DOMException('AES keys are 128, 192 or 256 bits', 'DataError');
      } else if (name !== 'HMAC' && name !== 'PBKDF2' && name !== 'HKDF') throw new DOMException('Unrecognized algorithm name', 'NotSupportedError');
      return new CryptoKey('secret', extractable, algorithm, usages, keyData, NONE);
    }
    throw new DOMException(`format ${format} is not supported (raw only)`, 'NotSupportedError');
  }
  async exportKey(format: string, key: CryptoKey): Promise<u8[]> {
    if (!key.extractable) throw new DOMException('key is not extractable', 'InvalidAccessError');
    if (format === 'raw') return key.data;
    if (format === 'raw-private' && key.type === 'private') return key.priv;
    throw new DOMException(`format ${format} is not supported (raw only)`, 'NotSupportedError');
  }
  async generateKey(algorithm: Algorithm, extractable: boolean, usages: string[]): Promise<CryptoKey> {
    const name = algorithm.name.toUpperCase();
    if (name === 'AES-GCM' || name === 'AES-CBC' || name === 'AES-CTR') {
      const bits = algorithm.length === undefined ? 0 : algorithm.length as i32;
      if (bits !== 128 && bits !== 192 && bits !== 256) throw new DOMException('AES key length must be 128, 192 or 256', 'OperationError');
      return new CryptoKey('secret', extractable, algorithm, usages, op('random', NONE, NONE, NONE, NONE, bits / 8, 0), NONE);
    }
    if (name === 'HMAC') {
      const bits = algorithm.length === undefined ? 512 : algorithm.length as i32;
      return new CryptoKey('secret', extractable, algorithm, usages, op('random', NONE, NONE, NONE, NONE, (bits + 7) / 8, 0), NONE);
    }
    throw new DOMException('use generateKeyPair for EC keys', 'NotSupportedError');
  }
  async generateKeyPair(algorithm: Algorithm, extractable: boolean, usages: string[]): Promise<CryptoKeyPair> {
    const name = algorithm.name.toUpperCase();
    if ((name !== 'ECDSA' && name !== 'ECDH') || algorithm.namedCurve !== 'P-256') throw new DOMException('ECDSA or ECDH on P-256 only', 'NotSupportedError');
    const both = op('ec-generate', NONE, NONE, NONE, NONE, 0, 0);
    const pub = both.slice(32);
    return new CryptoKeyPair(new CryptoKey('public', true, algorithm, name === 'ECDSA' ? ['verify'] : [], pub, NONE), new CryptoKey('private', extractable, algorithm, usages, pub, both.slice(0, 32)));
  }
  async sign(algorithm: Algorithm, key: CryptoKey, data: u8[]): Promise<u8[]> {
    const name = algorithm.name.toUpperCase();
    if (name === 'HMAC') { need(key, 'sign', 'HMAC'); return op('hmac:' + hashName(key.algorithm.hash), key.data, data, NONE, NONE, 0, 0); }
    if (name === 'ECDSA') { need(key, 'sign', 'ECDSA'); return op('ecdsa-sign:' + hashName(algorithm.hash), key.priv, data, NONE, NONE, 0, 0); }
    throw new DOMException('Unrecognized algorithm name', 'NotSupportedError');
  }
  async verify(algorithm: Algorithm, key: CryptoKey, signature: u8[], data: u8[]): Promise<boolean> {
    const name = algorithm.name.toUpperCase();
    if (name === 'HMAC') {
      need(key, 'verify', 'HMAC');
      const mac = op('hmac:' + hashName(key.algorithm.hash), key.data, data, NONE, NONE, 0, 0);
      if (mac.length !== signature.length) return false;
      let diff: i32 = 0;
      for (let i = 0; i < mac.length; i++) diff |= mac[i] ^ signature[i];
      return diff === 0;
    }
    if (name === 'ECDSA') { need(key, 'verify', 'ECDSA'); return op('ecdsa-verify:' + hashName(algorithm.hash), key.data, data, signature, NONE, 0, 0)[0] === 49; }
    throw new DOMException('Unrecognized algorithm name', 'NotSupportedError');
  }
  async encrypt(algorithm: Algorithm, key: CryptoKey, data: u8[]): Promise<u8[]> { return this.cipher(algorithm, key, data, true); }
  async decrypt(algorithm: Algorithm, key: CryptoKey, data: u8[]): Promise<u8[]> { return this.cipher(algorithm, key, data, false); }
  private cipher(algorithm: Algorithm, key: CryptoKey, data: u8[], enc: boolean): u8[] {
    const name = algorithm.name.toUpperCase();
    const use = enc ? 'encrypt' : 'decrypt';
    if (name === 'AES-GCM') {
      need(key, use, 'AES-GCM');
      if (algorithm.iv === undefined) throw new DOMException('AES-GCM needs an iv', 'OperationError');
      const aad = algorithm.additionalData === undefined ? NONE : algorithm.additionalData as u8[];
      const tag = algorithm.tagLength === undefined ? 16 : (algorithm.tagLength as i32) / 8;
      return op(enc ? 'aes-gcm-encrypt' : 'aes-gcm-decrypt', key.data, algorithm.iv as u8[], data, aad, tag, 0);
    }
    if (name === 'AES-CBC') {
      need(key, use, 'AES-CBC');
      if (algorithm.iv === undefined || (algorithm.iv as u8[]).length !== 16) throw new DOMException('AES-CBC needs a 16-byte iv', 'OperationError');
      return op(enc ? 'aes-cbc-encrypt' : 'aes-cbc-decrypt', key.data, algorithm.iv as u8[], data, NONE, 0, 0);
    }
    if (name === 'AES-CTR') {
      need(key, use, 'AES-CTR');
      if (algorithm.counter === undefined || (algorithm.counter as u8[]).length !== 16) throw new DOMException('AES-CTR needs a 16-byte counter', 'OperationError');
      return op('aes-ctr', key.data, algorithm.counter as u8[], data, NONE, 0, 0);
    }
    throw new DOMException('Unrecognized algorithm name', 'NotSupportedError');
  }
  /** PBKDF2, HKDF and ECDH: `length` bits. */
  async deriveBits(algorithm: Algorithm, baseKey: CryptoKey, length: i32): Promise<u8[]> {
    const name = algorithm.name.toUpperCase();
    const bytes = (length + 7) / 8;
    if (name === 'PBKDF2') {
      need(baseKey, 'deriveBits', 'PBKDF2');
      if (algorithm.salt === undefined || algorithm.iterations === undefined) throw new DOMException('PBKDF2 needs salt and iterations', 'OperationError');
      return op('pbkdf2:' + hashName(algorithm.hash), baseKey.data, algorithm.salt as u8[], NONE, NONE, algorithm.iterations as i32, bytes);
    }
    if (name === 'HKDF') {
      need(baseKey, 'deriveBits', 'HKDF');
      if (algorithm.salt === undefined || algorithm.info === undefined) throw new DOMException('HKDF needs salt and info', 'OperationError');
      return op('hkdf:' + hashName(algorithm.hash), baseKey.data, algorithm.salt as u8[], algorithm.info as u8[], NONE, 0, bytes);
    }
    if (name === 'ECDH') {
      need(baseKey, 'deriveBits', 'ECDH');
      if (algorithm.public === undefined) throw new DOMException('ECDH needs the other public key', 'OperationError');
      const shared = op('ecdh', baseKey.priv, (algorithm.public as CryptoKey).data, NONE, NONE, 0, 0);
      return length === 0 || length >= shared.length * 8 ? shared : shared.slice(0, bytes);
    }
    throw new DOMException('Unrecognized algorithm name', 'NotSupportedError');
  }
  async deriveKey(algorithm: Algorithm, baseKey: CryptoKey, derivedKeyAlgorithm: Algorithm, extractable: boolean, usages: string[]): Promise<CryptoKey> {
    const bits = derivedKeyAlgorithm.length === undefined ? 256 : derivedKeyAlgorithm.length as i32;
    const raw = await this.deriveBits(algorithm, baseKey, bits);
    return await this.importKey('raw', raw, derivedKeyAlgorithm, extractable, usages);
  }
}
export const subtle: FullSubtleCrypto = new FullSubtleCrypto();
