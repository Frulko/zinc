// The texture test (tests/t1/texture.sh, ZN-439): the two textures of assets/tex (make_texture.py writes them), an opaque one and one with a
// soft transparent edge, drawn at their size and the second one again scaled down (linear filtering of its texels), over a coloured background.
import { onFrame, clear, image, drawImage, imageWidth, imageHeight } from 'zinc:gfx';

const opaque = image('tex/opaque.png'), alpha = image('tex/alpha.png');
console.log(`opaque ${imageWidth(opaque)}x${imageHeight(opaque)}, alpha ${imageWidth(alpha)}x${imageHeight(alpha)}`);
onFrame((dt: number) => {
  clear(0x305070);
  drawImage(opaque, 0, 0, 128, 128, 255, 0);
  drawImage(alpha, 128, 0, 128, 128, 255, 0);
  drawImage(alpha, 264, 16, 100, 100, 255, 0);
});
