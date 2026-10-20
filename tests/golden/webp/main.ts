// A .webp asset (ZN-226): baked like a PNG; this lossless capture of tests/golden/shaped drawn 1:1 gives that frame's pixels again.
import * as gfx from 'zinc:gfx';
const img = gfx.image('frame.webp');
gfx.onFrame((dt: number) => { gfx.clear(0xffffff); gfx.drawImage(img, 0, 0, gfx.imageWidth(img), gfx.imageHeight(img), 255, 0); });
