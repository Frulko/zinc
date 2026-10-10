// ZN-562.02: api_tour.js through zinc:gl: the same calls, the same lines (GLParam stands for the values WebGL returns as any).
import { createContext, Float32Array, Uint8Array, WebGLRenderingContext, WebGLShader } from 'zinc:gl';

function sh(gl: WebGLRenderingContext, type: u32, src: string): WebGLShader { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }

function tour(gl: WebGLRenderingContext): void {
  const vs = sh(gl, gl.VERTEX_SHADER, '#version 300 es\nin vec2 pos; uniform vec4 tint; uniform mat2 m; out vec4 v; void main() { v = tint; gl_Position = vec4(m * pos, 0.0, 1.0); }');
  const fs = sh(gl, gl.FRAGMENT_SHADER, '#version 300 es\nprecision mediump float; in vec4 v; out vec4 o; void main() { o = v; }');
  console.log('compiled', gl.getShaderParameter(vs, gl.COMPILE_STATUS).bool, gl.getShaderParameter(fs, gl.COMPILE_STATUS).bool, gl.getShaderParameter(vs, gl.SHADER_TYPE).number);
  const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
  console.log('linked', gl.getProgramParameter(p, gl.LINK_STATUS).bool, gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS).number, gl.getProgramParameter(p, gl.ATTACHED_SHADERS).number);
  const au = gl.getActiveUniform(p, 0); if (au !== null) console.log('uniform0', au.name, au.size, au.type);
  const aa = gl.getActiveAttrib(p, 0); if (aa !== null) console.log('attrib0', aa.name, aa.size, aa.type);
  console.log('attached', gl.getAttachedShaders(p).length);
  gl.useProgram(p);
  console.log('current program', gl.getParameter(gl.CURRENT_PROGRAM).object === p.id);
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao); console.log('vao', gl.isVertexArray(vao));
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  console.log('buffer size', gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE).number);
  const back = new Float32Array([0, 0, 0, 0, 0, 0]); gl.getBufferSubData(gl.ARRAY_BUFFER, 0, back); console.log('buffer data', back.data.join(','));
  const at = gl.getAttribLocation(p, 'pos') as u32; gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  console.log('attrib size', gl.getVertexAttrib(at, gl.VERTEX_ATTRIB_ARRAY_SIZE).number, gl.getVertexAttribOffset(at, gl.VERTEX_ATTRIB_ARRAY_POINTER));
  gl.uniform4f(gl.getUniformLocation(p, 'tint'), 0, 1, 0, 1);
  gl.uniformMatrix2fv(gl.getUniformLocation(p, 'm'), false, [1, 0, 0, 1]);
  console.log('tint', gl.getUniform(p, gl.getUniformLocation(p, 'tint')).numbers.join(','));
  gl.viewport(0, 0, 32, 32);
  console.log('viewport', gl.getParameter(gl.VIEWPORT).numbers.join(','));
  gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  const px = new Uint8Array([0, 0, 0, 0]); gl.readPixels(16, 16, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); console.log('pixel', px.data[0], px.data[1], px.data[2], px.data[3]);
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, 4, 4);
  console.log('immutable', gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_IMMUTABLE_FORMAT).bool);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST as i32); console.log('min filter', gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER).number);
  const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  console.log('complete', gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE);
  gl.clearBufferfv(gl.COLOR, 0, [1, 0, 0, 1]);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); console.log('cleared', px.data[0], px.data[1], px.data[2], px.data[3]);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const q = gl.createQuery(); console.log('query', gl.isQuery(q));
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); console.log('sync', gl.isSync(sync), gl.getSyncParameter(sync, gl.OBJECT_TYPE).number === gl.SYNC_FENCE);
  const pf = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT); console.log('precision', pf.rangeMin, pf.rangeMax, pf.precision);
  console.log('ext', gl.getSupportedExtensions().length > 0, gl.getExtension('EXT_color_buffer_float'));
  console.log('attrs', gl.getContextAttributes().depth, gl.getContextAttributes().stencil);
  gl.bindBuffer(0x1234, buf); console.log('error', gl.getError() === gl.INVALID_ENUM, gl.getError());
  console.log('enabled', gl.isEnabled(gl.DEPTH_TEST)); gl.enable(gl.DEPTH_TEST); console.log('enabled', gl.isEnabled(gl.DEPTH_TEST));
  console.log('block index', gl.getUniformBlockIndex(p, 'nope'));
  console.log('indices', gl.getUniformIndices(p, ['tint', 'm', 'nope']).join(','));
}

const gl = createContext(32, 32, 2);
if (gl === null) console.log('no WebGL 2'); else tour(gl);
