import {createContext, Float32Array} from 'zinc:gl';
let failures:i32=0;
for(const version of [1,2]) { const gl=createContext(4,4,version)!; try { const a=new Float32Array([0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1]); gl.clearColor(1,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,a);const e=gl.getError();const ok=e===gl.INVALID_OPERATION&&a.data.every(v=>v===0.1);console.log((ok?'PASS ':'FAIL ')+'wrong-kind '+version+' error '+e+' data '+a.data.join(','));if(!ok)failures++; }finally{gl.destroy();} }
if(failures)throw new Error('wrong-kind failures '+failures);
