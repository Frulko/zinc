import { Stage } from 'zinc:stage';
import { onFrame, onResize, width, height } from 'zinc:gfx';
import { args } from 'zinc:sys';
import { GameScene } from './GameScene';
import { PixelGame } from './game';
import { Balote } from './games/balote';
import { StariMost } from './games/stari-most';
import { Laundry } from './games/laundry';
import { TieBreak } from './games/tie-break';
import { MiniRamp } from './games/mini-ramp';
import { HarborGame } from './harbor/HarborGame';
import { RiverGame } from './river/RiverGame';
import { FishingGame } from './fishing/FishingGame';
import { StraightGame } from './straight/StraightGame';
import { PitStopGame } from './pitstop/PitStopGame';
import { OdysseyGame } from './odyssey/OdysseyGame';
import { RocketGame } from './rocket/RocketGame';

const games: PixelGame[] = [new Balote(), new StariMost(), new Laundry(), new TieBreak(), new MiniRamp(), new HarborGame(), new RiverGame(), new FishingGame(), new StraightGame(), new PitStopGame(), new OdysseyGame(), new RocketGame()];
let selected: i32 = 0;
for (const argument of args()) {
  for (let i = 0; i < games.length; i++) if (argument === games[i].id) selected = i as i32;
}
const stage = new Stage();
stage.color = 0xffffff;
const scene = new GameScene(games, selected);
stage.addChild(scene);
onResize((w: number, h: number) => { scene.width = w; scene.height = h; });
onFrame((dt: number) => {
  scene.width = width();
  scene.height = height();
  stage.frame(dt);
});
console.log('pixel-plays: native TypeScript, ' + games[selected].id);
