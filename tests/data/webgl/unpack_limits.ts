// Candidate only: tiny actual backing and huge layout arithmetic never reach old drivers.
import { createContext, Uint8Array } from 'zinc:gl';
const gl = createContext(4,4,2)!;
let failures: i32 = 0;
function check(name: string, ok: boolean): void { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) failures++; }
try {
  for (let mode: i32 = 0; mode < 4; mode++) {
    const three = mode >= 2; const target = mode === 2 ? gl.TEXTURE_3D : mode === 3 ? gl.TEXTURE_2D_ARRAY : gl.TEXTURE_2D;
    const internal = mode === 0 ? gl.RGBA : gl.RGBA8; const tex = gl.createTexture(); gl.bindTexture(target,tex);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH,4); gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT,4); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS,1); gl.pixelStorei(gl.UNPACK_SKIP_ROWS,1); gl.pixelStorei(gl.UNPACK_SKIP_IMAGES,1);
    if (three) gl.texImage3D(target,0,internal,2,2,2,0,gl.RGBA,gl.UNSIGNED_BYTE,null); else gl.texImage2D(target,0,internal,2,2,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    check('limits allocation',gl.getError() === 0);
    const bytes: number[] = []; for (let i: i32 = 0; i < (three ? 171 : 43); i++) bytes.push(0); const short = new Uint8Array(bytes);
    if (three) gl.texImage3D(target,0,internal,2,2,2,0,gl.RGBA,gl.UNSIGNED_BYTE,short); else gl.texImage2D(target,0,internal,2,2,0,gl.RGBA,gl.UNSIGNED_BYTE,short);
    check('tiny short image '+mode,gl.getError() === gl.INVALID_OPERATION);
    if (three) gl.texSubImage3D(target,0,0,0,0,2,2,2,gl.RGBA,gl.UNSIGNED_BYTE,short); else gl.texSubImage2D(target,0,0,0,2,2,gl.RGBA,gl.UNSIGNED_BYTE,short);
    check('tiny short subimage '+mode,gl.getError() === gl.INVALID_OPERATION);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH,2147483647); gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT,2147483647); gl.pixelStorei(gl.UNPACK_SKIP_ROWS,1); gl.pixelStorei(gl.UNPACK_SKIP_IMAGES,2147483647);
    if (three) gl.texSubImage3D(target,0,0,0,0,2,2,2,gl.RGBA,gl.UNSIGNED_BYTE,short); else gl.texSubImage2D(target,0,0,0,2,2,gl.RGBA,gl.UNSIGNED_BYTE,short);
    check('huge layout rejection '+mode,gl.getError() === gl.INVALID_OPERATION);
    gl.deleteTexture(tex);
  }
} finally { gl.destroy(); }
if (failures) throw new Error('UNPACK limits failures: '+failures);
console.log('UNPACK layout limits: ok');
