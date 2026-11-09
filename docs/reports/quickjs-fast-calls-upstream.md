# Typed fast C functions for quickjs-ng: the upstream pull request (ZN-596, prepared 2026-11-09)

`third_party/quickjs-ng/patches/0004-fast-calls.patch` applies cleanly to quickjs-ng `master` of 2026-11-09 (`patch --dry-run -p1`
on `quickjs.c` and `quickjs.h`). Opening the pull request is the owner's step; this page holds what it needs.

## Commands

```sh
gh repo fork quickjs-ng/quickjs --clone && cd quickjs && git checkout -b fast-calls
patch -p1 < "$ZINC_REPO/third_party/quickjs-ng/patches/0004-fast-calls.patch"   # the header lines before the first --- are ignored
# paste fast_calls() below into api-test.c, before main(), and call it from main() after new_typed_array();
cmake -B build && cmake --build build && ./build/api-test
git commit -am "Add typed fast C functions and borrowed buffer accessors"
git push -u origin fast-calls
gh pr create --repo quickjs-ng/quickjs --base master --title "Add typed fast C functions (JS_NewCFunctionFast) and borrowed buffer accessors" --body-file pr.md
```

## pr.md

> Embedders that bind many small native functions (WebGL, a 2D canvas, game engine calls) pay most of each call in the call
> machinery: `JS_CallInternal`, `js_call_c_function`, a stack frame and one `JS_ToFloat64`/`JS_ToInt32` call per argument. This adds
> an opt-in typed path in the spirit of V8's fast API calls.
>
> - `JS_NewCFunctionFast(ctx, def, name, length)` makes a function of a new kind `JS_CFUNC_fast`. Its `JSCFunctionFastDef` names a
>   typed C function, its argument types (`JS_FAST_F64`, `I32`, `U32`, `BOOL`, `BUFFER`: borrowed bytes of an ArrayBuffer, typed
>   array or DataView), its return type, an optional class for `this` (the function then gets its opaque) and the generic function.
> - `OP_call` and `OP_call_method` call the typed function directly when every argument has a matching tag. Anything else (a
>   string, an object, a detached or out-of-bounds buffer, too few arguments, a `this` of another class, `call`/`apply`, `JS_Call`
>   from C) goes to the generic function, which must give the same result. The typed function may not allocate JS values, throw or
>   call JavaScript; it returns false to hand the call to the generic one.
> - Two borrowed accessors that never throw: `JS_GetBufferData(obj, &data, &len, &elem_size)` (any ArrayBuffer, typed array or
>   DataView; -1 when detached or out of bounds) and `JS_GetFastArray(obj, &values, &len)` (the values of a dense Array). Today the
>   public way to read a typed array's bytes without an exception is `JS_GetTypedArrayType` + `JS_GetTypedArrayBuffer` +
>   `JS_GetArrayBuffer` + a free.
>
> Calls of other functions pay one tag and class check; on an M1 Pro the difference is within noise. Measured on a bare host
> (ns per call over an empty loop, a method on an object with a 600-property prototype): 4 doubles 49 -> 40, int + Float32Array
> 50 -> 40, a global function with 4 doubles 43 -> 34; in an embedder's host functions (Zinc) a no-argument call 53 -> 27 and a
> 6-double call 72 -> 43. Tests: `fast_calls()` in `api-test.c` checks both paths and every fallback.

## fast_calls() for api-test.c

