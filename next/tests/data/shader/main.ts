// zinc:gfx runtime shaders (ZN-746): three metaballs as a fragment program where the display draws shaders on the GPU, else the same field
// computed by the program at a quarter of the resolution and drawn with ImageFlag.Smooth (the CPU path a program keeps). A box of text over
// it shows what is drawn after a SHADER lands over it. The field is a card on a slide: moved by setTransform (a carousel), clipped with
// rounded corners, and faded by a translucent layer over everything (the owner's report: on Android the shader stayed in place and appeared
// whole while its slide came in). tests/t1/shader_gl.sh compares the GPU frame with the software one.
import { onFrame, clear, rrect, drawShader, shaderProgram, shaderAvailable, imageFromPixels, updateImage, drawImageRect, ImageFlag, width, height,
  setTransform, resetTransform, clip, unclip } from 'zinc:gfx';

const BALLS: number[] = [0.3, 0.4, 0.04, 0, 0.62, 0.55, 0.05, 0, 0.45, 0.75, 0.03, 0];   // x, y (0..1 of the box), r^2, unused
const COLS: number[] = [0.9, 0.2, 0.3, 0, 0.2, 0.6, 0.9, 0, 0.95, 0.75, 0.2, 0];
const prog = shaderProgram(`
void main() {
  vec2 p = vec2(v_uv.x, v_uv.y * u_size.y / u_size.x);
  float field = 0.0; vec3 c = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    vec2 d = p - vec2(u_p[i].x, u_p[i].y * u_size.y / u_size.x);
    float f = u_p[i].z / (dot(d, d) + 0.001);
    field += f; c += u_p[3 + i].rgb * f;
  }
  c /= max(field, 0.0001);
  float k = clamp((field - 0.6) / 0.6, 0.0, 1.0);
  gl_FragColor = vec4(mix(vec3(0.08, 0.05, 0.1), c, k * k * (3.0 - 2.0 * k)), 1.0);
}`, 2);
const u: number[] = [];
for (const v of BALLS) u.push(v);
for (const v of COLS) u.push(v);

// the CPU path: the same expressions in Zinc on a grid of a quarter of the pixels
let img = -1;
function cpu(W: number, H: number): void {
  const w: i32 = Math.max(1, Math.round(W / 4)) as i32, h: i32 = Math.max(1, Math.round(H / 4)) as i32, asp = H / W;
  const px: u8[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ux = (x + 0.5) / w, uy = ((y + 0.5) / h) * asp;
    let field = 0, r = 0, g = 0, b = 0;
    for (let i = 0; i < 3; i++) {
      const dx = ux - BALLS[i * 4], dy = uy - BALLS[i * 4 + 1] * asp;
      const f = BALLS[i * 4 + 2] / (dx * dx + dy * dy + 0.001);
      field += f; r += COLS[i * 4] * f; g += COLS[i * 4 + 1] * f; b += COLS[i * 4 + 2] * f;
    }
    const m = Math.max(field, 0.0001), k0 = Math.min(1, Math.max(0, (field - 0.6) / 0.6)), k = k0 * k0 * (3 - 2 * k0);
    px.push(Math.round(255 * (0.08 + (r / m - 0.08) * k)) as u8); px.push(Math.round(255 * (0.05 + (g / m - 0.05) * k)) as u8);
    px.push(Math.round(255 * (0.1 + (b / m - 0.1) * k)) as u8); px.push(255);
  }
  if (img < 0) img = imageFromPixels(px, w, h); else updateImage(img, px);
  drawImageRect(img, 0, 0, w, h, 0, 0, W, H, 255, ImageFlag.Smooth);
}

onFrame(() => {
  const W = width(), H = height(), cw = Math.round(W * 0.8), ch = Math.round(H * 0.8);
  clear(0x000000);
  setTransform(1, 0, 0, 1, Math.round(W * 0.15), Math.round(H * 0.1));   // the slide, a fifth of its way in
  clip(0, 0, cw, ch, 18);
  if (shaderAvailable()) drawShader(prog, 0, 0, cw, ch, u); else cpu(cw, ch);
  rrect(cw * 0.35, ch * 0.42, cw * 0.3, ch * 0.16, 12, 0xffffff, 140);   // over the shader: drawn after it
  unclip();
  resetTransform();
  rrect(0, 0, W, H, 0, 0x000000, 90);   // the fade of the slide
});
