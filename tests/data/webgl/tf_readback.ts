import { createContext, Uint8Array, Float32Array } from 'zinc:gl';
const gl = createContext(4,4,2)!;
let failures: i32 = 0;
function check(name: string, ok: boolean): void { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) failures++; }
function setup(name: string): void { const e = gl.getError(); if (e !== 0) throw new Error('setup ' + name + ': ' + e); }
function read(name: string, target: u32, invalid: boolean): void {
  const dst = new Uint8Array([73,74,75,76]);
  gl.getBufferSubData(target,0,dst); const e = gl.getError();
  check(name + ' bytes (' + e + ')', e === (invalid ? gl.INVALID_OPERATION : 0) && dst.data.join(',') === (invalid ? '73,74,75,76' : '1,2,3,4'));
  if (invalid) { const exact = new Float32Array([0.1,0.2]); gl.getBufferSubData(target,0,exact); const fe = gl.getError(); check(name + ' exact numeric slots',fe === gl.INVALID_OPERATION && exact.data[0] === 0.1 && exact.data[1] === 0.2); }
}
const output = gl.createBuffer(); const source = gl.createBuffer();
const a = gl.createTransformFeedback(); const b = gl.createTransformFeedback();
const vs = gl.createShader(gl.VERTEX_SHADER); const fs = gl.createShader(gl.FRAGMENT_SHADER); const p = gl.createProgram();
try {
  gl.bindBuffer(gl.COPY_READ_BUFFER,output); gl.bufferData(gl.COPY_READ_BUFFER,new Uint8Array([1,2,3,4,5,6,7,8]),gl.STATIC_DRAW);
  gl.bindBuffer(gl.COPY_READ_BUFFER,source); gl.bufferData(gl.COPY_READ_BUFFER,new Uint8Array([1,2,3,4,5,6,7,8]),gl.STATIC_DRAW); setup('upload');
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,a); gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,output); setup('indexed A');
  check('A indexed binding', gl.getIndexedParameter(gl.TRANSFORM_FEEDBACK_BUFFER_BINDING,0).object === output.id); setup('indexed query');
  for (const target of [gl.COPY_READ_BUFFER,gl.COPY_WRITE_BUFFER,gl.ARRAY_BUFFER,gl.UNIFORM_BUFFER,gl.PIXEL_PACK_BUFFER,gl.PIXEL_UNPACK_BUFFER]) {
    gl.bindBuffer(target,output); setup('alias bind'); read('inactive current alias ' + target,target,true); gl.bindBuffer(target,null); setup('alias unbind');
  }
  read('inactive generic indexed exception',gl.TRANSFORM_FEEDBACK_BUFFER,false);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,b); gl.bindBuffer(gl.COPY_READ_BUFFER,output); setup('other inactive'); read('indexed only on other inactive object',gl.COPY_READ_BUFFER,false);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,a); gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null); setup('unbind indexed'); read('unbound current slot',gl.COPY_READ_BUFFER,false);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,output); gl.bindBuffer(gl.COPY_READ_BUFFER,source); setup('distinct'); read('ordinary unrelated',gl.COPY_READ_BUFFER,false);
  gl.bindBuffer(0x1234,source); const prior = new Uint8Array([71,72]); gl.getBufferSubData(gl.COPY_READ_BUFFER,0,prior);
  check('older application error and successful read',prior.data.join(',') === '1,2' && gl.getError() === gl.INVALID_ENUM && gl.getError() === 0);
  gl.shaderSource(vs,'#version 300 es\nout float captured;\nvoid main(){captured=2.0;gl_Position=vec4(0.0,0.0,0.0,1.0);}');
  gl.shaderSource(fs,'#version 300 es\nprecision mediump float;\nout vec4 color;\nvoid main(){color=vec4(1.0);}');
  gl.compileShader(vs); gl.compileShader(fs); setup('compile');
  check('vertex compiled',gl.getShaderParameter(vs,gl.COMPILE_STATUS).bool); check('fragment compiled',gl.getShaderParameter(fs,gl.COMPILE_STATUS).bool);
  gl.attachShader(p,vs); gl.attachShader(p,fs); gl.transformFeedbackVaryings(p,['captured'],gl.INTERLEAVED_ATTRIBS); gl.linkProgram(p); setup('link'); check('program linked',gl.getProgramParameter(p,gl.LINK_STATUS).bool);
  gl.useProgram(p); gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER,source); setup('generic distinct source');
  gl.beginTransformFeedback(gl.POINTS); setup('begin A'); check('A active',gl.getParameter(gl.TRANSFORM_FEEDBACK_ACTIVE).bool && !gl.getParameter(gl.TRANSFORM_FEEDBACK_PAUSED).bool); setup('query active A');
  read('active current generic distinct',gl.TRANSFORM_FEEDBACK_BUFFER,true);
  gl.pauseTransformFeedback(); setup('pause A'); check('A paused active',gl.getParameter(gl.TRANSFORM_FEEDBACK_ACTIVE).bool && gl.getParameter(gl.TRANSFORM_FEEDBACK_PAUSED).bool); setup('query paused A');
  read('paused current generic distinct',gl.TRANSFORM_FEEDBACK_BUFFER,true);
  gl.bindBuffer(gl.COPY_READ_BUFFER,output); setup('paused alias bind'); read('paused current indexed alias',gl.COPY_READ_BUFFER,true); gl.bindBuffer(gl.COPY_READ_BUFFER,null);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,b); setup('paused A switch B'); check('B inactive',!gl.getParameter(gl.TRANSFORM_FEEDBACK_ACTIVE).bool && !gl.getParameter(gl.TRANSFORM_FEEDBACK_PAUSED).bool); setup('query B');
  read('paused other A current B generic',gl.TRANSFORM_FEEDBACK_BUFFER,true);
  gl.bindBuffer(gl.COPY_READ_BUFFER,output); setup('other paused alias'); read('indexed only on other paused object',gl.COPY_READ_BUFFER,false); gl.bindBuffer(gl.COPY_READ_BUFFER,null);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,null); setup('paused A switch default'); read('paused other A current default generic',gl.TRANSFORM_FEEDBACK_BUFFER,true);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,a); setup('rebind A'); gl.endTransformFeedback(); setup('end A'); check('A ended',!gl.getParameter(gl.TRANSFORM_FEEDBACK_ACTIVE).bool && !gl.getParameter(gl.TRANSFORM_FEEDBACK_PAUSED).bool); setup('query end A');
  read('ended A generic distinct',gl.TRANSFORM_FEEDBACK_BUFFER,false);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,null); gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,output); gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER,source); setup('default indexed and distinct generic');
  gl.beginTransformFeedback(gl.POINTS); setup('begin default'); check('default active query',gl.getParameter(gl.TRANSFORM_FEEDBACK_ACTIVE).bool); setup('query default active');
  read('default active generic distinct',gl.TRANSFORM_FEEDBACK_BUFFER,true);
  gl.endTransformFeedback(); setup('end default'); check('default ended query',!gl.getParameter(gl.TRANSFORM_FEEDBACK_ACTIVE).bool); setup('query default ended'); read('default ended generic distinct',gl.TRANSFORM_FEEDBACK_BUFFER,false);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null); gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,a); gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null); gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,null); setup('cleanup bindings');
} finally { gl.deleteTransformFeedback(a); gl.deleteTransformFeedback(b); gl.deleteBuffer(output); gl.deleteBuffer(source); gl.deleteProgram(p); gl.deleteShader(vs); gl.deleteShader(fs); gl.destroy(); }
if (failures) throw new Error('TF readback failures: ' + failures);
console.log('TF readback typed: ok');
