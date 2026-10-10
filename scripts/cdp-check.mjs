#!/usr/bin/env node
// Scripted DevTools client for plugins/devtools (docs/dev-mode.md): discovery, DOM tree, computed style, class edit,
// highlight, console mirroring, screenshot. Run it against a program started by `zinc dev` (or built with --devtools).
// --styles checks the Styles panel instead (ZN-369) on tests/data/devtools_styles: the rules of a class-styled and a StyleSheet-styled box,
// element.style edited as the box model does (CSS.setStyleTexts), the frame and the box after it, and the patch printed to the console.
// usage: node scripts/cdp-check.mjs [port] [--styles]   (Node's built-in WebSocket, no dependencies)
const port = Number(process.argv[2] ?? 9229), stylesOnly = process.argv.includes('--styles');
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
console.log('target:', list[0].title, list[0].type, list[0].webSocketDebuggerUrl, '| version:', version.Browser);
const ws = new WebSocket(list[0].webSocketDebuggerUrl);
await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko; });
let next = 1;
const pending = new Map(), events = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id) pending.get(m.id)?.(m.result);
  else events.push(m);
};
const call = (method, params = {}) => new Promise(ok => { const id = next++; pending.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) process.exitCode = 1; };

await call('Runtime.enable');
check(events.some(e => e.method === 'Runtime.executionContextCreated'), 'Runtime.enable -> executionContextCreated');
if (stylesOnly) { await styles(); ws.close(); process.exit(); }
const doc = (await call('DOM.getDocument', { depth: -1 })).root;
const all = [];
const walk = (n, d) => { all.push(n); console.log(`  ${'  '.repeat(d)}<${n.localName || n.nodeName}${n.attributes ? ` class="${n.attributes[1]}" layout="${n.attributes[3]}"` : ''}>${n.nodeValue ?? ''}`); (n.children ?? []).forEach(c => walk(c, d + 1)); };
walk(doc, 0);
check(doc.nodeType === 9 && all.length > 2, `DOM.getDocument: ${all.length} nodes`);
const el = all.find(n => n.nodeType === 1 && n.childNodeCount > 0 && n !== doc);
const style = (await call('CSS.getComputedStyleForNode', { nodeId: el.nodeId })).computedStyle;
check(style.some(p => p.name === 'width'), `CSS.getComputedStyleForNode: ${style.map(p => `${p.name}=${p.value}`).slice(0, 6).join(' ')} ...`);
const box = await call('DOM.getBoxModel', { nodeId: el.nodeId });
check(box.model?.content?.length === 8, 'DOM.getBoxModel');
await call('DOM.requestChildNodes', { nodeId: el.nodeId });
check(events.some(e => e.method === 'DOM.setChildNodes' && e.params.parentId === el.nodeId), 'DOM.requestChildNodes -> setChildNodes');
await call('Overlay.highlightNode', { nodeId: el.nodeId, highlightConfig: {} });
check(true, 'Overlay.highlightNode');
const target = all.find(n => n.localName === 'view' && n !== el) ?? el;
await call('DOM.setAttributeValue', { nodeId: target.nodeId, name: 'class', value: 'p-4 bg-rose-600' });
const after = JSON.stringify((await call('DOM.getDocument')).root);
check(after.includes('bg-rose-600'), 'DOM.setAttributeValue class -> tree shows the new class');
const bg = (await call('CSS.getComputedStyleForNode', { nodeId: target.nodeId })).computedStyle.find(p => p.name === 'background-color');
check(bg?.value === '#e11d48', `restyled background-color ${bg?.value}`);
check(Object.keys(await call('Some.unknownMethod')).length === 0, 'unknown method -> empty result');
await call('Network.enable');
const body = await call('Network.getResponseBody', { requestId: '1' });   // the Spec member `net`: {} where the host has no network log (the prototype)
check(typeof body === 'object', `Network.getResponseBody: ${JSON.stringify(body)}`);
const png = Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).data ?? '', 'base64');
check(png.subarray(1, 4).toString() === 'PNG', `Page.captureScreenshot: ${png.length} bytes${png.length > 24 ? ` (${png.readUInt32BE(16)}x${png.readUInt32BE(20)})` : ""}`);
if (process.env.SHOT_WAIT) await new Promise(r => setTimeout(r, Number(process.env.SHOT_WAIT)));
await call('Overlay.hideHighlight');
const logs = events.filter(e => e.method === 'Runtime.consoleAPICalled');
check(true, `console events received: ${logs.length}${logs.length ? ` (last: ${logs.at(-1).params.type} ${logs.at(-1).params.args[0].value})` : ''}`);
ws.close();

