// A named function passed to a built-in array method, with no other use of it as a value: the lowering makes its thunk
// (it was refused as "this function used as a value").
class Song { title: string; nr: i32; constructor(title: string, nr: i32) { this.title = title; this.nr = nr; } }
function byNr(a: Song, b: Song): i32 { return a.nr - b.nr; }
function titleOf(s: Song): string { return s.title; }
function isLong(s: Song): boolean { return s.title.length > 4; }
const songs: Song[] = [new Song('Night Bus', 3), new Song('Blue', 1), new Song('Neon Rain', 2)];
songs.sort(byNr);
console.log(songs.map(titleOf).join(', '));
console.log(songs.filter(isLong).length);
