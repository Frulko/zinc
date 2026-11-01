import '../../../examples/murdoku/src/main';
import * as ui from 'zinc:ui';
import { cellSize } from '../../../examples/murdoku/src/layout';
import { puzzle, placements, notes, activeCell, hints, message, eliminated, blocked } from '../../../examples/murdoku/src/state';
let reasoned = false;
ui.onKey((e: ui.KeyEvent) => {
 if (e.key === 'h') { reasoned = message().startsWith('Placement expliqué'); return; }
 if (e.key !== 'q' && e.key !== 'w') return;
 const p = puzzle(), a = p.victim, b = (a+1)%6;
 const first = p.roomMap.findIndex((r: number) => r >= 0);
 const label = 'Case ligne '+(Math.floor(first/p.columns)+1)+' colonne '+(first%p.columns+1);
 let canvas: number[] = [], cell: number[] = [];
 for (let i = 0; i < 3000; i++) {
  const node = ui.inspectNode(i); if (node === null) continue;
  if (node.label === 'Plan du manoir') canvas = ui.screenBox(i);
  if (node.label.startsWith(label)) cell = ui.screenBox(i);
 }
 if (canvas.length !== 4 || cell.length !== 4) throw new Error('Missing board geometry');
 const x = cell[0]-(first%p.columns)*cellSize(), y = cell[1]-Math.floor(first/p.columns)*cellSize();
 const halfWall = 4*cellSize()/80;
 if (canvas[0] > x-halfWall || canvas[1] > y-halfWall || canvas[0]+canvas[2] < x+p.columns*cellSize()+halfWall || canvas[1]+canvas[3] < y+p.rows*cellSize()+halfWall) throw new Error('Canvas clips the centered exterior walls');

 if (placements()[a] !== p.solution[a]) throw new Error('Pointer/key victim placement');
 if (placements()[b] !== -1 || notes()[p.solution[b]] !== (1 << b)) throw new Error('Shift key pencil note');
 if (activeCell() !== p.solution[b]) throw new Error('Pointer selected wrong cell');
 if (hints() !== 1 || !reasoned) throw new Error('Reasoned hint');
 if (e.key === 'q') { if (eliminated()[p.solution[b]] !== 1 || !blocked(p.solution[b])) throw new Error('X elimination'); }
 else { if (eliminated()[p.solution[b]] !== 0 || blocked(p.solution[b])) throw new Error('Restore button'); console.log('keyboard ok'); }
});
