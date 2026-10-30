import { Reply, Request, fetch, serveAsync, stop } from 'zinc:net';
// zinc:net serveAsync: a handler that answers after the server's 10 s idle limit still gets its reply out (the limit is for a client that
// stops sending its request, not for a request that is complete), on loopback.
serveAsync(18851, (req: Request): Promise<Reply> => new Promise<Reply>((resolve) => {
  setTimeout(() => { resolve({ status: 200, body: 'late ' + req.path, contentType: 'text/plain' }); }, 11000);
}));
async function main(): Promise<void> {
  const r = await fetch('http://127.0.0.1:18851/answer', { timeoutMs: 30000 });
  console.log(r.status, await r.text());
  stop();
}
main();
