// imageFromBytes on a WebP (the media proxy of Discord's CDN sends WebP): the file of tests/data/imageio, lossy with an ICC profile and lossless;
// on a GIF (ZN-674): a still GIF87a and the first frame of an animated GIF89a.
import { imageFromBytes, imageWidth, imageHeight } from 'zinc:gfx';
import { readBytes } from 'zinc:fs';
for (const f of ['tests/data/imageio/photo.webp', 'examples/discord/tests/assets/photo.webp', 'tests/data/images/fixture.gif', 'tests/data/imageio/anim.gif']) {
  const img = imageFromBytes(readBytes(f));
  console.log(`${f.split('/').pop()} ${img >= 0} ${imageWidth(img)}x${imageHeight(img)}`);
}
console.log(`truncated ${imageFromBytes(readBytes('examples/discord/tests/assets/photo.webp').slice(0, 40))}`);
console.log(`truncated gif ${imageFromBytes(readBytes('tests/data/images/fixture.gif').slice(0, 20))}`);
