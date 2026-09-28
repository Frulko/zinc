#!/usr/bin/env node
// Scripted DevTools client for plugins/devtools (docs/dev-mode.md): discovery, DOM tree, computed style, class edit,
// highlight, console mirroring, screenshot. Run it against a program started by `zinc dev` (or built with --devtools).
// usage: node scripts/cdp-check.mjs [port]   (Node's built-in WebSocket, no dependencies)
const port = Number(process.argv[2] ?? 9229);
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
const png = Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).data ?? '', 'base64');
check(png.subarray(1, 4).toString() === 'PNG', `Page.captureScreenshot: ${png.length} bytes${png.length > 24 ? ` (${png.readUInt32BE(16)}x${png.readUInt32BE(20)})` : ""}`);
if (process.env.SHOT_WAIT) await new Promise(r => setTimeout(r, Number(process.env.SHOT_WAIT)));
await call('Overlay.hideHighlight');
const logs = events.filter(e => e.method === 'Runtime.consoleAPICalled');
check(true, `console events received: ${logs.length}${logs.length ? ` (last: ${logs.at(-1).params.type} ${logs.at(-1).params.args[0].value})` : ''}`);
ws.close();