```c
static int fast_n, slow_n;

static bool fast_add(void *opaque, const JSFastValue *a, JSFastValue *r, int magic)
{
    fast_n++;
    r->f64 = a[0].f64 + a[1].i32 + (double)a[2].u32 + (a[3].b ? 1000 : 0);
    return true;
}

static JSValue slow_add(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv, int magic)
{
    double a;
    int32_t b;
    uint32_t c;

    slow_n++;
    if (JS_ToFloat64(ctx, &a, argv[0]) || JS_ToInt32(ctx, &b, argv[1]) || JS_ToUint32(ctx, &c, argv[2]))
        return JS_EXCEPTION;
    return JS_NewFloat64(ctx, a + b + (double)c + (JS_ToBool(ctx, argv[3]) ? 1000 : 0));
}

static bool fast_sum(void *opaque, const JSFastValue *a, JSFastValue *r, int magic)
{
    int s = 0;

    if (a[0].buf.len > 64)
        return false; /* declines: the generic function runs */
    fast_n++;
    for (size_t i = 0; i < a[0].buf.len; i++)
        s += a[0].buf.data[i];
    r->i32 = s;
    return true;
}

static JSValue slow_sum(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv, int magic)
{
    uint8_t *p;
    size_t n;
    int s = 0;

    slow_n++;
    if (JS_GetBufferData(argv[0], &p, &n, NULL) < 0)
        return JS_NewInt32(ctx, -1);
    for (size_t i = 0; i < n; i++)
        s += p[i];
    return JS_NewInt32(ctx, s);
}

static const JSCFunctionFastDef add_def = {fast_add, slow_add, 0, 0, JS_FAST_F64, 4,
                                           {JS_FAST_F64, JS_FAST_I32, JS_FAST_U32, JS_FAST_BOOL}};
static const JSCFunctionFastDef sum_def = {fast_sum, slow_sum, 0, 0, JS_FAST_I32, 1, {JS_FAST_BUFFER}};

static void fast_call(JSContext *ctx, const char *code, double want, int fast, int slow)
{
    JSValue ret;
    double d;

    fast_n = slow_n = 0;
    ret = eval(ctx, code);
    assert(!JS_IsException(ret));
    assert(JS_ToFloat64(ctx, &d, ret) == 0);
    assert(d == want);
    assert(fast_n == fast && slow_n == slow);
    JS_FreeValue(ctx, ret);
}

static void fast_calls(void)
{
    JSRuntime *rt = new_runtime();
    JSContext *ctx = JS_NewContext(rt);
    JSValue global = JS_GetGlobalObject(ctx);
    JSValue arr, *values;
    uint32_t len;

    JS_SetPropertyStr(ctx, global, "add", JS_NewCFunctionFast(ctx, &add_def, "add", 4));
    JS_SetPropertyStr(ctx, global, "sum", JS_NewCFunctionFast(ctx, &sum_def, "sum", 1));
    JS_FreeValue(ctx, global);
    fast_call(ctx, "add(1.5, 2, 3, true)", 1006.5, 1, 0);
    fast_call(ctx, "add(1, 2.9, -1, false)", 1 + 2 + 4294967295.0, 1, 0);
    fast_call(ctx, "add('1.5', '2', '3', 1)", 1006.5, 0, 1);
    fast_call(ctx, "add({ valueOf() { return 4 } }, 0, 0, false)", 4, 0, 1);
    fast_call(ctx, "add(1, 2)", 3, 0, 1);
    fast_call(ctx, "add.call(null, 1, 2, 3, true)", 1006, 0, 1);
    fast_call(ctx, "sum(new Uint8Array([1, 2, 3, 4]))", 10, 1, 0);
    fast_call(ctx, "sum(new DataView(new Uint8Array([1, 2, 3, 4]).buffer, 2))", 7, 1, 0);
    fast_call(ctx, "sum(new Uint8Array(100).fill(1))", 100, 0, 1);
    fast_call(ctx, "const u = new Uint8Array([9]); u.buffer.transfer(); sum(u)", -1, 0, 1);
    fast_call(ctx, "sum('abcd')", -1, 0, 1);
    arr = eval(ctx, "[1, 2.5, 'x']");
    assert(JS_GetFastArray(arr, &values, &len) && len == 3);
    JS_FreeValue(ctx, arr);
    JS_FreeContext(ctx);
    JS_FreeRuntime(rt);
}
```
