// WebGL 1.0 and 2.0 for JavaScript (ZN-203.03): the WebGLRenderingContext class and the object classes as native JS classes over zn::gl::WebGL1 (src/gl/webgl1.cpp), typed arrays read in place,
// plus a tiny `document.createElement('canvas')` / `canvas.getContext('webgl')`. Built as the module libzn_webgl (zn_webgl_open below), installed by the engine in each context; trusted programs only.
// Written against Node-API alone (ZN-773.02): one build of the module runs on every engine, whose napi_* it reaches through the table zn_webgl_open receives (src/gl/napi_trampoline.cpp).
#include "gl/webgl_js.h"

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <new>
#include <strings.h>
#include <map>
#include <memory>
#include <string>
#include <vector>

#include "gl/webgl1.h"
#include "qjs/napi_util.h"
#include "zn/napi_table.h"

namespace zn::gl {
extern const zn_napi_table* gNapi;   // src/gl/napi_trampoline.cpp
namespace {

using namespace zn::napi;

// The natives behind the JS objects (napi_wrap), told apart by their first word, so another module's wrapped object is none of them.
// ponytail: a tag in the native, not a type tag on the JS object (QuickJS's Node-API has no napi_type_tag_object); a foreign native shorter than 4 bytes would be misread
struct Gl;
struct Obj { static constexpr std::uint32_t kTag = 0x7a6e4f62; std::uint32_t tag; int kind; Id id; UniformLoc loc; const Gl* owner; int epoch; };   // epoch: the context life the object belongs to (a restored context starts a new one)   // kind: 1 buffer, 2 shader, 3 program, 4 texture, 5 framebuffer, 6 uniform location
struct ExtObj { static constexpr std::uint32_t kTag = 0x7a6e4578; std::uint32_t tag; Gl* g; int epoch; bool sticky; };   // an extension object: its context, the context life it was made in (an old extension object after a restore is inert), sticky for WEBGL_lose_context, which survives
struct Gl { static constexpr std::uint32_t kTag = 0x7a6e4778; std::uint32_t tag = kTag; WebGL1 gl; napi_ref exts[kExtCount] = {}; std::vector<ExtObj*> extObjs; bool lost = false, lostReported = false, restorable = false, restorePending = false, restoreWanted = false, eventDispatched = false, compositeScheduled = false; int epoch = 0; napi_ref weakSelf = nullptr;   /* a WeakRef to the context object: the timers an extension's call starts need it, and a strong reference would keep it forever */ int w = 0, h = 0, version = 1; bool alpha = true, depth = true, stencil = false, premultipliedAlpha = true, preserveDrawingBuffer = false; std::map<std::uint64_t, napi_ref> wrappers; bool boundaryScheduled = false;
  struct Present { std::uint32_t pbo[2] = {0, 0}; int w = 0, h = 0, ss = 0, slot = -1; unsigned frame = 0; bool shown = false; };   // gl.zincPresent's reads per image: the slot in flight and the frame it started in
  std::map<int, Present> presents; };   // wrappers: one JS object per GL object, so `gl.getParameter(gl.ARRAY_BUFFER_BINDING) === buffer`; extObjs: the extension objects alive, made inert with their context

template <class T> T* as(napi_env c, napi_value v) {
  void* p = nullptr;
  if (napi_unwrap(c, v, &p) != napi_ok || !p || *static_cast<const std::uint32_t*>(p) != T::kTag) return nullptr;
  return static_cast<T*>(p);
}

// ---- the few JS operations the binding needs, over Node-API
napi_value null(napi_env c) { napi_value r; napi_get_null(c, &r); return r; }
napi_value int64v(napi_env c, std::int64_t v) { napi_value r; napi_create_int64(c, v, &r); return r; }
napi_value global(napi_env c) { napi_value r; napi_get_global(c, &r); return r; }
napi_value newObject(napi_env c) { napi_value r; napi_create_object(c, &r); return r; }
napi_value newArray(napi_env c) { napi_value r; napi_create_array(c, &r); return r; }
napi_value typeError(napi_env c, const std::string& message) { napi_throw_type_error(c, nullptr, message.c_str()); return nullptr; }
napi_valuetype typeOf(napi_env c, napi_value v) { napi_valuetype t = napi_undefined; napi_typeof(c, v, &t); return t; }
bool isNull(napi_env c, napi_value v) { return typeOf(c, v) == napi_null; }
bool isUndef(napi_env c, napi_value v) { return typeOf(c, v) == napi_undefined; }
bool isObject(napi_env c, napi_value v) { const napi_valuetype t = typeOf(c, v); return t == napi_object || t == napi_function || t == napi_external; }
bool isFunction(napi_env c, napi_value v) { return typeOf(c, v) == napi_function; }
bool isArray(napi_env c, napi_value v) { bool b = false; return napi_is_array(c, v, &b) == napi_ok && b; }
napi_value get(napi_env c, napi_value o, const char* key) { napi_value r = nullptr; return napi_get_named_property(c, o, key, &r) == napi_ok ? r : undefined(c); }
napi_value elem(napi_env c, napi_value o, std::uint32_t i) { napi_value r = nullptr; return napi_get_element(c, o, i, &r) == napi_ok ? r : undefined(c); }
void setElem(napi_env c, napi_value o, std::uint32_t i, napi_value v) { napi_set_element(c, o, i, v); }
napi_value call(napi_env c, napi_value fn, napi_value self, std::size_t argc, const napi_value* argv) { napi_value r = nullptr; return napi_call_function(c, self ? self : undefined(c), fn, argc, argv, &r) == napi_ok ? r : nullptr; }
void clearException(napi_env c) { bool pending = false; napi_value e; if (napi_is_exception_pending(c, &pending) == napi_ok && pending) napi_get_and_clear_last_exception(c, &e); }
std::uint32_t u32(napi_env c, napi_value v) { std::uint32_t x = 0; uint32(c, v, x); return x; }
std::int64_t i64(napi_env c, napi_value v) { std::int64_t x = 0; int64(c, v, x); return x; }
std::uint32_t lengthOf(napi_env c, napi_value v) { return u32(c, get(c, v, "length")); }
std::string str(napi_env c, napi_value v) { std::string s; text(c, v, s); return s; }

// The classes: constructors that throw "Illegal constructor" in JS and make an instance only for the binding (instance below)
bool gConstructing = false;
napi_value js_illegalConstructor(napi_env c, napi_callback_info) { return gConstructing ? nullptr : typeError(c, "Illegal constructor"); }
napi_value instance(napi_env c, napi_ref ctor) {
  napi_value k = nullptr, o = nullptr;
  if (!ctor || napi_get_reference_value(c, ctor, &k) != napi_ok || !k) return nullptr;
  gConstructing = true;
  const napi_status st = napi_new_instance(c, k, 0, nullptr, &o);
  gConstructing = false;
  return st == napi_ok ? o : nullptr;
}

Gl* gCurrent = nullptr;   // the context whose driver context is current
// ponytail: one set of classes for the module, as before Node-API; the last context installed owns them (one engine context per program today)
napi_ref gCtxCtor[3], gPrecisionCtor, gActiveCtor;   // WebGLRenderingContext, WebGL2RenderingContext (a sibling of the WebGL 1 one)
napi_ref gKindCtor[13];   // WebGLBuffer ... WebGLUniformLocation, so `instanceof` works
napi_ref gLater;          // later(ctx, what): the timer of 0 ms the context's events and checks wait for (install)
const char* kKindNames[] = {"", "WebGLBuffer", "WebGLShader", "WebGLProgram", "WebGLTexture", "WebGLFramebuffer", "WebGLUniformLocation", "WebGLRenderbuffer", "WebGLVertexArrayObject", "WebGLSampler", "WebGLQuery", "WebGLSync", "WebGLTransformFeedback"};

void extFinalizer(napi_env, void* data, void*) {
  auto* x = static_cast<ExtObj*>(data);
  if (x->g) x->g->extObjs.erase(std::remove(x->g->extObjs.begin(), x->g->extObjs.end(), x), x->g->extObjs.end());
  delete x;
}
std::vector<Gl*> gLive;   // the contexts with canvas reads in flight (the frame-end hook finishes them)
void ctxFinalizer(napi_env env, void* data, void*) {
  Gl* g = static_cast<Gl*>(data);
  gLive.erase(std::remove(gLive.begin(), gLive.end(), g), gLive.end());
  if (!g->presents.empty()) { g->gl.makeCurrent(); for (auto& p : g->presents) for (std::uint32_t b : p.second.pbo) g->gl.target().deleteBuffer(b); }
  for (ExtObj* x : g->extObjs) x->g = nullptr;   // an extension object outliving its context is inert
  g->extObjs.clear();
  for (auto& w : g->wrappers) napi_delete_reference(env, w.second);
  for (napi_ref e : g->exts) if (e) napi_delete_reference(env, e);
  if (g->weakSelf) napi_delete_reference(env, g->weakSelf);
  delete g;
  gCurrent = nullptr;   // destroying a driver context leaves none current
}
void objFinalizer(napi_env, void* data, void*) { delete static_cast<Obj*>(data); }

// the context of a context or extension object (the extension methods are the context's methods under another name); stale: an extension object of a context life that has ended
Gl* ownerOf(napi_env c, napi_value t, bool* stale = nullptr) {
  if (stale) *stale = false;
  void* p = nullptr;
  if (napi_unwrap(c, t, &p) != napi_ok || !p) return nullptr;
  const std::uint32_t tag = *static_cast<const std::uint32_t*>(p);
  if (tag == Gl::kTag) return static_cast<Gl*>(p);
  if (tag == ExtObj::kTag) { auto* x = static_cast<ExtObj*>(p); if (stale) *stale = x->g && !x->sticky && x->epoch != x->g->epoch; return x->g; }
  return nullptr;
}
Gl* self(napi_env c, napi_value t) {
  Gl* g = ownerOf(c, t);
  if (!g) typeError(c, "illegal invocation");
  return g;
}
#define SELF Gl* g = self(c, t); if (!g) return nullptr; if (gCurrent != g) { g->gl.makeCurrent(); gCurrent = g; } WebGL1& gl = g->gl; (void)gl; (void)argc; (void)argv;

napi_value wrap(napi_env c, const Gl* owner, int kind, Id id, UniformLoc loc = {}) {
  napi_value o = instance(c, gKindCtor[kind]);
  if (!o) return nullptr;
  auto* obj = new Obj{Obj::kTag, kind, id, loc, owner, owner->epoch};
  if (napi_wrap(c, o, obj, objFinalizer, nullptr, nullptr) != napi_ok) { delete obj; return nullptr; }
  return o;
}
// the one wrapper of a GL object (not for uniform locations, which are values)
napi_value wrapOnce(napi_env c, Gl* g, int kind, Id id) {
  const std::uint64_t key = (static_cast<std::uint64_t>(kind) << 32) | id;
  auto it = g->wrappers.find(key);
  napi_value o = nullptr;
  if (it != g->wrappers.end() && napi_get_reference_value(c, it->second, &o) == napi_ok && o) return o;
  o = wrap(c, g, kind, id);
  napi_ref r = nullptr;
  if (o && napi_create_reference(c, o, 1, &r) == napi_ok) g->wrappers[key] = r;
  return o;
}
// null and undefined are the null object; anything else must be an object of the right kind
int object(napi_env c, Gl* g, napi_value v, int kind, Obj& out, bool nullable) {
  out = Obj{Obj::kTag, kind, 0, {}, g, g->epoch};
  Obj* o = as<Obj>(c, v);
  if (!o) {
    const napi_valuetype t = typeOf(c, v);
    if (t == napi_null) { if (nullable) return 0; typeError(c, "argument must not be null"); return 2; }
    if (t == napi_undefined) { if (nullable) return 0; typeError(c, "argument must not be undefined"); return 2; }
  }
  if (!o || o->kind != kind) { typeError(c, std::string("argument is not a ") + kKindNames[kind]); return 2; }
  if (o->owner != g || o->epoch != g->epoch) { g->gl.raise(0x0502); return 1; }   // an object of another context: INVALID_OPERATION, the call does nothing
  out = *o;
  return 0;
}
// OBJ: nullable (bind*, framebufferTexture2D...); OBJR: required (compileShader, linkProgram...): null throws a TypeError
#define OBJ(var, idx, kind) Obj var; { int st_ = object(c, g, argv[idx], kind, var, true); if (st_ == 2) return nullptr; if (st_ == 1) return nullptr; }
#define OBJN(var, idx, kind) Obj var; { int st_ = object(c, g, argv[idx], kind, var, false); if (st_ == 2) return nullptr; if (st_ == 1) return null(c); }   // a query: null for another context's object
#define OBJR(var, idx, kind) Obj var; { int st_ = object(c, g, argv[idx], kind, var, false); if (st_ == 2) return nullptr; if (st_ == 1) return nullptr; }

#define U(i) u32(c, argv[i])
#define I(i) i32(c, argv[i])
#define F(i) static_cast<float>(num(c, argv[i]))
#define NEED(n) if (argc < n) return typeError(c, "not enough arguments")

// the bytes of an ArrayBuffer, a typed array or a DataView, in place; false for anything else and for a detached buffer
bool bytesOf(napi_env c, napi_value v, std::uint8_t*& p, std::size_t& n, std::size_t* elem = nullptr) {
  static constexpr std::size_t kWidth[] = {1, 1, 1, 2, 2, 4, 4, 4, 8, 8, 8};   // int8 .. biguint64 (napi_typedarray_type order)
  if (elem) *elem = 1;
  bool is = false;
  void* data = nullptr;
  n = 0;
  if (napi_is_typedarray(c, v, &is) == napi_ok && is) {   // asked first: uniforms and buffers are typed arrays
    napi_typedarray_type type = napi_uint8_array;
    std::size_t length = 0;
    if (napi_get_typedarray_info(c, v, &type, &length, &data, nullptr, nullptr) != napi_ok) { clearException(c); return false; }
    std::size_t el = static_cast<std::size_t>(type) < std::size(kWidth) ? kWidth[type] : 1;
    n = length * el;
    if (type == napi_uint8_array) { const std::size_t bytes = static_cast<std::size_t>(num(c, get(c, v, "byteLength"))); if (length && bytes != n) { el = bytes / length; n = bytes; } }   // a Float16Array, which Node-API reports as bytes
    if (elem) *elem = el;
  } else if (napi_is_arraybuffer(c, v, &is) == napi_ok && is) {
    napi_get_arraybuffer_info(c, v, &data, &n);
  } else if (napi_is_dataview(c, v, &is) == napi_ok && is) {
    napi_get_dataview_info(c, v, &n, &data, nullptr, nullptr);
  } else {
    return false;
  }
  if (!data || !n) {   // a detached buffer: its read threw
    bool pending = false;
    if (napi_is_exception_pending(c, &pending) == napi_ok && pending) { clearException(c); n = 0; return false; }
    if (!data) n = 0;
  }
  p = static_cast<std::uint8_t*>(data);
  return true;
}
bool isView(napi_env c, napi_value v) { std::uint8_t* p = nullptr; std::size_t n = 0; return bytesOf(c, v, p, n); }
// WebGL 2's srcOffset after a texture view (in elements): false after raising the error (negative: INVALID_VALUE, past the end: INVALID_OPERATION)
bool viewOffset(napi_env c, WebGL1& gl, int argc, napi_value* argv, int idx, std::size_t el, std::uint8_t*& p, std::size_t& n) {
  if (argc <= idx || gl.version() != 2 || isUndef(c, argv[idx])) return true;
  const std::int64_t off = i64(c, argv[idx]);
  if (off < 0) { gl.raise(0x0501); return false; }
  const std::size_t bytes = static_cast<std::size_t>(off) * el;
  if (bytes > n) { gl.raise(0x0502); return false; }
  p += bytes; n -= bytes;
  return true;
}
// the WebGL 2 tail (srcOffset, length) of a view argument, both counted in elements: 0 not a buffer, 1 ok, 2 INVALID_VALUE raised
int viewSlice(napi_env c, WebGL1& gl, int argc, napi_value* argv, int i, std::uint8_t*& p, std::size_t& n, int gap = 0) {
  std::size_t el = 1;
  i += gap;
  if (!bytesOf(c, argv[i - gap], p, n, &el)) return 0;
  const std::int64_t total = static_cast<std::int64_t>(n / el);
  std::int64_t off = argc > i + 1 ? i64(c, argv[i + 1]) : 0, len = argc > i + 2 ? i64(c, argv[i + 2]) : 0;
  if (off < 0 || len < 0 || off > total || off + len > total) { gl.raise(0x0501); return 2; }
  p += off * static_cast<std::int64_t>(el);
  n = static_cast<std::size_t>((len ? len : total - off) * static_cast<std::int64_t>(el));
  return 1;
}
// a JS array of numbers or a Float32Array
bool floatsOf(napi_env c, napi_value v, std::vector<float>& out) {
  std::uint8_t* p = nullptr;
  std::size_t n = 0;
  if (bytesOf(c, v, p, n)) { out.resize(n / 4); std::memcpy(out.data(), p, out.size() * 4); return true; }
  if (!isArray(c, v)) return false;
  std::uint32_t len = lengthOf(c, v);
  out.resize(len);
  for (std::uint32_t i = 0; i < len; ++i) out[i] = static_cast<float>(num(c, elem(c, v, i)));
  return true;
}

// ---- methods
#define M(name) napi_value js_##name(napi_env c, napi_value t, int argc, napi_value* argv)
M(getError) { SELF return uint32v(c, gl.getError()); }
M(enable) { SELF NEED(1); gl.enable(U(0)); return nullptr; }
M(disable) { SELF NEED(1); gl.disable(U(0)); return nullptr; }
M(viewport) { SELF NEED(4); gl.viewport(I(0), I(1), I(2), I(3)); return nullptr; }
M(scissor) { SELF NEED(4); gl.scissor(I(0), I(1), I(2), I(3)); return nullptr; }
M(clearColor) { SELF NEED(4); gl.clearColor(F(0), F(1), F(2), F(3)); return nullptr; }
M(clear) { SELF NEED(1); gl.clear(U(0)); return nullptr; }
M(pixelStorei) { SELF NEED(2); gl.pixelStorei(U(0), I(1)); return nullptr; }

M(createBuffer) { SELF return wrapOnce(c, g, 1, gl.createBuffer()); }
M(deleteBuffer) { SELF NEED(1); OBJ(o, 0, 1) gl.deleteBuffer(o.id); return nullptr; }
M(isBuffer) { SELF NEED(1); Obj* o = as<Obj>(c, argv[0]); return boolean(c, o && (o->owner == g && o->epoch == g->epoch) && o->kind == 1 && gl.isBuffer(o->id)); }
M(bindBuffer) { SELF NEED(2); OBJ(o, 1, 1) gl.bindBuffer(U(0), o.id); return nullptr; }
M(bufferData) {
  SELF NEED(3);
  std::uint8_t* p = nullptr;
  std::size_t n = 0;
  if (int r = viewSlice(c, gl, argc, argv, 1, p, n, 1)) { if (r == 1) gl.bufferData(U(0), static_cast<std::int64_t>(n), p, U(2)); }
  else if (isNull(c, argv[1]) || isUndef(c, argv[1])) gl.raise(0x0501);   // INVALID_VALUE
  else { double d = num(c, argv[1]); gl.bufferData(U(0), d != d ? 0 : static_cast<std::int64_t>(d), nullptr, U(2)); }   // a size, converted like an IDL integer (NaN is 0)
  return nullptr;
}
M(bufferSubData) {
  SELF NEED(3);
  std::uint8_t* p = nullptr;
  std::size_t n = 0;
  int r = viewSlice(c, gl, argc, argv, 2, p, n);
  if (!r) return typeError(c, "bufferSubData: data must be an ArrayBuffer or a view");
  if (r == 1) gl.bufferSubData(U(0), i64(c, argv[1]), static_cast<std::int64_t>(n), p);
  return nullptr;
}

M(createShader) { SELF NEED(1); Id id = gl.createShader(U(0)); return id ? wrapOnce(c, g, 2, id) : null(c); }
M(shaderSource) { SELF NEED(2); OBJR(o, 0, 2) gl.shaderSource(o.id, str(c, argv[1])); return nullptr; }
M(compileShader) { SELF NEED(1); OBJR(o, 0, 2) gl.compileShader(o.id); return nullptr; }
M(getShaderParameter) {
  SELF NEED(2); OBJR(o, 0, 2)
  if (!gl.shaderQueryOk(o.id, U(1))) return null(c);
  switch (U(1)) { case 0x8B81: return boolean(c, gl.shaderCompiled(o.id)); case 0x8B80: return boolean(c, gl.isDeletedShader(o.id)); case 0x8B4F: return uint32v(c, gl.shaderTypeOf(o.id)); }
  return null(c);
}
M(getShaderInfoLog) { SELF NEED(1); OBJR(o, 0, 2) return string(c, gl.shaderInfoLog(o.id).c_str()); }
M(createProgram) { SELF return wrapOnce(c, g, 3, gl.createProgram()); }
M(attachShader) { SELF NEED(2); OBJR(p, 0, 3) OBJR(s, 1, 2) gl.attachShader(p.id, s.id); return nullptr; }
M(bindAttribLocation) { SELF NEED(3); OBJR(p, 0, 3) gl.bindAttribLocation(p.id, U(1), str(c, argv[2])); return nullptr; }
M(linkProgram) { SELF NEED(1); OBJR(p, 0, 3) gl.linkProgram(p.id); return nullptr; }
M(getProgramParameter) {
  SELF NEED(2); OBJR(p, 0, 3)
  bool ok = false;
  int v = gl.programParameter(p.id, U(1), ok);
  if (!ok) return null(c);
  return U(1) == 0x8B80 || U(1) == 0x8B82 || U(1) == 0x8B83 ? boolean(c, v != 0) : int32v(c, v);
}
M(getProgramInfoLog) { SELF NEED(1); OBJR(p, 0, 3) return string(c, gl.programInfoLog(p.id).c_str()); }
M(useProgram) { SELF NEED(1); OBJ(p, 0, 3) gl.useProgram(p.id); return nullptr; }
M(getAttribLocation) { SELF NEED(2); OBJR(p, 0, 3) return int32v(c, gl.getAttribLocation(p.id, str(c, argv[1]))); }
M(getUniformLocation) {
  SELF NEED(2); OBJR(p, 0, 3)
  UniformLoc l = gl.getUniformLocation(p.id, str(c, argv[1]));
  return l.valid() ? wrap(c, g, 6, 0, l) : null(c);
}
UniformLoc locOf(napi_env c, Gl* g, napi_value v, bool& ok, bool& foreign) {
  ok = true; foreign = false;
  Obj* o = as<Obj>(c, v);
  if (!o) { const napi_valuetype t = typeOf(c, v); if (t == napi_null || t == napi_undefined) return {}; }
  if (!o || o->kind != 6) { ok = false; typeError(c, "argument is not a WebGLUniformLocation"); return {}; }
  if (o->owner != g || o->epoch != g->epoch) { foreign = true; g->gl.raise(0x0502); return {}; }   // a location of another context: INVALID_OPERATION, nothing happens
  return o->loc;
}
#define LOC bool ok_, fo_; UniformLoc l = locOf(c, g, argv[0], ok_, fo_); if (!ok_) return nullptr; if (fo_) return nullptr;
M(uniform1f) { SELF NEED(2); LOC gl.uniform1f(l, F(1)); return nullptr; }
M(uniform2f) { SELF NEED(3); LOC gl.uniform2f(l, F(1), F(2)); return nullptr; }
M(uniform4f) { SELF NEED(5); LOC gl.uniform4f(l, F(1), F(2), F(3), F(4)); return nullptr; }
M(uniform1i) { SELF NEED(2); LOC gl.uniform1i(l, I(1)); return nullptr; }
M(uniformMatrix4fv) {
  SELF NEED(3); LOC
  std::vector<float> v;
  if (!floatsOf(c, argv[2], v)) return typeError(c, "uniformMatrix4fv: value must be a Float32Array or an array");
  gl.uniformMatrix4fv(l, truthy(c, argv[1]), v.data(), v.size());
  return nullptr;
}

M(enableVertexAttribArray) { SELF NEED(1); gl.enableVertexAttribArray(U(0)); return nullptr; }
M(disableVertexAttribArray) { SELF NEED(1); gl.disableVertexAttribArray(U(0)); return nullptr; }
M(vertexAttribPointer) { SELF NEED(6); gl.vertexAttribPointer(U(0), I(1), U(2), truthy(c, argv[3]), I(4), i64(c, argv[5])); return nullptr; }
M(drawArrays) { SELF NEED(3); gl.drawArrays(U(0), I(1), I(2)); return nullptr; }
M(drawElements) { SELF NEED(4); gl.drawElements(U(0), I(1), U(2), i64(c, argv[3])); return nullptr; }

M(createTexture) { SELF return wrapOnce(c, g, 4, gl.createTexture()); }
M(deleteTexture) { SELF NEED(1); OBJ(o, 0, 4) gl.deleteTexture(o.id); return nullptr; }
M(bindTexture) { SELF NEED(2); OBJ(o, 1, 4) gl.bindTexture(U(0), o.id); return nullptr; }
M(activeTexture) { SELF NEED(1); gl.activeTexture(U(0)); return nullptr; }
M(texParameterf) { SELF NEED(3); gl.texParameterf(U(0), U(1), F(2)); return nullptr; }
M(texParameteri) { SELF NEED(3); gl.texParameteri(U(0), U(1), I(2)); return nullptr; }

bool viewMatchesType(napi_env c, napi_value v, std::uint32_t type, bool v2);
std::string ctorName(napi_env c, napi_value v) {   // v.constructor.name, "" when it is not a string
  napi_value ctor = get(c, v, "constructor");
  napi_value nm = isObject(c, ctor) ? get(c, ctor, "name") : nullptr;
  return nm && isString(c, nm) ? str(c, nm) : "";
}
// WebGL 1: a typed array handed to texImage2D / texSubImage2D must be the one the type names (Uint8Array for UNSIGNED_BYTE, Float32Array for FLOAT ...)
bool v1ViewOk(napi_env c, WebGL1& gl, napi_value v, std::uint32_t type) {
  if (gl.version() != 1) return true;
  const std::string cn = ctorName(c, v);
  if (cn.size() < 5 || cn.compare(cn.size() - 5, 5, "Array") != 0 || cn == "ArrayBuffer") return true;   // a DataView or an ArrayBuffer: not checked
  return viewMatchesType(c, v, type, true);
}
// ---- DOM pixel sources for texImage2D / texSubImage2D (ImageData, a 2D canvas, a WebGL canvas): the host page environment provides __srcPixels(source) -> {data: RGBA8 top row first, width, height}
std::uint16_t toHalf(float f) {
  std::uint32_t x; std::memcpy(&x, &f, 4);
  const std::uint32_t sign = (x >> 16) & 0x8000u; int e = static_cast<int>((x >> 23) & 0xFF) - 127 + 15; std::uint32_t m = x & 0x7FFFFFu;
  if (((x >> 23) & 0xFF) == 0xFF) return static_cast<std::uint16_t>(sign | 0x7C00u | (m ? 0x200u : 0));
  if (e >= 31) return static_cast<std::uint16_t>(sign | 0x7C00u);
  if (e <= 0) { if (e < -10) return static_cast<std::uint16_t>(sign); m |= 0x800000u; const int sh = 14 - e; const std::uint32_t r = (m + (1u << (sh - 1)) - 1 + ((m >> sh) & 1)) >> sh; return static_cast<std::uint16_t>(sign | r); }
  std::uint32_t r = (m + 0xFFFu + ((m >> 13) & 1)) >> 13;
  return static_cast<std::uint16_t>(sign + (static_cast<std::uint32_t>(e) << 10) + r);
}
// -1: not a DOM source (a script's own arrays go the other way), 0: unusable (an image that was never decoded), 2: the rectangle lies outside the source, 1: converted.
// width < 0: the whole source; else the rectangle (UNPACK_SKIP_PIXELS, UNPACK_SKIP_ROWS) + (width, height) of it, `depth` slices of it stacked downwards (UNPACK_IMAGE_HEIGHT apart)
int domPixels(napi_env c, WebGL1& gl, napi_value src, std::uint32_t format, std::uint32_t type, int width, int height, int depth, std::vector<std::uint8_t>& out, int& w, int& h) {
  if (!isObject(c, src)) return -1;
  napi_value fn = get(c, global(c), "__srcPixels");
  if (!isFunction(c, fn)) return -1;
  napi_value r = call(c, fn, nullptr, 1, &src);
  if (!r) { clearException(c); return 0; }
  if (!isObject(c, r)) return 0;
  napi_value dv = get(c, r, "data"), wv = get(c, r, "width"), hv = get(c, r, "height");
  std::uint8_t* px = nullptr; std::size_t n = 0;
  const int sw = i32(c, wv), sh = i32(c, hv);
  const bool ok = bytesOf(c, dv, px, n) && sw >= 0 && sh >= 0 && n >= static_cast<std::size_t>(sw) * sh * 4;
  if (!ok) return 0;
  int ch = 0;
  switch (format) { case 0x1903: case 0x1906: case 0x1909: case 0x8D94: ch = 1; break; case 0x8227: case 0x190A: case 0x8228: ch = 2; break; case 0x1907: case 0x8C40: case 0x8D98: ch = 3; break; case 0x1908: case 0x8C42: case 0x8D99: ch = 4; break; default: return 0; }
  const bool integer = format == 0x8D94 || format == 0x8228 || format == 0x8D98 || format == 0x8D99;   // the bytes as they are
  if (integer && type != 0x1401) return 0;
  const bool packed = type == 0x8363 || type == 0x8033 || type == 0x8034 || type == 0x8368 || type == 0x8C3B;
  const int esz = type == 0x1406 ? 4 : (type == 0x140B || type == 0x8D61) ? 2 : 1;
  if (!(type == 0x1401 || type == 0x1406 || type == 0x140B || type == 0x8D61 || packed)) return 0;
  const bool whole = width < 0;
  w = whole ? sw : width; h = whole ? sh : height;
  const int x0 = whole ? 0 : gl.unpackSkipPixels(), y0 = whole ? 0 : gl.unpackSkipRows(), sliceH = !whole && gl.unpackImageHeight() > 0 ? gl.unpackImageHeight() : h;
  if (w < 0 || h < 0 || depth < 1 || x0 + w > sw || y0 + static_cast<std::int64_t>(depth - 1) * sliceH + h > sh) return 2;
  const int bpp = packed ? (type == 0x8368 || type == 0x8C3B ? 4 : 2) : ch * esz;
  std::size_t row = static_cast<std::size_t>(w) * bpp;
  const std::size_t al = static_cast<std::size_t>(gl.unpackAlignment());
  row = (row + al - 1) / al * al;
  out.assign(row * h * depth, 0);
  const bool flip = gl.unpackFlipY(), premul = gl.unpackPremultiply();
  for (int z = 0; z < depth; ++z) for (int y = 0; y < h; ++y) {
    // flipY turns the whole source over first, the skips and the slice rows count in the flipped image (WebGL 2: texImage2D with a sub-rectangle)
    const int rowInFlipped = y0 + z * sliceH + y;
    const std::uint8_t* s = px + (static_cast<std::size_t>(flip ? sh - 1 - rowInFlipped : rowInFlipped) * sw + x0) * 4;
    std::uint8_t* d = out.data() + row * (static_cast<std::size_t>(z) * h + y);
    if (format == 0x1908 && type == 0x1401) {   // RGBA bytes, what nearly every upload asks for: the row as it is, or premultiplied in integers. The same bytes as the general path below (equal for each of the 65,536 colour and alpha pairs), without its floats.
      if (!premul) std::memcpy(d, s, static_cast<std::size_t>(w) * 4);
      else for (int x = 0; x < w; ++x, s += 4, d += 4) { const unsigned a = s[3]; d[0] = static_cast<std::uint8_t>((s[0] * a + 127) / 255); d[1] = static_cast<std::uint8_t>((s[1] * a + 127) / 255); d[2] = static_cast<std::uint8_t>((s[2] * a + 127) / 255); d[3] = s[3]; }
      continue;
    }
    for (int x = 0; x < w; ++x, s += 4, d += bpp) {
      float v[4] = {s[0] / 255.f, s[1] / 255.f, s[2] / 255.f, s[3] / 255.f};
      if (premul) { v[0] *= v[3]; v[1] *= v[3]; v[2] *= v[3]; }
      float comp[4]; int nc = ch;
      switch (format) {
        case 0x1909: comp[0] = v[0]; break;                            // LUMINANCE: the red channel
        case 0x1906: comp[0] = v[3]; break;                            // ALPHA
        case 0x190A: comp[0] = v[0]; comp[1] = v[3]; break;            // LUMINANCE_ALPHA
        case 0x1903: case 0x8D94: comp[0] = v[0]; break;                // RED
        case 0x8227: case 0x8228: comp[0] = v[0]; comp[1] = v[1]; break; // RG
        case 0x1907: case 0x8C40: case 0x8D98: comp[0] = v[0]; comp[1] = v[1]; comp[2] = v[2]; break;
        default: comp[0] = v[0]; comp[1] = v[1]; comp[2] = v[2]; comp[3] = v[3]; nc = 4;
      }
      if (packed) {
        auto q = [](float f, int bits) { const int mx = (1 << bits) - 1; int r = static_cast<int>(f * mx + 0.5f); return r < 0 ? 0 : r > mx ? mx : r; };
        if (type == 0x8C3B) {   // UNSIGNED_INT_10F_11F_11F_REV: unsigned floats, the half-float bits with fewer mantissa bits
          const auto f11 = [](float f) { return static_cast<std::uint32_t>(toHalf(f < 0 ? 0 : f)) >> 4; };
          const std::uint32_t u = f11(comp[0]) | (f11(comp[1]) << 11) | ((f11(comp[2]) >> 1) << 22);
          std::memcpy(d, &u, 4);
        } else if (type == 0x8368) {   // UNSIGNED_INT_2_10_10_10_REV
          const std::uint32_t u = static_cast<std::uint32_t>(q(comp[0], 10)) | (static_cast<std::uint32_t>(q(comp[1], 10)) << 10) | (static_cast<std::uint32_t>(q(comp[2], 10)) << 20) | (static_cast<std::uint32_t>(q(comp[3], 2)) << 30);
          std::memcpy(d, &u, 4);
        } else {
          std::uint16_t u = type == 0x8363 ? static_cast<std::uint16_t>((q(comp[0], 5) << 11) | (q(comp[1], 6) << 5) | q(comp[2], 5)) :
                            type == 0x8033 ? static_cast<std::uint16_t>((q(comp[0], 4) << 12) | (q(comp[1], 4) << 8) | (q(comp[2], 4) << 4) | q(comp[3], 4)) :
                                             static_cast<std::uint16_t>((q(comp[0], 5) << 11) | (q(comp[1], 5) << 6) | (q(comp[2], 5) << 1) | q(comp[3], 1));
          std::memcpy(d, &u, 2);
        }
      } else for (int k = 0; k < nc; ++k) {
        if (type == 0x1401) d[k] = static_cast<std::uint8_t>(comp[k] * 255.f + 0.5f);
        else if (type == 0x1406) std::memcpy(d + 4 * k, &comp[k], 4);
        else { const std::uint16_t hf = toHalf(comp[k]); std::memcpy(d + 2 * k, &hf, 2); }
      }
    }
  }
  return 1;
}
M(texImage2D) {
  SELF NEED(6);
  std::uint8_t* p = nullptr;
  std::size_t n = 0;
  if (argc < 9 || (argc == 9 && isObject(c, argv[8]) && !bytesOf(c, argv[8], p, n))) {   // texImage2D(target, level, internalformat, format, type, source) and the WebGL 2 form with a size
    const bool sized = argc >= 9;
    std::vector<std::uint8_t> px; int w = 0, h = 0;
    const int st = domPixels(c, gl, argv[sized ? 8 : 5], U(sized ? 6 : 3), U(sized ? 7 : 4), sized ? I(3) : -1, sized ? I(4) : -1, 1, px, w, h);
    if (st < 0) return typeError(c, "texImage2D: not enough arguments, or the source is not a DOM pixel source");
    if (st == 0) { gl.raise(0x0501); return nullptr; }   // INVALID_VALUE: an image that is not decoded
    if (st == 2) { gl.raise(0x0502); return nullptr; }   // INVALID_OPERATION: the source rectangle is not inside the source
    if (gl.version() == 1 && (U(sized ? 6 : 3) == 0x1902 || U(sized ? 6 : 3) == 0x84F9)) { gl.raise(0x0502); return nullptr; }
    gl.domUnpack(true);
    gl.texImage2D(U(0), I(1), U(2), w, h, sized ? I(5) : 0, U(sized ? 6 : 3), U(sized ? 7 : 4), px.data(), px.size());
    gl.domUnpack(false);
    return nullptr;
  }
  NEED(9);
  if (isNull(c, argv[8]) || isUndef(c, argv[8])) gl.texImage2D(U(0), I(1), U(2), I(3), I(4), I(5), U(6), U(7), nullptr, 0);
  else if (std::size_t el = 1; bytesOf(c, argv[8], p, n, &el)) { if (!v1ViewOk(c, gl, argv[8], U(7))) gl.raise(0x0502); else if (viewOffset(c, gl, argc, argv, 9, el, p, n)) gl.texImage2D(U(0), I(1), U(2), I(3), I(4), I(5), U(6), U(7), p, n); }
  else return typeError(c, "texImage2D: pixels must be null or an ArrayBuffer view");
  return nullptr;
}

M(createFramebuffer) { SELF return wrapOnce(c, g, 5, gl.createFramebuffer()); }
M(bindFramebuffer) { SELF NEED(2); OBJ(o, 1, 5) gl.bindFramebuffer(U(0), o.id); return nullptr; }
M(framebufferTexture2D) { SELF NEED(5); OBJ(tex, 3, 4) gl.framebufferTexture2D(U(0), U(1), U(2), tex.id, I(4)); return nullptr; }
M(checkFramebufferStatus) { SELF NEED(1); return uint32v(c, gl.checkFramebufferStatus(U(0))); }
// gl.zincPresent(image): the drawing buffer's pixels (rows flipped, no alpha) go to a zinc:gfx runtime image, so a zinc:ui Surface node shows the canvas (ZN-205). Zinc's own extension, not WebGL.
const PresentHooks* gPresent = nullptr;
unsigned gFrame = 0;   // frames ended since the module opened
// Pipelined presents (ZN-411): a read started in frame N is shown in frame N + 1, so the main thread never waits for the GPU; deterministic
// runs read in the same frame (ZINC_GL_PRESENT=async|sync chooses)
bool asyncPresent() {
  static const int on = [] { const char* e = std::getenv("ZINC_GL_PRESENT"); if (e && *e) return std::strcmp(e, "async") == 0 ? 1 : 0; return std::getenv("ZINC_DETERMINISTIC") ? 0 : 1; }();
  return on != 0;
}
void finishPresent(Gl* g, int image, Gl::Present& p) {
  if (p.slot < 0) return;
  if (unsigned* dst = gPresent->pixels(image, p.w, p.h)) { g->gl.target().finishRead(p.pbo[p.slot], dst, p.w, p.h); gPresent->done(image); }
  p.slot = -1;
}
// the host's frame end: reads started in an earlier frame and not taken by a present since (a canvas drawn only on demand) are shown now
void presentFrameEnd() {
  for (Gl* g : gLive)
    for (auto& [image, p] : g->presents)
      if (p.slot >= 0 && p.frame != gFrame) { if (gCurrent != g) { g->gl.makeCurrent(); gCurrent = g; } finishPresent(g, image, p); }
  ++gFrame;
}
M(zincPresent) {
  SELF NEED(1);
  if (!gPresent) return typeError(c, "zincPresent: this program has no UI surface");
  const int image = I(0), w = gl.target().width(), h = gl.target().height();
  int iw = 0, ih = 0;
  if (!gPresent->size(image, &iw, &ih)) return boolean(c, false);
  // a canvas that is a whole multiple of the image is supersampled: averaged down (anti-aliasing for contexts without MSAA); else the image takes the canvas's size
  const int ss = (iw > 0 && ih > 0 && w % iw == 0 && h % ih == 0 && w / iw == h / ih && w / iw > 1 && w / iw <= 4) ? w / iw : 1;
  const int ow = ss > 1 ? iw : w, oh = ss > 1 ? ih : h;
  Gl::Present& p = g->presents[image];
  if (p.w != ow || p.h != oh || p.ss != ss) { p.slot = -1; p.w = ow; p.h = oh; p.ss = ss; p.shown = false; }   // a read of another size is dropped
  const bool async = asyncPresent();
  if (async && p.slot >= 0 && p.frame != gFrame) finishPresent(g, image, p);   // the previous frame's read: done by now, no wait
  const int slot = p.slot < 0 ? 0 : p.slot ^ 1;
  if (gl.target().readScaledAsync(p.pbo[slot], ow, oh, ss)) {
    if (p.slot >= 0) finishPresent(g, image, p);   // two presents in one frame: the first is shown before the second starts
    p.slot = slot; p.frame = gFrame;
    if (std::find(gLive.begin(), gLive.end(), g) == gLive.end()) gLive.push_back(g);
    if (!async || !p.shown) { finishPresent(g, image, p); p.shown = true; }   // a synchronous present, or the first at this size: shown now
    return boolean(c, true);
  }
  unsigned* dst = gPresent->pixels(image, ow, oh);
  if (!dst) return boolean(c, false);
  {   // no framebuffer blit or pixel buffer (GLES 2) or 3x / 4x: read it all and average on the CPU
    std::vector<std::uint8_t> px = gl.target().read();   // the driver call straight, so the script's pack state and error flags stay untouched
    for (int y = 0; y < oh; ++y)
      for (int x = 0; x < ow; ++x) {
        unsigned r = 0, g = 0, b = 0;
        for (int sy = 0; sy < ss; ++sy) {
          const unsigned char* src = px.data() + static_cast<std::size_t>(h - 1 - (y * ss + sy)) * w * 4 + static_cast<std::size_t>(x) * ss * 4;
          for (int sx = 0; sx < ss; ++sx, src += 4) { r += src[0]; g += src[1]; b += src[2]; }
        }
        const unsigned n = static_cast<unsigned>(ss * ss);
        dst[static_cast<std::size_t>(y) * ow + x] = ((r / n) << 16) | ((g / n) << 8) | (b / n);
      }
  }
  gPresent->done(image);
  return boolean(c, true);
}
// the typed array a readPixels type wants (WebGL 2 lists them all; WebGL 1 only checks UNSIGNED_BYTE)
bool viewMatchesType(napi_env c, napi_value v, std::uint32_t type, bool v2) {
  const std::string cn = ctorName(c, v);
  switch (type) {
    case 0x1401: return cn == "Uint8Array" || cn == "Uint8ClampedArray";
    case 0x1400: return !v2 || cn == "Int8Array";
    case 0x1402: return !v2 || cn == "Int16Array";
    case 0x1403: case 0x8363: case 0x8033: case 0x8034: case 0x140B: case 0x8D61: return !v2 || cn == "Uint16Array";
    case 0x1404: return !v2 || cn == "Int32Array";
    case 0x1405: case 0x8368: case 0x8C3B: case 0x8C3E: case 0x84FA: return !v2 || cn == "Uint32Array";
    case 0x1406: return !v2 || cn == "Float32Array";
  }
  return true;
}
M(readPixels) {
  SELF NEED(7);
  const bool v2 = gl.version() == 2;
  if (v2 && !isNull(c, argv[6]) && !isObject(c, argv[6])) {   // readPixels(..., offset) into a PIXEL_PACK_BUFFER
    gl.readPixelsToBuffer(I(0), I(1), I(2), I(3), U(4), U(5), i64(c, argv[6]));
    return nullptr;
  }
  std::uint8_t* p = nullptr;
  std::size_t n = 0, el = 1;
  if (isNull(c, argv[6])) { gl.raise(0x0501); return nullptr; }
  if (!bytesOf(c, argv[6], p, n, &el)) return typeError(c, "readPixels: pixels must be an ArrayBuffer view");
  if (!viewMatchesType(c, argv[6], U(5), v2 || U(5) == 0x1406 || U(5) == 0x8D61)) { gl.raise(0x0502); return nullptr; }
  if (v2 && argc > 7) {   // dstOffset, in elements
    const std::int64_t off = i64(c, argv[7]), total = static_cast<std::int64_t>(n / el);
    if (off < 0 || off > total) { gl.raise(0x0501); return nullptr; }
    p += off * static_cast<std::int64_t>(el); n -= static_cast<std::size_t>(off) * el;
  }
  gl.readPixels(I(0), I(1), I(2), I(3), U(4), U(5), p, n);
  return nullptr;
}

napi_value js_getContextAttributes(napi_env c, napi_value t, int, napi_value*) {
  Gl* g = self(c, t);
  if (!g) return nullptr;
  napi_value o = newObject(c);
  set(c, o, "alpha", boolean(c, g->alpha));
  set(c, o, "depth", boolean(c, g->depth));
  set(c, o, "stencil", boolean(c, g->stencil));
  set(c, o, "antialias", boolean(c, g->gl.antialias()));   // asked for and multisampled (ZN-576)
  set(c, o, "premultipliedAlpha", boolean(c, g->premultipliedAlpha));
  set(c, o, "preserveDrawingBuffer", boolean(c, g->preserveDrawingBuffer));
  set(c, o, "failIfMajorPerformanceCaveat", boolean(c, false));
  return o;
}


// ---- the rest of the surface (ZN-203.04)
napi_value typed(napi_env c, const char* ctor, const std::vector<double>& v) {
  napi_value arr = newArray(c);
  for (std::size_t i = 0; i < v.size(); ++i) setElem(c, arr, static_cast<std::uint32_t>(i), doublev(c, v[i]));
  napi_value out = nullptr;
  napi_new_instance(c, get(c, global(c), ctor), 1, &arr, &out);
  return out;
}
napi_value paramToJs(napi_env c, Gl* g, std::uint32_t pname, const WebGL1::Param& p) {
  if (!p.ok) return null(c);
  switch (p.kind) {
    case 'b': return boolean(c, !p.v.empty() && p.v[0] != 0);
    case 'i': return doublev(c, p.v.empty() ? 0 : p.v[0]);
    case 'f': return doublev(c, p.v.empty() ? 0 : p.v[0]);
    case 's': return string(c, p.s);
    case 'n': return null(c);
    case 'B': { napi_value arr = newArray(c); for (std::size_t i = 0; i < p.v.size(); ++i) setElem(c, arr, static_cast<std::uint32_t>(i), boolean(c, p.v[i] != 0)); return arr; }
    case 'U': return typed(c, "Uint32Array", p.v);
    case 'I': return typed(c, "Int32Array", p.v);
    case 'o': return wrapOnce(c, g, p.objKind, p.object);
    case 'a': {
      switch (pname) {
        case 0xBA2: case 0xC10: case 0xD3A: return typed(c, "Int32Array", p.v);                                    // VIEWPORT, SCISSOR_BOX, MAX_VIEWPORT_DIMS
        case 0x846E: case 0x846D: case 0xB70: case 0xC22: case 0x8005: case 0x8626: return typed(c, "Float32Array", p.v);   // line/point ranges, depth range, clear colour, blend colour, current attrib
        case 0x86A3: return typed(c, "Uint32Array", p.v);                                                          // COMPRESSED_TEXTURE_FORMATS
      }
      napi_value arr = newArray(c);
      for (std::size_t i = 0; i < p.v.size(); ++i) setElem(c, arr, static_cast<std::uint32_t>(i), pname == 0xC23 ? boolean(c, p.v[i] != 0) : doublev(c, p.v[i]));
      return arr;
    }
  }
  return null(c);
}
#define SET_U1(n) M(n) { SELF NEED(1); gl.n(U(0)); return nullptr; }
#define SET_U2(n) M(n) { SELF NEED(2); gl.n(U(0), U(1)); return nullptr; }
#define SET_U4(n) M(n) { SELF NEED(4); gl.n(U(0), U(1), U(2), U(3)); return nullptr; }
SET_U1(blendEquation) SET_U2(blendEquationSeparate) SET_U2(blendFunc) SET_U4(blendFuncSeparate) SET_U1(cullFace) SET_U1(depthFunc) SET_U1(frontFace) SET_U2(hint) SET_U1(stencilMask) SET_U2(stencilMaskSeparate)
M(blendColor) { SELF NEED(4); gl.blendColor(F(0), F(1), F(2), F(3)); return nullptr; }
M(clearDepth) { SELF NEED(1); gl.clearDepth(F(0)); return nullptr; }
M(clearStencil) { SELF NEED(1); gl.clearStencil(I(0)); return nullptr; }
M(colorMask) { SELF NEED(4); gl.colorMask(truthy(c, argv[0]), truthy(c, argv[1]), truthy(c, argv[2]), truthy(c, argv[3])); return nullptr; }
M(depthMask) { SELF NEED(1); gl.depthMask(truthy(c, argv[0])); return nullptr; }
M(depthRange) { SELF NEED(2); gl.depthRange(F(0), F(1)); return nullptr; }
M(lineWidth) { SELF NEED(1); gl.lineWidth(F(0)); return nullptr; }
M(polygonOffset) { SELF NEED(2); gl.polygonOffset(F(0), F(1)); return nullptr; }
M(sampleCoverage) { SELF NEED(2); gl.sampleCoverage(F(0), truthy(c, argv[1])); return nullptr; }
M(stencilFunc) { SELF NEED(3); gl.stencilFunc(U(0), I(1), U(2)); return nullptr; }
M(stencilFuncSeparate) { SELF NEED(4); gl.stencilFuncSeparate(U(0), U(1), I(2), U(3)); return nullptr; }
M(stencilOp) { SELF NEED(3); gl.stencilOp(U(0), U(1), U(2)); return nullptr; }
M(stencilOpSeparate) { SELF NEED(4); gl.stencilOpSeparate(U(0), U(1), U(2), U(3)); return nullptr; }
M(flush) { SELF gl.flush(); return nullptr; }
M(finish) { SELF gl.finish(); return nullptr; }

M(createRenderbuffer) { SELF return wrapOnce(c, g, 7, gl.createRenderbuffer()); }
M(deleteRenderbuffer) { SELF NEED(1); OBJ(o, 0, 7) gl.deleteRenderbuffer(o.id); return nullptr; }
M(bindRenderbuffer) { SELF NEED(2); OBJ(o, 1, 7) gl.bindRenderbuffer(U(0), o.id); return nullptr; }
M(renderbufferStorage) { SELF NEED(4); gl.renderbufferStorage(U(0), U(1), I(2), I(3)); return nullptr; }
M(framebufferRenderbuffer) { SELF NEED(4); OBJ(o, 3, 7) gl.framebufferRenderbuffer(U(0), U(1), U(2), o.id); return nullptr; }
M(deleteFramebuffer) { SELF NEED(1); OBJ(o, 0, 5) gl.deleteFramebuffer(o.id); return nullptr; }
M(isEnabled) { SELF NEED(1); return boolean(c, gl.isEnabled(U(0))); }
#define IS_KIND(n, K, call) M(n) { SELF NEED(1); Obj* o = as<Obj>(c, argv[0]); return boolean(c, o && (o->owner == g && o->epoch == g->epoch) && o->kind == K && gl.call(o->id)); }
IS_KIND(isShader, 2, isShader) IS_KIND(isProgram, 3, isProgram) IS_KIND(isTexture, 4, isTexture) IS_KIND(isFramebuffer, 5, isFramebuffer) IS_KIND(isRenderbuffer, 7, isRenderbuffer)
M(getShaderSource) { SELF NEED(1); OBJR(o, 0, 2) if (!gl.isShader(o.id)) return null(c); return string(c, gl.shaderSourceOf(o.id).c_str()); }
M(deleteShader) { SELF NEED(1); OBJ(o, 0, 2) gl.deleteShader(o.id); return nullptr; }
M(deleteProgram) { SELF NEED(1); OBJ(o, 0, 3) gl.deleteProgram(o.id); return nullptr; }
M(detachShader) { SELF NEED(2); OBJR(p, 0, 3) OBJR(s, 1, 2) gl.detachShader(p.id, s.id); return nullptr; }
M(validateProgram) { SELF NEED(1); OBJR(p, 0, 3) gl.validateProgram(p.id); return nullptr; }
napi_value activeInfo(napi_env c, const WebGL1::Active& a) {
  if (!a.ok) return null(c);
  napi_value o = instance(c, gActiveCtor);
  if (!o) return nullptr;
  set(c, o, "name", string(c, a.name));
  set(c, o, "size", int32v(c, a.size));
  set(c, o, "type", uint32v(c, a.type));
  return o;
}
M(getActiveUniform) { SELF NEED(2); OBJN(p, 0, 3) return activeInfo(c, gl.getActiveUniform(p.id, U(1))); }
M(getActiveAttrib) { SELF NEED(2); OBJN(p, 0, 3) return activeInfo(c, gl.getActiveAttrib(p.id, U(1))); }
M(getParameter) { SELF NEED(1); std::uint32_t pn = U(0); return paramToJs(c, g, pn, gl.getParameter(pn)); }
M(getVertexAttrib) { SELF NEED(2); std::uint32_t pn = U(1); return paramToJs(c, g, pn, gl.getVertexAttrib(U(0), pn)); }
M(getBufferParameter) { SELF NEED(2); return paramToJs(c, g, U(1), gl.getBufferParameter(U(0), U(1))); }
M(getTexParameter) { SELF NEED(2); return paramToJs(c, g, U(1), gl.getTexParameter(U(0), U(1))); }
M(getUniform) { SELF NEED(2); OBJR(p, 0, 3) if (isNull(c, argv[1]) || isUndef(c, argv[1])) return typeError(c, "getUniform: location is required"); bool ok, fo; UniformLoc l = locOf(c, g, argv[1], ok, fo); if (!ok) return nullptr; if (fo) return null(c); return paramToJs(c, g, 0, gl.getUniform(p.id, l)); }
M(getShaderPrecisionFormat) {
  SELF NEED(2);
  int out[3];
  gl.getShaderPrecisionFormat(U(0), U(1), out);
  napi_value o = instance(c, gPrecisionCtor);
  if (!o) return nullptr;
  set(c, o, "rangeMin", int32v(c, out[0]));
  set(c, o, "rangeMax", int32v(c, out[1]));
  set(c, o, "precision", int32v(c, out[2]));
  return o;
}
M(getAttachedShaders) {
  SELF NEED(1); OBJR(p, 0, 3)
  napi_value arr = newArray(c);
  std::uint32_t i = 0;
  for (Id sid : gl.attachedShaders(p.id)) setElem(c, arr, i++, wrapOnce(c, g, 2, sid));
  return arr;
}
M(getVertexAttribOffset) { SELF NEED(2); if (U(1) != 0x8645) { gl.raise(0x0500); return null(c); } if (U(0) >= kMaxVertexAttribs) { gl.raise(0x0501); return null(c); } return int64v(c, gl.attribOffset(U(0))); }

M(uniform3f) { SELF NEED(4); LOC gl.uniform3f(l, F(1), F(2), F(3)); return nullptr; }
M(uniform2i) { SELF NEED(3); LOC gl.uniform2i(l, I(1), I(2)); return nullptr; }
M(uniform3i) { SELF NEED(4); LOC gl.uniform3i(l, I(1), I(2), I(3)); return nullptr; }
M(uniform4i) { SELF NEED(5); LOC gl.uniform4i(l, I(1), I(2), I(3), I(4)); return nullptr; }
napi_value uniformFv(napi_env c, Gl* g, int n, int argc, napi_value* argv) {
  if (argc < 2) return typeError(c, "not enough arguments");
  bool ok, fo; UniformLoc l = locOf(c, g, argv[0], ok, fo); if (!ok) return nullptr; if (fo) return nullptr;
  std::vector<float> v;
  if (!floatsOf(c, argv[1], v)) return typeError(c, "value must be a Float32Array or an array");
  g->gl.uniformNfv(l, n, v.data(), v.size());
  return nullptr;
}
napi_value uniformIv(napi_env c, Gl* g, int n, int argc, napi_value* argv, bool uns = false) {
  if (argc < 2) return typeError(c, "not enough arguments");
  bool ok, fo; UniformLoc l = locOf(c, g, argv[0], ok, fo); if (!ok) return nullptr; if (fo) return nullptr;
  std::vector<int> v;
  std::uint8_t* p = nullptr; std::size_t nb = 0;
  if (bytesOf(c, argv[1], p, nb)) { v.resize(nb / 4); std::memcpy(v.data(), p, v.size() * 4); }
  else if (isArray(c, argv[1])) { std::uint32_t len = lengthOf(c, argv[1]); for (std::uint32_t i = 0; i < len; ++i) { napi_value e = elem(c, argv[1], i); v.push_back(i32(c, e)); } }
  else return typeError(c, "value must be an Int32Array or an array");
  if (uns) g->gl.uniformNui(l, n, reinterpret_cast<const std::uint32_t*>(v.data()), v.size());
  else g->gl.uniformNiv(l, n, v.data(), v.size());
  return nullptr;
}
#define UNI_FV(k) M(uniform##k##fv) { SELF return uniformFv(c, g, k, argc, argv); }
#define UNI_IV(k) M(uniform##k##iv) { SELF return uniformIv(c, g, k, argc, argv); }
UNI_FV(1) UNI_FV(2) UNI_FV(3) UNI_FV(4) UNI_IV(1) UNI_IV(2) UNI_IV(3) UNI_IV(4)
#define UNI_UIV(k) M(uniform##k##uiv) { SELF return uniformIv(c, g, k, argc, argv, true); }
UNI_UIV(1) UNI_UIV(2) UNI_UIV(3) UNI_UIV(4)
napi_value uniformMat(napi_env c, Gl* g, int n, int argc, napi_value* argv) {
  if (argc < 3) return typeError(c, "not enough arguments");
  bool ok, fo; UniformLoc l = locOf(c, g, argv[0], ok, fo); if (!ok) return nullptr; if (fo) return nullptr;
  std::vector<float> v;
  if (!floatsOf(c, argv[2], v)) return typeError(c, "value must be a Float32Array or an array");
  g->gl.uniformMatrixNfv(l, n, truthy(c, argv[1]), v.data(), v.size());
  return nullptr;
}
M(uniformMatrix2fv) { SELF return uniformMat(c, g, 2, argc, argv); }
M(uniformMatrix3fv) { SELF return uniformMat(c, g, 3, argc, argv); }
napi_value attribF(napi_env c, Gl* g, int n, bool vec, int argc, napi_value* argv) {
  if (argc < 1 + (vec ? 1 : n)) return typeError(c, "not enough arguments");
  float v[4] = {0, 0, 0, 1};
  if (vec) { std::vector<float> a; if (!floatsOf(c, argv[1], a)) return typeError(c, "value must be a Float32Array or an array"); if (static_cast<int>(a.size()) < n) { g->gl.raise(0x0501); return nullptr; } for (int i = 0; i < n; ++i) v[i] = a[i]; }
  else for (int i = 0; i < n; ++i) v[i] = static_cast<float>(num(c, argv[1 + i]));
  g->gl.vertexAttribNf(u32(c, argv[0]), n, v);
  return nullptr;
}
#define ATTR_F(k) M(vertexAttrib##k##f) { SELF return attribF(c, g, k, false, argc, argv); } M(vertexAttrib##k##fv) { SELF return attribF(c, g, k, true, argc, argv); }
ATTR_F(1) ATTR_F(2) ATTR_F(3) ATTR_F(4)
M(texSubImage2D) {
  SELF NEED(7);
  std::uint8_t* p = nullptr; std::size_t n = 0;
  std::size_t el = 1;
  if (argc < 9 || (argc == 9 && isObject(c, argv[8]) && !bytesOf(c, argv[8], p, n))) {   // texSubImage2D(target, level, xoffset, yoffset, format, type, source) and the sized form
    const bool sized = argc >= 9;
    std::vector<std::uint8_t> px; int w = 0, h = 0;
    const int st = domPixels(c, gl, argv[sized ? 8 : 6], U(sized ? 6 : 4), U(sized ? 7 : 5), sized ? I(4) : -1, sized ? I(5) : -1, 1, px, w, h);
    if (st < 0) return typeError(c, "texSubImage2D: not enough arguments, or the source is not a DOM pixel source");
    if (st == 0) { gl.raise(0x0501); return nullptr; }
    if (st == 2) { gl.raise(0x0502); return nullptr; }
    gl.domUnpack(true);
    gl.texSubImage2D(U(0), I(1), I(2), I(3), w, h, U(sized ? 6 : 4), U(sized ? 7 : 5), px.data(), px.size());
    gl.domUnpack(false);
    return nullptr;
  }
  NEED(9);
  if (!bytesOf(c, argv[8], p, n, &el)) return typeError(c, "texSubImage2D: pixels must be an ArrayBuffer view");
  if (!v1ViewOk(c, gl, argv[8], U(7))) { gl.raise(0x0502); return nullptr; }
  if (!viewOffset(c, gl, argc, argv, 9, el, p, n)) return nullptr;
  gl.texSubImage2D(U(0), I(1), I(2), I(3), I(4), I(5), U(6), U(7), p, n);
  return nullptr;
}
M(copyTexImage2D) { SELF NEED(8); gl.copyTexImage2D(U(0), I(1), U(2), I(3), I(4), I(5), I(6), I(7)); return nullptr; }
M(copyTexSubImage2D) { SELF NEED(8); gl.copyTexSubImage2D(U(0), I(1), I(2), I(3), I(4), I(5), I(6), I(7)); return nullptr; }
M(generateMipmap) { SELF NEED(1); gl.generateMipmap(U(0)); return nullptr; }
M(getRenderbufferParameter) { SELF NEED(2); return paramToJs(c, g, U(1), gl.getRenderbufferParameter(U(0), U(1))); }
M(getFramebufferAttachmentParameter) { SELF NEED(3); std::uint32_t pn = U(2); return paramToJs(c, g, pn, gl.getFramebufferAttachmentParameter(U(0), U(1), pn)); }

using Method = napi_value (*)(napi_env c, napi_value t, int argc, napi_value* argv);
struct Fn { const char* name; Method fn; int len; };
M(getExtension);
M(getSupportedExtensions);
M(isContextLost);
M(compressedTexImage2D);
M(compressedTexSubImage2D);
#define F_(n, len) {#n, js_##n, len}
const Fn kMethods[] = {
  F_(getError, 0), F_(enable, 1), F_(disable, 1), F_(viewport, 4), F_(scissor, 4), F_(clearColor, 4), F_(clear, 1), F_(pixelStorei, 2),
  F_(createBuffer, 0), F_(deleteBuffer, 1), F_(isBuffer, 1), F_(bindBuffer, 2), F_(bufferData, 3), F_(bufferSubData, 3),
  F_(createShader, 1), F_(shaderSource, 2), F_(compileShader, 1), F_(getShaderParameter, 2), F_(getShaderInfoLog, 1),
  F_(createProgram, 0), F_(attachShader, 2), F_(bindAttribLocation, 3), F_(linkProgram, 1), F_(getProgramParameter, 2), F_(getProgramInfoLog, 1), F_(useProgram, 1),
  F_(getAttribLocation, 2), F_(getUniformLocation, 2), F_(uniform1f, 2), F_(uniform2f, 3), F_(uniform4f, 5), F_(uniform1i, 2), F_(uniformMatrix4fv, 3),
  F_(enableVertexAttribArray, 1), F_(disableVertexAttribArray, 1), F_(vertexAttribPointer, 6), F_(drawArrays, 3), F_(drawElements, 4),
  F_(createTexture, 0), F_(deleteTexture, 1), F_(bindTexture, 2), F_(activeTexture, 1), F_(texParameteri, 3), F_(texParameterf, 3), F_(texImage2D, 9),
  F_(createFramebuffer, 0), F_(bindFramebuffer, 2), F_(framebufferTexture2D, 5), F_(checkFramebufferStatus, 1), F_(readPixels, 7), F_(zincPresent, 1),
  F_(getContextAttributes, 0), F_(getExtension, 1), F_(isContextLost, 0), F_(compressedTexImage2D, 7), F_(compressedTexSubImage2D, 9),
  F_(blendColor, 4),
  F_(blendEquation, 1),
  F_(blendEquationSeparate, 2),
  F_(blendFunc, 2),
  F_(blendFuncSeparate, 4),
  F_(clearDepth, 1),
  F_(clearStencil, 1),
  F_(colorMask, 4),
  F_(cullFace, 1),
  F_(depthFunc, 1),
  F_(depthMask, 1),
  F_(depthRange, 2),
  F_(frontFace, 1),
  F_(hint, 2),
  F_(lineWidth, 1),
  F_(polygonOffset, 2),
  F_(sampleCoverage, 2),
  F_(stencilFunc, 3),
  F_(stencilFuncSeparate, 4),
  F_(stencilMask, 1),
  F_(stencilMaskSeparate, 2),
  F_(stencilOp, 3),
  F_(stencilOpSeparate, 4),
  F_(flush, 0),
  F_(finish, 0),
  F_(createRenderbuffer, 0),
  F_(deleteRenderbuffer, 1),
  F_(bindRenderbuffer, 2),
  F_(renderbufferStorage, 4),
  F_(framebufferRenderbuffer, 4),
  F_(deleteFramebuffer, 1),
  F_(isEnabled, 1),
  F_(isShader, 1),
  F_(isProgram, 1),
  F_(isTexture, 1),
  F_(isFramebuffer, 1),
  F_(isRenderbuffer, 1),
  F_(getShaderSource, 1),
  F_(deleteShader, 1),
  F_(deleteProgram, 1),
  F_(detachShader, 2),
  F_(validateProgram, 1),
  F_(getActiveUniform, 2),
  F_(getActiveAttrib, 2),
  F_(getParameter, 1),
  F_(getVertexAttrib, 2),
  F_(getBufferParameter, 2),
  F_(getTexParameter, 2),
  F_(getUniform, 2),
  F_(getShaderPrecisionFormat, 2),
  F_(getSupportedExtensions, 0), F_(getAttachedShaders, 1),
  F_(getVertexAttribOffset, 2),
  F_(uniform3f, 4),
  F_(uniform2i, 3),
  F_(uniform3i, 4),
  F_(uniform4i, 5),
  F_(uniform1fv, 2),
  F_(uniform2fv, 2),
  F_(uniform3fv, 2),
  F_(uniform4fv, 2),
  F_(uniform1iv, 2),
  F_(uniform2iv, 2),
  F_(uniform3iv, 2),
  F_(uniform4iv, 2),
  F_(uniformMatrix2fv, 3),
  F_(uniformMatrix3fv, 3),
  F_(vertexAttrib1f, 2),
  F_(vertexAttrib1fv, 2),
  F_(vertexAttrib2f, 3),
  F_(vertexAttrib2fv, 2),
  F_(vertexAttrib3f, 4),
  F_(vertexAttrib3fv, 2),
  F_(vertexAttrib4f, 5),
  F_(vertexAttrib4fv, 2),
  F_(texSubImage2D, 9),
  F_(copyTexImage2D, 8),
  F_(copyTexSubImage2D, 8),
  F_(generateMipmap, 1),
  F_(getRenderbufferParameter, 2),
  F_(getFramebufferAttachmentParameter, 3),
};

// ---- WebGL 2.0 (ZN-203.05)
#define NEED2 if (gl.version() != 2) return typeError(c, "not a WebGL 2 context")
M(createVertexArray) { SELF return wrapOnce(c, g, 8, gl.createVertexArray()); }
M(deleteVertexArray) { SELF NEED(1); OBJ(o, 0, 8) gl.deleteVertexArray(o.id); return nullptr; }
M(bindVertexArray) { SELF NEED(1); OBJ(o, 0, 8) gl.bindVertexArray(o.id); return nullptr; }
M(isVertexArray) { SELF NEED(1); Obj* o = as<Obj>(c, argv[0]); return boolean(c, o && (o->owner == g && o->epoch == g->epoch) && o->kind == 8 && gl.isVertexArray(o->id)); }
M(vertexAttribDivisor) { SELF NEED(2); gl.vertexAttribDivisor(U(0), U(1)); return nullptr; }
M(drawArraysInstanced) { SELF NEED(4); gl.drawArraysInstanced(U(0), I(1), I(2), I(3)); return nullptr; }
M(drawElementsInstanced) { SELF NEED(5); gl.drawElementsInstanced(U(0), I(1), U(2), i64(c, argv[3]), I(4)); return nullptr; }
M(drawRangeElements) { SELF NEED(6); gl.drawRangeElements(U(0), U(1), U(2), I(3), U(4), i64(c, argv[5])); return nullptr; }
M(drawBuffers) {
  SELF NEED(1);
  std::vector<float> v;
  std::uint32_t bufs[16];
  std::uint32_t n = lengthOf(c, argv[0]);
  if (n > 16) n = 16;
  for (std::uint32_t i = 0; i < n; ++i) { napi_value e = elem(c, argv[0], i); bufs[i] = u32(c, e); }
  gl.drawBuffers(bufs, static_cast<int>(n));
  return nullptr;
}
M(readBuffer) { SELF NEED(1); gl.readBuffer(U(0)); return nullptr; }
M(bindBufferBase) { SELF NEED(3); OBJ(o, 2, 1) gl.bindBufferBase(U(0), U(1), o.id); return nullptr; }
M(bindBufferRange) { SELF NEED(5); OBJ(o, 2, 1) gl.bindBufferRange(U(0), U(1), o.id, i64(c, argv[3]), i64(c, argv[4])); return nullptr; }
M(getUniformBlockIndex) { SELF NEED(2); OBJR(p, 0, 3) return uint32v(c, gl.getUniformBlockIndex(p.id, str(c, argv[1]))); }
M(uniformBlockBinding) { SELF NEED(3); OBJR(p, 0, 3) gl.uniformBlockBinding(p.id, U(1), U(2)); return nullptr; }
M(getActiveUniformBlockParameter) { SELF NEED(3); OBJR(p, 0, 3) std::uint32_t pn = U(2); return paramToJs(c, g, pn, gl.getActiveUniformBlockParameter(p.id, U(1), pn)); }
M(getActiveUniformBlockName) { SELF NEED(2); OBJR(p, 0, 3) bool ok = false; std::string s = gl.getActiveUniformBlockName(p.id, U(1), ok); return ok ? string(c, s) : null(c); }
M(copyBufferSubData) { SELF NEED(5); gl.copyBufferSubData(U(0), U(1), i64(c, argv[2]), i64(c, argv[3]), i64(c, argv[4])); return nullptr; }
M(getBufferSubData) {
  SELF NEED(3);
  std::uint8_t* p = nullptr; std::size_t n = 0;
  { bool typedArray = false; if (napi_is_typedarray(c, argv[2], &typedArray) != napi_ok || !typedArray) return typeError(c, "getBufferSubData: dstData must be an ArrayBuffer view"); }
  int r = viewSlice(c, gl, argc, argv, 2, p, n);
  if (!r) return typeError(c, "getBufferSubData: dstData must be an ArrayBuffer view");
  if (r == 1) gl.getBufferSubData(U(0), i64(c, argv[1]), p, n);
  return nullptr;
}
M(uniform1ui) { SELF NEED(2); LOC std::uint32_t v[1] = {U(1)}; gl.uniformNui(l, 1, v, 1); return nullptr; }
M(uniform2ui) { SELF NEED(3); LOC std::uint32_t v[2] = {U(1), U(2)}; gl.uniformNui(l, 2, v, 2); return nullptr; }
M(uniform3ui) { SELF NEED(4); LOC std::uint32_t v[3] = {U(1), U(2), U(3)}; gl.uniformNui(l, 3, v, 3); return nullptr; }
M(uniform4ui) { SELF NEED(5); LOC std::uint32_t v[4] = {U(1), U(2), U(3), U(4)}; gl.uniformNui(l, 4, v, 4); return nullptr; }
M(vertexAttribIPointer) { SELF NEED(5); gl.vertexAttribIPointer(U(0), I(1), U(2), I(3), i64(c, argv[4])); return nullptr; }

// ---- WebGL 2.0 textures, samplers, queries, sync, transform feedback (ZN-203.07)
bool dataArg(napi_env c, napi_value v, const void*& p, std::size_t& n, bool& nul, std::size_t* elem = nullptr) {   // false after throwing
  p = nullptr; n = 0; nul = isNull(c, v) || isUndef(c, v);
  if (nul) return true;
  std::uint8_t* b = nullptr;
  if (!bytesOf(c, v, b, n, elem)) { typeError(c, "pixels must be null or an ArrayBuffer view"); return false; }
  p = b;
  return true;
}
M(texImage3D) {
  SELF NEED2; NEED(10);
  if (isObject(c, argv[9]) && !isView(c, argv[9])) {   // a DOM source: ImageData, a canvas
    std::vector<std::uint8_t> px; int w = 0, h = 0;
    const int st = domPixels(c, gl, argv[9], U(7), U(8), I(3), I(4), I(5), px, w, h);
    if (st < 0) return typeError(c, "texImage3D: pixels must be null, an ArrayBuffer view or a DOM pixel source");
    if (st == 0) { gl.raise(0x0501); return nullptr; }
    if (st == 2) { gl.raise(0x0502); return nullptr; }
    gl.domUnpack(true);
    gl.texImage3D(U(0), I(1), U(2), w, h, I(5), I(6), U(7), U(8), px.data(), px.size());
    gl.domUnpack(false);
    return nullptr;
  }
  const void* p; std::size_t n; bool nul;
  std::size_t el = 1;
  if (!dataArg(c, argv[9], p, n, nul, &el)) return nullptr;
  { std::uint8_t* q = const_cast<std::uint8_t*>(static_cast<const std::uint8_t*>(p)); if (!viewOffset(c, gl, argc, argv, 10, el, q, n)) return nullptr; p = q; }
  gl.texImage3D(U(0), I(1), U(2), I(3), I(4), I(5), I(6), U(7), U(8), p, n);
  return nullptr;
}
M(texSubImage3D) {
  SELF NEED2; NEED(11);
  if (isObject(c, argv[10]) && !isView(c, argv[10])) {
    std::vector<std::uint8_t> px; int w = 0, h = 0;
    const int st = domPixels(c, gl, argv[10], U(8), U(9), I(5), I(6), I(7), px, w, h);
    if (st < 0) return typeError(c, "texSubImage3D: pixels must be an ArrayBuffer view or a DOM pixel source");
    if (st == 0) { gl.raise(0x0501); return nullptr; }
    if (st == 2) { gl.raise(0x0502); return nullptr; }
    gl.domUnpack(true);
    gl.texSubImage3D(U(0), I(1), I(2), I(3), I(4), w, h, I(7), U(8), U(9), px.data(), px.size());
    gl.domUnpack(false);
    return nullptr;
  }
  const void* p; std::size_t n; bool nul;
  std::size_t el = 1;
  if (!dataArg(c, argv[10], p, n, nul, &el)) return nullptr;
  { std::uint8_t* q = const_cast<std::uint8_t*>(static_cast<const std::uint8_t*>(p)); if (!viewOffset(c, gl, argc, argv, 11, el, q, n)) return nullptr; p = q; }
  gl.texSubImage3D(U(0), I(1), I(2), I(3), I(4), I(5), I(6), I(7), U(8), U(9), p, n);
  return nullptr;
}
M(texStorage2D) { SELF NEED2; NEED(5); gl.texStorage2D(U(0), I(1), U(2), I(3), I(4)); return nullptr; }
M(texStorage3D) { SELF NEED2; NEED(6); gl.texStorage3D(U(0), I(1), U(2), I(3), I(4), I(5)); return nullptr; }
M(copyTexSubImage3D) { SELF NEED2; NEED(9); gl.copyTexSubImage3D(U(0), I(1), I(2), I(3), I(4), I(5), I(6), I(7), I(8)); return nullptr; }
M(createSampler) { SELF NEED2; return wrapOnce(c, g, 9, gl.createSampler()); }
M(deleteSampler) { SELF NEED(1); OBJ(o, 0, 9) gl.deleteSampler(o.id); return nullptr; }
M(isSampler) { SELF NEED(1); Obj* o = as<Obj>(c, argv[0]); return boolean(c, o && (o->owner == g && o->epoch == g->epoch) && o->kind == 9 && gl.isSampler(o->id)); }
M(bindSampler) { SELF NEED(2); OBJ(o, 1, 9) gl.bindSampler(U(0), o.id); return nullptr; }
M(samplerParameteri) { SELF NEED(3); OBJR(o, 0, 9) gl.samplerParameteri(o.id, U(1), I(2)); return nullptr; }
M(samplerParameterf) { SELF NEED(3); OBJR(o, 0, 9) gl.samplerParameterf(o.id, U(1), F(2)); return nullptr; }
M(getSamplerParameter) { SELF NEED(2); OBJR(o, 0, 9) std::uint32_t pn = U(1); return paramToJs(c, g, pn, gl.getSamplerParameter(o.id, pn)); }
M(createQuery) { SELF NEED2; return wrapOnce(c, g, 10, gl.createQuery()); }
M(deleteQuery) { SELF NEED(1); OBJ(o, 0, 10) gl.deleteQuery(o.id); return nullptr; }
M(isQuery) { SELF NEED(1); Obj* o = as<Obj>(c, argv[0]); return boolean(c, o && (o->owner == g && o->epoch == g->epoch) && o->kind == 10 && gl.isQuery(o->id)); }
M(beginQuery) { SELF NEED(2); OBJR(o, 1, 10) gl.beginQuery(U(0), o.id); return nullptr; }
// queries and fences become available only once the event loop has turned: a timer of 0 ms marks that task boundary (later)
enum Later { kBoundary, kComposite, kLostEvent, kRestoreNow };
// `what` runs on a timer of 0 ms through the helper install makes (js_timer), which keeps the context object alive until then; false without setTimeout
bool later(napi_env c, napi_value ctxObj, Later what) {
  napi_value fn = nullptr;
  if (!gLater || !ctxObj || napi_get_reference_value(c, gLater, &fn) != napi_ok || !fn) return false;
  napi_value args[2] = {ctxObj, int32v(c, what)};
  napi_value r = call(c, fn, nullptr, 2, args);
  return r && truthy(c, r);
}
// the context object of a call: `this`, or for an extension's method the context its WeakRef still holds
napi_value ctxObject(napi_env c, napi_value t, Gl* g) {
  if (as<Gl>(c, t) == g) return t;
  napi_value weak = nullptr;
  if (!g->weakSelf || napi_get_reference_value(c, g->weakSelf, &weak) != napi_ok || !weak) return nullptr;
  napi_value o = call(c, get(c, weak, "deref"), weak, 0, nullptr);
  return o && isObject(c, o) ? o : nullptr;
}
void scheduleBoundary(napi_env c, napi_value t, Gl* g) {
  if (g->boundaryScheduled || !g->gl.taskPending()) return;
  if (later(c, ctxObject(c, t, g), kBoundary)) g->boundaryScheduled = true;
  else g->gl.taskBoundary();   // no event loop to wait for
}
M(endQuery) { SELF NEED(1); gl.endQuery(U(0)); scheduleBoundary(c, t, g); return nullptr; }
M(getQuery) { SELF NEED(2); return paramToJs(c, g, U(1), gl.getQuery(U(0), U(1))); }
M(getQueryParameter) { SELF NEED(2); OBJR(o, 0, 10) return paramToJs(c, g, U(1), gl.getQueryParameter(o.id, U(1))); }
M(fenceSync) { SELF NEED2; NEED(2); Id id = gl.fenceSync(U(0), U(1)); scheduleBoundary(c, t, g); return id ? wrapOnce(c, g, 11, id) : null(c); }
M(isSync) { SELF NEED(1); Obj* o = as<Obj>(c, argv[0]); return boolean(c, o && (o->owner == g && o->epoch == g->epoch) && o->kind == 11 && gl.isSync(o->id)); }
M(deleteSync) { SELF NEED(1); OBJ(o, 0, 11) gl.deleteSync(o.id); return nullptr; }
M(clientWaitSync) { SELF NEED(3); OBJR(o, 0, 11) return uint32v(c, gl.clientWaitSync(o.id, U(1), num(c, argv[2]))); }
M(waitSync) { SELF NEED(3); OBJR(o, 0, 11) gl.waitSync(o.id, U(1), i64(c, argv[2])); return nullptr; }
M(getSyncParameter) { SELF NEED(2); OBJR(o, 0, 11) return paramToJs(c, g, U(1), gl.getSyncParameter(o.id, U(1))); }
M(createTransformFeedback) { SELF NEED2; return wrapOnce(c, g, 12, gl.createTransformFeedback()); }
M(deleteTransformFeedback) { SELF NEED(1); OBJ(o, 0, 12) gl.deleteTransformFeedback(o.id); return nullptr; }
M(isTransformFeedback) { SELF NEED(1); Obj* o = as<Obj>(c, argv[0]); return boolean(c, o && (o->owner == g && o->epoch == g->epoch) && o->kind == 12 && gl.isTransformFeedback(o->id)); }
M(bindTransformFeedback) { SELF NEED(2); OBJ(o, 1, 12) gl.bindTransformFeedback(U(0), o.id); return nullptr; }
M(beginTransformFeedback) { SELF NEED(1); gl.beginTransformFeedback(U(0)); return nullptr; }
M(endTransformFeedback) { SELF gl.endTransformFeedback(); return nullptr; }
M(pauseTransformFeedback) { SELF gl.pauseTransformFeedback(); return nullptr; }
M(resumeTransformFeedback) { SELF gl.resumeTransformFeedback(); return nullptr; }
M(transformFeedbackVaryings) {
  SELF NEED(3); OBJR(p, 0, 3)
  std::vector<std::string> names;
  std::uint32_t n = lengthOf(c, argv[1]);
  for (std::uint32_t i = 0; i < n; ++i) { napi_value e = elem(c, argv[1], i); names.push_back(str(c, e)); }
  gl.transformFeedbackVaryings(p.id, names, U(2));
  return nullptr;
}
M(getTransformFeedbackVarying) { SELF NEED(2); OBJR(p, 0, 3) return activeInfo(c, gl.getTransformFeedbackVarying(p.id, U(1))); }
M(blitFramebuffer) { SELF NEED(10); gl.blitFramebuffer(I(0), I(1), I(2), I(3), I(4), I(5), I(6), I(7), U(8), U(9)); return nullptr; }
M(renderbufferStorageMultisample) { SELF NEED(5); gl.renderbufferStorageMultisample(U(0), I(1), U(2), I(3), I(4)); return nullptr; }
M(clearBufferfv) { SELF NEED(3); std::vector<float> v; if (!floatsOf(c, argv[2], v)) return typeError(c, "values must be a Float32Array or an array"); gl.clearBufferfv(U(0), I(1), v.data(), v.size()); return nullptr; }
M(clearBufferiv) {
  SELF NEED(3); std::vector<int> v; std::uint8_t* p = nullptr; std::size_t nb = 0;
  if (bytesOf(c, argv[2], p, nb)) { v.resize(nb / 4); std::memcpy(v.data(), p, v.size() * 4); }
  else if (isArray(c, argv[2])) { std::uint32_t len = lengthOf(c, argv[2]); for (std::uint32_t i = 0; i < len; ++i) { napi_value e = elem(c, argv[2], i); v.push_back(i32(c, e)); } }
  else return typeError(c, "values must be an Int32Array or an array");
  gl.clearBufferiv(U(0), I(1), v.data(), v.size());
  return nullptr;
}
M(clearBufferuiv) {
  SELF NEED(3); std::vector<std::uint32_t> v; std::uint8_t* p = nullptr; std::size_t nb = 0;
  if (bytesOf(c, argv[2], p, nb)) { v.resize(nb / 4); std::memcpy(v.data(), p, v.size() * 4); }
  else if (isArray(c, argv[2])) { std::uint32_t len = lengthOf(c, argv[2]); for (std::uint32_t i = 0; i < len; ++i) { napi_value e = elem(c, argv[2], i); v.push_back(u32(c, e)); } }
  else return typeError(c, "values must be a Uint32Array or an array");
  gl.clearBufferuiv(U(0), I(1), v.data(), v.size());
  return nullptr;
}
M(clearBufferfi) { SELF NEED(4); gl.clearBufferfi(U(0), I(1), F(2), I(3)); return nullptr; }
M(invalidateFramebuffer) {
  SELF NEED(2);
  std::uint32_t a[16]; std::uint32_t n = lengthOf(c, argv[1]); if (n > 16) n = 16;
  for (std::uint32_t i = 0; i < n; ++i) { napi_value e = elem(c, argv[1], i); a[i] = u32(c, e); }
  gl.invalidateFramebuffer(U(0), a, static_cast<int>(n));
  return nullptr;
}
M(framebufferTextureLayer) { SELF NEED(5); OBJ(o, 2, 4) gl.framebufferTextureLayer(U(0), U(1), o.id, I(3), I(4)); return nullptr; }
M(getFragDataLocation) { SELF NEED(2); OBJR(p, 0, 3) return int32v(c, gl.getFragDataLocation(p.id, str(c, argv[1]))); }
M(getInternalformatParameter) {
  SELF NEED(3);
  bool ok = false;
  std::vector<int> v = gl.getInternalformatParameter(U(0), U(1), U(2), ok);
  if (!ok) return null(c);
  std::vector<double> d(v.begin(), v.end());
  return typed(c, "Int32Array", d);
}


// ---- more WebGL 2 (ZN-203.09)
M(getIndexedParameter) { SELF NEED2; NEED(2); return paramToJs(c, g, 0, gl.getIndexedParameter(U(0), U(1))); }
M(getUniformIndices) {
  SELF NEED2; NEED(2); OBJR(p, 0, 3)
  std::vector<std::string> names;
  std::uint32_t n = lengthOf(c, argv[1]);
  for (std::uint32_t i = 0; i < n; ++i) { napi_value e = elem(c, argv[1], i); names.push_back(str(c, e)); }
  std::vector<std::uint32_t> idx = gl.getUniformIndices(p.id, names);
  napi_value arr = newArray(c);
  for (std::size_t i = 0; i < idx.size(); ++i) setElem(c, arr, static_cast<std::uint32_t>(i), uint32v(c, idx[i]));
  return arr;
}
M(getActiveUniforms) {
  SELF NEED2; NEED(3); OBJR(p, 0, 3)
  std::vector<std::uint32_t> idx;
  std::uint32_t n = lengthOf(c, argv[1]);
  for (std::uint32_t i = 0; i < n; ++i) { napi_value e = elem(c, argv[1], i); idx.push_back(u32(c, e)); }
  bool ok = false;
  std::uint32_t pn = U(2);
  WebGL1::Param r = gl.getActiveUniforms(p.id, idx, pn, ok);
  if (!ok) return null(c);
  return paramToJs(c, g, 0, r);
}
napi_value matRC(napi_env c, Gl* g, int cols, int rows, int argc, napi_value* argv) {
  if (g->gl.version() != 2) return typeError(c, "not a WebGL 2 context");
  if (argc < 3) return typeError(c, "not enough arguments");
  bool ok, fo; UniformLoc l = locOf(c, g, argv[0], ok, fo); if (!ok) return nullptr; if (fo) return nullptr;
  std::vector<float> v;
  if (!floatsOf(c, argv[2], v)) return typeError(c, "value must be a Float32Array or an array");
  g->gl.uniformMatrixRC(l, cols, rows, truthy(c, argv[1]), v.data(), v.size());
  return nullptr;
}
#define MAT_RC(cols, rows) M(uniformMatrix##cols##x##rows##fv) { SELF return matRC(c, g, cols, rows, argc, argv); }
MAT_RC(2, 3) MAT_RC(2, 4) MAT_RC(3, 2) MAT_RC(3, 4) MAT_RC(4, 2) MAT_RC(4, 3)
M(vertexAttribI4i) { SELF NEED2; NEED(5); int v[4] = {I(1), I(2), I(3), I(4)}; gl.vertexAttribINi(U(0), v); return nullptr; }
M(vertexAttribI4ui) { SELF NEED2; NEED(5); std::uint32_t v[4] = {U(1), U(2), U(3), U(4)}; gl.vertexAttribINui(U(0), v); return nullptr; }
M(vertexAttribI4iv) {
  SELF NEED2; NEED(2); std::uint8_t* p = nullptr; std::size_t nb = 0; int v[4] = {0, 0, 0, 1};
  if (bytesOf(c, argv[1], p, nb)) { if (nb < 16) { gl.raise(0x0501); return nullptr; } std::memcpy(v, p, 16); }
  else if (isArray(c, argv[1])) {
    const std::uint32_t len = lengthOf(c, argv[1]);
    if (len < 4) { gl.raise(0x0501); return nullptr; } for (int i = 0; i < 4; ++i) { napi_value e = elem(c, argv[1], static_cast<std::uint32_t>(i)); v[i] = i32(c, e); } }
  else return typeError(c, "value must be an Int32Array or an array of 4");
  gl.vertexAttribINi(U(0), v);
  return nullptr;
}
M(vertexAttribI4uiv) {
  SELF NEED2; NEED(2); std::uint8_t* p = nullptr; std::size_t nb = 0; std::uint32_t v[4] = {0, 0, 0, 1};
  if (bytesOf(c, argv[1], p, nb)) { if (nb < 16) { gl.raise(0x0501); return nullptr; } std::memcpy(v, p, 16); }
  else if (isArray(c, argv[1])) {
    const std::uint32_t len = lengthOf(c, argv[1]);
    if (len < 4) { gl.raise(0x0501); return nullptr; } for (int i = 0; i < 4; ++i) { napi_value e = elem(c, argv[1], static_cast<std::uint32_t>(i)); v[i] = u32(c, e); } }
  else return typeError(c, "value must be a Uint32Array or an array of 4");
  gl.vertexAttribINui(U(0), v);
  return nullptr;
}
M(invalidateSubFramebuffer) { SELF NEED2; NEED(6); if (I(4) < 0 || I(5) < 0) { gl.raise(0x0501); return nullptr; } return js_invalidateFramebuffer(c, t, 2, argv); }
// (WebGL 1 has these in the core API: no compressed format exists until an extension brings one). WebGL 2 adds srcOffset and srcLength (in elements) after the view.
M(compressedTexImage2D) {
  SELF NEED(7);
  std::uint8_t* p = nullptr; std::size_t n = 0, el = 1;
  if (gl.version() == 2 && argc >= 8 && !isObject(c, argv[6])) { gl.compressedTexImage2D(U(0), I(1), U(2), I(3), I(4), I(5), nullptr, static_cast<std::size_t>(U(6)), i64(c, argv[7])); return nullptr; }   // imageSize, offset into the PIXEL_UNPACK_BUFFER
  if (!bytesOf(c, argv[6], p, n, &el)) return typeError(c, "compressedTexImage2D: data must be an ArrayBuffer view");
  if (gl.version() == 2) { int r = viewSlice(c, gl, argc, argv, 6, p, n); if (r == 2) return nullptr; }
  gl.compressedTexImage2D(U(0), I(1), U(2), I(3), I(4), I(5), p, n);
  return nullptr;
}
M(compressedTexSubImage2D) {
  SELF NEED(8);
  std::uint8_t* p = nullptr; std::size_t n = 0, el = 1;
  if (gl.version() == 2 && argc >= 9 && !isObject(c, argv[7])) { gl.compressedTexSubImage2D(U(0), I(1), I(2), I(3), I(4), I(5), U(6), nullptr, static_cast<std::size_t>(U(7)), i64(c, argv[8])); return nullptr; }
  if (!bytesOf(c, argv[7], p, n, &el)) return typeError(c, "compressedTexSubImage2D: data must be an ArrayBuffer view");
  if (gl.version() == 2) { int r = viewSlice(c, gl, argc, argv, 7, p, n); if (r == 2) return nullptr; }
  gl.compressedTexSubImage2D(U(0), I(1), I(2), I(3), I(4), I(5), U(6), p, n);
  return nullptr;
}
M(compressedTexImage3D) {
  SELF NEED2; NEED(8);
  std::uint8_t* p = nullptr; std::size_t n = 0, el = 1;
  if (argc >= 9 && !isObject(c, argv[7])) { gl.compressedTexImage3D(U(0), I(1), U(2), I(3), I(4), I(5), I(6), nullptr, static_cast<std::size_t>(U(7)), i64(c, argv[8])); return nullptr; }
  if (!bytesOf(c, argv[7], p, n, &el)) return typeError(c, "compressedTexImage3D: data must be an ArrayBuffer view");
  if (viewSlice(c, gl, argc, argv, 7, p, n) == 2) return nullptr;
  gl.compressedTexImage3D(U(0), I(1), U(2), I(3), I(4), I(5), I(6), p, n);
  return nullptr;
}
M(compressedTexSubImage3D) {
  SELF NEED2; NEED(10);
  std::uint8_t* p = nullptr; std::size_t n = 0, el = 1;
  if (argc >= 11 && !isObject(c, argv[9])) { gl.compressedTexSubImage3D(U(0), I(1), I(2), I(3), I(4), I(5), I(6), I(7), U(8), nullptr, static_cast<std::size_t>(U(9)), i64(c, argv[10])); return nullptr; }
  if (!bytesOf(c, argv[9], p, n, &el)) return typeError(c, "compressedTexSubImage3D: data must be an ArrayBuffer view");
  if (viewSlice(c, gl, argc, argv, 9, p, n) == 2) return nullptr;
  gl.compressedTexSubImage3D(U(0), I(1), I(2), I(3), I(4), I(5), I(6), I(7), U(8), p, n);
  return nullptr;
}

const Fn kMethods2[] = {
  {"createVertexArray", js_createVertexArray, 0}, {"deleteVertexArray", js_deleteVertexArray, 1}, {"bindVertexArray", js_bindVertexArray, 1}, {"isVertexArray", js_isVertexArray, 1},
  {"vertexAttribDivisor", js_vertexAttribDivisor, 2}, {"drawArraysInstanced", js_drawArraysInstanced, 4}, {"drawElementsInstanced", js_drawElementsInstanced, 5}, {"drawRangeElements", js_drawRangeElements, 6},
  {"drawBuffers", js_drawBuffers, 1}, {"readBuffer", js_readBuffer, 1}, {"bindBufferBase", js_bindBufferBase, 3}, {"bindBufferRange", js_bindBufferRange, 5},
  {"getUniformBlockIndex", js_getUniformBlockIndex, 2}, {"uniformBlockBinding", js_uniformBlockBinding, 3}, {"getActiveUniformBlockParameter", js_getActiveUniformBlockParameter, 3}, {"getActiveUniformBlockName", js_getActiveUniformBlockName, 2},
  {"uniform1uiv", js_uniform1uiv, 2}, {"uniform2uiv", js_uniform2uiv, 2}, {"uniform3uiv", js_uniform3uiv, 2}, {"uniform4uiv", js_uniform4uiv, 2},
  {"copyBufferSubData", js_copyBufferSubData, 5}, {"getBufferSubData", js_getBufferSubData, 3},
  {"texImage3D", js_texImage3D, 10},
  {"texSubImage3D", js_texSubImage3D, 11},
  {"texStorage2D", js_texStorage2D, 5},
  {"texStorage3D", js_texStorage3D, 6},
  {"copyTexSubImage3D", js_copyTexSubImage3D, 9},
  {"createSampler", js_createSampler, 0},
  {"deleteSampler", js_deleteSampler, 1},
  {"isSampler", js_isSampler, 1},
  {"bindSampler", js_bindSampler, 2},
  {"samplerParameteri", js_samplerParameteri, 3},
  {"samplerParameterf", js_samplerParameterf, 3},
  {"getSamplerParameter", js_getSamplerParameter, 2},
  {"createQuery", js_createQuery, 0},
  {"deleteQuery", js_deleteQuery, 1},
  {"isQuery", js_isQuery, 1},
  {"beginQuery", js_beginQuery, 2},
  {"endQuery", js_endQuery, 1},
  {"getQuery", js_getQuery, 2},
  {"getQueryParameter", js_getQueryParameter, 2},
  {"fenceSync", js_fenceSync, 2},
  {"isSync", js_isSync, 1},
  {"deleteSync", js_deleteSync, 1},
  {"clientWaitSync", js_clientWaitSync, 3},
  {"waitSync", js_waitSync, 3},
  {"getSyncParameter", js_getSyncParameter, 2},
  {"createTransformFeedback", js_createTransformFeedback, 0},
  {"deleteTransformFeedback", js_deleteTransformFeedback, 1},
  {"isTransformFeedback", js_isTransformFeedback, 1},
  {"bindTransformFeedback", js_bindTransformFeedback, 2},
  {"beginTransformFeedback", js_beginTransformFeedback, 1},
  {"endTransformFeedback", js_endTransformFeedback, 0},
  {"pauseTransformFeedback", js_pauseTransformFeedback, 0},
  {"resumeTransformFeedback", js_resumeTransformFeedback, 0},
  {"transformFeedbackVaryings", js_transformFeedbackVaryings, 3},
  {"getTransformFeedbackVarying", js_getTransformFeedbackVarying, 2},
  {"blitFramebuffer", js_blitFramebuffer, 10},
  {"renderbufferStorageMultisample", js_renderbufferStorageMultisample, 5},
  {"clearBufferfv", js_clearBufferfv, 3},
  {"clearBufferiv", js_clearBufferiv, 3},
  {"clearBufferuiv", js_clearBufferuiv, 3},
  {"clearBufferfi", js_clearBufferfi, 4},
  {"invalidateFramebuffer", js_invalidateFramebuffer, 2},
  {"framebufferTextureLayer", js_framebufferTextureLayer, 5},
  {"getFragDataLocation", js_getFragDataLocation, 2},
  {"getInternalformatParameter", js_getInternalformatParameter, 3},
  {"getIndexedParameter", js_getIndexedParameter, 2},
  {"getUniformIndices", js_getUniformIndices, 2},
  {"getActiveUniforms", js_getActiveUniforms, 3},
  {"uniformMatrix2x3fv", js_uniformMatrix2x3fv, 3},
  {"uniformMatrix2x4fv", js_uniformMatrix2x4fv, 3},
  {"uniformMatrix3x2fv", js_uniformMatrix3x2fv, 3},
  {"uniformMatrix3x4fv", js_uniformMatrix3x4fv, 3},
  {"uniformMatrix4x2fv", js_uniformMatrix4x2fv, 3},
  {"uniformMatrix4x3fv", js_uniformMatrix4x3fv, 3},
  {"vertexAttribI4i", js_vertexAttribI4i, 5},
  {"vertexAttribI4ui", js_vertexAttribI4ui, 5},
  {"vertexAttribI4iv", js_vertexAttribI4iv, 2},
  {"vertexAttribI4uiv", js_vertexAttribI4uiv, 2},
  {"invalidateSubFramebuffer", js_invalidateSubFramebuffer, 6},
  {"compressedTexImage3D", js_compressedTexImage3D, 8},
  {"compressedTexSubImage3D", js_compressedTexSubImage3D, 10},
  {"uniform1ui", js_uniform1ui, 2}, {"uniform2ui", js_uniform2ui, 3}, {"uniform3ui", js_uniform3ui, 4}, {"uniform4ui", js_uniform4ui, 5}, {"vertexAttribIPointer", js_vertexAttribIPointer, 5},
};


// ---- extensions (webgl_ext.h): getExtension builds one object per extension and context; its methods are the context's natives under the extension's names, so the checks live in one place
struct ExtConst { Ext ext; const char* name; std::uint32_t value; };
const ExtConst kExtConsts[] = {
  {Ext::StdDerivatives, "FRAGMENT_SHADER_DERIVATIVE_HINT_OES", 0x8B8B},
  {Ext::Vao, "VERTEX_ARRAY_BINDING_OES", 0x85B5},
  {Ext::InstancedArrays, "VERTEX_ATTRIB_ARRAY_DIVISOR_ANGLE", 0x88FE},
  {Ext::TexHalf, "HALF_FLOAT_OES", 0x8D61},
  {Ext::DepthTexture, "UNSIGNED_INT_24_8_WEBGL", 0x84FA},
  {Ext::Aniso, "MAX_TEXTURE_MAX_ANISOTROPY_EXT", 0x84FF}, {Ext::Aniso, "TEXTURE_MAX_ANISOTROPY_EXT", 0x84FE},
  {Ext::DebugRenderer, "UNMASKED_VENDOR_WEBGL", 0x9245}, {Ext::DebugRenderer, "UNMASKED_RENDERER_WEBGL", 0x9246},
  {Ext::BlendMinmax, "MIN_EXT", 0x8007}, {Ext::BlendMinmax, "MAX_EXT", 0x8008},
  {Ext::DrawBuffers, "MAX_COLOR_ATTACHMENTS_WEBGL", 0x8CDF}, {Ext::DrawBuffers, "MAX_DRAW_BUFFERS_WEBGL", 0x8824},
  {Ext::Srgb, "SRGB_EXT", 0x8C40}, {Ext::Srgb, "SRGB_ALPHA_EXT", 0x8C42}, {Ext::Srgb, "SRGB8_ALPHA8_EXT", 0x8C43}, {Ext::Srgb, "FRAMEBUFFER_ATTACHMENT_COLOR_ENCODING_EXT", 0x8210},
  {Ext::ColorBufHalf, "RGBA16F_EXT", 0x881A}, {Ext::ColorBufHalf, "RGB16F_EXT", 0x881B}, {Ext::ColorBufHalf, "FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE_EXT", 0x8211}, {Ext::ColorBufHalf, "UNSIGNED_NORMALIZED_EXT", 0x8C17},
  {Ext::ColorBufFloatWebgl, "RGBA32F_EXT", 0x8814}, {Ext::ColorBufFloatWebgl, "FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE_EXT", 0x8211}, {Ext::ColorBufFloatWebgl, "UNSIGNED_NORMALIZED_EXT", 0x8C17},
  {Ext::S3tc, "COMPRESSED_RGB_S3TC_DXT1_EXT", 0x83F0}, {Ext::S3tc, "COMPRESSED_RGBA_S3TC_DXT1_EXT", 0x83F1}, {Ext::S3tc, "COMPRESSED_RGBA_S3TC_DXT3_EXT", 0x83F2}, {Ext::S3tc, "COMPRESSED_RGBA_S3TC_DXT5_EXT", 0x83F3},
  {Ext::S3tcSrgb, "COMPRESSED_SRGB_S3TC_DXT1_EXT", 0x8C4C}, {Ext::S3tcSrgb, "COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT", 0x8C4D}, {Ext::S3tcSrgb, "COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT", 0x8C4E}, {Ext::S3tcSrgb, "COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT", 0x8C4F},
  {Ext::Rgtc, "COMPRESSED_RED_RGTC1_EXT", 0x8DBB}, {Ext::Rgtc, "COMPRESSED_SIGNED_RED_RGTC1_EXT", 0x8DBC}, {Ext::Rgtc, "COMPRESSED_RED_GREEN_RGTC2_EXT", 0x8DBD}, {Ext::Rgtc, "COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT", 0x8DBE},
  {Ext::Etc1, "COMPRESSED_RGB_ETC1_WEBGL", 0x8D64},
  {Ext::Etc, "COMPRESSED_R11_EAC", 0x9270}, {Ext::Etc, "COMPRESSED_SIGNED_R11_EAC", 0x9271}, {Ext::Etc, "COMPRESSED_RG11_EAC", 0x9272}, {Ext::Etc, "COMPRESSED_SIGNED_RG11_EAC", 0x9273},
  {Ext::Etc, "COMPRESSED_RGB8_ETC2", 0x9274}, {Ext::Etc, "COMPRESSED_SRGB8_ETC2", 0x9275}, {Ext::Etc, "COMPRESSED_RGB8_PUNCHTHROUGH_ALPHA1_ETC2", 0x9276},
  {Ext::Etc, "COMPRESSED_SRGB8_PUNCHTHROUGH_ALPHA1_ETC2", 0x9277}, {Ext::Etc, "COMPRESSED_RGBA8_ETC2_EAC", 0x9278}, {Ext::Etc, "COMPRESSED_SRGB8_ALPHA8_ETC2_EAC", 0x9279},
  {Ext::Astc, "COMPRESSED_RGBA_ASTC_4x4_KHR", 0x93B0}, {Ext::Astc, "COMPRESSED_RGBA_ASTC_5x4_KHR", 0x93B1}, {Ext::Astc, "COMPRESSED_RGBA_ASTC_5x5_KHR", 0x93B2},
  {Ext::Astc, "COMPRESSED_RGBA_ASTC_6x5_KHR", 0x93B3}, {Ext::Astc, "COMPRESSED_RGBA_ASTC_6x6_KHR", 0x93B4}, {Ext::Astc, "COMPRESSED_RGBA_ASTC_8x5_KHR", 0x93B5},
  {Ext::Astc, "COMPRESSED_RGBA_ASTC_8x6_KHR", 0x93B6}, {Ext::Astc, "COMPRESSED_RGBA_ASTC_8x8_KHR", 0x93B7}, {Ext::Astc, "COMPRESSED_RGBA_ASTC_10x5_KHR", 0x93B8},
  {Ext::Astc, "COMPRESSED_RGBA_ASTC_10x6_KHR", 0x93B9}, {Ext::Astc, "COMPRESSED_RGBA_ASTC_10x8_KHR", 0x93BA}, {Ext::Astc, "COMPRESSED_RGBA_ASTC_10x10_KHR", 0x93BB},
  {Ext::Astc, "COMPRESSED_RGBA_ASTC_12x10_KHR", 0x93BC}, {Ext::Astc, "COMPRESSED_RGBA_ASTC_12x12_KHR", 0x93BD},
  {Ext::Astc, "COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR", 0x93D0}, {Ext::Astc, "COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR", 0x93D1}, {Ext::Astc, "COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR", 0x93D2},
  {Ext::Astc, "COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR", 0x93D3}, {Ext::Astc, "COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR", 0x93D4}, {Ext::Astc, "COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR", 0x93D5},
  {Ext::Astc, "COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR", 0x93D6}, {Ext::Astc, "COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR", 0x93D7}, {Ext::Astc, "COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR", 0x93D8},
  {Ext::Astc, "COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR", 0x93D9}, {Ext::Astc, "COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR", 0x93DA}, {Ext::Astc, "COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR", 0x93DB},
  {Ext::Astc, "COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR", 0x93DC}, {Ext::Astc, "COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR", 0x93DD},
  {Ext::Pvrtc, "COMPRESSED_RGB_PVRTC_4BPPV1_IMG", 0x8C00}, {Ext::Pvrtc, "COMPRESSED_RGB_PVRTC_2BPPV1_IMG", 0x8C01}, {Ext::Pvrtc, "COMPRESSED_RGBA_PVRTC_4BPPV1_IMG", 0x8C02},
  {Ext::Pvrtc, "COMPRESSED_RGBA_PVRTC_2BPPV1_IMG", 0x8C03},
};
M(enableiOES) { SELF NEED(2); gl.enablei(U(0), U(1)); return nullptr; }
M(disableiOES) { SELF NEED(2); gl.disablei(U(0), U(1)); return nullptr; }
M(isEnablediOES) { SELF NEED(2); return boolean(c, gl.isEnabledi(U(0), U(1))); }
M(blendEquationiOES) { SELF NEED(2); gl.blendEquationi(U(0), U(1)); return nullptr; }
M(blendEquationSeparateiOES) { SELF NEED(3); gl.blendEquationSeparatei(U(0), U(1), U(2)); return nullptr; }
M(blendFunciOES) { SELF NEED(3); gl.blendFunci(U(0), U(1), U(2)); return nullptr; }
M(blendFuncSeparateiOES) { SELF NEED(5); gl.blendFuncSeparatei(U(0), U(1), U(2), U(3), U(4)); return nullptr; }
M(colorMaskiOES) { SELF NEED(5); gl.colorMaski(U(0), truthy(c, argv[1]), truthy(c, argv[2]), truthy(c, argv[3]), truthy(c, argv[4])); return nullptr; }
M(loseContext);
M(restoreContext);
M(getSupportedProfiles) {   // WEBGL_compressed_texture_astc: the profiles the driver decodes (LDR only, the extension's driver requirement)
  napi_value a = newArray(c);
  (void)t; (void)argc; (void)argv;
  setElem(c, a, 0, string(c, "ldr"));
  return a;
}
struct ExtFn { Ext ext; Fn fn; };
const ExtFn kExtFns[] = {
  {Ext::Vao, {"createVertexArrayOES", js_createVertexArray, 0}}, {Ext::Vao, {"deleteVertexArrayOES", js_deleteVertexArray, 1}}, {Ext::Vao, {"isVertexArrayOES", js_isVertexArray, 1}}, {Ext::Vao, {"bindVertexArrayOES", js_bindVertexArray, 1}},
  {Ext::InstancedArrays, {"drawArraysInstancedANGLE", js_drawArraysInstanced, 4}}, {Ext::InstancedArrays, {"drawElementsInstancedANGLE", js_drawElementsInstanced, 5}}, {Ext::InstancedArrays, {"vertexAttribDivisorANGLE", js_vertexAttribDivisor, 2}},
  {Ext::DrawBuffers, {"drawBuffersWEBGL", js_drawBuffers, 1}},
  {Ext::DrawBuffersIndexed, {"enableiOES", js_enableiOES, 2}}, {Ext::DrawBuffersIndexed, {"disableiOES", js_disableiOES, 2}}, {Ext::DrawBuffersIndexed, {"isEnablediOES", js_isEnablediOES, 2}},
  {Ext::DrawBuffersIndexed, {"blendEquationiOES", js_blendEquationiOES, 2}}, {Ext::DrawBuffersIndexed, {"blendEquationSeparateiOES", js_blendEquationSeparateiOES, 3}}, {Ext::DrawBuffersIndexed, {"blendFunciOES", js_blendFunciOES, 3}},
  {Ext::DrawBuffersIndexed, {"blendFuncSeparateiOES", js_blendFuncSeparateiOES, 5}}, {Ext::DrawBuffersIndexed, {"colorMaskiOES", js_colorMaskiOES, 5}},
  {Ext::LoseContext, {"loseContext", js_loseContext, 0}}, {Ext::LoseContext, {"restoreContext", js_restoreContext, 0}},
  {Ext::Astc, {"getSupportedProfiles", js_getSupportedProfiles, 0}},
};

napi_ref gExtCtor[kExtCount];

// what a call does while the context is lost (WEBGL_lose_context): nothing, with the return value the spec gives
// a composite empties the drawing buffer that was drawn to, unless preserveDrawingBuffer: a timer of 0 ms after the task that drew stands for it (the pages wait for a requestAnimationFrame, a later timer)
void composite(Gl* g) {
  g->compositeScheduled = false;
  if (g->lost || g->preserveDrawingBuffer || !g->gl.drawingBufferDirty()) return;
  if (gCurrent != g) { g->gl.makeCurrent(); gCurrent = g; }
  g->gl.compositeClear();
}
void scheduleComposite(napi_env c, napi_value t, Gl* g) {
  if (later(c, ctxObject(c, t, g), kComposite)) g->compositeScheduled = true;
}
constexpr std::size_t kMaxArgs = 12;   // the most a WebGL method reads (texSubImage3D with its srcOffset)
napi_value callThunk(napi_env c, napi_callback_info info) {
  Args<kMaxArgs> a(c, info);
  const Fn& f = *static_cast<const Fn*>(a.data);
  napi_value t = a.self, *argv = a.argv;
  const int argc = static_cast<int>(std::min(a.argc, kMaxArgs));
  bool stale = false;
  Gl* g = ownerOf(c, t, &stale);
  if (!g || !(g->lost || stale) || f.fn == js_isContextLost || f.fn == js_loseContext || f.fn == js_restoreContext) {
    napi_value r = f.fn(c, t, argc, argv);
    if (g && !g->compositeScheduled && !g->preserveDrawingBuffer && g->gl.drawingBufferDirty()) scheduleComposite(c, t, g);
    return r;
  }
  const std::string n = f.name;
  if (n == "getError") { if (g->lostReported) return uint32v(c, g->gl.getError()); g->lostReported = true; return uint32v(c, 0x9242); }   // CONTEXT_LOST_WEBGL once, then the errors the lose_context calls raised
  if (n == "getAttribLocation") return int32v(c, -1);
  if (n == "checkFramebufferStatus") return uint32v(c, 0x8CDD);
  if (n.compare(0, 2, "is") == 0) return boolean(c, false);
  if (n == "getVertexAttribOffset") return int32v(c, 0);
  if (n.compare(0, 6, "create") == 0 && n != "createVertexArrayOES") {   // an object that is not any GL object: the lost context hands out inert ones
    static const struct { const char* name; int kind; } kinds[] = {{"createBuffer", 1}, {"createShader", 2}, {"createProgram", 3}, {"createTexture", 4}, {"createFramebuffer", 5}, {"createRenderbuffer", 7}, {"createVertexArray", 8}, {"createSampler", 9}, {"createQuery", 10}, {"createTransformFeedback", 12}};
    for (const auto& k : kinds) if (n == k.name) return wrap(c, g, k.kind, 0);
  }
  if (n == "createVertexArrayOES") return wrap(c, g, 8, 0);
  if (n.compare(0, 3, "get") == 0 || n.compare(0, 6, "create") == 0 || n == "fenceSync") return null(c);
  return nullptr;
}
M(getSupportedExtensions) {
  SELF
  napi_value arr = newArray(c);
  std::uint32_t n = 0;
  for (const ExtDef& e : kExtensions) if ((e.webgl & (1u << (g->version - 1))) && gl.extSupported(e.id)) setElem(c, arr, n++, string(c, e.name));
  return arr;
}
M(getExtension) {
  SELF NEED(1);
  const std::string name = str(c, argv[0]);
  for (const ExtDef& e : kExtensions) {
    if (!(e.webgl & (1u << (g->version - 1))) || strcasecmp(e.name, name.c_str()) != 0) continue;
    if (!gl.enableExt(e.id)) return null(c);
    napi_ref& slot = g->exts[static_cast<int>(e.id)];
    napi_value o = nullptr;
    if (slot && napi_get_reference_value(c, slot, &o) == napi_ok && o) return o;
    o = instance(c, gExtCtor[static_cast<int>(e.id)]);
    if (!o) return nullptr;
    auto* x = new ExtObj{ExtObj::kTag, g, g->epoch, e.id == Ext::LoseContext};
    if (napi_wrap(c, o, x, extFinalizer, nullptr, nullptr) != napi_ok) { delete x; return nullptr; }
    g->extObjs.push_back(x);
    napi_create_reference(c, o, 1, &slot);
    return o;
  }
  return null(c);
}
M(isContextLost) { SELF return boolean(c, g->lost); }
// WEBGL_lose_context: the context state and events at the JS level. loseContext marks it lost at once; the webglcontextlost event follows on a timer; restoreContext (allowed when the event was cancelled) builds a fresh
// driver context, every object of the old one becomes invalid (epoch), and webglcontextrestored follows.
bool dispatchEvent(napi_env c, napi_value ctxObj, const char* type) {   // the event was cancelled
  napi_value fn = get(c, global(c), "__zincDispatch");
  if (!isFunction(c, fn)) return false;
  napi_value args[2] = {ctxObj, string(c, type)};
  napi_value r = call(c, fn, nullptr, 2, args);
  if (!r) { clearException(c); return false; }
  return truthy(c, r);
}
void restoreNow(napi_env c, napi_value ctxObj, Gl* g) {
  if (!g->lost) return;
  for (auto& w : g->wrappers) napi_delete_reference(c, w.second);
  g->wrappers.clear();
  for (int i = 0; i < kExtCount; ++i) if (i != static_cast<int>(Ext::LoseContext) && g->exts[i]) { napi_delete_reference(c, g->exts[i]); g->exts[i] = nullptr; }   // the old extension objects go inert (their epoch is behind): getExtension builds new ones
  g->gl.~WebGL1();
  new (&g->gl) WebGL1();
  std::string err;
  const bool ok = g->version == 2 ? (g->gl.create(Api::Gl33, g->w, g->h, err, 2) || g->gl.create(Api::Gles3, g->w, g->h, err, 2)) : (g->gl.create(Api::Gl33, g->w, g->h, err) || g->gl.create(Api::Gles2, g->w, g->h, err));
  gCurrent = g;
  if (!ok) return;   // no driver context: it stays lost
  g->gl.setAttributes(g->depth, g->stencil, g->alpha);
  ++g->epoch;
  g->lost = g->lostReported = g->restorable = g->restorePending = g->restoreWanted = g->eventDispatched = g->compositeScheduled = g->boundaryScheduled = false;
  dispatchEvent(c, ctxObj, "webglcontextrestored");
}
void lostEvent(napi_env c, napi_value ctxObj, Gl* g) {
  if (!g->lost) return;
  g->restorable = dispatchEvent(c, ctxObj, "webglcontextlost");   // the page cancelled the event: it wants the context back
  g->eventDispatched = true;
  if (g->restoreWanted && g->restorable) { g->restorePending = true; later(c, ctxObj, kRestoreNow); }
}
// the timer's end of later(): __timer(ctx, what)
napi_value js_timer(napi_env c, napi_callback_info info) {
  Args<2> a(c, info);
  Gl* g = as<Gl>(c, a.argv[0]);
  if (!g) return nullptr;
  switch (i32(c, a.argv[1])) {
    case kBoundary: g->gl.taskBoundary(); g->boundaryScheduled = false; break;
    case kComposite: composite(g); break;
    case kLostEvent: lostEvent(c, a.argv[0], g); break;
    case kRestoreNow: restoreNow(c, a.argv[0], g); break;
  }
  return nullptr;
}
M(loseContext) {
  SELF
  if (g->lost) { gl.raise(0x0502); return nullptr; }
  g->lost = true; g->lostReported = g->restorable = g->restorePending = g->restoreWanted = g->eventDispatched = false;
  later(c, ctxObject(c, t, g), kLostEvent);
  return nullptr;
}
M(restoreContext) {
  SELF
  if (!g->lost) { gl.raise(0x0502); return nullptr; }
  if (g->restorePending) return nullptr;
  if (!g->eventDispatched) { g->restoreWanted = true; return nullptr; }   // called before the lost event ran: decided when it has
  if (!g->restorable) { gl.raise(0x0502); return nullptr; }
  g->restorePending = true;
  later(c, ctxObject(c, t, g), kRestoreNow);
  return nullptr;
}

struct Const { const char* name; std::uint32_t value; };
const Const kConsts[] = {
#include "gl/webgl_consts.inc"
};
const Const kConsts2[] = {
#include "gl/webgl2_consts.inc"
};

// __zincReadFile(path): the text of a local file or undefined; the conformance pages load their shaders and data through XMLHttpRequest, which the test shim maps to it
napi_value js_readFile(napi_env c, napi_callback_info info) {
  Args<1> a(c, info);
  if (a.argc < 1) return nullptr;
  std::string path = str(c, a.argv[0]);
  std::FILE* f = std::fopen(path.c_str(), "rb");
  if (!f) return nullptr;
  std::string data;
  char buf[4096];
  std::size_t n;
  while ((n = std::fread(buf, 1, sizeof buf, f)) > 0) data.append(buf, n);
  std::fclose(f);
  return string(c, data);
}

napi_value createContext(napi_env c, int w, int h, int version = 1, napi_value attrs = nullptr) {
  auto g = std::make_unique<Gl>();
  std::string err;
  if (version == 2) { if (!g->gl.create(Api::Gl33, w, h, err, 2) && !g->gl.create(Api::Gles3, w, h, err, 2)) return null(c); }
  else if (!g->gl.create(Api::Gl33, w, h, err) && !g->gl.create(Api::Gles2, w, h, err)) return null(c);
  g->w = w; g->h = h; g->version = version;
  bool antialias = true;   // WebGL's default
  if (attrs && isObject(c, attrs)) {   // the attributes asked for, reported back by getContextAttributes
    auto flag = [&](const char* k, bool& dst) { napi_value v = get(c, attrs, k); if (!isUndef(c, v)) dst = truthy(c, v); };
    flag("alpha", g->alpha); flag("depth", g->depth); flag("stencil", g->stencil); flag("premultipliedAlpha", g->premultipliedAlpha); flag("preserveDrawingBuffer", g->preserveDrawingBuffer);
    flag("antialias", antialias);
  }
  g->gl.setAttributes(g->depth, g->stencil, g->alpha, antialias);
  gCurrent = g.get();   // creating it made its driver context current
  napi_value o = instance(c, gCtxCtor[version]);
  if (!o || napi_wrap(c, o, g.get(), ctxFinalizer, nullptr, nullptr) != napi_ok) { gCurrent = nullptr; return null(c); }
  Gl* k = g.release();
  set(c, o, "drawingBufferWidth", int32v(c, w));
  set(c, o, "drawingBufferHeight", int32v(c, h));
  napi_value weakRef = get(c, global(c), "WeakRef"), weak = nullptr;
  if (isFunction(c, weakRef) && napi_new_instance(c, weakRef, 1, &o, &weak) == napi_ok) napi_create_reference(c, weak, 1, &k->weakSelf);
  return o;
}

// canvas.getContext('webgl' | 'experimental-webgl'): one context per canvas, the canvas size at the first call
napi_value js_canvasGetContext(napi_env c, napi_callback_info info) {
  Args<2> a(c, info);
  napi_value t = a.self;
  if (a.argc < 1) return null(c);
  std::string type = str(c, a.argv[0]);
  const bool v2 = type == "webgl2";
  if (type != "webgl" && type != "experimental-webgl" && !v2) return null(c);
  napi_value cached = get(c, t, "__gl");
  if (!isUndef(c, cached)) { Gl* have = as<Gl>(c, cached); if (have && (have->version == 2) == v2) return cached; return null(c); }   // one kind of context per canvas
  int w = i32(c, get(c, t, "width")), h = i32(c, get(c, t, "height"));
  napi_value ctxv = createContext(c, w > 0 ? w : 300, h > 0 ? h : 150, v2 ? 2 : 1, a.argc > 1 ? a.argv[1] : nullptr);
  if (!isNull(c, ctxv)) { set(c, ctxv, "canvas", t); set(c, t, "__gl", ctxv); }
  return ctxv;
}
// canvas.width / canvas.height (the callback's data: 0 width, 1 height): setting either gives the WebGL context a new drawing buffer
napi_value js_canvasGet(napi_env c, napi_callback_info info) {
  Args<1> a(c, info);
  return get(c, a.self, a.data ? "__h" : "__w");
}
napi_value js_canvasSet(napi_env c, napi_callback_info info) {
  Args<1> a(c, info);
  napi_value t = a.self;
  std::uint32_t v = a.argc > 0 ? u32(c, a.argv[0]) : 0;
  set(c, t, a.data ? "__h" : "__w", uint32v(c, v));
  if (Gl* g = as<Gl>(c, get(c, t, "__gl"))) {
    g->w = std::max(1, i32(c, get(c, t, "__w"))); g->h = std::max(1, i32(c, get(c, t, "__h")));
    g->gl.resizeDrawingBuffer(g->w, g->h);
    napi_value gv = get(c, t, "__gl");
    set(c, gv, "drawingBufferWidth", int32v(c, g->w));
    set(c, gv, "drawingBufferHeight", int32v(c, g->h));
  }
  return nullptr;
}
napi_value js_createElement(napi_env c, napi_callback_info info) {
  Args<1> a(c, info);
  if (a.argc < 1 || str(c, a.argv[0]) != "canvas") return null(c);
  napi_value o = newObject(c);
  set(c, o, "__w", int32v(c, 300));
  set(c, o, "__h", int32v(c, 150));
  const auto attrs = static_cast<napi_property_attributes>(napi_enumerable | napi_configurable);
  const napi_property_descriptor size[] = {{"width", nullptr, nullptr, js_canvasGet, js_canvasSet, nullptr, attrs, nullptr},
                                           {"height", nullptr, nullptr, js_canvasGet, js_canvasSet, nullptr, attrs, reinterpret_cast<void*>(1)}};
  napi_define_properties(c, o, 2, size);
  napi_value fn = nullptr;
  napi_create_function(c, "getContext", NAPI_AUTO_LENGTH, js_canvasGetContext, nullptr, &fn);
  set(c, o, "getContext", fn);
  return o;
}

// a method of a prototype: the native through callThunk, with the length WebGL gives it
napi_value methodOf(napi_env c, const Fn& f) {
  napi_value fn = nullptr;
  napi_create_function(c, f.name, NAPI_AUTO_LENGTH, callThunk, const_cast<Fn*>(&f), &fn);
  const napi_property_descriptor length{"length", nullptr, nullptr, nullptr, nullptr, int32v(c, f.len), napi_configurable, nullptr};
  napi_define_properties(c, fn, 1, &length);
  return fn;
}
// a class whose constructor throws in JS (`x instanceof WebGLBuffer`, `WebGLRenderingContext.ARRAY_BUFFER`): its prototype; ref keeps the constructor for instance()
napi_value defineClass(napi_env c, const char* name, napi_ref& ref, napi_value& ctor) {
  ctor = nullptr;
  napi_define_class(c, name, NAPI_AUTO_LENGTH, js_illegalConstructor, nullptr, 0, nullptr, &ctor);
  napi_create_reference(c, ctor, 1, &ref);   // ponytail: a reference of an earlier install is left behind (one install per program today)
  return get(c, ctor, "prototype");
}
napi_value run(napi_env c, const char* source) {
  napi_value src = string(c, source, std::strlen(source)), r = nullptr;
  return napi_run_script(c, src, "<webgl>", &r) == napi_ok ? r : nullptr;
}

void install(napi_env c) {
  napi_value global0 = global(c), ctor = nullptr;
  napi_value proto = defineClass(c, "WebGLRenderingContext", gCtxCtor[1], ctor);
  for (const Fn& f : kMethods) set(c, proto, f.name, methodOf(c, f));
  for (const Const& k : kConsts) { set(c, proto, k.name, uint32v(c, k.value)); set(c, ctor, k.name, uint32v(c, k.value)); }
  set(c, global0, "WebGLRenderingContext", ctor);
  for (int k = 1; k <= 12; ++k) { defineClass(c, kKindNames[k], gKindCtor[k], ctor); set(c, global0, kKindNames[k], ctor); }
  defineClass(c, "WebGLShaderPrecisionFormat", gPrecisionCtor, ctor);
  set(c, global0, "WebGLShaderPrecisionFormat", ctor);
  defineClass(c, "WebGLActiveInfo", gActiveCtor, ctor);
  set(c, global0, "WebGLActiveInfo", ctor);
  // WebGL2RenderingContext.prototype is a sibling of the WebGL 1 one, not its child: both interfaces include WebGLRenderingContextBase, so the
  // shared methods are its own and a WebGL 2 context is not `instanceof WebGLRenderingContext` (libraries tell the versions apart that way)
  napi_value proto2 = defineClass(c, "WebGL2RenderingContext", gCtxCtor[2], ctor);
  for (const Fn& f : kMethods) set(c, proto2, f.name, methodOf(c, f));
  for (const Fn& f : kMethods2) set(c, proto2, f.name, methodOf(c, f));
  for (const Const& k : kConsts2) { set(c, proto2, k.name, uint32v(c, k.value)); set(c, ctor, k.name, uint32v(c, k.value)); }
  set(c, proto2, "TIMEOUT_IGNORED", int32v(c, -1));   // 0xFFFFFFFFFFFFFFFF as a signed number
  set(c, ctor, "TIMEOUT_IGNORED", int32v(c, -1));
  set(c, global0, "WebGL2RenderingContext", ctor);
  for (const ExtDef& e : kExtensions) {   // the extension interfaces: constants and methods on the prototype
    // extension interfaces have no interface object (a page may use the extension's name for its own variable): only prototype.constructor, for the name
    napi_value p = defineClass(c, e.name, gExtCtor[static_cast<int>(e.id)], ctor);
    for (const ExtConst& k : kExtConsts) if (k.ext == e.id) set(c, p, k.name, uint32v(c, k.value));
    for (const ExtFn& x : kExtFns) if (x.ext == e.id) set(c, p, x.fn.name, methodOf(c, x.fn));
    if (e.id == Ext::DrawBuffers) for (int k = 0; k < 16; ++k) {
      char nm[40];
      std::snprintf(nm, sizeof nm, "COLOR_ATTACHMENT%d_WEBGL", k); set(c, p, nm, uint32v(c, 0x8CE0u + static_cast<unsigned>(k)));
      std::snprintf(nm, sizeof nm, "DRAW_BUFFER%d_WEBGL", k); set(c, p, nm, uint32v(c, 0x8825u + static_cast<unsigned>(k)));
    }
  }
  // the DOM-style event the lose_context calls fire on canvas.dispatchEvent
  set(c, global0, "__zincDispatch", run(c, "(function (ctx, type) { var c = ctx.canvas; var e = { type: type, statusMessage: '', cancelable: type === 'webglcontextlost', bubbles: false, defaultPrevented: false, target: c, preventDefault: function () { if (this.cancelable) this.defaultPrevented = true; }, stopPropagation: function () {} }; if (c && typeof c.dispatchEvent === 'function') c.dispatchEvent(e); return e.defaultPrevented; })"));
  {   // later(): a timer of 0 ms that hands the context back to js_timer, holding it until then
    napi_value make = run(c, "(function (f) { return function (ctx, what) { if (typeof setTimeout !== 'function') return false; setTimeout(function () { f(ctx, what); }, 0); return true; }; })");
    napi_value timer = nullptr;
    napi_create_function(c, "timer", NAPI_AUTO_LENGTH, js_timer, nullptr, &timer);
    if (napi_value fn = make ? call(c, make, nullptr, 1, &timer) : nullptr) napi_create_reference(c, fn, 1, &gLater);
  }
  napi_value fn = nullptr;
  napi_create_function(c, "__zincReadFile", NAPI_AUTO_LENGTH, js_readFile, nullptr, &fn);
  set(c, global0, "__zincReadFile", fn);
  napi_value doc = get(c, global0, "document");
  if (isUndef(c, doc)) { doc = newObject(c); set(c, global0, "document", doc); }
  napi_create_function(c, "createElement", NAPI_AUTO_LENGTH, js_createElement, nullptr, &fn);
  set(c, doc, "createElement", fn);
}

}  // namespace

}  // namespace zn::gl

extern "C" __attribute__((visibility("default"))) zn::gl::ContextInstall zn_webgl_open(const zn::gl::PresentHooks* present, const zn_napi_table* napi) {
  zn::gl::gNapi = napi;
  zn::gl::gPresent = present;
  if (present && present->atFrameEnd) present->atFrameEnd(zn::gl::presentFrameEnd);
  return &zn::gl::install;
}
