// The web relay (app/web-relay) seen from the tablet: a page's size and links, pictures of its parts, and the export with the ink.
import * as net from 'zinc:net';
import { DPR, REQUEST_TIMEOUT_MS, MAX_IMAGE_BYTES } from './constants';

export class Link {
  x: number = 0; y: number = 0; w: number = 0; h: number = 0;
  href: string = '';
}
/** A rendered page; sizes in tablet pixels of the whole page. */
export class Doc {
  url: string = '';
  title: string = '';
  width: number = 0;
  height: number = 0;
  links: Link[] = [];
}

export class Relay {
  url: string = '';
  token: string = '';
  mode: string = 'grey';
  contrast: string = 'normal';   // normal, high, max
  style: string = 'eink';        // eink (the relay's e-ink stylesheet) or page (the page's own)
  reader: boolean = false;       // the article alone (Readability), over the style
  w: i32 = 0;   // the viewport: the page view's size on the tablet
  h: i32 = 0;

  private address(path: string, page: string): string {
    const base = this.url.endsWith('/') ? this.url.slice(0, this.url.length - 1) : this.url;
    return base + path + '?url=' + encodeURIComponent(page) + '&w=' + this.w.toString() + '&h=' + this.h.toString() + '&dpr=' + DPR.toString() + '&mode=' + this.mode + '&contrast=' + this.contrast + '&style=' + (this.reader ? 'read' : this.style);
  }
  private async send(address: string, init: net.RequestInit): Promise<net.Response> {
    const h = new net.Headers();
    if (this.token !== '') h.set('Authorization', 'Bearer ' + this.token);
    init.headers = h;
    init.timeoutMs = REQUEST_TIMEOUT_MS;
    init.maxBytes = MAX_IMAGE_BYTES;
    let r: net.Response;
    try { r = await net.fetch(address, init); }
    catch (e) { throw new Error('Cannot reach the relay ' + this.url + ' (' + e.message + '). Is `zinc run app/web-relay` running on the Mac?'); }
    if (r.status === 401) throw new Error('The relay refused the token: copy relay.token from the Mac into Settings.');
    if (!r.ok) throw new Error('The relay answered ' + r.status.toString() + ': ' + (await r.text()).trim());
    return r;
  }

  /** The last page sent from the Mac (the relay's page at /), or '' when none was. */
  async inbox(): Promise<string> {
    return (await (await this.send(this.url.endsWith('/') ? this.url + 'inbox' : this.url + '/inbox', {})).text()).trim();
  }

  /** Loads `page` on the relay: its final URL, title, size and links. */
  async render(page: string): Promise<Doc> {
    const j = await (await this.send(this.address('/render', page), {})).json();
    const d = new Doc();
    d.url = '' + j.url; d.title = '' + j.title;
    d.width = j.width as number; d.height = j.height as number;
    for (let i: i32 = 0; i < j.links.length; i++) {
      const a = j.links[i];
      const l = new Link();
      l.x = a[0] as number; l.y = a[1] as number; l.w = a[2] as number; l.h = a[3] as number; l.href = '' + a[4];
      d.links.push(l);
    }
    return d;
  }

  /** PNG of the page rectangle (x, y, w, h) at `zoom`: w*zoom x h*zoom pixels. */
  async shot(page: string, x: number, y: number, w: number, h: number, zoom: number): Promise<u8[]> {
    const a = this.address('/shot', page) + '&x=' + Math.round(x).toString() + '&y=' + Math.round(y).toString() + '&cw=' + Math.round(w).toString() +
      '&ch=' + Math.round(h).toString() + '&zoom=' + zoom.toString();
    return await (await this.send(a, {})).bytes();
  }

  /** The dashboard: PNG of page 1 of `page` laid out at w x h, loaded again by the relay (fresh), not its cached tab. */
  async firstPage(page: string, w: i32, h: i32): Promise<u8[]> {
    const vw = this.w, vh = this.h;
    this.w = w; this.h = h;
    const a = this.address('/shot', page) + '&fresh=1';
    this.w = vw; this.h = vh;
    return await (await this.send(a, {})).bytes();
  }

  /** PNG of the whole page with `svg` (the ink, in page pixels) over it. */
  async exportPage(page: string, svg: string): Promise<u8[]> {
    return await (await this.send(this.address('/export', page), { method: 'POST', body: svg, contentType: 'image/svg+xml' })).bytes();
  }
}
