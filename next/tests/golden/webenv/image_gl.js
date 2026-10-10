// Images as WebGL texture sources (ZN-569): an image element handed to texImage2D / texSubImage2D gives the picture's own pixels, with
// UNPACK_FLIP_Y_WEBGL and UNPACK_PREMULTIPLY_ALPHA_WEBGL honoured.
// Run with ZINC_WEB=1 by tests/t1/webenv_image.sh; the output is image_gl.out and the window's frame 2 is image_gl-2.png.
// The pictures: tests/data/images/fixture.* (32 x 24, twelve flat colours in 8 x 8 blocks, the same picture in each format) and a lossless
// WebP with the PNG it was encoded from (tests/golden/webp, tests/golden/shaped).
const log = (...a) => console.log(a.map(String).join(' '));
const COLOURS = [[220, 30, 30], [30, 160, 60], [30, 60, 200], [240, 220, 40], [255, 255, 255], [0, 0, 0], [120, 120, 120], [200, 100, 20], [90, 20, 140], [20, 180, 190], [250, 150, 180], [60, 60, 20]];
const image = src => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('no picture: ' + src)); img.src = src; });

// a canvas of the document, 4 pixels a texel: what the window shows is the picture the right way up
const canvas = document.createElement('canvas');
canvas.width = 128; canvas.height = 96;
document.body.appendChild(canvas);
const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
const prog = gl.createProgram();
gl.attachShader(prog, shader(gl.VERTEX_SHADER, 'attribute vec2 a; varying vec2 uv; void main() { uv = a * 0.5 + 0.5; gl_Position = vec4(a, 0.0, 1.0); }'));
gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, 'precision mediump float; varying vec2 uv; uniform sampler2D s; void main() { gl_FragColor = texture2D(s, uv); }'));
gl.bindAttribLocation(prog, 0, 'a'); gl.linkProgram(prog); gl.useProgram(prog);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
function texture() {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  return t;
}
const unpack = (flipY, premultiply) => { gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply); };
const upload = source => gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
const draw = () => gl.drawArrays(gl.TRIANGLES, 0, 3);
const at = (x, y) => { const p = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); return [...p]; };
// the picture's block (column, row from the top) as the canvas shows it once uploaded the right way up
const block = (col, row) => at(col * 32 + 16, 95 - (row * 32 + 16));
const worst = () => { let d = 0; for (let i = 0; i < 12; i++) { const p = block(i % 4, i >> 2); for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(p[k] - COLOURS[i][k])); d = Math.max(d, 255 - p[3]); } return d; };

// 1. each format, uploaded with UNPACK_FLIP_Y_WEBGL: the twelve blocks against the picture's colours (a JPEG is near, the others exact)
texture();
unpack(true, false);
for (const format of ['png', 'gif', 'bmp', 'jpg']) {
  upload(await image('../../data/images/fixture.' + format)); draw();
  log(format, 'top-left', block(0, 0).join(','), 'bottom-right', block(3, 2).join(','), 'largest difference over the 12 blocks', worst(), 'error', gl.getError());
}
// 2. without the flip the first row of the picture is the texture's row 0: the bottom of the quad
const png = await image('../../data/images/fixture.png');
unpack(false, false); upload(png); draw();
log('not flipped: the canvas top-left is the picture\'s bottom-left', block(0, 0).join(','), 'and its bottom-left the picture\'s top-left', block(0, 2).join(','));
// 3. texSubImage2D: the picture into the middle of a larger black texture (64 x 48: the canvas shows 2 pixels a texel)
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 64, 48, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(64 * 48 * 4));
unpack(true, false); gl.texSubImage2D(gl.TEXTURE_2D, 0, 16, 12, gl.RGBA, gl.UNSIGNED_BYTE, png); draw();
log('texSubImage2D at 16,12: outside', at(8, 8).join(','), 'the picture\'s top-left block', at(32 + 8, 95 - (24 + 8)).join(','), 'its bottom-right block', at(32 + 56, 95 - (24 + 40)).join(','), 'error', gl.getError());
// 4. alpha: a 2 x 1 PNG whose first pixel is 255,0,0 at alpha 128, as it is and premultiplied by the unpack parameter
const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR42mP4z8DQwMDw/z8ADX4DfpfxiD8AAAAASUVORK5CYII=';
const half = await image(tiny);
unpack(false, false); upload(half); draw(); const straight = at(16, 48);
unpack(false, true); upload(half); draw();
log('alpha 128: as it is', straight.join(','), 'UNPACK_PREMULTIPLY_ALPHA_WEBGL', at(16, 48).join(','), 'the opaque pixel beside it', at(112, 48).join(','));
// 5. an image that has no pixels yet is INVALID_VALUE and uploads nothing
const pending = new Image(); pending.src = '../../data/images/fixture.gif';
upload(pending);
log('an image still loading:', gl.getError() === gl.INVALID_VALUE ? 'INVALID_VALUE' : 'no error', 'complete', pending.complete);
// 6. a lossless WebP against the PNG it was encoded from, pixel for pixel through a 400 x 260 framebuffer
const [webp, reference] = [await image('../../golden/webp/assets/frame.webp'), await image('../../golden/shaped/gfx.png')];
const target = texture();
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 400, 260, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
const fbo = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
gl.viewport(0, 0, 400, 260);
const shown = source => { texture(); unpack(true, false); upload(source); draw(); const p = new Uint8Array(400 * 260 * 4); gl.readPixels(0, 0, 400, 260, gl.RGBA, gl.UNSIGNED_BYTE, p); return p; };
const a = shown(webp), b = shown(reference);
let differing = 0, colours = new Set();
for (let i = 0; i < a.length; i += 4) { if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) differing++; colours.add(a[i] << 16 | a[i + 1] << 8 | a[i + 2]); }
log('webp', webp.naturalWidth + 'x' + webp.naturalHeight, 'against its png', reference.naturalWidth + 'x' + reference.naturalHeight + ':', differing, 'pixels differ of', a.length / 4, 'in', colours.size > 50 ? 'more than 50' : colours.size, 'colours, error', gl.getError());
// what the window shows from now on: the PNG, the right way up
gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, 128, 96);
texture(); unpack(true, false); upload(png); draw();
