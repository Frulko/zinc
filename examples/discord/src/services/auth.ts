// Logging in without pasting a token. The QR code: Discord's remote-auth gateway (v2). The client makes an RSA-2048 key pair (zinc:subtle,
// mbedTLS), sends its public key (SPKI, base64), decrypts the nonce the gateway sends with it (RSA-OAEP, SHA-256) and proves it with the
// nonce's SHA-256 (base64url); the gateway answers a fingerprint, shown as the QR code https://discord.com/ra/<fingerprint>. The phone app
// scans it: the gateway sends the user (encrypted: id:discriminator:avatar:username), then, once confirmed on the phone, a ticket that
// POST /users/@me/remote-auth/login exchanges for the encrypted token. The password: POST /auth/login, then /auth/mfa/totp or
// /auth/mfa/sms (after /auth/mfa/sms/send) with the ticket when the account has two-factor authentication.
// One attempt per click, nothing retried: an expired code waits for "New code". Every request and each new code asks the guard first
// (src/safety: kinds login, mfa, qr, ticket). A captcha is never shown or solved: the guard's message says to log in with the QR code or
// in the official app.
import { WebSocket, MessageEvent, CloseEvent } from 'zinc:socket';
import { subtle, CryptoKey } from 'zinc:subtle';
import { base64Encode, base64Decode, TextDecoder } from 'zinc:web';
import { api, begin, setToken, ApiError } from '../safety/index';
import { REMOTE_AUTH_URL, WEB_ORIGIN, QR_LINK, USER_AGENT } from '../constants';

const OAEP = { name: 'RSA-OAEP', hash: 'SHA-256' };

