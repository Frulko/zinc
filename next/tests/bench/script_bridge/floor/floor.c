// The floor of a QuickJS <-> C boundary with direct value conversion (no JSON text), same cases as script_bridge.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <time.h>
#include "quickjs.h"
static double now_ms(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec * 1e3 + t.tv_nsec / 1e6; }
static double sink;
static int cmpd(const void* a, const void* b) { double x = *(double*)a, y = *(double*)b; return x < y ? -1 : x > y; }
static JSValue c_add(JSContext* c, JSValueConst t, int n, JSValueConst* a) { double x, y; JS_ToFloat64(c, &x, a[0]); JS_ToFloat64(c, &y, a[1]); return JS_NewFloat64(c, x + y); }
static JSValue c_add_i(JSContext* c, JSValueConst t, int n, JSValueConst* a) { int32_t x, y; JS_ToInt32(c, &x, a[0]); JS_ToInt32(c, &y, a[1]); return JS_NewInt32(c, x + y); }
static JSValue c_op(JSContext* c, JSValueConst t, int n, JSValueConst* a) { int32_t x, y, z; JS_ToInt32(c, &x, a[0]); JS_ToInt32(c, &y, a[1]); JS_ToInt32(c, &z, a[2]); sink += x + y + z; return JS_UNDEFINED; }
static JSValue c_flush_array(JSContext* c, JSValueConst t, int n, JSValueConst* a) { uint32_t len; JSValue l = JS_GetPropertyStr(c, a[0], "length"); JS_ToUint32(c, &len, l); JS_FreeValue(c, l); double s = 0; for (uint32_t i = 0; i < len; i++) { JSValue v = JS_GetPropertyUint32(c, a[0], i); int32_t x; JS_ToInt32(c, &x, v); JS_FreeValue(c, v); s += x; } sink += s; return JS_UNDEFINED; }
static JSValue c_flush_typed(JSContext* c, JSValueConst t, int n, JSValueConst* a) { size_t off, len, bpe; JSValue ab = JS_GetTypedArrayBuffer(c, a[0], &off, &len, &bpe); size_t sz; uint8_t* p = JS_GetArrayBuffer(c, &sz, ab); int32_t* q = (int32_t*)(p + off); double s = 0; for (size_t i = 0; i < len / 4; i++) s += q[i]; sink += s; JS_FreeValue(c, ab); return JS_UNDEFINED; }
static int32_t cells[10000];
static JSValue c_cell(JSContext* c, JSValueConst t, int n, JSValueConst* a) { int32_t i; JS_ToInt32(c, &i, a[0]); return JS_NewInt32(c, cells[i]); }
static JSValue c_snapshot(JSContext* c, JSValueConst t, int n, JSValueConst* a) { JSValue arr = JS_NewArray(c); for (int i = 0; i < 10000; i++) JS_SetPropertyUint32(c, arr, i, JS_NewInt32(c, cells[i])); return arr; }
static JSValue c_cellsbuf(JSContext* c, JSValueConst t, int n, JSValueConst* a) { return JS_NewArrayBuffer(c, (uint8_t*)cells, sizeof cells, 0, NULL, NULL, 0); }   // shared, zero copy
static void run(const char* id, double units, JSContext* c, const char* fn, double arg, int times) {
  double t[5]; JSValue g = JS_GetGlobalObject(c);
  for (int r = -1; r < 5; r++) { JSValue f = JS_GetPropertyStr(c, g, fn); JSValue av = JS_NewFloat64(c, arg); double a = now_ms(); JSValue res = JS_Call(c, f, JS_UNDEFINED, arg >= 0 ? 1 : 0, &av);
    double b = now_ms(); if (JS_IsException(res)) { JSValue e = JS_GetException(c); const char* s = JS_ToCString(c, e); fprintf(stderr, "exception in %s: %s\n", fn, s); exit(1); } JS_FreeValue(c, res); JS_FreeValue(c, f); if (r >= 0) t[r] = b - a; }
  JS_FreeValue(c, g); qsort(t, 5, sizeof(double), cmpd);
  printf("FLOOR %-34s median %9.3f ms  %8.4f us/unit  (min %.3f max %.3f)\n", id, t[2], t[2] * 1000 / units, t[0], t[4]);
}
int main(void) {
  for (int i = 0; i < 10000; i++) cells[i] = (i * 7) % 255;
  JSRuntime* rt = JS_NewRuntime(); JSContext* c = JS_NewContext(rt); JSValue g = JS_GetGlobalObject(c);
  JS_SetPropertyStr(c, g, "add", JS_NewCFunction(c, c_add, "add", 2));
  JS_SetPropertyStr(c, g, "addi", JS_NewCFunction(c, c_add_i, "addi", 2));
  JS_SetPropertyStr(c, g, "op", JS_NewCFunction(c, c_op, "op", 3));
  JS_SetPropertyStr(c, g, "flushArray", JS_NewCFunction(c, c_flush_array, "flushArray", 1));
  JS_SetPropertyStr(c, g, "flushTyped", JS_NewCFunction(c, c_flush_typed, "flushTyped", 1));
  JS_SetPropertyStr(c, g, "cell", JS_NewCFunction(c, c_cell, "cell", 1));
  JS_SetPropertyStr(c, g, "snapshot", JS_NewCFunction(c, c_snapshot, "snapshot", 0));
  JS_SetPropertyStr(c, g, "cellsBuf", JS_NewCFunction(c, c_cellsbuf, "cellsBuf", 0));
  const char* src =
    "function loopJs(n){let s=0;for(let i=0;i<n;i++)s=(s+i*3)%1000003;return s}"
    "function loopAdd(n){let s=0;for(let i=0;i<n;i++)s=add(s,i);return s}"
    "function loopAddI(n){let s=0;for(let i=0;i<n;i++)s=addi(s,i&1023);return s}"
    "function readPerAccess(n){let s=0;for(let i=0;i<n;i++)s+=cell(i);return s}"
    "function readSnapshot(){const c=snapshot();let s=0;for(let i=0;i<c.length;i++)s+=c[i];return s}"
    "function readShared(){const c=new Int32Array(cellsBuf());let s=0;for(let i=0;i<c.length;i++)s+=c[i];return s}"
    "function opsPerCall(n){for(let i=0;i<n;i++)op(1,i,i+1)}"
    "function opsArray(n){const b=new Array(n*3);for(let i=0;i<n;i++){b[i*3]=1;b[i*3+1]=i;b[i*3+2]=i+1}flushArray(b)}"
    "function opsTyped(n){const b=new Int32Array(n*3);for(let i=0;i<n;i++){b[i*3]=1;b[i*3+1]=i;b[i*3+2]=i+1}flushTyped(b)}";
  JSValue r = JS_Eval(c, src, strlen(src), "floor.js", JS_EVAL_TYPE_GLOBAL); if (JS_IsException(r)) { fprintf(stderr, "eval failed\n"); return 1; }
  run("ref_js_loop", 200000, c, "loopJs", 200000, 5);
  run("script_to_host_float", 200000, c, "loopAdd", 200000, 5);
  run("script_to_host_int32", 200000, c, "loopAddI", 200000, 5);
  run("map_per_access", 10000, c, "readPerAccess", 10000, 5);
  run("map_snapshot_direct_array", 10000, c, "readSnapshot", -1, 5);
  run("map_shared_buffer_zero_copy", 10000, c, "readShared", -1, 5);
  run("ops_per_call", 5000, c, "opsPerCall", 5000, 5);
  run("ops_array_direct", 5000, c, "opsArray", 5000, 5);
  run("ops_typed_array_zero_copy", 5000, c, "opsTyped", 5000, 5);
  printf("sink %.0f\n", sink); return 0;
}
