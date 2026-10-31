// imageFromBytes on a WebP (the media proxy of Discord's CDN sends WebP): the file of tests/data/imageio, lossy with an ICC profile and lossless.
import { imageFromBytes, imageWidth, imageHeight } from 'zinc:gfx';
import { readBytes } from 'zinc:fs';
for (const f of ['tests/data/imageio/photo.webp', 'examples/discord/tests/assets/photo.webp']) {
  const img = imageFromBytes(readBytes(f));
  console.log(`${f.split('/').pop()} ${img >= 0} ${imageWidth(img)}x${imageHeight(img)}`);
}
console.log(`truncated ${imageFromBytes(readBytes('examples/discord/tests/assets/photo.webp').slice(0, 40))}`);
