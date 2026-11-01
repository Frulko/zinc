import * as K from './clues';
import { Puzzle } from './model';
const nouns = ['plante','fauteuil','bibliothèque','statue','plante fleurie','tapis','table dressée','coffre-fort','piano','foyer','lit','hamac','bonsaï','horloge','chevalet','armoire','panier','tableau'];
const fem = [0,2,3,4,6,13,15];
const B = (x: string): string => '**'+x+'**';
function noun(v: number): string { return v >= 0 && v < nouns.length ? B(nouns[v]) : B('case vide'); }
function def(v: number): string { return (v === 13 || v === 15 ? 'l’' : fem.indexOf(v) >= 0 ? 'la ' : 'le ')+noun(v); }
function of(v: number): string { return v === 13 || v === 15 ? 'de l’'+noun(v) : fem.indexOf(v) >= 0 ? 'de la '+noun(v) : 'du '+noun(v); }
function onto(v: number): string { return (v === 1 || v === 10 || v === 11 ? 'dans ' : 'sur ')+def(v); }
// A full sentence in the witness's own voice, as the official game words it; **x** marks the words that carry the clue.
export function clueSummary(p: Puzzle, c: K.Clue): string {
 const f = c.person >= 0 && p.characters[c.person].sex === 1;
 const he = f ? 'Elle' : 'Il', v = c.value;
 const room = (r: number): string => B(p.roomNames[r]);
 const a = (k: number): boolean => c.kind === k;
 if (a(K.ROW)) return he+' était sur la '+B('ligne '+(v+1))+'.';
 if (a(K.COLUMN)) return he+' était sur la '+B('colonne '+(v+1))+'.';
 if (a(K.ROOM)) return he+' était dans '+room(v)+'.';
 if (a(K.NOT_ROOM)) return he+' n’était '+B('pas')+' dans '+room(v)+'.';
 if (a(K.EITHER_ROOM)) return he+' était dans '+room(v)+' ou dans '+room(c.other)+'.';
 if (a(K.NEAR)) return he+' était '+B('à côté')+' '+of(v)+'.';
 if (a(K.ONLY_NEAR)) return he+' était '+B('la seule personne')+' à côté '+of(v)+'.';
 if (a(K.NOT_NEAR)) return he+' n’était '+B('pas')+' à côté '+of(v)+'.';
 if (a(K.ON)) return he+' était '+onto(v)+'.';
 if (a(K.ONLY_ON)) return he+' était '+B('la seule personne')+' '+onto(v)+'.';
 if (a(K.NOT_ON)) return he+' n’était '+B('pas')+' '+onto(v)+'.';
 if (a(K.ROOM_WITH)) return he+' était dans une pièce '+B('avec')+' '+(v === 0 || v === 4 ? 'une '+noun(v) : def(v))+'.';
 if (a(K.ROOM_WITHOUT)) return he+' était dans une pièce '+B('sans')+' '+noun(v)+'.';
 if (a(K.ROW_WITH)) return he+' était sur la '+B('même ligne')+' que '+def(v)+', dans sa pièce.';
 if (a(K.NOT_ROW_WITH)) return he+' était sur une '+B('autre ligne')+' que '+def(v)+', dans sa pièce.';
 if (a(K.COLUMN_WITH)) return he+' était dans la '+B('même colonne')+' que '+def(v)+', dans sa pièce.';
 if (a(K.NOT_COLUMN_WITH)) return he+' était dans une '+B('autre colonne')+' que '+def(v)+', dans sa pièce.';
 if (a(K.WINDOW)) return he+' était devant une '+B('fenêtre')+'.';
 if (a(K.NOT_WINDOW)) return he+' n’était '+B('pas')+' devant une fenêtre.';
 if (a(K.CORNER)) return he+' était dans un '+B('coin')+'.';
 if (a(K.NOT_CORNER)) return he+' n’était '+B('pas')+' dans un coin.';
 if (a(K.WALL)) return he+(v === 1 ? ' était '+B('contre un mur')+'.' : ' était '+B('loin des murs')+'.');
 if (a(K.ALONE)) return he+' était '+B('seul'+(f ? 'e' : ''))+' dans sa pièce.';
 if (a(K.COMPANY)) return he+' était dans une pièce de '+B(v+' personnes')+'.';
 if (a(K.LEFT_OF)) return he+' était à '+B('gauche')+' de';
 if (a(K.RIGHT_OF)) return he+' était à '+B('droite')+' de';
 if (a(K.ABOVE)) return he+' était '+B('au-dessus')+' de';
 if (a(K.BELOW)) return he+' était '+B('au-dessous')+' de';
 if (a(K.SAME_ROOM)) return he+' était dans la '+B('même pièce')+' que';
 if (a(K.DIFFERENT_ROOM)) return he+' était dans une '+B('autre pièce')+' que';
 return c.text;
}
export function plain(s: string): string { return s.split('**').join(''); }
// Splits "a **b** c" into the text and the [length, style, color] runs of ui.setTextRuns.
export function runsOf(s: string): i32[] {
 const runs: i32[] = [], parts = s.split('**');
 for (let i = 0; i < parts.length; i++) if (parts[i].length > 0) { runs.push(parts[i].length); runs.push(i%2 === 1 ? 1 : 0); runs.push(-1); }
 return runs;
}
