// `continue` inside a `switch` inside a loop (GLSL ES 3.00): macOS's OpenGL compiles such a shader and fails its link with an empty log, so the
// engine moves the `continue` out of the switch (Spline's metaball pass). A loop inside a case keeps its own `continue`, and a comment is no code.
const gl = document.createElement('canvas').getContext('webgl2');
const VS = '#version 300 es\nin vec2 p;\nvoid main() { gl_Position = vec4(p, 0., 1.); }';
const FS = `#version 300 es
precision highp float;
out vec4 color;
void main() {
  float s = 0., t = 0.;
  for (int i = 0; i < 6; i++) {
    switch (i % 3) {
      case 0: continue;   // i = 0, 3: nothing (continue in a comment)
      case 1: if (i > 0) { s += 1.; } break;
      default:
        for (int j = 0; j < 3; j++) { if (j == 1) continue; t += 1.; }
        break;
    }
    s += 10.;
  }
  color = vec4(s / 255., t / 255., 0., 1.);
}`;
function shader(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
const prog = gl.createProgram();
gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
gl.linkProgram(prog);
console.log('linked', gl.getProgramParameter(prog, gl.LINK_STATUS), JSON.stringify(gl.getProgramInfoLog(prog)));
gl.useProgram(prog);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.drawArrays(gl.TRIANGLES, 0, 3);
const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
console.log('s = 42, t = 4:', px.join(','), gl.getError());
