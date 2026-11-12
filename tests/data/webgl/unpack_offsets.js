// Offset + unpack layout compose within an exact-length view over safe backing.
const canvas = document.createElement('canvas'); canvas.width = canvas.height = 4;
const gl = canvas.getContext('webgl2'); if (!gl) throw new Error('no WebGL2');
let failures = 0;
function check(name, ok) { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) failures++; }
const backing = new Uint8Array(512); for (let i=0;i<512;i+=4) backing.set([i/4,17,29,255],i);
const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
for (const target of [gl.TEXTURE_2D,gl.TEXTURE_3D,gl.TEXTURE_2D_ARRAY]) {
  const three = target !== gl.TEXTURE_2D; const tex = gl.createTexture(); gl.bindTexture(target,tex);
  gl.pixelStorei(gl.UNPACK_ROW_LENGTH,4); gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT,4);
  gl.pixelStorei(gl.UNPACK_SKIP_PIXELS,1); gl.pixelStorei(gl.UNPACK_SKIP_ROWS,1); gl.pixelStorei(gl.UNPACK_SKIP_IMAGES,1);
  const view = new Uint8Array(backing.buffer,4,(three ? 172 : 44)+4);
  for (let sub=0;sub<2;sub++) {
    if (three) { if (sub) gl.texSubImage3D(target,0,0,0,0,2,2,2,gl.RGBA,gl.UNSIGNED_BYTE,view,4); else gl.texImage3D(target,0,gl.RGBA8,2,2,2,0,gl.RGBA,gl.UNSIGNED_BYTE,view,4); }
    else { if (sub) gl.texSubImage2D(target,0,0,0,2,2,gl.RGBA,gl.UNSIGNED_BYTE,view,4); else gl.texImage2D(target,0,gl.RGBA8,2,2,0,gl.RGBA,gl.UNSIGNED_BYTE,view,4); }
    check('offset exact span '+target+' sub '+sub,gl.getError() === 0);
    if (three) gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,tex,0,1); else gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,target,tex,0);
    check('offset framebuffer',gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE);
    const out = new Uint8Array(4); gl.readPixels(1,1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,out);
    check('offset selected pixel',Array.from(out).join(',') === (three ? '44,17,29,255' : '12,17,29,255') && gl.getError() === 0);
  }
  gl.deleteTexture(tex);
}
gl.deleteFramebuffer(fb);
if (failures) throw new Error('offset failures: '+failures);
console.log('UNPACK layout offsets: ok');
