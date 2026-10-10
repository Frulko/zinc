// The per-call cost of zinc:gl (ZN-562.03): getError (the binding alone), uniform4f, uniformMatrix4fv and a 3-index drawElements, N calls each,
// interpreted (zinc run --interp) or built (zinc build). bench/gl_calls.js is the same through QuickJS's WebGL binding.
import { createContext, Float32Array, Uint16Array } from 'zinc:gl';

const N = 200000;
const gl = createContext(64, 64);
if (gl === null) console.log('no WebGL');
else {
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, 'attribute vec2 p; uniform mat4 m; void main() { gl_Position = m * vec4(p, 0.0, 1.0); }');
  gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, 'precision mediump float; uniform vec4 c; void main() { gl_FragColor = c; }');
  gl.compileShader(fs);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1]), gl.STATIC_DRAW);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2]), gl.STATIC_DRAW);
  const at = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(at as u32);
  gl.vertexAttribPointer(at as u32, 2, gl.FLOAT, false, 0, 0);
  const c = gl.getUniformLocation(prog, 'c'), m = gl.getUniformLocation(prog, 'm');
  const mat: number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  let t = performance.now();
  for (let i = 0; i < N; i++) gl.getError();
  const e = (performance.now() - t) * 1e6 / N;
  t = performance.now();
  for (let i = 0; i < N; i++) gl.uniform4f(c, 1, 0.5, 0.25, 1);
  const u4 = (performance.now() - t) * 1e6 / N;
  t = performance.now();
  for (let i = 0; i < N; i++) gl.uniformMatrix4fv(m, false, mat);
  const um = (performance.now() - t) * 1e6 / N;
  t = performance.now();
  for (let i = 0; i < N; i++) gl.drawElements(gl.TRIANGLES, 3, gl.UNSIGNED_SHORT, 0);
  gl.getError();
  const de = (performance.now() - t) * 1e6 / N;
  console.log('ns per call: getError ' + e.toFixed(0) + ', uniform4f ' + u4.toFixed(0) + ', uniformMatrix4fv ' + um.toFixed(0) + ', drawElements ' + de.toFixed(0));
}
