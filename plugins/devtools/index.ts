// zinc:devtools — the zinc:ui tree in Chrome DevTools (docs/dev-mode.md). `zinc dev` adds this module to UI
// programs; elsewhere `import 'zinc:devtools'` opts in. A subset of the DevTools protocol: DOM (tree, attributes,
// class edits), CSS computed style (layout values), Overlay highlight, Runtime console, Page frame tree and
// screenshots (the native frame, captured by the runtime), Tracing (frame phases for the Performance panel), Network
// (every fetch, WebSocket, MQTT client and outgoing TCP socket of the program, from the host's network log), and the Styles
// panel: classes and style sheets as rules, element.style and the box model edited live with the patch printed to the console
// (ZN-369). Unknown methods get an empty result so the frontend never waits. A program with a zinc:stage scene and no zinc:ui tree shows its
// display tree instead, and a stage drawn in a <Canvas> shows under that Canvas (stage.ts).
import Cdp from './native/cdp.spec';
import { inspectRoot, inspectNode, inspectHighlight, inspectPick, inspectHit, onKey, KeyEvent, inspectState, inspectStyle, classStyle, sheetStyle, componentName, componentSource, componentProps, parentOf, setClass, setText, screenBox, knownClasses, TAG_NAMES, TEXT, UiNode, Handlers } from 'zinc:ui';
import { width, height, pointerX, pointerY, onPausedFrame } from 'zinc:gfx';
import { env } from 'zinc:sys';
import { saveLocation } from 'zinc:hardware';
import { type as osType, release as osRelease, arch as osArch, cpus as osCpus, totalmem, hostname } from 'zinc:os';
import { get as storeGet, set as storeSet, remove as storeRemove, keys as storeKeys } from 'zinc:storage';
import { devDatabases, DevDatabase } from 'zinc:devhooks';
import { DisplayObject } from 'zinc:stage';
import { stageRoot, stageNode, stageDocument, stageUnrendered, stageHighlight, stageBoxModel, stageSet, stageIn, stageId, stageElement, stageReset, stageEvents, stageAttributes, stageCanvases, stageHit, stagePick, stageAttributeEvents, stageTextNode, stageSetText, STAGE_BASE } from './stage';

/** A dev run (zinc dev): the only one where the styles can be edited live; an exported or plain run refuses, with this message. */
const DEV = env('ZINC_DEV') === '1';
const NOT_DEV_STORE = 'changing the storage works in dev runs only (zinc dev): this program was not started by zinc dev, and nothing was changed';
const NOT_DEV = 'live styling works in dev runs only (zinc dev): this program was not started by zinc dev, and nothing was changed';

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
  const src = componentSource(h);   // a component of a dev run: where it is called, its props as written there
  if (src.length > 0) { a.push('source'); a.push(src); a.push('props'); a.push(componentProps(h)); }
  const st = inspectState(h), on = listeners(n), ed = edited(h);
  if (ed !== null) { a.push('style'); a.push(cssText(ed.decls)); }
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
  const s = stageIn(h);   // a zinc:stage scene drawn in this Canvas
  if (s !== null) kids.push(stageElement(s as DisplayObject));
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
  const bw = n.borderW < 0 ? 1 : n.borderW;
  const props: string[][] = [
    ['display', n.hidden ? 'none' : 'flex'], ['flex-direction', n.row ? 'row' : 'column'], ['position', n.abs ? 'absolute' : 'relative'],
    ['left', px(n.x)], ['top', px(n.y)], ['width', px(n.lw)], ['height', px(n.lh)],
    ['padding', `${n.pt}px ${n.pr}px ${n.pb}px ${n.pl}px`], ['margin', `${n.mt}px ${n.mr}px ${n.mb}px ${n.ml}px`], ['gap', px(n.gap)],
    ['padding-top', px(n.pt)], ['padding-right', px(n.pr)], ['padding-bottom', px(n.pb)], ['padding-left', px(n.pl)],   // the box model reads the longhands
    ['margin-top', px(n.mt)], ['margin-right', px(n.mr)], ['margin-bottom', px(n.mb)], ['margin-left', px(n.ml)], ['box-sizing', 'border-box'],
    ['border-top-width', px(bw)], ['border-right-width', px(bw)], ['border-bottom-width', px(bw)], ['border-left-width', px(bw)],
    ['flex-grow', `${n.grow}`], ['background-color', hex(n.bg)], ['color', hex(n.fg)], ['font-size', px(n.size)],
    ['font-weight', `${n.weight > 0 ? n.weight : n.bold ? 700 : 400}`], ['border-radius', px(n.radius)], ['border-width', px(n.borderW < 0 ? 1 : n.borderW)], ['opacity', `${n.opacity}`],
    ['flex-wrap', keyword('flex-wrap', n.wrap ? (n.wrapRev ? 2 : 1) : 0)], ['justify-content', keyword('justify-content', n.justify)], ['align-items', keyword('align-items', n.align)],
    ['line-height', n.leading > 0 ? px(n.leading) : 'normal'], ['letter-spacing', n.letterSpace > -99999 ? px(n.letterSpace) : 'normal'],
    ['text-align', keyword('text-align', n.talign)], ['object-fit', keyword('object-fit', n.im.fit)], ['border-color', hex(n.borderColor)],
  ];
  return props.map((p: string[]) => `{"name":${q(p[0])},"value":${q(p[1])}}`).join(',');
}
/** The box model on the window (through scroll offsets, transforms and layers), as Chrome gives it in page coordinates: the inspector draws it over the screen. */
function boxModel(hd: i32, n: UiNode): string {
  const quad = (x: number, y: number, w: number, h: number): string => `[${x},${y},${x + w},${y},${x + w},${y + h},${x},${y + h}]`;
  const b = screenBox(hd), k = n.lw > 0 ? b[2] / n.lw : 1;
  const x = Math.round(b[0]), y = Math.round(b[1]), w = Math.round(b[2]), h = Math.round(b[3]);
  const content = quad(x + n.pl * k, y + n.pt * k, w - (n.pl + n.pr) * k, h - (n.pt + n.pb) * k), border = quad(x, y, w, h);
  return `{"model":{"content":${content},"padding":${border},"border":${border},"margin":${quad(x - n.ml * k, y - n.mt * k, w + (n.ml + n.mr) * k, h + (n.mt + n.mb) * k)},"width":${w},"height":${h}}}`;
}
/** Value of class="..." in a setAttributesAsText edit. */
function classFromText(text: string): string {
  const i = text.indexOf('class="');
  if (i < 0) return text;
  const rest = text.slice(i + 7);
  const j = rest.indexOf('"');
  return j < 0 ? rest : rest.slice(0, j);
}

/** The DevTools id of the node under the window point (x, y), 0 for none: the one hit test of DOM.getNodeForLocation (the inspector's Screen
 *  view) and of the pick in the program. Over a zinc:stage scene it is the scene's topmost node there, through its turned box (stage.ts),
 *  whether the scene is drawn alone or in a Canvas. */
