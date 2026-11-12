import { createContext, Uint8Array, WebGLTexture } from 'zinc:gl';
const gl = createContext(4,4,2)!;
let failures: i32 = 0;
function check(name: string, ok: boolean): void { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) failures++; }
function setup(name: string): void { const e = gl.getError(); if (e !== 0) throw new Error('setup ' + name + ': ' + e); }
function layout(row: i32, image: i32, sx: i32, sy: i32, sz: i32): void {
  gl.pixelStorei(gl.UNPACK_ALIGNMENT,4); gl.pixelStorei(gl.UNPACK_ROW_LENGTH,row); gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT,image);
  gl.pixelStorei(gl.UNPACK_SKIP_PIXELS,sx); gl.pixelStorei(gl.UNPACK_SKIP_ROWS,sy); gl.pixelStorei(gl.UNPACK_SKIP_IMAGES,sz);
}
function state(name: string, row: i32, image: i32, sx: i32, sy: i32, sz: i32): void {
  check(name + ' state',gl.getParameter(gl.UNPACK_ALIGNMENT).number === 4 && gl.getParameter(gl.UNPACK_ROW_LENGTH).number === row && gl.getParameter(gl.UNPACK_IMAGE_HEIGHT).number === image && gl.getParameter(gl.UNPACK_SKIP_PIXELS).number === sx && gl.getParameter(gl.UNPACK_SKIP_ROWS).number === sy && gl.getParameter(gl.UNPACK_SKIP_IMAGES).number === sz); setup('state');
}
const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
function pixel(name: string, target: u32, tex: WebGLTexture, layer: i32, red: i32): void {
  if (target === gl.TEXTURE_2D) gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,target,tex,0);
  else gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,tex,0,layer);
  check(name + ' framebuffer',gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE); setup('attach');
  const out = new Uint8Array([0,0,0,0]); gl.readPixels(1,1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,out);
  check(name + ' pixel',out.data[0] === red && out.data[1] === 17 && out.data[2] === 29 && out.data[3] === 255); setup('read');
}
try {
for (let mode: i32 = 0; mode < 4; mode++) {
  const three = mode >= 2; const target = mode === 2 ? gl.TEXTURE_3D : mode === 3 ? gl.TEXTURE_2D_ARRAY : gl.TEXTURE_2D;
  const internal = mode === 0 ? gl.RGBA : gl.RGBA8;
  const tex = gl.createTexture(); gl.bindTexture(target,tex); gl.texParameteri(target,gl.TEXTURE_MIN_FILTER,gl.NEAREST); gl.texParameteri(target,gl.TEXTURE_MAG_FILTER,gl.NEAREST); setup('bind');
  const bytes: number[] = []; for (let i: i32 = 0; i < 512; i += 4) { bytes.push(83); bytes.push(17); bytes.push(29); bytes.push(255); }
  const full = new Uint8Array(bytes); const before = full.data.join(',');
  for (let sub: i32 = 0; sub < 2; sub++) {
    const label = 'mode ' + mode + ' sub ' + sub;
    layout(0,0,0,0,0);
    if (three) gl.texImage3D(target,0,internal,2,2,2,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    else gl.texImage2D(target,0,internal,2,2,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    setup('null allocation');
    layout(4,4,1,1,1);
    if (three) { if (sub) gl.texSubImage3D(target,0,0,0,0,2,2,2,gl.RGBA,gl.UNSIGNED_BYTE,full); else gl.texImage3D(target,0,internal,2,2,2,0,gl.RGBA,gl.UNSIGNED_BYTE,full); }
    else { if (sub) gl.texSubImage2D(target,0,0,0,2,2,gl.RGBA,gl.UNSIGNED_BYTE,full); else gl.texImage2D(target,0,internal,2,2,0,gl.RGBA,gl.UNSIGNED_BYTE,full); }
    setup('valid full span'); pixel(label,target,tex,three ? 1 : 0,83); state(label,4,4,1,1,1);
    const exactBytes: number[] = []; const count = three ? 172 : 44; for (let i: i32 = 0; i < count; i++) exactBytes.push(bytes[i]); const exact = new Uint8Array(exactBytes);
    if (three) { if (sub) gl.texSubImage3D(target,0,0,0,0,2,2,2,gl.RGBA,gl.UNSIGNED_BYTE,exact); else gl.texImage3D(target,0,internal,2,2,2,0,gl.RGBA,gl.UNSIGNED_BYTE,exact); }
    else { if (sub) gl.texSubImage2D(target,0,0,0,2,2,gl.RGBA,gl.UNSIGNED_BYTE,exact); else gl.texImage2D(target,0,internal,2,2,0,gl.RGBA,gl.UNSIGNED_BYTE,exact); }
    check(label + ' exact last byte',gl.getError() === 0); pixel(label + ' exact',target,tex,three ? 1 : 0,83);
    
    layout(2,4,1,1,1);
    if (three) { if (sub) gl.texSubImage3D(target,0,0,0,0,2,2,2,gl.RGBA,gl.UNSIGNED_BYTE,full); else gl.texImage3D(target,0,internal,2,2,2,0,gl.RGBA,gl.UNSIGNED_BYTE,full); }
    else { if (sub) gl.texSubImage2D(target,0,0,0,2,2,gl.RGBA,gl.UNSIGNED_BYTE,full); else gl.texImage2D(target,0,internal,2,2,0,gl.RGBA,gl.UNSIGNED_BYTE,full); }
    check(label + ' row overlap rejected',gl.getError() === gl.INVALID_OPERATION); state(label,2,4,1,1,1);
    if (three) {
      layout(4,2,1,1,1);
      if (sub) gl.texSubImage3D(target,0,0,0,0,2,2,2,gl.RGBA,gl.UNSIGNED_BYTE,full); else gl.texImage3D(target,0,internal,2,2,2,0,gl.RGBA,gl.UNSIGNED_BYTE,full);
      check(label + ' image overlap rejected',gl.getError() === gl.INVALID_OPERATION); state(label,4,2,1,1,1);
    }
    layout(4,4,1,1,1);
    if (three) { if (sub) gl.texSubImage3D(target,0,0,0,0,0,2,2,gl.RGBA,gl.UNSIGNED_BYTE,full); else gl.texImage3D(target,0,internal,0,2,2,0,gl.RGBA,gl.UNSIGNED_BYTE,full); }
    else { if (sub) gl.texSubImage2D(target,0,0,0,0,2,gl.RGBA,gl.UNSIGNED_BYTE,full); else gl.texImage2D(target,0,internal,0,2,0,gl.RGBA,gl.UNSIGNED_BYTE,full); }
    check(label + ' zero width',gl.getError() === 0); state(label,4,4,1,1,1);
    check(label + ' source unchanged',full.data.join(',') === before);
  }
  layout(1,1,7,7,7);
  if (three) gl.texImage3D(target,0,internal,2,2,2,0,gl.RGBA,gl.UNSIGNED_BYTE,null); else gl.texImage2D(target,0,internal,2,2,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  check('null exception ' + mode,gl.getError() === 0); state('null restored',1,1,7,7,7);
  layout(0,0,0,0,0); const zero = new Uint8Array([9,9,9,9]);
  if (three) gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,tex,0,1); else gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,target,tex,0);
  gl.readPixels(1,1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,zero); check('null zero ' + mode,zero.data.join(',') === '0,0,0,0'); setup('zero');
  gl.deleteTexture(tex);
}

} finally { gl.deleteFramebuffer(fb); gl.destroy(); }
if (failures) throw new Error('UNPACK failures: ' + failures);
console.log('UNPACK layout typed: ok');
