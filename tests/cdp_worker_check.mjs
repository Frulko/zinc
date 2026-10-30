// A scripted Chrome DevTools for the workers of zinc debug --cdp: node tests/cdp_worker_check.mjs <zinc> <main.ts>, with
// tests/data/worker_profile (a worker whose onmessage calls crunch). Target.setAutoAttach (flatten, waitForDebuggerOnStart), the worker
// announced by Target.attachedToTarget and waiting; on its session: its script, a breakpoint in its handler, the stop there with its stack,
// step into crunch, step over, its locals and the console (Runtime.evaluate) in its frame, the breakpoint removed, resume; the program runs
// to its end and the worker is detached. One line per check; exit 1 when one fails.
import { spawn } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
const [zinc, file] = process.argv.slice(2);
let failed = false;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed = true; };

const program = resolve(file);
const work = join(dirname(program), 'work.ts');
const p = spawn(zinc, ['debug', '--cdp=0', program], { stdio: ['ignore', 'pipe', 'pipe'] });
let out = '', err = '';
p.stdout.on('data', d => { out += d; });
const port = await new Promise((ok, ko) => {
  p.stderr.on('data', d => { err += d; const m = /localhost:(\d+)/.exec(err); if (m) ok(Number(m[1])); });
  p.on('exit', () => ko(new Error('zinc ended: ' + err)));
});
const exited = new Promise(ok => p.on('exit', code => ok(code)));
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl);
await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko; });
let next = 1;
const pending = new Map(), events = [], waiters = [];
const matches = (w, m) => w.method === m.method && (w.session ?? '') === (m.sessionId ?? '');
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id) { pending.get(m.id)?.(m); return; }
  const w = waiters.findIndex(x => matches(x, m));
  if (w >= 0) waiters.splice(w, 1)[0].ok(m.params); else events.push(m);
};
const call = (method, params = {}, session) => new Promise(ok => {
  const id = next++; pending.set(id, ok);
  ws.send(JSON.stringify(session ? { id, method, params, sessionId: session } : { id, method, params }));
});
const wait = (method, session) => {
  const i = events.findIndex(e => matches({ method, session }, e));
  if (i >= 0) return Promise.resolve(events.splice(i, 1)[0].params);
  return new Promise(ok => waiters.push({ method, session, ok }));
};
const timeout = (ms, what) => new Promise((_, ko) => setTimeout(() => ko(new Error('timed out: ' + what)), ms));
const within = (pr, what) => Promise.race([pr, timeout(20000, what)]);

try {
  await call('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  await call('Runtime.enable');
  await call('Debugger.enable');
  await call('Runtime.runIfWaitingForDebugger');
  const entry = await within(wait('Debugger.paused'), 'the main program at its first statement');
  check(entry.callFrames[0].url === 'file://' + program, `main paused at its first statement (line ${entry.callFrames[0].location.lineNumber + 1})`);
  await call('Debugger.resume');
  const att = await within(wait('Target.attachedToTarget'), 'the worker attached');
  const S = att.sessionId;
  check(att.targetInfo.type === 'worker' && att.targetInfo.title === 'zinc worker work.ts#1' && att.targetInfo.url === 'file://' + work,
    `attachedToTarget: ${att.targetInfo.type} "${att.targetInfo.title}" ${att.targetInfo.url}`);
  check(att.waitingForDebugger === true, 'the worker waits for its debugger');
  await call('Runtime.enable', {}, S);
  await call('Debugger.enable', {}, S);
  const scripts = events.filter(e => e.method === 'Debugger.scriptParsed' && e.sessionId === S).map(e => e.params.url);
  check(scripts.includes('file://' + work), `the worker's scripts: ${scripts.join(' ')}`);
  const line = 10;   // const sum = crunch(e.data.n);  (0-based 10: line 11)
  const bp = await call('Debugger.setBreakpointByUrl', { url: 'file://' + work, lineNumber: line }, S);
  check(bp.sessionId === S && bp.result?.locations?.[0]?.lineNumber === line, `a breakpoint in the worker: ${JSON.stringify(bp.result ?? bp.error)}`);
  await call('Runtime.runIfWaitingForDebugger', {}, S);
  let paused = await within(wait('Debugger.paused', S), 'the worker at its breakpoint');
  const frames = paused.callFrames.map(f => `${f.functionName}:${f.location.lineNumber + 1}`);
  check(paused.callFrames[0].url === 'file://' + work && paused.callFrames[0].location.lineNumber === line && paused.hitBreakpoints?.[0] === bp.result.breakpointId,
    `the worker paused at its breakpoint: ${frames.join(', ')}`);
  await call('Debugger.stepInto', {}, S);
  paused = await within(wait('Debugger.paused', S), 'step into');
  check(paused.callFrames[0].functionName === 'crunch' && paused.callFrames[0].location.lineNumber === 4, `step into: ${paused.callFrames[0].functionName}:${paused.callFrames[0].location.lineNumber + 1}`);
  await call('Debugger.stepOver', {}, S);
  paused = await within(wait('Debugger.paused', S), 'step over');
  check(paused.callFrames[0].functionName === 'crunch' && paused.callFrames[0].location.lineNumber === 5, `step over: ${paused.callFrames[0].functionName}:${paused.callFrames[0].location.lineNumber + 1}`);
  const locals = (await call('Runtime.getProperties', { objectId: paused.callFrames[0].scopeChain[0].object.objectId }, S)).result.result;
  const n = locals.find(l => l.name === 'n');
  check(n?.value?.value === 2000000, `the worker's locals: ${locals.map(l => l.name + '=' + (l.value.value ?? l.value.description)).join(' ')}`);
  const ev = (await call('Runtime.evaluate', { expression: 'n / 1000 + s' }, S)).result;
  check(ev.result?.value === 2000, `the console in the worker's frame: n / 1000 + s = ${JSON.stringify(ev.result)}`);
  await call('Debugger.removeBreakpoint', { breakpointId: bp.result.breakpointId }, S);
  await call('Debugger.resume', {}, S);
  await within(wait('Debugger.resumed', S), 'resumed');
  const detached = await within(wait('Target.detachedFromTarget'), 'the worker detached');
  check(detached.sessionId === S, 'the worker ended: detachedFromTarget');
  const code = await within(exited, 'the program ended');
  check(code === 0 && (out.match(/^done \d true$/gm) || []).length === 4, `the program ran to its end (exit ${code}): ${out.trim().split('\n').join(' | ')}`);
} catch (e) {
  check(false, String(e) + ' ' + err.slice(-400));
}
ws.close();
p.kill();
process.exit(failed ? 1 : 0);
