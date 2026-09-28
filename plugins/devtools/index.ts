// zinc:devtools — the zinc:ui tree in Chrome DevTools (docs/dev-mode.md). `zinc dev` adds this module to UI
// programs; elsewhere `import 'zinc:devtools'` opts in. A subset of the DevTools protocol: DOM (tree, attributes,
// class edits), CSS computed style (layout values), Overlay highlight, Runtime console, Page frame tree and
// screenshots (the native frame, captured by the runtime), Tracing (frame phases for the Performance panel). Unknown
// methods get an empty result so the frontend never waits.
import Cdp from './native/cdp.spec';
import { inspectRoot, inspectNode, inspectHighlight, inspectPick, inspectState, componentName, parentOf, setClass, TAG_NAMES, TEXT, UiNode, Handlers } from 'zinc:ui';
import { width, height } from 'zinc:gfx';

const DOC: i32 = 900000000, TEXT_BASE: i32 = 500000000, FRAGMENT: i32 = 6;

function q(s: string): string { return JSON.stringify(s); }
function cls(n: UiNode): string { return n.cls === '\u0000' ? '' : n.cls; }
function hex(c: i32): string {
  if (c < 0) return 'transparent';
  const d = '0123456789abcdef';
  let s = '';
  for (let i = 20; i >= 0; i -= 4) s += d.at((c >> i) & 15);
  return '#' + s;
}
/** Handle of a DevTools node id (element ids are handle + 1), -1 for the document or unknown ids. */
function handleOf(id: i32): i32 { return id >= TEXT_BASE ? (id >= DOC ? -1 : id - TEXT_BASE) : id - 1; }

/** A fragment that is not a component's wrapper (grouped children, dynamic slots): not shown, its children are. */
function plain(h: i32, n: UiNode): boolean { return n.tag === FRAGMENT && componentName(h).length === 0; }
/** Events the node listens to, as DOM names ("click pointerdown drag"). */
function listeners(n: UiNode): string {
  const s: string[] = [];
  if (n.onClick !== null) s.push('click');
  if (n.hs !== null) {
    const e = n.hs as Handlers;
    if (e.down !== null) s.push('pointerdown');
    if (e.move !== null) s.push('pointermove');
    if (e.up !== null) s.push('pointerup');
    if (e.dbl !== null) s.push('dblclick');
    if (e.ctx !== null) s.push('contextmenu');
    if (e.wheel !== null) s.push('wheel');
    if (e.enter !== null) s.push('pointerenter');
    if (e.leave !== null) s.push('pointerleave');
    if (e.key !== null) s.push('keydown');
    if (e.tap !== null) s.push('tap');
    if (e.long !== null) s.push('longpress');
    if (e.drag !== null) s.push('drag');
    if (e.pinch !== null) s.push('pinch');
  }
  return s.join(' ');
}
/** The element's attributes as [name, value] pairs: class, layout, then hidden / state / on when they apply. */
function attrs(h: i32, n: UiNode): string[] {
  const a = ['class', cls(n), 'layout', `${Math.round(n.x)},${Math.round(n.y)} ${Math.round(n.lw)}x${Math.round(n.lh)}`];
  if (n.hidden) { a.push('hidden'); a.push(''); }
  const st = inspectState(h), on = listeners(n);
  if (st.length > 0) { a.push('state'); a.push(st); }
  if (on.length > 0) { a.push('on'); a.push(on); }
  return a;
}
function children(h: i32, n: UiNode): string[] {
  const kids: string[] = [];
  if (n.tag === TEXT && n.text.length > 0)
    kids.push(`{"nodeId":${TEXT_BASE + h},"backendNodeId":${TEXT_BASE + h},"nodeType":3,"nodeName":"#text","localName":"","nodeValue":${q(n.text)}}`);
  for (const c of n.children) {
    const cn = inspectNode(c);
    if (cn !== null && plain(c, cn)) { for (const k of children(c, cn)) kids.push(k); continue; }
    const e = element(c);
    if (e.length > 0) kids.push(e);
  }
  return kids;
}
function element(h: i32): string {
  const n = inspectNode(h);
  if (n === null) return '';
  const kids = children(h, n);
  const comp = componentName(h);  // a component's wrapper shows as <Card>, its host nodes as <view>, <text>...
  const tag = comp.length > 0 ? comp : TAG_NAMES[n.tag];
  return `{"nodeId":${h + 1},"backendNodeId":${h + 1},"nodeType":1,"nodeName":${q(comp.length > 0 ? tag : tag.toUpperCase())},"localName":${q(tag)},"nodeValue":"",` +
    `"childNodeCount":${kids.length},"children":[${kids.join(',')}],"attributes":[${attrs(h, n).map((v: string) => q(v)).join(',')}]}`;
}
function documentNode(): string {
  const root = element(inspectRoot());
  return `{"nodeId":${DOC},"backendNodeId":${DOC},"nodeType":9,"nodeName":"#document","localName":"","nodeValue":"","childNodeCount":${root.length > 0 ? 1 : 0},` +
    `"children":[${root}],"documentURL":"zinc://app","baseURL":"zinc://app","xmlVersion":""}`;
}
function style(n: UiNode): string {
  const px = (v: number): string => `${Math.round(v)}px`;
  const props: string[][] = [
    ['display', n.hidden ? 'none' : 'flex'], ['flex-direction', n.row ? 'row' : 'column'], ['position', n.abs ? 'absolute' : 'relative'],
    ['left', px(n.x)], ['top', px(n.y)], ['width', px(n.lw)], ['height', px(n.lh)],
    ['padding', `${n.pt}px ${n.pr}px ${n.pb}px ${n.pl}px`], ['margin', `${n.mt}px ${n.mr}px ${n.mb}px ${n.ml}px`], ['gap', px(n.gap)],
    ['flex-grow', `${n.grow}`], ['background-color', hex(n.bg)], ['color', hex(n.fg)], ['font-size', px(n.size)],
    ['font-weight', n.bold ? 'bold' : 'normal'], ['border-radius', px(n.radius)], ['border-width', px(n.borderW < 0 ? 1 : n.borderW)], ['opacity', `${n.opacity}`],
  ];
  return props.map((p: string[]) => `{"name":${q(p[0])},"value":${q(p[1])}}`).join(',');
}
function boxModel(n: UiNode): string {
  const quad = (x: number, y: number, w: number, h: number): string => `[${x},${y},${x + w},${y},${x + w},${y + h},${x},${y + h}]`;
  const x = Math.round(n.x), y = Math.round(n.y), w = Math.round(n.lw), h = Math.round(n.lh);
  const content = quad(x + n.pl, y + n.pt, w - n.pl - n.pr, h - n.pt - n.pb), border = quad(x, y, w, h);
  return `{"model":{"content":${content},"padding":${border},"border":${border},"margin":${quad(x - n.ml, y - n.mt, w + n.ml + n.mr, h + n.mt + n.mb)},"width":${w},"height":${h}}}`;
}
/** Value of class="..." in a setAttributesAsText edit. */
function classFromText(text: string): string {
  const i = text.indexOf('class="');
  if (i < 0) return text;
  const rest = text.slice(i + 7);
  const j = rest.indexOf('"');
  return j < 0 ? rest : rest.slice(0, j);
}

