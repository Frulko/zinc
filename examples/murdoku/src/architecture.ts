import { Puzzle, room } from './model';
// Bits run clockwise: north, east, south, west. Both sides share each doorway.
export function architecture(p: Puzzle, rand: (max: number) => number): void {
 const count = p.columns*p.rows;
 for (let c = 0; c < count; c++) { p.windows.push(0); p.doors.push(0); }
 for (let a = 0; a < 4; a++) for (let b = a+1; b < 4; b++) {
  const cells: number[] = [], sides: number[] = [];
  for (let c = 0; c < count; c++) if (room(p,c) === a) {
   const ns = neighbors(p,c);
   for (let s = 0; s < 4; s++) if (room(p,ns[s]) === b) { cells.push(c); sides.push(s); }
  }
  if (cells.length > 0) {
   const i = rand(cells.length), c = cells[i], s = sides[i], n = neighbors(p,c)[s];
   p.doors[c] |= 1 << s; p.doors[n] |= 1 << ((s+2)%4);
  }
 }
 for (let c = 0; c < count; c++) if (room(p,c) >= 0) {
  const ns = neighbors(p,c);
  for (let s = 0; s < 4; s++) if (room(p,ns[s]) < 0 && rand(4) === 0) p.windows[c] |= 1 << s;
 }
}
export function neighbors(p: Puzzle, c: number): number[] {
 const x = c%p.columns, y = Math.floor(c/p.columns);
 return [y > 0 ? c-p.columns : -1,x < p.columns-1 ? c+1 : -1,y < p.rows-1 ? c+p.columns : -1,x > 0 ? c-1 : -1];
}
