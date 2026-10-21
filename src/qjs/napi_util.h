#pragma once
// JavaScript's own conversions over Node-API (ZN-773), for the engine's bindings: Node-API refuses a value of the wrong type
// (napi_number_expected) where the QuickJS API converted it, so each helper takes the fast typed read and falls back to ToNumber,
// ToBoolean or ToString as the bindings always had. False with an exception pending when the conversion itself throws.
#include <cstdint>
#include <cstring>
#include <string>

#include <napi/js_native_api.h>
#ifdef ZN_NAPI_INLINE
#include <napi/inline.h>   // the hot Node-API calls inlined when built for QuickJS
#endif

namespace zn::napi {

inline bool number(napi_env env, napi_value v, double& d) {
  if (napi_get_value_double(env, v, &d) == napi_ok) return true;
  napi_value n;
  return napi_coerce_to_number(env, v, &n) == napi_ok && napi_get_value_double(env, n, &d) == napi_ok;
}
inline bool int32(napi_env env, napi_value v, std::int32_t& i) {
  if (napi_get_value_int32(env, v, &i) == napi_ok) return true;
  napi_value n;
  return napi_coerce_to_number(env, v, &n) == napi_ok && napi_get_value_int32(env, n, &i) == napi_ok;
}
inline bool uint32(napi_env env, napi_value v, std::uint32_t& u) {
  if (napi_get_value_uint32(env, v, &u) == napi_ok) return true;
  napi_value n;
  return napi_coerce_to_number(env, v, &n) == napi_ok && napi_get_value_uint32(env, n, &u) == napi_ok;
}
inline bool int64(napi_env env, napi_value v, std::int64_t& i) {
  if (napi_get_value_int64(env, v, &i) == napi_ok) return true;
  napi_value n;
  return napi_coerce_to_number(env, v, &n) == napi_ok && napi_get_value_int64(env, n, &i) == napi_ok;
}
inline double num(napi_env env, napi_value v) { double d = 0; number(env, v, d); return d; }   // NaN for undefined, as ToNumber
inline std::int32_t i32(napi_env env, napi_value v) { std::int32_t i = 0; int32(env, v, i); return i; }
inline bool truthy(napi_env env, napi_value v) {
  bool b = false;
  if (napi_get_value_bool(env, v, &b) == napi_ok) return b;
  napi_value t;
  return napi_coerce_to_bool(env, v, &t) == napi_ok && napi_get_value_bool(env, t, &b) == napi_ok && b;
}
inline bool isString(napi_env env, napi_value v) { napi_valuetype t; return napi_typeof(env, v, &t) == napi_ok && t == napi_string; }
// The UTF-8 of a value (ToString first when it is not a string).
inline bool text(napi_env env, napi_value v, std::string& out) {
  napi_value s = v;
  if (!isString(env, v) && napi_coerce_to_string(env, v, &s) != napi_ok) return false;
  std::size_t n = 0;
  if (napi_get_value_string_utf8(env, s, nullptr, 0, &n) != napi_ok) return false;
  out.resize(n);
  return napi_get_value_string_utf8(env, s, out.data(), n + 1, &n) == napi_ok;
}

inline napi_value undefined(napi_env env) { napi_value u; napi_get_undefined(env, &u); return u; }
inline napi_value boolean(napi_env env, bool b) { napi_value r; napi_get_boolean(env, b, &r); return r; }
inline napi_value int32v(napi_env env, std::int32_t i) { napi_value r; napi_create_int32(env, i, &r); return r; }
inline napi_value uint32v(napi_env env, std::uint32_t u) { napi_value r; napi_create_uint32(env, u, &r); return r; }
inline napi_value doublev(napi_env env, double d) { napi_value r; napi_create_double(env, d, &r); return r; }
inline napi_value string(napi_env env, const char* p, std::size_t n) { napi_value r; napi_create_string_utf8(env, p, n, &r); return r; }
inline napi_value string(napi_env env, const std::string& s) { return string(env, s.data(), s.size()); }

// throw new <ctor>(message) for the error classes Node-API has no call for (ReferenceError, URIError...); nullptr, the callback's return.
inline napi_value throwAs(napi_env env, const char* ctor, const std::string& message) {
  napi_value g, c, msg, err;
  napi_get_global(env, &g);
  napi_get_named_property(env, g, ctor, &c);
  msg = string(env, message);
  if (napi_new_instance(env, c, 1, &msg, &err) == napi_ok) napi_throw(env, err);
  return nullptr;
}
inline napi_value throwRange(napi_env env, const std::string& message) { napi_throw_range_error(env, nullptr, message.c_str()); return nullptr; }

inline napi_value arrayBufferCopy(napi_env env, const void* p, std::size_t n) {
  void* data = nullptr;
  napi_value b;
  if (napi_create_arraybuffer(env, n, &data, &b) != napi_ok) return nullptr;
  if (n) std::memcpy(data, p, n);
  return b;
}
inline void set(napi_env env, napi_value o, const char* key, napi_value v) { napi_set_named_property(env, o, key, v); }
inline void method(napi_env env, napi_value o, const char* key, napi_callback fn) {
  napi_value f;
  napi_create_function(env, key, NAPI_AUTO_LENGTH, fn, nullptr, &f);
  napi_set_named_property(env, o, key, f);
}

// The bytes of an ArrayBuffer or of a typed array's (or DataView's) view, in place; nullptr with n = 0 for anything else.
inline const std::uint8_t* bytesOf(napi_env env, napi_value v, std::size_t& n) {
  bool is = false;
  void* data = nullptr;
  n = 0;
  if (napi_is_arraybuffer(env, v, &is) == napi_ok && is) { napi_get_arraybuffer_info(env, v, &data, &n); return static_cast<const std::uint8_t*>(data); }
  if (napi_is_typedarray(env, v, &is) == napi_ok && is) {
    napi_typedarray_type type;
    std::size_t length = 0, offset = 0;
    napi_get_typedarray_info(env, v, &type, &length, &data, nullptr, &offset);
    static constexpr std::size_t kWidth[] = {1, 1, 1, 2, 2, 4, 4, 4, 8, 8, 8, 2};   // int8 .. biguint64, float16 (napi_typedarray_type order)
    n = length * (static_cast<std::size_t>(type) < std::size(kWidth) ? kWidth[type] : 1);
    return static_cast<const std::uint8_t*>(data);
  }
  if (napi_is_dataview(env, v, &is) == napi_ok && is) {
    std::size_t offset = 0;
    napi_get_dataview_info(env, v, &n, &data, nullptr, &offset);
    return static_cast<const std::uint8_t*>(data);
  }
  return nullptr;
}

// The arguments of a callback: argv[0..argc), the missing ones undefined up to N.
template <std::size_t N>
struct Args {
  napi_value argv[N];
  std::size_t argc = N;
  void* data = nullptr;
  napi_value self = nullptr;
  Args(napi_env env, napi_callback_info info) { napi_get_cb_info(env, info, &argc, argv, &self, &data); }
};

}  // namespace zn::napi
