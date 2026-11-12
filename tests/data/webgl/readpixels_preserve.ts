import { createContext, Uint8Array, Float32Array, Int32Array } from 'zinc:gl';
let failures: i32 = 0;
function check(name: string, ok: boolean): void { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) failures++; }
function fill(n: i32, value: number): number[] { const a: number[] = []; for (let i: i32 = 0; i < n; i++) a.push(value); return a; }
function written(a: number[], starts: number[], pixel: number[], untouched: number): boolean {
  for (let i: i32 = 0; i < a.length; i++) { let want = untouched; for (const start of starts) if (i >= start && i < start + 4) want = pixel[i - start]; if (a[i] !== want) return false; } return true;
}
for (const version of [1, 2]) {
  const gl = createContext(4, 4, version)!;
  try {
    gl.clearColor(1, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    check('setup ' + version, gl.getError() === 0);
    const pixel = [255, 0, 0, 255];
    const tail = new Uint8Array(fill(12, 257)); gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,tail); let error = gl.getError();
    check('byte write/tail ' + version, error === 0 && written(tail.data,[0],pixel,257));
    for (const size of [0, 1]) {
      const dst = new Uint8Array(fill(12,257)); gl.readPixels(0,0,size === 0 ? 0 : 1,size === 0 ? 1 : 0,gl.RGBA,gl.UNSIGNED_BYTE,dst); error=gl.getError();
      check('zero size ' + version + '/' + size, error === 0 && written(dst.data,[],pixel,257));
    }
    for (const mode of [0,1,2,3]) {
      const dst = new Uint8Array(fill(mode === 3 ? 3 : 12,257));
      gl.readPixels(0,0,mode === 1 ? -1 : 1,1,mode === 0 ? 0x1234 : mode === 2 ? gl.RGB : gl.RGBA,gl.UNSIGNED_BYTE,dst); error=gl.getError();
      check('error no write ' + version + '/' + mode,error === (mode === 0 ? gl.INVALID_ENUM : mode === 1 ? gl.INVALID_VALUE : gl.INVALID_OPERATION) && written(dst.data,[],pixel,257));
    }
    const partial = new Uint8Array(fill(20,257)); gl.readPixels(-1,-1,2,2,gl.RGBA,gl.UNSIGNED_BYTE,partial); error=gl.getError();
    check('partial outside ' + version,error === 0 && written(partial.data,[12],pixel,257));
    const outside = new Uint8Array(fill(12,257)); gl.readPixels(-20,20,1,1,gl.RGBA,gl.UNSIGNED_BYTE,outside); error=gl.getError();
    check('fully outside ' + version,error === 0 && written(outside.data,[],pixel,257));
    const pending = new Uint8Array(fill(12,257)); gl.bindBuffer(0x1234,null); gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pending); error=gl.getError();
    check('pending error valid write ' + version,error === gl.INVALID_ENUM && gl.getError() === 0 && written(pending.data,[0],pixel,257));
    const empty = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,empty);
    const bad = new Uint8Array(fill(12,257)); gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,bad); error=gl.getError();
    check('incomplete no write ' + version,error === gl.INVALID_FRAMEBUFFER_OPERATION && written(bad.data,[],pixel,257));
    gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.deleteFramebuffer(empty);
    if (version === 2) {
      gl.pixelStorei(gl.PACK_ROW_LENGTH,3); gl.pixelStorei(gl.PACK_SKIP_ROWS,1); gl.pixelStorei(gl.PACK_SKIP_PIXELS,1);
      const packed = new Uint8Array(fill(44,257)); gl.readPixels(0,0,1,2,gl.RGBA,gl.UNSIGNED_BYTE,packed); error=gl.getError();
      check('pack skips/gaps',error === 0 && written(packed.data,[16,28],pixel,257));
      gl.pixelStorei(gl.PACK_ROW_LENGTH,0); gl.pixelStorei(gl.PACK_SKIP_ROWS,0); gl.pixelStorei(gl.PACK_SKIP_PIXELS,0); gl.pixelStorei(gl.PACK_ALIGNMENT,8);
      const aligned = new Uint8Array(fill(20,257)); gl.readPixels(0,0,1,2,gl.RGBA,gl.UNSIGNED_BYTE,aligned); error=gl.getError();
      check('pack alignment',error === 0 && written(aligned.data,[0,8],pixel,257)); gl.pixelStorei(gl.PACK_ALIGNMENT,4);
      check('float extension',gl.getExtension('EXT_color_buffer_float'));
      const fb=gl.createFramebuffer(), rb=gl.createRenderbuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,fb); gl.bindRenderbuffer(gl.RENDERBUFFER,rb);
      gl.renderbufferStorage(gl.RENDERBUFFER,gl.RGBA32F,4,4); gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.RENDERBUFFER,rb);
      gl.clearBufferfv(gl.COLOR,0,[0.5,-0.25,2,1]);
      const floats=new Float32Array(fill(8,0.1)); gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,floats); error=gl.getError();
      check('float write/exact untouched slots',error === 0 && written(floats.data,[0],[0.5,-0.25,2,1],0.1));
      gl.renderbufferStorage(gl.RENDERBUFFER,gl.RGBA8I,4,4); gl.clearBufferiv(gl.COLOR,0,[3,-4,5,6]);
      const ints=new Int32Array(fill(8,4294967297)); gl.readPixels(0,0,1,1,gl.RGBA_INTEGER,gl.INT,ints); error=gl.getError();
      check('integer write/exact untouched slots',error === 0 && written(ints.data,[0],[3,-4,5,6],4294967297));
      gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.deleteFramebuffer(fb); gl.deleteRenderbuffer(rb);
    }
  } finally { gl.destroy(); }
}
if (failures) throw new Error('readPixels typed failures: ' + failures);
console.log('readPixels typed: ok');
