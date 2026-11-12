class Resource { dispose(): void {} }
class Owner {
  resource: Resource;
  constructor() {
    try { this.resource = new Resource(); }
    catch (error) { throw error; }
  }
}
let previous = new Resource();
function replace(): void {
  let next: Resource | null = null;
  try { next = new Resource(); }
  catch (error) { return; }
  previous = next;
}
function check(ok: boolean, why: string): void { if (!ok) throw new Error(why); }
replace();
check(new Owner().resource instanceof Resource && previous instanceof Resource, 'original cleanup flow');
class Item {
  value: number;
  constructor(value: number) { this.value = value; }
}
class Reads {
  item: Item;
  constructor() {
    try { this.item = new Item(3); check(this.item.value === 3, 'read inside try'); }
    catch (error) { throw error; }
    check(this.item.value === 3, 'read after try');
  }
}
function caught(fail: boolean): number {
  let item: Item | null = null;
  try { if (fail) throw new Error('expected'); item = new Item(1); }
  catch (error) { item = new Item(2); }
  return item.value;
}
function nested(): number {
  let item: Item | null = null;
  try { try { item = new Item(4); } catch (error) { throw error; } }
  catch (error) { return -1; }
  return item.value;
}
function finalized(): number {
  let item: Item | null = null;
  try { item = new Item(5); } finally {}
  const first = item.value;
  try { item = new Item(6); } finally { item = new Item(7); }
  return first + item.value;
}
class FinallyInitializes {
  item: Item;
  constructor() { try {} finally { this.item = new Item(8); } }
}
function bothBranches(flag: boolean): number {
  let item: Item | null = null;
  if (flag) item = new Item(9); else item = new Item(10);
  return item.value;
}
let cleaned = 0;
class Rollback {
  item: Item;
  constructor(fail: boolean) {
    try { if (fail) { cleaned++; throw new Error('rollback'); } this.item = new Item(11); }
    catch (error) { throw error; }
  }
}
try { new Rollback(true); } catch (error) { check(cleaned === 1, 'partial rollback'); }
let loops = 0;
outer: for (let i = 0; i < 3; i++) {
  try { if (i === 0) continue outer; break outer; } finally { loops++; }
}
new Reads();
check(caught(false) === 1 && caught(true) === 2 && nested() === 4 && finalized() === 12, 'normal try joins');
check(new FinallyInitializes().item.value === 8 && bothBranches(true) === 9 && bothBranches(false) === 10, 'field/fact branches');
check(new Rollback(false).item.value === 11 && loops === 2, 'completion precedence');
function measured(flag: boolean): number {
  let value: number | undefined = undefined;
  try { if (flag) value = [1, 2].length; else value = 2.5; }
  catch (error) { return -1; }
  if (value === undefined) return -2;
  return value / 2;
}
check(measured(true) === 1 && measured(false) === 1.25, 'numeric stored kind at flow join');
console.log('try flow: pass');

// Later definite writes survive conservative invalidation of an earlier form.
function afterUnmodeled(flag: boolean): number {
  let v: Item | null = null;
  if (v === null) {
    while (flag) { v = null; break; }
    v = new Item(7);
  }
  let w: Item | null = null;
  try {
    flag ? (w = null) : (w = null);
    w = new Item(7);
  } catch (error) { throw error; }
  let q: Item | null = null;
  if (q === null) {
    flag && ((q = null) === null);
    q = new Item(7);
  }
  return v.value + w.value + q.value;
}
if (afterUnmodeled(false) !== 21) throw new Error("later definite writes lost");
