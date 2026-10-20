// ZN-203.03: a WebGL1 program in plain JavaScript on the QuickJS engine: a triangle covering the canvas, the pixels read back, the spec errors visible through getError.
const canvas = document.createElement('canvas');
canvas.width = 64; canvas.height = 64;
const gl = canvas.getContext('webgl');
if (!gl) throw new Error('no WebGL context');

function shader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
const vs = shader(gl.VERTEX_SHADER, 'attribute vec2 pos; attribute vec4 col; varying vec4 v; uniform mat4 m; void main() { v = col; gl_Position = m * vec4(pos, 0.0, 1.0); }');
const fs = shader(gl.FRAGMENT_SHADER, 'precision mediump float; varying vec4 v; void main() { gl_FragColor = v; }');
const prog = gl.createProgram();
gl.attachShader(prog, vs); gl.attachShader(prog, fs);
gl.bindAttribLocation(prog, 0, 'pos'); gl.bindAttribLocation(prog, 1, 'col');
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
gl.useProgram(prog);

const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, 0, 0, 1, 3, -1, 1, 0, 0, 1, -1, 3, 1, 0, 0, 1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 24, 8);
gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'm'), false, new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
gl.clearColor(0, 0, 1, 1);
gl.clear(gl.COLOR_BUFFER_BIT);
gl.drawArrays(gl.TRIANGLES, 0, 3);

const px = new Uint8Array(4);
gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
console.log('pixel', px[0], px[1], px[2], px[3]);
console.log('error', gl.getError());
gl.bindBuffer(0x1234, buf);
console.log('bad target', gl.getError() === gl.INVALID_ENUM, gl.getError());
gl.drawArrays(gl.TRIANGLES, 0, 1000);
console.log('draw out of range', gl.getError() === gl.INVALID_OPERATION);
console.log('types', typeof gl.createBuffer(), gl.drawingBufferWidth, gl.canvas === canvas, typeof gl.getExtension('OES_texture_float'));