// Inspect mode: hovering the app highlights the node in Elements, a click selects it there (and ends the mode).
let picked: i32 = -1;
function onPick(hit: i32, pressed: boolean): void {
  let h = hit;
  for (let n = inspectNode(h); n !== null && plain(h, n); n = inspectNode(h)) h = parentOf(h);  // the node Elements shows
  if (h < 0) return;
  if (pressed) {
    inspectPick(null);
    Cdp.send(-1, `{"method":"Overlay.inspectNodeRequested","params":{"backendNodeId":${h + 1}}}`);
  } else if (h !== picked) Cdp.send(-1, `{"method":"Overlay.nodeHighlightRequested","params":{"nodeId":${h + 1}}}`);
  picked = h;
}

function handle(client: i32, msg: string): void {
  const id = Cdp.num(msg, 'id'), method = Cdp.str(msg, 'method');
  const nid = Cdp.num(msg, 'nodeId');
  const nodeId: i32 = Math.round(nid !== 0 ? nid : Cdp.num(msg, 'backendNodeId'));
  const h = handleOf(nodeId);
  const n = inspectNode(h);
  let result = '{}';
  if (method === 'DOM.getDocument') { result = `{"root":${documentNode()}}`; snaps.clear(); shownRoot = inspectRoot(); remember(inspectRoot()); }
  else if (method === 'DOM.requestChildNodes' && n !== null) {
    Cdp.send(client, `{"method":"DOM.setChildNodes","params":{"parentId":${nodeId},"nodes":[${children(h, n).join(',')}]}}`);
  } else if ((method === 'DOM.setAttributeValue' || method === 'DOM.setAttributesAsText') && n !== null) {
    const name = Cdp.str(msg, 'name');
    if (name === 'class' || method === 'DOM.setAttributesAsText') {
      const v = method === 'DOM.setAttributeValue' ? Cdp.str(msg, 'value') : classFromText(Cdp.str(msg, 'text'));
      setClass(h, v);
      Cdp.send(-1, `{"method":"DOM.attributeModified","params":{"nodeId":${nodeId},"name":"class","value":${q(v)}}}`);
    }
  } else if (method === 'DOM.pushNodesByBackendIdsToFrontend') {
    result = `{"nodeIds":[${Math.round(Cdp.num(msg, 'backendNodeIds'))}]}`;
  } else if (method === 'DOM.getBoxModel' && n !== null) result = boxModel(n);
  else if (method === 'CSS.getComputedStyleForNode' && n !== null) result = `{"computedStyle":[${style(n)}]}`;
  else if (method === 'CSS.getMatchedStylesForNode') result = '{"matchedCSSRules":[],"pseudoElements":[],"inherited":[],"cssKeyframesRules":[]}';
  else if (method === 'Overlay.highlightNode') inspectHighlight(n !== null ? h : -1);
  else if (method === 'Overlay.setInspectMode') { picked = -1; inspectPick(Cdp.str(msg, 'mode') === 'searchForNode' ? onPick : null); }
  else if (method === 'Overlay.hideHighlight' || method === 'DOM.hideHighlight') inspectHighlight(-1);
  else if (method === 'Page.getResourceTree')
    result = '{"frameTree":{"frame":{"id":"main","loaderId":"zinc","url":"zinc://app","domainAndRegistry":"","securityOrigin":"zinc://app","mimeType":"text/html","secureContextType":"Secure","crossOriginIsolatedContextType":"NotIsolated","gatedAPIFeatures":[]},"resources":[]}}';
  else if (method === 'Runtime.enable')
    Cdp.send(client, '{"method":"Runtime.executionContextCreated","params":{"context":{"id":1,"origin":"zinc://app","name":"zinc","uniqueId":"zinc-1","auxData":{"isDefault":true,"type":"default","frameId":"main"}}}}');
  else if (method === 'Page.captureScreenshot') result = `{"data":"${Cdp.screenshot(0, 0)}"}`;  // PNG of the frame on screen
  else if (method === 'Page.startScreencast') { cast = client; castW = Math.round(Cdp.num(msg, 'maxWidth')); castH = Math.round(Cdp.num(msg, 'maxHeight')); castReady = true; castLast = ''; }
  else if (method === 'Page.stopScreencast') cast = -1;
  else if (method === 'Page.screencastFrameAck') castReady = true;
  else if (method === 'Tracing.start') Cdp.trace(true);   // the Performance panel: frame phases and raster bands
  else if (method === 'Tracing.end') {
    Cdp.send(client, `{"id":${id},"result":{}}`);
    Cdp.send(client, `{"method":"Tracing.dataCollected","params":{"value":${Cdp.trace(false)}}}`);
    Cdp.send(client, '{"method":"Tracing.tracingComplete","params":{"dataLossOccurred":false}}');
    return;
  }
  else if (method === 'Runtime.evaluate') result = '{"result":{"type":"string","value":"zinc: no JavaScript engine on the device (the console shows the program output)"}}';
  Cdp.send(client, `{"id":${id},"result":${result}}`);
}

