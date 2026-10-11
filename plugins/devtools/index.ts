// zinc:devtools — the zinc:ui tree in Chrome DevTools (docs/dev-mode.md). `zinc dev` adds this module to UI
// programs; elsewhere `import 'zinc:devtools'` opts in. A subset of the DevTools protocol: DOM (tree, attributes,
// class edits), CSS computed style (layout values), Overlay highlight, Runtime console, Page frame tree and
// screenshots (the native frame, captured by the runtime), Tracing (frame phases for the Performance panel), Network
// (every fetch, WebSocket, MQTT client and outgoing TCP socket of the program, from the host's network log), and the Styles
// panel: classes and style sheets as rules, element.style and the box model edited live with the patch printed to the console
// (ZN-369). Unknown methods get an empty result so the frontend never waits.
import Cdp from './native/cdp.spec';
import { inspectRoot, inspectNode, inspectHighlight, inspectPick, inspectState, inspectStyle, classStyle, sheetStyle, componentName, parentOf, setClass, TAG_NAMES, TEXT, UiNode, Handlers } from 'zinc:ui';
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

/** A result of the host's network log; `{}` on targets that have none. */
function orEmpty(json: string): string { return json.length > 0 ? json : '{}'; }

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
  else if (method === 'CSS.getMatchedStylesForNode') result = n !== null ? matched(h, n) : '{"matchedCSSRules":[],"pseudoElements":[],"inherited":[],"cssKeyframesRules":[]}';
  else if (method === 'CSS.getInlineStylesForNode' && n !== null) result = `{"inlineStyle":${inline(h)}}`;
  else if (method === 'CSS.setStyleTexts') result = setStyleText(Cdp.str(msg, 'styleSheetId'), Cdp.str(msg, 'text'));
  else if (method === 'Overlay.highlightNode') inspectHighlight(n !== null ? h : -1);
  else if (method === 'Overlay.setInspectMode') { picked = -1; inspectPick(Cdp.str(msg, 'mode') === 'searchForNode' ? onPick : null); }
  else if (method === 'Overlay.hideHighlight' || method === 'DOM.hideHighlight') inspectHighlight(-1);
  else if (method === 'Page.getResourceTree')
    result = '{"frameTree":{"frame":{"id":"main","loaderId":"zinc","url":"zinc://app","domainAndRegistry":"","securityOrigin":"zinc://app","mimeType":"text/html","secureContextType":"Secure","crossOriginIsolatedContextType":"NotIsolated","gatedAPIFeatures":[]},"resources":[]}}';
  else if (method === 'Runtime.enable') {
    Cdp.send(client, '{"method":"Runtime.executionContextCreated","params":{"context":{"id":1,"origin":"zinc://app","name":"zinc","uniqueId":"zinc-1","auxData":{"isDefault":true,"type":"default","frameId":"main"}}}}');
    for (const e of Cdp.net(6, '').split('\n')) if (e.length > 0) Cdp.send(client, e);   // Zinc Next: the last console lines (the prototype's host replays its own)
  }
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
  else if (method === 'Network.enable') netOn = true;   // what the program requested before DevTools attached is sent too
  else if (method === 'Network.disable') netOn = false;
  else if (method === 'Network.getResponseBody') result = orEmpty(Cdp.net(2, Cdp.str(msg, 'requestId')));
  else if (method === 'Network.getRequestPostData') result = orEmpty(Cdp.net(3, Cdp.str(msg, 'requestId')));
  else if (method === 'Runtime.evaluate') result = '{"result":{"type":"string","value":"zinc: no JavaScript engine on the device (the console shows the program output)"}}';
  Cdp.send(client, `{"id":${id},"result":${result}}`);
}

