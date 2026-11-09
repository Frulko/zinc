// zinc:net serve(port, handler, { hostname }) (tests/t0/net_hostname.sh): a server on 127.0.0.1 answers this machine and is not reachable from the
// network (the dev bridge of zinc dev --target web listens so); an address that is not an IP is refused with the reason.
import { serve } from 'zinc:net';

let bad = '';
try { serve(0, () => ({ status: 200, body: '', contentType: 'text/plain' }), { hostname: 'nope' }); } catch (e) { bad = (e as Error).message; }
console.log('bad hostname: ' + bad);
const port = serve(0, (req) => ({ status: 200, body: 'loopback ' + (req.remoteAddress ?? ''), contentType: 'text/plain' }), { hostname: '127.0.0.1' });
console.log('ready ' + port);
