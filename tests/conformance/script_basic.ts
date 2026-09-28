// zinc:script (docs/plugins/script.md): eval, values in and out, typed host functions, calls into the script,
// function handles, errors with their line numbers, time and memory limits. QuickJS natively, node:vm on the sim.
// zinc-test: requires heap>=4M
import { Script, ScriptError, ScriptFunction } from 'zinc:script';

class Config { name: string = 'demo'; speed: number = 1.5; tags: string[] = ['a', 'b']; }

const vm = new Script({ memoryLimit: 8 << 20, timeLimitMs: 50 });
console.log('engine', vm.engine.name);

// eval: completion values as Dyn
console.log(vm.eval('1 + 2'));
console.log(JSON.stringify(vm.eval('({ a: [1, "two", true, null], b: { c: 2.5 } })')));
console.log(vm.eval('"é" + "t" + "é"'), vm.eval('typeof undefined'), vm.eval('[1, 2, 3].map(x => x * x).join("-")'));
vm.eval('var counter = 0; let limit = 3;');
console.log(vm.eval('++counter + limit'), vm.eval('++counter + limit'));

// data in
vm.set('config', new Config());
vm.set('list', [1, 2, 3]);
console.log(JSON.stringify(vm.eval('({ n: config.name, s: config.speed * 2, t: config.tags.length, sum: list.reduce((a, b) => a + b, 0) })')));
console.log(JSON.stringify(vm.get('config')), vm.get('nothing'));

// host functions with typed signatures: arguments converted like JavaScript
const logged: string[] = [];
let color: i32[] = [0, 0, 0];
vm.expose('log', (msg: string) => { logged.push(msg); });
vm.expose('setColor', (r: i32, g: i32, b: i32) => { color = [r, g, b]; });
vm.expose('add', (a: number, b: number) => a + b);
vm.expose('describe', (v: unknown, flag: boolean) => `${typeof v}/${flag}`);
vm.expose('fail', (why: string) => { throw new Error('host says ' + why); });
vm.eval('log("hello from the script"); log(42); setColor(255, "128", 3.9)');
console.log(logged.join(' | '), color.join(','), vm.eval('add(2, 3) * 2'), vm.eval('describe([1], 0) + " " + describe("x", "yes")'));
console.log(vm.eval('try { fail("no") } catch (e) { e instanceof Error ? "caught " + e.message : "?" }'));

// calls into the script, function handles
vm.eval('function onTick(dt, state) { state.t += dt; return { t: state.t, doubled: state.t * 2 }; }');
console.log(JSON.stringify(vm.call('onTick', [0.5, { t: 1 }])));
const tick = vm.fn('onTick');
if (tick !== null) console.log(JSON.stringify((tick as ScriptFunction).call([1, { t: 10 }])));
console.log(vm.fn('missing') === null);
let saved: unknown = null;
vm.expose('keep', (f: unknown) => { saved = f; });
vm.eval('keep(x => "called with " + x)');
const cb = vm.toFunction(saved);
if (cb !== null) console.log((cb as ScriptFunction).call([7]));
console.log(vm.toFunction(42) === null);

// errors: kind, type, message, line
function report(label: string, f: () => void): void {
  try { f(); console.log(label, 'no error'); }
  catch (e) {
    if (e instanceof ScriptError) console.log(label, e.kind, e.type, e.line, e.file);
    else console.log(label, 'other', e.message);
  }
}
report('throw', () => { vm.eval('function boom() {\n  throw new Error("boom");\n}\nboom();', 'boom.js'); });
report('reference', () => { vm.eval('let a = 1;\n\nundefinedThing + a', 'ref.js'); });
report('syntax', () => { vm.eval('let x = 1;\nlet y = ;\n', 'bad.js'); });
report('call', () => { vm.call('nope', []); });
report('host', () => { vm.eval('\nfail("inside")', 'host.js'); });
try { vm.eval('throw new TypeError("typed")', 'm.js'); } catch (e) { console.log(`${e}`, e.message); }
try { vm.eval('throw 42'); } catch (e) { console.log(e.message); }

// limits: an infinite loop is stopped, the script stays usable; an allocation over the limit fails
report('loop', () => { vm.eval('while (true) {}'); });
console.log(vm.eval('counter'));
report('memory', () => { vm.eval('"x".repeat(2 ** 29).length'); });
console.log(vm.eval('"alive"'));

vm.dispose();
report('disposed', () => { vm.eval('1'); });
