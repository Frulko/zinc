import * as gfx from 'zinc:gfx';
let frame: i32 = 0;
// A closed graphics host must cancel pending guest timers, as native Zinc does.
setTimeout(() => { console.log('unexpected timer after close'); }, 3600000);
gfx.onFrame((dt: number): void => {
  frame++;
  gfx.clear(0x152030);
  gfx.clip(0, 0, gfx.width(), gfx.height());
  gfx.rect(8 + frame % 80, 12, 96, 48, 0xe97442);
  gfx.gradient(120, 12, 90, 48, 8, 0x3088cc, 0x60ddaa, true, 220);
  gfx.line(8, 80, 210, 110, 0xffffff);
  gfx.polygon([235, 12, 302, 20, 275, 65], 0xf8be54, 210);
  gfx.path([4, 235, 85, 305, 85, 305, 150, 235, 150, 4, 250, 100, 250, 135, 290, 135, 290, 100], 0x73ccaa, 220);
  gfx.stroke([230, 180, 260, 165, 300, 190, 280, 215], 3.5, 0xf087bd, 255, false);
  gfx.text(12, 130, 'Zinc engines', 0xffffff, 2);
  gfx.drawText(gfx.font('sans', 16), 12, 180, 'Même rendu', 0xddddff, 255, 0);
  gfx.unclip();
  if (frame === 2) console.log('frames', frame, gfx.width(), gfx.height(), dt > 0);
});
