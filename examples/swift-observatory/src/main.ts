import { Stage, uiState } from 'zinc:stage';
import { onFrame, onResize, keyCount, keyName, keyKind, width, height } from 'zinc:gfx';
import { env } from 'zinc:sys';
import { Observatory } from './Scene';
import { configure, select, selected } from './state';
const stage = new Stage(); stage.color = 0x101b2d;
const scene = new Observatory('observatory'); stage.addChild(scene);
onResize((w: number, h: number) => { scene.width = w; scene.height = h; uiState.dirty = true; });
scene.width = width(); scene.height = height();
onFrame((dt: number) => {
  for (let i: i32 = 0; i < keyCount(); i++) {
    if (keyKind(i) == 0) {
      if (keyName(i) == 's') {
        configure(Number(env('OBS_SPEED')), env('OBS_PAUSED') == '1', Number(env('OBS_SELECTION')) as i32);
        uiState.dirty = true;
      }
      if (keyName(i) == 'Tab') { select((selected + 1) % 3); uiState.dirty = true; }
    }
  }
  stage.frame(dt);
});
