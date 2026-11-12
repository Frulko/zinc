import { setup, select, read, write, watch, unwatch, release, simulate, PinEdge } from 'zinc:gpio';
import N from '../../../plugins/gpio/native/gpio.spec';
function assert(ok: boolean): void { if (!ok) throw new Error('gpio assertion'); }
select(17, 'sim', '17'); setup(17, 'out', 'none', 'open-drain', 1); assert(read(17) === 1); write(17, 0); assert(read(17) === 0);
let errors: i32 = 0;
try { simulate(17, 1); } catch (e) { errors++; }
try { setup(17, 'bad', 'none'); } catch (e) { errors++; }
assert(errors === 2 && read(17) === 0);
release(17); select(27, 'sim', '27');
let stale: i32 = 0; let delivered: i32 = 0;
watch(27, 'both', 0, (e: PinEdge) => { stale++; });
setup(27, 'in', 'up'); assert(read(27) === 1); simulate(27, 0); unwatch(27); unwatch(27);
watch(27, 'both', 0, (e: PinEdge) => { stale++; }); simulate(27, 1); release(27);
select(27, 'sim', '27'); setup(27, 'in', 'none');
watch(27, 'rising', 50, (e: PinEdge) => { assert(e.pin === 27 && e.value === 1 && e.timestampMs > 0 && e.sequence > 0); delivered++; });
simulate(27, 1); simulate(27, 0); simulate(27, 1);
setTimeout(() => { assert(stale === 0 && delivered === 1); release(27); console.log('gpio public ok'); }, 5);

// Native generation guards reject stale pollers and discard events when replacing a watcher.
assert(N.select(28, 'sim', '28') && N.setup(28, 'in', 'none', 'push-pull', 0));
const oldGeneration = N.watch(28, 'both', 0); assert(oldGeneration > 0 && N.simulate(28, 1));
const newGeneration = N.watch(28, 'rising', 0);
assert(newGeneration > oldGeneration && N.poll(28, oldGeneration).length === 0 && N.poll(28, newGeneration).length === 0);
assert(N.simulate(28, 0) && N.simulate(28, 1)); N.release(28); N.release(28);
assert(N.setup(28, 'in', 'none', 'push-pull', 0) && N.poll(28, newGeneration).length === 0); N.release(28);

assert(N.select(29, 'sim', 'CHIP:CSID7') && N.setup(29, 'out', 'none', 'push-pull', 1));
assert(!N.select(29, '', 'CHIP:CSID0') && N.read(29) === 1); N.release(29);
