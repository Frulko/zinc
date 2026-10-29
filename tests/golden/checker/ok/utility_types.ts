// TypeScript's utility types over interfaces and records (Partial, Required, Readonly, Pick, Omit, Record with literal keys).
interface Song { id: string; title: string; year?: i32; readonly kind: string; }
type Keys = 'id' | 'title';
const p: Partial<Song> = { title: 'x' };
const r: Required<Song> = { id: 'a', title: 't', year: 1999, kind: 'k' };
const ro: Readonly<Song> = { id: 'a', title: 't', kind: 'k' };
const pk: Pick<Song, Keys> = { id: 'a', title: 't' };
const om: Omit<Song, 'kind' | 'year'> = { id: 'a', title: 't' };
const rec: Record<'w' | 'h', number> = { w: 1, h: 2 };
const s: Song = { ...p, id: 'b', title: p.title ?? '', kind: 'k' };
console.log(p.title, r.year, ro.id, pk.title, om.id, rec.w + rec.h, s.title);
