import { onFrame, width, height, keyCount, keyKind, keyName, KeyKind } from 'zinc:gfx';
import { Stage, uiState } from 'zinc:stage';
import { state } from './state';
import { Reveal } from './components/Reveal';

const stage = new Stage();
const reveal = new Reveal('reveal');
reveal.flex = 1;
stage.alignItems = 'stretch';
stage.addChild(reveal);
let lastWidth = 0;
let lastHeight = 0;

onFrame((dt: number) => {
  for (let i: i32 = 0; i < keyCount(); i++) {
    if (keyKind(i) !== KeyKind.Down && keyKind(i) !== KeyKind.Repeat) continue;
    const key = keyName(i);
    if (keyKind(i) === KeyKind.Repeat && key !== 'ArrowLeft' && key !== 'ArrowRight') continue;
    if (key === ' ') state.toggle();
    else if (key === 'r' || key === 'Enter') state.replay();
    else if (key === 'd') state.theme();
    else if (key === 'ArrowLeft') state.seek(state.time - 1 / 60);
    else if (key === 'ArrowRight') state.seek(state.time + 1 / 60);
  }
  state.step(dt);
  if (lastWidth !== width() || lastHeight !== height()) {
    lastWidth = width();
    lastHeight = height();
    uiState.dirty = true;
  }
  stage.frame(dt);
});