function nodeAt(x: number, y: number): i32 {
  if (inspectRoot() < 0) { const r = stageRoot(), o = r !== null ? stageHit(r as DisplayObject, x, y) : null; return o !== null ? stageId(o as DisplayObject) : 0; }
  const hit = inspectHit(x, y), s = stageIn(hit);
  const o = s !== null ? stageHit(s as DisplayObject, x, y) : null;
  if (o !== null) return stageId(o as DisplayObject);
  let h = hit;
  for (let n = inspectNode(h); n !== null && plain(h, n); n = inspectNode(h)) h = parentOf(h);  // the node Elements shows
  return h < 0 ? 0 : h + 1;
}
// The highlight (Overlay.highlightNode, the pick's hover): drawn by the program into its frame, except while the inspector streams the screen,
// which draws it over the frames it shows (from DOM.getBoxModel), as Chrome's device view does: the frames never carry it.
let lit: i32 = 0;
function light(id: i32): void {
  lit = id;
  const o = cast < 0 ? stageNode(id) : null, h = handleOf(id), n = inspectNode(h);
  stageHighlight(o);   // a scene's node: its own turned box
  inspectHighlight(cast < 0 && o === null && n !== null ? h : -1, cast < 0 && o === null && n !== null ? tipOf(h, n as UiNode) : '');
}
/** The overlay's tooltip for zinc:ui node h, as Chrome's: its component, tag and classes (shortened), its size; a text's font and colour. */
function tipOf(h: i32, n: UiNode): string {
  let p = h;
  while (p >= 0 && componentName(p).length === 0) p = parentOf(p);
  const tag = TAG_NAMES[n.tag], c = cls(n).split(' ').filter((t: string) => t.length > 0).join('.'), b = screenBox(h);
  let head = (p >= 0 ? `<${componentName(p)}> ` : '') + tag.charAt(0).toUpperCase() + tag.slice(1) + (c.length > 0 ? '.' + c : '');
  if (head.length > 64) head = head.slice(0, 63) + '…';
  const t = `${head}  ${Math.round(b[2])} × ${Math.round(b[3])}`;
  return n.tag !== TEXT ? t : t + `\nfont ${Math.round(n.size)}px ${n.weight > 0 ? n.weight : n.bold ? 700 : 400} · color ${hex(n.fg)}`;
}
/** The node Elements shows `up` levels above node id (ArrowUp while picking: the parent the pointer cannot reach), id itself for 0. */
function above(id: i32, up: i32): i32 {
  let at = id;
  for (let k = 0; k < up; k++) {
    const o = stageNode(at);
    if (o !== null) { const pa = (o as DisplayObject).parent; if (pa === null) break; at = stageId(pa as DisplayObject); continue; }
    let h = parentOf(handleOf(at));
    for (let n = inspectNode(h); n !== null && plain(h, n); n = inspectNode(h)) h = parentOf(h);
    if (h < 0) break;
    at = h + 1;
  }
  return at;
}
// Inspect mode (the inspector's arrow, or Cmd/Ctrl+Shift+C in the program of a dev run): hovering the app highlights the node, a click
// selects it in Elements and ends the mode, and reaches nothing in the app; Escape or the shortcut again ends it. A scene drawn alone runs
// its own pick mode (stage.ts), zinc:ui runs it otherwise.
let picked: i32 = 0;
function onPicked(id: i32, pressed: boolean): void {
  if (pressed) {
    inspectPick(null);
    stagePick(null);
    light(0);
    if (id > 0) Cdp.send(-1, `{"method":"Overlay.inspectNodeRequested","params":{"backendNodeId":${id}}}`);
    return;
  }
  light(id);
  if (id !== picked && id > 0) Cdp.send(-1, `{"method":"Overlay.nodeHighlightRequested","params":{"nodeId":${id}}}`);
  picked = id;
}
let pickBase: i32 = 0, pickUp: i32 = 0;   // the node under the pointer, and how many levels above it ArrowUp went (back to 0 on another node)
function onPick(x: number, y: number, pressed: boolean): void {
  const at = nodeAt(x, y);
  if (at !== pickBase) { pickBase = at; pickUp = 0; }
  onPicked(at > 0 ? above(at, pickUp) : 0, pressed);
}
function startPick(): void {
  picked = 0; pickBase = 0; pickUp = 0;
  inspectPick(onPick, () => { stagePick(null); light(0); Cdp.send(-1, '{"method":"Overlay.inspectModeCanceled","params":{}}'); },
    (k: string) => { if (k === 'ArrowUp' && above(pickBase, pickUp + 1) !== above(pickBase, pickUp)) pickUp++; else if (k === 'ArrowDown' && pickUp > 0) pickUp--; });
  if (inspectRoot() < 0) stagePick((o: DisplayObject, pressed: boolean) => { onPicked(stageId(o), pressed); });
}
onKey((e: KeyEvent) => { if (DEV && e.primary && e.shift && e.key.toLowerCase() === 'c' && Cdp.clients() > 0) { startPick(); e.preventDefault(); } });

/** A result of the host's network log; `{}` on targets that have none. */
function orEmpty(json: string): string { return json.length > 0 ? json : '{}'; }

/** Zinc.getProgramInfo (the inspector's Info view): the host's part (engine, process, what zinc run said of the program, renderer, frames),
 *  the machine (zinc:os), the window and the resource counters (the baked fonts and images, the runtime's blocks). */
function programInfo(): string {
  const cpus = osCpus();
  return `{"runtime":${orEmpty(Cdp.net(12, ''))},"dev":${DEV},"width":${width()},"height":${height()},"os":${q(osType())},"release":${q(osRelease())},` +
    `"arch":${q(osArch())},"cpu":${q(cpus.length > 0 ? cpus[0].model : '')},"cores":${cpus.length},"memory":${totalmem()},"host":${q(hostname())},` +
    `"resources":${orEmpty(Cdp.resourceStats())}}`;
}

