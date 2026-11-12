// Real WebGL2 buffer reads: byte views, element slices, and no writes on failure.
const canvas = document.createElement('canvas'); canvas.width = canvas.height = 4;
const gl = canvas.getContext('webgl2');
if (!gl) throw new Error('no WebGL2 context');
let failures = 0;
function check(name, ok) { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) failures++; }
function bytes(a) { return Array.from(a).join(','); }
const b = gl.createBuffer();
try {
  gl.bindBuffer(gl.COPY_READ_BUFFER, b);
  gl.bufferData(gl.COPY_READ_BUFFER, new Uint8Array([1,2,3,4,5,6,7,8]), gl.STATIC_DRAW);
  check('upload', gl.getError() === gl.NO_ERROR);
  for (const mode of ['explicit', 'omitted', 'zero']) {
    const backing = new Uint8Array(10); backing.fill(91);
    const view = new DataView(backing.buffer, 2, 6);
    let threw = false;
    try {
      if (mode === 'explicit') gl.getBufferSubData(gl.COPY_READ_BUFFER, 1, view, 2, 3);
      else if (mode === 'omitted') gl.getBufferSubData(gl.COPY_READ_BUFFER, 1, view, 2);
      else gl.getBufferSubData(gl.COPY_READ_BUFFER, 1, view, 2, 0);
    } catch (e) { threw = true; console.log(String(e)); }
    check('DataView ' + mode, !threw && bytes(backing) === (mode === 'explicit' ? '91,91,91,91,2,3,4,91,91,91' : '91,91,91,91,2,3,4,5,91,91') && gl.getError() === gl.NO_ERROR);
  }
  const u16 = new Uint16Array([99,99,99,99]);
  gl.getBufferSubData(gl.COPY_READ_BUFFER, 2, u16, 1, 2);
  const expected = new Uint16Array(new Uint8Array([3,4,5,6]).buffer);
  check('typed element units', u16[0] === 99 && u16[1] === expected[0] && u16[2] === expected[1] && u16[3] === 99 && gl.getError() === gl.NO_ERROR);
  for (const invalid of [new ArrayBuffer(4), null]) {
    let threw = false; try { gl.getBufferSubData(gl.COPY_READ_BUFFER, 0, invalid); } catch (e) { threw = e instanceof TypeError; }
    check('view required', threw && gl.getError() === gl.NO_ERROR);
  }
  const end = new Uint8Array([81,82]);
  gl.getBufferSubData(gl.COPY_READ_BUFFER, 8, end, 2, 0);
  check('end empty', bytes(end) === '81,82' && gl.getError() === gl.NO_ERROR);
  gl.getBufferSubData(gl.COPY_READ_BUFFER, 8, new Uint8Array(0));
  check('empty view', gl.getError() === gl.NO_ERROR);
  for (const entry of [['negative',-1,gl.INVALID_VALUE],['overrun',7,gl.INVALID_OPERATION],['past end',9,gl.INVALID_OPERATION],['huge source',Number.MAX_SAFE_INTEGER,gl.INVALID_OPERATION]]) {
    const dst = new Uint8Array([73,74]); gl.getBufferSubData(gl.COPY_READ_BUFFER, entry[1], dst);
    const error = gl.getError(); check(entry[0] + ' error/no write (' + error + ')', error === entry[2] && bytes(dst) === '73,74');
  }
  for (const entry of [['negative destination',-1,1],['long destination',1,2],['negative length',0,-1]]) {
    const dst = new Uint8Array([71,72]); gl.getBufferSubData(gl.COPY_READ_BUFFER,0,dst,entry[1],entry[2]);
    check(entry[0], gl.getError() === gl.INVALID_VALUE && bytes(dst) === '71,72');
  }
  const dst = new Uint8Array([67,68]);
  gl.getBufferSubData(0x1234,0,dst); check('invalid target', gl.getError() === gl.INVALID_ENUM && bytes(dst) === '67,68');
  gl.bindBuffer(gl.COPY_READ_BUFFER,null); gl.getBufferSubData(gl.COPY_READ_BUFFER,0,dst);
  check('missing binding', gl.getError() === gl.INVALID_OPERATION && bytes(dst) === '67,68');
  gl.bindBuffer(gl.COPY_READ_BUFFER,b); gl.bindBuffer(0x1234,b);
  gl.getBufferSubData(gl.COPY_READ_BUFFER,0,dst);
  check('pending error preserves successful copy', bytes(dst) === '1,2' && gl.getError() === gl.INVALID_ENUM && gl.getError() === gl.NO_ERROR);
} finally { gl.deleteBuffer(b); gl.getExtension('WEBGL_lose_context').loseContext(); }
if (failures) throw new Error('buffer readback JS failures: ' + failures);
console.log('buffer readback JS: ok');
