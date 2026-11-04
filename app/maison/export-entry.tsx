import { render, onCleanup } from 'zinc:ui/solid';
import * as gfx from 'zinc:gfx';
import { createDesign } from './generated/design';
import { HouseController } from './controller';
const scene = createDesign();
new HouseController(scene);
scene.restart();
scene.customViewport = true;
const resize = (w: number, h: number): void => scene.resize(w,h);
gfx.onResize(resize);
scene.resize(gfx.width(),gfx.height());
function App(): i32 { onCleanup((): void => scene.close()); return scene.root; }
render(App,0xf5f4ef,null);