function handle(client: i32, msg: string): void {
  const id = Cdp.num(msg, 'id'), method = Cdp.str(msg, 'method');
  const nid = Cdp.num(msg, 'nodeId');
  const nodeId: i32 = Math.round(nid !== 0 ? nid : Cdp.num(msg, 'backendNodeId'));
  const h = handleOf(nodeId);
  const n = inspectNode(h);
  let result = '{}';
  if (REPAINTS.indexOf(method) >= 0) Cdp.net(23, '');   // paused: the edit (or the highlight) is drawn at the next frame, the clock still stopped
  if (!DEV && (method === 'DOM.setAttributeValue' || method === 'DOM.setAttributesAsText' || method === 'CSS.setStyleTexts' || method === 'DOM.setNodeValue')) {
    Cdp.send(client, `{"id":${id},"error":{"code":-32000,"message":${q(NOT_DEV)}}}`);
    return;
  }
  const pure = inspectRoot() < 0 && stageRoot() !== null;   // a zinc:stage program: its display tree instead (stage.ts)
  if (pure || stageNode(nodeId) !== null || stageTextNode(nodeId) !== null) {   // or a node of a stage drawn in a Canvas, or its text
    const r = stageAnswer(method, nodeId, msg, pure);
    if (r.length > 0) { Cdp.send(client, `{"id":${id},${r}}`); return; }
  }
  if (method === 'DOM.getDocument') { stageReset(); result = `{"root":${documentNode()}}`; snaps.clear(); shownRoot = inspectRoot(); remember(inspectRoot()); }
  else if (method === 'DOM.requestChildNodes' && n !== null) {
    Cdp.send(client, `{"method":"DOM.setChildNodes","params":{"parentId":${nodeId},"nodes":[${children(h, n).join(',')}]}}`);
  } else if ((method === 'DOM.setAttributeValue' || method === 'DOM.setAttributesAsText') && n !== null) {
    const name = Cdp.str(msg, 'name');
    if (name === 'class' || method === 'DOM.setAttributesAsText') {
      const v = method === 'DOM.setAttributeValue' ? Cdp.str(msg, 'value') : classFromText(Cdp.str(msg, 'text'));
      if (wasOf(h) === null) classWas.set(h, new Was(n, cls(n)));
      touch(h);
      setClass(h, v);
      if (msg.indexOf('"preview":true') < 0) printPatch();   // a class previewed while the completion is arrowed through is not a change yet
      Cdp.send(-1, `{"method":"DOM.attributeModified","params":{"nodeId":${nodeId},"name":"class","value":${q(v)}}}`);
    }
  } else if (method === 'DOM.setNodeValue' && n !== null && nodeId >= TEXT_BASE && n.tag === TEXT) {   // a text edited in Elements: shown at once, not written to the source
    const v = Cdp.str(msg, 'value');
    setText(h, v);
    Cdp.send(-1, `{"method":"DOM.characterDataModified","params":{"nodeId":${nodeId},"characterData":${q(v)}}}`);
  } else if (method === 'DOM.pushNodesByBackendIdsToFrontend') {
    result = `{"nodeIds":[${Math.round(Cdp.num(msg, 'backendNodeIds'))}]}`;
  } else if (method === 'DOM.getBoxModel' && n !== null) result = boxModel(h, n);
  else if (method === 'DOM.getNodeForLocation') {
    const at = nodeAt(Cdp.num(msg, 'x'), Cdp.num(msg, 'y'));
    if (at === 0) { Cdp.send(client, `{"id":${id},"error":{"code":-32000,"message":"No node found at given location"}}`); return; }
    result = `{"backendNodeId":${at},"nodeId":${at},"frameId":"main"}`;
  }
  else if (method === 'CSS.getComputedStyleForNode' && n !== null) result = `{"computedStyle":[${style(n)}]}`;
  else if (method === 'CSS.getMatchedStylesForNode') result = n !== null ? matched(h, n) : '{"matchedCSSRules":[],"pseudoElements":[],"inherited":[],"cssKeyframesRules":[]}';
  else if (method === 'CSS.getInlineStylesForNode' && n !== null) result = `{"inlineStyle":${inline(h)}}`;
  else if (method === 'CSS.setStyleTexts') result = setStyleText(Cdp.str(msg, 'styleSheetId'), Cdp.str(msg, 'text'));
  else if (method === 'Overlay.highlightNode') light(n !== null ? nodeId : 0);
  else if (method === 'Overlay.setInspectMode') {
    if (Cdp.str(msg, 'mode') === 'searchForNode') startPick(); else { inspectPick(null); stagePick(null); light(0); }
  }
  else if (method === 'Overlay.hideHighlight' || method === 'DOM.hideHighlight') light(0);
  else if (method === 'Page.getResourceTree')
    result = '{"frameTree":{"frame":{"id":"main","loaderId":"zinc","url":"zinc://app","domainAndRegistry":"","securityOrigin":"zinc://app","mimeType":"text/html","secureContextType":"Secure","crossOriginIsolatedContextType":"NotIsolated","gatedAPIFeatures":[]},"resources":[]}}';
  else if (method === 'Runtime.enable') {
    Cdp.send(client, '{"method":"Runtime.executionContextCreated","params":{"context":{"id":1,"origin":"zinc://app","name":"zinc","uniqueId":"zinc-1","auxData":{"isDefault":true,"type":"default","frameId":"main"}}}}');
    for (const e of Cdp.net(6, '').split('\n')) if (e.length > 0) Cdp.send(client, e);   // Zinc Next: the last console lines (the prototype's host replays its own)
  }
  else if (method === 'Page.captureScreenshot') result = `{"data":"${Cdp.screenshot(0, 0)}"}`;  // PNG of the frame on screen
  else if (method === 'Page.startScreencast') castStart(client, msg);
  else if (method === 'Page.stopScreencast') castStop();
  else if (method === 'Page.screencastFrameAck') castReady = true;
  else if (method === 'Tracing.start') Cdp.trace(true);   // the Performance panel: frame phases and raster bands
  else if (method === 'Tracing.end') {
    Cdp.send(client, `{"id":${id},"result":{}}`);
    Cdp.send(client, `{"method":"Tracing.dataCollected","params":{"value":${Cdp.trace(false)}}}`);
    Cdp.send(client, '{"method":"Tracing.tracingComplete","params":{"dataLossOccurred":false}}');
    return;
  }
  else if (method === 'Network.enable') {   // what the program requested before DevTools attached is sent too, to this client
    const q0 = Cdp.net(1, '');   // the events not sent yet: to the clients already listening (they would get the replay's copy too otherwise)
    if (netOn) for (const e of q0.split('\n')) if (e.length > 0) Cdp.send(-1, e);
    Cdp.send(client, `{"id":${id},"result":{}}`);
    for (const e of Cdp.net(10, '').split('\n')) if (e.length > 0) Cdp.send(client, e);
    netOn = true;
    return;
  }
  else if (method === 'Network.disable') netOn = false;
  else if (method === 'Network.getResponseBody') result = orEmpty(Cdp.net(2, Cdp.str(msg, 'requestId')));
  else if (method === 'Network.getRequestPostData') result = orEmpty(Cdp.net(3, Cdp.str(msg, 'requestId')));
  else if (method === 'Zinc.getResourceStats') result = Cdp.resourceStats();
  else if (method === 'Zinc.getThreads') { const t = Cdp.net(11, ''); result = `{"threads":${t.length > 0 ? t : '[]'}}`; }   // the workers: state, queues, messages, live blocks, CPU
  else if (method === 'Zinc.getInfo') result = `{"dev":${DEV},"width":${width()},"height":${height()}}`;
  else if (method === 'Zinc.getProgramInfo') result = programInfo();
  else if (method === 'Zinc.getUnrendered') result = `{"nodeIds":[${unrendered().join(',')}]}`;
  else if (method === 'DOMStorage.enable') { storeOn = true; storeSnap = storeRead(); }
  else if (method === 'DOMStorage.disable') storeOn = false;
  else if (method === 'DOMStorage.getDOMStorageItems') result = `{"entries":[${storeRead().map((e: string[]) => `[${q(e[0])},${q(e[1])}]`).join(',')}],"location":${q(saveLocation())}}`;   // the store shown: the program's own file
  else if (method === 'DOMStorage.setDOMStorageItem' || method === 'DOMStorage.removeDOMStorageItem' || method === 'DOMStorage.clear') {
    if (!DEV) { Cdp.send(client, `{"id":${id},"error":{"code":-32000,"message":${q(NOT_DEV_STORE)}}}`); return; }
    if (method === 'DOMStorage.setDOMStorageItem') storeSet(Cdp.str(msg, 'key'), Cdp.str(msg, 'value'));
    else if (method === 'DOMStorage.removeDOMStorageItem') storeRemove(Cdp.str(msg, 'key'));
    else for (const k of storeKeys()) storeRemove(k);
  }
  else if (method === 'ZincSqlite.getDatabases') result = `{"databases":[${devDatabases.map((d: DevDatabase) => `{"id":${d.id},"path":${q(d.path)}}`).join(',')}]}`;
  else if (method === 'ZincSqlite.query') {
    const want: i32 = Math.round(Cdp.num(msg, 'databaseId')), write = msg.indexOf('"write":true') >= 0;
    let db: DevDatabase | null = null;
    for (const d of devDatabases) if (d.id === want) db = d;
    if (db === null) result = '{"error":"no such database (it was closed)"}';
    else if (write && !DEV) result = `{"error":${q(NOT_DEV_STORE)}}`;
    else { const max = Cdp.num(msg, 'limit'); result = (db as DevDatabase).query(Cdp.str(msg, 'sql'), max > 0 ? Math.round(max) : 500, write); }
  }
  else if (method === 'Zinc.getHar') result = orEmpty(Cdp.net(9, ''));
  else if (method === 'Zinc.setPaused' || method === 'Zinc.stepFrame' || method === 'Zinc.getPaused') {   // the program paused as a page in Chrome (src/host/gfx_host.cpp)
    if (method === 'Zinc.setPaused') Cdp.net(21, msg.replaceAll(' ', '').indexOf('"paused":true') >= 0 ? '1' : '0');
    if (method === 'Zinc.stepFrame') Cdp.net(22, '');
    pauseSync();
    result = `{"paused":${pausedShown}}`;
  }
  else if (method === 'Zinc.getStylePatch') result = `{"changes":[${changes().map((c: string[]) => `{"where":${q(c[0])},"was":${q(c[1])},"now":${q(c[2])}}`).join(',')}]}`;
  else if (method === 'Zinc.cssProperties') result = cssProperties();
  else if (method === 'Zinc.completeClass') result = `{"classes":[${knownClasses(Cdp.str(msg, 'prefix'), 40).map((c: string) => q(c)).join(',')}]}`;
  else if (method === 'Runtime.evaluate') result = '{"result":{"type":"string","value":"zinc: no JavaScript engine on the device (the console shows the program output)"}}';
  Cdp.send(client, `{"id":${id},"result":${result}}`);
}
/** The answer to a DOM, CSS or Overlay method on the zinc:stage tree ('"result":...' or '"error":...'), '' for the methods it leaves to handle. */
function stageAnswer(method: string, nodeId: i32, msg: string, pure: boolean): string {
  const o = stageNode(nodeId);
  if (pure && method === 'DOM.getDocument') return `"result":{"root":${stageDocument(DOC)}}`;
  if (pure && method === 'Zinc.getUnrendered') return `"result":{"nodeIds":[${stageUnrendered(stageRoot()).join(',')}]}`;
  if (method === 'DOM.pushNodesByBackendIdsToFrontend' || method === 'DOM.getNodeForLocation' || method === 'Overlay.setInspectMode') return '';   // as for zinc:ui
  if (method === 'Overlay.highlightNode') { light(o !== null ? nodeId : 0); return '"result":{}'; }
  if (method === 'DOM.getAttributes' && o !== null) return `"result":${stageAttributes(o as DisplayObject)}`;
  if (method === 'Overlay.hideHighlight' || method === 'DOM.hideHighlight') { light(0); return '"result":{}'; }
  if (method === 'DOM.getBoxModel' && o !== null) return `"result":${stageBoxModel(o as DisplayObject)}`;
  const t = stageTextNode(nodeId);
  if (method === 'DOM.setNodeValue' && t !== null) {   // a TextField's text edited in Elements: shown at once
    const v = Cdp.str(msg, 'value');
    stageSetText(t as DisplayObject, v);
    Cdp.send(-1, `{"method":"DOM.characterDataModified","params":{"nodeId":${nodeId},"characterData":${q(v)}}}`);
    return '"result":{}';
  }
  if (method === 'DOM.setAttributeValue' && o !== null) {
    const why = stageSet(o as DisplayObject, Cdp.str(msg, 'name'), Cdp.str(msg, 'value'));
    return why.length > 0 ? `"error":{"code":-32000,"message":${q(why)}}` : '"result":{}';
  }
  if (method.startsWith('DOM.') || method.startsWith('CSS.') || method.startsWith('Overlay.')) return '"result":{}';   // the rest of the tree's methods: nothing for a scene
  return '';
}

