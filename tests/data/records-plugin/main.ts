// Native records (ZN-850): a record, a list of records with a nested and an optional record, a record parameter and a promise of records cross the
// native ABI as bytes; Old and New check the append-only evolution both ways, on the engines' decoders and on the generated C++ structs.
import T from 'zinc:tracks';
import type { Art, Track } from './plugins/tracks/native/tracks.spec';

function art(a: Art | null): string { return a !== null ? a.w + 'x' + a.h : 'no art'; }
function show(x: Track): string { return [x.title, String(x.ms), String(x.plays), String(x.fav), art(x.art), x.tags.join('+'), String(x.cover.length), x.note ?? '-'].join(' '); }

console.log(show(T.first()));
const ts = T.list(3);
for (const x of ts) console.log(show(x));
console.log(T.describe({ title: 'given', ms: 12.5, plays: 3, fav: true, art: { w: 9, h: 4 }, tags: ['x'], cover: [1, 2, 3], note: 'hi' }));
console.log(T.describe(ts[2]));
const back = T.echo(ts);
console.log(back.length, show(back[0]), show(back[1]));
const o = T.newAsOld();
const n = T.oldAsNew();
console.log('evolution', o.id, n.id, '[' + n.label + ']', T.readOld({ id: 5, label: 'five' }), T.readNew({ id: 6 }));
T.later(2).then((l: Track[]) => { console.log('later', l.length, show(l[1])); });
