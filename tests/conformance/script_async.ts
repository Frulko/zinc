// zinc:script (docs/plugins/script.md): promises settled by the host on the Zinc event loop, async script
// functions, ES modules from strings (imports, relative names, exports called from the host), module errors.
// The Script is not disposed: its context is freed at exit (the --debug leak check covers it).
// zinc-test: requires heap>=4M
import { Script, ScriptError } from 'zinc:script';

const vm = new Script({ timeLimitMs: 100 });
const events: string[] = [];
vm.expose('note', (s: string) => { events.push(s); });
// a host function returning a promise, resolved later by a Zinc timer
vm.exposeAsync('later', (args: unknown[]) => new Promise<unknown>((resolve: (v: unknown) => void) => {
  setTimeout(() => { resolve({ value: (args[0] as number) * 10, from: 'host' }); }, 20);
}));
vm.exposeAsync('refuse', (args: unknown[]) => new Promise<unknown>((resolve: (v: unknown) => void, reject: (e: Error) => void) => {
  setTimeout(() => { reject(new RangeError('no ' + (args[0] as string))); }, 5);
}));

vm.eval(`
async function main(n) {
  note('start ' + n);
  const r = await later(n);
  note('got ' + r.value + ' from ' + r.from);
  let msg = '';
  try { await refuse('way'); } catch (e) { msg = e.name + ': ' + e.message; }
  note(msg);
  return r.value + 1;
}
`, 'main.js');

async function run(): Promise<void> {
  const v = await vm.callAsync('main', [4]);
  console.log('main ->', v, events.join(' / '));
  console.log('eval async ->', await vm.evalAsync('later(2).then(r => r.value * 2)'));
  console.log('plain value ->', await vm.evalAsync('"no promise"'));
  try { await vm.evalAsync('Promise.reject(new TypeError("rejected"))'); }
  catch (e) { if (e instanceof ScriptError) console.log('rejected ->', e.kind, e.message); }
  try { await vm.evalAsync('(async () => { await later(1); null.x; })()', 'late.js'); }
  catch (e) { if (e instanceof ScriptError) console.log('late ->', e.kind, e.type, e.line); }

  // ES modules: defined sources, relative imports, exports reachable from call()
  vm.define('lib/math.js', 'export const k = 3;\nexport function scale(x) { return x * k; }');
  vm.define('lib/fmt.js', "import { k } from './math.js';\nexport const fmt = x => `${x} (k=${k})`;");
  vm.load('mod.js', "import { scale } from './lib/math.js';\nimport { fmt } from './lib/fmt.js';\nexport function onTick(dt) { return fmt(scale(dt)); }\nnote('mod loaded');");
  console.log(vm.call('onTick', [2]), events[events.length - 1]);
  try { vm.load('broken.js', "import { x } from './missing.js';\nexport const y = x;"); }
  catch (e) { if (e instanceof ScriptError) console.log('missing ->', e.kind, e.type, e.message); }
  try { vm.load('throws.js', 'export const a = 1;\nthrow new Error("module failed");'); }
  catch (e) { if (e instanceof ScriptError) console.log('throws ->', e.kind, e.message, e.line); }
  try { vm.load('syntax.js', 'export const = 1;'); }
  catch (e) { if (e instanceof ScriptError) console.log('syntax ->', e.kind, e.line); }
  // an async loop runs under the time limit too
  try { await vm.evalAsync('(async () => { await later(1); for (;;) {} })()'); }
  catch (e) { if (e instanceof ScriptError) console.log('async loop ->', e.kind); }
  console.log('still usable ->', vm.eval('1 + 1'));
  // disposing a context rejects what it still owed
  const other = new Script({});
  other.exposeAsync('never', (args: unknown[]) => new Promise<unknown>((resolve: (v: unknown) => void) => {}));
  const owed = other.evalAsync('never()');
  other.dispose();
  try { await owed; } catch (e) { if (e instanceof ScriptError) console.log('disposed ->', e.kind, e.message); }
}
run();
