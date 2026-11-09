// Typed fast native calls (ZN-596, third_party/quickjs-ng/patches/0004-fast-calls.patch): the fast path is taken for arguments of the
// declared types, and every other call (strings, objects, a detached or out-of-bounds buffer, a wrong `this`, too few arguments,
// call/apply, a refusal of the fast function) goes to the generic function with the same result. Run by tests/t0/qjs_fastcall.sh.
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "quickjs.h"

static int nfast, nslow;
static JSClassID cls;
typedef struct Obj { double acc; } Obj;

// add(f64, i32, u32, bool) -> f64: a + b + c + (d ? 1000 : 0)
static bool add_fast(void* op, const JSFastValue* a, JSFastValue* r, int magic) {
  (void)op; (void)magic; nfast++;
  r->f64 = a[0].f64 + a[1].i32 + (double)a[2].u32 + (a[3].b ? 1000 : 0);
  return true;
}
static JSValue add_slow(JSContext* c, JSValueConst t, int argc, JSValueConst* argv, int magic) {
  (void)t; (void)argc; (void)magic; nslow++;
  double a; int32_t b; uint32_t u;
  if (JS_ToFloat64(c, &a, argv[0]) || JS_ToInt32(c, &b, argv[1]) || JS_ToUint32(c, &u, argv[2])) return JS_EXCEPTION;
  int d = JS_ToBool(c, argv[3]);
  return JS_NewFloat64(c, a + b + (double)u + (d ? 1000 : 0));
}
// sum(buffer) -> i32: the sum of the bytes; refuses (falls back) on more than 64 bytes
static int sum_bytes(const uint8_t* p, size_t n) { int s = 0; for (size_t i = 0; i < n; i++) s += p[i]; return s; }
static bool sum_fast(void* op, const JSFastValue* a, JSFastValue* r, int magic) {
  (void)op; (void)magic;
  if (a[0].buf.len > 64) return false;
  nfast++; r->i32 = sum_bytes(a[0].buf.data, a[0].buf.len); return true;
}
static JSValue sum_slow(JSContext* c, JSValueConst t, int argc, JSValueConst* argv, int magic) {
  (void)t; (void)argc; (void)magic; nslow++;
  uint8_t* p; size_t n;
  if (JS_GetBufferData(argv[0], &p, &n, NULL) < 0) return JS_NewInt32(c, -1);   // what the generic function says for anything else
  return JS_NewInt32(c, sum_bytes(p, n));
}
// o.acc(f64) -> void on objects of class `cls` only
static bool acc_fast(void* op, const JSFastValue* a, JSFastValue* r, int magic) { (void)r; (void)magic; nfast++; ((Obj*)op)->acc += a[0].f64; return true; }
static JSValue acc_slow(JSContext* c, JSValueConst t, int argc, JSValueConst* argv, int magic) {
  (void)argc; (void)magic; nslow++;
  Obj* o = JS_GetOpaque(t, cls); if (!o) return JS_ThrowTypeError(c, "illegal invocation");
  double d; if (JS_ToFloat64(c, &d, argv[0])) return JS_EXCEPTION;
  o->acc += d; return JS_UNDEFINED;
}
static const JSCFunctionFastDef kAdd = {add_fast, add_slow, 0, 0, JS_FAST_F64, 4, {JS_FAST_F64, JS_FAST_I32, JS_FAST_U32, JS_FAST_BOOL}};
static const JSCFunctionFastDef kSum = {sum_fast, sum_slow, 0, 0, JS_FAST_I32, 1, {JS_FAST_BUFFER}};
static JSCFunctionFastDef kAcc = {acc_fast, acc_slow, 0, 0, JS_FAST_VOID, 1, {JS_FAST_F64}};
static Obj gObj;

static JSValue js_counts(JSContext* c, JSValueConst t, int argc, JSValueConst* argv) {
  (void)t; (void)argc; (void)argv;
  JSValue a = JS_NewArray(c); JS_SetPropertyUint32(c, a, 0, JS_NewInt32(c, nfast)); JS_SetPropertyUint32(c, a, 1, JS_NewInt32(c, nslow));
  nfast = nslow = 0; return a;
}
static JSValue js_obj(JSContext* c, JSValueConst t, int argc, JSValueConst* argv) {
  (void)t; (void)argc; (void)argv;
  JSValue o = JS_NewObjectClass(c, (int)cls); JS_SetOpaque(o, &gObj); return o;
}

