// The native <-> QuickJS boundary (ZN-601, from docs/reports/quickjs-aot-jit-and-ffi.md 5.1): a bare QuickJS host with a fake `GL`
// class whose methods copy the shapes of src/gl/webgl_js.cpp and src/qjs/qjs.cpp, so each way of binding a call is timed alone.
// Built and run by bench/qjs_boundary/run (tools/bench gates it); usage: harness boundary.js
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "quickjs.h"

static JSClassID gGlClass, gLocClass;
typedef struct State { double acc; long calls; float shared[64]; } State;
typedef struct Loc { int loc; } Loc;
static State gState;
static JSAtom gAx, gAy, gAz;

// the backends: what the GL call would do with its arguments, kept out of line so the compiler cannot drop the call
__attribute__((noinline)) static void be4(State* s, int loc, float a, float b, float c, float d) { s->acc += a + b + c + d + loc; s->calls++; }
__attribute__((noinline)) static void beV(State* s, int loc, const float* v, size_t n) { s->acc += (n ? v[0] + v[n - 1] : 0) + loc; s->calls++; }
__attribute__((noinline)) static void be1(State* s, int x) { s->acc += x; s->calls++; }

static double num(JSContext* c, JSValueConst v) { double d = 0; JS_ToFloat64(c, &d, v); return d; }
static int i32(JSContext* c, JSValueConst v) { int32_t x = 0; JS_ToInt32(c, &x, v); return x; }
static State* self(JSContext* c, JSValueConst t) { State* s = JS_GetOpaque(t, gGlClass); if (!s) JS_ThrowTypeError(c, "illegal invocation"); return s; }
static bool locOf(JSContext* c, JSValueConst v, int* loc) { Loc* l = JS_GetOpaque(v, gLocClass); if (!l) { JS_ThrowTypeError(c, "not a location"); return false; } *loc = l->loc; return true; }

// the anti-pattern the rules forbid: JS_GetArrayBuffer first, which throws on a view; the exception is fetched and freed
static bool bytesThrow(JSContext* c, JSValueConst v, uint8_t** p, size_t* n) {
  size_t size = 0;
  uint8_t* b = JS_GetArrayBuffer(c, &size, v);
  if (b) { *p = b; *n = size; return true; }
  JS_FreeValue(c, JS_GetException(c));
  size_t off = 0, len = 0, bpe = 0;
  JSValue ab = JS_GetTypedArrayBuffer(c, v, &off, &len, &bpe);
  if (JS_IsException(ab)) { JS_FreeValue(c, JS_GetException(c)); return false; }
  uint8_t* base = JS_GetArrayBuffer(c, &size, ab);
  JS_FreeValue(c, ab);
  if (!base) return false;
  *p = base + off; *n = len;
  return true;
}
// the rule: the public non-throwing tests first
static bool bytesCheck(JSContext* c, JSValueConst v, uint8_t** p, size_t* n) {
  size_t size = 0;
  if (JS_IsArrayBuffer(v)) { *p = JS_GetArrayBuffer(c, &size, v); *n = size; return *p != NULL; }
  if (JS_GetTypedArrayType(v) < 0) return false;
  size_t off = 0, len = 0, bpe = 0;
  JSValue ab = JS_GetTypedArrayBuffer(c, v, &off, &len, &bpe);
  if (JS_IsException(ab)) { JS_FreeValue(c, JS_GetException(c)); return false; }
  uint8_t* base = JS_GetArrayBuffer(c, &size, ab);
  JS_FreeValue(c, ab);
  if (!base) return false;
  *p = base + off; *n = len;
  return true;
}

