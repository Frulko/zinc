// zinc:net/acme — certificates from Let's Encrypt (or any ACME server, RFC 8555) with the http-01 challenge, and their renewal (ZN-893).
// The account key and the certificate's key are P-256 (ES256 JWS); the CSR, the key PEM and the expiry come from mbedTLS (src/host/crypto.cpp).
// Every zinc:net server answers the challenge while it runs; when nothing listens on challengePort a server is started for the order.
import { fetch, serve, serving, stop, setChallenge, clearChallenge, setCertificate, Headers, Response, Reply, Request } from 'zinc:net';
import { op as cryptoOp } from 'zinc:__crypto';
import { utf8Encode, utf8Decode } from 'zinc:sys';
import { base64Encode } from 'zinc:web';
import * as fs from 'zinc:fs';

export const LETS_ENCRYPT = 'https://acme-v02.api.letsencrypt.org/directory';
export const LETS_ENCRYPT_STAGING = 'https://acme-staging-v02.api.letsencrypt.org/directory';

export interface AcmeOptions {
  /** The names the certificate is for (the first is its subject). */
  domains: string[];
  /** The ACME directory (Let's Encrypt by default; LETS_ENCRYPT_STAGING while testing). */
  directory?: string;
  /** A contact address for the account (expiry notices). */
  email?: string;
  /** Where the account key and the certificate are kept ('acme' by default): account.key, cert.pem, key.pem. */
  dir?: string;
  /** The port the ACME server checks the challenge on (80; Pebble's default is 5002). */
  challengePort?: i32;
  /** A certificate with fewer days left than this is renewed (30). */
  renewDays?: i32;
}
export interface Certificate {
  /** The PEM chain and the PEM private key, as serve({ cert, key }) takes them. */
  cert: string; key: string;
  /** Expiry, milliseconds since 1970. */
  notAfter: f64;
}

