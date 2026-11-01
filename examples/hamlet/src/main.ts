import { Stage } from 'zinc:stage';
import { onFrame, onResize, width, height } from 'zinc:gfx';
import { HamletScene } from './HamletScene';

const stage = new Stage();
stage.color = 0xffffff;
const scene = new HamletScene();
stage.addChild(scene);
onResize((w: number, h: number) => { scene.width = w; scene.height = h; });
onFrame((dt: number) => {
  scene.width = width();
  scene.height = height();
  stage.frame(dt);
});
