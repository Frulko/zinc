import {createContext, GLArray} from 'zinc:gl';
let failures:i32=0;
for(const version of [1,2]) { const gl=createContext(4,4,version)!;try {for(const kind of [0,99]) {const a=new GLArray([91,92,93,94,95,96,97,98],kind);gl.clearColor(1,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,a);const error=gl.getError();const ok=error===gl.INVALID_OPERATION&&a.data.join(',')==='91,92,93,94,95,96,97,98';console.log((ok?'PASS ':'FAIL ')+'raw-kind '+version+'/'+kind+' error '+error+' data '+a.data.join(','));if(!ok)failures++;}}finally{gl.destroy();}}
if(failures)throw new Error('raw-kind failures '+failures);
