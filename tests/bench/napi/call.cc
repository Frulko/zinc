// The cost of a native call on QuickJS-ng (ZN-773): the QuickJS API directly (JS_NewCFunctionMagic) against Node-API (third_party/node-api),
// the same JavaScript loop around each; the minimum of 9 runs, the empty loop subtracted. Build and run from the repository (after tools/build zinc):
//   c++ -std=c++20 -O2 -DNDEBUG [-DZN_NAPI_INLINE] -w -Ithird_party/node-api/include -Ithird_party/node-api/quickjs -Ithird_party/quickjs-ng tests/bench/napi/call.cc \
//     third_party/node-api/src/{js_native_api_quickjs,js_native_api_shared,env_quickjs}.cc build/libzn_quickjs.a build/libzn_regexp.a -o /tmp/napi-call && /tmp/napi-call
// ZN_NAPI_INLINE: the hot calls inlined, as the engine's own bindings are built. ONLY='addN(i,1.5)' loops on one case for a profiler (sample).
#include <chrono>
#include <cstdio>
#include <cstring>
#include <string>
#include <cstdlib>
#include <napi/js_native_api.h>
#include <napi/env.h>
#ifdef ZN_NAPI_INLINE
#include <napi/inline.h>
#endif
extern "C" {
#include "quickjs.h"
}

static JSValue addDirect(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv, int) {
  double a = 0, b = 0; JS_ToFloat64(ctx, &a, argv[0]); JS_ToFloat64(ctx, &b, argv[1]); return JS_NewFloat64(ctx, a + b);
}
static JSValue lenDirect(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv, int) {
  size_t n = 0; const char* p = JS_ToCStringLen(ctx, &n, argv[0]); JS_FreeCString(ctx, p); return JS_NewInt32(ctx, (int)n);
}
static JSValue nopDirect(JSContext*, JSValueConst, int, JSValueConst*, int) { return JS_UNDEFINED; }
static JSValue nopData(JSContext*, JSValueConst, int, JSValueConst*, int, JSValueConst*) { return JS_UNDEFINED; }
static napi_value nopNapi(napi_env, napi_callback_info) { return nullptr; }
static napi_value addNapi(napi_env env, napi_callback_info info) {
  size_t argc = 2; napi_value argv[2]; napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  double a = 0, b = 0; napi_get_value_double(env, argv[0], &a); napi_get_value_double(env, argv[1], &b);
  napi_value r; napi_create_double(env, a + b, &r); return r;
}
static napi_value lenNapi(napi_env env, napi_callback_info info) {
  size_t argc = 1; napi_value argv[1]; napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  char buf[256]; size_t n = 0; napi_get_value_string_utf8(env, argv[0], buf, sizeof buf, &n);
  napi_value r; napi_create_int32(env, (int)n, &r); return r;
}

static double run(JSContext* ctx, const char* src) {
  auto t = std::chrono::steady_clock::now();
  JSValue v = JS_Eval(ctx, src, strlen(src), "<bench>", 0);
  if (JS_IsException(v)) { JSValue e = JS_GetException(ctx); const char* s = JS_ToCString(ctx, e); std::printf("error %s\n", s); }
  JS_FreeValue(ctx, v);
  return std::chrono::duration<double, std::nano>(std::chrono::steady_clock::now() - t).count();
}

int main() {
  JSRuntime* rt = JS_NewRuntime(); JSContext* ctx = JS_NewContext(rt);
  JSValue g = JS_GetGlobalObject(ctx);
  JS_SetPropertyStr(ctx, g, "addD", JS_NewCFunctionMagic(ctx, addDirect, "addD", 2, JS_CFUNC_generic_magic, 0));
  JS_SetPropertyStr(ctx, g, "lenD", JS_NewCFunctionMagic(ctx, lenDirect, "lenD", 1, JS_CFUNC_generic_magic, 0));
  JS_SetPropertyStr(ctx, g, "nopD", JS_NewCFunctionMagic(ctx, nopDirect, "nopD", 0, JS_CFUNC_generic_magic, 0));
  JS_SetPropertyStr(ctx, g, "nopF", JS_NewCFunctionData(ctx, nopData, 0, 0, 0, nullptr));
  Napi::Env napiEnv = Napi::Attach(ctx); napi_env env = napiEnv;
  napi_value gl, f;
  napi_get_global(env, &gl);
  napi_create_function(env, "addN", NAPI_AUTO_LENGTH, addNapi, nullptr, &f); napi_set_named_property(env, gl, "addN", f);
  napi_create_function(env, "lenN", NAPI_AUTO_LENGTH, lenNapi, nullptr, &f); napi_set_named_property(env, gl, "lenN", f);
  napi_create_function(env, "nopN", NAPI_AUTO_LENGTH, nopNapi, nullptr, &f); napi_set_named_property(env, gl, "nopN", f);
  const int N = 3000000;
  auto best = [&](const char* body) {
    std::string src = std::string("{let s=0, t='hello world'; for (let i=0;i<3000000;i++) {s+=i+1.5; ") + body + "}}";
    double m = 1e18; for (int r = 0; r < 9; ++r) m = std::min(m, run(ctx, src.c_str())); return m / N; };
  if (getenv("ONLY")) { std::string src = std::string("for(;;){let s=0; for (let i=0;i<3000000;i++) s+=") + getenv("ONLY") + "}"; run(ctx, src.c_str()); }
  double base = best("");
  const char* cases[][2] = {{"nopD()", "nopN()"}, {"addD(i,1.5)", "addN(i,1.5)"}, {"lenD(t)", "lenN(t)"}};
  for (auto& c : cases) std::printf("%-12s direct %5.1f ns   napi %5.1f ns\n", c[0], best(c[0]) - base, best(c[1]) - base);
  return 0;
}
