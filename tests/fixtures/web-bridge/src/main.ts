// The dev bridge fixture (tests/t1/web_bridge.sh): zinc:process has no browser backend, so under zinc dev --target web its native side runs on
// this machine. A child's output comes back through a callback, its result through a promise.
import { spawn, run } from 'zinc:process';

const p = spawn('echo', ['bridge-line'], {});
p.onStdout((line: string) => { console.log('stdout: ' + line); });
run('echo', ['bridge-run'], {}).then((r) => { console.log('run: ' + r.code + ' ' + r.stdout.trim()); });

// zinc:net's server listens on this machine; the request reaches the page's handler and its reply goes back
import { serve, fetch as netFetch } from 'zinc:net';
const port = serve(0, (req) => ({ status: 200, body: 'page answers ' + req.path, contentType: 'text/plain' }));
console.log('serving: ' + port);
// zinc:net's fetch runs on this machine too: its end is an event of the machine's loop, sent on to the page
netFetch('http://127.0.0.1:' + port + '/self').then((r) => r.text()).then((t) => { console.log('fetch: ' + t); });

// zinc:socket asks for its native module under zinc dev ("web": {"dev": "native"}): a UDP datagram to itself, which a page cannot send
import { udp } from 'zinc:socket';
udp(0, '127.0.0.1').then((s) => { s.onMessage((m) => { console.log('udp: ' + m.text); }); s.send('127.0.0.1', s.port, 'bridge-datagram'); });
