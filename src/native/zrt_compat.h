#pragma once
// Compatibility adapters between the native-module ABI (include/zn/native.h) and the prototype's runtime types (runtime/zrt.h) (ZN-099, decision D3): the
// plugins' x.host.cpp, written against zrt::String, zrt::Array<T>, zrt::Fn and zrt::Poller, build unchanged; the thunks that `zinc native-gen --thunk`
// writes call these helpers. One runtime owner: the host library already links runtime/, so no type of zrt is copied or re-implemented here.
#include <cstring>

#include "zn/native.h"
#include "zrt.h"

namespace zrt { bool poll_pollers(); }   // runtime/zrt.cpp: runs every zrt::Poller once, like a turn of the prototype's loop

namespace zn::compat {

inline zrt::String str(const ZnVal& v) { return zrt::String::from(v.s.p, v.s.n); }

// An array argument: the elements are copied (the view is only valid during the call).
template <class T> zrt::Array<T> arr(const ZnVal& v) {
  zrt::Array<T> r = zrt::Array<T>::with_cap(static_cast<int32_t>(v.v.n));
  const T* p = static_cast<const T*>(v.v.p);
  for (uint32_t i = 0; i < v.v.n; ++i) r.push_raw(p[i]);
  return r;
}

// A string[] argument: the strings are copied out of the view of ZnStr.
inline zrt::Array<zrt::String> arrStr(const ZnVal& v) {
  zrt::Array<zrt::String> r = zrt::Array<zrt::String>::with_cap(static_cast<int32_t>(v.v.n));
  const ZnStr* p = static_cast<const ZnStr*>(v.v.p);
  for (uint32_t i = 0; i < v.v.n; ++i) r.push_raw(zrt::String::from(p[i].p, p[i].n));
  return r;
}

// An array argument the plugin changed (an out parameter, or push_raw on the copy): the new contents go to a buffer of the call, and the argument's view points at it, so that the
// engine writes them back into the program's array. Unchanged arrays cost one comparison.
template <class T> void back(const ZnHostApi* h, ZnCtx* cx, ZnVal& v, const zrt::Array<T>& arr) {
  uint32_t n = arr.a ? static_cast<uint32_t>(arr.length()) : 0;
  if (n == v.v.n && (n == 0 || std::memcmp(arr.a->data, v.v.p, n * sizeof(T)) == 0)) return;
  T* out = static_cast<T*>(h->ret_buf(cx, n * sizeof(T) + 1));
  for (uint32_t i = 0; i < n; ++i) out[i] = arr.a->data[i];
  v.v.p = out;
  v.v.n = n;
}

inline void ret(const ZnHostApi* h, ZnCtx* cx, ZnVal* r, const zrt::String& s) { r->s = h->ret_str(cx, s.ptr(), s.bytes()); }
template <class T> void ret(const ZnHostApi* h, ZnCtx* cx, ZnVal* r, const zrt::Array<T>& a) {
  int32_t n = a.a ? a.length() : 0;
  T* out = static_cast<T*>(h->ret_buf(cx, static_cast<uint32_t>(n) * sizeof(T)));
  for (int32_t i = 0; i < n; ++i) out[i] = a.get(i);
  r->v.p = out;
  r->v.n = static_cast<uint32_t>(n);
}

// Arguments of a callback call, packed as the engine's queue wants them (strings and arrays are copied by cb_post).
inline void put(ZnVal& v, int32_t x) { v.i = x; }
inline void put(ZnVal& v, uint32_t x) { v.i = x; }
inline void put(ZnVal& v, bool x) { v.i = x; }
inline void put(ZnVal& v, double x) { v.d = x; }
inline void put(ZnVal& v, const zrt::String& s) { v.s.p = s.ptr(); v.s.n = s.bytes(); }
template <class T> void put(ZnVal& v, const zrt::Array<T>& a) { v.v.p = a.a ? a.a->data : nullptr; v.v.n = a.a ? static_cast<uint32_t>(a.length()) : 0; }

// An error that the plugin left pending in zrt::g_err (a thrown Error) becomes the call's error.
inline int32_t done(const ZnHostApi* h, ZnCtx* cx) {
  if (!zrt::g_err.p) return ZN_OK;
  h->set_error(cx, "the native module threw");
  zrt::g_err = zrt::Ref<zrt::Error>();
  return ZN_ERROR;
}

}  // namespace zn::compat
