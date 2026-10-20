// ZN-203.05: WebGL 2.0 in plain JavaScript: GLSL ES 3.00 shaders, a vertex array object, per-instance attributes, a uniform buffer and the new errors.
const canvas = document.createElement('canvas');
canvas.width = 64; canvas.height = 64;
const gl = canvas.getContext('webgl2');
if (!gl) throw new Error('no WebGL 2 context');
console.log('instanceof', gl instanceof WebGL2RenderingContext, gl instanceof WebGLRenderingContext, canvas.getContext('webgl') === null);
console.log('version', gl.getParameter(gl.VERSION), '|', gl.getParameter(gl.SHADING_LANGUAGE_VERSION));
console.log('constants', gl.UNIFORM_BUFFER, gl.TEXTURE_3D, gl.COLOR_ATTACHMENT3, gl.RGBA8);

function shader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
const vs = shader(gl.VERTEX_SHADER, `#version 300 es
layout(location = 0) in vec2 pos;
layout(location = 1) in vec2 offset;
uniform Tint { vec4 color; };
out vec4 v;
void main() { gl_Position = vec4(pos * vec2(0.5, 1.0) + offset, 0.0, 1.0); v = color + vec4(float(gl_InstanceID) * 0.0); }`);
const fs = shader(gl.FRAGMENT_SHADER, `#version 300 es
precision mediump float;
in vec4 v;
out vec4 o;
void main() { o = v; }`);
const prog = gl.createProgram();
gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
gl.useProgram(prog);

const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
console.log('isVertexArray', gl.isVertexArray(vao));
const quad = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quad);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
const inst = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, inst);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, 0, 0.5, 0]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(1);
gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
gl.vertexAttribDivisor(1, 1);

const block = gl.getUniformBlockIndex(prog, 'Tint');
gl.uniformBlockBinding(prog, block, 3);
const ubo = gl.createBuffer();
gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
gl.bufferData(gl.UNIFORM_BUFFER, new Float32Array([1, 0, 0, 1]), gl.STATIC_DRAW);
gl.bindBufferBase(gl.UNIFORM_BUFFER, 3, ubo);
console.log('block', block, gl.getActiveUniformBlockParameter(prog, block, gl.UNIFORM_BLOCK_DATA_SIZE), gl.getActiveUniformBlockName(prog, block));

gl.clearColor(0, 0, 1, 1);
gl.clear(gl.COLOR_BUFFER_BIT);
gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, 2);
console.log('draw error', gl.getError());
const px = new Uint8Array(4);
gl.readPixels(16, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); console.log('left', px[0], px[1], px[2], px[3]);
gl.readPixels(48, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); console.log('right', px[0], px[1], px[2], px[3]);

// the VAO keeps the attribute state: unbinding it disables them, binding it brings them back
gl.bindVertexArray(null);
console.log('vao 0 attrib enabled', gl.getVertexAttrib(0, gl.VERTEX_ATTRIB_ARRAY_ENABLED), gl.getParameter(gl.VERTEX_ARRAY_BINDING));
gl.bindVertexArray(vao);
console.log('vao attrib enabled', gl.getVertexAttrib(0, gl.VERTEX_ATTRIB_ARRAY_ENABLED), gl.getVertexAttrib(1, gl.VERTEX_ATTRIB_ARRAY_DIVISOR), gl.getParameter(gl.VERTEX_ARRAY_BINDING) === vao);

// errors of the new calls
gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, 1000000); console.log('instances beyond the buffer is no error, per-instance attrib range:', gl.getError() === gl.INVALID_OPERATION);
gl.drawBuffers([gl.COLOR_ATTACHMENT1]); console.log('drawBuffers on the canvas', gl.getError() === gl.INVALID_OPERATION);
gl.bindBufferBase(gl.ARRAY_BUFFER, 0, ubo); console.log('bindBufferBase(bad target)', gl.getError() === gl.INVALID_ENUM);
gl.uniformBlockBinding(prog, 99, 0); console.log('uniformBlockBinding(bad block)', gl.getError() === gl.INVALID_VALUE);
gl.vertexAttribDivisor(99, 1); console.log('vertexAttribDivisor(99)', gl.getError() === gl.INVALID_VALUE);
const a = gl.createBuffer(), b = gl.createBuffer();
gl.bindBuffer(gl.COPY_READ_BUFFER, a); gl.bufferData(gl.COPY_READ_BUFFER, new Float32Array([1, 2, 3, 4]), gl.STATIC_DRAW);
gl.bindBuffer(gl.COPY_WRITE_BUFFER, b); gl.bufferData(gl.COPY_WRITE_BUFFER, 16, gl.STATIC_DRAW);
gl.copyBufferSubData(gl.COPY_READ_BUFFER, gl.COPY_WRITE_BUFFER, 4, 0, 8);
const back = new Float32Array(4);
gl.getBufferSubData(gl.COPY_WRITE_BUFFER, 0, back);
console.log('copy', back[0], back[1], back[2], back[3], gl.getError());