// ---------------------------------------------------------------- what draws (the inspector's "rendered only" filter)
/** The DevTools ids of the top-most elements Elements shows that draw nothing: display none, no size, outside the screen or the clip of a
 *  scroll view or overflow-hidden box (the rows a virtual list keeps beyond its view), a component none of whose children draws. Their
 *  subtrees draw nothing either and are not listed. */
function unrendered(): i32[] {
  const out: i32[] = [];
  const r = inspectRoot(), n = inspectNode(r);
  if (n !== null && !draws(r, n, [0, 0, width(), height()], out)) out.push(r + 1);
  for (const s of stageCanvases()) for (const k of stageUnrendered(s)) out.push(k);   // the stages drawn in a Canvas
  return out;
}
function draws(h: i32, n: UiNode, clip: number[], out: i32[]): boolean {
  if (n.hidden) return false;
  let inner = clip;
  if (n.tag !== FRAGMENT) {
    const b = screenBox(h);
    const x0 = Math.max(b[0], clip[0]), y0 = Math.max(b[1], clip[1]), x1 = Math.min(b[0] + b[2], clip[2]), y1 = Math.min(b[1] + b[3], clip[3]);
    if (b[2] <= 0 || b[3] <= 0 || x1 <= x0 || y1 <= y0) return false;
    if (n.overflow || n.scroll !== 0) inner = [x0, y0, x1, y1];
  }
  const mine: i32[] = [];
  let any = n.tag !== FRAGMENT;   // a component's wrapper draws when one of its children does
  for (const k of kidIds(h, n, [])) {
    if (k >= TEXT_BASE) continue;
    const c = inspectNode(k - 1);
    if (c === null) continue;
    if (draws(k - 1, c, inner, out)) any = true; else mine.push(k);
  }
  if (any) for (const k of mine) out.push(k);
  return any;
}

