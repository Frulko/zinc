function* source(): Generator<number> { yield 1; yield 2; return 3; }
const values = source();
let result = values.next(); console.log(result.done, result.value);
result = values.next(); console.log(result.done, result.value);
result = values.next(); console.log(result.done, result.value);
result = values.next(); console.log(result.done, result.value, result.value === undefined);
const stopped = source();
console.log('before', stopped.next().value);
const finish = stopped.return(9); console.log('return', finish.done, finish.value);
console.log('after', stopped.next().done, stopped.next().value);
const unopened = source(); console.log('unopened', unopened.return(8).value, unopened.next().done);
function* recover(): Generator<number> { try { yield 4; } catch (error) { console.log('injected', error.message); yield 5; } return 6; }
const caught = recover(); console.log('first', caught.next().value);
const recovered = caught.throw(new Error('recover')); console.log('throw result', recovered.done, recovered.value);
console.log('recovered return', caught.next().value);
try { caught.throw(new Error('after done')); } catch (error) { console.log(error.message); }
function* delegated(): Generator<number> { yield* recover(); }
const forwarding = delegated(); console.log('delegate first', forwarding.next().value);
console.log('delegate throw', forwarding.throw(new Error('forwarded')).value);
console.log('delegate done', forwarding.next().done);
function* arrayDelegate(): Generator<number> { yield* [10, 20]; }
const array = arrayDelegate(); array.next();
try { array.throw(new Error('missing')); } catch (error) { console.log('missing throw', error.name); }
function* typed(): Generator<number, void> { yield 21; }
const narrow = typed().next();
if (!narrow.done) console.log('narrowed', narrow.value + 1);
function* empty(): Generator<number> { return; }
const absent = empty().next(); console.log('absent', typeof absent.value, absent.value === null, absent.value === undefined);
function* words(): Generator<string> { yield 'hello'; return 'bye'; }
const strings = words(); console.log('string', strings.next().value, strings.next().value, strings.next().value);
interface Item { name: string; }
function* objects(): Generator<Item> { yield { name: 'object' }; }
const item = objects().next();
if (!item.done) console.log('object', item.value.name);
const original: Item = { name: 'identity' };
function* sameObject(): Generator<Item> { yield original; }
const identity = sameObject().next();
if (!identity.done) console.log('identity', identity.value === original);
let total = 0;
for (let i = 0; i < 300; i++) { const g = typed(); const r = g.next(); if (!r.done) total += r.value; const end = g.return(); if (end.value === undefined) total++; }
console.log('gc api', total);
const mutable = source().next(); mutable.value = 42; mutable.done = true;
console.log('record', mutable.done, mutable.value);
console.log(source().next());
console.log(empty().next());
function* reentered(): Generator<number> { try { recursive.next(); } catch (error) { console.log('reentry', error.name); } yield 99; }
const recursive = reentered(); console.log('reentry value', recursive.next().value);
console.log('fallback', empty().next().value ?? 7, source().next().value ?? 7);
function* dynamicValues(): Generator<any> { yield undefined; yield null; yield false; yield 0; yield ''; yield 3; }
const dynamic = dynamicValues();
for (let i = 0; i < 6; i++) { const r = dynamic.next(); console.log('dynamic', r.value, typeof r.value, !!r.value); }
function* explode(): Generator<number> { throw new Error('next error'); }
try { console.log('unexpected', explode().next().value ?? 9); } catch (error) { console.log('expression error', error.message); }
