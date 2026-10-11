// ZN-439: the block-format extensions of the WebGL layer (ETC1, ETC, ASTC, PVRTC) where the driver has them. Whatever this machine's driver
// offers, a listed extension is one getExtension gives, its formats upload a level with no error and are COMPRESSED_TEXTURE_FORMATS; an
// extension not listed gives null and its formats are refused (INVALID_ENUM). Prints one line per extension and context version, then `ok`.
const exts = [
  ['WEBGL_compressed_texture_etc1', 'COMPRESSED_RGB_ETC1_WEBGL', 8, 4, 4],
  ['WEBGL_compressed_texture_etc', 'COMPRESSED_RGBA8_ETC2_EAC', 16, 4, 4],
  ['WEBGL_compressed_texture_astc', 'COMPRESSED_RGBA_ASTC_4x4_KHR', 16, 4, 4],
  ['WEBGL_compressed_texture_pvrtc', 'COMPRESSED_RGBA_PVRTC_4BPPV1_IMG', 32, 8, 8],
];
const FORMATS = { COMPRESSED_RGB_ETC1_WEBGL: 0x8D64, COMPRESSED_RGBA8_ETC2_EAC: 0x9278, COMPRESSED_RGBA_ASTC_4x4_KHR: 0x93B0, COMPRESSED_RGBA_PVRTC_4BPPV1_IMG: 0x8C02 };
let bad = 0;
for (const version of ['webgl', 'webgl2']) {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext(version);
  if (!gl) { console.log(`${version}: no context`); continue; }
  const listed = gl.getSupportedExtensions();
  for (const [name, constant, bytes, w, h] of exts) {
    const ext = gl.getExtension(name);
    const fmt = FORMATS[constant];
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    while (gl.getError()) {}
    gl.compressedTexImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, new Uint8Array(bytes));
    const err = gl.getError();
    const formats = Array.from(gl.getParameter(gl.COMPRESSED_TEXTURE_FORMATS) || []);
    const fine = ext ? listed.includes(name) && ext[constant] === fmt && err === 0 && formats.includes(fmt)
                     : !listed.includes(name) && err === gl.INVALID_ENUM && !formats.includes(fmt);
    if (!fine) bad++;
    console.log(`${version} ${name}: ${ext ? 'offered' : 'absent'}, upload error ${err}${fine ? '' : ' WRONG'}`);
    gl.deleteTexture(tex);
  }
}
console.log(bad ? `${bad} wrong` : 'ok');