// ---------------------------------------------------------------- the Styles panel (ZN-369)
// The node's classes, style sheets and style numbers show as read-only rules (what each declares); element.style is the inspector's own
// layer (ui.inspectStyle, applied over them) that the Styles panel and the box model edit; each edit prints to the console the patch to
// paste back: the class string, or the properties to add to the style object, of every node edited in the session.
/** CSS longhand, style key, class prefix, kind: 0 a length in px, 1 a colour, 2 a number, 3 a keyword of CSS_ENUMS. */
const CSS_PROPS: string[][] = [
  ['padding-top', 'paddingTop', 'pt', '0'], ['padding-right', 'paddingRight', 'pr', '0'], ['padding-bottom', 'paddingBottom', 'pb', '0'], ['padding-left', 'paddingLeft', 'pl', '0'],
  ['margin-top', 'marginTop', 'mt', '0'], ['margin-right', 'marginRight', 'mr', '0'], ['margin-bottom', 'marginBottom', 'mb', '0'], ['margin-left', 'marginLeft', 'ml', '0'],
  ['gap', 'gap', 'gap', '0'], ['row-gap', 'rowGap', 'gap-y', '0'], ['column-gap', 'columnGap', 'gap-x', '0'],
  ['width', 'width', 'w', '0'], ['height', 'height', 'h', '0'], ['min-width', 'minWidth', 'min-w', '0'], ['max-width', 'maxWidth', 'max-w', '0'],
  ['min-height', 'minHeight', 'min-h', '0'], ['max-height', 'maxHeight', 'max-h', '0'], ['border-radius', 'borderRadius', 'rounded', '0'],
  ['border-width', 'borderWidth', 'border', '0'], ['font-size', 'fontSize', 'text', '0'],
  ['background-color', 'backgroundColor', 'bg', '1'], ['color', 'color', 'text', '1'], ['border-color', 'borderColor', 'border', '1'], ['opacity', 'opacity', 'opacity', '2'],
  ['line-height', 'lineHeight', 'leading', '0'], ['letter-spacing', 'letterSpacing', 'tracking', '0'], ['flex-grow', 'grow', 'grow', '2'],
  ['flex-direction', 'flexDirection', 'flex', '3'], ['flex-wrap', 'flexWrap', 'flex', '3'], ['justify-content', 'justifyContent', 'justify', '3'],
  ['align-items', 'alignItems', 'items', '3'], ['font-weight', 'fontWeight', 'font', '3'], ['text-align', 'textAlign', 'text', '3'], ['object-fit', 'objectFit', 'object', '3'],
  ['align-self', 'alignSelf', 'self', '3'], ['align-content', 'alignContent', 'content', '3'], ['display', 'hidden', '', '3'], ['position', 'position', '', '3'],
  ['overflow', 'overflow', 'overflow', '3'], ['flex-shrink', 'shrink', 'shrink', '2'],
  ['top', 'top', 'top', '0'], ['right', 'right', 'right', '0'], ['bottom', 'bottom', 'bottom', '0'], ['left', 'left', 'left', '0'],
];
/** The keywords of a kind 3 longhand and their numbers, as the compiler maps them (src/frontend/jsx.cpp kStyleEnums); then each one's class. */
const CSS_ENUMS: string[][] = [
  ['flex-direction', 'column', '0', 'row', '1', 'column-reverse', '2', 'row-reverse', '3'], ['flex-wrap', 'nowrap', '0', 'wrap', '1', 'wrap-reverse', '2'],
  ['justify-content', 'flex-start', '0', 'start', '0', 'center', '1', 'flex-end', '2', 'end', '2', 'space-between', '3', 'space-around', '4', 'space-evenly', '5'],
  ['align-items', 'flex-start', '0', 'start', '0', 'center', '1', 'flex-end', '2', 'end', '2', 'stretch', '3', 'baseline', '4'],
  ['font-weight', 'normal', '400', 'bold', '700', '100', '100', '200', '200', '300', '300', '400', '400', '500', '500', '600', '600', '700', '700', '800', '800', '900', '900'],
  ['text-align', 'left', '0', 'start', '0', 'center', '1', 'right', '2', 'end', '2'],
  ['object-fit', 'fill', '0', 'contain', '1', 'cover', '2', 'none', '3', 'scale-down', '4'],
  ['align-self', 'auto', '-1', 'flex-start', '0', 'center', '1', 'flex-end', '2', 'stretch', '3', 'baseline', '4'],
  ['align-content', 'flex-start', '0', 'center', '1', 'flex-end', '2', 'stretch', '3', 'space-between', '4', 'space-around', '5', 'space-evenly', '6'],
  ['display', 'flex', '0', 'none', '1'], ['position', 'relative', '0', 'absolute', '1'], ['overflow', 'visible', '0', 'hidden', '1', 'scroll', '2'],
];
const WEIGHTS: string[] = ['thin', 'extralight', 'light', 'normal', 'medium', 'semibold', 'bold', 'extrabold', 'black'];
function enumOf(name: string): string[] { for (const e of CSS_ENUMS) if (e[0] === name) return e; return []; }
/** The number of keyword v of longhand `name`, NaN when it has none. */
function enumNumber(name: string, v: string): number { const e = enumOf(name); for (let i = 1; i + 1 < e.length; i += 2) if (e[i] === v) return Number(e[i + 1]); return NaN; }
/** The first keyword of longhand `name` for number k (its computed value). */
function keyword(name: string, k: number): string { const e = enumOf(name); for (let i = 1; i + 1 < e.length; i += 2) if (Number(e[i + 1]) === k) return e[i]; return `${k}`; }
/** The class of a kind 3 declaration: justify-content: space-between is justify-between, font-weight: 600 font-semibold. */
function enumClass(p: string[], v: string): string {
  if (p[0] === 'display') return v === 'none' ? 'hidden' : 'flex';
  if (p[0] === 'position') return v;
  if (p[0] === 'font-weight') return 'font-' + WEIGHTS[Math.round(enumNumber(p[0], v) / 100) - 1];
  if (p[0] === 'flex-direction' || p[0] === 'flex-wrap') return v === 'column' ? 'flex-col' : v === 'column-reverse' ? 'flex-col-reverse' : 'flex-' + v;
  return p[2] + '-' + (v.startsWith('flex-') ? v.slice(5) : v.startsWith('space-') ? v.slice(6) : v);
}
/** Zinc.cssProperties: the properties element.style applies, each with its kind (length, color, number, keyword) and its keywords, for the
 *  inspector's completion (one list: what the engine applies). */
