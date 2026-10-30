// The Network panel of Zinc Inspector: every request of zinc:net / fetch and every WebSocket (and MQTT client) of the program, from the
// Network events of zinc:devtools (the host's network log, src/host/netlog.h), as Chrome's: method, URL, status, type, sizes and a
// waterfall; filters by type, text and status; preserve log and clear; the selected request's headers, query string, payload, preview
// (JSON tree, text, image), raw response, timing phases and WebSocket messages; copy as cURL and export as HAR.
import { createSignal } from 'zinc:ui/solid';
import { imageFromBytes, destroyImage, imageWidth, imageHeight, drawImage, rect, setClipboardText } from 'zinc:gfx';
import { base64Decode } from 'zinc:web';
import { writeText } from 'zinc:fs';
import * as sys from 'zinc:sys';
import { call, setStatus } from './state';
import { Btn, Flat, Toggle, Field, Mono } from './widgets';

export class WsFrame {
  sent: boolean = false; op: i32 = 1; data: string = ''; at: number = 0;
  /** As the Messages tab shows it: an arrow, then the text, or what a control or binary frame is. */
  text(): string { return (this.sent ? '>> ' : '<< ') + (this.op === 1 ? this.data : this.op === 8 ? '[close]' : this.op === 9 ? '[ping]' : this.op === 10 ? '[pong]' : '[binary, ' + this.data.length + ' base64 characters]'); }
}
/** A request of the panel, built from its Network events. */
export class Req {
  id: string = ''; method: string = ''; url: string = ''; type: string = ''; status: i32 = 0; statusText: string = ''; error: string = ''; mime: string = '';
  start: number = 0; end: number = -1; transferred: i32 = 0; size: i32 = 0; frames: WsFrame[] = [];
  reqHeaders: string[] = []; resHeaders: string[] = [];   // name, value, name, value...
  postData: string = ''; hasPost: boolean = false;
  // the phases in ms (-1: not there): DNS, connect (TCP), TLS, request sent, waiting for the first byte, download
  dns: number = -1; connect: number = -1; tls: number = -1; send: number = -1; wait: number = -1; download: number = -1;
  ws(): boolean { return this.type === 'WebSocket'; }
  /** The path and query, or the URL when it has none. */
  path(): string { const a = this.url.indexOf('://'); if (a < 0) return this.url; const p = this.url.indexOf('/', a + 3); return p < 0 ? this.url : this.url.slice(p); }
  name(): string { const p = this.path(); const q = p.indexOf('?'); const b = q < 0 ? p : p.slice(0, q); const s = b.lastIndexOf('/'); return s >= 0 && s < b.length - 1 ? b.slice(s + 1) : b; }
  ms(): number { return this.end >= 0 ? Math.round((this.end - this.start) * 1000) : -1; }
  /** Chrome's type column: fetch, ws, img, media, script, document, other. */
  kind(): string {
    if (this.ws()) return 'ws';
    const m = this.mime;
    if (m.startsWith('image/')) return 'img';
    if (m.startsWith('audio/') || m.startsWith('video/')) return 'media';
    if (m.indexOf('javascript') >= 0) return 'js';
    return this.type === 'Fetch' ? 'fetch' : 'other';
  }
  /** One line: method, status (or the error), the path, the time and the size, as the dump prints it. */
  line(): string {
    const ms = this.end >= 0 ? this.ms() + ' ms' : 'pending';
    return this.method + ' ' + (this.error.length > 0 ? this.error : this.status > 0 ? '' + this.status : '…') + ' ' + this.path() + ' ' + ms +
      (this.ws() ? ' ' + this.frames.length + ' frames' : ' ' + this.transferred + ' B');
  }
}
function heads(o: any): string[] {
  const out: string[] = [];
  if (o !== undefined && o !== null) for (const k in o) { const v: string = '' + o[k]; out.push(k); out.push(v); }
  return out;
}
function phase(a: number, b: number): number { return a < 0 || b < 0 ? -1 : Math.max(0, b - a); }

