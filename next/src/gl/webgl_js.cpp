// WebGL 1.0 in the QuickJS engine (ZN-203.03): the WebGLRenderingContext class and the object classes as native JS classes over zn::gl::WebGL1 (src/gl/webgl1.cpp), typed arrays read in place,
// plus a tiny `document.createElement('canvas')` / `canvas.getContext('webgl')`. Registered with zn::qjs::addContextHook; trusted programs only (`zinc run --engine quickjs`).
#include "gl/webgl_js.h"

#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "gl/webgl1.h"
#include "quickjs.h"
#include "zn/js_ext.h"

namespace zn::gl {
namespace {

struct Obj { int kind; Id id; UniformLoc loc; };   // kind: 1 buffer, 2 shader, 3 program, 4 texture, 5 framebuffer, 6 uniform location
struct Gl { WebGL1 gl; int w = 0, h = 0; };

JSClassID gCtxClass = 0, gObjClass = 0;
const char* kKindNames[] = {"", "WebGLBuffer", "WebGLShader", "WebGLProgram", "WebGLTexture", "WebGLFramebuffer", "WebGLUniformLocation"};

void ctxFinalizer(JSRuntime*, JSValue v) { delete static_cast<Gl*>(JS_GetOpaque(v, gCtxClass)); }
void objFinalizer(JSRuntime*, JSValue v) { delete static_cast<Obj*>(JS_GetOpaque(v, gObjClass)); }

Gl* self(JSContext* c, JSValueConst t) { return static_cast<Gl*>(JS_GetOpaque2(c, t, gCtxClass)); }
#define SELF Gl* g = self(c, t); if (!g) return JS_EXCEPTION; WebGL1& gl = g->gl; (void)gl; (void)argc; (void)argv;

JSValue wrap(JSContext* c, int kind, Id id, UniformLoc loc = {}) {
  JSValue o = JS_NewObjectClass(c, static_cast<int>(gObjClass));
  JS_SetOpaque(o, new Obj{kind, id, loc});
  JS_SetPropertyStr(c, o, "__kind", JS_NewString(c, kKindNames[kind]));
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

M(createBuffer) { SELF return wrap(c, 1, gl.createBuffer()); }
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

M(createShader) { SELF NEED(1); Id id = gl.createShader(U(0)); return id ? wrap(c, 2, id) : JS_NULL; }
M(shaderSource) { SELF NEED(2); OBJ(o, 0, 2) gl.shaderSource(o.id, str(c, argv[1])); return JS_UNDEFINED; }
M(compileShader) { SELF NEED(1); OBJ(o, 0, 2) gl.compileShader(o.id); return JS_UNDEFINED; }
M(getShaderParameter) {
  SELF NEED(2); OBJ(o, 0, 2)
  switch (U(1)) { case 0x8B81: return JS_NewBool(c, gl.shaderCompiled(o.id)); case 0x8B80: return JS_FALSE; }
  return JS_NULL;
}
M(getShaderInfoLog) { SELF NEED(1); OBJ(o, 0, 2) return JS_NewString(c, gl.shaderInfoLog(o.id).c_str()); }
M(createProgram) { SELF return wrap(c, 3, gl.createProgram()); }
M(attachShader) { SELF NEED(2); OBJ(p, 0, 3) OBJ(s, 1, 2) gl.attachShader(p.id, s.id); return JS_UNDEFINED; }
M(bindAttribLocation) { SELF NEED(3); OBJ(p, 0, 3) gl.bindAttribLocation(p.id, U(1), str(c, argv[2])); return JS_UNDEFINED; }
M(linkProgram) { SELF NEED(1); OBJ(p, 0, 3) gl.linkProgram(p.id); return JS_UNDEFINED; }
M(getProgramParameter) {
  SELF NEED(2); OBJ(p, 0, 3)
  switch (U(1)) { case 0x8B82: return JS_NewBool(c, gl.programLinked(p.id)); case 0x8B80: return JS_FALSE; }
  return JS_NULL;
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

M(createTexture) { SELF return wrap(c, 4, gl.createTexture()); }
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

M(createFramebuffer) { SELF return wrap(c, 5, gl.createFramebuffer()); }
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

JSValue js_getContextAttributes(JSContext*, JSValueConst, int, JSValueConst*) { return JS_NULL; }
JSValue js_getExtension(JSContext*, JSValueConst, int, JSValueConst*) { return JS_NULL; }   // none yet: three.js asks, and gets null like on a bare driver
JSValue js_isContextLost(JSContext*, JSValueConst, int, JSValueConst*) { return JS_FALSE; }

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
};

struct Const { const char* name; std::uint32_t value; };
const Const kConsts[] = {
  {"DEPTH_BUFFER_BIT", 0x100},
  {"STENCIL_BUFFER_BIT", 0x400},
  {"COLOR_BUFFER_BIT", 0x4000},
  {"POINTS", 0},
  {"LINES", 1},
  {"LINE_LOOP", 2},
  {"LINE_STRIP", 3},
  {"TRIANGLES", 4},
  {"TRIANGLE_STRIP", 5},
  {"TRIANGLE_FAN", 6},
  {"ZERO", 0},
  {"ONE", 1},
  {"SRC_COLOR", 0x300},
  {"ONE_MINUS_SRC_COLOR", 0x301},
  {"SRC_ALPHA", 0x302},
  {"ONE_MINUS_SRC_ALPHA", 0x303},
  {"DST_ALPHA", 0x304},
  {"ONE_MINUS_DST_ALPHA", 0x305},
  {"DST_COLOR", 0x306},
  {"ONE_MINUS_DST_COLOR", 0x307},
  {"FUNC_ADD", 0x8006},
  {"ARRAY_BUFFER", 0x8892},
  {"ELEMENT_ARRAY_BUFFER", 0x8893},
  {"STREAM_DRAW", 0x88E0},
  {"STATIC_DRAW", 0x88E4},
  {"DYNAMIC_DRAW", 0x88E8},
  {"FRONT", 0x404},
  {"BACK", 0x405},
  {"FRONT_AND_BACK", 0x408},
  {"CULL_FACE", 0xB44},
  {"BLEND", 0xBE2},
  {"DITHER", 0xBD0},
  {"STENCIL_TEST", 0xB90},
  {"DEPTH_TEST", 0xB71},
  {"SCISSOR_TEST", 0xC11},
  {"POLYGON_OFFSET_FILL", 0x8037},
  {"SAMPLE_ALPHA_TO_COVERAGE", 0x809E},
  {"SAMPLE_COVERAGE", 0x80A0},
  {"NO_ERROR", 0},
  {"INVALID_ENUM", 0x500},
  {"INVALID_VALUE", 0x501},
  {"INVALID_OPERATION", 0x502},
  {"OUT_OF_MEMORY", 0x505},
  {"INVALID_FRAMEBUFFER_OPERATION", 0x506},
  {"BYTE", 0x1400},
  {"UNSIGNED_BYTE", 0x1401},
  {"SHORT", 0x1402},
  {"UNSIGNED_SHORT", 0x1403},
  {"INT", 0x1404},
  {"UNSIGNED_INT", 0x1405},
  {"FLOAT", 0x1406},
  {"DEPTH_COMPONENT", 0x1902},
  {"ALPHA", 0x1906},
  {"RGB", 0x1907},
  {"RGBA", 0x1908},
  {"LUMINANCE", 0x1909},
  {"LUMINANCE_ALPHA", 0x190A},
  {"FRAGMENT_SHADER", 0x8B30},
  {"VERTEX_SHADER", 0x8B31},
  {"DELETE_STATUS", 0x8B80},
  {"COMPILE_STATUS", 0x8B81},
  {"LINK_STATUS", 0x8B82},
  {"VALIDATE_STATUS", 0x8B83},
  {"SHADER_TYPE", 0x8B4F},
  {"FLOAT_VEC2", 0x8B50},
  {"FLOAT_VEC3", 0x8B51},
  {"FLOAT_VEC4", 0x8B52},
  {"INT_VEC2", 0x8B53},
  {"INT_VEC3", 0x8B54},
  {"INT_VEC4", 0x8B55},
  {"BOOL", 0x8B56},
  {"FLOAT_MAT2", 0x8B5A},
  {"FLOAT_MAT3", 0x8B5B},
  {"FLOAT_MAT4", 0x8B5C},
  {"SAMPLER_2D", 0x8B5E},
  {"SAMPLER_CUBE", 0x8B60},
  {"NEVER", 0x200},
  {"LESS", 0x201},
  {"EQUAL", 0x202},
  {"LEQUAL", 0x203},
  {"GREATER", 0x204},
  {"NOTEQUAL", 0x205},
  {"GEQUAL", 0x206},
  {"ALWAYS", 0x207},
  {"NEAREST", 0x2600},
  {"LINEAR", 0x2601},
  {"NEAREST_MIPMAP_NEAREST", 0x2700},
  {"LINEAR_MIPMAP_NEAREST", 0x2701},
  {"NEAREST_MIPMAP_LINEAR", 0x2702},
  {"LINEAR_MIPMAP_LINEAR", 0x2703},
  {"TEXTURE_MAG_FILTER", 0x2800},
  {"TEXTURE_MIN_FILTER", 0x2801},
  {"TEXTURE_WRAP_S", 0x2802},
  {"TEXTURE_WRAP_T", 0x2803},
  {"TEXTURE_2D", 0xDE1},
  {"TEXTURE_CUBE_MAP", 0x8513},
  {"TEXTURE", 0x1702},
  {"TEXTURE0", 0x84C0},
  {"REPEAT", 0x2901},
  {"CLAMP_TO_EDGE", 0x812F},
  {"MIRRORED_REPEAT", 0x8370},
  {"UNSIGNED_SHORT_4_4_4_4", 0x8033},
  {"UNSIGNED_SHORT_5_5_5_1", 0x8034},
  {"UNSIGNED_SHORT_5_6_5", 0x8363},
  {"UNPACK_ALIGNMENT", 0xCF5},
  {"PACK_ALIGNMENT", 0xD05},
  {"UNPACK_FLIP_Y_WEBGL", 0x9240},
  {"UNPACK_PREMULTIPLY_ALPHA_WEBGL", 0x9241},
  {"UNPACK_COLORSPACE_CONVERSION_WEBGL", 0x9243},
  {"FRAMEBUFFER", 0x8D40},
  {"RENDERBUFFER", 0x8D41},
  {"COLOR_ATTACHMENT0", 0x8CE0},
  {"DEPTH_ATTACHMENT", 0x8D00},
  {"STENCIL_ATTACHMENT", 0x8D20},
  {"DEPTH_STENCIL_ATTACHMENT", 0x821A},
  {"FRAMEBUFFER_COMPLETE", 0x8CD5},
  {"FRAMEBUFFER_INCOMPLETE_ATTACHMENT", 0x8CD6},
  {"FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT", 0x8CD7},
  {"FRAMEBUFFER_UNSUPPORTED", 0x8CDD},
};

JSValue createContext(JSContext* c, int w, int h) {
  auto g = std::make_unique<Gl>();
  std::string err;
  if (!g->gl.create(Api::Gl33, w, h, err) && !g->gl.create(Api::Gles2, w, h, err)) return JS_NULL;
  g->w = w; g->h = h;
  JSValue proto = JS_GetClassProto(c, static_cast<int>(gCtxClass));
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
  if (type != "webgl" && type != "experimental-webgl") return JS_NULL;
  JSValue cached = JS_GetPropertyStr(c, t, "__gl");
  if (!JS_IsUndefined(cached)) return cached;
  JSValue wv = JS_GetPropertyStr(c, t, "width"), hv = JS_GetPropertyStr(c, t, "height");
  int w = i32(c, wv), h = i32(c, hv);
  JS_FreeValue(c, wv); JS_FreeValue(c, hv);
  JSValue ctxv = createContext(c, w > 0 ? w : 300, h > 0 ? h : 150);
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
