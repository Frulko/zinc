// The Network panel and the HAR export (ZN-370): a program under the inspector that fetches (with a credential, through a redirect, over TLS), talks on a
// WebSocket and publishes on MQTT. tests/t0/netlog.sh starts the servers (tests/netlog_servers.py, tests/mqtt_broker.py), reads the Network events with a
// scripted DevTools client and asks this program to quit through its own server. Arguments: http port, https port (0: none), mqtt port, quit port.
import 'zinc:devtools';
import { render } from 'zinc:ui/solid';
import { serveWebSocket, WebSocket, MessageEvent } from 'zinc:socket';
import { fetch, serve, Headers } from 'zinc:net';
import { MqttClient } from 'zinc:mqtt';
import * as sys from 'zinc:sys';
import { quit } from 'zinc:gfx';

function App(): i32 {
  return <View className="p-3"><Text>network</Text></View>;
}
render(App, 0xf1f5f9, (dt: number) => {});

async function main(): Promise<void> {
  const http = parseInt(sys.args()[0]), https = parseInt(sys.args()[1]), mqtt = parseInt(sys.args()[2]);
  serve(parseInt(sys.args()[3]), (req) => { setTimeout(() => { quit(); }, 50); return { status: 200, body: 'bye', contentType: 'text/plain' }; });

  const h = new Headers();
  h.set('Authorization', 'Bearer s3cret-token');
  h.set('X-Trace', 'visible');
  const echo = await fetch(`http://127.0.0.1:${http}/echo?user:pw@x`, { method: 'POST', body: '{"ask":"zinc"}', contentType: 'application/json', headers: h });
  console.log('echo', echo.status, await echo.text());
  const moved = await fetch(`http://127.0.0.1:${http}/old`);
  console.log('moved', moved.status, await moved.text());
  // ZN-635: the names of ZINC_NET_SENSITIVE (pin and api_key in the test) as a query parameter, JSON fields and a form field; `token` is not listed and stays
  const login = await fetch(`http://127.0.0.1:${http}/login?api_key=query-secret&plain=1`, { method: 'POST', body: '{"user":"z\\"inc","pin":"json-secret","deep":[{"PIN":1234567,"keep":true}],"api_key":{"id":"json-secret"},"token":"shown"}', contentType: 'application/json' });
  console.log('login', login.status, await login.text());
  const form = await fetch(`http://127.0.0.1:${http}/form`, { method: 'POST', body: 'user=zinc&pin=form-secret&keep=1', contentType: 'application/x-www-form-urlencoded' });
  console.log('form', form.status, await form.text());
  if (https > 0) {
    const c = new Headers();
    c.set('Cookie', 'sid=cookie-secret');
    const secure = await fetch(`https://localhost:${https}/secure`, { headers: c });
    console.log('secure', secure.status, await secure.text());
  }
  try { await fetch('http://127.0.0.1:1/refused'); } catch (e) { console.log('refused', (e as Error).message); }

  const wss = await serveWebSocket(0, (peer: WebSocket, req) => { peer.onmessage = (e: MessageEvent) => { peer.send('echo ' + e.data); }; }, '127.0.0.1');
  const ws = new WebSocket(`ws://127.0.0.1:${wss.port}/chat?api_key=ws-query-secret&room=1`);
  ws.onopen = () => { ws.send('{"say":"hello ws","pin":"ws-secret"}'); };
  await new Promise<void>((resolve) => { ws.onmessage = (e: MessageEvent) => { console.log('ws', e.data); ws.close(); resolve(); }; });

  const m = new MqttClient('127.0.0.1', mqtt, 'netlog');
  await m.connect();
  let got = '';
  m.subscribe('zn/#', (t, p) => { got = t + '=' + p; });
  m.publish('zn/room/temp', '21.5 hello mqtt');
  for (let i: i32 = 0; i < 80 && got.length === 0; i++) await new Promise<void>((resolve) => { setTimeout(() => { resolve(); }, 25); });
  console.log('mqtt', got);
  m.close();
  console.log('ready');
}
main();
