import { Puzzle, N } from './model';
import { deduce } from './deduction';
export class Hint {
 person = -1; cell = -1; rule = ''; people: number[] = []; error = false; complete = false;
}
/** Recompute from the player's facts, never from the stored solution or a search oracle. Pencil marks are hypotheses, not facts. */
export function nextHint(p: Puzzle, placed: number[], excluded: number[]): Hint {
 const hint = new Hint(), logic = deduce(p,true,placed,excluded);
 if (logic.contradiction) {
  const proof = deduce(p);
  hint.error = true;
  for (let a = 0; a < N; a++) if (placed[a] >= 0 && proof.domains[a].indexOf(placed[a]) < 0) {
   hint.person = a; hint.cell = placed[a]; hint.rule = 'wrong-placement'; return hint;
  }
  for (let a = 0; a < N; a++) if (proof.domains[a].length === 1 && excluded.length > proof.domains[a][0] && excluded[proof.domains[a][0]] === 1) {
   hint.person = a; hint.cell = proof.domains[a][0]; hint.rule = 'wrong-exclusion'; return hint;
  }
  hint.rule = 'contradiction'; return hint;
 }
 for (const step of logic.steps) if (step.cell >= 0 && placed[step.person] < 0) {
  hint.person = step.person; hint.cell = step.cell; hint.rule = step.rule; hint.people = step.people.slice(); return hint;
 }
 hint.complete = placed.every((cell: number) => cell >= 0) && logic.solved;
 return hint;
}
