// Chrome DevTools on --engine v8 (ZN-773.05): node tests/v8_inspect_check.mjs <zinc> <main.js>. zinc run --engine v8 --inspect-brk=0 waits for
// a client; discovery, the program's script with its source map inline, the pause at its first statement, a `debugger` statement with its
// frame (the function's name through the map, a local evaluated on the frame), console.log in DevTools' Console, the run to its end.
import { spawn } from 'node:child_process';
const [zinc, file] = process.argv.slice(2);
let failed = false;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed = true; };
const p = spawn(zinc, ['run', file, '--engine', 'v8', '--inspect-brk=0'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ZINC_STEPS: '0' } });
let out = '', err = '';
p.stdout.on('data', d => { out += d; });
const exited = new Promise(ok => p.on('exit', ok));
const port = await new Promise((ok, ko) => {
  p.stderr.on('data', d => { err += d; const m = /localhost:(\d+)/.exec(err); if (m) ok(Number(m[1])); });
  p.on('exit', () => ko(new Error('zinc ended: ' + err)));
});
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
check(list[0].type === 'node' && list[0].webSocketDebuggerUrl.endsWith('/zinc-v8') && list[0].url.endsWith('main.js'), `discovery: ${list[0].webSocketDebuggerUrl} ${list[0].url}`);
const ws = new WebSocket(list[0].webSocketDebuggerUrl);
await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko; });
let next = 1;
const pending = new Map(), events = [], waiters = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id) { pending.get(m.id)?.(m); return; }
  const w = waiters.findIndex(x => x.method === m.method);
  if (w >= 0) waiters.splice(w, 1)[0].ok(m.params); else events.push(m);
};
const send = (method, params = {}) => new Promise(ok => { const id = next++; pending.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
const wait = method => { const i = events.findIndex(e => e.method === method); if (i >= 0) return Promise.resolve(events.splice(i, 1)[0].params);
  return Promise.race([new Promise(ok => waiters.push({ method, ok })), new Promise((_, ko) => setTimeout(() => ko(new Error('no ' + method)), 20000))]); };
await send('Runtime.enable');
await send('Debugger.enable');
await send('Runtime.runIfWaitingForDebugger');
const first = await wait('Debugger.paused');
check(first.reason === 'other' || first.reason === 'Break on start', `paused at the first statement (${first.reason})`);
const scripts = events.filter(e => e.method === 'Debugger.scriptParsed').map(e => e.params);
const bundle = scripts.find(s => s.url.endsWith('bundle.js'));
check(bundle && bundle.sourceMapURL.startsWith('data:application/json'), `the bundle with its source map inline: ${bundle ? bundle.url : 'none'}`);
await send('Debugger.resume');
const at = await wait('Debugger.paused');
const frame = at.callFrames[0];
check(frame.functionName === 'twice', `the debugger statement in ${frame.functionName}`);
const y = await send('Debugger.evaluateOnCallFrame', { callFrameId: frame.callFrameId, expression: 'y + 1' });
check(y.result?.result?.value === 43, `y + 1 on the frame: ${JSON.stringify(y.result?.result)}`);
await send('Debugger.resume');
const log = await wait('Runtime.consoleAPICalled');
check(log.type === 'log' && log.args.map(a => a.value).join(' ') === 'hello 42', `console.log in DevTools: ${log.args.map(a => a.value).join(' ')}`);
const code = await exited;
check(code === 0 && out.includes('hello 42'), `the program ends (${code}): ${out.trim()}`);
ws.close();
process.exit(failed ? 1 : 0);