function b64url(b: u8[]): string { return base64Encode(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64urlText(s: string): string { return b64url(utf8Encode(s)); }
function hex(b: u8[]): string { let s = ''; for (const x of b) s += (x < 16 ? '0' : '') + x.toString(16); return s; }
function unhex(s: string): u8[] { const r: u8[] = []; for (let i = 0; i + 1 < s.length; i += 2) r.push(parseInt(s.slice(i, i + 2), 16) as u8); return r; }
function op(name: string, a: u8[], b: u8[] = []): u8[] { return cryptoOp(name, a, b, [], [], 0, 0); }
function sleep(ms: i32): Promise<void> { return new Promise<void>((resolve) => { setTimeout(() => { resolve(); }, ms); }); }

class Client {
  dir: any = null;
  nonce = '';
  key: u8[];
  jwk: string;
  kid = '';
  constructor(key: u8[]) {
    this.key = key;
    const pub = op('ec-public', key);
    // the members in lexicographic order, no spaces: the form RFC 7638 hashes for the thumbprint
    this.jwk = `{"crv":"P-256","kty":"EC","x":"${b64url(pub.slice(1, 33))}","y":"${b64url(pub.slice(33, 65))}"}`;
  }
  thumbprint(): string { return b64url(op('digest:sha-256', utf8Encode(this.jwk))); }
  async start(directory: string): Promise<void> {
    const r = await fetch(directory);
    if (!r.ok) throw new Error(`acme: the directory ${directory} answered ${r.status}`);
    this.dir = JSON.parse(r.body);
    const n = await fetch(this.dir.newNonce as string, { method: 'HEAD' });
    this.nonce = n.headers.get('replay-nonce');
  }
  /** A signed POST (payload null: POST-as-GET); retried once on badNonce. */
  async post(url: string, payload: string | null, retry: boolean = true): Promise<Response> {
    const prot = this.kid.length > 0 ? `{"alg":"ES256","kid":${JSON.stringify(this.kid)},"nonce":${JSON.stringify(this.nonce)},"url":${JSON.stringify(url)}}`
                                     : `{"alg":"ES256","jwk":${this.jwk},"nonce":${JSON.stringify(this.nonce)},"url":${JSON.stringify(url)}}`;
    const p = b64urlText(prot), b = payload === null ? '' : b64urlText(payload as string);
    const sig = op('ecdsa-sign:sha-256', this.key, utf8Encode(p + '.' + b));
    const h = new Headers();
    const r = await fetch(url, { method: 'POST', body: `{"protected":"${p}","payload":"${b}","signature":"${b64url(sig)}"}`, contentType: 'application/jose+json', headers: h });
    const next = r.headers.get('replay-nonce');
    if (next.length > 0) this.nonce = next;
    if (r.status >= 400) {
      if (retry && r.body.indexOf('badNonce') >= 0) return this.post(url, payload, false);
      throw new Error(`acme: ${url} answered ${r.status}: ${r.body}`);
    }
    return r;
  }
  async poll(url: string, done: string[]): Promise<any> {
    for (let i = 0; i < 60; i++) {
      const o = JSON.parse((await this.post(url, null)).body);
      if (done.indexOf(o.status as string) >= 0) return o;
      if (o.status === 'invalid') throw new Error('acme: ' + url + ' is invalid: ' + JSON.stringify(o));
      await sleep(i < 5 ? 500 : 2000);
    }
    throw new Error('acme: ' + url + ' did not finish');
  }
}

function load(path: string): string { try { return fs.exists(path) ? fs.readText(path) : ''; } catch (e) { return ''; } }

/** The kept certificate when it has more than renewDays left, else a new one from the ACME server (written to `dir`). */
export async function certificate(o: AcmeOptions, force: boolean = false): Promise<Certificate> {
  const dir = o.dir !== undefined ? o.dir as string : 'acme';
  const renewMs = (o.renewDays !== undefined ? o.renewDays as i32 : 30) * 86400000;
  const keptCert = load(dir + '/cert.pem'), keptKey = load(dir + '/key.pem');
  if (!force && keptCert.length > 0 && keptKey.length > 0) {
    const notAfter = parseInt(utf8Decode(op('x509-not-after', utf8Encode(keptCert)))) * 1000;
    if (notAfter - Date.now() > renewMs) return { cert: keptCert, key: keptKey, notAfter: notAfter };
  }
  if (!fs.exists(dir)) fs.mkdir(dir);
  let accountHex = load(dir + '/account.key').trim();
  if (accountHex.length !== 64) { accountHex = hex(op('ec-generate', []).slice(0, 32)); fs.writeText(dir + '/account.key', accountHex); fs.chmod(dir + '/account.key', 0o600); }
  const c = new Client(unhex(accountHex));
  await c.start(o.directory !== undefined ? o.directory as string : LETS_ENCRYPT);
  const contact = o.email !== undefined ? `,"contact":["mailto:${o.email as string}"]` : '';
  const acct = await c.post(c.dir.newAccount as string, `{"termsOfServiceAgreed":true${contact}}`);
  c.kid = acct.headers.get('location');
  const ids = o.domains.map((d: string) => `{"type":"dns","value":${JSON.stringify(d)}}`).join(',');
  const orderRes = await c.post(c.dir.newOrder as string, `{"identifiers":[${ids}]}`);
  const orderUrl = orderRes.headers.get('location');
  const order = JSON.parse(orderRes.body);
  const port = o.challengePort !== undefined ? o.challengePort as i32 : 80;
  let own = 0;   // the challenge server started here, stopped at the end
  const tokens: string[] = [];
  try {
    for (const authUrl of order.authorizations as string[]) {
      const auth = JSON.parse((await c.post(authUrl, null)).body);
      if (auth.status === 'valid') continue;
      let ch: any = null;
      for (const x of auth.challenges as any[]) if (x.type === 'http-01') ch = x;
      if (ch === null) throw new Error('acme: no http-01 challenge for ' + JSON.stringify(auth.identifier));
      setChallenge(ch.token as string, (ch.token as string) + '.' + c.thumbprint());
      tokens.push(ch.token as string);
      if (own === 0 && !serving(port)) {   // the program's own server on that port answers it, else one for the order (IPv6 and IPv4)
        own = serve(port, (req: Request): Reply => ({ status: 404, body: '', contentType: 'text/plain' }), { hostname: '::' });
      }
      await c.post(ch.url as string, '{}');
      await c.poll(authUrl, ['valid']);
    }
    const certKey = op('ec-generate', []).slice(0, 32);
    const csr = op('ec-csr', certKey, utf8Encode(o.domains.join(',')));
    await c.post(order.finalize as string, `{"csr":"${b64url(csr)}"}`);
    const done = await c.poll(orderUrl, ['valid']);
    const cert = (await c.post(done.certificate as string, null)).body;
    const key = utf8Decode(op('ec-key-pem', certKey));
    fs.writeText(dir + '/key.pem', key);
    fs.chmod(dir + '/key.pem', 0o600);
    fs.writeText(dir + '/cert.pem', cert);
    return { cert: cert, key: key, notAfter: parseInt(utf8Decode(op('x509-not-after', utf8Encode(cert)))) * 1000 };
  } finally {
    for (const t of tokens) clearChallenge(t);
    if (own !== 0) stop(own);
  }
}

/** Checks the certificate every `everyMs` (12 hours) and, once it is renewed, gives it to the https server on `port`. */
export function keepRenewed(port: i32, o: AcmeOptions, everyMs: i32 = 43200000, onError?: (e: Error) => void): void {
  let current = '';
  const check = async (): Promise<void> => {
    try {
      const c = await certificate(o);
      if (c.cert !== current) { if (current.length > 0) setCertificate(port, c.cert, c.key); current = c.cert; }
    } catch (e) { if (onError !== undefined) { const f = onError as (e: Error) => void; f(e); } }
  };
  check();
  setInterval(() => { check(); }, everyMs);
}