/** Applies a Network event to the requests (in the order they started); false when it is not one. */
export function applyNetwork(reqs: Req[], method: string, params: any): boolean {
  if (!method.startsWith('Network.')) return false;
  const id: string = params.requestId;
  let r: Req | null = null;
  for (const x of reqs) if (x.id === id) r = x;
  if (method === 'Network.requestWillBeSent' || method === 'Network.webSocketCreated') {
    if (r === null) { r = new Req(); r.id = id; reqs.push(r); }
    const q = r as Req;
    if (method === 'Network.webSocketCreated') { q.method = 'WS'; q.url = params.url; q.type = 'WebSocket'; q.start = 0; return true; }
    q.method = params.request.method; q.url = params.request.url; q.type = params.type; q.start = params.timestamp;
    q.reqHeaders = heads(params.request.headers);
    if (params.request.hasPostData !== undefined) q.hasPost = true;
    if (params.request.postData !== undefined) q.postData = params.request.postData;
    return true;
  }
  if (r === null) return true;
  const q = r as Req;
  if (method === 'Network.webSocketWillSendHandshakeRequest') { q.start = params.timestamp; q.reqHeaders = heads(params.request.headers); }
  else if (method === 'Network.webSocketHandshakeResponseReceived') { q.status = params.response.status; q.statusText = params.response.statusText; q.resHeaders = heads(params.response.headers); }
  else if (method === 'Network.responseReceived') {
    const res = params.response;
    q.status = res.status; q.statusText = res.statusText; q.mime = res.mimeType; q.resHeaders = heads(res.headers);
    const t = res.timing;
    if (t !== undefined) {
      const dnsS: number = t.dnsStart; const dnsE: number = t.dnsEnd; const cS: number = t.connectStart; const cE: number = t.connectEnd;
      const sS: number = t.sslStart; const sE: number = t.sslEnd; const sendS: number = t.sendStart; const sendE: number = t.sendEnd; const hE: number = t.receiveHeadersEnd;
      q.dns = phase(dnsS, dnsE); q.tls = phase(sS, sE); q.connect = sS >= 0 ? phase(cS, sS) : phase(cS, cE);
      q.send = phase(sendS, sendE); q.wait = phase(sendE, hE);
      q.start = t.requestTime;
    }
  }
  else if (method === 'Network.dataReceived') { const n: i32 = params.dataLength; q.size += n; }
  else if (method === 'Network.loadingFinished') {
    q.end = params.timestamp; q.transferred = params.encodedDataLength;
    if (q.wait >= 0) { let before = 0; for (const v of [q.dns, q.connect, q.tls, q.send, q.wait]) if (v > 0) before += v; q.download = Math.max(0, (q.end - q.start) * 1000 - before); }
  }
  else if (method === 'Network.loadingFailed') { q.end = params.timestamp; q.error = params.errorText; }
  else if (method === 'Network.webSocketClosed') q.end = params.timestamp;
  else if (method === 'Network.webSocketFrameError') q.error = params.errorMessage;
  else if (method === 'Network.webSocketFrameSent' || method === 'Network.webSocketFrameReceived') {
    const f = new WsFrame();
    f.sent = method === 'Network.webSocketFrameSent'; f.op = params.response.opcode; f.data = params.response.payloadData; f.at = params.timestamp;
    q.frames.push(f);
  }
  return true;
}

