// Guarded accelerators for unchanged three.js releases; arithmetic is upstream MIT.
#include "qjs_math.h"
#include "qjs_math_kernels.h"
#include "zn/js_ext.h"
#include "quickjs.h"
#include "zn/jsmath.h"
extern "C" {
#include "sha256/sha256.h"
}
#include <array>
#include <cstdlib>
#include <cstring>

namespace zn::three {
namespace {
enum Method { Multiply, Compose, Invert, Normal, Vec3, Vec4, SphereApply,
              FrustumSphere, FrustumObject, QuaternionEuler, ObjectMatrix, MethodCount };
enum Slot { ObjectProto, ArrayProto, MathObject, Sin, Cos, Sqrt, Max,
  Matrix4Proto, Matrix3Proto, Vector3Proto, Vector4Proto, SphereProto, FrustumProto,
  QuaternionProto, EulerProto, Object3DProto, PlaneProto, Scratch, ObjectProtos, Version,
  Matrix4Set, Matrix3Set, Matrix3From, Matrix3Invert, Matrix3Transpose,
  Vector3Copy, Vector3Dot, SphereCopy, PlaneDistance, MatrixMaxScale,
  Methods, SlotCount = Methods + MethodCount };
#ifdef ZN_THREE_MATH_TEST
std::array<unsigned,MethodCount> fastCalls{}, fallbackCalls{};
#define MATH_HIT() (++fastCalls[method])
#define MATH_MISS() (++fallbackCalls[method])
JSValue counts(JSContext* ctx,JSValueConst,int,JSValueConst*) {
  JSValue result=JS_NewArray(ctx);
  for (unsigned i=0;i<MethodCount;++i) {
    JS_SetPropertyUint32(ctx,result,i,JS_NewUint32(ctx,fastCalls[i]));
    JS_SetPropertyUint32(ctx,result,i+MethodCount,JS_NewUint32(ctx,fallbackCalls[i]));
  }
  return result;
}
#else
#define MATH_HIT() ((void)0)
#define MATH_MISS() ((void)0)
#endif
struct Definition { Slot proto; const char* name; int argc; };
constexpr Definition definitions[] = {
  {Matrix4Proto,"multiplyMatrices",2}, {Matrix4Proto,"compose",3}, {Matrix4Proto,"invert",0},
  {Matrix3Proto,"getNormalMatrix",1}, {Vector3Proto,"applyMatrix4",1}, {Vector4Proto,"applyMatrix4",1},
  {SphereProto,"applyMatrix4",1}, {FrustumProto,"intersectsSphere",1}, {FrustumProto,"intersectsObject",1},
  {QuaternionProto,"setFromEuler",1}, {Object3DProto,"updateMatrix",0}
};
constexpr const char* xyz[] = {"x","y","z","w"};
constexpr const char* xyzw[] = {"_x","_y","_z","_w"};
bool enabled() { const char* value=std::getenv("ZINC_JS_ACCEL"); return !value || std::strcmp(value,"0"); }
bool equal(JSValueConst a, JSValueConst b) {
  if (JS_IsUndefined(a) && JS_IsUndefined(b)) return true;
  return JS_IsObject(a) && JS_IsObject(b) && JS_VALUE_GET_PTR(a)==JS_VALUE_GET_PTR(b);
}
// The class check comes before every reflective API: Proxy/exotic traps never run.
struct Guard {
  JSContext* ctx;
  const std::array<JSValue,SlotCount>& s;
  bool error=false;
  bool plain(JSValueConst value) { return JS_IsObject(value) && JS_GetClassID(value)==JS_GetClassID(s[ObjectProto]); }
  bool proto(JSValueConst value, Slot expected) {
    if (!plain(value)) return false;
    JSValue p=JS_GetPrototype(ctx,value);
    bool ok=equal(p,s[expected]); JS_FreeValue(ctx,p); return ok;
  }
  bool own(JSValueConst object,const char* name,JSValue& value,bool writable=false,bool* exists=nullptr) {
    if (!plain(object)) return false;
    JSAtom atom=JS_NewAtom(ctx,name);
    if (atom==JS_ATOM_NULL) { error=true; return false; }
    JSPropertyDescriptor desc;
    int found=JS_GetOwnProperty(ctx,&desc,object,atom); JS_FreeAtom(ctx,atom);
    if (exists) *exists=found>0;
    if (found<0) error=true;
    if (found<=0) return false;
    const bool ok=!(desc.flags&JS_PROP_GETSET) && (!writable || (desc.flags&JS_PROP_WRITABLE));
    // Own data stays retained by its object; no callback runs before guarded writes.
    value=desc.value;
    JS_FreeValue(ctx,desc.value); JS_FreeValue(ctx,desc.getter); JS_FreeValue(ctx,desc.setter);
    return ok;
  }
  bool method(JSValueConst object,const char* name,JSValueConst expected) {
    if (!plain(object)) return false;
    JSValue current=JS_DupValue(ctx,object);
    for (int depth=0; depth<8 && plain(current); ++depth) {
      JSAtom atom=JS_NewAtom(ctx,name); JSPropertyDescriptor desc;
      if (atom==JS_ATOM_NULL) { error=true; JS_FreeValue(ctx,current); return false; }
      int found=JS_GetOwnProperty(ctx,&desc,current,atom); JS_FreeAtom(ctx,atom);
      if (found<0) error=true;
      if (found>0) {
        bool ok=!(desc.flags&JS_PROP_GETSET) && equal(desc.value,expected);
        JS_FreeValue(ctx,desc.value); JS_FreeValue(ctx,desc.getter); JS_FreeValue(ctx,desc.setter);
        JS_FreeValue(ctx,current); return ok;
      }
      if (found<0) break;
      JSValue next=JS_GetPrototype(ctx,current); JS_FreeValue(ctx,current); current=next;
    }
    bool absent=JS_IsNull(current) && JS_IsUndefined(expected);
    JS_FreeValue(ctx,current); return absent;
  }
  bool number(JSValueConst object,const char* name,double& out,bool writable=false) {
    JSValue value;
    if (!own(object,name,value,writable) || !JS_IsNumber(value)) return false;
    return JS_ToFloat64(ctx,&out,value)==0;
  }
  bool vector(JSValueConst object,Slot expected,double* out,int n,bool writable=false,bool quaternion=false) {
    if (!proto(object,expected)) return false;
    for (int i=0; i<n; ++i) if (!number(object,quaternion?xyzw[i]:xyz[i],out[i],writable)) return false;
    return true;
  }
  bool array(JSValueConst object,int count,double* out,bool writable=false) {
    if (!JS_IsObject(object) || JS_GetClassID(object)!=JS_GetClassID(s[ArrayProto])) return false;
    JSValue p=JS_GetPrototype(ctx,object); bool ok=equal(p,s[ArrayProto]); JS_FreeValue(ctx,p);
    if (!ok) return false;
    // No borrowed pointer crosses a reflective API or a setter.
    {
      JSValue* values; uint32_t length;
      if (!JS_GetFastArray(object,&values,&length) || length!=static_cast<uint32_t>(count)) return false;
      for (int i=0; i<count; ++i) {
        if (!JS_IsNumber(values[i])) return false;
        if (out && JS_ToFloat64(ctx,&out[i],values[i])) return false;
      }
    }
    JSValue length=JS_GetPropertyStr(ctx,object,"length"); uint32_t n=0;
    if (JS_IsException(length)) { error=true; return false; }
    JS_ToUint32(ctx,&n,length); JS_FreeValue(ctx,length);
    if (n!=static_cast<uint32_t>(count)) return false;
    if (writable) for (int i=0; i<count; ++i) {
      JSAtom atom=JS_NewAtomUInt32(ctx,static_cast<uint32_t>(i)); JSPropertyDescriptor desc;
      int found=JS_GetOwnProperty(ctx,&desc,object,atom); JS_FreeAtom(ctx,atom);
      if (found<0) error=true;
      if (found<=0) return false;
      ok=!(desc.flags&JS_PROP_GETSET) && (desc.flags&JS_PROP_WRITABLE);
      JS_FreeValue(ctx,desc.value); JS_FreeValue(ctx,desc.getter); JS_FreeValue(ctx,desc.setter);
      if (!ok) return false;
    }
    return true;
  }
  bool matrix(JSValueConst object,Slot expected,int count,double* out,JSValue& elements,bool writable=false) {
    return proto(object,expected) && own(object,"elements",elements) && array(elements,count,out,writable);
  }
  bool sphere(JSValueConst object,double* out,JSValue& center,bool writable=false) {
    return proto(object,SphereProto) && own(object,"center",center) && vector(center,Vector3Proto,out,3,writable)
      && number(object,"radius",out[3],writable);
  }
  bool math() {
    JSValue global=JS_GetGlobalObject(ctx), object;
    bool ok=own(global,"Math",object) && equal(object,s[MathObject])
      && method(object,"sqrt",s[Sqrt]) && method(object,"max",s[Max]);
    JS_FreeValue(ctx,global); return ok;
  }
  bool planeData(JSValueConst object,double* out,JSValue scratchCenter=JS_UNDEFINED) {
    JSValue planes;
    if (!proto(object,FrustumProto) || !own(object,"planes",planes)
      || !JS_IsObject(planes) || JS_GetClassID(planes)!=JS_GetClassID(s[ArrayProto])) return false;
    JSValue arrayProto=JS_GetPrototype(ctx,planes);
    bool canonical=equal(arrayProto,s[ArrayProto]); JS_FreeValue(ctx,arrayProto);
    if (!canonical) return false;
    std::array<JSValue,6> entries;
    {
      JSValue* values; uint32_t length;
      if (!JS_GetFastArray(planes,&values,&length) || length!=6) return false;
      std::copy_n(values,6,entries.begin());
    }
    for (int i=0; i<6; ++i) {
      JSValue normal;
      if (!proto(entries[i],PlaneProto) || !own(entries[i],"normal",normal) || equal(normal,scratchCenter)
        || !vector(normal,Vector3Proto,out+i*4,3) || !number(entries[i],"constant",out[i*4+3])
        || !method(entries[i],"distanceToPoint",s[PlaneDistance]) || !method(normal,"dot",s[Vector3Dot])) return false;
    }
    return true;
  }
  bool object3D(JSValueConst object) {
    if (!plain(object)) return false;
    JSValue p=JS_GetPrototype(ctx,object);
    JSValue* list; uint32_t n;
    bool ok=false;
    if (JS_GetFastArray(s[ObjectProtos],&list,&n)) for (uint32_t i=0;i<n;++i) if (equal(p,list[i])) { ok=true; break; }
    JS_FreeValue(ctx,p); return ok;
  }
};
bool writeArray(JSContext* ctx,JSValueConst object,const double* values,int n) {
  for (int i=0;i<n;++i) if (JS_SetPropertyUint32(ctx,object,i,JS_NewFloat64(ctx,values[i]))<0) return false;
  return true;
}
bool writeVector(JSContext* ctx,JSValueConst object,const double* values,int n,bool quaternion=false) {
  for (int i=0;i<n;++i) if (JS_SetPropertyStr(ctx,object,quaternion?xyzw[i]:xyz[i],JS_NewFloat64(ctx,values[i]))<0) return false;
  return true;
}
JSValue accelerated(JSContext* ctx,JSValueConst self,int argc,JSValueConst* argv,int method,JSValue* data) {
  std::array<JSValue,SlotCount> state;
  {
    JSValue* values; uint32_t n;
    if (!JS_GetFastArray(data[1],&values,&n) || n!=SlotCount) return JS_ThrowInternalError(ctx,"accelerator state");
    std::copy_n(values,SlotCount,state.begin());
  }
  Guard g{ctx,state};
  auto fallback=[&]() { if (g.error) return JS_EXCEPTION; MATH_MISS(); return JS_Call(ctx,data[0],self,argc,argv); };
  auto arg=[&](int i) { return i<argc?argv[i]:JS_UNDEFINED; };
  double a[24]{},b[24]{},c[16]{},out[16]{}; JSValue dest=JS_UNDEFINED,unused,center;
  int version=JS_VALUE_GET_INT(state[Version]);
  using namespace math;
  switch (method) {
    case Multiply:
      if (!g.matrix(self,Matrix4Proto,16,nullptr,dest,true) || !g.matrix(arg(0),Matrix4Proto,16,a,unused)
        || !g.matrix(arg(1),Matrix4Proto,16,b,unused)) return fallback();
      MATH_HIT(); multiply(out,a,b); break;
    case Compose:
      if (!g.matrix(self,Matrix4Proto,16,nullptr,dest,true) || !g.vector(arg(0),Vector3Proto,a,3)
        || !g.vector(arg(1),QuaternionProto,b,4,false,true) || !g.vector(arg(2),Vector3Proto,c,3)) return fallback();
      MATH_HIT(); compose(out,a,b,c); break;
    case Invert:
      if (!g.matrix(self,Matrix4Proto,16,a,dest,true) || !g.method(self,"set",state[Matrix4Set])) return fallback();
      MATH_HIT(); if (version==162) invert162(out,a); else invert186(out,a); break;
    case Normal:
      if (!g.matrix(self,Matrix3Proto,9,nullptr,dest,true) || !g.matrix(arg(0),Matrix4Proto,16,a,unused)
        || !g.method(self,"setFromMatrix4",state[Matrix3From]) || !g.method(self,"invert",state[Matrix3Invert])
        || !g.method(self,"transpose",state[Matrix3Transpose]) || !g.method(self,"set",state[Matrix3Set])) return fallback();
      MATH_HIT(); normal(out,a);
      if (!writeArray(ctx,dest,out,9)) return JS_EXCEPTION;
      return JS_DupValue(ctx,self);
    case Vec3: case Vec4: {
      int n=method==Vec3?3:4;
      if (!g.vector(self,method==Vec3?Vector3Proto:Vector4Proto,a,n,true) || !g.matrix(arg(0),Matrix4Proto,16,b,unused)) return fallback();
      MATH_HIT(); if (method==Vec3) vector3(out,a,b); else vector4(out,a,b);
      if (!writeVector(ctx,self,out,n)) return JS_EXCEPTION;
      return JS_DupValue(ctx,self);
    }
    case SphereApply:
      if (!g.sphere(self,a,center,true) || !g.matrix(arg(0),Matrix4Proto,16,b,unused) || !g.math()
        || !g.method(center,"applyMatrix4",state[Methods+Vec3]) || !g.method(arg(0),"getMaxScaleOnAxis",state[MatrixMaxScale])) return fallback();
      MATH_HIT(); sphere(out,a,b);
      if (!writeVector(ctx,center,out,3) || JS_SetPropertyStr(ctx,self,"radius",JS_NewFloat64(ctx,out[3]))<0) return JS_EXCEPTION;
      return JS_DupValue(ctx,self);
    case FrustumSphere:
      if (!g.planeData(self,a) || !g.sphere(arg(0),b,center)) return fallback();
      MATH_HIT(); return JS_NewBool(ctx,intersects(a,b));
    case FrustumObject: {
      JSValue source,geometry,matrix,scratchCenter;
      if (!g.object3D(arg(0))) return fallback();
      // Own optional boundingSphere is used by InstancedMesh; ordinary Mesh uses geometry.
      bool exists=false;
      if (!g.own(arg(0),"boundingSphere",source,false,&exists)) {
        if (exists || g.error || !g.own(arg(0),"geometry",geometry) || !g.own(geometry,"boundingSphere",source)) return fallback();
        // An inherited accessor/property must stay on the original path.
        bool absent=g.method(arg(0),"boundingSphere",JS_UNDEFINED);
        if (!absent) return fallback();
      }
      if (!g.sphere(source,b,center) || !g.own(arg(0),"matrixWorld",matrix) || !g.matrix(matrix,Matrix4Proto,16,c,unused)
        || !g.sphere(state[Scratch],out,scratchCenter,true) || !g.planeData(self,a,scratchCenter) || !g.math()
        || !g.method(self,"intersectsSphere",state[Methods+FrustumSphere]) || !g.method(state[Scratch],"copy",state[SphereCopy])
        || !g.method(state[Scratch],"applyMatrix4",state[Methods+SphereApply]) || !g.method(scratchCenter,"copy",state[Vector3Copy])
        || !g.method(scratchCenter,"applyMatrix4",state[Methods+Vec3]) || !g.method(matrix,"getMaxScaleOnAxis",state[MatrixMaxScale])) return fallback();
      MATH_HIT(); sphere(out,b,c);
      if (!writeVector(ctx,scratchCenter,out,3) || JS_SetPropertyStr(ctx,state[Scratch],"radius",JS_NewFloat64(ctx,out[3]))<0) return JS_EXCEPTION;
      return JS_NewBool(ctx,intersects(a,out));
    }
    case QuaternionEuler: {
      JSValue order,callback,global=JS_GetGlobalObject(ctx),mathObject;
      bool intrinsics=g.own(global,"Math",mathObject) && equal(mathObject,state[MathObject])
        && g.method(mathObject,"sin",state[Sin]) && g.method(mathObject,"cos",state[Cos]);
      JS_FreeValue(ctx,global);
      if (!intrinsics || !g.vector(self,QuaternionProto,out,4,true,true) || !g.proto(arg(0),EulerProto)
        || !g.number(arg(0),"_x",a[0]) || !g.number(arg(0),"_y",a[1]) || !g.number(arg(0),"_z",a[2])
        || !g.own(arg(0),"_order",order) || !JS_IsString(order)) return fallback();
      size_t length=0;
      const char* text=JS_ToCStringLen(ctx,&length,order); if (!text) return JS_EXCEPTION;
      constexpr const char* orders[]={"XYZ","YXZ","ZXY","ZYX","YZX","XZY"}; int k=0;
      while (k<6 && (length!=3 || std::memcmp(text,orders[k],3))) ++k;
      JS_FreeCString(ctx,text); if (k==6) return fallback();
      bool update=argc<2 || JS_IsUndefined(arg(1)) || (JS_IsBool(arg(1)) && JS_VALUE_GET_BOOL(arg(1)));
      if (update) {
        // This property may be inherited, but accessors must execute after mutation in JS.
        JSValue owner=JS_DupValue(ctx,self); bool found=false;
        for (int depth=0;depth<3 && g.plain(owner);++depth) {
          bool exists=false;
          if (g.own(owner,"_onChangeCallback",callback,false,&exists)) { found=true; break; }
          if (exists || g.error) break;
          JSValue next=JS_GetPrototype(ctx,owner); JS_FreeValue(ctx,owner); owner=next;
        }
        JS_FreeValue(ctx,owner);
        if (!found || !JS_IsFunction(ctx,callback)) return fallback();
      }
      for (int i=0;i<3;++i) b[i]=zn_js_cos(a[i]/2);
      for (int i=0;i<3;++i) c[i]=zn_js_sin(a[i]/2);
      MATH_HIT(); quaternion(out,static_cast<Euler>(k),b,c);
      if (!writeVector(ctx,self,out,4,true)) return JS_EXCEPTION;
      if (update) {
        JSValue function=JS_DupValue(ctx,callback),result=JS_Call(ctx,function,self,0,nullptr);
        JS_FreeValue(ctx,function); if (JS_IsException(result)) return result; JS_FreeValue(ctx,result);
      }
      return JS_DupValue(ctx,self);
    }
    case ObjectMatrix: {
      JSValue matrix,position,q,scale,flag,pivotObject;
      if (!g.object3D(self) || !g.own(self,"matrix",matrix) || !g.matrix(matrix,Matrix4Proto,16,nullptr,dest,true)
        || !g.method(matrix,"compose",state[Methods+Compose]) || !g.own(self,"position",position) || !g.vector(position,Vector3Proto,a,3)
        || !g.own(self,"quaternion",q) || !g.vector(q,QuaternionProto,b,4,false,true)
        || !g.own(self,"scale",scale) || !g.vector(scale,Vector3Proto,c,3) || !g.own(self,"matrixWorldNeedsUpdate",flag,true)) return fallback();
      bool hasPivot=false; double pv[3];
      if (version==186) {
        if (!g.own(self,"pivot",pivotObject)) return fallback();
        hasPivot=!JS_IsNull(pivotObject);
        if (hasPivot && !g.vector(pivotObject,Vector3Proto,pv,3)) return fallback();
      }
      MATH_HIT(); compose(out,a,b,c); if (hasPivot) pivot(out,pv);
      if (!writeArray(ctx,dest,out,16) || JS_SetPropertyStr(ctx,self,"matrixWorldNeedsUpdate",JS_TRUE)<0) return JS_EXCEPTION;
      return JS_UNDEFINED;
    }
    default: return JS_ThrowInternalError(ctx,"accelerator method");
  }
  if (!writeArray(ctx,dest,out,16)) return JS_EXCEPTION;
  return JS_DupValue(ctx,self);
}
JSValue install(JSContext* ctx,JSValueConst,int argc,JSValueConst* argv,int,JSValue* capabilities) {
  if (!enabled()) return JS_UNDEFINED;
  int version=0;
  if (argc!=2 || !JS_IsNumber(argv[0]) || JS_ToInt32(ctx,&version,argv[0]) || (version!=162 && version!=186))
    return JS_ThrowTypeError(ctx,"accelerator release");
  JSValue state=JS_NewArray(ctx);
  auto put=[&](int index,JSValue value) { return JS_SetPropertyUint32(ctx,state,index,value)>=0; };
  bool ok=true;
  for (int i=ObjectProto;i<=Max;++i) ok=put(i,JS_DupValue(ctx,capabilities[i])) && ok;
  for (int i=0;i<10;++i) {
    JSValue constructor=JS_GetPropertyUint32(ctx,argv[1],i);
    JSValue proto=JS_GetPropertyStr(ctx,constructor,"prototype"); JS_FreeValue(ctx,constructor);
    if (JS_IsException(proto) || !JS_IsObject(proto)) { JS_FreeValue(ctx,proto); JS_FreeValue(ctx,state); return JS_ThrowTypeError(ctx,"accelerator prototype"); }
    ok=put(Matrix4Proto+i,proto) && ok;
  }
  ok=put(Scratch,JS_GetPropertyUint32(ctx,argv[1],10)) && ok;
  ok=put(ObjectProtos,JS_GetPropertyUint32(ctx,argv[1],11)) && ok;
  ok=put(Version,JS_NewInt32(ctx,version)) && ok;
  struct Extra { Slot slot,proto; const char* name; };
  constexpr Extra extras[] = {
    {Matrix4Set,Matrix4Proto,"set"}, {Matrix3Set,Matrix3Proto,"set"}, {Matrix3From,Matrix3Proto,"setFromMatrix4"},
    {Matrix3Invert,Matrix3Proto,"invert"}, {Matrix3Transpose,Matrix3Proto,"transpose"},
    {Vector3Copy,Vector3Proto,"copy"}, {Vector3Dot,Vector3Proto,"dot"}, {SphereCopy,SphereProto,"copy"},
    {PlaneDistance,PlaneProto,"distanceToPoint"}, {MatrixMaxScale,Matrix4Proto,"getMaxScaleOnAxis"}
  };
  for (const auto& extra:extras) {
    JSValue proto=JS_GetPropertyUint32(ctx,state,extra.proto);
    ok=put(extra.slot,JS_GetPropertyStr(ctx,proto,extra.name)) && ok; JS_FreeValue(ctx,proto);
  }
  for (int i=0;i<MethodCount;++i) {
    JSValue proto=JS_GetPropertyUint32(ctx,state,definitions[i].proto);
    ok=put(Methods+i,JS_GetPropertyStr(ctx,proto,definitions[i].name)) && ok; JS_FreeValue(ctx,proto);
  }
  if (!ok) { JS_FreeValue(ctx,state); return JS_EXCEPTION; }
  for (int i=0;i<MethodCount;++i) {
    JSValue proto=JS_GetPropertyUint32(ctx,state,definitions[i].proto),original=JS_GetPropertyUint32(ctx,state,Methods+i);
    JSValue data[]={original,state};
    JSValue function=JS_NewCFunctionData2(ctx,accelerated,definitions[i].name,definitions[i].argc,i,2,data);
    JS_FreeValue(ctx,original);
    if (JS_IsException(function)) { JS_FreeValue(ctx,proto); JS_FreeValue(ctx,state); return function; }
    bool saved=put(Methods+i,JS_DupValue(ctx,function));
    int result=JS_SetPropertyStr(ctx,proto,definitions[i].name,function); JS_FreeValue(ctx,proto);
    if (!saved || result<0) { JS_FreeValue(ctx,state); return JS_EXCEPTION; }
  }
  JS_FreeValue(ctx,state); return JS_UNDEFINED;
}
std::string digest(const std::string& text) {
  SHA256_CTX ctx; sha256_init(&ctx); sha256_update(&ctx,reinterpret_cast<const BYTE*>(text.data()),text.size());
  BYTE bytes[SHA256_BLOCK_SIZE]; sha256_final(&ctx,bytes);
  constexpr char hex[]="0123456789abcdef"; std::string result;
  for (BYTE b:bytes) { result+=hex[b>>4]; result+=hex[b&15]; }
  return result;
}
}  // namespace
void mathContext(JSContext* ctx) {
  if (!enabled()) return;
  JSValue global=JS_GetGlobalObject(ctx),object=JS_NewObject(ctx),array=JS_NewArray(ctx);
  JSValue caps[]={JS_GetPrototype(ctx,object),JS_GetPrototype(ctx,array),JS_GetPropertyStr(ctx,global,"Math"),JS_UNDEFINED,JS_UNDEFINED,JS_UNDEFINED,JS_UNDEFINED};
  const char* names[]={"sin","cos","sqrt","max"};
  for (int i=0;i<4;++i) caps[Sin+i]=JS_GetPropertyStr(ctx,caps[MathObject],names[i]);
  JSValue function=JS_NewCFunctionData2(ctx,install,"__zincThreeMath",2,0,7,caps);
  JS_DefinePropertyValueStr(ctx,global,"__zincThreeMath",function,0);
#ifdef ZN_THREE_MATH_TEST
  JS_SetPropertyStr(ctx,global,"__threeMathCounts",JS_NewCFunction(ctx,counts,"counts",0));
#endif
  for (JSValue value:caps) JS_FreeValue(ctx,value);
  JS_FreeValue(ctx,object); JS_FreeValue(ctx,array); JS_FreeValue(ctx,global);
}
void mathSource(std::string& source) {
  if (!enabled()) return;
  // Exact upstream content only: no version-string heuristic or vendor modification.
  struct Pin { std::size_t size; const char* sha; int version; const char* scratch; };
  constexpr Pin pins[]={
    {1458113,"9edde002b066a9a05676a6127f67735b62baf399bdea529f2f7e31657da769e6",186,"_sphere$3"},
    {1285851,"ec3ddc3897ec75288b5502057456c471c2eb7d6e7cf36140d0a5224e94a1984b",162,"_sphere$5"},
  };
  for (const Pin& pin:pins) if (source.size()==pin.size && digest(source)==pin.sha) {
    source+="\nif (typeof globalThis.__zincThreeMath === 'function') globalThis.__zincThreeMath(";
    source+=std::to_string(pin.version);
    source+=",[Matrix4,Matrix3,Vector3,Vector4,Sphere,Frustum,Quaternion,Euler,Object3D,Plane,";
    source+=pin.scratch;
    source+=",[Object3D.prototype,Mesh.prototype,InstancedMesh.prototype,SkinnedMesh.prototype,Line.prototype,LineLoop.prototype,LineSegments.prototype,Points.prototype,Sprite.prototype,Group.prototype,Scene.prototype,Camera.prototype,PerspectiveCamera.prototype,OrthographicCamera.prototype,Light.prototype,AmbientLight.prototype,DirectionalLight.prototype,PointLight.prototype,SpotLight.prototype,HemisphereLight.prototype,RectAreaLight.prototype,LOD.prototype,Bone.prototype]]);\n";
    return;
  }
}
}  // namespace zn::three

namespace zn::qjs {
void libraryHooks(ContextHook& context, SourceHook& source) {
  context=[](napi_env env) { if (env) zn::three::mathContext(contextOf(env)); };
  source=zn::three::mathSource;
}
}  // namespace zn::qjs