async function styles() {
  const nodes = [];
  const walk = n => { nodes.push(n); (n.children ?? []).forEach(walk); };
  walk((await call('DOM.getDocument', { depth: -1 })).root);
  const attr = (n, k) => { const a = n.attributes ?? []; const i = a.indexOf(k); return i >= 0 && i % 2 === 0 ? a[i + 1] : undefined; };
  const tagged = nodes.find(n => (attr(n, 'class') ?? '').includes('bg-rose-600'));
  const parent = nodes.find(n => (n.children ?? []).includes(tagged));
  const sheet = parent.children[parent.children.indexOf(tagged) + 1];
  const shot = async () => Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).data, 'base64');
  const settle = () => new Promise(r => setTimeout(r, 300));   // a few frames: the edit is laid out and painted
  const left = async n => (await call('DOM.getBoxModel', { nodeId: n.nodeId })).model;
  const rules = async n => (await call('CSS.getMatchedStylesForNode', { nodeId: n.nodeId }));
  const has = (rule, name, value) => rule.style.cssProperties.some(p => p.name === name && p.value === value);
  let m = await rules(tagged);
  const cls = m.matchedCSSRules.find(r => r.rule.selectorList.text === '.p-2.bg-rose-600.rounded')?.rule;
  check(cls && has(cls, 'padding-left', '8px') && has(cls, 'background-color', '#e11d48'), `classes as a rule: ${cls ? cls.style.cssProperties.map(p => `${p.name}: ${p.value}`).join('; ') : 'none'}`);
  m = await rules(sheet);
  const obj = m.matchedCSSRules.find(r => r.rule.selectorList.text === 'style={StyleSheet}')?.rule;
  check(obj && has(obj, 'padding-left', '8px') && has(obj, 'background-color', '#2563eb') && has(obj, 'border-radius', '6px'), `StyleSheet object as a rule: ${obj ? obj.style.cssProperties.map(p => `${p.name}: ${p.value}`).join('; ') : 'none'}`);
  // the box model's edit: element.style gets padding-left appended (DevTools reads it with getInlineStylesForNode, writes it with setStyleTexts)
  const edit = async (n, text) => {
    const inline = (await call('CSS.getInlineStylesForNode', { nodeId: n.nodeId })).inlineStyle;
    return (await call('CSS.setStyleTexts', { edits: [{ styleSheetId: inline.styleSheetId, range: inline.range, text }] })).styles?.[0];
  };
  for (const [what, n, text] of [['classes', tagged, 'padding-left: 20px; background-color: #000000;'], ['StyleSheet', sheet, 'padding-left: 20px; background-color: #10b981;']]) {
    const before = await shot(), box = await left(n);
    const style = await edit(n, text);
    await settle();
    const after = await shot(), box2 = await left(n);
    check(style?.cssText === text && style.cssProperties.every(p => p.parsedOk) && style.cssProperties[0].range, `setStyleTexts on the ${what} box returns element.style: ${style?.cssText}`);
    check(box2.content[0] - box.content[0] === 12 && box2.width - box.width === 12, `padding-left 8 -> 20 px on the ${what} box: content x ${box.content[0]} -> ${box2.content[0]}, width ${box.width} -> ${box2.width}`);
    check(!before.equals(after), `the frame changed after the ${what} edit`);
    m = await rules(n);
    check(m.inlineStyle.cssText === text, `element.style of the ${what} box reads back: ${m.inlineStyle.cssText}`);
  }
  const patch = events.filter(e => e.method === 'Runtime.consoleAPICalled').map(e => e.params.args[0].value).filter(v => v.includes('style patch')).at(-1) ?? '';
  console.log(patch);
  check(patch.includes(`#${tagged.nodeId}: class="p-2 rounded pl-[20px] bg-[#000000]"`), 'the patch gives the class string: p-2 kept (it sets more than padding-left), bg-rose-600 replaced');
  check(patch.includes(`#${sheet.nodeId}: style, add { paddingLeft: 20, backgroundColor: "#10b981" }`), 'the patch gives the StyleSheet keys to add');
  await edit(sheet, '');
  await settle();
  check(((await left(sheet)).width) === 32, 'an empty element.style gives the StyleSheet box its own padding back');
}
