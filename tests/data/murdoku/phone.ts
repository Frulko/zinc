import '../../../examples/murdoku/src/main';
import * as ui from 'zinc:ui';
import { puzzle, placements, hints, hintPerson, hintCell } from '../../../examples/murdoku/src/state';
import { compact, boardWidth, mobileTab } from '../../../examples/murdoku/src/layout';
ui.onKey((e: ui.KeyEvent) => {
 if (e.key === 'r') { if (mobileTab() !== 'temoins') throw new Error('Witness tab'); return; }
 if (e.key !== 'q') return;
 const p = puzzle(), a = p.castOrder[0];
 if (!compact() || boardWidth() > 390) throw new Error('Phone layout overflows');
 if (placements()[a] !== p.solution[a]) throw new Error('Touch letter palette placement');
 if (mobileTab() !== 'aide' || hints() !== 1 || hintPerson() < 0 || hintCell() < 0) throw new Error('Visual hint');
 console.log('phone ok');
});
