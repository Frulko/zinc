import * as gfx from 'zinc:gfx';
const f = gfx.font('sans', 32);
gfx.onFrame((dt: number) => { gfx.clear(0xffffff); gfx.drawText(f, 10, 20, 'ᐃᓄᒃᑎᑐᑦ ᐊᓂ', 0x000000, 255, 0); });
