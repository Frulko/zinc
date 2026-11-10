const identities: ((candidate: (n: number) => number) => boolean)[] = [];

function makeArrow(base: number) {
  const state = { base, calls: 0 };
  const f = (n: number): number => {
    state.calls++;
    if (n === 0) {
      identities.push((candidate: (n: number) => number): boolean => candidate === f);
      return state.base;
    }
    return n * f(n - 1);
  };
  return { f, state };
}

function arrow(): void {
  const model = makeArrow(2);
  console.log('arrow', model.f(4), model.state.calls);
  const check = identities.shift();
  console.log('identity', check(model.f));
  model.state.base = 3;
  console.log('capture', model.f(3), model.state.calls);
  identities.shift();
}

function named(): void {
  let holder = function recur(n: number): number {
    if (n === 0) {
      identities.push((candidate: (n: number) => number): boolean => candidate === recur);
      return 3;
    }
    return n * recur(n - 1);
  };
  const original = holder;
  holder = (n: number): number => 99;
  console.log('named', original(3), holder(3));
  const check = identities.shift();
  console.log('named identity', check(original));
}

function makeSibling(): (n: number) => number {
  function sibling(n: number): number { return f(n); }
  const f = (n: number): number => n === 0 ? 2 : n * f(n - 1);
  return sibling;
}

function mutable(): void {
  let f = (n: number): number => n === 0 ? 1 : n * f(n - 1);
  const old = f;
  f = (n: number): number => 7;
  console.log('let', old(2));
}

function caught(): void {
  const f = (n: number): void => {
    if (n === 0) throw new Error('recursive');
    f(n - 1);
  };
  try { f(2); } catch (error) { console.log('caught'); }
}

function makeTimer(): (n: number) => void {
  const f = (n: number): void => {
    if (n < 2) setTimeout(() => f(n + 1), 0);
    else console.log('timer', n);
  };
  return f;
}

arrow();
named();
console.log('sibling', makeSibling()(3));
mutable();
caught();
makeTimer()(0);
