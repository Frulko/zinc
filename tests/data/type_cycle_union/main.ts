// Cycles through type-only imports (D188) and conditionals whose branches have different types (their union, as in TypeScript).
import { count, run } from './track.ts';
import type { Track } from './track.ts';
import { Kind } from './types.ts';
import type { Album } from './types.ts';
import type { A } from './a.ts';
import type { B } from './b.ts';

export interface Opts { n: number; label: string; }   // track.ts imports this type back from the entry

const b: B = { size: 2, owner: null };
const a: A = { name: 'x', next: b };
console.log(a.name, a.next ? a.next.size : -1);
const al: Album = { title: 'Blue', tracks: [] };
const t: Track = { title: 'River', album: al, kind: Kind.LP };
al.tracks.push(t);
console.log(count([al]), t.album ? t.album.title : '-', t.kind === Kind.LP);
console.log(run({ n: 3, label: 'ok' }));

interface R { v: number; }
function pick(c: boolean, r: R): Promise<R | null> { return c ? Promise.resolve(null) : Promise.resolve(r); }
function either(c: boolean, r: R) { return c ? Promise.resolve(null) : Promise.resolve(r); }
function both(c: boolean, n: number) { console.log(c ? 'x' : n, c ? true : 'no', c ? n : 'none'); }
both(true, 1.5);
both(false, 2);
class Animal { name(): string { return 'animal'; } }
class Dog extends Animal { name(): string { return 'dog'; } }
class Cat extends Animal { name(): string { return 'cat'; } }
function pet(c: boolean) { return c ? new Dog() : new Cat(); }
const d = pet(true), k = pet(false);
console.log(d instanceof Dog ? d.name() : '-', k instanceof Cat ? k.name() : '-');
async function main(): Promise<void> {
  const p = await pick(false, { v: 7 });
  console.log(p ? p.v : 'none');
  const q = await either(true, { v: 8 });
  console.log(q ? q.v : 'none');
  const s = await either(false, { v: 9 });
  console.log(s ? s.v : 'none');
}
main();
