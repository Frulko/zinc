// ZN-565: `texture` is not a word of GLSL ES 1.00, so a shader may give the name to a variable (Phaser 3's batch shader: `vec4 texture;`), to a
// uniform or to a function of its own, and still call texture2D. The same for the words desktop GLSL keeps for itself (`filter`, `sample`,
// `active`): a uniform or an attribute of that name is found and listed under the name the page wrote.
const VS = 'attribute vec2 active;\nvarying vec2 uv;\nvoid main() { uv = active * 0.5 + 0.5; gl_Position = vec4(active, 0.0, 1.0); }';
const cases = [
  ['a local variable', 'uniform sampler2D s;\nvoid main() { vec4 texture; texture = texture2D(s, uv); gl_FragColor = texture; }', 's'],
  ['a uniform', 'uniform sampler2D texture;\nvoid main() { gl_FragColor = texture2D(texture, uv); }', 'texture'],
  ['a function of the same signature', 'uniform sampler2D s;\nvec4 texture(sampler2D t, vec2 c) { return texture2D(t, c); }\nvoid main() { gl_FragColor = texture(s, uv); }', 's'],
  ['a cube map beside a variable named textureLod', 'uniform samplerCube s;\nvoid main() { vec3 textureLod = vec3(uv, 1.0); gl_FragColor = textureCube(s, textureLod); }', 's'],
  ['uniforms named filter and sample', 'uniform sampler2D s;\nuniform float filter;\nuniform vec4 sample[2];\nvoid main() { gl_FragColor = texture2D(s, uv) * filter + sample[1]; }', 's'],
];
for (const kind of ['webgl', 'webgl2']) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 8;
  const gl = canvas.getContext(kind);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const green = new Uint8Array([0, 255, 0, 255]);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, green);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, gl.createTexture());
  for (let face = 0; face < 6; face++) gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, green);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.log(kind, 'compile error:', gl.getShaderInfoLog(s).split('\n')[0]); return s; };
  for (const [what, fs, sampler] of cases) {
    const prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, 'precision mediump float;\nvarying vec2 uv;\n' + fs));
    gl.bindAttribLocation(prog, 0, 'active'); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.log(kind, what, 'does not link:', gl.getProgramInfoLog(prog).split('\n')[0]); continue; }
    gl.useProgram(prog);
    gl.uniform1i(gl.getUniformLocation(prog, sampler), 0);
    if (gl.getUniformLocation(prog, 'filter')) { gl.uniform1f(gl.getUniformLocation(prog, 'filter'), 1); gl.uniform4f(gl.getUniformLocation(prog, 'sample[1]'), 0, 0, 1, 0); }
    gl.clearColor(1, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const p = new Uint8Array(4); gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
    const uniforms = []; for (let i = 0; i < gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS); i++) uniforms.push(gl.getActiveUniform(prog, i).name);
    console.log(kind, what + ':', p.join(','), 'uniforms', uniforms.sort().join(' '), 'attribute', gl.getActiveAttrib(prog, 0).name, gl.getAttribLocation(prog, 'active'), 'error', gl.getError());
  }
}
