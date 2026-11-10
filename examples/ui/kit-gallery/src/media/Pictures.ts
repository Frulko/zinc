import { createImage, beginImage, endImage, clear, rrect, rect, polygon, destroyImage } from 'zinc:gfx';
import { onCleanup } from 'zinc:ui/solid';
import { closeImageViewer } from 'zinc:ui/kit';
/** The gallery owns two small rendered pictures, not a second photo cache or a network request. */
export function mediaPictures(): i32[] {
  const pictures: i32[] = [];
  for (let version: i32 = 0; version < 2; version++) {
    const image = createImage(640, 400); beginImage(image); clear(version === 0 ? 0xdad4c6 : 0xdde3df);
    rect(0, 240, 640, 160, version === 0 ? 0x9d9f8c : 0x929f91);
    rrect(72, 80, 220, 232, 8, 0xf8f6f0, 255);
    rect(102, 108, 160, 130, version === 0 ? 0x8f8a7d : 0x74877e);
    polygon([102, 238, 160, 150, 210, 209, 244, 172, 262, 238], version === 0 ? 0x66695c : 0x466358, 255);
    rrect(350, 180, 164, 132, 16, version === 0 ? 0xb3aa94 : 0x9aaa9f, 255);
    rect(367, 311, 130, 14, 0x686a60);
    rrect(392, 124, 80, 80, 40, version === 0 ? 0xb4b49e : 0x87a28e, 255);
    endImage(); pictures.push(image);
  }
  onCleanup(() => { closeImageViewer(true); for (const picture of pictures) destroyImage(picture); });
  return pictures;
}
