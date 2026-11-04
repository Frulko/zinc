// ============================================================================
// services/remote-setup.ts — The settings typed on a phone, not on the tablet
// ============================================================================
// The tablet shows a QR code; its one-time code opens a page served here for ten minutes at most, on the local
// network and in plain HTTP. The secret goes to the private folder and is never shown again.

import { Reply, Request, Headers, serveAsync, stop } from 'zinc:net';
import { Lastfm } from 'zinc:lastfm';
import { randomBytes } from 'zinc:sys';
import { URLSearchParams, toHex } from 'zinc:web';
import { isWebOS, openPort } from 'zinc:webos';
import { ScrobbleService } from './scrobble-service';

export const SETUP_PORT: i32 = 8766;
const VALID_SECONDS = 10 * 60;
const WRONG_CODES_ALLOWED = 5;
const LASTFM_KEY = /^[0-9a-fA-F]{32}$/;

function escapeHtml(text: string): string {
  return text.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;');
}

function page(status: i32, title: string, body: string): Reply {
  const headers = new Headers();
  headers.set('Cache-Control', 'no-store');
  return {
    status,
    headers,
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Musique</title>` +
      `<style>body{font:17px system-ui;margin:24px auto;max-width:480px;padding:0 16px}label{display:block;margin:16px 0 4px}` +
      `input{width:100%;box-sizing:border-box;padding:10px;font:inherit}button{margin-top:20px;padding:12px 20px;font:inherit}</style>` +
      `<h1>${escapeHtml(title)}</h1>${body}`,
  };
}

export class RemoteSetup {
  code: string = '';
  url: string = '';
  port: i32 = 0;
  message: string = '';
  private readonly service: ScrobbleService;
  private readonly endpoint: string;
  private readonly authPage: string;
  private expires: number = 0;
  private wrongCodes: i32 = 0;
  private key: string = '';
  private secret: string = '';
  private host: string = '';

  constructor(service: ScrobbleService, endpoint: string = 'https://ws.audioscrobbler.com/2.0/', authPage: string = 'https://www.last.fm/api/auth/') {
    this.service = service;
    this.endpoint = endpoint;
    this.authPage = authPage;
  }

  isOpen(): boolean {
    return this.port !== 0;
  }

  /** `host` is this machine's address on the network the phone is on. */
  open(host: string, port: i32 = SETUP_PORT): void {
    this.close();
    this.code = toHex(randomBytes(4));
    this.expires = Date.now() / 1000 + VALID_SECONDS;
    this.wrongCodes = 0;
    this.message = '';
    this.host = host;
    if (isWebOS() && !openPort(port)) {   // its firewall closes every port; only zinc-helper opens one
      this.message = 'Port fermé : zinc-helper absent';
      return;
    }
    try {
      this.port = serveAsync(port, (request: Request): Promise<Reply> => this.answer(request), { hostname: host, maxBodyBytes: 4096 });
      this.url = `http://${host}:${this.port}/setup?code=${this.code}`;
    } catch (error) {
      this.message = `Port ${port} indisponible`;
    }
  }

  close(): void {
    if (this.port !== 0) stop(this.port);
    this.port = 0;
    this.code = '';
    this.url = '';
    this.key = '';
    this.secret = '';
  }

  /** Called every second: the page does not outlive its ten minutes. */
  closeIfExpired(): void {
    if (this.isOpen() && Date.now() / 1000 >= this.expires) {
      this.close();
      this.message = 'Code expiré';
    }
  }

  private closeSoon(): void {
    setTimeout(() => { this.close(); }, 300);   // after the reply has gone out
  }

  private async answer(request: Request): Promise<Reply> {
    this.closeIfExpired();
    if (!this.isOpen()) return page(410, 'Terminé', '<p>Relancez la configuration depuis la tablette.</p>');
    const mark = request.path.indexOf('?');
    const path = mark < 0 ? request.path : request.path.slice(0, mark);
    const form = new URLSearchParams(request.method === 'POST' ? request.body : mark < 0 ? '' : request.path.slice(mark + 1));
    const callback = path.startsWith('/callback/');
    if (!callback && path !== '/setup') return page(404, 'Introuvable', '');   // a browser asks for its favicon: not a wrong code
    if ((callback ? path.slice(10) : form.get('code') ?? '') !== this.code) {
      this.wrongCodes++;
      if (this.wrongCodes >= WRONG_CODES_ALLOWED) {
        this.closeSoon();
        this.message = 'Trop de codes faux';
      }
      return page(403, 'Code incorrect', '<p>Scannez à nouveau le QR code de la tablette.</p>');
    }
    if (callback) return this.lastfmAnswered(form.get('token') ?? '');
    return request.method === 'POST' ? this.saved(form) : this.formPage();
  }

  private formPage(): Reply {
    return page(200, 'Réglages de la tablette', `<form method="post" action="/setup" autocomplete="off">
<input type="hidden" name="code" value="${this.code}">
<p>Une clé Last.fm se crée sur <a href="https://www.last.fm/api/account/create">last.fm/api/account/create</a>. Ce réseau n'est pas chiffré : à faire chez vous.</p>
<label for="key">Clé API Last.fm</label><input id="key" name="key" autocapitalize="off" spellcheck="false">
<label for="secret">Secret partagé Last.fm</label><input id="secret" name="secret" type="password">
<label for="bridge">Jeton du pont AirPlay (facultatif)</label><input id="bridge" name="bridge" type="password">
<button>Enregistrer</button></form>`);
  }

  private saved(form: URLSearchParams): Reply {
    const key = (form.get('key') ?? '').trim();
    const secret = (form.get('secret') ?? '').trim();
    const token = (form.get('bridge') ?? '').trim();
    if (token.length > 256 || /\s/.test(token)) return page(400, 'Jeton refusé', '<p>Revenez en arrière pour le corriger.</p>');
    if (key === '' && secret === '') {
      if (token === '') return page(400, 'Rien à enregistrer', '<p>Revenez en arrière pour remplir le formulaire.</p>');
      this.service.saveBridgeToken(token);
      this.closeSoon();
      return page(200, 'Enregistré', '<p>Vous pouvez fermer cette page.</p>');
    }
    if (!LASTFM_KEY.test(key) || !LASTFM_KEY.test(secret)) {
      return page(400, 'Clé refusée', '<p>La clé et le secret font 32 caractères hexadécimaux. Revenez en arrière pour les corriger.</p>');
    }
    if (token !== '') this.service.saveBridgeToken(token);
    this.key = key;
    this.secret = secret;
    const back = `http://${this.host}:${this.port}/callback/${this.code}`;   // in the path: Last.fm adds its token to the query
    const headers = new Headers();
    headers.set('Location', `${this.authPage}?api_key=${encodeURIComponent(key)}&cb=${encodeURIComponent(back)}`);
    headers.set('Cache-Control', 'no-store');
    return { status: 303, headers, body: '', contentType: 'text/plain' };
  }

  private async lastfmAnswered(token: string): Promise<Reply> {
    if (this.key === '' || token === '') return page(400, 'Autorisation absente', '<p>Reprenez depuis le formulaire.</p>');
    const api = new Lastfm(this.key, this.secret, this.endpoint);
    let session = '';
    try {
      session = await api.authorize(token);
      this.service.connect(this.key, this.secret, session, api.account);
    } catch (error) {
      console.error(`music: Last.fm authorization: ${error.message}`);
      return page(502, 'Last.fm a refusé', '<p>Vérifiez la clé et le secret, puis reprenez depuis le formulaire.</p>');
    }
    this.closeSoon();
    return page(200, 'Connecté', `<p>Connecté : ${escapeHtml(api.account)}. Vous pouvez fermer cette page.</p>`);
  }
}
