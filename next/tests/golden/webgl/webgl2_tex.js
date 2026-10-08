// ZN-203.07: WebGL 2.0 textures (sized formats, 3D, arrays, storage), samplers, queries, sync, transform feedback, blit and clearBuffer.
const canvas = document.createElement('canvas');
canvas.width = 32; canvas.height = 32;
const gl = canvas.getContext('webgl2');
const px = (x, y) => { const p = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); return Array.from(p).join(','); };
const err = (name) => { const e = gl.getError(); console.log(name, e === 0 ? 'ok' : '0x' + e.toString(16)); };

// sized formats: R8 in, RGBA8 sampled; texImage2D with a float internal format and the table's refusals
gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
const tex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, tex);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 2, 2, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([10, 20, 30, 40])); err('R8');
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, new Float32Array([1, 0, 0, 1])); err('RGBA32F');
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.FLOAT, null); err('RGBA8 with FLOAT (INVALID_OPERATION 0x502)');
gl.texImage2D(gl.TEXTURE_2D, 0, 0x1234, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); err('bad internal format (INVALID_ENUM 0x500)');

// immutable storage
const st = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, st);
gl.texStorage2D(gl.TEXTURE_2D, 3, gl.RGBA8, 8, 8); err('texStorage2D');
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 8, 8, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); err('texImage2D on immutable (0x502)');
gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([1, 2, 3, 4])); err('texSubImage2D on immutable');
gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, 4, 4); err('texStorage2D twice (0x502)');

// 3D and array textures
const t3 = gl.createTexture();
gl.bindTexture(gl.TEXTURE_3D, t3);
gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, 2, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(32)); err('texImage3D');
gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 1, 2, 2, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(16)); err('texSubImage3D');
gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE); err('WRAP_R');
const ta = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D_ARRAY, ta);
gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, 4, 4, 3); err('texStorage3D array');
gl.generateMipmap(gl.TEXTURE_2D_ARRAY); err('generateMipmap array');
gl.bindTexture(gl.TEXTURE_2D, ta); err('an array texture bound to TEXTURE_2D (0x502)');

// a render target: layer of the array, cleared with clearBufferfv, blitted to the canvas
const fb = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, ta, 0, 1); err('framebufferTextureLayer');
console.log('status', gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE);
gl.clearBufferfv(gl.COLOR, 0, new Float32Array([0, 1, 0, 1])); err('clearBufferfv');
gl.clearBufferfv(gl.COLOR, 7, new Float32Array([0, 1, 0, 1])); err('clearBufferfv(drawbuffer 7) (0x501)');
const rb = gl.createRenderbuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, null);
gl.clearColor(0, 0, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT);
gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb);
gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
gl.blitFramebuffer(0, 0, 4, 4, 0, 0, 32, 32, gl.COLOR_BUFFER_BIT, gl.NEAREST); err('blitFramebuffer');
gl.bindFramebuffer(gl.FRAMEBUFFER, null);
console.log('blitted pixel', px(16, 16));
gl.blitFramebuffer(0, 0, 4, 4, 0, 0, 32, 32, gl.DEPTH_BUFFER_BIT, gl.LINEAR); err('blit depth with LINEAR (0x502)');

// samplers
const smp = gl.createSampler();
gl.bindSampler(0, smp);
gl.samplerParameteri(smp, gl.TEXTURE_MIN_FILTER, gl.NEAREST); err('samplerParameteri');
console.log('sampler param', gl.getSamplerParameter(smp, gl.TEXTURE_MIN_FILTER) === gl.NEAREST, gl.isSampler(smp));
gl.samplerParameteri(smp, gl.TEXTURE_WRAP_S, 0x1234); err('sampler bad wrap (0x500)');
gl.bindSampler(99, smp); err('bindSampler(99) (0x501)');

// queries
const q = gl.createQuery();
gl.beginQuery(gl.ANY_SAMPLES_PASSED, q); err('beginQuery');
console.log('current query', gl.getQuery(gl.ANY_SAMPLES_PASSED, gl.CURRENT_QUERY) === q);
gl.endQuery(gl.ANY_SAMPLES_PASSED); err('endQuery');
gl.endQuery(gl.ANY_SAMPLES_PASSED); err('endQuery with none active (0x502)');
console.log('result', gl.getQueryParameter(q, gl.QUERY_RESULT), gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE));

// sync
const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
gl.flush();
const status = gl.clientWaitSync(sync, gl.SYNC_FLUSH_COMMANDS_BIT, 0);
console.log('sync', gl.isSync(sync), status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED || status === gl.TIMEOUT_EXPIRED, gl.getSyncParameter(sync, gl.OBJECT_TYPE) === gl.SYNC_FENCE);
gl.deleteSync(sync); console.log('sync deleted', gl.isSync(sync));

// transform feedback: a vertex shader writing its position-derived value into a buffer
function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
const prog = gl.createProgram();
gl.attachShader(prog, sh(gl.VERTEX_SHADER, '#version 300 es\nin float x; out float y; void main() { y = x * 2.0; gl_Position = vec4(0.0); }'));
gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, '#version 300 es\nprecision mediump float; out vec4 o; void main() { o = vec4(1.0); }'));
gl.transformFeedbackVaryings(prog, ['y'], gl.INTERLEAVED_ATTRIBS);
gl.linkProgram(prog);
console.log('linked', gl.getProgramParameter(prog, gl.LINK_STATUS), JSON.stringify(gl.getTransformFeedbackVarying(prog, 0)));
gl.useProgram(prog);
const vb = gl.createBuffer(), out = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vb);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 2, 3]), gl.STATIC_DRAW);
const loc = gl.getAttribLocation(prog, 'x');
const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
gl.bindBuffer(gl.ARRAY_BUFFER, vb);
gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 1, gl.FLOAT, false, 0, 0);
gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, out);
gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, 12, gl.STATIC_READ);
gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, out);
const tf = gl.createTransformFeedback();
gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf);
gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, out);
gl.enable(gl.RASTERIZER_DISCARD);
gl.beginTransformFeedback(gl.POINTS);
gl.drawArrays(gl.POINTS, 0, 3);
gl.endTransformFeedback();
gl.disable(gl.RASTERIZER_DISCARD);
err('transform feedback');
const got = new Float32Array(3);
gl.bindBuffer(gl.COPY_READ_BUFFER, out);
gl.getBufferSubData(gl.COPY_READ_BUFFER, 0, got);
console.log('captured', got[0], got[1], got[2]);
gl.endTransformFeedback(); err('endTransformFeedback with none active (0x502)');
console.log('internalformat samples', gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA8, gl.SAMPLES).length > 0);
