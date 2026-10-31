// The WebSocket client of tools/bench-http (run by Bun): `echo URL CONNS SECS SIZE` keeps CONNS connections each sending a SIZE-byte text
// message and waiting for its echo, and prints {msgs per second, p50, p99 in ms}; `idle URL CONNS` opens CONNS connections, prints
// "open", and holds them until stdin closes.
const [mode, url, connsArg, secsArg, sizeArg] = process.argv.slice(2);
const conns = +connsArg;
const open = (): Promise<WebSocket> => new Promise((resolve, reject) => {
  const ws = new WebSocket(url);
  ws.onopen = () => resolve(ws);
  ws.onerror = () => reject(new Error('cannot connect to ' + url));
});
const all: WebSocket[] = [];
for (let i = 0; i < conns; i += 50) all.push(...await Promise.all(Array.from({ length: Math.min(50, conns - i) }, open)));
if (mode === 'idle') {
  console.log('open');
  for await (const _ of console) { }
  process.exit(0);
}
const msg = 'x'.repeat(+sizeArg || 32);
const lat: number[] = [];
let stop = false;
const run = (ws: WebSocket) => new Promise<void>((done) => {
  let t = 0;
  ws.onmessage = () => {
    lat.push(performance.now() - t);
    if (stop) { done(); return; }
    t = performance.now(); ws.send(msg);
  };
  t = performance.now(); ws.send(msg);
});
const t0 = performance.now();
setTimeout(() => { stop = true; }, +secsArg * 1000);
await Promise.all(all.map(run));
const secs = (performance.now() - t0) / 1000;
lat.sort((a, b) => a - b);
console.log(JSON.stringify({ mps: Math.round(lat.length / secs), p50: +lat[lat.length >> 1].toFixed(3), p99: +lat[Math.floor(lat.length * 0.99)].toFixed(3) }));
process.exit(0);
