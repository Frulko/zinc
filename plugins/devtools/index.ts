// zinc:devtools — the zinc:ui tree in Chrome DevTools (docs/dev-mode.md). `zinc dev` adds this module to UI
// programs; elsewhere `import 'zinc:devtools'` opts in. A subset of the DevTools protocol: DOM (tree, attributes,
// class edits), CSS computed style (layout values), Overlay highlight, Runtime console, Page frame tree and
// screenshots (the native frame, captured by the runtime), Tracing (frame phases for the Performance panel). Unknown
// methods get an empty result so the frontend never waits.
import Cdp from './native/cdp.spec';
import { inspectRoot, inspectNode, inspectHighlight, setClass, TAG_NAMES, TEXT, UiNode } from 'zinc:ui';

const DOC: i32 = 900000000, TEXT_BASE: i32 = 500000000;

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

function children(h: i32, n: UiNode): string[] {
  const kids: string[] = [];
  if (n.tag === TEXT && n.text.length > 0)
    kids.push(`{"nodeId":${TEXT_BASE + h},"backendNodeId":${TEXT_BASE + h},"nodeType":3,"nodeName":"#text","localName":"","nodeValue":${q(n.text)}}`);
  for (const c of n.children) { const e = element(c); if (e.length > 0) kids.push(e); }
  return kids;
}
function element(h: i32): string {
  const n = inspectNode(h);
  if (n === null) return '';
  const kids = children(h, n);
  const tag = TAG_NAMES[n.tag];
  const layout = `${Math.round(n.x)},${Math.round(n.y)} ${Math.round(n.lw)}x${Math.round(n.lh)}`;
  return `{"nodeId":${h + 1},"backendNodeId":${h + 1},"nodeType":1,"nodeName":${q(tag.toUpperCase())},"localName":${q(tag)},"nodeValue":"",` +
    `"childNodeCount":${kids.length},"children":[${kids.join(',')}],"attributes":["class",${q(cls(n))},"layout",${q(layout)}]}`;
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

function handle(client: i32, msg: string): void {
  const id = Cdp.num(msg, 'id'), method = Cdp.str(msg, 'method');
  const nid = Cdp.num(msg, 'nodeId');
  const nodeId: i32 = Math.round(nid !== 0 ? nid : Cdp.num(msg, 'backendNodeId'));
  const h = handleOf(nodeId);
  const n = inspectNode(h);
  let result = '{}';
  if (method === 'DOM.getDocument') result = `{"root":${documentNode()}}`;
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
  else if (method === 'Overlay.hideHighlight' || method === 'DOM.hideHighlight') inspectHighlight(-1);
  else if (method === 'Page.getResourceTree')
    result = '{"frameTree":{"frame":{"id":"main","loaderId":"zinc","url":"zinc://app","domainAndRegistry":"","securityOrigin":"zinc://app","mimeType":"text/html","secureContextType":"Secure","crossOriginIsolatedContextType":"NotIsolated","gatedAPIFeatures":[]},"resources":[]}}';
  else if (method === 'Runtime.enable')
    Cdp.send(client, '{"method":"Runtime.executionContextCreated","params":{"context":{"id":1,"origin":"zinc://app","name":"zinc","uniqueId":"zinc-1","auxData":{"isDefault":true,"type":"default","frameId":"main"}}}}');
  else if (method === 'Page.captureScreenshot') result = `{"data":"${Cdp.screenshot()}"}`;  // PNG of the frame on screen
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

// Twice a second: structure or class changes refresh the Elements panel (DOM.documentUpdated); text changes update
// the text node in place (DOM.characterDataModified).
let signature = '';
const texts = new Map<i32, string>();
function treeSignature(h: i32, textEvents: string[]): string {
  const n = inspectNode(h);
  if (n === null) return '';
  if (n.tag === TEXT) {
    const old = texts.get(h);
    if (old !== undefined && old !== n.text) textEvents.push(`{"method":"DOM.characterDataModified","params":{"nodeId":${TEXT_BASE + h},"characterData":${q(n.text)}}}`);
    texts.set(h, n.text);
  }
  let s = `${h}:${n.tag}:${n.cls}:${n.text.length > 0 ? 't' : ''}(`;
  for (const c of n.children) s += treeSignature(c, textEvents);
  return s + ')';
}
Cdp.listen(9229, handle);
setInterval(() => {
  if (Cdp.clients() === 0) { signature = ''; texts.clear(); return; }
  const events: string[] = [];
  const s = treeSignature(inspectRoot(), events);
  if (signature.length > 0 && s !== signature) Cdp.send(-1, '{"method":"DOM.documentUpdated","params":{}}');
  else for (const e of events) Cdp.send(-1, e);
  signature = s;
}, 500);
