const methods=[['Matrix4','multiplyMatrices'],['Matrix4','compose'],['Matrix4','invert'],['Matrix3','getNormalMatrix'],['Vector3','applyMatrix4'],['Vector4','applyMatrix4'],['Sphere','applyMatrix4'],['Frustum','intersectsSphere'],['Frustum','intersectsObject'],['Quaternion','setFromEuler'],['Object3D','updateMatrix']];
function assert(ok,what) { if(!ok) throw Error(what); }
for(const [type,name] of methods) {
  assert(T[type].prototype!==JS[type].prototype,type+' separate prototype');
  assert(T[type].prototype[name]!==JS[type].prototype[name],type+'.'+name+' separate function');
  assert(!JS[type].prototype[name].toString().includes('[native code]'),type+'.'+name+' reference remains JS');
  assert(T[type].prototype[name].toString().includes('[native code]'),type+'.'+name+' installed native function');
}
const orders=['XYZ','YXZ','ZXY','ZYX','YZX','XZY']; let seed=597;
function rand() { seed=(Math.imul(seed,1664525)+1013904223)|0; return seed/0x10000000; }
function array(n) { return Array.from({length:n},rand); }
function same(a,b,what) {
  if(typeof a==='boolean' || a===undefined) { assert(Object.is(a,b),what); return; }
  assert(a.length===b.length,what+' length');
  for(let i=0;i<a.length;++i) if(!Object.is(a[i],b[i])) throw Error(what+' ['+i+'] '+a[i]+' != '+b[i]);
}
function workspace(C) {
  const w={C,ma:new C.Matrix4(),mb:new C.Matrix4(),mul:new C.Matrix4(),comp:new C.Matrix4(),inv:new C.Matrix4(),normal:new C.Matrix3(),pos:new C.Vector3(),quat:new C.Quaternion(),scale:new C.Vector3(),v3:new C.Vector3(),v4:new C.Vector4(),sphere:new C.Sphere(),f:new C.Frustum(),obj:new C.Mesh(new C.BufferGeometry()),qe:new C.Quaternion(),euler:new C.Euler()};
  w.obj.geometry.boundingSphere=new C.Sphere(); if('pivot' in w.obj) w.obj.pivot=new C.Vector3();
  w.changes=0; w.qe._onChange(()=>++w.changes); return w;
}
const reference=workspace(JS),native=workspace(T);
function run(w,a,b,p,q,s,order) {
  const C=w.C,{ma,mb,pos,quat,scale,mul,comp,inv,normal,v3,v4,sphere,f,obj,qe,euler}=w;
  ma.fromArray(a);mb.fromArray(b);pos.fromArray(p);quat.fromArray(q);scale.fromArray(s);w.changes=0;
  const out=[];
  assert(mul.multiplyMatrices(ma,mb)===mul,'multiply this');out.push(mul.elements);
  assert(comp.compose(pos,quat,scale)===comp,'compose this');out.push(comp.elements);
  inv.copy(ma);assert(inv.invert()===inv,'invert this');assert(normal.getNormalMatrix(ma)===normal,'normal this');out.push(inv.elements,normal.elements);
  v3.copy(pos);v4.fromArray(q);assert(v3.applyMatrix4(ma)===v3,'vector3 this');assert(v4.applyMatrix4(ma)===v4,'vector4 this');out.push(v3.toArray(),v4.toArray());
  sphere.center.copy(pos);sphere.radius=q[3];assert(sphere.applyMatrix4(ma)===sphere,'sphere this');out.push([...sphere.center.toArray(),sphere.radius]);
  for(let i=0;i<6;++i) { f.planes[i].normal.set(a[i*2],a[i*2+1],a[i*2+2]);f.planes[i].constant=b[i]; }
  obj.geometry.boundingSphere.center.copy(pos);obj.geometry.boundingSphere.radius=q[3];obj.matrixWorld.copy(ma);
  out.push(f.intersectsSphere(obj.geometry.boundingSphere),f.intersectsObject(obj));
  euler.set(...p,orders[order]);assert(qe.setFromEuler(euler)===qe,'quaternion this');out.push(qe.toArray(),[w.changes]);
  obj.position.copy(pos);obj.quaternion.copy(quat);obj.scale.copy(scale);if('pivot' in obj)obj.pivot.copy(pos);
  out.push(obj.updateMatrix(),obj.matrix.elements,[obj.matrixWorldNeedsUpdate]);return out;
}
function check(a,b,p,q,s,order) {
  const expected=run(reference,a,b,p,q,s,order), actual=run(native,a,b,p,q,s,order);
  for(let i=0;i<expected.length;++i) same(expected[i],actual[i],'method '+i);
}
for(let i=0;i<CASES;++i) check(array(16),array(16),array(3),array(4),array(3),i%6);
for(const edge of [0,-0,NaN,Infinity,-Infinity,Number.MIN_VALUE,Number.MAX_VALUE]) for(let i=0;i<16;++i) {
  const a=array(16); a[i]=edge; check(a,array(16),[edge,0,-0],[edge,1,0,-0],[edge,-0,1],i%6);
}
const nativeHits=__threeMathCounts();
for(let i=0;i<methods.length;++i) assert(nativeHits[i]>0,methods[i].join('.')+' native kernel hit');
function deep(a,b,what) {
  if(Array.isArray(a)) { assert(Array.isArray(b)&&a.length===b.length,what+' shape'); for(let i=0;i<a.length;++i) deep(a[i],b[i],what+' '+i); }
  else if(!Object.is(a,b)) throw Error(what+' '+a+' != '+b);
}
function scenario(name,fn,expectFallback=true) {
  function attempt(C) { const trace=[]; let value,error; try {value=fn(C,trace);} catch(e) {error=e.name;} return [trace,value,error]; }
  const before=__threeMathCounts().slice(11).reduce((a,b)=>a+b,0);
  deep(attempt(JS),attempt(T),name);
  if(expectFallback) assert(__threeMathCounts().slice(11).reduce((a,b)=>a+b,0)>before,name+' fallback hit');
}
for(const mode of ['self-a','self-b','same-input','shared-elements']) scenario('matrix aliases '+mode,C=>{
  const a=new C.Matrix4().fromArray(Array.from({length:16},(_,i)=>i-4));
  const b=new C.Matrix4().fromArray(Array.from({length:16},(_,i)=>7-i)); let out=new C.Matrix4();
  if(mode==='self-a') out=a; if(mode==='self-b') out=b; if(mode==='shared-elements') out.elements=a.elements;
  out.multiplyMatrices(a,mode==='same-input'?a:b); return out.elements;
},false);
for(const mode of ['getter','proxy','proxy-array','sparse','frozen','nonwritable','array-proto']) scenario('matrix fallback '+mode,(C,trace)=>{
  let a=new C.Matrix4(),b=new C.Matrix4(),out=new C.Matrix4();
  if(mode==='getter') {const e=a.elements; Object.defineProperty(a,'elements',{get(){trace.push('elements');return e;}});}
  if(mode==='proxy') a=new Proxy(a,{get(o,k,r){trace.push('get '+String(k));return Reflect.get(o,k,r);},getPrototypeOf(o){trace.push('proto');return Reflect.getPrototypeOf(o);},getOwnPropertyDescriptor(o,k){trace.push('desc '+String(k));return Reflect.getOwnPropertyDescriptor(o,k);}});
  if(mode==='proxy-array') a.elements=new Proxy(a.elements,{get(o,k,r){trace.push('index '+String(k));return Reflect.get(o,k,r);},getPrototypeOf(o){trace.push('array proto');return Reflect.getPrototypeOf(o);}});
  if(mode==='sparse') delete a.elements[4];
  if(mode==='frozen') Object.freeze(out.elements);
  if(mode==='nonwritable') Object.defineProperty(out.elements,'4',{writable:false});
  if(mode==='array-proto') Object.setPrototypeOf(a.elements,new Proxy(Array.prototype,{get(o,k,r){trace.push('proto '+String(k));return Reflect.get(o,k,r);}}));
  let error; try {out.multiplyMatrices(a,b);} catch(e) {error=e.name;}
  return [out.elements.slice(),error];
});
scenario('compose late getter',(C,trace)=>{
  const out=new C.Matrix4(),position=new C.Vector3(2,3,4);
  Object.defineProperty(position,'x',{get(){trace.push(out.elements.slice(0,4).join(','));return 2;}});
  out.compose(position,new C.Quaternion(),new C.Vector3(3,4,5));return out.elements;
});
for(const name of ['setFromMatrix4','invert','transpose','set']) scenario('normal override '+name,(C,trace)=>{
  const out=new C.Matrix3(),original=out[name];out[name]=function(...args){trace.push(name);return original.apply(this,args);};
  return out.getNormalMatrix(new C.Matrix4().makeScale(0,2,3)).elements;
});
scenario('singular invert override',(C,trace)=>{const out=new C.Matrix4().makeScale(0,2,3),set=out.set;out.set=function(...args){trace.push('set');return set.apply(this,args);};out.invert();return out.elements;});
for(const type of ['Vector3','Vector4']) scenario(type+' getter exception',(C,trace)=>{
  const v=new C[type]();Object.defineProperty(v,'x',{get(){trace.push('x');throw Error('expected');}});v.applyMatrix4(new C.Matrix4());
});
scenario('sphere nested override',(C,trace)=>{
  const sphere=new C.Sphere(new C.Vector3(1,2,3),4);sphere.center.applyMatrix4=function(){trace.push('vector');this.x=5;return this;};
  sphere.applyMatrix4(new C.Matrix4().makeScale(2,3,4));return [...sphere.center.toArray(),sphere.radius];
});
scenario('sphere Math override',(C,trace)=>{
  const max=Math.max;Math.max=function(...args){trace.push('max');return max(...args);};
  try {const sphere=new C.Sphere(new C.Vector3(1,2,3),4).applyMatrix4(new C.Matrix4());return [...sphere.center.toArray(),sphere.radius];} finally {Math.max=max;}
});
for(const type of ['plane','dot']) scenario('frustum nested '+type,(C,trace)=>{
  const f=new C.Frustum();const owner=type==='plane'?f.planes[0]:f.planes[0].normal,name=type==='plane'?'distanceToPoint':'dot',original=owner[name];
  owner[name]=function(...args){trace.push(name);return original.apply(this,args);};return f.intersectsSphere(new C.Sphere(new C.Vector3(),1));
});
scenario('frustum computed sphere',(C,trace)=>{
  const object=new C.Mesh(new C.BufferGeometry());object.geometry.computeBoundingSphere=function(){trace.push('compute');this.boundingSphere=new C.Sphere(new C.Vector3(1,2,3),4);};
  return new C.Frustum().intersectsObject(object);
});
scenario('frustum own computed sphere',(C,trace)=>{
  const object=new C.InstancedMesh(new C.BufferGeometry(),undefined,1);object.computeBoundingSphere=function(){trace.push('own compute');this.boundingSphere=new C.Sphere(new C.Vector3(1,2,3),4);};
  return new C.Frustum().intersectsObject(object);
});
scenario('escaped scratch alias',(C,trace)=>{
  const f=new C.Frustum(),object=new C.Mesh(new C.BufferGeometry());object.geometry.boundingSphere=new C.Sphere(new C.Vector3(1,2,3),4);
  let escaped;const original=f.intersectsSphere;f.intersectsSphere=function(sphere){escaped=sphere;trace.push('capture');return original.call(this,sphere);};
  f.intersectsObject(object);f.intersectsSphere=original;f.planes[0].normal=escaped.center;
  object.matrixWorld.makeTranslation(10,20,30);const result=f.intersectsObject(object);
  return [result,escaped.center.toArray(),escaped.radius];
});
scenario('update compose override',(C,trace)=>{
  const object=new C.Object3D(),compose=object.matrix.compose;object.matrix.compose=function(...args){trace.push('compose');return compose.apply(this,args);};
  object.position.set(2,3,4);object.matrixWorldNeedsUpdate=false;const result=object.updateMatrix();return [result,object.matrix.elements,object.matrixWorldNeedsUpdate];
});
scenario('update pivot getter',(C,trace)=>{
  const object=new C.Object3D();object.position.set(2,3,4);
  if('pivot' in object) Object.defineProperty(object,'pivot',{get(){trace.push(object.matrix.elements.slice(12,15));return new C.Vector3(1,2,3);}});
  object.updateMatrix();return object.matrix.elements;
},'pivot' in new T.Object3D());
scenario('update frozen flag',(C,trace)=>{
  const object=new C.Object3D();object.position.set(2,3,4);Object.freeze(object);let error;
  try{object.updateMatrix();}catch(e){error=e.name;}return [error,object.matrix.elements];
});
for(const mode of ['false','true','undefined','object','getter','throw','frozen','math']) scenario('quaternion '+mode,(C,trace)=>{
  const q=new C.Quaternion(),e=new C.Euler(1,2,3);q._onChange(function(){trace.push(q.toArray());if(mode==='throw')throw Error('expected');});
  if(mode==='getter') {const callback=q._onChangeCallback;Object.defineProperty(q,'_onChangeCallback',{get(){trace.push('callback getter',q.toArray());return callback;}});}
  if(mode==='frozen') Object.defineProperty(q,'_y',{writable:false});
  const sin=Math.sin;if(mode==='math')Math.sin=function(x){trace.push('sin');return sin(x);};
  let error;try{q.setFromEuler(e,mode==='false'?false:mode==='object'?{valueOf(){trace.push('valueOf');return true;}}:mode==='undefined'?undefined:true);}catch(e){error=e.name;}finally{Math.sin=sin;}
  return [error,q.toArray()];
},['getter','frozen','math'].includes(mode));

