// Standalone production binding proof; shared RegExp callbacks match Zinc startup.
#include "plugins/three/native/qjs_math.h"
#include "zn/js_ext.h"
#include "quickjs.h"
#include "zn/jsmath.h"
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <string>

extern "C" {
void zn_lre_delegate(void* (*)(void*,void*,size_t),int (*)(void*),bool (*)(void*,size_t));
void* qjs_lre_realloc(void*,void*,size_t);
int qjs_lre_check_timeout(void*);
bool qjs_lre_check_stack_overflow(void*,size_t);
}

static bool eval(JSContext* ctx, const std::string& source, const char* file, int mode) {
  JSValue r=JS_Eval(ctx, source.c_str(), source.size(), file, mode);
  const bool ok=!JS_IsException(r);
  if (!ok) {
    JSValue e=JS_GetException(ctx), stack=JS_GetPropertyStr(ctx,e,"stack");
    const char* msg=JS_ToCString(ctx,e); const char* trace=JS_ToCString(ctx,stack);
    std::fprintf(stderr,"%s\n%s\n",msg?msg:"exception",trace?trace:"");
    JS_FreeCString(ctx,msg); JS_FreeCString(ctx,trace); JS_FreeValue(ctx,e); JS_FreeValue(ctx,stack);
  }
  JS_FreeValue(ctx,r); return ok;
}
static std::string read(const char* file) {
  std::ifstream in(file, std::ios::binary);
  return {std::istreambuf_iterator<char>(in),{}};
}
int main(int argc,char** argv) {
  if (argc!=4 && argc!=5) return 2;
  zn_lre_delegate(qjs_lre_realloc,qjs_lre_check_timeout,qjs_lre_check_stack_overflow);
  JSRuntime* rt=JS_NewRuntime(); JS_SetMemoryLimit(rt,128*1024*1024);
  JSContext* ctx=JS_NewContext(rt); const int version=std::stoi(argv[3]);
  const std::string priorFlag=std::getenv("ZINC_JS_ACCEL")?std::getenv("ZINC_JS_ACCEL"):"";
  const bool hadFlag=std::getenv("ZINC_JS_ACCEL")!=nullptr;
  setenv("ZINC_JS_ACCEL","0",1);
  zn::three::mathContext(ctx);
  JSValue disabledGlobal=JS_GetGlobalObject(ctx),disabledFunction=JS_GetPropertyStr(ctx,disabledGlobal,"__zincThreeMath");
  const bool absent=JS_IsUndefined(disabledFunction);
  JS_FreeValue(ctx,disabledFunction); JS_FreeValue(ctx,disabledGlobal);
  if (!absent) return 5;
  std::string disabledSource=read(argv[1]);
  zn::three::mathSource(disabledSource);
  if (disabledSource!=read(argv[1])) return 6;
  setenv("ZINC_JS_ACCEL","1",1);
  zn::three::mathContext(ctx);
  JSValue global=JS_GetGlobalObject(ctx);
  JS_SetPropertyStr(ctx,global,"CASES",JS_NewInt32(ctx,argc==5?std::stoi(argv[4]):1000));
  JS_FreeValue(ctx,global);
  const std::string original=read(argv[1]);
  std::string native=original;
  zn::three::mathSource(native);
  if (native==original) return 3;
  std::string modified=original+"\n";
  zn::three::mathSource(modified);
  if (modified!=original+"\n") return 4;
  std::string sameLength=original;
  sameLength[100]^=1;
  const std::string changed=sameLength;
  zn::three::mathSource(sameLength);
  if (sameLength!=changed) return 7;
  zn::qjs::addContextHook([](napi_env) {}, [](std::string& text) { text+='\n'; });
  std::string transformed=original;
  zn::qjs::runSourceHooks(transformed);
  if(transformed!=original+"\n") return 8;
  const std::string exports="={Matrix4,Matrix3,Vector3,Vector4,Sphere,Frustum,Quaternion,Object3D,Euler,Plane,Mesh,InstancedMesh,BufferGeometry};";
  const bool ok=eval(ctx,original+"\nglobalThis.JS"+exports,"baseline.mjs",JS_EVAL_TYPE_MODULE)
    && eval(ctx,native+"\nglobalThis.T"+exports,"accelerated.mjs",JS_EVAL_TYPE_MODULE)
    && eval(ctx,read(argv[2]),argv[2],JS_EVAL_TYPE_GLOBAL);
  // An already transformed bundle remains ordinary JS when the native binding is absent.
  setenv("ZINC_JS_ACCEL","0",1);
  JSContext* disabled=JS_NewContext(rt);
  zn::three::mathContext(disabled);
  const bool off=eval(disabled,native+"\nglobalThis.T"+exports,"disabled.mjs",JS_EVAL_TYPE_MODULE)
    && eval(disabled,"if(T.Matrix4.prototype.multiplyMatrices.toString().includes('[native code]'))throw Error('disabled'); if(new T.Matrix4().multiplyMatrices(new T.Matrix4(),new T.Matrix4()).elements[0]!==1)throw Error('disabled result');","disabled.js",JS_EVAL_TYPE_GLOBAL);
  JS_FreeContext(disabled);
  if(hadFlag) setenv("ZINC_JS_ACCEL",priorFlag.c_str(),1); else unsetenv("ZINC_JS_ACCEL");
  JS_FreeContext(ctx); JS_FreeRuntime(rt);
  if (ok && off) std::printf("ok: r%d guarded math extension\n",version);
  return !ok || !off;
}
