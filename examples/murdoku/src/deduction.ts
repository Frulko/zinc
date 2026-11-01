import { Puzzle, Deduction, N, names, personName, occupiable, individualAllows, compatible, room, beside, validScene, personLetter } from './model';
import { ROOM_COUNT, FURNITURE_COUNT, NEAR_COUNT, EVERY_ROOM, COMPANY, ALONE, ONLY_NEAR, ONLY_ON, relational } from './clues';
export class LogicResult { solved = false; contradiction = false; rounds = 0; domains: number[][] = []; steps: Deduction[] = []; }
export function deduce(p: Puzzle, record: boolean = false, placed: number[] = [], excluded: number[] = []): LogicResult {
 const result = new LogicResult(), ds = result.domains;
 for (let a = 0; a < N; a++) { const cells: number[] = []; for (let c = 0; c < p.columns*p.rows; c++) if (occupiable(p,c) && (placed.length <= a || placed[a] < 0 || placed[a] === c) && (excluded.length <= c || excluded[c] !== 1)) cells.push(c); ds.push(cells); if (cells.length === 0) result.contradiction = true; }
 let changed = false;
 function narrow(a: number, keep: number[], reason: string, rule: string = 'testimony', people: number[] = []): void {
  if (keep.length === ds[a].length) return;
  const removed = record ? ds[a].filter((c: number) => keep.indexOf(c) < 0) : [];
  changed = true; ds[a] = keep;
  if (keep.length === 0) result.contradiction = true;
  if (record && keep.length > 0) {
   const step = new Deduction(); step.person = a; step.rule = rule; step.remaining = keep.length; step.people = people.slice(); step.removed = removed;
   step.cell = keep.length === 1 ? keep[0] : -1;
   const who = a === p.victim ? 'La victime' : personName(p,a);
   step.reason = reason+' '+who+' : '+keep.length+' case(s) possible(s).';
   if (step.cell >= 0) step.reason += ' Donc ligne '+(Math.floor(step.cell/p.columns)+1)+', colonne '+(step.cell%p.columns+1)+'.';
   result.steps.push(step);
  }
 }
 function member(cell: number, mode: number, value: number): boolean { return mode === 0 ? room(p,cell) === value : mode === 1 ? p.decor[cell] === value : beside(p,cell,value); }
 function bound(mode: number, value: number, minimum: number, maximum: number, reason: string): void {
  let forced = 0, possible = 0;
  for (let a = 0; a < N; a++) {
   let hits = 0; for (const c of ds[a]) if (member(c,mode,value)) hits++;
   if (hits > 0) possible++; if (hits === ds[a].length && hits > 0) forced++;
  }
  if (forced > maximum || possible < minimum) { result.contradiction = true; return; }
  for (let a = 0; a < N; a++) {
   let hits = 0; for (const c of ds[a]) if (member(c,mode,value)) hits++;
   if (hits === 0 || hits === ds[a].length) continue;
   if (forced === maximum) narrow(a,ds[a].filter((c: number) => !member(c,mode,value)),reason+' Le quota est déjà atteint.','count');
   else if (possible === minimum) narrow(a,ds[a].filter((c: number) => member(c,mode,value)),reason+' Toutes les personnes encore admissibles sont nécessaires.','count');
  }
 }
 // Every operation is local constraint propagation; no hidden solution or search oracle is read.
 for (let round = 0; round < 64; round++) {
  changed = false; result.rounds = round+1;
  for (const clue of p.clues) for (let a = 0; a < N; a++) {
   if (clue.person < 0 || relational(clue.kind) || clue.kind === ALONE || clue.kind === COMPANY) continue;
   if (clue.person !== a && clue.kind !== ONLY_ON && clue.kind !== ONLY_NEAR) continue;
   narrow(a,ds[a].filter((cell: number) => individualAllows(p,clue,a,cell)),record ? 'Témoignage de '+personName(p,clue.person)+' : '+clue.text : '');
  }
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) if (a !== b) {
   const keep: number[] = [];
   for (const ca of ds[a]) { let support = false; for (const cb of ds[b]) if (compatible(p,a,ca,b,cb)) { support = true; break; } if (support) keep.push(ca); }
   let reason = '';
   if (record) {
    reason = ds[b].length === 1 ? personName(p,b)+' est en ligne '+(Math.floor(ds[b][0]/p.columns)+1)+', colonne '+(ds[b][0]%p.columns+1)+'. Les lignes et colonnes sont exclusives.' : 'Ces cases ne peuvent coexister avec aucune position encore possible de '+personName(p,b)+'. Les lignes et colonnes sont exclusives.';
    for (const c of p.clues) if ((relational(c.kind) && ((c.person === a && c.other === b) || (c.person === b && c.other === a))) || (c.kind === ALONE && (c.person === a || c.person === b))) reason += ' Indice de '+personName(p,c.person)+' : '+c.text;
   }
   narrow(a,keep,reason,'cross-reference',[b]);
  }
  // Hall's rule: k people restricted to k lines reserve those lines, even on a rectangular board.
  for (let axis = 0; axis < 2; axis++) for (let mask = 1; mask < (1 << N); mask++) {
   const people: number[] = [], lines: number[] = [];
   for (let a = 0; a < N; a++) if (mask & (1 << a)) people.push(a);
   if (people.length < 2 || people.length > 3) continue;
   for (const a of people) for (const cell of ds[a]) {
    const line = axis === 0 ? Math.floor(cell/p.columns) : cell%p.columns;
    if (lines.indexOf(line) < 0) lines.push(line);
   }
   if (lines.length < people.length) { result.contradiction = true; continue; }
   if (lines.length !== people.length) continue;
   const reason = record ? people.map((a: number) => personLetter(p,a)).join(' + ')+' réservent les '+(axis === 0 ? 'lignes ' : 'colonnes ')+lines.map((line: number) => line+1).join(', ')+'.' : '';
   for (let a = 0; a < N; a++) if (!(mask & (1 << a)))
    narrow(a,ds[a].filter((cell: number) => lines.indexOf(axis === 0 ? Math.floor(cell/p.columns) : cell%p.columns) < 0),reason,'line-group',people);
  }
  for (let axis = 0; axis < 2; axis++) for (let line = 0; line < (axis === 0 ? p.rows : p.columns); line++) {
   if ((axis === 0 ? p.rows : p.columns) !== N) continue;
   let who = -1, count = 0;
   for (let a = 0; a < N; a++) { let can = false; for (const c of ds[a]) if ((axis === 0 ? Math.floor(c/p.columns) : c%p.columns) === line) can = true; if (can) { count++; who = a; } }
   if (count === 0) result.contradiction = true;
   if (count === 1) narrow(who,ds[who].filter((c: number) => (axis === 0 ? Math.floor(c/p.columns) : c%p.columns) === line),'La '+(axis === 0 ? 'ligne ' : 'colonne ')+(line+1)+' doit accueillir quelqu’un ; une seule personne peut encore l’occuper.','line-uniqueness');
  }
  for (const c of p.clues) {
   if (c.kind === ROOM_COUNT || c.kind === FURNITURE_COUNT || c.kind === NEAR_COUNT) bound(c.kind === ROOM_COUNT ? 0 : c.kind === FURNITURE_COUNT ? 1 : 2,c.other,c.value,c.value,'Indice global : '+c.text);
   if (c.kind === EVERY_ROOM) for (let r = 0; r < 4; r++) bound(0,r,1,N,'Indice global : '+c.text);
   if (c.kind === COMPANY && ds[c.person].length > 0) {
    const r = room(p,ds[c.person][0]); if (ds[c.person].every((cell: number) => room(p,cell) === r)) bound(0,r,c.value,c.value,'Témoignage de '+personName(p,c.person)+' : '+c.text);
   }
  }
  if (ds[p.victim].length > 0) {
   const r = room(p,ds[p.victim][0]);
   if (ds[p.victim].every((cell: number) => room(p,cell) === r)) bound(0,r,2,2,'La victime partage sa pièce avec un seul meurtrier, sans troisième personne.');
  }
  if (result.contradiction || !changed) break;
 }
 if (ds.every((cells: number[]) => cells.length === 1)) { const placed: number[] = []; for (const cells of ds) placed.push(cells[0]); result.solved = validScene(p,placed); }
 return result;
}
