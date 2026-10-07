// zinc:devtools on zinc:socket (ZN-088): a scripted DevTools client in the same program asks the inspector for the tree, a node's box and style, and checks the
// HTTP discovery and the Origin check. Run with ZINC_REALTIME=1 (the sockets need real time).
import 'zinc:devtools';
import { render } from 'zinc:ui/solid';
import { connect, WebSocket, MessageEvent } from 'zinc:socket';
import { fetch, Headers } from 'zinc:net';
import * as sys from 'zinc:sys';
import { quit } from 'zinc:gfx';

function App(): i32 {
  return <View class="flex-col p-3 gap-2"><Text class="text-lg">Hello devtools</Text></View>;
}
render(App, 0xf1f5f9, (dt: number) => {});

const pending = new Map<i32, (r: string) => void>();
let nextId: i32 = 1;
function call(ws: WebSocket, method: string, params: string): Promise<string> {
  const id = nextId++;
  return new Promise<string>((resolve) => {
    pending.set(id, resolve);
    ws.send(`{"id":${id},"method":"${method}","params":${params}}`);
  });
}
function field(msg: string, key: string): string {
  const i = msg.indexOf('"' + key + '":');
  if (i < 0) return '';
  let j = i + key.length + 3;
  const q = msg.charAt(j) === '"';
  if (q) j++;
  let k = j;
  while (k < msg.length && (q ? msg.charAt(k) !== '"' : ',}]'.indexOf(msg.charAt(k)) < 0)) k++;
  return msg.slice(j, k);
}
async function main(): Promise<void> {
  await new Promise<void>((resolve) => { setTimeout(() => { resolve(); }, 200); });   // the inspector is listening
  const v = await fetch('http://127.0.0.1:9229/json/version');
  console.log('version', v.status, await v.text());
  const list = await fetch('http://127.0.0.1:9229/json/list');
  console.log('list', list.status, field(await list.text(), 'webSocketDebuggerUrl'));
  const web = new Headers();
  web.set('Origin', 'https://example.com');
  const evil = await fetch('http://127.0.0.1:9229/json/list', { headers: web });
  console.log('evil', evil.status);
  const ws = new WebSocket('ws://127.0.0.1:9229/zinc');
  ws.onmessage = (e: MessageEvent) => {
    const id = parseInt(field(e.data, 'id'));
    const f = pending.get(id);
    if (f !== undefined) { pending.delete(id); f(e.data); }
  };
  await new Promise<void>((resolve) => { ws.onopen = () => { resolve(); }; });
  const doc = await call(ws, 'DOM.getDocument', '{}');
  console.log('document', field(doc, 'nodeName'), doc.indexOf('Hello devtools') >= 0, doc.indexOf('"class"') >= 0);
  const style = await call(ws, 'CSS.getComputedStyleForNode', '{"nodeId":1}');
  console.log('style', style.indexOf('computedStyle') >= 0);
  const unknown = await call(ws, 'Foo.bar', '{}');
  console.log('unknown', unknown);
  ws.close();
  quit();
}
main();
