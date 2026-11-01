import { Puzzle, N, EMPTY, occupiable } from '../../../examples/murdoku/src/model';
import { fact, ON } from '../../../examples/murdoku/src/clues';
import { deduce } from '../../../examples/murdoku/src/deduction';
import { nextHint } from '../../../examples/murdoku/src/hints';
import { generate } from '../../../examples/murdoku/src/puzzle';
function fixture(people: number, columns: number): Puzzle {
 const p = new Puzzle(); p.columns = 8; p.rows = 6; p.victim = 5;
 for (let c = 0; c < 48; c++) { p.decor.push(EMPTY); p.roomMap.push(Math.floor(c/16)); }
 for (let y = 0; y < 6; y++) p.decor[y*8+y%columns] = 1;
 for (let a = 0; a < people; a++) p.clues.push(fact(a,ON,1,'Sur un fauteuil.'));
 return p;
}
for (let size = 2; size <= 3; size++) {
 const p = fixture(size,size), result = deduce(p,true);
 if (result.contradiction) throw new Error('Legal line group rejected');
 for (let a = size; a < N; a++) if (result.domains[a].some((c: number) => c%8 < size)) throw new Error('Reserved columns were not excluded');
 if (!result.steps.some((s) => s.rule === 'line-group' && s.people.length === size && s.removed.length > 0)) throw new Error('Missing line-group proof');
 // Eight columns and six people: unused columns are legal, so hidden singles must not force all columns to be occupied.
 for (let a = size; a < N; a++) if (result.domains[a].length === 0) throw new Error('Rectangular board lost a legal domain');
}
if (!deduce(fixture(3,2)).contradiction) throw new Error('Three people in two columns should contradict');
const p = generate(3301,1), answer = p.solution.slice();
p.solution = []; p.walkthrough = []; // hint paths must use constraints, not the stored answer or its old walkthrough
const placed = [-1,-1,-1,-1,-1,-1], excluded: number[] = [];
for (let c = 0; c < p.columns*p.rows; c++) excluded.push(0);
const first = nextHint(p,placed,excluded);
if (first.error || first.person < 0 || first.cell !== answer[first.person]) throw new Error('No justified initial hint');
placed[first.person] = first.cell;
const second = nextHint(p,placed,excluded);
if (second.error || second.person === first.person || second.cell !== answer[second.person]) throw new Error('Hint ignored current placement');
let wrong = -1;
for (let c = 0; c < p.columns*p.rows; c++) if (occupiable(p,c) && c !== first.cell) { wrong = c; break; }
placed[first.person] = wrong;
const conflict = nextHint(p,placed,excluded);
if (!conflict.error || conflict.person !== first.person || conflict.cell !== wrong || conflict.rule !== 'wrong-placement') throw new Error('Wrong placement was silently accepted');
placed[first.person] = -1; excluded[first.cell] = 1;
const crossed = nextHint(p,placed,excluded);
if (!crossed.error || crossed.cell !== first.cell || crossed.rule !== 'wrong-exclusion') throw new Error('Wrong cross was ignored');
excluded[first.cell] = 0;
for (let a = 0; a < N; a++) placed[a] = answer[a];
if (!nextHint(p,placed,excluded).complete) throw new Error('Completed board still offered a hint');
console.log('reasoning ok');
