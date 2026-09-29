function* values(): Generator<number> { yield 1; yield 2; yield 3; }
const broken = values();
for (const value of broken) { console.log('break', value); break; }
for (const value of broken) console.log('unexpected', value);
const returned = values();
function take(): number { for (const value of returned) return value; return 0; }
console.log('return', take());
for (const value of returned) console.log('unexpected', value);
const thrown = values();
try { for (const value of thrown) { console.log('throw', value); throw new Error('body'); } } catch (error) { console.log(error.message); }
for (const value of thrown) console.log('unexpected', value);
const continued = values();
for (const value of continued) { if (value < 3) continue; console.log('continue', value); }
const delegate = values();
function* outer(): Generator<number> { yield* delegate; }
for (const value of outer()) { console.log('delegated', value); break; }
for (const value of delegate) console.log('unexpected', value);
const nested = values();
function* wrapper(): Generator<number> { for (const value of nested) yield value; }
for (const value of wrapper()) { console.log('nested', value); break; }
for (const value of nested) console.log('unexpected', value);
function* cleaned(): Generator<number> { try { yield 10; yield 20; } finally { console.log('cleanup'); } }
const cleanedOnce = cleaned();
for (const value of cleanedOnce) { console.log('clean', value); break; }
for (const value of cleanedOnce) console.log('unexpected', value);
function* caught(): Generator<number> { try { try { yield 11; } finally { console.log('inner cleanup'); } } finally { console.log('outer cleanup'); } }
for (const value of caught()) { console.log('nested cleanup', value); break; }
function* cleanupThrows(): Generator<number> { try { yield 12; } finally { throw new Error('cleanup error'); } }
try { for (const value of cleanupThrows()) { console.log('cleanup throw', value); break; } } catch (error) { console.log('close rejected', error.message); }
try { for (const value of cleanupThrows()) { console.log('body throw', value); throw new Error('body wins'); } } catch (error) { console.log('close preserves', error.message); }
function* loopCleanup(): Generator<number> {
  for (let i = 0; i < 3; i++) { try { yield i; if (i === 0) continue; break; } finally { console.log('iteration cleanup', i); } }
}
for (const value of loopCleanup()) console.log('iteration', value);
async function asyncTake(): Promise<number> { for (const value of cleaned()) return Promise.resolve(value); return 0; }
async function asyncCheck(): Promise<void> { console.log('async return', await asyncTake()); }
asyncCheck();
let sum = 0;
for (let i = 0; i < 300; i++) { const stream = values(); for (const value of stream) { sum += value; break; } }
console.log('gc close', sum);