/** A base64 field of the gateway, decrypted with the session's private key. */
export async function decrypt(key: CryptoKey, b64: string): Promise<u8[]> { return await subtle.decrypt(OAEP, key, base64Decode(b64)); }
export const utf8 = (b: u8[]): string => new TextDecoder().decode(b);
/** The nonce's proof: its SHA-256, base64url without padding. */
export async function proofOf(nonce: u8[]): Promise<string> {
  return base64Encode(await subtle.digest('SHA-256', nonce)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
/** The name in the user payload "id:discriminator:avatar:username" (a name may hold ':'). */
export function payloadName(payload: string): string { const p = payload.split(':'); return p.length >= 4 ? p.slice(3).join(':') : ''; }

export type QrStage = 'idle' | 'starting' | 'scan' | 'confirm' | 'done' | 'expired';

/** One QR code login: start() opens the gateway, `link` is the QR code's text once it is known; `loggedIn` gets the token. */
export class QrLogin {
  stage: QrStage = 'idle';
  link = '';
  user = '';
  error = '';
  private ws: WebSocket | null = null;
  private key: CryptoKey | null = null;
  private beat: i32 = -1;
  private gen: i32 = 0;   // the start() that is current: an older one still making its key gives up
  private changed: () => void;
  private loggedIn: (token: string) => void;
  constructor(changed: () => void, loggedIn: (token: string) => void) { this.changed = changed; this.loggedIn = loggedIn; }

  async start(): Promise<void> {
    this.stop();
    const gen = ++this.gen;
    const v = begin('qr');   // with the login screen, then only on "New code": the guard's pace and caps
    if (!v.ok) { this.end('expired', v.message); return; }
    this.stage = 'starting'; this.link = ''; this.user = ''; this.error = ''; this.changed();
    try {
      const pair = await subtle.generateKeyPair({ name: 'RSA-OAEP', hash: 'SHA-256', modulusLength: 2048 }, false, ['decrypt']);
      this.key = pair.privateKey;
      const spki = base64Encode(await subtle.exportKey('spki', pair.publicKey));
      if (gen !== this.gen) return;   // cancelled or started again meanwhile
      const ws = new WebSocket(REMOTE_AUTH_URL, { headers: [['User-Agent', USER_AGENT], ['Origin', WEB_ORIGIN]] });
      this.ws = ws;
      ws.onmessage = (e: MessageEvent): void => {
        if (this.ws === ws) this.receive(JSON.parse(e.data), spki).catch((err: Error): void => { this.end('expired', err.message); });
      };
      ws.onclose = (e: CloseEvent): void => { if (this.ws === ws) this.end('expired', this.stage === 'starting' ? `The QR code service closed (${e.code}).` : ''); };
    } catch (e) { if (gen === this.gen) this.end('expired', (e as Error).message); }
  }
  /** Closes the gateway (the login screen left, or a new code asked for). */
  stop(): void {
    if (this.beat >= 0) { clearInterval(this.beat); this.beat = -1; }
    const ws = this.ws;
    this.ws = null;
    if (ws !== null) ws.close(1000, '');
  }
  /** Stops and forgets: the next start() makes a new code. No redraw (called from a change of the screen). */
  cancel(): void { this.gen++; this.stop(); this.stage = 'idle'; this.link = ''; this.user = ''; this.error = ''; }
  private end(stage: QrStage, error: string): void { this.stop(); this.stage = stage; this.error = error; this.changed(); }
  private send(m: any): void { const ws = this.ws; if (ws !== null) ws.send(JSON.stringify(m)); }

  private async receive(m: any, spki: string): Promise<void> {
    const key = this.key as CryptoKey;
    if (m.op === 'hello') {
      this.beat = setInterval((): void => { this.send({ op: 'heartbeat' }); }, m.heartbeat_interval as number);
      this.send({ op: 'init', encoded_public_key: spki });
    } else if (m.op === 'nonce_proof') {
      this.send({ op: 'nonce_proof', proof: await proofOf(await decrypt(key, m.encrypted_nonce as string)) });
    } else if (m.op === 'pending_remote_init') {
      this.link = QR_LINK + (m.fingerprint as string); this.stage = 'scan'; this.changed();
    } else if (m.op === 'pending_ticket') {
      this.user = payloadName(utf8(await decrypt(key, m.encrypted_user_payload as string))); this.stage = 'confirm'; this.changed();
    } else if (m.op === 'pending_login') {
      this.stop();
      setToken('');
      const r: any = await api('ticket', 'POST', '/users/@me/remote-auth/login', { ticket: m.ticket as string });
      const token = utf8(await decrypt(key, r.encrypted_token as string));
      this.stage = 'done'; this.changed();
      this.loggedIn(token);
    } else if (m.op === 'cancel') this.end('expired', 'The login was cancelled on the phone.');
  }
}

/** What /auth/login asks next when the account has two-factor authentication. */
export class Mfa { ticket = ''; totp = false; sms = false; phone = ''; }

/** The plain message of a refused login: the API's form errors ("Login or password is invalid.") rather than "Invalid Form Body". */
export function loginError(e: Error): string {
  if (e instanceof ApiError) {
    const errors: any = e.body !== null && e.body !== undefined ? e.body.errors : undefined;
    if (errors !== undefined && errors !== null)
      for (const field of Object.keys(errors)) {
        const list: any = errors[field]._errors;
        if (Array.isArray(list) && list.length > 0 && typeof list[0].message === 'string') return list[0].message as string;
      }
  }
  return e.message;
}

/** The token, or '' when Discord asks for a second factor: `mfa` then holds its ticket and the kinds offered. */
export async function passwordLogin(login: string, password: string, mfa: Mfa): Promise<string> {
  setToken('');
  const r: any = await api('login', 'POST', '/auth/login', { login: login, password: password, undelete: false, login_source: null, gift_code_sku_id: null });
  if (typeof r.token === 'string' && r.token !== '') return r.token as string;
  if (r.mfa === true && typeof r.ticket === 'string') { mfa.ticket = r.ticket as string; mfa.totp = r.totp === true; mfa.sms = r.sms === true; return ''; }
  throw new Error('Discord did not log in: finish in the official Discord app, or use the QR code.');
}
/** Sends the SMS code; the phone it went to (masked by Discord). */
export async function sendSms(mfa: Mfa): Promise<string> {
  const r: any = await api('mfa', 'POST', '/auth/mfa/sms/send', { ticket: mfa.ticket });
  mfa.phone = typeof r.phone === 'string' ? r.phone as string : '';
  return mfa.phone;
}
/** The token for a code from the authenticator app ('totp') or the SMS ('sms'). */
export async function mfaLogin(kind: string, code: string, mfa: Mfa): Promise<string> {
  const r: any = await api('mfa', 'POST', `/auth/mfa/${kind}`, { code: code.replace(/\s/g, ''), ticket: mfa.ticket, login_source: null, gift_code_sku_id: null });
  return r.token as string;
}
