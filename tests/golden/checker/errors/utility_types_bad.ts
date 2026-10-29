interface Song { id: string; title: string; year?: i32; }
const ro: Readonly<Song> = { id: 'a', title: 't' };
ro.title = 'u';
const r: Required<Song> = { id: 'a', title: 't' };
const pk: Pick<Song, 'name'> = { id: 'a' };
const d: Record<string, i32> = {};