/** `curl` for a request: method, headers, body (credentials masked by the host stay masked). */
export function curlOf(r: Req): string {
  const sh = (s: string): string => "'" + s.split("'").join("'\\''") + "'";
  let c = 'curl ' + sh(r.url);
  if (r.method !== 'GET') c += ' -X ' + r.method;
  for (let i = 0; i + 1 < r.reqHeaders.length; i += 2) c += ' -H ' + sh(r.reqHeaders[i] + ': ' + r.reqHeaders[i + 1]);
  if (r.postData.length > 0) c += ' --data-raw ' + sh(r.postData);
  return c;
}
/** The query string as name = value lines. */
export function queryLines(url: string): string[] {
  const q = url.indexOf('?');
  if (q < 0) return [];
  const out: string[] = [];
  for (const kv of url.slice(q + 1).split('#')[0].split('&')) if (kv.length > 0) { const e = kv.indexOf('='); out.push(e < 0 ? kv : kv.slice(0, e) + ' = ' + decodeURIComponent(kv.slice(e + 1))); }
  return out;
}
/** A JSON value as the lines of a tree: `key: value`, objects and arrays as `key: {n}` / `[n]` followed by their members (folded ones left out). */
export function jsonLines(v: any, key: string, depth: i32, path: string, folded: Set<string>, out: string[], paths: string[]): void {
  const pad = '  '.repeat(depth), name = key.length > 0 ? key + ': ' : '';
  if (v === null) { out.push(pad + name + 'null'); paths.push(''); return; }
  if (Array.isArray(v)) {
    const open = !folded.has(path);
    out.push(pad + (open ? '- ' : '+ ') + name + '[' + v.length + ']'); paths.push(path);
    if (open) for (let i = 0; i < v.length; i++) jsonLines(v[i], '' + i, depth + 1, path + '/' + i, folded, out, paths);
    return;
  }
  if (typeof v === 'object') {
    let n = 0;
    for (const k in v) n++;
    const open = !folded.has(path);
    out.push(pad + (open ? '- ' : '+ ') + name + '{' + n + '}'); paths.push(path);
    if (open) for (const k in v) jsonLines(v[k], k, depth + 1, path + '/' + k, folded, out, paths);
    return;
  }
  out.push(pad + name + (typeof v === 'string' ? JSON.stringify(v) : '' + v)); paths.push('');
}

// ---- state
export const [reqs, setReqs] = createSignal<Req[]>([]);
export const [picked, setPicked] = createSignal<string>('');
export const [body, setBody] = createSignal<string>('');
export const [bodyB64, setBodyB64] = createSignal<boolean>(false);
export const [tab, setTab] = createSignal<string>('headers');   // headers | payload | preview | response | timing | messages
export const [kindFilter, setKindFilter] = createSignal<string>('all');
export const [textFilter, setTextFilter] = createSignal<string>('');
export const [statusFilter, setStatusFilter] = createSignal<string>('');
export const [preserve, setPreserve] = createSignal<boolean>(false);
const [image, setImage] = createSignal<i32>(-1);
const [folds, setFolds] = createSignal<i32>(0);   // bumped when the JSON tree folds
const folded = new Set<string>();

export function onNetwork(method: string, params: any): void {
  const l = reqs().slice(0);
  if (applyNetwork(l, method, params)) setReqs(l);
}
/** The program reloaded (hot reload): the log starts over unless it is preserved. */
export function onReload(): void { if (!preserve()) { setReqs([]); setPicked(''); } }
export function clearLog(): void { setReqs([]); setPicked(''); setBody(''); }

/** The status filter: '' all, 'error' failed or >= 400, '2xx'..'5xx', or a status. */
function statusOk(r: Req, f: string): boolean {
  const t = f.trim();
  if (t.length === 0) return true;
  if (t === 'error') return r.error.length > 0 || r.status >= 400;
  if (t.length === 3 && t.endsWith('xx')) return Math.floor(r.status / 100) === parseInt(t.charAt(0));
  return '' + r.status === t;
}
export function shown(): Req[] {
  const k = kindFilter(), t = textFilter().toLowerCase(), s = statusFilter();
  return reqs().filter((r: Req) => (k === 'all' || r.kind() === k) && (t.length === 0 || r.url.toLowerCase().indexOf(t) >= 0) && statusOk(r, s));
}
export function pickedReq(): Req | null { for (const r of reqs()) if (r.id === picked()) return r; return null; }

