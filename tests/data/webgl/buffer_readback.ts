import { createContext, Uint8Array, Float32Array } from 'zinc:gl';
let failures: i32 = 0;
function check(name: string, ok: boolean): void { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) failures++; }
const gl = createContext(4, 4, 2)!;
const b = gl.createBuffer();
try {
  gl.bindBuffer(gl.COPY_READ_BUFFER, b);
  gl.bufferData(gl.COPY_READ_BUFFER, new Uint8Array([1,2,3,4,5,6,7,8]), gl.STATIC_DRAW);
  const good = new Uint8Array([91,92,93,94]);
  gl.getBufferSubData(gl.COPY_READ_BUFFER, 2, good);
  check('byte roundtrip', good.data.join(',') === '3,4,5,6' && gl.getError() === 0);
  for (const offset of [-1,7,9]) {
    const dst = new Uint8Array([73,74]);
    gl.getBufferSubData(gl.COPY_READ_BUFFER, offset, dst);
    const error = gl.getError();
    check('source ' + offset + ' error/no write (' + error + ')', error === (offset < 0 ? gl.INVALID_VALUE : gl.INVALID_OPERATION) && dst.data.join(',') === '73,74');
  }
  const dst = new Uint8Array([67,68]);
  gl.getBufferSubData(0x1234,0,dst);
  check('invalid target no write', gl.getError() === gl.INVALID_ENUM && dst.data.join(',') === '67,68');
  gl.bindBuffer(gl.COPY_READ_BUFFER,null); gl.getBufferSubData(gl.COPY_READ_BUFFER,0,dst);
  check('missing binding no write', gl.getError() === gl.INVALID_OPERATION && dst.data.join(',') === '67,68');
  gl.bindBuffer(gl.COPY_READ_BUFFER,b); gl.bindBuffer(0x1234,b);
  gl.getBufferSubData(gl.COPY_READ_BUFFER,0,dst);
  check('pending error preserves successful copy', dst.data.join(',') === '1,2' && gl.getError() === gl.INVALID_ENUM && gl.getError() === 0);
  const empty = new Uint8Array([]); gl.getBufferSubData(gl.COPY_READ_BUFFER,8,empty);
  check('empty end', empty.data.length === 0 && gl.getError() === 0);
  gl.bufferData(gl.COPY_READ_BUFFER,new Float32Array([1.5,-2.25,3.75]),gl.STATIC_DRAW);
  const floats = new Float32Array([81,82]); gl.getBufferSubData(gl.COPY_READ_BUFFER,4,floats);
  check('float roundtrip', floats.data.join(',') === '-2.25,3.75' && gl.getError() === 0);
  const badFloats = new Float32Array([81.5,-82.25]); gl.getBufferSubData(gl.COPY_READ_BUFFER,8,badFloats);
  check('float error/no write', badFloats.data.join(',') === '81.5,-82.25' && gl.getError() === gl.INVALID_OPERATION);
} finally { gl.deleteBuffer(b); gl.destroy(); }
if (failures) throw new Error('buffer readback typed failures: ' + failures);
console.log('buffer readback typed: ok');
