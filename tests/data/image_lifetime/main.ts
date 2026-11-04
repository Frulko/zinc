import { onFrame, clear, createImage, destroyImage, drawImage, beginImage, endImage, rect, quit } from 'zinc:gfx';
import { resourceStats } from 'zinc:__diagnostics';
let frame = 0, image: i32 = -1, replacement: i32 = -1;
onFrame(() => {
  const step = frame % 10;
  clear(0x112233);
  if (step === 0) {
    image = createImage(128, 128);
    beginImage(image); rect(0, 0, 128, 128, 0xff0000); endImage();
  }
  if (step < 3) drawImage(image, 0, 0, 128, 128, 255, 0);
  if (step === 3) console.log('live ' + resourceStats());
  if (step === 4) {
    destroyImage(image);
    if (frame >= 20) replacement = createImage(16, 16);   // same slot, never uploaded: the old GPU texture must still die
  }
  if (step === 8) console.log('freed ' + resourceStats());
  if (step === 9 && replacement >= 0) destroyImage(replacement);
  if (++frame === 30) quit();
});
