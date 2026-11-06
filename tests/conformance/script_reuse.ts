// zinc:script: a disposed Script keeps its handle; a new Script may take the same slot of the engine's table. The stale one must not evaluate in the
// new context, and a host promise it still owed must not settle the new context's call of the same id (ZN-995).
import { Script } from 'zinc:script';

let releaseA: (v: unknown) => void = (v: unknown) => {};
let releaseB: (v: unknown) => void = (v: unknown) => {};
const a = new Script({});
a.set('who', 'a');
a.exposeAsync('wait', (args: unknown[]) => new Promise<unknown>((r: (v: unknown) => void) => { releaseA = r; }));
const owedA = a.evalAsync('wait()');
a.dispose();
const b = new Script({});
b.set('who', 'b');
b.exposeAsync('wait', (args: unknown[]) => new Promise<unknown>((r: (v: unknown) => void) => { releaseB = r; }));
const owedB = b.evalAsync('wait().then(v => "b settled with " + v)');
try { console.log('stale eval ->', a.eval('who')); } catch (e) { console.log('stale eval ->', e.message); }
try { a.set('who', 'stale'); } catch (e) { console.log('stale set ->', e.message); }

async function run(): Promise<void> {
  releaseA('a');
  await Promise.resolve<unknown>(0);
  releaseB('b');
  try { await owedA; } catch (e) { console.log('a owed ->', e.message); }
  console.log(await owedB);
  console.log('b who ->', b.eval('who'));
  b.dispose();
}
run();
