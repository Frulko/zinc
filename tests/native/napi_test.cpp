// Node-API on QuickJS-ng (ZN-773): what our patch of third_party/node-api fixed stays fixed. A callback's values are freed when it returns
// (upstream kept every one until a scope was closed by hand: a hot function grew the heap); numbers are read from their tag and a wrong type is
// napi_number_expected, as in Node; the inlined calls (napi/inline.h) answer as the out-of-line ones.
#include <cstdio>
#include <cstring>

#include <napi/js_native_api.h>
#include <napi/env.h>
#include "../../third_party/node-api/src/js_native_api_quickjs.h"

static int failures = 0;
#define CHECK(c) do { if (!(c)) { std::printf("napi_test: %s:%d: %s\n", __FILE__, __LINE__, #c); ++failures; } } while (0)

static napi_value addNumbers(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  double a = 0, b = 0;
  napi_get_value_double(env, argv[0], &a);
  napi_get_value_double(env, argv[1], &b);
  napi_value tmp, r;
  for (int i = 0; i < 4; ++i) napi_create_string_utf8(env, "scratch", 7, &tmp);   // values the call makes and drops
  napi_create_double(env, a + b, &r);
  return r;
}
static napi_value kindOf(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value v;
  napi_get_cb_info(env, info, &argc, &v, nullptr, nullptr);
  double d = 0;
  int32_t i = 0;
  const napi_status sd = napi_get_value_double(env, v, &d), si = napi_get_value_int32(env, v, &i);
  napi_value r;
  napi_create_int32(env, (sd == napi_ok ? 1 : 0) + (si == napi_ok ? 2 : 0), &r);
  return r;
}

static double eval(JSContext* ctx, const char* src) {
  JSValue v = JS_Eval(ctx, src, std::strlen(src), "<napi_test>", 0);
  double d = -1;
  if (JS_IsException(v)) { JSValue e = JS_GetException(ctx); const char* s = JS_ToCString(ctx, e); std::printf("napi_test: %s\n", s); JS_FreeCString(ctx, s); JS_FreeValue(ctx, e); ++failures; }
  else JS_ToFloat64(ctx, &d, v);
  JS_FreeValue(ctx, v);
  return d;
}

int main() {
  JSRuntime* rt = JS_NewRuntime();
  JSContext* ctx = JS_NewContext(rt);
  napi_env env = Napi::Attach(ctx);
  napi_value global, fn;
  napi_get_global(env, &global);
  napi_create_function(env, "add", NAPI_AUTO_LENGTH, addNumbers, nullptr, &fn);
  napi_set_named_property(env, global, "add", fn);
  napi_create_function(env, "kindOf", NAPI_AUTO_LENGTH, kindOf, nullptr, &fn);
  napi_set_named_property(env, global, "kindOf", fn);

  const size_t before = env->handle_scope_stack.size();
  CHECK(eval(ctx, "let s = 0; for (let i = 0; i < 100000; i++) s += add(i, 0.5); s") == 4999950000.0 + 50000.0);
  CHECK(env->handle_scope_stack.size() == before);   // every value of the 100 000 calls freed on return

  CHECK(eval(ctx, "kindOf(3)") == 3);       // a small integer: a double and an int32
  CHECK(eval(ctx, "kindOf(2.5)") == 3);     // a double: both (int32 truncates)
  CHECK(eval(ctx, "kindOf('7')") == 0);     // a string is not a number (no coercion, as in Node)
  CHECK(eval(ctx, "kindOf(undefined)") == 0);

  if (failures == 0) std::printf("napi_test ok\n");
  return failures ? 1 : 0;
}
