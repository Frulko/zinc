// ZN-576: antialias, WebGL's default: the canvas is multisampled (SAMPLES 4) and reads, copies and the present see it resolved: a triangle's
// slanted edge has blended pixels, none without antialias; copyTexImage2D of the canvas copies the resolved pixels; a blit into it is
// INVALID_OPERATION as in WebGL 2 (a multisampled draw framebuffer).
function scene(kind, attrs) {
  const canvas = document.createElement('canvas');
  canvas.width = 32; canvas.height = 32;
  const gl = canvas.getContext(kind, attrs);
  const shader = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
  const p = gl.createProgram();
  gl.attachShader(p, shader(gl.VERTEX_SHADER, 'attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }'));
  gl.attachShader(p, shader(gl.FRAGMENT_SHADER, 'precision mediump float; void main() { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }'));
  gl.bindAttribLocation(p, 0, 'a');
  gl.linkProgram(p);
  gl.useProgram(p);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 0.7]), gl.STATIC_DRAW);   // a slanted edge from (1,-1) to (-1,0.7)
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  const px = new Uint8Array(32 * 32 * 4);
  gl.readPixels(0, 0, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let blended = 0, full = 0;
  for (let i = 0; i < 32 * 32; i++) { const r = px[i * 4]; if (r === 255) full++; else if (r > 0) blended++; }
  const a = gl.getContextAttributes();
  console.log(kind, attrs ? JSON.stringify(attrs) : 'default', 'antialias', a.antialias, 'SAMPLES', gl.getParameter(gl.SAMPLES),
    'filled', full > 300, 'blended edge', blended > 0, 'error', gl.getError());
  return gl;
}
scene('webgl', undefined);
scene('webgl', { antialias: false });
const gl = scene('webgl2', undefined);
// copyTexImage2D of the multisampled canvas: its resolved pixels, read back through a framebuffer
const tex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, tex);
gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, 32, 32, 0);
console.log('copyTexImage2D', gl.getError());
const fb = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
const one = new Uint8Array(4);
gl.readPixels(2, 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, one);
console.log('copied corner', Array.from(one).join(','));
gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb);
gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
gl.blitFramebuffer(0, 0, 32, 32, 0, 0, 32, 32, gl.COLOR_BUFFER_BIT, gl.NEAREST);
console.log('blit into the multisampled canvas', '0x' + gl.getError().toString(16));