function cssProperties(): string {
  const kinds = ['length', 'color', 'number', 'keyword'], out: string[] = ['{"name":"padding","kind":"length","values":[]}', '{"name":"margin","kind":"length","values":[]}'];
  for (const p of CSS_PROPS) {
    const e = enumOf(p[0]), v: string[] = [];
    for (let i = 1; i + 1 < e.length; i += 2) if (v.indexOf(e[i]) < 0) v.push(e[i]);
    out.push(`{"name":${q(p[0])},"kind":${q(kinds[Math.round(Number(p[3]))])},"values":[${v.map((x: string) => q(x)).join(',')}]}`);
  }
  return `{"properties":[${out.join(',')}]}`;
}
function cssProp(name: string): string[] | null { for (const p of CSS_PROPS) if (p[0] === name) return p; return null; }
/** A length in px: "12px", "12", "1.5em" (em: the node's font size), "1rem" (16px); NaN otherwise. */
function length(v: string, em: number): number {
  const t = v.trim(), u = t.endsWith('rem') ? 3 : t.endsWith('px') || t.endsWith('em') ? 2 : 0, x = t.slice(0, t.length - u);
  if (x.length === 0 || isNaN(Number(x))) return NaN;
  return Number(x) * (u === 3 ? 16 : t.endsWith('em') ? em : 1);
}
/** What 1em is on node n: its font size from its classes, before the inspector's own font-size (which would compound). */
function emOf(n: UiNode): number { return classStyle(n.tag, cls(n)).size; }
/** The fraction of a percent width or height ("50%": 0.5), NaN for anything else. */
function percent(p: string[], v: string): number {
  const t = v.trim();
  if ((p[0] !== 'width' && p[0] !== 'height') || !t.endsWith('%')) return NaN;
  const x = t.slice(0, t.length - 1);
  return x.length > 0 && !isNaN(Number(x)) ? Number(x) / 100 : NaN;
}
/** 0xRRGGBB of #rgb, #rrggbb, #rrggbbaa, rgb() or rgba(); -1 otherwise. */
function colour(v: string): i32 {
  const t = v.toLowerCase();
  if (t.startsWith('#')) {
    let x = t.slice(1);
    if (x.length === 3 || x.length === 4) x = x.charAt(0) + x.charAt(0) + x.charAt(1) + x.charAt(1) + x.charAt(2) + x.charAt(2);
    if (x.length === 8) x = x.slice(0, 6);
    const c = parseInt(x, 16);
    return x.length === 6 && !isNaN(c) ? Math.round(c) : -1;
  }
  const a = t.indexOf('('), b = t.indexOf(')');
  if (!t.startsWith('rgb') || a < 0 || b < a) return -1;
  const p = t.slice(a + 1, b).split('/').join(' ').split(',').join(' ').split(' ').filter((s: string) => s.length > 0);
  if (p.length < 3) return -1;
  let c: i32 = 0;
  for (let i = 0; i < 3; i++) { const k = Number(p[i]); if (isNaN(k)) return -1; c = (c << 8) | Math.max(0, Math.min(255, Math.round(k))); }
  return c;
}
/** The number a longhand's value sets (a colour as 0xRRGGBB), NaN when it is not one. */
function cssNumber(p: string[], v: string, em: number): number {
  if (p[3] === '1') { const c = colour(v); return c < 0 ? NaN : c; }
  if (p[3] === '3') return enumNumber(p[0], v.toLowerCase());
  return p[3] === '0' ? length(v, em) : (v.length > 0 && !isNaN(Number(v)) ? Number(v) : NaN);
}
/** The style keys and numbers declaration name: value sets on a node of font size em (a percent width as widthPercent); false when it sets none. */
function styleOps(name: string, value: string, em: number, keys: string[], vals: number[]): boolean {
  const l = longhands(name, value);
  for (let i = 0; i < l.length; i += 2) {
    const p = cssProp(l[i]);
    if (p === null) return false;
    const f = percent(p as string[], l[i + 1]), v = cssNumber(p as string[], l[i + 1], em);
    if (!isNaN(f)) { keys.push((p as string[])[1] + 'Percent'); vals.push(f); }
    else if (!isNaN(v)) { keys.push((p as string[])[1]); vals.push(v); }
    else return false;
  }
  return true;
}
/** Declarations [name, value, ...] of a style text: comments (disabled properties) and !important left out. */
function parseDecls(text: string): string[] {
  let t = text;
  for (let i = t.indexOf('/*'); i >= 0; i = t.indexOf('/*')) { const j = t.indexOf('*/', i + 2); t = t.slice(0, i) + (j < 0 ? '' : t.slice(j + 2)); }
  const out: string[] = [];
  for (const d of t.split(';')) {
    const c = d.indexOf(':');
    if (c <= 0) continue;
    const name = d.slice(0, c).trim().toLowerCase();
    let value = d.slice(c + 1).trim();
    if (value.endsWith('!important')) value = value.slice(0, value.length - 10).trim();
    if (name.length > 0 && value.length > 0) { out.push(name); out.push(value); }
  }
  return out;
}
/** A declaration as longhands [name, value, ...]: padding and margin with one to four values become their four sides. */
function longhands(name: string, value: string): string[] {
  if (name !== 'padding' && name !== 'margin') return [name, value];
  const v = value.split(' ').filter((s: string) => s.length > 0);
  if (v.length < 1 || v.length > 4) return [name, value];
  const top = v[0], right = v.length > 1 ? v[1] : top, bottom = v.length > 2 ? v[2] : top, left = v.length > 3 ? v[3] : right;
  return [name + '-top', top, name + '-right', right, name + '-bottom', bottom, name + '-left', left];
}
/** Whether a declaration is one the inspector applies. */
function applies(name: string, value: string): boolean { return styleOps(name, value, 16, [], []); }
function cssText(d: string[]): string { const s: string[] = []; for (let i = 0; i < d.length; i += 2) s.push(`${d[i]}: ${d[i + 1]};`); return s.join(' '); }
function range(a: i32, b: i32): string { return `{"startLine":0,"startColumn":${a},"endLine":0,"endColumn":${b}}`; }
/** CSSProperty objects of declarations; with ranges in the text cssText(d) when `ranged`. */
function props(d: string[], ranged: boolean): string {
  const out: string[] = [];
  let at: i32 = 0;
  for (let i = 0; i < d.length; i += 2) {
    const t = `${d[i]}: ${d[i + 1]};`;
    out.push(`{"name":${q(d[i])},"value":${q(d[i + 1])},"implicit":false,"disabled":false,"parsedOk":${applies(d[i], d[i + 1])}` +
      (ranged ? `,"text":${q(t)},"range":${range(at, at + t.length)}` : '') + '}');
    at += t.length + 1;
  }
  return out.join(',');
}
/** What node s declares beyond base, as declarations of the properties CSS_PROPS knows (plus direction and grow). */
function declared(s: UiNode, b: UiNode): string[] {
  const out: string[] = [];
  const len = (name: string, v: number, w: number): void => { if (v !== w) { out.push(name); out.push(`${v}px`); } };
  len('padding-top', s.pt, b.pt); len('padding-right', s.pr, b.pr); len('padding-bottom', s.pb, b.pb); len('padding-left', s.pl, b.pl);
  len('margin-top', s.mt, b.mt); len('margin-right', s.mr, b.mr); len('margin-bottom', s.mb, b.mb); len('margin-left', s.ml, b.ml);
  len('gap', s.gap, b.gap); len('row-gap', s.gapY, b.gapY); len('column-gap', s.gapX, b.gapX);
  if (s.w !== b.w || s.wFrac !== b.wFrac || s.fullW !== b.fullW) { out.push('width'); out.push(s.fullW ? '100%' : s.wFrac > 0 ? `${s.wFrac * 100}%` : `${s.w}px`); }
  if (s.h !== b.h || s.hFrac !== b.hFrac || s.fullH !== b.fullH) { out.push('height'); out.push(s.fullH ? '100%' : s.hFrac > 0 ? `${s.hFrac * 100}%` : `${s.h}px`); }
  len('min-width', s.minW, b.minW); len('max-width', s.maxW, b.maxW); len('min-height', s.minH, b.minH); len('max-height', s.maxH, b.maxH);
  len('border-radius', s.radius, b.radius); len('border-width', s.borderW, b.borderW); len('font-size', s.size, b.size);
  if (s.bg !== b.bg) { out.push('background-color'); out.push(hex(s.bg)); }
  if (s.fg !== b.fg) { out.push('color'); out.push(hex(s.fg)); }
  if (s.borderColor !== b.borderColor) { out.push('border-color'); out.push(hex(s.borderColor)); }
  if (s.opacity !== b.opacity) { out.push('opacity'); out.push(`${s.opacity}`); }
  if (s.row !== b.row) { out.push('flex-direction'); out.push(s.row ? 'row' : 'column'); }
  if (s.grow !== b.grow) { out.push('flex-grow'); out.push(`${s.grow}`); }
  return out;
}
/** The inspector's declarations of a node, kept with the node they were made on (handles are reused). */
class Edited { node: UiNode; decls: string[]; constructor(node: UiNode, decls: string[]) { this.node = node; this.decls = decls; } }
const edits = new Map<i32, Edited>();
const editOrder: i32[] = [];
function edited(h: i32): Edited | null {
  const e = edits.get(h);
  return e !== undefined && inspectNode(h) === e.node ? e : null;
}
/** element.style of node h: editable (a style sheet id and ranges), its text what the inspector set. */
function inline(h: i32): string {
  const e = edited(h), none: string[] = [], d = e !== null ? e.decls : none;
  const text = cssText(d);
  return `{"styleSheetId":"inline:${h + 1}","cssProperties":[${props(d, true)}],"shorthandEntries":[],"cssText":${q(text)},"range":${range(0, text.length)}}`;
}
function rule(selector: string, d: string[]): string {
  return `{"rule":{"selectorList":{"selectors":[{"text":${q(selector)}}],"text":${q(selector)}},"origin":"regular","style":{"cssProperties":[${props(d, false)}],"shorthandEntries":[]}},"matchingSelectors":[0]}`;
}
function matched(h: i32, n: UiNode): string {
  const rules: string[] = [], base = classStyle(n.tag, ''), c = cls(n);
  if (c.length > 0) rules.push(rule('.' + c.split(' ').filter((t: string) => t.length > 0).join('.'), declared(classStyle(n.tag, c), base)));
  if (n.sheetKeys.length > 0) rules.push(rule('style={StyleSheet}', declared(sheetStyle(h, false), base)));
  if (n.styleKeys.length > 0) rules.push(rule('style={numbers}', declared(sheetStyle(h, true), base)));
  return `{"inlineStyle":${inline(h)},"matchedCSSRules":[${rules.join(',')}],"pseudoElements":[],"inherited":[],"cssKeyframesRules":[]}`;
}
/** CSS.setStyleTexts on element.style: the text replaces the inspector's declarations of the node, applied at once. */
function setStyleText(sheet: string, text: string): string {
  const h: i32 = sheet.startsWith('inline:') ? Math.round(Number(sheet.slice(7))) - 1 : -1, n = inspectNode(h);
  if (n === null) return '{"styles":[]}';
  const d = parseDecls(text), keys: string[] = [], vals: number[] = [];
  for (let i = 0; i < d.length; i += 2) {
    const k: string[] = [], v: number[] = [];
    if (styleOps(d[i], d[i + 1], emOf(n), k, v)) for (let j = 0; j < k.length; j++) { keys.push(k[j]); vals.push(v[j]); }
  }
  inspectStyle(h, keys, vals);
  if (d.length === 0) edits.delete(h); else { touch(h); edits.set(h, new Edited(n, d)); }
  printPatch();
  return `{"styles":[${inline(h)}]}`;
}
/** Where node h is: its component (or the nearest one above it) with where that is called, its tag and its DevTools id. */
function label(h: i32, n: UiNode): string {
  let p = h;
  while (p >= 0 && componentName(p).length === 0) p = parentOf(p);
  const src = p >= 0 ? componentSource(p) : '';
  return (p >= 0 ? `<${componentName(p)}> ` + (src.length > 0 ? src + ' ' : '') : '') + `${p === h ? '' : TAG_NAMES[n.tag] + ' '}#${h + 1}`;
}
/** A CSS name as a style object writes it (padding-left: paddingLeft). */
function camel(name: string): string { let out = ''; for (const w of name.split('-')) out += out.length === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1); return out; }
/** The patch of node h in its source's form: style object keys when it has style sheets or numbers, else its class string. */
function patchOf(h: i32, e: Edited): string {
  const n = e.node, keys: string[] = [], toks: string[] = [], set: string[] = [];
  for (let i = 0; i < e.decls.length; i += 2) {
    if (!applies(e.decls[i], e.decls[i + 1])) continue;
    const l = longhands(e.decls[i], e.decls[i + 1]);
    for (let j = 0; j < l.length; j += 2) {
      const p = cssProp(l[j]) as string[], f = percent(p, l[j + 1]), v = cssNumber(p, l[j + 1], emOf(n));
      const shown = !isNaN(f) ? `${Math.round(f * 10000) / 100}%` : p[3] === '1' ? hex(Math.round(v)) : p[3] === '3' ? l[j + 1].toLowerCase() : `${Math.round(v * 100) / 100}`;
      keys.push(`${camel(p[0])}: ${p[3] === '1' || p[3] === '3' || !isNaN(f) ? q(shown) : shown}`);
      toks.push(p[3] === '3' ? enumClass(p, shown) : `${p[2]}-[${shown}${p[3] === '0' && isNaN(f) ? 'px' : ''}]`);
      set.push(l[j]);
    }
  }
  if (n.sheetKeys.length > 0 || n.styleKeys.length > 0) return `style, add { ${keys.join(', ')} }`;
  // a class that sets only properties the edit sets is replaced; one that sets more (p-4 for padding-left) stays, the new class after it wins
  const base = classStyle(n.tag, ''), kept: string[] = [];
  for (const t of cls(n).split(' ')) {
    if (t.length === 0) continue;
    const d = declared(classStyle(n.tag, t), base);
    let covered = d.length > 0;
    for (let i = 0; covered && i < d.length; i += 2) covered = set.includes(d[i]);
    if (!covered) kept.push(t);
  }
  for (const t of toks) kept.push(t);
  return `class="${kept.join(' ')}"`;
}
/** The class string a node had before the session's first class edit of it, kept with the node (handles are reused). */
class Was { node: UiNode; cls: string; constructor(node: UiNode, cls: string) { this.node = node; this.cls = cls; } }
const classWas = new Map<i32, Was>();
function wasOf(h: i32): Was | null { const w = classWas.get(h); return w !== undefined && inspectNode(h) === w.node ? w : null; }
/** Node h is edited: it joins the patch (the nodes in the order of their first edit). */
function touch(h: i32): void { if (editOrder.indexOf(h) < 0) editOrder.push(h); }
/** The changes of the session, one per node still edited: where it is, what its source has, what to write instead. */
function changes(): string[][] {
  const out: string[][] = [];
  for (const h of editOrder) {
    const n = inspectNode(h), e = edited(h), w = wasOf(h);
    if (n === null || (e === null && w === null)) continue;
    const before = `class="${w !== null ? w.cls : cls(n)}"`;
    const after = e !== null ? patchOf(h, e) : `class="${cls(n)}"`;
    if (after !== before) out.push([label(h, n), e !== null && after.startsWith('style') ? 'style' : before, after]);
  }
  return out;
}
function printPatch(): void {
  const lines: string[] = [];
  for (const c of changes()) lines.push(`  ${c[0]}: ${c[2]}`);
  // sent as a console message of its own: the console output of the program reaches DevTools on the prototype's host only
  const text = lines.length > 0 ? 'zinc:devtools: style patch, paste it into the source:\n' + lines.join('\n') : 'zinc:devtools: no style edits left';
  Cdp.send(-1, `{"method":"Runtime.consoleAPICalled","params":{"type":"info","args":[{"type":"string","value":${q(text)}}],"executionContextId":1,"timestamp":${Date.now()}}}`);
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
  const s = stageIn(h);
  if (s !== null) out.push(stageId(s as DisplayObject));
  return out;
}
function nodeJson(id: i32): string {
  const o = stageNode(id);
  if (o !== null) return stageElement(o as DisplayObject);
  if (id < STAGE_BASE) return element(id - 1);
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
  for (const name of ['class', 'style', 'hidden', 'state', 'on']) {  // layout changes every animated frame: read on selection
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
// Screencast (the inspector's Screen view, Chrome's device view): the frame on screen shrunk to the size the frontend asks for, JPEG unless it
// asks for PNG, sent when the screen changed and the previous frame was acknowledged. The host keeps a copy of the frame from the damaged
// rows of each present and shrinks and encodes only when a frame is due (src/host/screencast.cpp); nothing runs while no screen is watched.
let cast: i32 = -1, castW: i32 = 0, castH: i32 = 0, castQ: i32 = 80, castReady = true, castLast = '', castSession: i32 = 0, castTimer: i32 = -1;
function castStart(client: i32, msg: string): void {
  cast = client; castW = Math.round(Cdp.num(msg, 'maxWidth')); castH = Math.round(Cdp.num(msg, 'maxHeight')); castReady = true; castLast = '';
  const q = Math.round(Cdp.num(msg, 'quality'));
  castQ = Cdp.str(msg, 'format') === 'png' ? 0 : q > 0 && q <= 100 ? q : 80;
  light(lit);   // the program stops drawing the highlight: the inspector does
  if (castTimer < 0) castTimer = setInterval(castFrame, 16);
}
function castStop(): void {
  cast = -1;
  if (castTimer >= 0) { clearInterval(castTimer); castTimer = -1; }
  Cdp.screencast(-1, 0, 0);
  light(lit);
}
function castFrame(): void {
  if (cast < 0 || !castReady) return;
  if (Cdp.clients() === 0) { castStop(); return; }
  const img = Cdp.screencast(castW, castH, castQ);
  if (img.length === 0 || img === castLast) return;
  castLast = img; castReady = false; castSession++;
  Cdp.send(cast, `{"method":"Page.screencastFrame","params":{"data":"${img}","sessionId":${castSession},"metadata":{"offsetTop":0,"pageScaleFactor":1,` +
    `"deviceWidth":${width()},"deviceHeight":${height()},"scrollOffsetX":0,"scrollOffsetY":0,"timestamp":${Date.now() / 1000}}}}`);
}

Cdp.listen(9229, handle);   // the default: zinc.json plugins.devtools.port and ZINC_DEVTOOLS_PORT change it (docs/dev-mode.md)
Cdp.net(15, targetFields());   // what discovery says of the program

function textOf(o: any, k: string): string { if (o === undefined || o === null) return ''; const v: any = o[k]; return typeof v === 'string' ? v : ''; }
/** The program as /json/list describes it to chrome://inspect and the Zinc Inspector's list (the fields after its ids and WebSocket URL):
 *  title, its name (zinc.json app.name, else name, else ZINC_APP_NAME: the project's folder or the file); description, the engine, dev run and
 *  project; url, zinc://<app id or name>/<entry in its project>; and `zinc`, the same for the Inspector's program card. */
function targetFields(): string {
  const rt: any = JSON.parse(orEmpty(Cdp.net(12, '')));
  const prog: any = rt.program, proj: any = prog !== undefined && prog !== null ? prog.project : null;
  const entry = textOf(prog, 'entry'), dir = textOf(prog, 'projectDir'), file = entry.slice(entry.lastIndexOf('/') + 1);
  let name = textOf(proj, 'appName');
  if (name.length === 0) name = textOf(proj, 'name');
  if (name.length === 0) name = env('ZINC_APP_NAME');
  if (name.length === 0) name = file.length > 0 ? file : 'Zinc app';
  const engine = textOf(rt, 'engine'), home = env('HOME');
  const project = home.length > 0 && dir.startsWith(home + '/') ? '~' + dir.slice(home.length) : dir;
  const id = textOf(proj, 'id');
  const url = `zinc://${id.length > 0 ? id : name.split(' ').join('-')}/${dir.length > 0 && entry.startsWith(dir + '/') ? entry.slice(dir.length + 1) : file}`;
  const pid: any = rt.pid;
  return `"title":${q(name)},"description":${q('Zinc · ' + (engine.length > 0 ? engine : 'engine?') + (DEV ? ' · dev run' : '') + (project.length > 0 ? ' · ' + project : ''))},` +
    `"url":${q(url)},"zinc":{"name":${q(name)},"engine":${q(engine)},"dev":${DEV},"project":${q(project)},"entry":${q(entry)},"pid":${typeof pid === 'number' ? pid : 0}}`;
}
// The Network panel: the host records every request from now on (headers that carry credentials masked); the events wait in the host until a client
// enables the domain, then follow live.
let netOn = false;
Cdp.net(0, '');
// The Console on Zinc Next (ZN-373.01): the host keeps the program's console lines from now on; they go out every 100 ms (the prototype's host
// mirrors the console itself and answers '' here).
Cdp.net(4, '');
setInterval(() => { consoleSync(); }, 100);
function consoleSync(): void {
  const lines = Cdp.net(5, '');
  if (lines.length === 0 || Cdp.clients() === 0) return;
  for (const e of lines.split('\n')) if (e.length > 0) Cdp.send(-1, e);
}
setInterval(() => { netSync(); }, 100);
function netSync(): void {
  if (!netOn) return;
  if (Cdp.clients() === 0) { netOn = false; return; }
  const events = Cdp.net(1, '');
  if (events.length === 0) return;
  for (const e of events.split('\n')) if (e.length > 0) Cdp.send(-1, e);
}
// The Storage panel's key/values (zinc:storage, which AsyncStorage keeps its keys in): while a client has DOMStorage enabled, what changed
// since the last look goes out every 500 ms as Chrome's DOMStorage events, so the panel follows the program's writes.
// ponytail: polled, the whole store read each time; a write hook in zinc:storage if a program keeps thousands of keys.
let storeOn = false;
let storeSnap: string[][] = [];
function storeRead(): string[][] { const out: string[][] = []; for (const k of storeKeys()) out.push([k, storeGet(k)]); return out; }
const STORE_ID = '{"securityOrigin":"zinc://app","isLocalStorage":true}';
setInterval(() => { storeSync(); }, 500);
function storeSync(): void {
  if (!storeOn) return;
  if (Cdp.clients() === 0) { storeOn = false; return; }
  const now = storeRead(), was = new Map<string, string>();
  for (const e of storeSnap) was.set(e[0], e[1]);
  for (const e of now) {
    const old = was.get(e[0]);
    if (old === undefined) Cdp.send(-1, `{"method":"DOMStorage.domStorageItemAdded","params":{"storageId":${STORE_ID},"key":${q(e[0])},"newValue":${q(e[1])}}}`);
    else if (old !== e[1]) Cdp.send(-1, `{"method":"DOMStorage.domStorageItemUpdated","params":{"storageId":${STORE_ID},"key":${q(e[0])},"oldValue":${q(old)},"newValue":${q(e[1])}}}`);
    was.delete(e[0]);
  }
  was.forEach((v: string, k: string) => { Cdp.send(-1, `{"method":"DOMStorage.domStorageItemRemoved","params":{"storageId":${STORE_ID},"key":${q(k)}}}`); });
  storeSnap = now;
}
let shownRoot: i32 = -1;
setInterval(() => { domSync(); }, 100);
function domSync(): void {
  if (Cdp.clients() === 0) { snaps.clear(); return; }
  if (snaps.size === 0) return;  // DOM.getDocument not asked yet
  if (inspectRoot() !== shownRoot) { shownRoot = inspectRoot(); snaps.clear(); Cdp.send(-1, '{"method":"DOM.documentUpdated","params":{}}'); return; }
  const events: string[] = [];
  sync(inspectRoot(), events);
  for (const e of events) Cdp.send(-1, e);
}
setInterval(() => { stageSync(); }, 100);
function stageSync(): void {   // the zinc:stage tree: only the parents whose children changed (stage.ts)
  const events = stageEvents();
  if (Cdp.clients() === 0) return;
  for (const e of events) Cdp.send(-1, e);
  for (const e of stageAttributeEvents(500)) Cdp.send(-1, e);   // renames and hides, 500 nodes looked at each time
}
// The pause (Zinc.setPaused, Zinc.stepFrame; F8 or Cmd/Ctrl+\ in the program): its timers stop with the program's, so while it holds these pumps run
// from the paused frames instead (zinc:gfx onPausedFrame): the screen at each frame, the console, the network, the trees and the state every 12th
// (about 100 ms). Zinc.pausedChanged tells the clients when the state changes, from here or from the program's key.
const REPAINTS: string[] = ['DOM.setAttributeValue', 'DOM.setAttributesAsText', 'CSS.setStyleTexts', 'DOM.setNodeValue', 'Overlay.highlightNode', 'Overlay.hideHighlight',
  'DOM.hideHighlight', 'DOMStorage.setDOMStorageItem', 'DOMStorage.removeDOMStorageItem', 'DOMStorage.clear'];
let pausedShown = false, pausedTicks: i32 = 0;
function pauseSync(): void {
  const p = Cdp.net(24, '') === '1';
  if (p === pausedShown) return;
  pausedShown = p;
  Cdp.send(-1, `{"method":"Zinc.pausedChanged","params":{"paused":${p}}}`);
}
setInterval(() => { if (pausedShown) pauseSync(); }, 100);   // resumed by the program's key
onPausedFrame(() => {
  castFrame();
  if (pausedTicks++ % 12 !== 0) return;
  pauseSync();
  consoleSync(); netSync(); storeSync(); domSync(); stageSync();
});
