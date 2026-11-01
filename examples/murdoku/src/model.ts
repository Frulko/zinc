import { Character, character } from './characters';
import { Clue, ROOM, ROW, COLUMN, ON, NEAR, NOT_NEAR, WALL, WINDOW, CORNER, ALONE, SAME_ROOM, LEFT_OF, ABOVE, ROOM_COUNT, FURNITURE_COUNT, EVERY_ROOM, DIFFERENT_ROOM, NOT_ROOM, NOT_ON, NOT_WINDOW, NOT_CORNER, COMPANY, RIGHT_OF, BELOW, EITHER_ROOM, ROOM_WITH, ROOM_WITHOUT, ONLY_NEAR, ONLY_ON, EMPTY_ROOMS, NEAR_COUNT, POPULATION_ROOMS, ROW_WITH, COLUMN_WITH, NOT_ROW_WITH, NOT_COLUMN_WITH, relational } from './clues';
export const N = 6;
export const names = ['Alma', 'Basile', 'Céleste', 'Dario', 'Émile', 'Flore'];
const NAME_POOLS = [['Alma','Alice','Aline','Amélie','Apolline','Adèle','Aurore','Ariane'],['Basile','Baptiste','Benoît','Bruno','Benjamin','Bernard','Boris','Bertrand'],['Céleste','Clara','Camille','Chloé','Cécile','Constance','Caroline','Charlotte'],['Dario','David','Damien','Daniel','Denis','Dorian','Didier','Dimitri'],['Émile','Édouard','Ernest','Étienne','Elias','Eugène','Edgar','Emmanuel']];
const VICTIM_NAMES = ['Valentine','Vincent','Véra','Victor','Violette','Valentin','Victoria','Vladimir'];
export const rooms = ['Bibliothèque', 'Bureau', 'Jardin d’hiver', 'Chambre', 'Grand salon', 'Atelier', 'Salle à manger', 'Vestiaire'];
export const EMPTY = -1;
export const objects = ['plante', 'fauteuil', 'bibliothèque', 'statue', 'plante fleurie', 'tapis', 'table dressée', 'coffre-fort', 'piano', 'foyer', 'lit', 'hamac', 'bonsaï', 'horloge', 'chevalet', 'armoire', 'panier', 'tableau'];
export class Puzzle {
 windows: number[] = []; doors: number[] = [];
 columns = 6; rows = 6; roomMap: number[] = []; labelCells: number[] = []; labelWidths: number[] = [];
 seed = 0; level = 0; splitX = 3; splitY = 3; victim = -1; killer = 0;
 personNames: string[] = []; castOrder: number[] = []; walkthrough: Deduction[] = []; logicRounds = 0; interactionSteps = 0;
 themes: number[] = []; roomNames: string[] = []; characters: Character[] = [];
 decor: number[] = []; solution: number[] = []; clues: Clue[] = []; domains: number[][] = [];
}
export function personLetter(p: Puzzle, a: number): string {
 if (a === p.victim) return 'V';
 const rank = a < p.victim ? a : a-1;
 return String.fromCharCode(65+rank);
}
export function personName(p: Puzzle, a: number): string {
 if (a === p.victim) return VICTIM_NAMES[p.seed%VICTIM_NAMES.length];
 const rank = a < p.victim ? a : a-1, pool = NAME_POOLS[rank];
 return pool[Math.floor(((p.seed+rank*13)*48271)%2147483647/128)%pool.length];
}
export function characterFor(p: Puzzle, a: number): Character {
 if (a === p.victim) return character(p.seed+97,p.seed%2 === 0 ? 5 : 1);
 return character(p.seed,a < p.victim ? a : a-1);
}
export function room(p: Puzzle, cell: number): number {
 if (cell < 0 || cell >= p.columns*p.rows) return -1;
 if (p.roomMap.length > 0) return p.roomMap[cell];
 return (cell%p.columns < p.splitX ? 0 : 1)+(Math.floor(cell/p.columns) < p.splitY ? 0 : 2);
}
export function occupiable(p: Puzzle, cell: number): boolean {
 if (cell < 0 || cell >= p.columns*p.rows) return false;
 if (room(p,cell) < 0) return false;
 const d = p.decor[cell]; return d === EMPTY || d === 1 || d === 5 || d === 10 || d === 11;
}
export function beside(p: Puzzle, cell: number, kind: number): boolean {
 for (let c = 0; c < p.columns*p.rows; c++) if (p.decor[c] === kind && room(p,c) === room(p,cell) && Math.abs(c%p.columns-cell%p.columns)+Math.abs(Math.floor(c/p.columns)-Math.floor(cell/p.columns)) === 1) return true;
 return false;
}
export function wallAxes(p: Puzzle, cell: number): number {
 const x = cell%p.columns, y = Math.floor(cell/p.columns), r = room(p,cell);
 const vertical = x === 0 || x === p.columns-1 || room(p,cell-1) !== r || room(p,cell+1) !== r;
 const horizontal = y === 0 || y === p.rows-1 || room(p,cell-p.columns) !== r || room(p,cell+p.columns) !== r;
 return (vertical ? 1 : 0)+(horizontal ? 1 : 0);
}
export function hasWindow(p: Puzzle, cell: number): boolean { return cell >= 0 && cell < p.windows.length && p.windows[cell] !== 0; }
export function unary(p: Puzzle, clue: Clue, cell: number): boolean {
 const k = clue.kind, v = clue.value, x = cell%p.columns, y = Math.floor(cell/p.columns);
 if (k === ROOM || k === NOT_ROOM) return (room(p,cell) === v) === (k === ROOM);
 if (k === EITHER_ROOM) return room(p,cell) === v || room(p,cell) === clue.other;
 if (k === ROOM_WITH || k === ROOM_WITHOUT) {
  let present = false; for (let c = 0; c < p.columns*p.rows; c++) if (room(p,c) === room(p,cell) && p.decor[c] === v) present = true;
  return present === (k === ROOM_WITH);
 }
 if (k === ROW_WITH || k === COLUMN_WITH || k === NOT_ROW_WITH || k === NOT_COLUMN_WITH) {
  let aligned = false; const rowAxis = k === ROW_WITH || k === NOT_ROW_WITH;
  for (let c = 0; c < p.columns*p.rows; c++) if (p.decor[c] === v && room(p,c) === room(p,cell) && (rowAxis ? Math.floor(c/p.columns) === y : c%p.columns === x)) aligned = true;
  return aligned === (k === ROW_WITH || k === COLUMN_WITH);
 }
 if (k === ROW) return y === v;
 if (k === COLUMN) return x === v;
 if (k === ON || k === NOT_ON || k === ONLY_ON) return (p.decor[cell] === v) === (k !== NOT_ON);
 if (k === NEAR || k === NOT_NEAR || k === ONLY_NEAR) return beside(p,cell,v) === (k !== NOT_NEAR);
 if (k === WALL) return (wallAxes(p,cell) > 0) === (v === 1);
 if (k === CORNER || k === NOT_CORNER) return (wallAxes(p,cell) === 2) === (k === CORNER);
 if (k === WINDOW || k === NOT_WINDOW) return hasWindow(p,cell) === (k === WINDOW);
 return true;
}
export function individualAllows(p: Puzzle, clue: Clue, person: number, cell: number): boolean {
 if (clue.person === person) return unary(p,clue,cell);
 if (clue.kind === ONLY_ON) return p.decor[cell] !== clue.value;
 if (clue.kind === ONLY_NEAR) return !beside(p,cell,clue.value);
 return true;
}
export function domains(p: Puzzle): number[][] {
 const out: number[][] = [];
 for (let a = 0; a < N; a++) {
  const cells: number[] = [];
  for (let cell = 0; cell < p.columns*p.rows; cell++) {
   let valid = occupiable(p,cell);
   for (const c of p.clues) if (!individualAllows(p,c,a,cell)) valid = false;
   if (valid) cells.push(cell);
  }
  out.push(cells);
 }
 return out;
}
export function pair(p: Puzzle, c: Clue, a: number, b: number): boolean {
 if (c.kind === SAME_ROOM) return room(p,a) === room(p,b);
 if (c.kind === DIFFERENT_ROOM) return room(p,a) !== room(p,b);
 if (c.kind === LEFT_OF) return a%p.columns < b%p.columns;
 if (c.kind === RIGHT_OF) return a%p.columns > b%p.columns;
 if (c.kind === ABOVE) return Math.floor(a/p.columns) < Math.floor(b/p.columns);
 if (c.kind === BELOW) return Math.floor(a/p.columns) > Math.floor(b/p.columns);
 return true;
}
export function countRoom(p: Puzzle, placed: number[], r: number): number { let n = 0; for (const c of placed) if (c >= 0 && room(p,c) === r) n++; return n; }
export function feasible(p: Puzzle, placed: number[], depth: number): boolean {
 const remaining = N-depth, victim = placed[p.victim];
 if (victim >= 0) { const count = countRoom(p,placed,room(p,victim)); if (count > 2 || count+remaining < 2) return false; }
 for (const c of p.clues) {
  const a = c.person >= 0 ? placed[c.person] : -1;
  if (relational(c.kind) && c.other >= 0 && a >= 0 && placed[c.other] >= 0 && !pair(p,c,a,placed[c.other])) return false;
  if (c.kind === ALONE && a >= 0 && countRoom(p,placed,room(p,a)) > 1) return false;
  if (c.kind === COMPANY && a >= 0) { const n = countRoom(p,placed,room(p,a)); if (n > c.value || n+remaining < c.value) return false; }
  if (c.kind === ROOM_COUNT) { const n = countRoom(p,placed,c.other); if (n > c.value || n+remaining < c.value) return false; }
  if (c.kind === FURNITURE_COUNT) {
   let n = 0; for (const cell of placed) if (cell >= 0 && p.decor[cell] === c.other) n++;
   if (n > c.value || n+remaining < c.value) return false;
  }
  if (c.kind === NEAR_COUNT) {
   let n = 0; for (const cell of placed) if (cell >= 0 && beside(p,cell,c.other)) n++;
   if (n > c.value || n+remaining < c.value) return false;
  }
  if ((c.kind === EMPTY_ROOMS || c.kind === POPULATION_ROOMS) && remaining === 0) {
   let n = 0; for (let r = 0; r < 4; r++) if (countRoom(p,placed,r) === (c.kind === EMPTY_ROOMS ? 0 : c.value)) n++;
   if (n !== (c.kind === EMPTY_ROOMS ? c.value : c.other)) return false;
  }
  if (c.kind === EVERY_ROOM && remaining === 0) for (let r = 0; r < 4; r++) if (countRoom(p,placed,r) === 0) return false;
 }
 return true;
}
export function compatible(p: Puzzle, a: number, ca: number, b: number, cb: number): boolean {
 if (ca%p.columns === cb%p.columns || Math.floor(ca/p.columns) === Math.floor(cb/p.columns)) return false;
 for (const c of p.clues) {
  if (relational(c.kind)) {
   if (c.person === a && c.other === b && !pair(p,c,ca,cb)) return false;
   if (c.person === b && c.other === a && !pair(p,c,cb,ca)) return false;
  }
  if (c.kind === ALONE && (c.person === a || c.person === b) && room(p,ca) === room(p,cb)) return false;
 }
 return true;
}
export class Deduction { person = -1; cell = -1; remaining = 0; reason = ''; rule = ''; people: number[] = []; removed: number[] = []; }
export function validScene(p: Puzzle, placed: number[]): boolean {
 if (placed.length !== N) return false;
 let rows = 0, cols = 0;
 for (let a = 0; a < N; a++) {
  const cell = placed[a]; if (!occupiable(p,cell)) return false;
  const rb = 1 << Math.floor(cell/p.columns), cb = 1 << (cell%p.columns); if ((rows & rb) || (cols & cb)) return false;
  rows |= rb; cols |= cb;
  for (const c of p.clues) if (!individualAllows(p,c,a,cell)) return false;
 }
 return feasible(p,placed,N);
}