static const char* kScript =
  "function eq(a, b, what) { if (a !== b) throw new Error(what + ': ' + a + ' !== ' + b); }\n"
  "function path(f, fast, slow, what) { f(); const [nf, ns] = counts(); eq(nf + '/' + ns, fast + '/' + slow, what + ' (fast/slow calls)'); }\n"
  "counts();\n"
  // fast: the declared types, ints and doubles for numbers, doubles that ToInt32/ToUint32 wrap
  "path(() => eq(add(1.5, 2, 3, true), 1006.5, 'numbers'), 1, 0, 'numbers');\n"
  "path(() => eq(add(1, 2.9, -1, false), 1 + 2 + 4294967295, 'ToInt32 and ToUint32'), 1, 0, 'conversions');\n"
  "path(() => eq(add(0, 4294967298.5, 0, false), 2, 'int32 wraps'), 1, 0, 'wrap');\n"
  "path(() => { for (let i = 0; i < 100; i++) add(i, i, i, false); }, 100, 0, 'a loop');\n"
  // slow: strings, objects with valueOf, null and undefined, a number for the boolean, NaN for an int, too few arguments
  "path(() => eq(add('1.5', '2', '3', 1), 1006.5, 'strings'), 0, 1, 'strings');\n"
  "path(() => eq(add({ valueOf() { return 4; } }, 0, 0, false), 4, 'valueOf'), 0, 1, 'an object');\n"
  "path(() => eq(add(1, null, undefined, false), 1, 'null and undefined'), 0, 1, 'null');\n"
  "path(() => eq(add(1, NaN, Infinity, false), 1, 'NaN and Infinity'), 0, 1, 'NaN');\n"
  "path(() => eq(add(1, 2), 3, 'too few arguments'), 0, 1, 'too few');\n"
  "path(() => { let t = false; try { add(Symbol('x'), 0, 0, false); } catch (e) { t = e instanceof TypeError; } eq(t, true, 'a symbol throws'); }, 0, 1, 'a symbol');\n"
  "path(() => eq(add.call(null, 1, 2, 3, true), 1006, 'call'), 0, 1, 'call');\n"
  "path(() => eq(add.apply(null, [1, 2, 3, false]), 6, 'apply'), 0, 1, 'apply');\n"
  // buffers: each kind fast; detached, out of bounds, too big (the fast function declines) and not a buffer slow
  "const u8 = new Uint8Array([1, 2, 3, 4]);\n"
  "path(() => eq(sum(u8), 10, 'Uint8Array'), 1, 0, 'a typed array');\n"
  "path(() => eq(sum(u8.subarray(1, 3)), 5, 'subarray'), 1, 0, 'a subarray');\n"
  "path(() => eq(sum(new Uint16Array([1, 1])), 2, 'Uint16Array bytes'), 1, 0, 'Uint16Array');\n"
  "path(() => eq(sum(u8.buffer), 10, 'ArrayBuffer'), 1, 0, 'an ArrayBuffer');\n"
  "path(() => eq(sum(new DataView(u8.buffer, 2)), 7, 'DataView'), 1, 0, 'a DataView');\n"
  "path(() => eq(sum(new Uint8Array(100).fill(1)), 100, 'declined'), 0, 1, 'the fast function declines');\n"
  "const gone = new Uint8Array([9, 9]); const view = new DataView(gone.buffer); gone.buffer.transfer();\n"
  "path(() => eq(sum(gone), -1, 'detached typed array'), 0, 1, 'a detached typed array');\n"
  "path(() => eq(sum(view), -1, 'detached DataView'), 0, 1, 'a detached DataView');\n"
  "const rab = new ArrayBuffer(8, { maxByteLength: 16 }); const tail = new Uint8Array(rab, 4, 4); rab.resize(2);\n"
  "path(() => eq(sum(tail), -1, 'out of bounds'), 0, 1, 'an out-of-bounds view');\n"
  "path(() => eq(sum('abcd'), -1, 'a string'), 0, 1, 'a string for a buffer');\n"
  "path(() => eq(sum([1, 2]), -1, 'an array'), 0, 1, 'an array for a buffer');\n"
  // this: the class's object fast, anything else slow (and the generic function throws)
  "const o = obj(); o.acc = acc;\n"
  "path(() => { o.acc(2); o.acc(3); }, 2, 0, 'a method');\n"
  "path(() => { let t = false; try { ({ acc }).acc(1); } catch (e) { t = e instanceof TypeError; } eq(t, true, 'a wrong this'); }, 0, 1, 'a wrong this');\n"
  "path(() => { let t = false; try { acc(1); } catch (e) { t = e instanceof TypeError; } eq(t, true, 'no this'); }, 0, 1, 'no this');\n"
  "path(() => o.acc('4'), 0, 1, 'a string argument to a method');\n"
  "function tailCall() { return add(1, 1, 1, false); }\n"
  "path(() => eq(tailCall(), 3, 'a tail call'), 1, 0, 'a tail call');\n"
  "eq(add.length, 4, 'length'); eq(add.name, 'add', 'name');\n"
  "let threw = false; try { new add(); } catch (e) { threw = true; } eq(threw, true, 'not a constructor');\n";

