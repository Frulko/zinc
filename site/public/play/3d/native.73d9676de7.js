const O=globalThis.__zincWeb,Ie=void 0;function Ce(A){return new Proxy({},{get(U,F){if(typeof F!="string")return;if(F in U)return U[F];const T=O.nativeOf(A),I=T&&T.impl[F];return!T&&O.bridge&&O.bridge.has(A)?U[F]=(...X)=>O.bridge.call(A,F,X):U[F]=typeof I=="function"?I.bind(T.impl):()=>{throw new O.ZnUnsupported("plugin "+A+"."+F,T?"its browser backend does not have it":'the plugin has no browser backend (docs/targets/web.md, "The dev bridge")')}}})}(()=>{const A=globalThis.__zincWeb,U=1,F=2,T=4,I=8,X=65536,ne=1,V=2,H=1,ie=2,oe=4,fe=8,C=16,W=32,k=64,Y=128,Ae=`
uniform vec3 u_amb, u_ld[4], u_lc[4], u_eye, u_spec;
uniform float u_shin;
vec3 shade(vec3 n, vec3 base) {
  vec3 l = u_amb;
  for (int i = 0; i < 4; i++) l += max(-dot(n, u_ld[i]), 0.0) * u_lc[i];
  return base * min(l, vec3(1.0));
}
vec3 highlight(vec3 n, vec3 p) {
  vec3 v = normalize(u_eye - p), s = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec3 l = -u_ld[i];
    float k = dot(n, l);
    if (k > 0.0) s += k * 0.25 * (u_shin * 0.5 + 1.0) * pow(max(dot(n, normalize(l + v)), 0.0), u_shin) * u_lc[i];
  }
  return s * u_spec;
}
`,Fe=`
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec3 a_nrm;
layout(location = 2) in vec2 a_uv;
layout(location = 3) in vec4 a_col;
uniform mat4 u_mvp, u_model;
uniform vec3 u_color;
out vec3 v_col;
out vec2 v_uv;
out vec3 v_pos, v_nrm;
#ifdef FOG
out float v_fz;
#endif
void main() {
  gl_Position = u_mvp * vec4(a_pos, 1.0);
  v_nrm = (u_model * vec4(a_nrm, 0.0)).xyz;
#ifdef VCOL
  vec3 base = a_col.bgr;
#else
  vec3 base = u_color;
#endif
#if defined(LIT) && !defined(FLAT)
  v_col = shade(normalize(v_nrm), base);
#else
  v_col = base;
#endif
  v_uv = a_uv;
  v_pos = (u_model * vec4(a_pos, 1.0)).xyz;
#ifdef FOG
  v_fz = gl_Position.w;
#endif
}
`,Re=`
uniform sampler2D u_tex;
#ifdef EMIT
uniform vec3 u_emit;
#endif
#ifdef BLEND
uniform float u_alpha;
#endif
#ifdef FOG
uniform vec3 u_fogc;
uniform vec2 u_fog;
in float v_fz;
#endif
in vec3 v_col;
in vec2 v_uv;
in vec3 v_pos, v_nrm;
out vec4 o_color;
void main() {
  vec3 c = v_col;
#if defined(LIT) && defined(FLAT)
  vec3 n = normalize(cross(dFdx(v_pos), dFdy(v_pos)));   // y is not flipped here (render3d.gl.cpp flips it, hence its minus)
  if (!gl_FrontFacing) n = -n;
  c = shade(n, c);
#endif
#if defined(LIT) && defined(SPEC)
#ifdef FLAT
  c = min(c + highlight(n, v_pos), vec3(1.0));
#else
  c = min(c + highlight(normalize(v_nrm), v_pos), vec3(1.0));
#endif
#endif
#ifdef EMIT
  c = min(c + u_emit, vec3(1.0));
#endif
#ifdef TEX
  c *= texture(u_tex, v_uv).rgb;
#endif
#ifdef FOG
  c = mix(c, u_fogc, clamp((v_fz - u_fog.x) / (u_fog.y - u_fog.x), 0.0, 1.0));
#endif
#ifdef BLEND
  o_color = vec4(c, u_alpha);
#else
  o_color = vec4(c, 1.0);
#endif
}
`;let e=null,p=null,M=0,Te=3;const B=[],y=[],z=[],le=new Map;let b=null,Z=0,K=null,ue=-1,G=-1,q=0,L=0;const w=[0,0,0],D=new Float32Array(12),j=new Float32Array(12),J=[0,0,0],R=[0,0,0],g=[0,0,0],x=[0,0,0];let ae=1,Q=!1,ce=0,se=1;const de=new Float32Array(16),$=new Float32Array(16),_e=new Float32Array(16);function ee(){if(e)return e;if(A.require("webgl2","zinc:3d draws on WebGL 2"),p=document.createElement("canvas"),e=p.getContext("webgl2",{alpha:!0,depth:!1,antialias:!1,preserveDrawingBuffer:!1,premultipliedAlpha:!1}),!e)throw new A.ZnUnsupported("webgl2","zinc:3d: the browser gave no WebGL 2 context");return e.enable(e.DEPTH_TEST),e.depthFunc(e.LESS),e.cullFace(e.BACK),M=Math.min(4,e.getParameter(e.MAX_SAMPLES)),M<2&&(M=0),e}const Ee=(t,n)=>{let o=t.indexOf(null);return o<0?o=t.push(n)-1:t[o]=n,o},te=t=>[(t>>16&255)/255,(t>>8&255)/255,(t&255)/255];function me(t,n,o){const l=e.createShader(t);return e.shaderSource(l,`#version 300 es
precision highp float;
`+n+Ae+o),e.compileShader(l),e.getShaderParameter(l,e.COMPILE_STATUS)||console.error("zinc:3d: shader:",e.getShaderInfoLog(l)),l}function pe(t){if(z[t])return z[t];const n=[[Y,"FOG"],[H,"LIT"],[ie,"FLAT"],[oe,"TEX"],[fe,"VCOL"],[C,"SPEC"],[W,"EMIT"],[k,"BLEND"]].filter(([c])=>t&c).map(([,c])=>"#define "+c+`
`).join(""),o=e.createProgram(),l=me(e.VERTEX_SHADER,n,Fe),r=me(e.FRAGMENT_SHADER,n,Re);e.attachShader(o,l),e.attachShader(o,r),e.linkProgram(o),e.deleteShader(l),e.deleteShader(r);const i={id:null,frame:-1};if(!e.getProgramParameter(o,e.LINK_STATUS))return console.error("zinc:3d: program:",e.getProgramInfoLog(o)),e.deleteProgram(o),z[t]=i;i.id=o;for(const c of["mvp","model","color","amb","ld","lc","eye","spec","shin","emit","alpha","fogc","fog","tex"])i[c]=e.getUniformLocation(o,"u_"+c);return e.useProgram(o),e.uniform1i(i.tex,0),K=o,z[t]=i}function ve(t,n,o,l,r,i){const c=new ArrayBuffer(36*i),u=new Float32Array(c),s=new Uint32Array(c);for(let f=0;f<i;f++){const _=f*9;u[_]=t[f*3],u[_+1]=t[f*3+1],u[_+2]=t[f*3+2],u[_+3]=n[f*3],u[_+4]=n[f*3+1],u[_+5]=n[f*3+2],o&&(u[_+6]=o[f*2],u[_+7]=o[f*2+1]),l&&(s[_+8]=l[f])}const a={vao:e.createVertexArray(),vbo:e.createBuffer(),ibo:e.createBuffer(),ni:r.length,nv:i,uv:!!o,col:!!l,interleaved:!0};e.bindVertexArray(a.vao),e.bindBuffer(e.ARRAY_BUFFER,a.vbo),e.bufferData(e.ARRAY_BUFFER,c,e.STATIC_DRAW),e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,a.ibo),e.bufferData(e.ELEMENT_ARRAY_BUFFER,r,e.STATIC_DRAW);for(let f=0;f<4;f++)e.enableVertexAttribArray(f);return e.vertexAttribPointer(0,3,e.FLOAT,!1,36,0),e.vertexAttribPointer(1,3,e.FLOAT,!1,36,12),e.vertexAttribPointer(2,2,e.FLOAT,!1,36,24),e.vertexAttribPointer(3,4,e.UNSIGNED_BYTE,!0,36,32),e.bindVertexArray(null),a.f=u,Ee(B,a)}function Le(t,n,o,l,r){ee();const i=t.length/3|0,c=(r.length/3|0)*3;if(i<=0||i>65535)return-1;const u=new Uint16Array(c);for(let a=0;a<c;a++){const f=r[a];u[a]=f>=0&&f<i?f:0}const s=new Float32Array(i*3);if(n.length>=i*3)for(let a=0;a<i*3;a++)s[a]=n[a];else for(let a=0;a<c;a+=3){const f=u[a]*3,_=u[a+1]*3,d=u[a+2]*3,m=t[_]-t[f],v=t[_+1]-t[f+1],h=t[_+2]-t[f+2],E=t[d]-t[f],N=t[d+1]-t[f+1],S=t[d+2]-t[f+2],P=v*S-h*N,Se=h*E-m*S,Oe=m*N-v*E;for(const re of[f,_,d])s[re]+=P,s[re+1]+=Se,s[re+2]+=Oe}for(let a=0;a<i*3;a+=3){const f=Math.hypot(s[a],s[a+1],s[a+2]);f>0&&(s[a]/=f,s[a+1]/=f,s[a+2]/=f)}return ve(t,s,o.length>=i*2?o:null,l.length>=i?l:null,u,i)}function we(t,n){ee();const o=t.length;if(n<0||n&3||n+24>o)return-1;const l=t instanceof Uint8Array?t:Uint8Array.from(t),r=new DataView(l.buffer,l.byteOffset+n),i=r.getUint32(0,!0),c=r.getUint32(4,!0),u=r.getUint32(8,!0),s=i*(24+(u&1?8:0)+(u&2?4:0));if(i===0||i>65535||c%3||n+24+s+c*2>o)return-1;const a=(E,N)=>{const S=new Float32Array(N);for(let P=0;P<N;P++)S[P]=r.getFloat32(24+E+P*4,!0);return S};let f=0;const _=a(f,i*3);f+=12*i;const d=a(f,i*3);f+=12*i;const m=u&1?a(f,i*2):null;m&&(f+=8*i);let v=null;if(u&2){v=new Uint32Array(i);for(let E=0;E<i;E++)v[E]=r.getUint32(24+f+E*4,!0);f+=4*i}const h=new Uint16Array(c);for(let E=0;E<c;E++)if(h[E]=r.getUint16(24+f+E*2,!0),h[E]>=i)return-1;return ve(_,d,m,v,h,i)}function Ue(t){const n=B[t];n&&(e.deleteVertexArray(n.vao),e.deleteBuffer(n.vbo),e.deleteBuffer(n.ibo),B[t]=null)}function ye(t,n,o){const l=B[t];if(!l||n.length!==l.nv*3||o.length!==l.nv*3)return!1;for(let r=0;r<l.nv*3;r++)if(!Number.isFinite(n[r])||!Number.isFinite(o[r]))return!1;for(let r=0;r<l.nv;r++)for(let i=0;i<3;i++)l.f[r*9+i]=n[r*3+i],l.f[r*9+3+i]=o[r*3+i];return e.bindBuffer(e.ARRAY_BUFFER,l.vbo),e.bufferSubData(e.ARRAY_BUFFER,0,l.f),!0}function he(t){e.deleteFramebuffer(t.fbo),e.deleteRenderbuffer(t.color),e.deleteRenderbuffer(t.depth),b===t&&(b=null)}function xe(t,n,o){ee();const l=Math.min(2,globalThis.devicePixelRatio||1);n=Math.max(1,Math.round(n*l)),o=Math.max(1,Math.round(o*l));let r=y[t];if(r&&r.w===n&&r.h===o)return t;r?he(r):(r={out:document.createElement("canvas")},t=Ee(y,r)),r.w=n,r.h=o,r.out.width=n,r.out.height=o,r.fbo=e.createFramebuffer(),e.bindFramebuffer(e.FRAMEBUFFER,r.fbo);const i=c=>{const u=e.createRenderbuffer();return e.bindRenderbuffer(e.RENDERBUFFER,u),M?e.renderbufferStorageMultisample(e.RENDERBUFFER,M,c,n,o):e.renderbufferStorage(e.RENDERBUFFER,c,n,o),u};return r.color=i(e.RGBA8),r.depth=i(e.DEPTH_COMPONENT24),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.RENDERBUFFER,r.color),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.RENDERBUFFER,r.depth),t}function Pe(t){const n=y[t];n&&(he(n),y[t]=null)}function be(t,n,o){for(let l=0;l<4;l++)for(let r=0;r<4;r++)t[l*4+r]=n[r]*o[l*4]+n[4+r]*o[l*4+1]+n[8+r]*o[l*4+2]+n[12+r]*o[l*4+3]}const ge=t=>{const n=new Float32Array(16);for(let o=0;o<16;o++)n[o]=o<t.length?t[o]:o%5===0?1:0;return n};function Me(t,n,o,l,r,i,c){if(b=y[t]||null,!b)return;q=0,L=0,w[0]=w[1]=w[2]=0,D.fill(0),j.fill(0),Z++,e.bindFramebuffer(e.FRAMEBUFFER,b.fbo),e.viewport(0,0,b.w,b.h),G>0&&(e.disable(e.BLEND),e.depthMask(!0),e.colorMask(!0,!0,!0,!0)),e.clearColor((n>>16&255)/255,(n>>8&255)/255,(n&255)/255,1),e.clear(e.COLOR_BUFFER_BIT|e.DEPTH_BUFFER_BIT);const u=new Float32Array(16),s=ge(o),a=b.w/b.h;if(c)u[0]=2/(l*a),u[5]=2/l,u[10]=-2/(i-r),u[14]=-(i+r)/(i-r),u[15]=1;else{const f=1/Math.tan(l*.5);u[0]=f/a,u[5]=f,u[10]=(i+r)/(r-i),u[11]=-1,u[14]=2*i*r/(r-i)}be(de,u,s);for(let f=0;f<3;f++)J[f]=-(s[f*4]*s[12]+s[f*4+1]*s[13]+s[f*4+2]*s[14]);R[0]=R[1]=R[2]=0,g[0]=g[1]=g[2]=0,Q=!1,G=-1}function Be(t,n){const o=A.images.canvas(t);if(!o||!o.width||!o.height)return!1;const l=A.images.rev(t)+":"+o.width+"x"+o.height;let r=le.get(t);return r?e.bindTexture(e.TEXTURE_2D,r.id):(r={id:e.createTexture(),key:"",filter:0,mips:!1},le.set(t,r),e.bindTexture(e.TEXTURE_2D,r.id),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.REPEAT),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.REPEAT)),r.key!==l&&(e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,!1),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,e.RGBA,e.UNSIGNED_BYTE,o),r.key=l,r.mips=!1,r.filter=0),n===3&&!r.mips&&(e.generateMipmap(e.TEXTURE_2D),r.mips=!0),r.filter!==n&&(e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,n===1?e.NEAREST:n===2?e.LINEAR:e.LINEAR_MIPMAP_LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,n===1?e.NEAREST:e.LINEAR),r.filter=n),!0}function De(t,n,o,l,r){const i=B[t];if(!i||!b)return;$.set(ge(n)),be(_e,de,$);const c=r>>4&3,u=r>>6&3;e.activeTexture(e.TEXTURE0);const s=l>=0&&i.uv&&Be(l,c||Te),a=R[0]>0||R[1]>0||R[2]>0,f=g[0]>0||g[1]>0||g[2]>0,_=(r&T?0:H|(a?C:0))|(r&F?ie:0)|(s?oe:0)|(r&U&&i.col?fe:0)|(f?W:0)|(u===ne||u===V?k:0)|(Q&&!(r&X)?Y:0),d=pe(_);if(!d.id)return;K!==d.id&&(e.useProgram(d.id),K=d.id),d.frame!==Z&&_&H&&(e.uniform3fv(d.amb,w),e.uniform3fv(d.ld,D),e.uniform3fv(d.lc,j),_&C&&e.uniform3fv(d.eye,J),d.frame=Z),_&C&&(e.uniform3fv(d.spec,R),e.uniform1f(d.shin,ae),e.uniform3fv(d.eye,J)),e.uniformMatrix4fv(d.mvp,!1,_e),e.uniformMatrix4fv(d.model,!1,$),e.uniform3fv(d.color,te(o)),_&W&&e.uniform3f(d.emit,g[0]/255,g[1]/255,g[2]/255),u!==G&&(u===ne||u===V?(e.enable(e.BLEND),e.blendFunc(e.SRC_ALPHA,u===V?e.ONE:e.ONE_MINUS_SRC_ALPHA),e.depthMask(!1),e.colorMask(!0,!0,!0,!1)):(e.disable(e.BLEND),e.depthMask(!0),e.colorMask(!0,!0,!0,!0)),G=u),_&Y&&(e.uniform3f(d.fogc,x[0]/255,x[1]/255,x[2]/255),e.uniform2f(d.fog,ce,se)),_&k&&e.uniform1f(d.alpha,(r>>8&255)/255);const m=r&I?0:1;m!==ue&&(m?e.enable(e.CULL_FACE):e.disable(e.CULL_FACE),ue=m),e.bindVertexArray(i.vao),e.drawElements(e.TRIANGLES,i.ni,e.UNSIGNED_SHORT,0),e.bindVertexArray(null),q+=i.ni/3}function Ne(){const t=b;return t?(b=null,(p.width!==t.w||p.height!==t.h)&&(p.width=t.w,p.height=t.h),e.bindFramebuffer(e.READ_FRAMEBUFFER,t.fbo),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),e.blitFramebuffer(0,0,t.w,t.h,0,0,t.w,t.h,e.COLOR_BUFFER_BIT,e.NEAREST),e.bindFramebuffer(e.FRAMEBUFFER,null),t.out.getContext("2d").drawImage(p,0,0),q):0}A.registerNative("Render3D",{meshCreate:Le,meshLoad:we,meshDestroy:Ue,meshDeform:ye,assetOpen:()=>-1,assetByte:()=>0,assetMesh:()=>-1,assetClose(){},target:xe,targetDestroy:Pe,begin:Me,ambient(t){w[0]=(t>>16&255)/255,w[1]=(t>>8&255)/255,w[2]=(t&255)/255},light(t,n,o,l){const r=Math.hypot(t,n,o);L>=4||!(r>0)||(D[L*3]=t/r,D[L*3+1]=n/r,D[L*3+2]=o/r,j.set(te(l),L*3),L++)},specular(t,n){R.splice(0,3,...te(t)),ae=n>=1?Math.min(n,2048):1},emissive(t){g[0]=t>>16&255,g[1]=t>>8&255,g[2]=t&255},fog(t,n,o){x[0]=t>>16&255,x[1]=t>>8&255,x[2]=t&255,ce=n,se=o>n?o:n+.001,Q=!0},draw:De,transform(t,n,o,l,r){if(t.length<16||n.length<16||o.length<3||l.length<4||r.length<3)return;const[i,c,u,s]=l,[a,f,_]=r,d=[(1-2*(c*c+u*u))*a,2*(i*c+u*s)*a,2*(i*u-c*s)*a,0,2*(i*c-u*s)*f,(1-2*(i*i+u*u))*f,2*(c*u+i*s)*f,0,2*(i*u+c*s)*_,2*(c*u-i*s)*_,(1-2*(i*i+c*c))*_,0,o[0],o[1],o[2],1],m=n.slice(0,16);for(let v=0;v<4;v++)for(let h=0;h<4;h++)t[v*4+h]=m[h]*d[v*4]+m[4+h]*d[v*4+1]+m[8+h]*d[v*4+2]+m[12+h]*d[v*4+3]},gpu:()=>!0,end:Ne,present(t,n,o,l,r){const i=y[t];i&&A.paint.element(i.out,n,o,l,r,{fit:"cover"})},worldOpen:()=>-1,worldChunkCount:()=>0,worldClose(){},worldLoad:()=>-1,worldFree(){},worldNight(){},worldShadows(){},worldSelect(t,n,o,l,r){for(let i=0;i<r.length;i++)r[i]=0},worldDraw(){}},["webgl2"])})();export{Ie as NativeModule,Ce as requireNative};
