import { nextHint } from './hints';
import { createSignal, batch } from 'zinc:ui/solid';
import { generate, names, personName, room, personLetter, occupiable } from './puzzle';
function emptyNotes(): number[] { const ns: number[] = []; for (let i = 0; i < puzzle().columns*puzzle().rows; i++) ns.push(0); return ns; }
export const [puzzle, setPuzzle] = createSignal(generate(3301, 1));
export const [activeCell, setActiveCell] = createSignal(-1);
export const [selected, setSelected] = createSignal(0);
export const [placements, setPlacements] = createSignal<number[]>([-1,-1,-1,-1,-1,-1]);
export const [notes, setNotes] = createSignal<number[]>(emptyNotes());
export const [eliminated, setEliminated] = createSignal<number[]>(emptyNotes());
// The mouse brush: once a suspect is picked, every tap on the plan places them (no cell-then-portrait round trip).
export const [stamp, setStamp] = createSignal(false);
export const [draft, setDraft] = createSignal(false);
export const [message, setMessage] = createSignal('Choisissez un suspect puis touchez les cases du plan. Clavier : case + lettre, Maj + lettre : brouillon.');
export const [hintPerson, setHintPerson] = createSignal(-1);
export const [hintCell, setHintCell] = createSignal(-1);
export const [hintRule, setHintRule] = createSignal('');
export const [hintError, setHintError] = createSignal(false);
export const [hintDependencies, setHintDependencies] = createSignal<number[]>([]);
export const [hints, setHints] = createSignal(0);
class Move { placements: number[] = []; eliminated: number[] = []; notes: number[] = []; }
const history: Move[] = [];
function remember(): void {
 const move = new Move(); move.placements = placements().slice(); move.eliminated = eliminated().slice(); move.notes = notes().slice(); history.push(move);
}
// The new case takes about a second to generate: the UI shows a loader first, then generates; a second tap while busy is ignored.
export const [busy, setBusy] = createSignal(false);
export function freshAsync(level: number, done?: () => void): void {
  if (busy()) return;
  setBusy(true);
  setTimeout(() => { fresh(level); setBusy(false); if (done) done(); }, 60);
}
export function fresh(level: number): void {
  // One batch: the plan must never render with the new puzzle and the old placements, notes or crosses (another grid size).
  batch(() => {
  setPuzzle(generate(puzzle().seed + 1,level)); setPlacements([-1,-1,-1,-1,-1,-1]);
  setActiveCell(-1); setNotes(emptyNotes()); setEliminated(emptyNotes()); history.length = 0; setHints(0); setHintError(false); setHintRule(''); setHintPerson(-1); setHintCell(-1); setHintDependencies([]); setMessage('Une nouvelle affaire vous attend.');
  });
}
export function automaticallyBlocked(cell: number): boolean {
 if (!occupiable(puzzle(),cell)) return true;
 if (placements().indexOf(cell) >= 0) return false;
 for (const placed of placements()) if (placed >= 0 && (placed%puzzle().columns === cell%puzzle().columns || Math.floor(placed/puzzle().columns) === Math.floor(cell/puzzle().columns))) return true;
 return false;
}
export function blocked(cell: number): boolean { return automaticallyBlocked(cell) || eliminated()[cell] === 1; }
export function toggleElimination(): void {
 const cell = activeCell();
 if (cell < 0) { setMessage('Sélectionnez une case à éliminer.'); return; }
 if (placements().indexOf(cell) >= 0) { setMessage('Retirez la personne avant d’éliminer sa case.'); return; }
 if (automaticallyBlocked(cell) && eliminated()[cell] !== 1) { setMessage('Cette case est déjà exclue automatiquement.'); return; }
 remember();
 const marks = eliminated().slice(); marks[cell] = marks[cell] === 1 ? 0 : 1; setEliminated(marks);
 setMessage(marks[cell] === 1 ? 'Case éliminée. X permet de la rétablir.' : 'Marque d’élimination retirée.');
}
export function place(cell: number, pencil: boolean = draft()): void {
  const a = selected();
  if (blocked(cell)) { setMessage('Case indisponible : meuble non occupable, ligne ou colonne déjà prise, ou case éliminée.'); return; }
  const occupant = placements().indexOf(cell);
  if (occupant >= 0 && occupant !== a) { setMessage('Retirez d’abord la personne déjà présente.'); return; }
  if (pencil) { remember(); const ns = notes().slice(); ns[cell] = ns[cell] ^ (1 << a); setNotes(ns); return; }
  const ps = placements().slice(); remember();
  for (let i = 0; i < 6; i++) if (ps[i] === cell && i !== a) ps[i] = -1;
  ps[a] = ps[a] === cell ? -1 : cell; setPlacements(ps); setMessage('Placement noté. Les témoignages restent à vérifier.');
}
function nextToPlace(from: number): number {
  const order = puzzle().castOrder;
  for (let i = 1; i <= order.length; i++) { const a = order[(order.indexOf(from)+i)%order.length]; if (placements()[a] < 0) return a; }
  return from;
}
export function selectCell(cell: number): void {
  if (automaticallyBlocked(cell)) return;
  setActiveCell(cell);
  if (stamp()) {
    const a = selected(), pencil = draft(), before = placements()[a];
    place(cell);
    // After a firm placement the brush moves to the next person still to place.
    if (!pencil && before < 0 && placements()[a] === cell) setSelected(nextToPlace(a));
    return;
  }
  setMessage('Case ' + (Math.floor(cell/puzzle().columns)+1) + '·' + (cell%puzzle().columns+1) + ' : lettre pour placer, Maj + lettre pour le brouillon.');
}
export function choosePerson(a: number): void {
  setSelected(a); setStamp(true);
  if (activeCell() >= 0) { place(activeCell()); setActiveCell(-1); }
  else setMessage(personLetter(puzzle(),a)+' en main : touchez une case pour '+(draft() ? 'la noter au brouillon.' : 'placer.'));
}
export function assignLetter(key: string, shift: boolean): boolean {
  for (let a = 0; a < 6; a++) if (key.toUpperCase() === personLetter(puzzle(),a)) {
    setSelected(a);
    if (activeCell() >= 0) place(activeCell(),shift);
    else { setStamp(true); setMessage(key.toUpperCase()+' en main : touchez une case pour '+(draft() ? 'la noter au brouillon.' : 'placer.')); }
    return true;
  }
  return false;
}
export function clearCell(): void {
 const cell = activeCell(); if (cell < 0) return;
 const ps = placements().slice(), who = ps.indexOf(cell);
 if (who >= 0 || eliminated()[cell] === 1) remember();
 if (who >= 0) { ps[who] = -1; setPlacements(ps); }
 const marks = eliminated().slice(); marks[cell] = 0; setEliminated(marks);
 const ns = notes().slice(); ns[cell] = 0; setNotes(ns);
}
export function undo(): void {
 if (history.length === 0) return;
 const move = history.pop()!; setPlacements(move.placements); setEliminated(move.eliminated); setNotes(move.notes);
}
export function hint(): void {
 const p = puzzle(), result = nextHint(p,placements(),eliminated());
 setHintPerson(result.person); setHintCell(result.cell); setHintRule(result.rule); setHintError(result.error); setHintDependencies(result.people);
 if (result.complete) { setMessage('La scène est reconstituée. Vous pouvez accuser le coupable.'); return; }
 setHints(hints()+1);
 if (result.person >= 0) setSelected(result.person);
 if (result.error) {
  setMessage(result.rule === 'wrong-placement' ? 'Le placement de '+personLetter(p,result.person)+' contredit les indices.' : result.rule === 'wrong-exclusion' ? 'Une case nécessaire à '+personLetter(p,result.person)+' a été éliminée. Rétablissez-la.' : 'Les placements et les cases éliminées se contredisent.');
  return;
 }
 setMessage(result.person >= 0 ? 'Placement expliqué '+personLetter(p,result.person)+'.' : 'Aucun placement direct à expliquer pour le moment.');
}

export function verify(): void {
  for (let a = 0; a < 6; a++) if (placements()[a] !== puzzle().solution[a]) { setMessage('L’enquête reste ouverte : au moins un placement manque ou contredit les indices.'); return; }
  setMessage('La scène est reconstituée ! Sélectionnez le coupable et accusez-le.');
}
export function accuse(): void {
  if (placements().some((c: number) => c < 0)) { setMessage('Placez les six personnes avant de porter une accusation.'); return; }
  for (let a = 0; a < 6; a++) if (placements()[a] !== puzzle().solution[a]) { setMessage('Vérifiez d’abord votre reconstitution.'); return; }
  setMessage(selected() === puzzle().killer ? 'Affaire classée ! ' + personName(puzzle(),selected()) + ' était seul·e avec la victime.' : 'Cette personne ne partageait pas la pièce de la victime.');
}
