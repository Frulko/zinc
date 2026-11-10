import { structuredClone } from 'zinc:web';
function assert(ok) { if (!ok) throw new Error('native iterator/clone regression'); }
let next = 0, done = 0, closed = 0;
const iterator = {
  next() { next++; return { get done() { done++; return next > 1; }, get value() { throw new Error('skipped value'); } }; },
  return() { closed++; return {}; },
  [Symbol.iterator]() { return this; }
};
const [,] = iterator;
assert(next === 1 && done === 1 && closed === 1);
const exhausted = {
  next() { next++; return { done: true, get value() { throw new Error('done value'); } }; },
  return() { throw new Error('exhausted return'); },
  [Symbol.iterator]() { return this; }
};
const [,,] = exhausted;
assert(next === 2);
for (const failure of ['next', 'done']) {
  const broken = {
    next() { if (failure === 'next') throw new Error('next'); return { get done() { throw new Error('done'); } }; },
    return() { throw new Error('unexpected close'); },
    [Symbol.iterator]() { return this; }
  };
  try { const [,] = broken; throw new Error('missing failure'); } catch (error) { assert(error.message === failure); }
}
let getterCalls = 0;
const copied = structuredClone({ get x() { return ++getterCalls; } });
assert(copied.x === 1 && getterCalls === 1);
const original = new TypeError('unsupported object class');
try { structuredClone({ get value() { throw original; } }); throw new Error('missing getter failure'); }
catch (error) { assert(error === original); }
console.log('native iterator and clone ordering: pass');
