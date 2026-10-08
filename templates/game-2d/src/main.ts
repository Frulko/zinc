// The frame loop: the current scene runs every frame and names the next one.
import { onFrame } from 'zinc:gfx';
import { Scene, TitleScene, PlayScene, OverScene } from './scenes';

const titleScene = new TitleScene(), playScene = new PlayScene(), overScene = new OverScene();
let scene: Scene = titleScene;

onFrame((dt: number) => {
  const next = scene.update(dt);
  if (next === 'play') { playScene.restart(); scene = playScene; }
  else if (next === 'over') { overScene.enter(playScene.world.score); scene = overScene; }
  else if (next === 'title') scene = titleScene;
});
