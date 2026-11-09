// A function read as a value is one object, as in JavaScript (ZN-376): `f === f`, indexOf and includes find it,
// a list of callbacks removes the one it added. A static method read as a value is one object too.
function f(): number { return 1; }
function g(x: number): number { return x * 2; }
class Tools {
  static twice(x: number): number { return x * 2; }
}
const a = f;
const b = f;
console.log(a === b, f === f, a === f);
const list: Array<() => number> = [];
list.push(f);
console.log(list.indexOf(f), list.includes(f));
const gs: Array<(x: number) => number> = [g, Tools.twice];
console.log(gs.indexOf(g), gs.indexOf(Tools.twice), Tools.twice === Tools.twice, gs.includes(g));
const steppers: Array<() => number> = [];
function addStepper(s: () => number): void { if (steppers.indexOf(s) < 0) steppers.push(s); }
function removeStepper(s: () => number): void { const i = steppers.indexOf(s); if (i >= 0) steppers.splice(i, 1); }
addStepper(f); addStepper(f);
console.log(steppers.length);
removeStepper(f);
console.log(steppers.length, a() + gs[0](3) + gs[1](4));

// A nullable object global read through `as` in one function while another function reads it (the laDebug case of ZN-376).
type Anim = { type?: string; property?: string };
type Config = { duration: number; create?: Anim };
let laNext: Config | null = null;
let laCfg: Config | null = null;
let laRunning = false;
const laFrom: number[] = [];
const laGone: number[] = [];
function laStart(): void {
  laCfg = laNext; laNext = null;
  laFrom.length = 0;
  const c = laCfg as Config;
  for (let i = 0; i < 3; i++) {
    if (c.create !== undefined && (c.create as Anim).property === 'opacity') { laFrom.push(i); continue; }
    laFrom.push(-i);
  }
  laRunning = true;
}
function laDebug(): string {
  return 'gone ' + laGone.length + ' from ' + laFrom.length + ' running ' + laRunning + ' cfg ' + (laCfg === null ? 'none' : '' + (laCfg as Config).duration);
}
laNext = { duration: 300, create: { type: 'linear', property: 'opacity' } };
laStart();
console.log(laDebug());
