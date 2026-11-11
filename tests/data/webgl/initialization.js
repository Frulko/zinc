const c = document.createElement('canvas'); c.width = 4; c.height = 4;
const g = c.getContext('webgl2', {antialias:false});
function ok(v, msg) { if (!v) throw new Error(msg); }
function err(msg) { ok(g.getError() === g.NO_ERROR, msg); }
function tex(w=4,h=4) { const t=g.createTexture(); g.bindTexture(g.TEXTURE_2D,t); g.texImage2D(g.TEXTURE_2D,0,g.RGBA8,w,h,0,g.RGBA,g.UNSIGNED_BYTE,null); return t; }
function fb(t) { const f=g.createFramebuffer(); g.bindFramebuffer(g.FRAMEBUFFER,f); g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,t,0); return f; }
function pixels() { const p=new Uint8Array(64); g.readPixels(0,0,4,4,g.RGBA,g.UNSIGNED_BYTE,p); err('read'); return p; }
function uniform(p, v) { return p.every((x,i)=>x===v[i%4]); }
const source=tex(), sf=fb(source); g.clearColor(1,0,0,1); g.clear(g.COLOR_BUFFER_BIT);
const dest=tex();
g.copyTexImage2D(g.TEXTURE_2D,0,g.RGBA8,-2,-2,4,4,0); err('partial image');
const df=fb(dest); let p=pixels();
for(let y=0;y<4;y++) for(let x=0;x<4;x++) { const inside=x>=2&&y>=2; ok(p[(y*4+x)*4]===(inside?255:0)&&p[(y*4+x)*4+3]===(inside?255:0),'partial image pixels'); }
g.clearColor(0,1,0,1); g.clear(g.COLOR_BUFFER_BIT);
g.bindFramebuffer(g.READ_FRAMEBUFFER,sf); g.bindFramebuffer(g.DRAW_FRAMEBUFFER,df); g.bindTexture(g.TEXTURE_2D,dest);
g.copyTexSubImage2D(g.TEXTURE_2D,0,0,0,-2,-2,4,4); err('partial sub');
g.bindFramebuffer(g.READ_FRAMEBUFFER,df); p=pixels();
for(let y=0;y<4;y++) for(let x=0;x<4;x++) { const i=(y*4+x)*4, inside=x>=2&&y>=2; ok(p[i]===(inside?255:0)&&p[i+1]===(inside?0:255)&&p[i+3]===255,'outside sub unchanged'); }
g.bindFramebuffer(g.READ_FRAMEBUFFER,sf); g.copyTexSubImage2D(g.TEXTURE_2D,0,0,0,-2147483648,0,4,4); err('fully outside');
g.copyTexSubImage2D(g.TEXTURE_2D,0,3,0,-100,0,4,4); ok(g.getError()===g.INVALID_VALUE,'validate before clipping');
g.copyTexImage2D(g.TEXTURE_2D,0,g.RGBA8,2147483647,2147483647,4,4,0); err('outside image');
g.bindFramebuffer(g.READ_FRAMEBUFFER,df); ok(uniform(pixels(),[0,0,0,0]),'outside image zero');
// Reuse the same nonzero storage, with hostile unpack state.
g.clearColor(1,1,1,1); g.clear(g.COLOR_BUFFER_BIT);
g.pixelStorei(g.UNPACK_ROW_LENGTH,17); g.pixelStorei(g.UNPACK_SKIP_ROWS,3);
g.texImage2D(g.TEXTURE_2D,0,g.RGBA8,4,4,0,g.RGBA,g.UNSIGNED_BYTE,null); err('null realloc');
ok(g.getParameter(g.UNPACK_ROW_LENGTH)===17&&g.getParameter(g.UNPACK_SKIP_ROWS)===3,'unpack restored');
ok(uniform(pixels(),[0,0,0,0]),'null realloc zero');
g.pixelStorei(g.UNPACK_ROW_LENGTH,0); g.pixelStorei(g.UNPACK_SKIP_ROWS,0);
const indexed=g.getExtension('OES_draw_buffers_indexed');
const rb=g.createRenderbuffer(); g.bindRenderbuffer(g.RENDERBUFFER,rb);
g.enable(g.SCISSOR_TEST); g.scissor(0,0,0,0); g.colorMask(false,false,false,false); g.depthMask(false); g.stencilMask(0); g.enable(g.RASTERIZER_DISCARD);
if(indexed) indexed.colorMaskiOES(1,true,false,true,false);
g.renderbufferStorage(g.RENDERBUFFER,g.RGBA8,4,4); err('renderbuffer initialize');
ok(g.getParameter(g.SCISSOR_TEST)&&g.getParameter(g.RASTERIZER_DISCARD)&&g.getParameter(g.COLOR_WRITEMASK).every(x=>!x),'clear state restored');
if(indexed) ok(g.getIndexedParameter(g.COLOR_WRITEMASK,1).join()==='true,false,true,false','indexed mask restored');
g.disable(g.SCISSOR_TEST); g.disable(g.RASTERIZER_DISCARD); g.colorMask(true,true,true,true);
g.bindFramebuffer(g.FRAMEBUFFER,df); g.framebufferRenderbuffer(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.RENDERBUFFER,rb);
ok(uniform(pixels(),[0,0,0,0]),'renderbuffer zero');
for(const f of [g.RGBA8I,g.RGBA8UI]) { g.renderbufferStorage(g.RENDERBUFFER,f,4,4); const a=f===g.RGBA8I?new Int32Array(64):new Uint32Array(64); g.readPixels(0,0,4,4,g.RGBA_INTEGER,f===g.RGBA8I?g.INT:g.UNSIGNED_INT,a); err('integer renderbuffer'); ok(a.every(x=>x===0),'integer zero'); }
g.renderbufferStorageMultisample(g.RENDERBUFFER,2,g.RGBA8,4,4); err('multisample initialize');
const ms=g.createFramebuffer(); g.bindFramebuffer(g.READ_FRAMEBUFFER,ms); g.framebufferRenderbuffer(g.READ_FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.RENDERBUFFER,rb);
g.bindFramebuffer(g.DRAW_FRAMEBUFFER,df); g.framebufferTexture2D(g.DRAW_FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,dest,0);
g.blitFramebuffer(0,0,4,4,0,0,4,4,g.COLOR_BUFFER_BIT,g.NEAREST); err('resolve');
g.bindFramebuffer(g.READ_FRAMEBUFFER,df); ok(uniform(pixels(),[0,0,0,0]),'multisample zero');
// Depth starts at one and stencil at zero, despite hostile write masks.
const depth=g.createRenderbuffer(); g.bindRenderbuffer(g.RENDERBUFFER,depth);
g.enable(g.SCISSOR_TEST); g.scissor(0,0,0,0); g.depthMask(false); g.stencilMask(0);
g.renderbufferStorage(g.RENDERBUFFER,g.DEPTH24_STENCIL8,4,4); err('depth stencil initialize');
g.disable(g.SCISSOR_TEST); g.bindFramebuffer(g.FRAMEBUFFER,df);
g.framebufferRenderbuffer(g.FRAMEBUFFER,g.DEPTH_STENCIL_ATTACHMENT,g.RENDERBUFFER,depth);
g.clearColor(0,0,0,0); g.clear(g.COLOR_BUFFER_BIT);
function shader(type,code) { const s=g.createShader(type); g.shaderSource(s,code); g.compileShader(s); ok(g.getShaderParameter(s,g.COMPILE_STATUS),g.getShaderInfoLog(s)); return s; }
const program=g.createProgram();
g.attachShader(program,shader(g.VERTEX_SHADER,'#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0,1);}'));
g.attachShader(program,shader(g.FRAGMENT_SHADER,'#version 300 es\nprecision highp float;out vec4 color;void main(){color=vec4(1,0,0,1);}'));
g.linkProgram(program); ok(g.getProgramParameter(program,g.LINK_STATUS),g.getProgramInfoLog(program));
g.useProgram(program); g.enable(g.DEPTH_TEST); g.enable(g.STENCIL_TEST); g.stencilFunc(g.EQUAL,0,255); g.viewport(0,0,4,4); g.drawArrays(g.TRIANGLES,0,3); err('initialized depth stencil draw');
ok(uniform(pixels(),[255,0,0,255]),'depth one stencil zero');
g.disable(g.DEPTH_TEST); g.disable(g.STENCIL_TEST); g.framebufferRenderbuffer(g.FRAMEBUFFER,g.DEPTH_STENCIL_ATTACHMENT,g.RENDERBUFFER,null);
// The source and destination may be different levels of one texture.
const alias=tex(); g.texImage2D(g.TEXTURE_2D,1,g.RGBA8,2,2,0,g.RGBA,g.UNSIGNED_BYTE,new Uint8Array(16).fill(255));
g.bindFramebuffer(g.FRAMEBUFFER,df); g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,alias,1);
g.copyTexImage2D(g.TEXTURE_2D,0,g.RGBA8,-1,-1,4,4,0); err('alias copy');
g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,alias,0); p=pixels();
for(let y=0;y<4;y++) for(let x=0;x<4;x++) ok(p[(y*4+x)*4]===(x>=1&&x<3&&y>=1&&y<3?255:0),'alias retained source');
const volume=g.createTexture(); g.bindTexture(g.TEXTURE_3D,volume); g.texStorage3D(g.TEXTURE_3D,1,g.RGBA8,4,4,2); err('3d storage');
g.copyTexSubImage3D(g.TEXTURE_3D,0,0,0,1,-2,-2,4,4); err('3d clipping');
g.framebufferTextureLayer(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,volume,0,1); p=pixels();
for(let y=0;y<4;y++) for(let x=0;x<4;x++) ok(p[(y*4+x)*4]===(x===3&&y===3?255:0),'3d clipped value');
const integer=g.createTexture(); g.bindTexture(g.TEXTURE_2D,integer); g.texStorage2D(g.TEXTURE_2D,1,g.RGBA8I,4,4);
g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,integer,0); const ints=new Int32Array(64); g.readPixels(0,0,4,4,g.RGBA_INTEGER,g.INT,ints); err('integer texture'); ok(ints.every(x=>x===0),'integer texture zero');
const c1=document.createElement('canvas'); c1.width=4; c1.height=4; const v1=c1.getContext('webgl',{antialias:false});
const t1=v1.createTexture(); v1.bindTexture(v1.TEXTURE_2D,t1); v1.clearColor(1,0,0,1); v1.clear(v1.COLOR_BUFFER_BIT); v1.copyTexImage2D(v1.TEXTURE_2D,0,v1.RGBA,-2,-2,4,4,0);
const f1=v1.createFramebuffer(); v1.bindFramebuffer(v1.FRAMEBUFFER,f1); v1.framebufferTexture2D(v1.FRAMEBUFFER,v1.COLOR_ATTACHMENT0,v1.TEXTURE_2D,t1,0); const p1=new Uint8Array(64); v1.readPixels(0,0,4,4,v1.RGBA,v1.UNSIGNED_BYTE,p1); ok(v1.getError()===v1.NO_ERROR,'webgl1 copy');
for(let y=0;y<4;y++) for(let x=0;x<4;x++) ok(p1[(y*4+x)*4]===(x>=2&&y>=2?255:0),'webgl1 clipped image');
v1.texImage2D(v1.TEXTURE_2D,0,v1.RGBA,4,4,0,v1.RGBA,v1.UNSIGNED_BYTE,null); v1.readPixels(0,0,4,4,v1.RGBA,v1.UNSIGNED_BYTE,p1); ok(uniform(p1,[0,0,0,0])&&v1.getError()===v1.NO_ERROR,'webgl1 null realloc');
console.log('webgl initialization: ok',g.getParameter(g.RENDERER),g.getParameter(g.VERSION));