// ---- methods; the plain names go through a table and a magic number like webgl_js.cpp's callThunk, the names ending in D are registered directly
#define METH(name) static JSValue m_##name(JSContext* c, JSValueConst t, int argc, JSValueConst* argv)
METH(nop) { (void)argc; (void)argv; State* s = self(c, t); if (!s) return JS_EXCEPTION; s->calls++; return JS_UNDEFINED; }
METH(bind) { State* s = self(c, t); if (!s) return JS_EXCEPTION; if (argc < 1) return JS_ThrowTypeError(c, "args"); uint32_t u = 0; JS_ToUint32(c, &u, argv[0]); be1(s, (int)u); return JS_UNDEFINED; }
METH(uniform4f) {
  State* s = self(c, t); if (!s) return JS_EXCEPTION; if (argc < 5) return JS_ThrowTypeError(c, "args");
  int loc; if (!locOf(c, argv[0], &loc)) return JS_EXCEPTION;
  be4(s, loc, (float)num(c, argv[1]), (float)num(c, argv[2]), (float)num(c, argv[3]), (float)num(c, argv[4])); return JS_UNDEFINED;
}
METH(vec4) {   // 4 doubles, no location object
  State* s = self(c, t); if (!s) return JS_EXCEPTION; if (argc < 4) return JS_ThrowTypeError(c, "args");
  be4(s, 0, (float)num(c, argv[0]), (float)num(c, argv[1]), (float)num(c, argv[2]), (float)num(c, argv[3])); return JS_UNDEFINED;
}
METH(uniform4fvThrow) {   // throw as a type test, then a heap copy (what libzn_webgl did before ZN-567)
  State* s = self(c, t); if (!s) return JS_EXCEPTION; if (argc < 2) return JS_ThrowTypeError(c, "args");
  int loc; if (!locOf(c, argv[0], &loc)) return JS_EXCEPTION;
  uint8_t* p; size_t n;
  if (!bytesThrow(c, argv[1], &p, &n)) return JS_ThrowTypeError(c, "not a view");
  float* v = malloc(n ? n : 1); memcpy(v, p, n);
  beV(s, loc, v, n / 4); free(v); return JS_UNDEFINED;
}
METH(uniform4fv) {   // the rule: tests first, the bytes read in place
  State* s = self(c, t); if (!s) return JS_EXCEPTION; if (argc < 2) return JS_ThrowTypeError(c, "args");
  int loc; if (!locOf(c, argv[0], &loc)) return JS_EXCEPTION;
  uint8_t* p; size_t n;
  if (!bytesCheck(c, argv[1], &p, &n)) return JS_ThrowTypeError(c, "not a view");
  beV(s, loc, (const float*)p, n / 4); return JS_UNDEFINED;
}
METH(upload) {   // int + view, no location object
  State* s = self(c, t); if (!s) return JS_EXCEPTION; if (argc < 2) return JS_ThrowTypeError(c, "args");
  uint8_t* p; size_t n;
  if (!bytesCheck(c, argv[1], &p, &n)) return JS_ThrowTypeError(c, "not a view");
  beV(s, i32(c, argv[0]), (const float*)p, n / 4); return JS_UNDEFINED;
}
METH(str) {
  (void)argc; State* s = self(c, t); if (!s) return JS_EXCEPTION; size_t n = 0;
  const char* p = JS_ToCStringLen(c, &n, argv[0]); if (!p) return JS_EXCEPTION; s->acc += n + (unsigned char)p[0]; JS_FreeCString(c, p); return JS_UNDEFINED;
}
METH(retNum) { (void)t; (void)argc; (void)argv; return JS_NewFloat64(c, 1.5); }
METH(retObjStr) {   // a new object per call, keys by string
  (void)t; (void)argc; (void)argv;
  JSValue o = JS_NewObject(c); JS_SetPropertyStr(c, o, "x", JS_NewFloat64(c, 1.5)); JS_SetPropertyStr(c, o, "y", JS_NewFloat64(c, 2.5)); JS_SetPropertyStr(c, o, "z", JS_NewFloat64(c, 3.5)); return o;
}
METH(retObjFrom) {   // a new object per call, atoms made once
  (void)t; (void)argc; (void)argv;
  JSAtom atoms[3] = {gAx, gAy, gAz}; JSValue vals[3] = {JS_NewFloat64(c, 1.5), JS_NewFloat64(c, 2.5), JS_NewFloat64(c, 3.5)};
  return JS_NewObjectFrom(c, 3, atoms, vals);
}
METH(retShared) { (void)argc; (void)argv; State* s = self(c, t); if (!s) return JS_EXCEPTION; s->shared[0] = 1.5f; s->shared[1] = 2.5f; s->shared[2] = 3.5f; return JS_UNDEFINED; }
METH(throwDiscard) { (void)t; (void)argc; (void)argv; JS_ThrowTypeError(c, "not an ArrayBuffer"); JS_FreeValue(c, JS_GetException(c)); return JS_UNDEFINED; }
METH(flush) {   // a command buffer recorded in JS ([op, loc, a, b, c, d] doubles), run here at once
  State* s = self(c, t); if (!s) return JS_EXCEPTION; (void)argc;
  uint8_t* p; size_t n;
  if (!bytesCheck(c, argv[0], &p, &n)) return JS_ThrowTypeError(c, "buf");
  int count = i32(c, argv[1]); const double* d = (const double*)p;
  for (int i = 0; i < count; i += 6) if ((int)d[i] == 1) be4(s, (int)d[i + 1], (float)d[i + 2], (float)d[i + 3], (float)d[i + 4], (float)d[i + 5]);
  return JS_UNDEFINED;
}