/** A request selected: its body is read (Network.getResponseBody), an image decoded for the preview. */
export async function pick(r: Req): Promise<void> {
  setPicked(r.id);
  folded.clear();
  if (r.ws()) { setBody(''); return; }
  const b = await call('Network.getResponseBody', `{"requestId":${JSON.stringify(r.id)}}`);
  const t: string = b.body !== undefined ? b.body : '';
  const b64: boolean = b.base64Encoded !== undefined && b.base64Encoded === true;
  setBody(t); setBodyB64(b64);
  if (image() >= 0) { destroyImage(image()); setImage(-1); }
  if (r.mime.startsWith('image/') && t.length > 0) setImage(imageFromBytes(b64 ? base64Decode(t) : sys.utf8Encode(t)));
  if (r.hasPost && r.postData.length === 0) {
    const p = await call('Network.getRequestPostData', `{"requestId":${JSON.stringify(r.id)}}`);
    if (p.postData !== undefined) r.postData = p.postData;
  }
}
/** The whole log as a HAR 1.2 file (Zinc.getHar); its path, '' when the program has no log. */
export async function exportHar(path: string): Promise<string> {
  const h = await call('Zinc.getHar', '{}');
  if (h.log === undefined) { setStatus('this program has no network log to export'); return ''; }
  writeText(path, JSON.stringify(h));
  setStatus('HAR written to ' + path);
  return path;
}
export function harPath(): string {
  const e = sys.env('ZINC_INSPECTOR_HAR');
  return e !== '' ? e : sys.env('HOME') + '/Downloads/zinc-' + Math.round(Date.now() / 1000) + '.har';
}

