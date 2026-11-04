import * as ui from 'zinc:ui';
import * as gfx from 'zinc:gfx';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { Scene } from '../../../app/figma-live/scene';
function child(parent: i32, index: i32): i32 {
  let h = ui.childAt(parent, index);
  while ((ui.inspectNode(h) as ui.UiNode).tag === ui.FRAGMENT) h = ui.childAt(h, 0);
  return h;
}
function check(ok: boolean, message: string): void { if (!ok) throw new Error(message); }
const raw = JSON.parse(fs.readText(sys.env('ZINC_LIVE_FIXTURE')));
const scene = new Scene(); scene.load(raw); ui.setRoot(scene.root); ui.layout();
let content = ui.childAt(scene.root, 0);
let title = child(content, 0), icon = child(content, 1), dot = child(content, 2);
const font = scene.document.fonts[0];
check(font.path !== '', 'The real font file was not extracted');
check(ui.textFont(title) === gfx.loadFont(font.path, 24), 'Native Text did not use the real Georgia Italic font');
const firstWidth = ui.screenBox(title)[2];
check(ui.screenBox(icon)[1] >= ui.screenBox(title)[1] + ui.screenBox(title)[3], 'Auto Layout did not stack the icon after the title');
scene.customViewport = true; scene.resize(520, 200); ui.layout();
check(Math.abs(ui.screenBox(title)[2] - firstWidth - 200) < 2, 'FILL text did not follow viewport width');
scene.seek(250); check(Math.abs(ui.getNumber(dot, 'opacity') - .5) < .01, 'Motion scrub did not apply half opacity');
scene.setPlaying(false); ui.tick(50); check(Math.abs(ui.getNumber(dot, 'opacity') - .5) < .01, 'Pause changed the scrubbed frame');
ui.click(icon); check(scene.current === '4:1', 'Prototype click did not navigate');
scene.back(); check(scene.current === '1:1', 'Back did not restore the initial screen');
check(scene.viewportWidth === 520, 'Prototype navigation lost the custom viewport');
scene.close();
console.log('figma runtime: Auto Layout/FILL, SVG/PNG/Lottie resources, Motion seek/pause, click/back and viewport preservation ok');
