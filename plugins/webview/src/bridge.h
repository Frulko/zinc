// The page side of zinc:webview on WebKit (macOS, iOS, Linux): window.zinc (postMessage, invoke, onmessage), injected before any page script.
// HANDLER: the expression of the object messages go through.
#pragma once
#define ZINC_WEBVIEW_BRIDGE(HANDLER) "(() => {" \
  "const h = " HANDLER ", pend = new Map(); let seq = 0;" \
  "const str = (x) => x === undefined ? '' : typeof x === 'string' ? x : JSON.stringify(x);" \
  "const parse = (s) => { try { return JSON.parse(s); } catch (e) { return s; } };" \
  "window.zinc = {" \
  " postMessage(x) { h.postMessage({ t: 'm', d: str(x) }); }," \
  " invoke(cmd, args) { return new Promise((res, rej) => { const id = ++seq; pend.set(id, [res, rej]); h.postMessage({ t: 'i', id, cmd: String(cmd), d: str(args) }); }); }," \
  " onmessage: null," \
  " __settle(id, ok, r) { const p = pend.get(id); if (!p) return; pend.delete(id); if (ok) p[0](parse(r)); else p[1](new Error(r)); }," \
  " __dispatch(d) { const v = parse(d); if (window.zinc.onmessage) window.zinc.onmessage(v); window.dispatchEvent(new MessageEvent('zinc', { data: v })); }," \
  "};})();"
