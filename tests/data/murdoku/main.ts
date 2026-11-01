import { neighbors } from '../../../examples/murdoku/src/architecture';
import { hasWindow, unary } from '../../../examples/murdoku/src/model';
import { env } from 'zinc:sys';
import { PHRASE_BANK, phrase, family } from '../../../examples/murdoku/src/phrases';
import { deduce } from '../../../examples/murdoku/src/deduction';
import { Clue, fact, ROOM, ROW, COLUMN, SAME_ROOM, NEAR, ONLY_NEAR, ONLY_ON, ON, ROOM_WITH, ROOM_WITHOUT, COMPANY, EITHER_ROOM, ROW_WITH, NOT_ROW_WITH, relational, WALL, WINDOW, ALONE, LEFT_OF, ABOVE, ROOM_COUNT, FURNITURE_COUNT, EVERY_ROOM } from '../../../examples/murdoku/src/clues';
import { character, characterSignature } from '../../../examples/murdoku/src/characters';
import { generate, solutions, room, EMPTY, validScene, occupiable, Puzzle, personLetter, personName, characterFor } from '../../../examples/murdoku/src/puzzle';
const fixture = new Puzzle(); fixture.victim = 0;
fixture.solution = [0,8,16,19,27,35];
for (let c = 0; c < 36; c++) { fixture.decor.push(EMPTY); fixture.windows.push(c === 0 ? 1 : 0); }
fixture.decor[1] = 2; fixture.decor[19] = 1;
function expectFact(clue: Clue, expected: boolean): void {
 fixture.clues = [clue]; if (validScene(fixture,fixture.solution) !== expected) throw new Error('Clue semantics '+clue.kind);
}
expectFact(fact(0,NEAR,2,''),true);
expectFact(fact(1,NEAR,2,''),false); // diagonals are not adjacent
fixture.decor[22] = 3;
expectFact(fact(2,NEAR,3,''),false); // adjacency may not cross room boundaries
expectFact(fact(0,WINDOW,0,''),true);
expectFact(fact(1,WINDOW,0,''),false);
expectFact(fact(2,ALONE,0,''),true);
expectFact(fact(0,ALONE,0,''),false);
expectFact(fact(0,LEFT_OF,0,'',1),true);
expectFact(fact(1,LEFT_OF,0,'',0),false);
expectFact(fact(2,ABOVE,0,'',3),true);
expectFact(fact(-1,ROOM_COUNT,2,'',0),true);
expectFact(fact(-1,ROOM_COUNT,1,'',0),false);
expectFact(fact(-1,FURNITURE_COUNT,1,'',1),true);
expectFact(fact(-1,FURNITURE_COUNT,0,'',1),false);
expectFact(fact(-1,EVERY_ROOM,0,''),true);
for (let d = 0; d < 18; d++) {
 fixture.decor[0] = d;
 if (occupiable(fixture,0) !== (d === 1 || d === 5 || d === 10 || d === 11)) throw new Error('Furniture occupancy '+d);
}
fixture.decor[0] = EMPTY; fixture.clues = [];
if (solutions(fixture) !== 2) throw new Error('Ambiguity not detected');
for (let a = 0; a < 6; a++) {
 fixture.clues.push(fact(a,ROW,Math.floor(fixture.solution[a]/6),''));
 fixture.clues.push(fact(a,COLUMN,fixture.solution[a]%6,''));
}
if (solutions(fixture) !== 1) throw new Error('Unique fixture');
fixture.clues.push(fact(-1,ROOM_COUNT,1,'',0));
if (solutions(fixture) !== 0) throw new Error('Global contradiction ignored');
fixture.decor[7] = 2;
expectFact(fact(0,NEAR,2,''),true);
expectFact(fact(0,ONLY_NEAR,2,''),false);
fixture.decor[7] = EMPTY;
expectFact(fact(0,ONLY_NEAR,2,''),true);
expectFact(fact(3,ONLY_ON,1,''),true);
fixture.decor[27] = 1;
expectFact(fact(3,ON,1,''),true);
expectFact(fact(3,ONLY_ON,1,''),false);
fixture.decor[27] = EMPTY;
expectFact(fact(0,ROOM_WITH,2,''),true);
expectFact(fact(2,ROOM_WITH,2,''),false);
expectFact(fact(2,ROOM_WITHOUT,2,''),true);
expectFact(fact(0,COMPANY,2,''),true);
expectFact(fact(0,COMPANY,3,''),false);
expectFact(fact(0,EITHER_ROOM,0,'',2),true);
expectFact(fact(0,EITHER_ROOM,1,'',3),false);
expectFact(fact(0,ROW_WITH,2,''),true);
expectFact(fact(1,ROW_WITH,2,''),false);
expectFact(fact(1,NOT_ROW_WITH,2,''),true);
let templates = 0;
for (const f of PHRASE_BANK) {
 if (f.key.startsWith('half-')) throw new Error('Vague half-board clue');
 for (let v = 0; v < f.templates.length; v++) {
  const text = phrase(f.key,v,'Salon','Chambre','fauteuil','Alma',2,1);
  if (text.includes('{') || text.includes('}') || text.includes('moitié')) throw new Error('Unresolved phrase template');
  templates++;
 }
}
if (templates !== 400 || PHRASE_BANK.length !== 40 || !family('only-near').exclusive || family('near').exclusive) throw new Error('Phrase catalog metadata');
let checked = 0;
const victims = new Set<number>(), victimSlots = new Set<number>(), widths = new Set<number>();
let irregularRooms = 0;
const portraits = new Set<string>();
const sampleCount = env('MURDOKU_SMOKE') === '1' ? 2 : 20;
for (let level = 0; level < 3; level++) for (let seed = 1; seed <= sampleCount; seed++) {
 const p = generate(seed,level); widths.add(p.columns);
 for (let slot = 0; slot < 5; slot++) {
  const a = p.castOrder[slot], letter = String.fromCharCode(65+slot);
  if (personLetter(p,a) !== letter || personName(p,a).replace('É','E').substring(0,1) !== letter) throw new Error('Alphabetic witness identity');
 }
 if (!personName(p,p.victim).startsWith('V')) throw new Error('Victim name');
 if (p.roomMap.indexOf(-1) < 0) throw new Error('Missing footprint cutout');
 const reached = [0];
 for (let pass = 0; pass < 4; pass++) for (let c = 0; c < p.columns*p.rows; c++) {
  const ns = neighbors(p,c);
  if (unary(p,fact(0,WINDOW,0,''),c) !== hasWindow(p,c)) throw new Error('Window clue differs from architecture');
  for (let side = 0; side < 4; side++) {
   if ((p.windows[c] & (1 << side)) !== 0 && (room(p,c) < 0 || room(p,ns[side]) >= 0)) throw new Error('Window is not on a facade');
   if ((p.doors[c] & (1 << side)) !== 0) {
    const n = ns[side];
    if (n < 0 || room(p,n) < 0 || room(p,n) === room(p,c) || (p.doors[n] & (1 << ((side+2)%4))) === 0) throw new Error('Door has no matching opening');
    if (reached.includes(room(p,c)) && !reached.includes(room(p,n))) reached.push(room(p,n));
   }
  }
 }
 if (reached.length !== 4) throw new Error('Rooms disconnected by walls');
 for (let r = 0; r < 4; r++) {
  const start = p.roomMap.indexOf(r), pending = [start], visited = new Set<number>();
  while (pending.length > 0) {
   const c = pending.pop()!; if (visited.has(c)) continue; visited.add(c);
   const x = c%p.columns, y = Math.floor(c/p.columns);
   for (const n of [x > 0 ? c-1 : -1,x < p.columns-1 ? c+1 : -1,y > 0 ? c-p.columns : -1,y < p.rows-1 ? c+p.columns : -1]) if (n >= 0 && room(p,n) === r && !visited.has(n)) pending.push(n);
  }
  let minX = p.columns, maxX = 0, minY = p.rows, maxY = 0;
  for (const c of visited) { minX = Math.min(minX,c%p.columns); maxX = Math.max(maxX,c%p.columns); minY = Math.min(minY,Math.floor(c/p.columns)); maxY = Math.max(maxY,Math.floor(c/p.columns)); }
  if ((maxX-minX+1)*(maxY-minY+1) > visited.size) irregularRooms++;
  if (visited.size !== p.roomMap.filter((k: number) => k === r).length) throw new Error('Disconnected room');
 }

 if (!validScene(p,p.solution)) throw new Error('Generated scene breaks clues');
 if (p.clues.some((c) => c.person === p.victim || (relational(c.kind) && c.other === p.victim))) throw new Error('Victim has testimony or is named');
 if (p.castOrder.length !== 6 || new Set<number>(p.castOrder).size !== 6 || p.castOrder[5] !== p.victim) throw new Error('Victim roster position');
 victims.add(p.victim); victimSlots.add(p.castOrder.indexOf(p.victim));
 const secret = p.solution; p.solution = [];
 const logic = deduce(p,true); p.solution = secret;
 if (!logic.solved || logic.contradiction || p.interactionSteps < 2) throw new Error('No logical deduction chain');
 for (const step of logic.steps) if (step.cell >= 0 && step.cell !== secret[step.person]) throw new Error('Unsound deduction');
 for (let a = 0; a < 6; a++) if (a !== p.victim) {
  const saved = p.clues; p.clues = saved.filter((c) => c.person !== a);
  const redundant = deduce(p).solved; p.clues = saved;
  if (redundant) throw new Error('Witness has no useful evidence');
 }
 if (p.clues.some((c) => c.text.includes('moitié'))) throw new Error('Vague clue');
 if (p.clues.some((c) => c.kind === SAME_ROOM && (c.person === p.victim || c.other === p.victim))) throw new Error('Testimony gives away murderer');
 if (solutions(p) !== 1) throw new Error('Ambiguous puzzle');
 for (let a = 0; a < 6; a++) {
  const c = p.characters[a];
  if (c.sex < 0 || c.sex > 1 || c.skin < 0 || c.skin > 3 || c.hair < 0 || c.hair > 3) throw new Error('Invalid portrait component');
  if (characterSignature(c) !== characterSignature(characterFor(p,a))) throw new Error('Non deterministic portrait');
  portraits.add(characterSignature(c));
 }
 const active = p.roomMap.filter((r: number) => r >= 0).length;
 const furniture = p.decor.filter((d: number) => d !== EMPTY).length;
 if (furniture < 8 || furniture > 12 || active-furniture < active/2) throw new Error('Furniture density');
 for (let r = 0; r < 4; r++) {
  let furniture = 0, space = 0;
  for (let c = 0; c < p.columns*p.rows; c++) if (room(p,c) === r) { if (p.decor[c] === EMPTY) space++; else furniture++; }
  if (furniture < 2 || space < furniture) throw new Error('Room circulation');
 }
 let rb = 0, cb = 0, count = 0;
 for (let a = 0; a < 6; a++) {
  const c = p.solution[a]; if (!occupiable(p,c)) throw new Error('Person on blocked furniture'); rb |= 1 << Math.floor(c/p.columns); cb |= 1 << (c%p.columns);
  if (p.domains[a].indexOf(c) < 0) throw new Error('False testimony');
  if (room(p,c) === room(p,p.solution[p.victim])) count++;
 }
 if (rb !== 63 || (p.columns === 6 && cb !== 63) || count !== 2 || p.killer === p.victim) throw new Error('Invalid crime scene');
 const again = generate(seed,level);
 if (again.solution.join(',') !== p.solution.join(',') || again.clues.length !== p.clues.length || again.decor.join(',') !== p.decor.join(',') || again.windows.join(',') !== p.windows.join(',') || again.doors.join(',') !== p.doors.join(',')) throw new Error('Non deterministic');
 checked++;
}
if (sampleCount === 20 && (victims.size < 3 || victimSlots.size !== 1 || !victimSlots.has(5))) throw new Error('Victim variety');
if (sampleCount === 20 && (widths.size < 2 || irregularRooms === 0)) throw new Error('No rectangular/interlocking shape variety');
if (sampleCount === 20 && portraits.size < 24) throw new Error('Insufficient portrait variety');
console.log('puzzles ' + checked);
