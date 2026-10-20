import { connectTls } from 'zinc:socket';
import * as sys from 'zinc:sys';
// A server that speaks first right after a TLS 1.3 handshake (tests/t0/tls.sh, wss_echo.mjs first): its line comes in one read behind its session tickets,
// and must be delivered without waiting for more bytes from the network (ZN-762: mbedTLS answers WANT_READ on a ticket with the records behind it unread).
async function main(): Promise<void> {
  const s = await connectTls('localhost', parseInt(sys.args()[0]));
  const t0 = Date.now();
  while (Date.now() - t0 < 300) {}   // the loop holds still: the tickets and the line pile up and arrive in one read, as from a busy proxy
  s.onData((t: string) => { console.log('got ' + t.trim()); s.close(); });
}
main();
