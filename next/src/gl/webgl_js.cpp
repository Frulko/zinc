// WebGL 1.0 in the QuickJS engine (ZN-203.03): the WebGLRenderingContext class and the object classes as native JS classes over zn::gl::WebGL1 (src/gl/webgl1.cpp), typed arrays read in place,
// plus a tiny `document.createElement('canvas')` / `canvas.getContext('webgl')`. Registered with zn::qjs::addContextHook; trusted programs only (`zinc run --engine quickjs`).
#include "gl/webgl_js.h"

#include <cstdio>
#include <cstring>
#include <map>
#include <memory>
#include <string>
#include <vector>

#include "gl/webgl1.h"
#include "quickjs.h"
#include "zn/js_ext.h"

namespace zn::gl {
namespace {

struct Obj { int kind; Id id; UniformLoc loc; };   // kind: 1 buffer, 2 shader, 3 program, 4 texture, 5 framebuffer, 6 uniform location
struct Gl { WebGL1 gl; int w = 0, h = 0, version = 1; std::map<std::uint64_t, JSValue> wrappers; };   // wrappers: one JS object per GL object, so `gl.getParameter(gl.ARRAY_BUFFER_BINDING) === buffer`

JSClassID gCtxClass = 0, gObjClass = 0;
JSValue gProto2;   // WebGL2RenderingContext.prototype, inheriting from the WebGL 1 one
JSValue gKindProto[9];   // prototypes of WebGLBuffer ... WebGLUniformLocation, so `instanceof` works
const char* kKindNames[] = {"", "WebGLBuffer", "WebGLShader", "WebGLProgram", "WebGLTexture", "WebGLFramebuffer", "WebGLUniformLocation", "WebGLRenderbuffer", "WebGLVertexArrayObject"};

void ctxFinalizer(JSRuntime* rt, JSValue v) {
  Gl* g = static_cast<Gl*>(JS_GetOpaque(v, gCtxClass));
  if (g) for (auto& w : g->wrappers) JS_FreeValueRT(rt, w.second);
  delete g;
}
void objFinalizer(JSRuntime*, JSValue v) { delete static_cast<Obj*>(JS_GetOpaque(v, gObjClass)); }

Gl* self(JSContext* c, JSValueConst t) { return static_cast<Gl*>(JS_GetOpaque2(c, t, gCtxClass)); }
#define SELF Gl* g = self(c, t); if (!g) return JS_EXCEPTION; WebGL1& gl = g->gl; (void)gl; (void)argc; (void)argv;

JSValue wrap(JSContext* c, int kind, Id id, UniformLoc loc = {}) {
  JSValue o = JS_NewObjectProtoClass(c, gKindProto[kind], static_cast<int>(gObjClass));
  JS_SetOpaque(o, new Obj{kind, id, loc});
  return o;
}
// the one wrapper of a GL object (not for uniform locations, which are values)
JSValue wrapOnce(JSContext* c, Gl* g, int kind, Id id) {
  const std::uint64_t key = (static_cast<std::uint64_t>(kind) << 32) | id;
  auto it = g->wrappers.find(key);
  if (it != g->wrappers.end()) return JS_DupValue(c, it->second);
  JSValue o = wrap(c, kind, id);
  g->wrappers[key] = JS_DupValue(c, o);
  return o;
}
// null and undefined are the null object; anything else must be an object of the right kind
bool object(JSContext* c, JSValueConst v, int kind, Obj& out) {
  out = Obj{kind, 0, {}};
  if (JS_IsNull(v) || JS_IsUndefined(v)) return true;
  Obj* o = static_cast<Obj*>(JS_GetOpaque(v, gObjClass));
  if (!o || o->kind != kind) { JS_ThrowTypeError(c, "argument is not a %s", kKindNames[kind]); return false; }
  out = *o;
  return true;
}
#define OBJ(var, idx, kind) Obj var; if (!object(c, argv[idx], kind, var)) return JS_EXCEPTION;

double num(JSContext* c, JSValueConst v) { double d = 0; JS_ToFloat64(c, &d, v); return d; }
std::uint32_t u32(JSContext* c, JSValueConst v) { std::uint32_t x = 0; JS_ToUint32(c, &x, v); return x; }
int i32(JSContext* c, JSValueConst v) { std::int32_t x = 0; JS_ToInt32(c, &x, v); return x; }
std::int64_t i64(JSContext* c, JSValueConst v) { std::int64_t x = 0; JS_ToInt64(c, &x, v); return x; }
#define U(i) u32(c, argv[i])
#define I(i) i32(c, argv[i])
#define F(i) static_cast<float>(num(c, argv[i]))
#define NEED(n) if (argc < n) return JS_ThrowTypeError(c, "not enough arguments")

// the bytes of an ArrayBuffer, a typed array or a DataView, in place
bool bytesOf(JSContext* c, JSValueConst v, std::uint8_t*& p, std::size_t& n) {
  std::size_t size = 0;
  if (std::uint8_t* b = JS_GetArrayBuffer(c, &size, v)) { p = b; n = size; return true; }
  JS_FreeValue(c, JS_GetException(c));
  size_t off = 0, len = 0, bpe = 0;
  JSValue ab = JS_GetTypedArrayBuffer(c, v, &off, &len, &bpe);
  if (JS_IsException(ab)) { JS_FreeValue(c, JS_GetException(c)); return false; }
  std::uint8_t* base = JS_GetArrayBuffer(c, &size, ab);
  JS_FreeValue(c, ab);
  if (!base) return false;
  p = base + off;
  n = len;
  return true;
}
std::string str(JSContext* c, JSValueConst v) {
  size_t n = 0;
  const char* s = JS_ToCStringLen(c, &n, v);
  std::string r = s ? std::string(s, n) : std::string();
  if (s) JS_FreeCString(c, s);
  return r;
}
// a JS array of numbers or a Float32Array
bool floatsOf(JSContext* c, JSValueConst v, std::vector<float>& out) {
  std::uint8_t* p = nullptr;
  std::size_t n = 0;
  if (bytesOf(c, v, p, n)) { out.resize(n / 4); std::memcpy(out.data(), p, out.size() * 4); return true; }
  if (!JS_IsArray(v)) return false;
  JSValue lenv = JS_GetPropertyStr(c, v, "length");
  std::uint32_t len = u32(c, lenv);
  JS_FreeValue(c, lenv);
  out.resize(len);
  for (std::uint32_t i = 0; i < len; ++i) { JSValue e = JS_GetPropertyUint32(c, v, i); out[i] = static_cast<float>(num(c, e)); JS_FreeValue(c, e); }
  return true;
}

// ---- methods
#define M(name) JSValue js_##name(JSContext* c, JSValueConst t, int argc, JSValueConst* argv)
M(getError) { SELF return JS_NewUint32(c, gl.getError()); }
M(enable) { SELF NEED(1); gl.enable(U(0)); return JS_UNDEFINED; }
M(disable) { SELF NEED(1); gl.disable(U(0)); return JS_UNDEFINED; }
M(viewport) { SELF NEED(4); gl.viewport(I(0), I(1), I(2), I(3)); return JS_UNDEFINED; }
M(scissor) { SELF NEED(4); gl.scissor(I(0), I(1), I(2), I(3)); return JS_UNDEFINED; }
M(clearColor) { SELF NEED(4); gl.clearColor(F(0), F(1), F(2), F(3)); return JS_UNDEFINED; }
M(clear) { SELF NEED(1); gl.clear(U(0)); return JS_UNDEFINED; }
M(pixelStorei) { SELF NEED(2); gl.pixelStorei(U(0), I(1)); return JS_UNDEFINED; }

M(createBuffer) { SELF return wrapOnce(c, g, 1, gl.createBuffer()); }
M(deleteBuffer) { SELF NEED(1); OBJ(o, 0, 1) gl.deleteBuffer(o.id); return JS_UNDEFINED; }
M(isBuffer) { SELF NEED(1); Obj* o = static_cast<Obj*>(JS_GetOpaque(argv[0], gObjClass)); return JS_NewBool(c, o && o->kind == 1 && gl.isBuffer(o->id)); }
M(bindBuffer) { SELF NEED(2); OBJ(o, 1, 1) gl.bindBuffer(U(0), o.id); return JS_UNDEFINED; }
M(bufferData) {
  SELF NEED(3);
  std::uint8_t* p = nullptr;
  std::size_t n = 0;
  if (bytesOf(c, argv[1], p, n)) gl.bufferData(U(0), static_cast<std::int64_t>(n), p, U(2));
  else if (JS_IsNull(argv[1])) { gl.bufferData(U(0), 0, nullptr, U(2)); JS_ThrowTypeError(c, "bufferData: data is null"); return JS_EXCEPTION; }
  else gl.bufferData(U(0), i64(c, argv[1]), nullptr, U(2));   // a size
  return JS_UNDEFINED;
}
M(bufferSubData) {
  SELF NEED(3);
  std::uint8_t* p = nullptr;
  std::size_t n = 0;
  if (!bytesOf(c, argv[2], p, n)) return JS_ThrowTypeError(c, "bufferSubData: data must be an ArrayBuffer or a view");
  gl.bufferSubData(U(0), i64(c, argv[1]), static_cast<std::int64_t>(n), p);
  return JS_UNDEFINED;
}

M(createShader) { SELF NEED(1); Id id = gl.createShader(U(0)); return id ? wrapOnce(c, g, 2, id) : JS_NULL; }
M(shaderSource) { SELF NEED(2); OBJ(o, 0, 2) gl.shaderSource(o.id, str(c, argv[1])); return JS_UNDEFINED; }
M(compileShader) { SELF NEED(1); OBJ(o, 0, 2) gl.compileShader(o.id); return JS_UNDEFINED; }
M(getShaderParameter) {
  SELF NEED(2); OBJ(o, 0, 2)
  switch (U(1)) { case 0x8B81: return JS_NewBool(c, gl.shaderCompiled(o.id)); case 0x8B80: return JS_FALSE; case 0x8B4F: return JS_NewUint32(c, gl.shaderTypeOf(o.id)); }
  return JS_NULL;
}
M(getShaderInfoLog) { SELF NEED(1); OBJ(o, 0, 2) return JS_NewString(c, gl.shaderInfoLog(o.id).c_str()); }
M(createProgram) { SELF return wrapOnce(c, g, 3, gl.createProgram()); }
M(attachShader) { SELF NEED(2); OBJ(p, 0, 3) OBJ(s, 1, 2) gl.attachShader(p.id, s.id); return JS_UNDEFINED; }
M(bindAttribLocation) { SELF NEED(3); OBJ(p, 0, 3) gl.bindAttribLocation(p.id, U(1), str(c, argv[2])); return JS_UNDEFINED; }
M(linkProgram) { SELF NEED(1); OBJ(p, 0, 3) gl.linkProgram(p.id); return JS_UNDEFINED; }
M(getProgramParameter) {
  SELF NEED(2); OBJ(p, 0, 3)
  bool ok = false;
  int v = gl.programParameter(p.id, U(1), ok);
  if (!ok) return JS_NULL;
  return U(1) == 0x8B80 || U(1) == 0x8B82 || U(1) == 0x8B83 ? JS_NewBool(c, v != 0) : JS_NewInt32(c, v);
}
M(getProgramInfoLog) { SELF NEED(1); OBJ(p, 0, 3) return JS_NewString(c, gl.programInfoLog(p.id).c_str()); }
M(useProgram) { SELF NEED(1); OBJ(p, 0, 3) gl.useProgram(p.id); return JS_UNDEFINED; }
M(getAttribLocation) { SELF NEED(2); OBJ(p, 0, 3) return JS_NewInt32(c, gl.getAttribLocation(p.id, str(c, argv[1]))); }
M(getUniformLocation) {
  SELF NEED(2); OBJ(p, 0, 3)
  UniformLoc l = gl.getUniformLocation(p.id, str(c, argv[1]));
  return l.valid() ? wrap(c, 6, 0, l) : JS_NULL;
}
UniformLoc locOf(JSContext* c, JSValueConst v, bool& ok) {
  ok = true;
  if (JS_IsNull(v) || JS_IsUndefined(v)) return {};
  Obj* o = static_cast<Obj*>(JS_GetOpaque(v, gObjClass));
  if (!o || o->kind != 6) { ok = false; JS_ThrowTypeError(c, "argument is not a WebGLUniformLocation"); return {}; }
  return o->loc;
}
#define LOC bool ok_; UniformLoc l = locOf(c, argv[0], ok_); if (!ok_) return JS_EXCEPTION;
M(uniform1f) { SELF NEED(2); LOC gl.uniform1f(l, F(1)); return JS_UNDEFINED; }
M(uniform2f) { SELF NEED(3); LOC gl.uniform2f(l, F(1), F(2)); return JS_UNDEFINED; }
M(uniform4f) { SELF NEED(5); LOC gl.uniform4f(l, F(1), F(2), F(3), F(4)); return JS_UNDEFINED; }
M(uniform1i) { SELF NEED(2); LOC gl.uniform1i(l, I(1)); return JS_UNDEFINED; }
M(uniformMatrix4fv) {
  SELF NEED(3); LOC
  std::vector<float> v;
  if (!floatsOf(c, argv[2], v)) return JS_ThrowTypeError(c, "uniformMatrix4fv: value must be a Float32Array or an array");
  gl.uniformMatrix4fv(l, JS_ToBool(c, argv[1]) != 0, v.data(), v.size());
  return JS_UNDEFINED;
}

M(enableVertexAttribArray) { SELF NEED(1); gl.enableVertexAttribArray(U(0)); return JS_UNDEFINED; }
M(disableVertexAttribArray) { SELF NEED(1); gl.disableVertexAttribArray(U(0)); return JS_UNDEFINED; }
M(vertexAttribPointer) { SELF NEED(6); gl.vertexAttribPointer(U(0), I(1), U(2), JS_ToBool(c, argv[3]) != 0, I(4), i64(c, argv[5])); return JS_UNDEFINED; }
M(drawArrays) { SELF NEED(3); gl.drawArrays(U(0), I(1), I(2)); return JS_UNDEFINED; }
M(drawElements) { SELF NEED(4); gl.drawElements(U(0), I(1), U(2), i64(c, argv[3])); return JS_UNDEFINED; }

M(createTexture) { SELF return wrapOnce(c, g, 4, gl.createTexture()); }
M(deleteTexture) { SELF NEED(1); OBJ(o, 0, 4) gl.deleteTexture(o.id); return JS_UNDEFINED; }
M(bindTexture) { SELF NEED(2); OBJ(o, 1, 4) gl.bindTexture(U(0), o.id); return JS_UNDEFINED; }
M(activeTexture) { SELF NEED(1); gl.activeTexture(U(0)); return JS_UNDEFINED; }
M(texParameteri) { SELF NEED(3); gl.texParameteri(U(0), U(1), I(2)); return JS_UNDEFINED; }
M(texImage2D) {
  SELF NEED(9);   // the 9-argument form; the image-source form comes with the DOM shims of ZN-204
  std::uint8_t* p = nullptr;
  std::size_t n = 0;
  if (JS_IsNull(argv[8]) || JS_IsUndefined(argv[8])) gl.texImage2D(U(0), I(1), U(2), I(3), I(4), I(5), U(6), U(7), nullptr, 0);
  else if (bytesOf(c, argv[8], p, n)) gl.texImage2D(U(0), I(1), U(2), I(3), I(4), I(5), U(6), U(7), p, n);
  else return JS_ThrowTypeError(c, "texImage2D: pixels must be null or an ArrayBuffer view");
  return JS_UNDEFINED;
}

M(createFramebuffer) { SELF return wrapOnce(c, g, 5, gl.createFramebuffer()); }
M(bindFramebuffer) { SELF NEED(2); OBJ(o, 1, 5) gl.bindFramebuffer(U(0), o.id); return JS_UNDEFINED; }
M(framebufferTexture2D) { SELF NEED(5); OBJ(tex, 3, 4) gl.framebufferTexture2D(U(0), U(1), U(2), tex.id, I(4)); return JS_UNDEFINED; }
M(checkFramebufferStatus) { SELF NEED(1); return JS_NewUint32(c, gl.checkFramebufferStatus(U(0))); }
M(readPixels) {
  SELF NEED(7);
  std::uint8_t* p = nullptr;
  std::size_t n = 0;
  if (!bytesOf(c, argv[6], p, n)) return JS_ThrowTypeError(c, "readPixels: pixels must be an ArrayBuffer view");
  gl.readPixels(I(0), I(1), I(2), I(3), U(4), U(5), p, n);
  return JS_UNDEFINED;
}

JSValue js_getContextAttributes(JSContext* c, JSValueConst, int, JSValueConst*) {
  JSValue o = JS_NewObject(c);
  for (const char* k : {"alpha", "depth", "premultipliedAlpha", "preserveDrawingBuffer"}) JS_SetPropertyStr(c, o, k, JS_NewBool(c, std::strcmp(k, "preserveDrawingBuffer") != 0));
  JS_SetPropertyStr(c, o, "stencil", JS_FALSE);
  JS_SetPropertyStr(c, o, "antialias", JS_FALSE);
  return o;
}
JSValue js_getExtension(JSContext*, JSValueConst, int, JSValueConst*) { return JS_NULL; }   // none yet: three.js asks, and gets null like on a bare driver
JSValue js_isContextLost(JSContext*, JSValueConst, int, JSValueConst*) { return JS_FALSE; }


// ---- the rest of the surface (ZN-203.04)
JSValue typed(JSContext* c, const char* ctor, const std::vector<double>& v) {
  JSValue arr = JS_NewArray(c);
  for (std::size_t i = 0; i < v.size(); ++i) JS_SetPropertyUint32(c, arr, static_cast<std::uint32_t>(i), JS_NewFloat64(c, v[i]));
  JSValue global = JS_GetGlobalObject(c);
  JSValue k = JS_GetPropertyStr(c, global, ctor);
  JSValue out = JS_CallConstructor(c, k, 1, &arr);
  JS_FreeValue(c, k); JS_FreeValue(c, global); JS_FreeValue(c, arr);
  return out;
}
JSValue paramToJs(JSContext* c, Gl* g, std::uint32_t pname, const WebGL1::Param& p) {
  if (!p.ok) return JS_NULL;
  switch (p.kind) {
    case 'b': return JS_NewBool(c, !p.v.empty() && p.v[0] != 0);
    case 'i': return JS_NewFloat64(c, p.v.empty() ? 0 : p.v[0]);
    case 'f': return JS_NewFloat64(c, p.v.empty() ? 0 : p.v[0]);
    case 's': return JS_NewString(c, p.s.c_str());
    case 'n': return JS_NULL;
    case 'o': return wrapOnce(c, g, p.objKind, p.object);
    case 'a': {
      switch (pname) {
        case 0xBA2: case 0xC10: case 0xD3A: return typed(c, "Int32Array", p.v);                                    // VIEWPORT, SCISSOR_BOX, MAX_VIEWPORT_DIMS
        case 0x846E: case 0x846D: case 0xB70: case 0xC22: case 0x8005: case 0x8869: return typed(c, "Float32Array", p.v);   // line/point ranges, depth range, clear colour, blend colour, current attrib
        case 0x86A3: return typed(c, "Uint32Array", p.v);                                                          // COMPRESSED_TEXTURE_FORMATS
      }
      JSValue arr = JS_NewArray(c);
      for (std::size_t i = 0; i < p.v.size(); ++i) JS_SetPropertyUint32(c, arr, static_cast<std::uint32_t>(i), pname == 0xC23 ? JS_NewBool(c, p.v[i] != 0) : JS_NewFloat64(c, p.v[i]));
      return arr;
    }
  }
  return JS_NULL;
}
#define SET_U1(n) M(n) { SELF NEED(1); gl.n(U(0)); return JS_UNDEFINED; }
#define SET_U2(n) M(n) { SELF NEED(2); gl.n(U(0), U(1)); return JS_UNDEFINED; }
#define SET_U4(n) M(n) { SELF NEED(4); gl.n(U(0), U(1), U(2), U(3)); return JS_UNDEFINED; }
SET_U1(blendEquation) SET_U2(blendEquationSeparate) SET_U2(blendFunc) SET_U4(blendFuncSeparate) SET_U1(cullFace) SET_U1(depthFunc) SET_U1(frontFace) SET_U2(hint) SET_U1(stencilMask) SET_U2(stencilMaskSeparate)
M(blendColor) { SELF NEED(4); gl.blendColor(F(0), F(1), F(2), F(3)); return JS_UNDEFINED; }
M(clearDepth) { SELF NEED(1); gl.clearDepth(F(0)); return JS_UNDEFINED; }
M(clearStencil) { SELF NEED(1); gl.clearStencil(I(0)); return JS_UNDEFINED; }
M(colorMask) { SELF NEED(4); gl.colorMask(JS_ToBool(c, argv[0]) != 0, JS_ToBool(c, argv[1]) != 0, JS_ToBool(c, argv[2]) != 0, JS_ToBool(c, argv[3]) != 0); return JS_UNDEFINED; }
M(depthMask) { SELF NEED(1); gl.depthMask(JS_ToBool(c, argv[0]) != 0); return JS_UNDEFINED; }
M(depthRange) { SELF NEED(2); gl.depthRange(F(0), F(1)); return JS_UNDEFINED; }
M(lineWidth) { SELF NEED(1); gl.lineWidth(F(0)); return JS_UNDEFINED; }
M(polygonOffset) { SELF NEED(2); gl.polygonOffset(F(0), F(1)); return JS_UNDEFINED; }
M(sampleCoverage) { SELF NEED(2); gl.sampleCoverage(F(0), JS_ToBool(c, argv[1]) != 0); return JS_UNDEFINED; }
M(stencilFunc) { SELF NEED(3); gl.stencilFunc(U(0), I(1), U(2)); return JS_UNDEFINED; }
M(stencilFuncSeparate) { SELF NEED(4); gl.stencilFuncSeparate(U(0), U(1), I(2), U(3)); return JS_UNDEFINED; }
M(stencilOp) { SELF NEED(3); gl.stencilOp(U(0), U(1), U(2)); return JS_UNDEFINED; }
M(stencilOpSeparate) { SELF NEED(4); gl.stencilOpSeparate(U(0), U(1), U(2), U(3)); return JS_UNDEFINED; }
M(flush) { SELF gl.flush(); return JS_UNDEFINED; }
M(finish) { SELF gl.finish(); return JS_UNDEFINED; }

M(createRenderbuffer) { SELF return wrapOnce(c, g, 7, gl.createRenderbuffer()); }
M(deleteRenderbuffer) { SELF NEED(1); OBJ(o, 0, 7) gl.deleteRenderbuffer(o.id); return JS_UNDEFINED; }
M(bindRenderbuffer) { SELF NEED(2); OBJ(o, 1, 7) gl.bindRenderbuffer(U(0), o.id); return JS_UNDEFINED; }
M(renderbufferStorage) { SELF NEED(4); gl.renderbufferStorage(U(0), U(1), I(2), I(3)); return JS_UNDEFINED; }
M(framebufferRenderbuffer) { SELF NEED(4); OBJ(o, 3, 7) gl.framebufferRenderbuffer(U(0), U(1), U(2), o.id); return JS_UNDEFINED; }
M(deleteFramebuffer) { SELF NEED(1); OBJ(o, 0, 5) gl.deleteFramebuffer(o.id); return JS_UNDEFINED; }
M(isEnabled) { SELF NEED(1); return JS_NewBool(c, gl.isEnabled(U(0))); }
#define IS_KIND(n, K, call) M(n) { SELF NEED(1); Obj* o = static_cast<Obj*>(JS_GetOpaque(argv[0], gObjClass)); return JS_NewBool(c, o && o->kind == K && gl.call(o->id)); }
IS_KIND(isShader, 2, isShader) IS_KIND(isProgram, 3, isProgram) IS_KIND(isTexture, 4, isTexture) IS_KIND(isFramebuffer, 5, isFramebuffer) IS_KIND(isRenderbuffer, 7, isRenderbuffer)
M(getShaderSource) { SELF NEED(1); OBJ(o, 0, 2) if (!gl.isShader(o.id)) return JS_NULL; return JS_NewString(c, gl.shaderSourceOf(o.id).c_str()); }
M(deleteShader) { SELF NEED(1); OBJ(o, 0, 2) gl.deleteShader(o.id); return JS_UNDEFINED; }
M(deleteProgram) { SELF NEED(1); OBJ(o, 0, 3) gl.deleteProgram(o.id); return JS_UNDEFINED; }
M(detachShader) { SELF NEED(2); OBJ(p, 0, 3) OBJ(s, 1, 2) gl.detachShader(p.id, s.id); return JS_UNDEFINED; }
M(validateProgram) { SELF NEED(1); OBJ(p, 0, 3) gl.validateProgram(p.id); return JS_UNDEFINED; }
JSValue activeInfo(JSContext* c, const WebGL1::Active& a) {
  if (!a.ok) return JS_NULL;
  JSValue o = JS_NewObject(c);
  JS_SetPropertyStr(c, o, "name", JS_NewString(c, a.name.c_str()));
  JS_SetPropertyStr(c, o, "size", JS_NewInt32(c, a.size));
  JS_SetPropertyStr(c, o, "type", JS_NewUint32(c, a.type));
  return o;
}
M(getActiveUniform) { SELF NEED(2); OBJ(p, 0, 3) return activeInfo(c, gl.getActiveUniform(p.id, U(1))); }
M(getActiveAttrib) { SELF NEED(2); OBJ(p, 0, 3) return activeInfo(c, gl.getActiveAttrib(p.id, U(1))); }
M(getParameter) { SELF NEED(1); std::uint32_t pn = U(0); return paramToJs(c, g, pn, gl.getParameter(pn)); }
M(getVertexAttrib) { SELF NEED(2); std::uint32_t pn = U(1); return paramToJs(c, g, pn, gl.getVertexAttrib(U(0), pn)); }
M(getBufferParameter) { SELF NEED(2); return paramToJs(c, g, U(1), gl.getBufferParameter(U(0), U(1))); }
M(getTexParameter) { SELF NEED(2); return paramToJs(c, g, U(1), gl.getTexParameter(U(0), U(1))); }
M(getUniform) { SELF NEED(2); OBJ(p, 0, 3) bool ok; UniformLoc l = locOf(c, argv[1], ok); if (!ok) return JS_EXCEPTION; return paramToJs(c, g, 0, gl.getUniform(p.id, l)); }
M(getShaderPrecisionFormat) {
  SELF NEED(2);
  int out[3];
  gl.getShaderPrecisionFormat(U(0), U(1), out);
  JSValue o = JS_NewObject(c);
  JS_SetPropertyStr(c, o, "rangeMin", JS_NewInt32(c, out[0]));
  JS_SetPropertyStr(c, o, "rangeMax", JS_NewInt32(c, out[1]));
  JS_SetPropertyStr(c, o, "precision", JS_NewInt32(c, out[2]));
  return o;
}
M(getSupportedExtensions) { return JS_NewArray(c); (void)t; (void)argc; (void)argv; }
M(getVertexAttribOffset) { SELF NEED(2); return JS_NewInt32(c, 0); }

M(uniform3f) { SELF NEED(4); LOC gl.uniform3f(l, F(1), F(2), F(3)); return JS_UNDEFINED; }
M(uniform2i) { SELF NEED(3); LOC gl.uniform2i(l, I(1), I(2)); return JS_UNDEFINED; }
M(uniform3i) { SELF NEED(4); LOC gl.uniform3i(l, I(1), I(2), I(3)); return JS_UNDEFINED; }
M(uniform4i) { SELF NEED(5); LOC gl.uniform4i(l, I(1), I(2), I(3), I(4)); return JS_UNDEFINED; }
JSValue uniformFv(JSContext* c, Gl* g, int n, int argc, JSValueConst* argv) {
  if (argc < 2) return JS_ThrowTypeError(c, "not enough arguments");
  bool ok; UniformLoc l = locOf(c, argv[0], ok); if (!ok) return JS_EXCEPTION;
  std::vector<float> v;
  if (!floatsOf(c, argv[1], v)) return JS_ThrowTypeError(c, "value must be a Float32Array or an array");
  g->gl.uniformNfv(l, n, v.data(), v.size());
  return JS_UNDEFINED;
}
JSValue uniformIv(JSContext* c, Gl* g, int n, int argc, JSValueConst* argv) {
  if (argc < 2) return JS_ThrowTypeError(c, "not enough arguments");
  bool ok; UniformLoc l = locOf(c, argv[0], ok); if (!ok) return JS_EXCEPTION;
  std::vector<int> v;
  std::uint8_t* p = nullptr; std::size_t nb = 0;
  if (bytesOf(c, argv[1], p, nb)) { v.resize(nb / 4); std::memcpy(v.data(), p, v.size() * 4); }
  else if (JS_IsArray(argv[1])) { JSValue lv = JS_GetPropertyStr(c, argv[1], "length"); std::uint32_t len = u32(c, lv); JS_FreeValue(c, lv); for (std::uint32_t i = 0; i < len; ++i) { JSValue e = JS_GetPropertyUint32(c, argv[1], i); v.push_back(i32(c, e)); JS_FreeValue(c, e); } }
  else return JS_ThrowTypeError(c, "value must be an Int32Array or an array");
  g->gl.uniformNiv(l, n, v.data(), v.size());
  return JS_UNDEFINED;
}
#define UNI_FV(k) M(uniform##k##fv) { SELF return uniformFv(c, g, k, argc, argv); }
#define UNI_IV(k) M(uniform##k##iv) { SELF return uniformIv(c, g, k, argc, argv); }
UNI_FV(1) UNI_FV(2) UNI_FV(3) UNI_FV(4) UNI_IV(1) UNI_IV(2) UNI_IV(3) UNI_IV(4)
JSValue uniformMat(JSContext* c, Gl* g, int n, int argc, JSValueConst* argv) {
  if (argc < 3) return JS_ThrowTypeError(c, "not enough arguments");
  bool ok; UniformLoc l = locOf(c, argv[0], ok); if (!ok) return JS_EXCEPTION;
  std::vector<float> v;
  if (!floatsOf(c, argv[2], v)) return JS_ThrowTypeError(c, "value must be a Float32Array or an array");
  g->gl.uniformMatrixNfv(l, n, JS_ToBool(c, argv[1]) != 0, v.data(), v.size());
  return JS_UNDEFINED;
}
M(uniformMatrix2fv) { SELF return uniformMat(c, g, 2, argc, argv); }
M(uniformMatrix3fv) { SELF return uniformMat(c, g, 3, argc, argv); }
JSValue attribF(JSContext* c, Gl* g, int n, bool vec, int argc, JSValueConst* argv) {
  if (argc < 1 + (vec ? 1 : n)) return JS_ThrowTypeError(c, "not enough arguments");
  float v[4] = {0, 0, 0, 1};
  if (vec) { std::vector<float> a; if (!floatsOf(c, argv[1], a) || static_cast<int>(a.size()) < n) return JS_ThrowTypeError(c, "value must be a Float32Array or an array"); for (int i = 0; i < n; ++i) v[i] = a[i]; }
  else for (int i = 0; i < n; ++i) v[i] = static_cast<float>(num(c, argv[1 + i]));
  g->gl.vertexAttribNf(u32(c, argv[0]), n, v);
  return JS_UNDEFINED;
}
#define ATTR_F(k) M(vertexAttrib##k##f) { SELF return attribF(c, g, k, false, argc, argv); } M(vertexAttrib##k##fv) { SELF return attribF(c, g, k, true, argc, argv); }
ATTR_F(1) ATTR_F(2) ATTR_F(3) ATTR_F(4)
M(texSubImage2D) {
  SELF NEED(9);
  std::uint8_t* p = nullptr; std::size_t n = 0;
  if (!bytesOf(c, argv[8], p, n)) return JS_ThrowTypeError(c, "texSubImage2D: pixels must be an ArrayBuffer view");
  gl.texSubImage2D(U(0), I(1), I(2), I(3), I(4), I(5), U(6), U(7), p, n);
  return JS_UNDEFINED;
}
M(copyTexImage2D) { SELF NEED(8); gl.copyTexImage2D(U(0), I(1), U(2), I(3), I(4), I(5), I(6), I(7)); return JS_UNDEFINED; }
M(copyTexSubImage2D) { SELF NEED(8); gl.copyTexSubImage2D(U(0), I(1), I(2), I(3), I(4), I(5), I(6), I(7)); return JS_UNDEFINED; }
M(generateMipmap) { SELF NEED(1); gl.generateMipmap(U(0)); return JS_UNDEFINED; }
M(getRenderbufferParameter) { SELF NEED(2); return JS_NULL; }
M(getFramebufferAttachmentParameter) { SELF NEED(3); return JS_NULL; }

struct Fn { const char* name; JSCFunction* fn; int len; };
#define F_(n, len) {#n, js_##n, len}
const Fn kMethods[] = {
  F_(getError, 0), F_(enable, 1), F_(disable, 1), F_(viewport, 4), F_(scissor, 4), F_(clearColor, 4), F_(clear, 1), F_(pixelStorei, 2),
  F_(createBuffer, 0), F_(deleteBuffer, 1), F_(isBuffer, 1), F_(bindBuffer, 2), F_(bufferData, 3), F_(bufferSubData, 3),
  F_(createShader, 1), F_(shaderSource, 2), F_(compileShader, 1), F_(getShaderParameter, 2), F_(getShaderInfoLog, 1),
  F_(createProgram, 0), F_(attachShader, 2), F_(bindAttribLocation, 3), F_(linkProgram, 1), F_(getProgramParameter, 2), F_(getProgramInfoLog, 1), F_(useProgram, 1),
  F_(getAttribLocation, 2), F_(getUniformLocation, 2), F_(uniform1f, 2), F_(uniform2f, 3), F_(uniform4f, 5), F_(uniform1i, 2), F_(uniformMatrix4fv, 3),
  F_(enableVertexAttribArray, 1), F_(disableVertexAttribArray, 1), F_(vertexAttribPointer, 6), F_(drawArrays, 3), F_(drawElements, 4),
  F_(createTexture, 0), F_(deleteTexture, 1), F_(bindTexture, 2), F_(activeTexture, 1), F_(texParameteri, 3), F_(texImage2D, 9),
  F_(createFramebuffer, 0), F_(bindFramebuffer, 2), F_(framebufferTexture2D, 5), F_(checkFramebufferStatus, 1), F_(readPixels, 7),
  F_(getContextAttributes, 0), F_(getExtension, 1), F_(isContextLost, 0),
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
  F_(getSupportedExtensions, 0),
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
#define NEED2 if (gl.version() != 2) return JS_ThrowTypeError(c, "not a WebGL 2 context")
M(createVertexArray) { SELF NEED2; return wrapOnce(c, g, 8, gl.createVertexArray()); }
M(deleteVertexArray) { SELF NEED(1); OBJ(o, 0, 8) gl.deleteVertexArray(o.id); return JS_UNDEFINED; }
M(bindVertexArray) { SELF NEED(1); OBJ(o, 0, 8) gl.bindVertexArray(o.id); return JS_UNDEFINED; }
M(isVertexArray) { SELF NEED(1); Obj* o = static_cast<Obj*>(JS_GetOpaque(argv[0], gObjClass)); return JS_NewBool(c, o && o->kind == 8 && gl.isVertexArray(o->id)); }
M(vertexAttribDivisor) { SELF NEED(2); gl.vertexAttribDivisor(U(0), U(1)); return JS_UNDEFINED; }
M(drawArraysInstanced) { SELF NEED(4); gl.drawArraysInstanced(U(0), I(1), I(2), I(3)); return JS_UNDEFINED; }
M(drawElementsInstanced) { SELF NEED(5); gl.drawElementsInstanced(U(0), I(1), U(2), i64(c, argv[3]), I(4)); return JS_UNDEFINED; }
M(drawRangeElements) { SELF NEED(6); gl.drawRangeElements(U(0), U(1), U(2), I(3), U(4), i64(c, argv[5])); return JS_UNDEFINED; }
M(drawBuffers) {
  SELF NEED(1);
  std::vector<float> v;
  std::uint32_t bufs[16];
  JSValue lv = JS_GetPropertyStr(c, argv[0], "length");
  std::uint32_t n = u32(c, lv);
  JS_FreeValue(c, lv);
  if (n > 16) n = 16;
  for (std::uint32_t i = 0; i < n; ++i) { JSValue e = JS_GetPropertyUint32(c, argv[0], i); bufs[i] = u32(c, e); JS_FreeValue(c, e); }
  gl.drawBuffers(bufs, static_cast<int>(n));
  return JS_UNDEFINED;
}
M(readBuffer) { SELF NEED(1); gl.readBuffer(U(0)); return JS_UNDEFINED; }
M(bindBufferBase) { SELF NEED(3); OBJ(o, 2, 1) gl.bindBufferBase(U(0), U(1), o.id); return JS_UNDEFINED; }
M(bindBufferRange) { SELF NEED(5); OBJ(o, 2, 1) gl.bindBufferRange(U(0), U(1), o.id, i64(c, argv[3]), i64(c, argv[4])); return JS_UNDEFINED; }
M(getUniformBlockIndex) { SELF NEED(2); OBJ(p, 0, 3) return JS_NewUint32(c, gl.getUniformBlockIndex(p.id, str(c, argv[1]))); }
M(uniformBlockBinding) { SELF NEED(3); OBJ(p, 0, 3) gl.uniformBlockBinding(p.id, U(1), U(2)); return JS_UNDEFINED; }
M(getActiveUniformBlockParameter) { SELF NEED(3); OBJ(p, 0, 3) std::uint32_t pn = U(2); return paramToJs(c, g, pn, gl.getActiveUniformBlockParameter(p.id, U(1), pn)); }
M(getActiveUniformBlockName) { SELF NEED(2); OBJ(p, 0, 3) return JS_NewString(c, gl.getActiveUniformBlockName(p.id, U(1)).c_str()); }
M(copyBufferSubData) { SELF NEED(5); gl.copyBufferSubData(U(0), U(1), i64(c, argv[2]), i64(c, argv[3]), i64(c, argv[4])); return JS_UNDEFINED; }
M(getBufferSubData) {
  SELF NEED(3);
  std::uint8_t* p = nullptr; std::size_t n = 0;
  if (!bytesOf(c, argv[2], p, n)) return JS_ThrowTypeError(c, "getBufferSubData: dstData must be an ArrayBuffer view");
  gl.getBufferSubData(U(0), i64(c, argv[1]), p, n);
  return JS_UNDEFINED;
}
M(uniform1ui) { SELF NEED(2); LOC std::uint32_t v[1] = {U(1)}; gl.uniformNui(l, 1, v, 1); return JS_UNDEFINED; }
M(uniform2ui) { SELF NEED(3); LOC std::uint32_t v[2] = {U(1), U(2)}; gl.uniformNui(l, 2, v, 2); return JS_UNDEFINED; }
M(uniform3ui) { SELF NEED(4); LOC std::uint32_t v[3] = {U(1), U(2), U(3)}; gl.uniformNui(l, 3, v, 3); return JS_UNDEFINED; }
M(uniform4ui) { SELF NEED(5); LOC std::uint32_t v[4] = {U(1), U(2), U(3), U(4)}; gl.uniformNui(l, 4, v, 4); return JS_UNDEFINED; }
M(vertexAttribIPointer) { SELF NEED(5); gl.vertexAttribIPointer(U(0), I(1), U(2), I(3), i64(c, argv[4])); return JS_UNDEFINED; }
const Fn kMethods2[] = {
  {"createVertexArray", js_createVertexArray, 0}, {"deleteVertexArray", js_deleteVertexArray, 1}, {"bindVertexArray", js_bindVertexArray, 1}, {"isVertexArray", js_isVertexArray, 1},
  {"vertexAttribDivisor", js_vertexAttribDivisor, 2}, {"drawArraysInstanced", js_drawArraysInstanced, 4}, {"drawElementsInstanced", js_drawElementsInstanced, 5}, {"drawRangeElements", js_drawRangeElements, 6},
  {"drawBuffers", js_drawBuffers, 1}, {"readBuffer", js_readBuffer, 1}, {"bindBufferBase", js_bindBufferBase, 3}, {"bindBufferRange", js_bindBufferRange, 5},
  {"getUniformBlockIndex", js_getUniformBlockIndex, 2}, {"uniformBlockBinding", js_uniformBlockBinding, 3}, {"getActiveUniformBlockParameter", js_getActiveUniformBlockParameter, 3}, {"getActiveUniformBlockName", js_getActiveUniformBlockName, 2},
  {"copyBufferSubData", js_copyBufferSubData, 5}, {"getBufferSubData", js_getBufferSubData, 3},
  {"uniform1ui", js_uniform1ui, 2}, {"uniform2ui", js_uniform2ui, 3}, {"uniform3ui", js_uniform3ui, 4}, {"uniform4ui", js_uniform4ui, 5}, {"vertexAttribIPointer", js_vertexAttribIPointer, 5},
};

struct Const { const char* name; std::uint32_t value; };
const Const kConsts[] = {
#include "gl/webgl_consts.inc"
};
const Const kConsts2[] = {
#include "gl/webgl2_consts.inc"
};

// __zincReadFile(path): the text of a local file or undefined; the conformance pages load their shaders and data through XMLHttpRequest, which the test shim maps to it
JSValue js_readFile(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
  if (argc < 1) return JS_UNDEFINED;
  std::string path = str(c, argv[0]);
  std::FILE* f = std::fopen(path.c_str(), "rb");
  if (!f) return JS_UNDEFINED;
  std::string data;
  char buf[4096];
  std::size_t n;
  while ((n = std::fread(buf, 1, sizeof buf, f)) > 0) data.append(buf, n);
  std::fclose(f);
  return JS_NewStringLen(c, data.data(), data.size());
}

JSValue js_illegalConstructor(JSContext* c, JSValueConst, int, JSValueConst*) { return JS_ThrowTypeError(c, "Illegal constructor"); }

JSValue createContext(JSContext* c, int w, int h, int version = 1) {
  auto g = std::make_unique<Gl>();
  std::string err;
  if (version == 2) { if (!g->gl.create(Api::Gl33, w, h, err, 2) && !g->gl.create(Api::Gles3, w, h, err, 2)) return JS_NULL; }
  else if (!g->gl.create(Api::Gl33, w, h, err) && !g->gl.create(Api::Gles2, w, h, err)) return JS_NULL;
  g->w = w; g->h = h; g->version = version;
  JSValue proto = version == 2 ? JS_DupValue(c, gProto2) : JS_GetClassProto(c, static_cast<int>(gCtxClass));
  JSValue o = JS_NewObjectProtoClass(c, proto, static_cast<int>(gCtxClass));
  JS_FreeValue(c, proto);
  JS_SetPropertyStr(c, o, "drawingBufferWidth", JS_NewInt32(c, w));
  JS_SetPropertyStr(c, o, "drawingBufferHeight", JS_NewInt32(c, h));
  JS_SetOpaque(o, g.release());
  return o;
}

// canvas.getContext('webgl' | 'experimental-webgl'): one context per canvas, the canvas size at the first call
JSValue js_canvasGetContext(JSContext* c, JSValueConst t, int argc, JSValueConst* argv) {
  if (argc < 1) return JS_NULL;
  std::string type = str(c, argv[0]);
  const bool v2 = type == "webgl2";
  if (type != "webgl" && type != "experimental-webgl" && !v2) return JS_NULL;
  JSValue cached = JS_GetPropertyStr(c, t, "__gl");
  if (!JS_IsUndefined(cached)) { Gl* have = static_cast<Gl*>(JS_GetOpaque(cached, gCtxClass)); if (have && (have->version == 2) == v2) return cached; JS_FreeValue(c, cached); return JS_NULL; }   // one kind of context per canvas
  JSValue wv = JS_GetPropertyStr(c, t, "width"), hv = JS_GetPropertyStr(c, t, "height");
  int w = i32(c, wv), h = i32(c, hv);
  JS_FreeValue(c, wv); JS_FreeValue(c, hv);
  JSValue ctxv = createContext(c, w > 0 ? w : 300, h > 0 ? h : 150, v2 ? 2 : 1);
  if (!JS_IsNull(ctxv)) { JS_SetPropertyStr(c, ctxv, "canvas", JS_DupValue(c, t)); JS_SetPropertyStr(c, t, "__gl", JS_DupValue(c, ctxv)); }
  return ctxv;
}
JSValue js_createElement(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
  if (argc < 1 || str(c, argv[0]) != "canvas") return JS_NULL;
  JSValue o = JS_NewObject(c);
  JS_SetPropertyStr(c, o, "width", JS_NewInt32(c, 300));
  JS_SetPropertyStr(c, o, "height", JS_NewInt32(c, 150));
  JS_SetPropertyStr(c, o, "getContext", JS_NewCFunction(c, js_canvasGetContext, "getContext", 2));
  return o;
}

void install(JSContext* c) {
  JSRuntime* rt = JS_GetRuntime(c);
  if (!gCtxClass) {
    JS_NewClassID(rt, &gCtxClass);
    JS_NewClassID(rt, &gObjClass);
  }
  JSClassDef cd{}, od{};
  cd.class_name = "WebGLRenderingContext"; cd.finalizer = ctxFinalizer;
  od.class_name = "WebGLObject"; od.finalizer = objFinalizer;
  JS_NewClass(rt, gCtxClass, &cd);
  JS_NewClass(rt, gObjClass, &od);
  JSValue proto = JS_NewObject(c);
  for (const Fn& f : kMethods) JS_SetPropertyStr(c, proto, f.name, JS_NewCFunction(c, f.fn, f.name, f.len));
  for (const Const& k : kConsts) JS_SetPropertyStr(c, proto, k.name, JS_NewUint32(c, k.value));
  JS_SetClassProto(c, gCtxClass, proto);
  JSValue global0 = JS_GetGlobalObject(c);
  auto ctor = [&](const char* name, JSValue p) {   // a constructor that throws, with the prototype: `x instanceof WebGLBuffer`, `WebGLRenderingContext.ARRAY_BUFFER`
    JSValue f = JS_NewCFunction2(c, js_illegalConstructor, name, 0, JS_CFUNC_constructor, 0);
    JS_SetPropertyStr(c, f, "prototype", JS_DupValue(c, p));
    JS_SetPropertyStr(c, p, "constructor", JS_DupValue(c, f));
    JS_SetPropertyStr(c, global0, name, f);
    return f;
  };
  JSValue ctxCtor = ctor("WebGLRenderingContext", proto);
  for (const Const& k : kConsts) JS_SetPropertyStr(c, ctxCtor, k.name, JS_NewUint32(c, k.value));
  for (int k = 1; k <= 8; ++k) { gKindProto[k] = JS_NewObject(c); ctor(kKindNames[k], gKindProto[k]); }
  gProto2 = JS_NewObjectProto(c, proto);   // WebGL2RenderingContext.prototype
  for (const Fn& f : kMethods2) JS_SetPropertyStr(c, gProto2, f.name, JS_NewCFunction(c, f.fn, f.name, f.len));
  for (const Const& k : kConsts2) JS_SetPropertyStr(c, gProto2, k.name, JS_NewUint32(c, k.value));
  JSValue ctor2 = ctor("WebGL2RenderingContext", gProto2);
  for (const Const& k : kConsts2) JS_SetPropertyStr(c, ctor2, k.name, JS_NewUint32(c, k.value));
  JS_SetPropertyStr(c, global0, "__zincReadFile", JS_NewCFunction(c, js_readFile, "__zincReadFile", 1));
  JS_FreeValue(c, global0);
  JSValue global = JS_GetGlobalObject(c);
  JSValue doc = JS_GetPropertyStr(c, global, "document");
  if (JS_IsUndefined(doc)) { doc = JS_NewObject(c); JS_SetPropertyStr(c, global, "document", JS_DupValue(c, doc)); }
  JS_SetPropertyStr(c, doc, "createElement", JS_NewCFunction(c, js_createElement, "createElement", 1));
  JS_FreeValue(c, doc);
  JS_FreeValue(c, global);
}

}  // namespace

void installWebGLBindings() { zn::qjs::addContextHook(install); }

}  // namespace zn::gl
