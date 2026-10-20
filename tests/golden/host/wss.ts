import { WebSocket, MessageEvent, CloseEvent, ErrorEvent } from 'zinc:socket';
import * as sys from 'zinc:sys';
// wss:// (zinc:socket over the host's mbedTLS): tests/t0/tls.sh runs an echo server over TLS 1.2 then 1.3 on loopback, with a certificate of its test CA, that greets first. Trusted
// (ZINC_CA_FILE = that CA) the text and binary messages come back and the close is clean; not trusted, the handshake is refused and only error and close arrive.
const ws = new WebSocket(`wss://localhost:${sys.args()[0]}/echo`);
ws.onopen = () => { ws.send('hello over wss'); ws.sendBytes([1, 2, 255]); };
let n: i32 = 0;
ws.onmessage = (e: MessageEvent) => {
  console.log(e.binary ? 'binary ' + e.bytes.join(',') : 'text ' + e.data);
  if (++n === 3) ws.close(1000, 'done');
};
ws.onerror = (e: ErrorEvent) => { console.log('error ' + e.message); };
ws.onclose = (e: CloseEvent) => { console.log('close ' + e.code + ' ' + e.wasClean); };