// ---- the views
function size(n: i32): string { return n < 1024 ? n + ' B' : n < 1048576 ? (Math.round(n / 102.4) / 10) + ' kB' : (Math.round(n / 104857.6) / 10) + ' MB'; }
function waterfallSpan(): number[] {   // the earliest start and the latest end of the requests shown, in s
  let a = -1, b = -1;
  for (const r of shown()) { if (r.start > 0 && (a < 0 || r.start < a)) a = r.start; const e = r.end >= 0 ? r.end : r.start; if (e > b) b = e; }
  return [a, Math.max(b, a + 0.001)];
}
function NetRow(p: { r: Req }): i32 {
  const span = waterfallSpan(), W = 120;
  const x = p.r.start > 0 ? Math.round((p.r.start - span[0]) / (span[1] - span[0]) * W) : 0;
  const w = p.r.end >= 0 && p.r.start > 0 ? Math.max(2, Math.round((p.r.end - p.r.start) / (span[1] - span[0]) * W)) : 2;
  const bad = p.r.error.length > 0 || p.r.status >= 400;
  return <Button className={'py-0.5 flex-row items-center justify-start h-5 px-2 gap-2 ' + (picked() === p.r.id ? 'bg-sky-100' : 'bg-white')} onClick={() => { pick(p.r); }}>
    <Text className={'w-40 text-xs font-mono ' + (bad ? 'text-red-700' : 'text-slate-900')}>{p.r.name()}</Text>
    <Text className={'w-12 text-xs font-mono ' + (bad ? 'text-red-700' : 'text-slate-700')}>{p.r.error.length > 0 ? '(failed)' : p.r.status > 0 ? '' + p.r.status : '…'}</Text>
    <Text className="w-12 text-xs text-slate-600">{p.r.method}</Text>
    <Text className="w-12 text-xs text-slate-600">{p.r.kind()}</Text>
    <Text className="w-16 text-xs font-mono text-slate-600">{p.r.ws() ? p.r.frames.length + ' msg' : size(p.r.transferred)}</Text>
    <Text className="w-14 text-xs font-mono text-slate-600">{p.r.ms() >= 0 ? p.r.ms() + ' ms' : 'pending'}</Text>
    <View className="w-32 h-3 flex-row bg-slate-50"><View style={{ width: x }} /><View className={'h-3 ' + (bad ? 'bg-red-400' : 'bg-sky-500')} style={{ width: w }} /></View>
  </Button>;
}
function Lines(p: { lines: string[] }): i32 { return <View className="flex-col">{p.lines.map((l: string) => <Mono text={l} color="text-slate-800" />)}</View>; }
function headerLines(h: string[]): string[] { const out: string[] = []; for (let i = 0; i + 1 < h.length; i += 2) out.push(h[i] + ': ' + h[i + 1]); return out; }
/** The phases of the timing tab, those the host measured, with a bar each (100 px for the longest). */
export function timingLines(r: Req): string[] {
  const out: string[] = [];
  const add = (name: string, v: number): void => { if (v >= 0) out.push(name + ' ' + (Math.round(v * 10) / 10) + ' ms'); };
  add('DNS lookup', r.dns); add('Initial connection', r.connect); add('SSL', r.tls); add('Request sent', r.send); add('Waiting for server response', r.wait); add('Content download', r.download);
  return out;
}
/** The request picked; mounted again when it, its body, the tab or a fold changes (its props read them). */
function Detail(p: { q: Req; body: string; tab: string; folds: i32 }): i32 {
  const q = p.q;
  let json: any = null, isJson = false;
  if (!bodyB64() && (q.mime.indexOf('json') >= 0 || body().startsWith('{') || body().startsWith('['))) { try { json = JSON.parse(body()); isJson = true; } catch (e) { isJson = false; } }
  const jl: string[] = [], jp: string[] = [];
  if (isJson) jsonLines(json, '', 0, '', folded, jl, jp);
  return <View className="flex-col flex-1">
    <View className="flex-row flex-wrap items-center gap-1 px-1 border-b">
      {['headers', 'payload', 'preview', 'response', 'timing'].concat(q.ws() ? ['messages'] : []).map((t: string) => <Flat label={t} on={tab() === t} onClick={() => { setTab(t); }} />)}
      <Flat label="Copy as cURL" on={false} onClick={() => { setClipboardText(curlOf(q)); setStatus('copied as cURL'); }} />
    </View>
    <ScrollView className="flex-1">
      <View className="flex-col gap-1 p-2">
        {tab() === 'headers' ? <View className="flex-col gap-1">
          <Mono text={'Request URL: ' + q.url} color="text-slate-900" />
          <Mono text={'Request Method: ' + q.method} color="text-slate-900" />
          <Mono text={'Status Code: ' + (q.error.length > 0 ? q.error : q.status + ' ' + q.statusText)} color="text-slate-900" />
          <Text className="text-xs font-medium text-slate-600">Response Headers</Text><Lines lines={headerLines(q.resHeaders)} />
          <Text className="text-xs font-medium text-slate-600">Request Headers</Text><Lines lines={headerLines(q.reqHeaders)} />
        </View> : tab() === 'payload' ? <View className="flex-col gap-1">
          <Text className="text-xs font-medium text-slate-600">Query String Parameters</Text><Lines lines={queryLines(q.url)} />
          <Text className="text-xs font-medium text-slate-600">Request Payload</Text><Mono text={q.postData} color="text-slate-800" />
        </View> : tab() === 'preview' ? (image() >= 0 ? <Canvas className="h-64" onDraw={(x: i32, y: i32, w: i32, h: i32) => {
          rect(x, y, w, h, 0xf1f5f9);
          const iw = imageWidth(image()), ih = imageHeight(image()), k = Math.min(1, Math.min(w / Math.max(1, iw), h / Math.max(1, ih)));
          drawImage(image(), x, y, iw * k, ih * k, 255, 0);
        }} /> : isJson ? <View className="flex-col">{jl.map((l: string, i: i32) => <Button className="min-h-4 flex-row items-center justify-start bg-white" onClick={() => {
          if (jp[i].length > 0 || i === 0) { if (folded.has(jp[i])) folded.delete(jp[i]); else folded.add(jp[i]); setFolds(folds() + 1); }
        }}><Mono text={l} color="text-slate-800" /></Button>)}</View> : <Mono text={bodyB64() ? '(binary, ' + body().length + ' base64 characters)' : body()} color="text-slate-800" />)
        : tab() === 'response' ? <Mono text={body()} color="text-slate-800" />
        : tab() === 'timing' ? <Lines lines={timingLines(q)} />
        : <View className="flex-col">{q.frames.map((f: WsFrame) => <Mono text={f.text()} color={f.sent ? 'text-emerald-800' : 'text-slate-800'} />)}</View>}
      </View>
    </ScrollView>
  </View>;
}
export function NetworkView(): i32 {
  return <View className="flex-col flex-1 min-h-0">
    <View className="flex-row flex-wrap items-center gap-1 px-2 py-1 border-b">
      <Btn label="Clear" onClick={() => { clearLog(); }} />
      <Toggle label="Preserve log" on={preserve()} onClick={() => { setPreserve(!preserve()); }} />
      <Field value={textFilter} width="w-40" onInput={(v: string) => { setTextFilter(v); }} onChange={(v: string) => {}} />
      {['all', 'fetch', 'js', 'img', 'media', 'ws', 'other'].map((k: string) => <Flat label={k} on={kindFilter() === k} onClick={() => { setKindFilter(k); }} />)}
      <Field value={statusFilter} width="w-16" onInput={(v: string) => { setStatusFilter(v); }} onChange={(v: string) => {}} />
      <Btn label="Export HAR" onClick={() => { exportHar(harPath()); }} />
      <Text className="text-xs text-slate-500">{shown().length + ' / ' + reqs().length + ' requests'}</Text>
    </View>
    <ScrollView className="h-48 border-b overflow-auto">
      <View className="flex-col">{shown().map((r: Req) => <NetRow r={r} />)}</View>
    </ScrollView>
    {pickedReq() !== null ? <Detail q={pickedReq() as Req} body={body()} tab={tab()} folds={folds()} /> : <Text className="p-2 text-xs text-slate-500">Select a request</Text>}
  </View>;
}