scenario('numeric coercion fallback',(C,trace)=>{
  const a=new C.Matrix4(),out=new C.Matrix4();a.elements[0]={valueOf(){trace.push('valueOf');return 2;}};
  out.multiplyMatrices(a,new C.Matrix4());return out.elements;
});
scenario('compose missing position partial mutation',C=>{
  const m=new C.Matrix4().makeScale(7,8,9);let error;
  try{m.compose(undefined,new C.Quaternion(),new C.Vector3(2,3,4));}catch(e){error=e.name;}
  return [error,m.elements];
});
scenario('normal overridden return',(C,trace)=>{
  const m=new C.Matrix3(),other=new C.Matrix3().set(1,2,3,4,5,6,7,8,9);
  m.invert=function(){trace.push('other');return other;};const result=m.getNormalMatrix(new C.Matrix4());
  return [result===other,result.elements,m.elements];
});
scenario('frustum overridden return',(C,trace)=>{
  const f=new C.Frustum(),object=new C.Mesh(new C.BufferGeometry());object.geometry.boundingSphere=new C.Sphere(new C.Vector3(1,2,3),4);
  f.intersectsSphere=function(sphere){trace.push(sphere.center.toArray());return 'custom';};return f.intersectsObject(object);
});
scenario('frustum compute exception',(C,trace)=>{
  const object=new C.Mesh(new C.BufferGeometry());object.geometry.computeBoundingSphere=function(){trace.push('compute throws');throw Error('expected');};
  new C.Frustum().intersectsObject(object);
});
for(const order of ['BAD','XYZ'+String.fromCharCode(0)+'BAD']) scenario('quaternion unknown order '+order.length,(C,trace)=>{
  const previous=globalThis.console;globalThis.console={warn(...args){trace.push(args);}};
  try{const q=new C.Quaternion();q._onChange(()=>trace.push('change'));q.setFromEuler(new C.Euler(1,2,3,order));return q.toArray();}
  finally{if(previous===undefined)delete globalThis.console;else globalThis.console=previous;}
});