// ---------------------------------------------------------------- the Styles panel (ZN-369)
// The node's classes, style sheets and style numbers show as read-only rules (what each declares); element.style is the inspector's own
// layer (ui.inspectStyle, applied over them) that the Styles panel and the box model edit; each edit prints to the console the patch to
// paste back: the class string, or the properties to add to the style object, of every node edited in the session.
/** CSS longhand, style key, class prefix, kind: 0 a length in px, 1 a colour, 2 a number. */
const CSS_PROPS: string[][] = [
  ['padding-top', 'paddingTop', 'pt', '0'], ['padding-right', 'paddingRight', 'pr', '0'], ['padding-bottom', 'paddingBottom', 'pb', '0'], ['padding-left', 'paddingLeft', 'pl', '0'],
  ['margin-top', 'marginTop', 'mt', '0'], ['margin-right', 'marginRight', 'mr', '0'], ['margin-bottom', 'marginBottom', 'mb', '0'], ['margin-left', 'marginLeft', 'ml', '0'],
  ['gap', 'gap', 'gap', '0'], ['row-gap', 'rowGap', 'gap-y', '0'], ['column-gap', 'columnGap', 'gap-x', '0'],
  ['width', 'width', 'w', '0'], ['height', 'height', 'h', '0'], ['min-width', 'minWidth', 'min-w', '0'], ['max-width', 'maxWidth', 'max-w', '0'],
  ['min-height', 'minHeight', 'min-h', '0'], ['max-height', 'maxHeight', 'max-h', '0'], ['border-radius', 'borderRadius', 'rounded', '0'],
  ['border-width', 'borderWidth', 'border', '0'], ['font-size', 'fontSize', 'text', '0'],
  ['background-color', 'backgroundColor', 'bg', '1'], ['color', 'color', 'text', '1'], ['border-color', 'borderColor', 'border', '1'], ['opacity', 'opacity', 'opacity', '2'],
];
function cssProp(name: string): string[] | null { for (const p of CSS_PROPS) if (p[0] === name) return p; return null; }
/** A length in px ("12px" or "12"), NaN otherwise. */
function length(v: string): number { const t = v.endsWith('px') ? v.slice(0, v.length - 2) : v; return t.length > 0 && !isNaN(Number(t)) ? Number(t) : NaN; }
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
function cssNumber(p: string[], v: string): number {
  if (p[3] === '1') { const c = colour(v); return c < 0 ? NaN : c; }
  return p[3] === '0' ? length(v) : (v.length > 0 && !isNaN(Number(v)) ? Number(v) : NaN);
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
function applies(name: string, value: string): boolean {
  const l = longhands(name, value);
  for (let i = 0; i < l.length; i += 2) { const p = cssProp(l[i]); if (p === null || isNaN(cssNumber(p, l[i + 1]))) return false; }
  return true;
}
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
    if (!applies(d[i], d[i + 1])) continue;
    const l = longhands(d[i], d[i + 1]);
    for (let j = 0; j < l.length; j += 2) { const p = cssProp(l[j]) as string[]; keys.push(p[1]); vals.push(cssNumber(p, l[j + 1])); }
  }
  inspectStyle(h, keys, vals);
  if (d.length === 0) edits.delete(h);
  else { if (edited(h) === null) { const at = editOrder.indexOf(h); if (at >= 0) editOrder.splice(at, 1); editOrder.push(h); } edits.set(h, new Edited(n, d)); }
  printPatch();
  return `{"styles":[${inline(h)}]}`;
}
/** Where node h is: its component (or the nearest one above it), its tag and its DevTools id. */
function label(h: i32, n: UiNode): string {
  let p = h;
  while (p >= 0 && componentName(p).length === 0) p = parentOf(p);
  return (p >= 0 ? `<${componentName(p)}> ` : '') + `${p === h ? '' : TAG_NAMES[n.tag] + ' '}#${h + 1}`;
}
/** The patch of node h in its source's form: style object keys when it has style sheets or numbers, else its class string. */
function patchLine(h: i32, e: Edited): string {
  const n = e.node, keys: string[] = [], toks: string[] = [], set: string[] = [];
  for (let i = 0; i < e.decls.length; i += 2) {
    if (!applies(e.decls[i], e.decls[i + 1])) continue;
    const l = longhands(e.decls[i], e.decls[i + 1]);
    for (let j = 0; j < l.length; j += 2) {
      const p = cssProp(l[j]) as string[], v = cssNumber(p, l[j + 1]);
      const shown = p[3] === '1' ? hex(Math.round(v)) : `${v}`;
      keys.push(`${p[1]}: ${p[3] === '1' ? q(shown) : shown}`);
      toks.push(`${p[2]}-[${shown}${p[3] === '0' ? 'px' : ''}]`);
      set.push(l[j]);
    }
  }
  if (n.sheetKeys.length > 0 || n.styleKeys.length > 0) return `${label(h, n)}: style, add { ${keys.join(', ')} }`;
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
  return `${label(h, n)}: class="${kept.join(' ')}"`;
}
function printPatch(): void {
  const lines: string[] = [];
  for (const h of editOrder) { const e = edited(h); if (e !== null) lines.push('  ' + patchLine(h, e)); }
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

Cdp.listen(9229, handle);   // the default: zinc.json plugins.devtools.port and ZINC_DEVTOOLS_PORT change it (docs/dev-mode.md)
// The Network panel: the host records every request from now on (headers that carry credentials masked); the events wait in the host until a client
// enables the domain, then follow live.
let netOn = false;
Cdp.net(0, '');
// The Console on Zinc Next (ZN-373.01): the host keeps the program's console lines from now on; they go out every 100 ms (the prototype's host
// mirrors the console itself and answers '' here).
Cdp.net(4, '');
setInterval(() => {
  const lines = Cdp.net(5, '');
  if (lines.length === 0 || Cdp.clients() === 0) return;
  for (const e of lines.split('\n')) if (e.length > 0) Cdp.send(-1, e);
}, 100);
setInterval(() => {
  if (!netOn) return;
  if (Cdp.clients() === 0) { netOn = false; return; }
  const events = Cdp.net(1, '');
  if (events.length === 0) return;
  for (const e of events.split('\n')) if (e.length > 0) Cdp.send(-1, e);
}, 100);
let shownRoot: i32 = -1;
setInterval(() => {
  if (Cdp.clients() === 0) { snaps.clear(); return; }
  if (snaps.size === 0) return;  // DOM.getDocument not asked yet
  if (inspectRoot() !== shownRoot) { shownRoot = inspectRoot(); snaps.clear(); Cdp.send(-1, '{"method":"DOM.documentUpdated","params":{}}'); return; }
  const events: string[] = [];
  sync(inspectRoot(), events);
  for (const e of events) Cdp.send(-1, e);
}, 100);
