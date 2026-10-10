// The canvas element of the web environment bound to the WebGL module (ZN-568): run with ZINC_WEB=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1
// ZINC_FRAMES=3; the output is canvas.out and the window's frame 2 is canvas-2.png (exact rectangles: no edge a GPU could round differently).
const log = (...a) => console.log(a.map(String).join(' '));
const canvas = document.createElement('canvas');
canvas.width = 320; canvas.setAttribute('height', '240');
document.body.appendChild(canvas);
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
log('context', gl instanceof WebGL2RenderingContext, gl.canvas === canvas, canvas.getContext('webgl2') === gl, canvas.getContext('webgl'), canvas.getContext('2d'), canvas instanceof HTMLCanvasElement, canvas.tagName,
  gl.drawingBufferWidth, gl.drawingBufferHeight, canvas.width, canvas.height, canvas.clientWidth, canvas.getBoundingClientRect().height);
const one = document.createElement('canvas').getContext('webgl');
log('webgl 1', one instanceof WebGLRenderingContext, one.canvas.width, one.canvas.height, one.canvas.isConnected);

function at(x, y) { const p = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); return p.join(','); }
function program(vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); gl.attachShader(p, s); }
  gl.linkProgram(p);
  return p;
}
// a triangle over the middle of the canvas, a texture from an ImageData (the pixels a DOM source gives the binding)
gl.clearColor(0, 0, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT);
const p = program('#version 300 es\nin vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }', '#version 300 es\nprecision mediump float; uniform sampler2D t; out vec4 o; void main() { o = texture(t, vec2(0.25, 0.25)); }');
gl.useProgram(p);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.8, -0.8, 0.8, -0.8, 0, 0.8]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, new ImageData(new Uint8ClampedArray([255, 128, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]), 2, 2));
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.drawArrays(gl.TRIANGLES, 0, 3);
log('drawn', 'error', gl.getError(), 'inside', at(160, 100), 'outside', at(5, 235));

// the canvas resized by its attributes: the drawing buffer follows
canvas.width = 64; canvas.height = 48;
log('resized', gl.drawingBufferWidth, gl.drawingBufferHeight, canvas.offsetWidth);
canvas.width = 320; canvas.height = 240;

// a lost context is the canvas's event, with a default a listener can prevent
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); log('lost', e.type, e.target === canvas, gl.isContextLost()); });
canvas.addEventListener('webglcontextrestored', e => log('restored', e.type, gl.isContextLost()));
const lose = gl.getExtension('WEBGL_lose_context');
lose.loseContext();
await new Promise(r => setTimeout(r, 0));
lose.restoreContext();
await new Promise(r => setTimeout(r, 0));

// what the window shows from the second frame on: green, a red rectangle in the middle
let frames = 0;
requestAnimationFrame(function draw() {
  gl.viewport(0, 0, 320, 240);
  gl.disable(gl.SCISSOR_TEST); gl.clearColor(0, 0.5, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.SCISSOR_TEST); gl.scissor(80, 60, 160, 120); gl.clearColor(1, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  if (++frames === 2) log('frame', frames, 'middle', at(160, 120), 'corner', at(2, 2));
  requestAnimationFrame(draw);
});
