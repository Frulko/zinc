import '../../../examples/murdoku/src/main';
import * as ui from 'zinc:ui';
import { width, height } from 'zinc:gfx';
import { viewport, viewportHeight, boardWidth } from '../../../examples/murdoku/src/layout';
ui.onKey((e: ui.KeyEvent): void => {
  if (e.key !== 'q') return;
  const safe = ui.safeArea();
  if (viewport() !== width()-safe[1]-safe[3] || viewportHeight() !== height()-safe[0]-safe[2]) throw new Error('Usable viewport ignores safe area');
  if (boardWidth() > viewport()) throw new Error('Board overflows safe width');
  let title = false, scroll = false;
  for (let i = 0; i < 1000; i++) {
    const n = ui.inspectNode(i);
    if (n === null || !n.alive) continue;
    const tool = n.label === 'Éliminer' || n.label === 'Brouillon' || n.label === 'Annuler' || n.label === 'Indice' || n.label === 'Vérifier' || n.label.startsWith('Placer ');
    if (n.text !== 'Minuit au manoir' && n.scroll === 0 && !tool) continue;
    const box = ui.screenBox(i);
    if (box[0] < safe[3] || box[1] < safe[0] || box[0]+box[2] > width()-safe[1] || box[1]+box[3] > height()-safe[2]) throw new Error('Controls overlap system area');
    if (n.text === 'Minuit au manoir') title = true;
    if (n.scroll > 0) scroll = true;
  }
  if (!title || !scroll) throw new Error('Missing tested controls');
  console.log('safe area ok');
});
