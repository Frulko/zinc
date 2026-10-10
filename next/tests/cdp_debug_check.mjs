// A scripted Chrome DevTools for zinc debug --cdp (ZN-371.04): node tests/cdp_debug_check.mjs <zinc> <main.ts> [--pause <loop.ts>].
// Discovery, the Sources panel's scripts and their text, a breakpoint by URL, Debugger.paused with the stack, the locals through
// Runtime.getProperties (a Point and an array unfolded), evaluateOnCallFrame, step into, over and out, resume to the end; --pause: a running loop
// stops at Debugger.pause. One line per check; exit 1 when one fails.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const [zinc, file] = process.argv.slice(2);
const pauseFile = process.argv.includes('--pause') ? process.argv[process.argv.indexOf('--pause') + 1] : null;
let failed = false;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed = true; };

async function session(program, body) {
  const p = spawn(zinc, ['debug', '--cdp=0', program], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  p.stdout.on('data', d => { out += d; });
  const port = await new Promise((ok, ko) => {
    p.stderr.on('data', d => { err += d; const m = /localhost:(\d+)/.exec(err); if (m) ok(Number(m[1])); });
    p.on('exit', () => ko(new Error('zinc ended: ' + err)));
  });
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  check(list[0].type === 'node' && list[0].webSocketDebuggerUrl.endsWith('/zinc-debug'), `discovery: ${list[0].type} ${list[0].webSocketDebuggerUrl}`);
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
  const call = (method, params = {}) => new Promise(ok => { const id = next++; pending.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
  const wait = method => { const i = events.findIndex(e => e.method === method); if (i >= 0) return Promise.resolve(events.splice(i, 1)[0].params); return new Promise(ok => waiters.push({ method, ok })); };
  const exited = new Promise(ok => p.on('exit', code => ok(code)));
  await body({ call, wait, events, exited, output: () => out });
  ws.close();
  p.kill();
}

const program = resolve(file);
await session(program, async ({ call, wait, events, exited, output }) => {
  await call('Runtime.enable');
  await call('Debugger.enable');
  const scripts = events.filter(e => e.method === 'Debugger.scriptParsed').map(e => e.params);
  const main = scripts.find(s => s.url === 'file://' + program);
  check(main && scripts.length === 1, `scriptParsed: ${scripts.map(s => s.url).join(' ')}`);
  const src = (await call('Debugger.getScriptSource', { scriptId: main.scriptId })).result.scriptSource;
  check(src.includes('function add(a: number, b: number)'), 'getScriptSource: the file as written');
  const bp = (await call('Debugger.setBreakpointByUrl', { url: 'file://' + program, lineNumber: 18 })).result;
  check(bp.breakpointId && bp.locations[0].lineNumber === 18, `setBreakpointByUrl line 19: ${JSON.stringify(bp)}`);
  await call('Runtime.runIfWaitingForDebugger');
  let paused = await wait('Debugger.paused');
  check(paused.callFrames[0].location.lineNumber === 23, `paused at the first statement (line ${paused.callFrames[0].location.lineNumber + 1})`);
  await call('Debugger.resume');
  paused = await wait('Debugger.paused');
  const frames = paused.callFrames.map(f => `${f.functionName}:${f.location.lineNumber + 1}`);
  check(JSON.stringify(frames) === JSON.stringify(['run:19', '<top level>:24']) && paused.hitBreakpoints?.[0] === bp.breakpointId, `paused at the breakpoint: ${frames}`);
  const scope = paused.callFrames[0].scopeChain[0].object.objectId;
  const locals = Object.fromEntries((await call('Runtime.getProperties', { objectId: scope })).result.result.map(p => [p.name, p.value]));
  check(locals.total.type === 'number' && locals.total.value === 0 && locals.name.value === 'zinc' && locals.v.value === 1, 'locals: total 0, name "zinc", v 1');
  const fields = Object.fromEntries((await call('Runtime.getProperties', { objectId: locals.p.objectId })).result.result.map(p => [p.name, p.value.value]));
  check(locals.p.className === 'Point' && fields.x === 1 && fields.y === 2, `p unfolds: ${JSON.stringify(fields)}`);
  const items = (await call('Runtime.getProperties', { objectId: locals.list.objectId })).result.result.map(p => p.value.value);
  check(locals.list.subtype === 'array' && JSON.stringify(items) === '[1,2,3]', `list unfolds: ${JSON.stringify(items)}`);
  const ev = (await call('Debugger.evaluateOnCallFrame', { callFrameId: paused.callFrames[0].callFrameId, expression: 'total' })).result.result;
  check(ev.type === 'number' && ev.value === 0, 'evaluateOnCallFrame total');
  await call('Debugger.stepInto');
  paused = await wait('Debugger.paused');
  check(paused.callFrames[0].functionName === 'add' && paused.callFrames[0].location.lineNumber === 8, `stepInto: ${paused.callFrames[0].functionName} line ${paused.callFrames[0].location.lineNumber + 1}`);
  await call('Debugger.stepOver');
  paused = await wait('Debugger.paused');
  check(paused.callFrames[0].location.lineNumber === 9, `stepOver: line ${paused.callFrames[0].location.lineNumber + 1}`);
  await call('Debugger.stepOut');
  paused = await wait('Debugger.paused');
  check(paused.callFrames[0].functionName === 'run', `stepOut: back in ${paused.callFrames[0].functionName}`);
  await call('Debugger.removeBreakpoint', { breakpointId: bp.breakpointId });
  await call('Debugger.resume');
  const code = await exited;
  check(code === 0 && output().includes('zinc 6 1\ndone'), `ran to the end: exit ${code}, ${JSON.stringify(output())}`);
});

if (pauseFile) await session(resolve(pauseFile), async ({ call, wait }) => {
  await call('Runtime.enable');
  await call('Debugger.enable');
  await call('Runtime.runIfWaitingForDebugger');
  await wait('Debugger.paused');
  await call('Debugger.resume');
  await new Promise(r => setTimeout(r, 300));
  await call('Debugger.pause');
  const paused = await wait('Debugger.paused');
  const line = paused.callFrames[0].location.lineNumber + 1;
  check(line === 3 || line === 4, `Debugger.pause stops the running loop (line ${line})`);
});
process.exit(failed ? 1 : 0);
