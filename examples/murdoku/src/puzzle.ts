import { architecture } from './architecture';
import { growRooms } from './floorplan';
import { Character, character } from './characters';
import { Puzzle, N, names, personName, characterFor, rooms, objects, EMPTY, room, occupiable, beside, wallAxes, hasWindow, domains, unary, countRoom, validScene } from './model';
import { Clue, fact, ROOM, ROW, COLUMN, ON, NEAR, NOT_NEAR, ALONE, ONLY_ON, ONLY_NEAR, relational } from './clues';
import { family, phrase } from './phrases';
import { solutions } from './solver';
import { deduce } from './deduction';
export { Puzzle, N, names, rooms, objects, EMPTY, room, labelRun, occupiable, personLetter, personName, characterFor, domains, validScene } from './model';
export { solve, solutions } from './solver';
function attempt(seed: number, level: number): Puzzle | null {
 let state = (Math.floor(seed)%2147483646)+1;
 function rand(max: number): number { state = (state*16807)%2147483647; return Math.floor(state/128)%max; }
 const p = new Puzzle(); p.seed = seed; p.level = level; p.columns = 6+seed%3;
 for (let a = 0; a < N; a++) { p.castOrder.push(a); }
 if (!growRooms(p,rand)) return null;
 architecture(p,rand);
 p.splitX = 2+rand(3); p.splitY = 2+rand(3);
 for (let r = 0; r < 4; r++) { const theme = r*2+rand(2); p.themes.push(theme); p.roomNames.push(rooms[theme]); }
 for (let c = 0; c < p.columns*p.rows; c++) p.decor.push(EMPTY);
 for (let r = 0; r < 4; r++) {
  const cells: number[] = []; for (let c = 0; c < p.columns*p.rows; c++) if (room(p,c) === r) cells.push(c);
  for (let i = cells.length-1; i > 0; i--) { const j = rand(i+1), t = cells[i]; cells[i] = cells[j]; cells[j] = t; }
  const count = Math.min(2+rand(2),Math.floor(cells.length/2)), theme = p.themes[r];
  const kinds = theme === 0 ? [2,7,17,13,1] : theme === 1 ? [7,2,12,0,13] : theme === 2 ? [0,4,12,11,5] : theme === 3 ? [10,5,13,1,3] : theme === 4 ? [8,9,1,5,3] : theme === 5 ? [14,17,1,3,5] : theme === 6 ? [6,3,12,16,5] : [15,0,12,3,5];
  for (let i = 0; i < count; i++) p.decor[cells[i]] = kinds[i === 0 ? 0 : 1+rand(kinds.length-1)];
 }
 let found = false;
 for (let trial = 0; trial < 100 && !found; trial++) {
  const cols: number[] = []; for (let x = 0; x < p.columns; x++) cols.push(x); for (let i = cols.length-1; i > 0; i--) { const j = rand(i+1), t = cols[i]; cols[i] = cols[j]; cols[j] = t; }
  p.solution = []; let legal = true;
  for (let a = 0; a < N; a++) { const cell = a*p.columns+cols[a]; p.solution.push(cell); if (!occupiable(p,cell)) legal = false; }
  if (!legal) continue;
  for (let i = 5; i > 0; i--) { const j = rand(i+1), t = p.solution[i]; p.solution[i] = p.solution[j]; p.solution[j] = t; }
  const victims: number[] = []; for (let a = 0; a < N; a++) if (countRoom(p,p.solution,room(p,p.solution[a])) === 2) {
   let possible = 0; const y = Math.floor(p.solution[a]/p.columns);
   for (let x = 0; x < p.columns; x++) {
    const cell = y*p.columns+x; if (!occupiable(p,cell)) continue;
    let used = false, companions = 0;
    for (let b = 0; b < N; b++) if (b !== a) { if (p.solution[b]%p.columns === x) used = true; if (room(p,p.solution[b]) === room(p,cell)) companions++; }
    if (!used && companions === 1) possible++;
   }
   if (possible === 1) victims.push(a);
  }
  if (victims.length > 0) { p.victim = victims[rand(victims.length)]; found = true; }
 }
 if (!found) return null;
 for (let a = 0; a < N; a++) if (a !== p.victim && room(p,p.solution[a]) === room(p,p.solution[p.victim])) p.killer = a;
 p.castOrder = [];
 for (let a = 0; a < N; a++) {
  p.personNames.push(personName(p,a)); p.characters.push(characterFor(p,a));
  if (a !== p.victim) p.castOrder.push(a);
 }
 p.castOrder.push(p.victim);
 function make(a: number, key: string, value: number = 0, other: number = -1): Clue {
  const f = family(key), c = fact(a,f.kind,value,'',other); c.family = key; c.exclusive = f.exclusive; c.negative = f.negative;
  c.variant = rand(10);
  return c;
 }
 function wording(c: Clue): void {
  const key = c.family, a = c.person, value = c.value, other = c.other;
  const roomName = c.kind === ROOM || key === 'not-room' || key === 'either-room' ? p.roomNames[value] : key === 'global-room' ? p.roomNames[other] : '';
  const objectId = key.startsWith('global-') ? other : value;
  const objectName = objectId >= 0 && objectId < objects.length ? objects[objectId] : '';
  c.text = phrase(key,c.variant,roomName,key === 'either-room' ? p.roomNames[other] : '',objectName,relational(c.kind) ? personName(p,other) : '',c.kind === ROW || c.kind === COLUMN ? value+1 : value,key === 'global-room-population' ? other : 0,a >= 0 && p.characters[a].sex === 1);
 }
 const candidates: Clue[] = [];
 for (let a = 0; a < N; a++) {
  // The victim has no testimony and is never named by another person's clue.
  if (a === p.victim) continue;
  const cell = p.solution[a], x = cell%p.columns, y = Math.floor(cell/p.columns), d = p.decor[cell], r = room(p,cell);
  const pool: Clue[] = [];
  pool.push(make(a,d === EMPTY ? 'empty' : 'on',d));
  pool.push(make(a,wallAxes(p,cell) > 0 ? 'wall' : 'not-wall',wallAxes(p,cell) > 0 ? 1 : 0));
  pool.push(make(a,wallAxes(p,cell) === 2 ? 'corner' : 'not-corner'));
  pool.push(make(a,hasWindow(p,cell) ? 'window' : 'not-window'));
  if (d !== EMPTY && p.solution.filter((c: number) => p.decor[c] === d).length === 1) pool.push(make(a,'only-on',d));
  if (d !== EMPTY) pool.push(make(a,'not-empty',EMPTY));
  const population = countRoom(p,p.solution,r);
  pool.push(make(a,population === 1 ? 'alone' : 'company',population));
  for (let kind = 0; kind < objects.length; kind++) if (p.decor.indexOf(kind) >= 0) {
   let inRoom = false; for (let c = 0; c < p.columns*p.rows; c++) if (p.decor[c] === kind && room(p,c) === r) inRoom = true;
   pool.push(make(a,inRoom ? 'room-with' : 'room-without',kind));
   if (inRoom && ![1,5,10,11].includes(kind)) {
    pool.push(make(a,'row-with',kind)); pool.push(make(a,'column-with',kind));
    pool.push(make(a,'not-row-with',kind)); pool.push(make(a,'not-column-with',kind));
   }
   if (beside(p,cell,kind)) {
    pool.push(make(a,'near',kind));
    if (p.solution.filter((c: number) => beside(p,c,kind)).length === 1) pool.push(make(a,'only-near',kind));
   } else pool.push(make(a,'not-near',kind));
  }
  const excludedRoom = (r+1+rand(3))%4;
  pool.push(make(a,'not-room',excludedRoom));
  for (const kind of [1,5,10,11]) if (kind !== d && p.decor.indexOf(kind) >= 0) pool.push(make(a,'not-on',kind));
  if (level === 0) pool.push(make(a,'room',r));
  if (level === 1 && rand(3) === 0) pool.push(make(a,'either-room',r,(r+1+rand(3))%4));
  if (a%3 === seed%3 || (level === 0 && rand(3) === 0)) { if (rand(2) === 0) pool.push(make(a,'row',y)); else pool.push(make(a,'column',x)); }
  // Retain useful landmarks; a statement ruling out no legal cell is never published.
  for (let i = pool.length-1; i > 0; i--) { const j = rand(i+1), t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  const useful = pool.filter((c: Clue) => {
   let yes = 0, no = 0;
   for (let cell = 0; cell < p.columns*p.rows; cell++) if (occupiable(p,cell)) { if (unary(p,c,cell)) yes++; else no++; }
   return unary(p,c,cell) && (yes > 0 && no > 0 || c.kind === ALONE || c.family === 'company');
  });
  // Use a diverse initial evidence pool, pruned below by the logical solver.
  const groups = new Set<number>();
  for (const c of useful) if (!groups.has(c.kind) && groups.size < 9) { candidates.push(c); groups.add(c.kind); }
  if (level === 0 && !candidates.some((c: Clue) => c.person === a && c.kind === ROOM)) candidates.push(make(a,'room',r));
  // Five witnesses are ordered relative to one another, never to the victim.
  let right = -1, down = -1;
  for (let b = 0; b < N; b++) if (b !== a && b !== p.victim) {
   if (p.solution[b]%p.columns > x && (right < 0 || p.solution[b]%p.columns < p.solution[right]%p.columns)) right = b;
   if (Math.floor(p.solution[b]/p.columns) > y && (down < 0 || Math.floor(p.solution[b]/p.columns) < Math.floor(p.solution[down]/p.columns))) down = b;
  }
  if (right >= 0) { if (rand(2) === 0) candidates.push(make(a,'left',0,right)); else candidates.push(make(right,'right',0,a)); }
  if (down >= 0) { if (rand(2) === 0) candidates.push(make(a,'above',0,down)); else candidates.push(make(down,'below',0,a)); }
  const others = [0,1,2,3,4,5].filter((b: number) => b !== a && b !== p.victim);
  const partner = others[rand(others.length)];
  candidates.push(make(a,room(p,p.solution[partner]) === r ? 'same-room' : 'different-room',0,partner));
 }
 if (rand(3) !== 0) {
  const globals: Clue[] = [];
  const emptyRooms = [0,1,2,3].filter((r: number) => countRoom(p,p.solution,r) === 0).length;
  if (emptyRooms === 0) globals.push(make(-1,'global-all-rooms'));
  else globals.push(make(-1,'global-empty',emptyRooms));
  const r = rand(4); globals.push(make(-1,'global-room',countRoom(p,p.solution,r),r));
  for (const kind of [1,5,10,11]) if (p.decor.indexOf(kind) >= 0) {
   const count = p.solution.filter((c: number) => p.decor[c] === kind).length;
   globals.push(make(-1,'global-furniture',count,kind));
   if (kind === 1 && count === p.decor.filter((d: number) => d === 1).length) globals.push(make(-1,'global-all-chairs',count,1));
  }
  const kind = p.decor.filter((d: number) => d !== EMPTY)[rand(p.decor.filter((d: number) => d !== EMPTY).length)];
  globals.push(make(-1,'global-adjacent',p.solution.filter((c: number) => beside(p,c,kind)).length,kind));
  candidates.push(globals[rand(globals.length)]);
 }
 p.clues = candidates;
 if (!deduce(p).solved || solutions(p) !== 1) return null;
 const order = candidates.slice();
 for (let i = order.length-1; i > 0; i--) { const j = rand(i+1), t = order[i]; order[i] = order[j]; order[j] = t; }
 for (const c of order) {
  if (c.person >= 0 && p.clues.filter((v: Clue) => v.person === c.person).length <= 1) continue;
  // Discovery keeps two explicit anchors; other levels rely on landmarks and relations.
  if (level === 0 && c.kind === ROOM && c.person%3 === seed%3) continue;
  const at = p.clues.indexOf(c); p.clues.splice(at,1);
  if (!deduce(p).solved || solutions(p) !== 1) p.clues.splice(at,0,c);
 }
 if (p.clues.length > 13 || p.clues.some((c: Clue) => c.person >= 0 && p.clues.filter((v: Clue) => v.person === c.person).length > 3)) return null;
 // Every witness must contribute evidence: never publish filler on an otherwise solved person.
 for (let a = 0; a < N; a++) if (a !== p.victim) {
  const saved = p.clues; p.clues = saved.filter((c: Clue) => c.person !== a);
  const redundant = deduce(p).solved; p.clues = saved; if (redundant) return null;
 }
 for (const c of p.clues) wording(c);
 const logic = deduce(p,true);
 if (!logic.solved || !validScene(p,p.solution)) return null;
 const interactionSteps = logic.steps.filter((s) => s.rule !== 'testimony' && s.cell >= 0 && s.person !== p.victim).length;
 if (interactionSteps < 2) return null;
 p.interactionSteps = interactionSteps; p.walkthrough = logic.steps; p.logicRounds = logic.rounds; p.domains = domains(p); return p;
}
export function generate(seed: number, level: number): Puzzle {
 for (let trial = 0; trial < 200; trial++) { const p = attempt(seed+trial,level); if (p !== null) return p; }
 throw new Error('Impossible de construire une enquête déductible pour cette graine.');
}
