let failures=0;
function check(name,ok){console.log((ok?'PASS ':'FAIL ')+name);if(!ok)failures++;}
function written(a,starts,pixel,sentinel){return Array.from(a).every((v,i)=>{let want=sentinel;for(const start of starts)if(i>=start&&i<start+4)want=pixel[i-start];return v===want;});}
for(const version of [1,2]){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=4;const gl=canvas.getContext(version===2?'webgl2':'webgl',{antialias:false});if(!gl)throw Error('no context');
 try{
  gl.clearColor(1,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);check('setup '+version,gl.getError()===0);const pixel=[255,0,0,255];
  const tail=new Uint8Array(12).fill(91);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,tail);let error=gl.getError();check('byte tail '+version,error===0&&written(tail,[0],pixel,91));
  for(const size of [0,1]){const a=new Uint8Array(12).fill(91);gl.readPixels(0,0,size===0?0:1,size===0?1:0,gl.RGBA,gl.UNSIGNED_BYTE,a);error=gl.getError();check('zero '+version+'/'+size,error===0&&written(a,[],pixel,91));}
  for(const mode of [0,1,2,3]){const a=new Uint8Array(mode===3?3:12).fill(91);gl.readPixels(0,0,mode===1?-1:1,1,mode===0?0x1234:mode===2?gl.RGB:gl.RGBA,gl.UNSIGNED_BYTE,a);error=gl.getError();check('error '+version+'/'+mode,error===(mode===0?gl.INVALID_ENUM:mode===1?gl.INVALID_VALUE:gl.INVALID_OPERATION)&&written(a,[],pixel,91));}
  const part=new Uint8Array(20).fill(91);gl.readPixels(-1,-1,2,2,gl.RGBA,gl.UNSIGNED_BYTE,part);error=gl.getError();check('partial outside '+version,error===0&&written(part,[12],pixel,91));
  const out=new Uint8Array(12).fill(91);gl.readPixels(-20,20,1,1,gl.RGBA,gl.UNSIGNED_BYTE,out);error=gl.getError();check('fully outside '+version,error===0&&written(out,[],pixel,91));
  const pending=new Uint8Array(12).fill(91);gl.bindBuffer(0x1234,null);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pending);error=gl.getError();check('pending '+version,error===gl.INVALID_ENUM&&gl.getError()===0&&written(pending,[0],pixel,91));
  const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);const bad=new Uint8Array(12).fill(91);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,bad);error=gl.getError();check('incomplete '+version,error===gl.INVALID_FRAMEBUFFER_OPERATION&&written(bad,[],pixel,91));gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.deleteFramebuffer(fb);
  if(version===2){
   gl.pixelStorei(gl.PACK_ROW_LENGTH,3);gl.pixelStorei(gl.PACK_SKIP_ROWS,1);gl.pixelStorei(gl.PACK_SKIP_PIXELS,1);const a=new Uint8Array(44).fill(91);gl.readPixels(0,0,1,2,gl.RGBA,gl.UNSIGNED_BYTE,a);error=gl.getError();check('pack gaps',error===0&&written(a,[16,28],pixel,91));
   gl.pixelStorei(gl.PACK_ROW_LENGTH,0);gl.pixelStorei(gl.PACK_SKIP_ROWS,0);gl.pixelStorei(gl.PACK_SKIP_PIXELS,0);gl.pixelStorei(gl.PACK_ALIGNMENT,8);const aligned=new Uint8Array(20).fill(91);gl.readPixels(0,0,1,2,gl.RGBA,gl.UNSIGNED_BYTE,aligned);error=gl.getError();check('alignment',error===0&&written(aligned,[0,8],pixel,91));gl.pixelStorei(gl.PACK_ALIGNMENT,4);
   const backing=new Uint8Array(24).fill(91);const view=new Uint8Array(backing.buffer,3,16);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,view,2);error=gl.getError();check('backing/destination offset',error===0&&written(backing,[5],pixel,91));
  }
 }finally{gl.getExtension('WEBGL_lose_context').loseContext();}
}
if(failures)throw Error('readPixels JS failures: '+failures);console.log('readPixels JS: ok');
