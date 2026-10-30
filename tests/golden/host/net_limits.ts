import { serve, serveAsync, stop, BodyStream, Reply, Request, ReplyWriter } from 'zinc:net';
import * as sys from 'zinc:sys';
// The limits and the streams of the zinc:net server (ZN-892), driven by tests/t0/net_limits.py: port a with small limits, port b with a
// request rate, port c with streamed bodies both ways. GET /quit on any of them stops them all.
const a = sys.args();
const quit = (req: Request): boolean => { if (req.path !== '/quit') return false; stop(); return true; };
const small = (req: Request): Reply => {
  if (quit(req)) return { status: 200, body: 'bye', contentType: 'text/plain' };
  return { status: 200, body: req.method + ' ' + req.path + ' ' + req.body.length, contentType: 'text/plain' };
};
serve(parseInt(a[0]) as i32, small, { maxHeaderBytes: 1024, maxBodyBytes: 1000, maxConnectionsPerIp: 3, headersTimeoutMs: 300, requestTimeoutMs: 300, keepAliveTimeoutMs: 300 });
serve(parseInt(a[1]) as i32, small, { requestsPerSecondPerIp: 3 });
const streamed = async (req: Request): Promise<Reply> => {
  if (quit(req)) return { status: 200, body: 'bye', contentType: 'text/plain' };
  if (req.path === '/upload') {
    let bytes = 0;
    let chunks = 0;
    await (req.bodyStream as BodyStream).each((c: string) => { bytes += c.length; chunks++; });
    return { status: 200, body: 'got ' + bytes + ' bytes in ' + (chunks > 0 ? 'chunks' : 'none'), contentType: 'text/plain' };
  }
  // a reply in parts: 40 pieces of 64 KiB, waiting for the socket to drain when write says so
  return {
    status: 200, body: '', contentType: 'application/octet-stream',
    stream: (w: ReplyWriter) => {
      const piece = 'z'.repeat(65536);
      let left = 40;
      const pump = (): void => {
        while (left > 0) {
          left--;
          if (!w.write(piece) && left > 0) { w.onDrain(pump); return; }
        }
        w.end();
      };
      pump();
    },
  };
};
serveAsync(parseInt(a[2]) as i32, streamed, { streamBody: true });
console.log('ready');
