// zinc:web/websocket — the browser's WebSocket over zinc:socket, for the JavaScript libraries that expect one (ZN-1008). A plain JavaScript
// module on QuickJS that reads the global `WebSocket` gets this class (src/frontend/modules.cpp kJsGlobals); a Zinc program uses zinc:socket's
// (this file is JavaScript with types, for the JavaScript engines only: the checker refuses its dynamic calls).
// Text messages are strings; binary ones are ArrayBuffers when binaryType is 'arraybuffer', Blobs (when the program has zinc:web's Blob) or
// ArrayBuffers otherwise. Events have the browser's shape: { type, data } for a message, { type, code, reason, wasClean } for the close.
import { WebSocket as SocketWs } from 'zinc:socket';

type Listener = { f: any; once: boolean };

export class WebSocket {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  CONNECTING = 0; OPEN = 1; CLOSING = 2; CLOSED = 3;
  binaryType: string = 'blob';
  bufferedAmount = 0;
  extensions = '';
  protocol = '';
  url: string;
  onopen: any = null;
  onmessage: any = null;
  onclose: any = null;
  onerror: any = null;
  ws: SocketWs;
  listeners: Map<string, Listener[]> = new Map();
  constructor(url: any, protocols?: any) {
    this.url = String(url);
    const headers: [string, string][] = [];
    if (protocols !== undefined) headers.push(['Sec-WebSocket-Protocol', Array.isArray(protocols) ? protocols.join(', ') : String(protocols)]);
    this.ws = new SocketWs(this.url, headers.length > 0 ? { headers } : null);
    this.ws.onopen = () => this.emit({ type: 'open' });
    this.ws.onmessage = (e: any) => this.emit({ type: 'message', data: e.binary ? this.binary(e.bytes) : e.data });
    this.ws.onclose = (e: any) => this.emit({ type: 'close', code: e.code, reason: e.reason, wasClean: e.wasClean });
    this.ws.onerror = (e: any) => this.emit({ type: 'error', message: e.message });
  }
  get readyState(): number { return this.ws.readyState; }
  binary(bytes: any): any {
    const buf = new Uint8Array(bytes).buffer;
    const B = (globalThis as any).Blob;
    return this.binaryType === 'arraybuffer' || B === undefined ? buf : new B([buf]);
  }
  send(data: any): void {
    if (typeof data === 'string') { this.ws.send(data); return; }
    const view = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    this.ws.sendBytes(Array.from(view));
  }
  close(code?: number, reason?: string): void { this.ws.close(code ?? 1000, reason ?? ''); }
  addEventListener(type: string, f: any, opts?: any): void {
    const list = this.listeners.get(type) ?? [];
    list.push({ f, once: opts !== undefined && opts !== null && opts.once === true });
    this.listeners.set(type, list);
  }
  removeEventListener(type: string, f: any): void {
    const list = this.listeners.get(type);
    if (list !== undefined) this.listeners.set(type, list.filter((l: Listener) => l.f !== f));
  }
  dispatchEvent(e: any): boolean { this.emit(e); return true; }
  emit(e: any): void {
    e.target = this;
    e.currentTarget = this;
    const on = (this as any)['on' + e.type];
    if (typeof on === 'function') on.call(this, e);
    const list = this.listeners.get(e.type) ?? [];
    this.listeners.set(e.type, list.filter((l: Listener) => !l.once));
    for (const l of list) { if (typeof l.f === 'function') l.f.call(this, e); else l.f.handleEvent(e); }
  }
}
