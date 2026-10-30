import { onFrame, clear, rect } from 'zinc:gfx';

onFrame((dt: number) => {
  clear(0xf3f1ec);
  rect(40, 40, 160, 100, 0x5746e0);
});