typedef JSValue Meth(JSContext*, JSValueConst, int, JSValueConst*);
typedef struct Fn { const char* name; Meth* fn; int len; } Fn;
static const Fn kFns[] = {{"nop", m_nop, 0}, {"bind", m_bind, 1}, {"uniform4f", m_uniform4f, 5}, {"vec4", m_vec4, 4}, {"uniform4fvThrow", m_uniform4fvThrow, 2},
  {"uniform4fv", m_uniform4fv, 2}, {"upload", m_upload, 2}, {"str", m_str, 1}, {"retNum", m_retNum, 0}, {"retObjStr", m_retObjStr, 0},
  {"retObjFrom", m_retObjFrom, 0}, {"retShared", m_retShared, 0}, {"throwDiscard", m_throwDiscard, 0}, {"flush", m_flush, 2}};
static JSValue callThunk(JSContext* c, JSValueConst t, int argc, JSValueConst* argv, int magic) {   // a table, an owner check, then the method
  const Fn* f = &kFns[magic];
  State* g = JS_GetOpaque(t, gGlClass);
  if (!g || f->fn) return f->fn(c, t, argc, argv);
  return JS_UNDEFINED;
}

// the __host_* thunk of qjs.cpp: two heap allocations per call (before ZN-567) and stack arrays (the rule)
static JSValue m_hostHeap(JSContext* c, JSValueConst t, int argc, JSValueConst* argv, int magic) {
  (void)t; (void)magic;
  void* strings = malloc(12 * 24); void* arrays = malloc(12 * 24);
  double a[4]; for (int k = 0; k < 4; ++k) a[k] = num(c, k < argc ? argv[k] : JS_UNDEFINED);
  be4(&gState, 0, (float)a[0], (float)a[1], (float)a[2], (float)a[3]);
  free(strings); free(arrays); return JS_UNDEFINED;
}
static JSValue m_hostStack(JSContext* c, JSValueConst t, int argc, JSValueConst* argv, int magic) {
  (void)t; (void)magic;
  double a[4]; for (int k = 0; k < 4; ++k) a[k] = num(c, k < argc ? argv[k] : JS_UNDEFINED);
  be4(&gState, 0, (float)a[0], (float)a[1], (float)a[2], (float)a[3]); return JS_UNDEFINED;
}

// ---- globals
static JSValue js_print(JSContext* c, JSValueConst t, int argc, JSValueConst* argv) {
  (void)t;
  for (int i = 0; i < argc; i++) { const char* s = JS_ToCString(c, argv[i]); fputs(i ? " " : "", stdout); fputs(s ? s : "?", stdout); if (s) JS_FreeCString(c, s); }
  fputc('\n', stdout); fflush(stdout); return JS_UNDEFINED;
}
static JSValue js_now(JSContext* c, JSValueConst t, int argc, JSValueConst* argv) {
  (void)t; (void)argc; (void)argv;
  struct timespec ts; clock_gettime(CLOCK_MONOTONIC, &ts); return JS_NewFloat64(c, ts.tv_sec * 1e3 + ts.tv_nsec / 1e6);
}
static JSValue js_newGL(JSContext* c, JSValueConst t, int argc, JSValueConst* argv) { (void)t; (void)argc; (void)argv; JSValue o = JS_NewObjectClass(c, (int)gGlClass); JS_SetOpaque(o, &gState); return o; }
static JSValue js_newLoc(JSContext* c, JSValueConst t, int argc, JSValueConst* argv) {
  (void)t; (void)argc;
  Loc* l = malloc(sizeof *l); l->loc = i32(c, argv[0]);
  JSValue o = JS_NewObjectClass(c, (int)gLocClass); JS_SetOpaque(o, l); return o;
}
static JSValue js_sharedF32(JSContext* c, JSValueConst t, int argc, JSValueConst* argv) {   // a zero-copy view on native memory
  (void)t; (void)argc; (void)argv;
  JSValue ab = JS_NewArrayBuffer(c, (uint8_t*)gState.shared, sizeof gState.shared, 0, NULL, NULL, false);
  JSValue ta = JS_NewTypedArray(c, 1, &ab, JS_TYPED_ARRAY_FLOAT32); JS_FreeValue(c, ab); return ta;
}
static JSValue js_callN(JSContext* c, JSValueConst t, int argc, JSValueConst* argv) {   // native -> JS: call argv[0] argv[1] times with one number
  (void)t; (void)argc;
  int32_t n = i32(c, argv[1]); JSValue a = JS_NewFloat64(c, 1.5);
  for (int32_t k = 0; k < n; ++k) { JSValue r = JS_Call(c, argv[0], JS_UNDEFINED, 1, &a); if (JS_IsException(r)) return r; JS_FreeValue(c, r); }
  return JS_UNDEFINED;
}
static double hypot2(double a, double b) { return a * a + b * b; }
static JSValue m_hypotGeneric(JSContext* c, JSValueConst t, int argc, JSValueConst* argv) { (void)t; (void)argc; return JS_NewFloat64(c, hypot2(num(c, argv[0]), num(c, argv[1]))); }
static void locFinalizer(JSRuntime* rt, JSValue v) { (void)rt; free(JS_GetOpaque(v, gLocClass)); }

