// ZN-565: a GLSL ES 1.00 shader may `#define in attribute` and `#define out varying` and then declare with them (every PixiJS 8 shader has this
// header, so one source serves WebGL 1 and 2): what counts is the text after the preprocessor. A real global `in` is still refused.
const VS = '#ifdef GL_ES\n#define in attribute\n#define out varying\n#endif\nin vec2 aPosition;\nout vec2 vUV;\nvoid main() { vUV = aPosition * 0.5 + 0.5; gl_Position = vec4(aPosition, 0.0, 1.0); }';
const FS = '#ifdef GL_ES\n#define in varying\n#define finalColor gl_FragColor\n#define texture texture2D\n#endif\nprecision mediump float;\nin vec2 vUV;\nuniform sampler2D uTexture;\nvoid main() { finalColor = texture(uTexture, vUV); }';
for (const kind of ['webgl', 'webgl2']) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 8;
  const gl = canvas.getContext(kind);
  const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const vs = shader(gl.VERTEX_SHADER, VS), fs = shader(gl.FRAGMENT_SHADER, FS);
  console.log(kind, 'compiled', gl.getShaderParameter(vs, gl.COMPILE_STATUS), gl.getShaderParameter(fs, gl.COMPILE_STATUS), JSON.stringify(gl.getShaderInfoLog(vs) + gl.getShaderInfoLog(fs)));
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.bindAttribLocation(prog, 0, 'aPosition'); gl.linkProgram(prog);
  console.log(kind, 'linked', gl.getProgramParameter(prog, gl.LINK_STATUS), gl.getActiveAttrib(prog, 0).name, gl.getActiveUniform(prog, 0).name);
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 255, 0, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  const p = new Uint8Array(4); gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
  console.log(kind, 'drawn', p.join(','), gl.getError());
  const bad = shader(gl.VERTEX_SHADER, 'in vec2 aPosition;\nvoid main() { gl_Position = vec4(aPosition, 0.0, 1.0); }');
  console.log(kind, 'a global `in` with no macro compiles', gl.getShaderParameter(bad, gl.COMPILE_STATUS));
}
