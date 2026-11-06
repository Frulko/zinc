// zinc:socket: a data callback closes its socket and connects again at once; the new connection may take the closed one's slot of the native table.
// Nothing left for the old socket (the rest of its read, its close) may reach the new one (ZN-995).
import { listen, connect, Socket } from 'zinc:socket';

async function main(): Promise<void> {
  const srv = await listen(0, (c: Socket) => { c.write('hello'); }, '127.0.0.1');
  const port = srv.port;
  const first = await connect('127.0.0.1', port);
  first.onData((s: string) => {
    console.log('first got', s);
    first.close();
    connect('127.0.0.1', port).then((second: Socket) => {
      second.onData((t: string) => { console.log('second got', t); second.close(); srv.close(); });
      second.onError((m: string) => { console.log('second error', m); });
      second.onClose(() => { console.log('second closed by a stale event'); });
    }, (e: Error) => { console.log('second failed', e.message); srv.close(); });
  });
}
main();