int main(void) {
  JSRuntime* rt = JS_NewRuntime();
  JSContext* c = JS_NewContext(rt);
  JS_NewClassID(rt, &cls);
  JSClassDef cd = {.class_name = "Obj"}; JS_NewClass(rt, cls, &cd);
  kAcc.this_class = cls;
  JSValue g = JS_GetGlobalObject(c);
  JS_SetPropertyStr(c, g, "add", JS_NewCFunctionFast(c, &kAdd, "add", 4));
  JS_SetPropertyStr(c, g, "sum", JS_NewCFunctionFast(c, &kSum, "sum", 1));
  JS_SetPropertyStr(c, g, "acc", JS_NewCFunctionFast(c, &kAcc, "acc", 1));
  JS_SetPropertyStr(c, g, "counts", JS_NewCFunction(c, js_counts, "counts", 0));
  JS_SetPropertyStr(c, g, "obj", JS_NewCFunction(c, js_obj, "obj", 0));
  // the borrowed accessors from C
  JSValue arr = JS_Eval(c, "[1, 2.5, 'x']", 13, "<arr>", JS_EVAL_TYPE_GLOBAL);
  JSValue* vals; uint32_t n;
  assert(JS_GetFastArray(arr, &vals, &n) && n == 3 && JS_VALUE_GET_INT(vals[0]) == 1);
  assert(!JS_GetFastArray(g, &vals, &n));
  JS_FreeValue(c, arr);
  uint8_t* p; size_t len, el;
  JSValue f32 = JS_Eval(c, "new Float32Array(3)", 19, "<f32>", JS_EVAL_TYPE_GLOBAL);
  assert(JS_GetBufferData(f32, &p, &len, &el) == 0 && len == 12 && el == 4);
  assert(JS_GetBufferData(JS_NewInt32(c, 1), &p, &len, &el) == -1);
  JS_FreeValue(c, f32);
  JS_FreeValue(c, g);
  JSValue r = JS_Eval(c, kScript, strlen(kScript), "<fastcall>", JS_EVAL_TYPE_GLOBAL);
  if (JS_IsException(r)) {
    JSValue e = JS_GetException(c); const char* s = JS_ToCString(c, e);
    JSValue st = JS_GetPropertyStr(c, e, "stack"); const char* t = JS_ToCString(c, st);
    fprintf(stderr, "FAIL %s\n%s\n", s ? s : "?", t ? t : ""); return 1;
  }
  JS_FreeValue(c, r);
  assert(gObj.acc == 9);
  JS_FreeContext(c);
  JS_FreeRuntime(rt);
  printf("ok: fast calls taken for their types, every other call generic\n");
  return 0;
}
