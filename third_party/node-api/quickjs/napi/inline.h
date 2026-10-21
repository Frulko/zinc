#pragma once
// zinc: the hot Node-API calls inlined into code compiled for QuickJS-ng (the engine's bindings built into zinc). The same source compiles
// against any engine; here each call below is a few loads and stores instead of a call into js_native_api_quickjs.cc. Semantics are those
// of the out-of-line versions (src/js_native_api_quickjs.cc), which plugins built once against the C ABI keep calling.
#include <napi/js_native_api.h>
#include "../../src/js_native_api_quickjs.h"

namespace zn_napi_inline {

inline JSValue undefinedValue = JS_UNDEFINED;
inline JSValue trueValue = JS_TRUE;
inline JSValue falseValue = JS_FALSE;

inline napi_status ok(napi_env env) { env->last_error.error_code = napi_ok; return napi_ok; }
inline napi_value push(napi_env env, JSValue v) { return reinterpret_cast<napi_value>(env->handle_scope_stack.push(v)); }

inline napi_status get_cb_info(napi_env env, napi_callback_info cbinfo, size_t* argc, napi_value* argv, napi_value* this_arg, void** data) {
  const CallbackInfo* info = reinterpret_cast<const CallbackInfo*>(cbinfo);
  if (argv && argc) {
    size_t i = 0;
    const size_t n = *argc < info->argc ? *argc : info->argc;
    for (; i < n; i++) argv[i] = info->jsargv ? reinterpret_cast<napi_value>(&info->jsargv[i]) : info->argv[i];
    for (; i < *argc; i++) argv[i] = reinterpret_cast<napi_value>(&undefinedValue);
  }
  if (argc) *argc = info->argc;
  if (this_arg) *this_arg = info->thisArg;
  if (data) *data = info->data;
  return ok(env);
}
inline napi_status get_value_double(napi_env env, napi_value value, double* result) {
  const JSValue v = *reinterpret_cast<JSValue*>(value);
  const int tag = JS_VALUE_GET_NORM_TAG(v);
  if (tag == JS_TAG_INT) *result = JS_VALUE_GET_INT(v);
  else if (JS_TAG_IS_FLOAT64(tag)) *result = JS_VALUE_GET_FLOAT64(v);
  else return ::napi_get_value_double(env, value, result);
  return ok(env);
}
inline napi_status get_value_int32(napi_env env, napi_value value, int32_t* result) {
  const JSValue v = *reinterpret_cast<JSValue*>(value);
  if (JS_VALUE_GET_NORM_TAG(v) != JS_TAG_INT) return ::napi_get_value_int32(env, value, result);
  *result = JS_VALUE_GET_INT(v);
  return ok(env);
}
inline napi_status get_value_uint32(napi_env env, napi_value value, uint32_t* result) {
  const JSValue v = *reinterpret_cast<JSValue*>(value);
  if (JS_VALUE_GET_NORM_TAG(v) != JS_TAG_INT) return ::napi_get_value_uint32(env, value, result);
  *result = static_cast<uint32_t>(JS_VALUE_GET_INT(v));
  return ok(env);
}
inline napi_status get_value_bool(napi_env env, napi_value value, bool* result) {
  const JSValue v = *reinterpret_cast<JSValue*>(value);
  if (JS_VALUE_GET_NORM_TAG(v) != JS_TAG_BOOL) return ::napi_get_value_bool(env, value, result);
  *result = JS_VALUE_GET_BOOL(v) != 0;
  return ok(env);
}
inline napi_status create_double(napi_env env, double value, napi_value* result) { *result = push(env, JS_NewFloat64(env->context, value)); return ok(env); }
inline napi_status create_int32(napi_env env, int32_t value, napi_value* result) { *result = push(env, JS_NewInt32(env->context, value)); return ok(env); }
inline napi_status create_uint32(napi_env env, uint32_t value, napi_value* result) { *result = push(env, JS_NewUint32(env->context, value)); return ok(env); }
inline napi_status get_boolean(napi_env, bool value, napi_value* result) { *result = reinterpret_cast<napi_value>(value ? &trueValue : &falseValue); return napi_ok; }
inline napi_status get_undefined(napi_env, napi_value* result) { *result = reinterpret_cast<napi_value>(&undefinedValue); return napi_ok; }

}  // namespace zn_napi_inline

#define napi_get_cb_info zn_napi_inline::get_cb_info
#define napi_get_value_double zn_napi_inline::get_value_double
#define napi_get_value_int32 zn_napi_inline::get_value_int32
#define napi_get_value_uint32 zn_napi_inline::get_value_uint32
#define napi_get_value_bool zn_napi_inline::get_value_bool
#define napi_create_double zn_napi_inline::create_double
#define napi_create_int32 zn_napi_inline::create_int32
#define napi_create_uint32 zn_napi_inline::create_uint32
#define napi_get_boolean zn_napi_inline::get_boolean
#define napi_get_undefined zn_napi_inline::get_undefined
