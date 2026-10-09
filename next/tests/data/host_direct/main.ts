// Every direct host row of ZN-397 (zn::host::hostFast): drawn and read once per frame; the pixels and the output must match the decoded HostCall path.
import { onFrame, clear, rect, rrect, line, border, clip, unclip, translate, width, height, pixelScale, isDown, wasPressed, pointerX, pointerY, pointerDown, Btn } from 'zinc:gfx';

let frame = 0;
onFrame((dt: number) => {
  clear(0x102030);
  for (let i = 0; i < 40; i++) rect(i * 7.5, (i * 13) % height(), 6.25, 5.5, 0xff8800 + i);
  rrect(20, 30, 90, 40, 8, 0x33cc99, 200);
  line(0, 0, width(), height(), 0xffffff);
  border(130, 20, 60, 50, 6, 2.5, 0xee4455, 255);
  clip(150, 100, 80, 60, 10);
  translate(4, -3);
  rect(140, 90, 120, 90, 0x5566ff);
  translate(-4, 3);
  unclip();
  if (frame === 2) console.log(`size ${width()}x${height()} scale ${pixelScale()} down ${isDown(Btn.Up)} pressed ${wasPressed(Btn.A)} pointer ${pointerX()},${pointerY()} ${pointerDown()}`);
  frame++;
});
