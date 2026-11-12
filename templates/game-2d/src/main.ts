// Finish each frame before stopping one scene and entering the next.
import { onFrame } from 'zinc:gfx';
import { SceneController } from 'zinc:game';
import { GameScene, NextScene, TitleScene, PlayScene, OverScene } from './scenes';
import { readInput } from './input';

const titleScene = new TitleScene(), playScene = new PlayScene(), overScene = new OverScene(playScene);
const title = new SceneController(titleScene), play = new SceneController(playScene), over = new SceneController(overScene);
let scene: GameScene = titleScene;
let controller: SceneController = title;
controller.start();

onFrame((dt: number) => {
  readInput();
  controller.update(dt);
  controller.draw();
  if (scene.next === NextScene.Stay) return;
  controller.stop();
  if (scene.next === NextScene.Play) { scene = playScene; controller = play; }
  else { scene = overScene; controller = over; }
  controller.start();
});
