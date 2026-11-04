import { render, onCleanup } from 'zinc:ui/solid';
import * as fs from 'zinc:fs';
import * as gfx from 'zinc:gfx';
import { Scene } from '../figma-live/scene';
import { HouseController } from './controller';
const scene = new Scene();
new HouseController(scene);
scene.load(JSON.parse(fs.readText('assets/storyboard.json')));
scene.customViewport = true;
const resize = (w: number, h: number): void => scene.resize(w,h);
gfx.onResize(resize);
scene.resize(gfx.width(),gfx.height());
function App(): i32 { onCleanup((): void => scene.close()); return scene.root; }
render(App,0xf5f4ef,null);