static char* readFile(const char* path, size_t* len) {
  FILE* f = fopen(path, "rb"); if (!f) return NULL;
  fseek(f, 0, SEEK_END); long n = ftell(f); fseek(f, 0, SEEK_SET);
  char* b = malloc((size_t)n + 1); *len = fread(b, 1, (size_t)n, f); b[*len] = 0; fclose(f); return b;
}
static void report(JSContext* c) {
  JSValue e = JS_GetException(c); const char* s = JS_ToCString(c, e); JSValue st = JS_GetPropertyStr(c, e, "stack"); const char* tr = JS_ToCString(c, st);
  fprintf(stderr, "Uncaught %s\n%s\n", s ? s : "?", tr ? tr : "");
}

int main(int argc, char** argv) {
  if (argc < 2) { fprintf(stderr, "usage: harness boundary.js\n"); return 2; }
  JSRuntime* rt = JS_NewRuntime();
  JSContext* c = JS_NewContext(rt);
  JS_NewClassID(rt, &gGlClass); JS_NewClassID(rt, &gLocClass);
  JSClassDef gd = {.class_name = "GL"}; JS_NewClass(rt, gGlClass, &gd);
  JSClassDef ld = {.class_name = "Loc", .finalizer = locFinalizer}; JS_NewClass(rt, gLocClass, &ld);
  gAx = JS_NewAtom(c, "x"); gAy = JS_NewAtom(c, "y"); gAz = JS_NewAtom(c, "z");
  JSValue proto = JS_NewObject(c);
  for (int k = 0; k < (int)(sizeof kFns / sizeof kFns[0]); ++k) {
    JS_SetPropertyStr(c, proto, kFns[k].name, JS_NewCFunctionMagic(c, callThunk, kFns[k].name, kFns[k].len, JS_CFUNC_generic_magic, k));
    char direct[64]; snprintf(direct, sizeof direct, "%sD", kFns[k].name);
    JS_SetPropertyStr(c, proto, direct, JS_NewCFunction(c, kFns[k].fn, direct, kFns[k].len));
  }
  for (int k = 0; k < 600; ++k) { char nm[32]; snprintf(nm, sizeof nm, "CONST_%d", k); JS_SetPropertyStr(c, proto, nm, JS_NewInt32(c, k)); }   // WebGL's ~600 constants on the prototype
  JS_SetClassProto(c, gGlClass, proto);
  JSValue g = JS_GetGlobalObject(c);
#define DEF(n, f, len) JS_SetPropertyStr(c, g, n, JS_NewCFunction(c, f, n, len))
  DEF("print", js_print, 1); DEF("now", js_now, 0); DEF("newGL", js_newGL, 0); DEF("newLoc", js_newLoc, 1); DEF("sharedF32", js_sharedF32, 0); DEF("callN", js_callN, 2);
  DEF("hypotG", m_hypotGeneric, 2);
  JS_SetPropertyStr(c, g, "hostHeap", JS_NewCFunctionMagic(c, m_hostHeap, "hostHeap", 4, JS_CFUNC_generic_magic, 0));
  JS_SetPropertyStr(c, g, "hostStack", JS_NewCFunctionMagic(c, m_hostStack, "hostStack", 4, JS_CFUNC_generic_magic, 0));
  JSCFunctionType ff = {.f_f_f = hypot2};
  JS_SetPropertyStr(c, g, "hypotFF", JS_NewCFunction2(c, ff.generic, "hypotFF", 2, JS_CFUNC_f_f_f, 0));
  JS_FreeValue(c, g);
  size_t len = 0; char* src = readFile(argv[1], &len);
  if (!src) { fprintf(stderr, "cannot read %s\n", argv[1]); return 2; }
  JSValue r = JS_Eval(c, src, len, argv[1], JS_EVAL_TYPE_GLOBAL);
  free(src);
  if (JS_IsException(r)) { report(c); return 1; }
  JS_FreeValue(c, r);
  fprintf(stderr, "acc %g calls %ld\n", gState.acc, gState.calls);
  return 0;
}