/** ZINC_INSPECTOR_DUMP: the requests, the first one's details, the filters and the HAR export, as text. */
export async function dumpNetwork(): Promise<void> {
  console.log('network:');
  for (const r of reqs()) console.log('  ' + r.line().replace(/[0-9]+ ms/, 'N ms'));   // the time varies: its unit only
  const http = reqs().filter((x: Req) => !x.ws());
  if (http.length === 0) return;
  const r = http[0];
  await pick(r);
  console.log('body: ' + body());
  console.log('payload: ' + r.postData);
  console.log('request headers: ' + headerLines(r.reqHeaders).filter((h: string) => h.toLowerCase().startsWith('content-type')).join(', '));
  console.log('response headers: ' + (r.resHeaders.length > 0) + ', mime ' + r.mime + ', size ' + r.size);
  console.log('timing: ' + timingLines(r).map((l: string) => l.slice(0, l.lastIndexOf(' ', l.length - 4))).join(', '));
  const jl: string[] = [], jp: string[] = [];
  jsonLines(JSON.parse(body()), '', 0, '', new Set<string>(), jl, jp);
  console.log('preview: ' + jl.map((l: string) => l.trim()).join(' | '));
  console.log('curl: ' + curlOf(r));
  setStatusFilter('5xx'); console.log('filter 5xx: ' + shown().length);
  setStatusFilter('2xx'); console.log('filter 2xx: ' + shown().length);
  setStatusFilter(''); setKindFilter('ws'); console.log('filter ws: ' + shown().length);
  for (const w of shown()) console.log('ws: ' + w.url.slice(w.url.lastIndexOf('/')) + ' ' + w.status + ' ' + w.frames.map((f: WsFrame) => f.text()).join(', '));
  setKindFilter('all'); setTextFilter('echo'); console.log('filter echo: ' + shown().length);
  setTextFilter('');
  const path = await exportHar(harPath());
  console.log('har: ' + (path.length > 0 ? path.slice(path.lastIndexOf('/') + 1) : 'none'));
}
