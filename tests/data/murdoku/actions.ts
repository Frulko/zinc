import { puzzle, placements, setSelected, place, setDraft, notes, undo, hint, hints, verify, accuse, message, fresh, activeCell, selectCell, assignLetter, blocked, clearCell, eliminated, toggleElimination } from '../../../examples/murdoku/src/state';
import { occupiable, personLetter } from '../../../examples/murdoku/src/puzzle';
const first = puzzle().solution[0], second = puzzle().solution[1];
setSelected(0); place(first);
if (placements()[0] !== first) throw new Error('Placement');
for (let c = 0; c < puzzle().columns*puzzle().rows; c++) if (c !== first && (c%puzzle().columns === first%puzzle().columns || Math.floor(c/puzzle().columns) === Math.floor(first/puzzle().columns)) && !blocked(c)) throw new Error('Row column exclusion');
setDraft(true); place(second);
if (notes()[second] !== 1 || placements()[0] !== first) throw new Error('Draft changed placement');
place(second); if (notes()[second] !== 0) throw new Error('Draft toggle');
setDraft(false); setSelected(1); place(first);
if (placements()[0] !== first || placements()[1] !== -1) throw new Error('Occupied square replaced');
place(second); undo();
if (placements()[0] !== first || placements()[1] !== -1) throw new Error('Undo');
for (let c = 0; c < puzzle().columns*puzzle().rows; c++) if (!occupiable(puzzle(),c)) {
 selectCell(c); if (activeCell() === c) throw new Error('Selected blocked furniture');
 place(c); if (placements()[1] !== -1 || notes()[c] !== 0) throw new Error('Placed on furniture');
}
hint(); if (hints() !== 1) throw new Error('Hint');
selectCell(second); toggleElimination();
if (eliminated()[second] !== 1 || !blocked(second)) throw new Error('Manual elimination');
selectCell(second); if (activeCell() !== second) throw new Error('Eliminated square cannot be reselected');
place(second); if (placements()[1] !== -1) throw new Error('Placement on eliminated square');
undo(); if (eliminated()[second] !== 0 || blocked(second)) throw new Error('Undo elimination');
toggleElimination(); toggleElimination(); if (eliminated()[second] !== 0) throw new Error('Elimination toggle');
toggleElimination(); clearCell(); if (eliminated()[second] !== 0) throw new Error('Clear manual elimination');
undo(); if (eliminated()[second] !== 1) throw new Error('Undo clear elimination');
selectCell(first); toggleElimination(); if (eliminated()[first] !== 0 || placements()[0] !== first) throw new Error('Eliminated occupied square');
fresh(2);
if (eliminated().some((m: number) => m !== 0)) throw new Error('Eliminations survived new game');
for (let a = 0; a < 6; a++) { setSelected(a); place(puzzle().solution[a]); }
verify(); setSelected(puzzle().killer); accuse();
if (!message().startsWith('Affaire classée')) throw new Error('Accusation');
fresh(0); if (placements().some((c: number) => c !== -1) || hints() !== 0 || notes().some((c: number) => c !== 0)) throw new Error('Reset');
const victim = puzzle().victim, target = puzzle().solution[victim];
selectCell(target);
if (placements().some((c: number) => c !== -1)) throw new Error('Selecting a cell placed a person');
assignLetter('v',false);
if (placements()[victim] !== target) throw new Error('Victim key');
const other = puzzle().solution[(victim+1)%puzzle().columns]; selectCell(other); assignLetter('v',true);
if (notes()[other] !== (1 << victim) || placements()[victim] !== target) throw new Error('Shift victim note');
assignLetter('V',true); if (notes()[other] !== 0) throw new Error('Shift toggles note');
setDraft(true); assignLetter('v',false);
if (placements()[victim] !== other || notes()[other] !== 0) throw new Error('Plain key must ignore mouse draft mode');
undo(); if (placements()[victim] !== target) throw new Error('Keyboard undo');
selectCell(target); clearCell(); if (placements()[victim] !== -1) throw new Error('Clear cell');
if (assignLetter('z',false)) throw new Error('Unknown key');
fresh(1); if (activeCell() !== -1) throw new Error('New game selection');
for (let seed = 0; seed < 2; seed++) {
 const cell = puzzle().solution[puzzle().victim]; selectCell(cell); assignLetter('v',false);
 if (placements()[puzzle().victim] !== cell || personLetter(puzzle(),puzzle().victim) !== 'V') throw new Error('Victim identity after regeneration');
 fresh(1);
}
console.log('actions ok');