// Live tree, like a web page's: 10 times a second the shown tree is compared with what the frontend has, and the
// differences go out as DOM mutations (nodes inserted / removed, attributes modified / removed, text changed), so
// Elements follows navigation and interaction without collapsing (Chrome flashes the changed attributes).
class Snap { attrs: string[] = []; kids: i32[] = []; text: string = ''; }
const snaps = new Map<i32, Snap>();  // by DevTools node id: what the frontend was sent
/** DevTools ids of the children Elements shows (the text of a text node, then elements; plain fragments flattened). */
function kidIds(h: i32, n: UiNode, out: i32[]): i32[] {
  if (n.tag === TEXT && n.text.length > 0) out.push(TEXT_BASE + h);
  for (const c of n.children) {
    const cn = inspectNode(c);
    if (cn === null) continue;
    if (plain(c, cn)) kidIds(c, cn, out); else out.push(c + 1);
  }
  return out;
}
function nodeJson(id: i32): string {
  if (id < TEXT_BASE) return element(id - 1);
  const n = inspectNode(id - TEXT_BASE);
  return `{"nodeId":${id},"backendNodeId":${id},"nodeType":3,"nodeName":"#text","localName":"","nodeValue":${q(n !== null ? n.text : '')}}`;
}
/** Records element h and its subtree as sent. */
function remember(h: i32): void {
  const n = inspectNode(h);
  if (n === null) return;
  const s = new Snap();
  s.attrs = attrs(h, n); s.kids = kidIds(h, n, []); s.text = n.text;
  snaps.set(h + 1, s);
  for (const k of s.kids) if (k < TEXT_BASE) remember(k - 1);
}
function forget(id: i32): void {
  const s = snaps.get(id);
  if (s === undefined) return;
  snaps.delete(id);
  for (const k of s.kids) if (k < TEXT_BASE) forget(k);
}
function attrValue(a: string[], name: string): string | null {
  for (let i = 0; i < a.length; i += 2) if (a[i] === name) return a[i + 1];
  return null;
}
function sync(h: i32, out: string[]): void {
  const n = inspectNode(h), id = h + 1;
  const s = snaps.get(id);
  if (n === null || s === undefined) return;
  const a = attrs(h, n);
  for (const name of ['class', 'hidden', 'state', 'on']) {  // layout changes every animated frame: read on selection
    const was = attrValue(s.attrs, name), now = attrValue(a, name);
    if (now !== null && now !== was) out.push(`{"method":"DOM.attributeModified","params":{"nodeId":${id},"name":${q(name)},"value":${q(now as string)}}}`);
    else if (now === null && was !== null) out.push(`{"method":"DOM.attributeRemoved","params":{"nodeId":${id},"name":${q(name)}}}`);
  }
  s.attrs = a;
  if (n.tag === TEXT && n.text !== s.text && n.text.length > 0 && s.text.length > 0)
    out.push(`{"method":"DOM.characterDataModified","params":{"nodeId":${TEXT_BASE + h},"characterData":${q(n.text)}}}`);
  s.text = n.text;
  const now = kidIds(h, n, []);
  let same = now.length === s.kids.length;
  for (let i = 0; same && i < now.length; i++) same = now[i] === s.kids[i];
  if (!same) {
    // kept children in the same order stay; the others are removed, then the new ones inserted after their neighbour
    const kept: i32[] = [];
    for (const k of s.kids) if (now.includes(k)) kept.push(k);
    let j = 0;
    const stay: i32[] = [];
    for (const k of now) if (j < kept.length && kept[j] === k) { stay.push(k); j++; }
    for (const k of s.kids) if (!stay.includes(k)) {
      out.push(`{"method":"DOM.childNodeRemoved","params":{"parentNodeId":${id},"nodeId":${k}}}`);
      forget(k);
    }
    let prev: i32 = 0;
    for (const k of now) {
      if (!stay.includes(k)) {
        out.push(`{"method":"DOM.childNodeInserted","params":{"parentNodeId":${id},"previousNodeId":${prev},"node":${nodeJson(k)}}}`);
        if (k < TEXT_BASE) remember(k - 1);
      }
      prev = k;
    }
    s.kids = now;
  }
  for (const k of s.kids) if (k < TEXT_BASE) sync(k - 1, out);
}
// Screencast (the page view next to the panels): the frame on screen, shrunk to the size the frontend asks for, sent
// when it changed and the previous one was acknowledged.
let cast: i32 = -1, castW: i32 = 0, castH: i32 = 0, castReady = true, castLast = '', castSession: i32 = 0;
setInterval(() => {
  if (cast < 0 || !castReady) return;
  if (Cdp.clients() === 0) { cast = -1; return; }
  const png = Cdp.screenshot(castW, castH);
  if (png.length === 0 || png === castLast) return;
  castLast = png; castReady = false; castSession++;
  Cdp.send(cast, `{"method":"Page.screencastFrame","params":{"data":"${png}","sessionId":${castSession},"metadata":{"offsetTop":0,"pageScaleFactor":1,` +
    `"deviceWidth":${width()},"deviceHeight":${height()},"scrollOffsetX":0,"scrollOffsetY":0,"timestamp":${Date.now() / 1000}}}}`);
}, 100);

Cdp.listen(9229, handle);
let shownRoot: i32 = -1;
setInterval(() => {
  if (Cdp.clients() === 0) { snaps.clear(); return; }
  if (snaps.size === 0) return;  // DOM.getDocument not asked yet
  if (inspectRoot() !== shownRoot) { shownRoot = inspectRoot(); snaps.clear(); Cdp.send(-1, '{"method":"DOM.documentUpdated","params":{}}'); return; }
  const events: string[] = [];
  sync(inspectRoot(), events);
  for (const e of events) Cdp.send(-1, e);
}, 100);
