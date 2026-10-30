// `import type`, `{ type A }`, `import type * as ns` and an import read in types only (elided, as TypeScript does) run nothing of their module.
import type { Song, Title } from './side';
import { type Album } from './side2';
import type * as art from './side3';
import { Mood } from './side';
import { show } from './reader';
import { sum } from './both';
const s: Song = { title: 'Song', plays: 3 };
const t: Title = s.title;
const al: Album = { name: 'Blue' };
const ar: art.Artist = { name: 'Joni' };
let m: Mood | null = null;
console.log(`${t} ${s.plays} ${al.name} ${ar.name} ${m === null}`);
console.log(show({ a: 1, b: 2 }) + ' ' + sum({ a: 1, b: 2 }));
