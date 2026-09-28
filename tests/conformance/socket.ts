// zinc-test: requires net process
// zinc:socket on loopback only: a TCP line-echo server and client, a Unix domain socket, UDP datagrams, DNS lookup of
// localhost, connection refused, and a WebSocket server + client (text, binary, fragments of large messages, close).
import { listen, connect, listenUnix, connectUnix, udp, lookup, Socket, Datagram, serveWebSocket, WebSocket, MessageEvent, CloseEvent, UpgradeRequest } from 'zinc:socket';
import * as fs from 'zinc:fs';
import { Event } from 'zinc:web';

/** Collects text until `n` newline-terminated lines arrived. */
function lines(s: Socket, n: i32): Promise<string[]> {
  return new Promise<string[]>(resolve => {
    let buf = '';
    s.onData((c: string) => {
      buf += c;
      const ls = buf.split('\n');
      if (ls.length > n) resolve(ls.slice(0, n));
    });
  });
}

async function tcp(): Promise<void> {
  const srv = await listen(0, (c: Socket) => {
    console.log('server: accepted from', c.remoteAddress);
    let buf = '';
    c.onData((chunk: string) => {
      buf += chunk;
      let i = buf.indexOf('\n');
      while (i >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        c.write(line.toUpperCase() + '\n');
        if (line === 'bye') c.end();
        i = buf.indexOf('\n');
      }
    });
  }, '127.0.0.1');
  console.log('listening', srv.port > 0);
  const s = await connect('localhost', srv.port);
  console.log('client: connected', s.remoteAddress, s.remotePort === srv.port, s.localPort > 0);
  const got = lines(s, 3);
  const closed = new Promise<boolean>(resolve => { s.onClose(() => { resolve(true); }); });
  s.write('hello\nwörld €');
  s.write('\nbye\n');
  console.log('client: got', await got);
  console.log('client: peer closed', await closed);
  srv.close();
  try { await connect('127.0.0.1', 9); } catch (e) { console.log('refused:', e.message); }
}

async function unix(): Promise<void> {
  const path = fs.tmpdir() + '/zinc-sock-test.sock';
  fs.remove(path);
  const srv = await listenUnix(path, (c: Socket) => {
    c.onBytes((b: u8[]) => { c.writeBytes(b.map((x: u8): u8 => (x + 1) & 255)); });
  });
  const s = await connectUnix(path);
  const got = new Promise<u8[]>(resolve => { s.onBytes((b: u8[]) => { resolve(b); }); });
  s.writeBytes([1, 2, 255]);
  console.log('unix:', await got);
  s.close();
  srv.close();
  fs.remove(path);
}

async function datagrams(): Promise<void> {
  const a = await udp(9731, '127.0.0.1');
  const b = await udp(9732, '127.0.0.1');
  const got = new Promise<string>(resolve => {
    b.onMessage((m: Datagram) => { resolve(`${m.text} from ${m.address}:${m.port}`); });
  });
  a.onMessage((m: Datagram) => { console.log('udp: reply', m.bytes); });
  a.send('127.0.0.1', 9732, 'ping');
  console.log('udp:', await got, a.port, b.port);
  const back = new Promise<boolean>(resolve => { a.onMessage((m: Datagram) => { resolve(true); }); });
  b.sendBytes('127.0.0.1', 9731, [7, 8, 9]);
  await back;
  a.close();
  b.close();
}

async function dns(): Promise<void> {
  const addrs = await lookup('localhost');
  console.log('lookup localhost:', addrs.includes('127.0.0.1') || addrs.includes('::1'));
  console.log('lookup literal:', await lookup('127.0.0.1'));
}

async function websocket(): Promise<void> {
  let serverClosed: ((s: string) => void) | null = null;
  const serverDone = new Promise<string>(resolve => { serverClosed = resolve; });
  const wss = await serveWebSocket(0, (ws: WebSocket, req: UpgradeRequest) => {
    console.log('ws server: connection', req.path, req.header('Sec-WebSocket-Version'));
    ws.onmessage = (e: MessageEvent) => {
      if (e.binary) ws.sendBytes(e.bytes.reverse());
      else if (e.data === 'close me') ws.close(4000, 'as asked');
      else ws.send('echo ' + e.data.length + ' ' + e.data.slice(0, 12));
    };
    ws.onclose = (e: CloseEvent) => { const f = serverClosed; if (f !== null) f(`${e.code} ${e.wasClean}`); };
  }, '127.0.0.1');
  const ws = new WebSocket(`ws://127.0.0.1:${wss.port}/chat?room=1`);
  const opened = new Promise<boolean>(resolve => { ws.onopen = (e: Event) => { resolve(true); }; });
  const msgs: string[] = [];
  let next: ((s: string) => void) | null = null;
  ws.onmessage = (e: MessageEvent) => {
    const m = e.binary ? `bytes ${e.bytes}` : e.data;
    const f = next;
    if (f !== null) { next = null; f(m); } else msgs.push(m);
  };
  const reply = (): Promise<string> => new Promise<string>(resolve => { next = resolve; });
  const closed = new Promise<string>(resolve => { ws.onclose = (e: CloseEvent) => { resolve(`${e.code} ${e.reason} ${e.wasClean}`); }; });
  console.log('ws client: open', await opened, ws.readyState);
  let r = reply();
  ws.send('héllo');
  console.log('ws client:', await r);
  r = reply();
  ws.sendBytes([1, 2, 3]);
  console.log('ws client:', await r);
  r = reply();
  ws.send('x'.repeat(70000));
  console.log('ws client:', await r);
  ws.send('close me');
  console.log('ws client: closed', await closed, ws.readyState);
  console.log('ws server: closed', await serverDone);
  wss.close();
  const bad = new WebSocket(`ws://127.0.0.1:${wss.port}/`);
  const failed = new Promise<i32>(resolve => { bad.onclose = (e: CloseEvent) => { resolve(e.code); }; });
  console.log('ws client: refused, close code', await failed);
}

async function main(): Promise<void> {
  await tcp();
  await unix();
  await datagrams();
  await dns();
  await websocket();
  console.log('done');
}
main();
