import { Puzzle, room } from './model';
// Multi-source growth: each room remains connected while its boundary interlocks with its neighbours.
export function growRooms(p: Puzzle, rand: (max: number) => number): boolean {
 const size = p.columns*p.rows;
 for (let c = 0; c < size; c++) p.roomMap.push(-2);
 const cut = 1+rand(3);
 for (let x = 0; x < cut; x++) p.roomMap[x] = -1;
 if (rand(2) === 0) p.roomMap[size-1] = -1;
 if (p.columns > 6 && rand(2) === 0) p.roomMap[2*p.columns+Math.floor(p.columns/2)] = -1;
 const seeds: number[] = [], counts = [0,0,0,0];
 let seed = Math.floor(p.rows/2)*p.columns+Math.floor(p.columns/2);
 if (p.roomMap[seed] !== -2) seed++;
 for (let r = 0; r < 4; r++) {
  if (r > 0) {
   let best = -1;
   for (let cell = 0; cell < size; cell++) if (p.roomMap[cell] === -2) {
    let distance = size;
    for (const previous of seeds) distance = Math.min(distance,Math.abs(cell%p.columns-previous%p.columns)+Math.abs(Math.floor(cell/p.columns)-Math.floor(previous/p.columns)));
    const score = distance*8+rand(8); if (score > best) { best = score; seed = cell; }
   }
  }
  seeds.push(seed); p.roomMap[seed] = r; counts[r] = 1;
 }
 for (let iteration = 0; iteration < size; iteration++) {
  let chosenRoom = -1, frontier: number[] = [], smallest = size+1;
  const offset = rand(4);
  for (let i = 0; i < 4; i++) {
   const r = (i+offset)%4; if (counts[r] >= smallest) continue;
   const cells: number[] = [];
   for (let c = 0; c < size; c++) if (p.roomMap[c] === -2) {
    const x = c%p.columns, y = Math.floor(c/p.columns);
    if ((x > 0 && room(p,c-1) === r) || (x < p.columns-1 && room(p,c+1) === r) || (y > 0 && room(p,c-p.columns) === r) || (y < p.rows-1 && room(p,c+p.columns) === r)) cells.push(c);
   }
   if (cells.length > 0) { chosenRoom = r; frontier = cells; smallest = counts[r]; }
  }
  if (chosenRoom < 0) break;
  const cell = frontier[rand(frontier.length)]; p.roomMap[cell] = chosenRoom; counts[chosenRoom]++;
 }
 for (const r of p.roomMap) if (r === -2) return false;
 for (let r = 0; r < 4; r++) {
  if (counts[r] < 4) return false;
  let best = 0, label = p.roomMap.indexOf(r);
  for (let cell = 0; cell < size; cell++) if (room(p,cell) === r && (cell%p.columns === 0 || room(p,cell-1) !== r)) {
   let run = 0; while (cell%p.columns+run < p.columns && room(p,cell+run) === r) run++;
   if (run > best) { best = run; label = cell; }
  }
  p.labelCells.push(label); p.labelWidths.push(best);
 }
 return true;
}
