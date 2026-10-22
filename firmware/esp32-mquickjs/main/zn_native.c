/* zinc:native under mquickjs (js/modules/native.js): the native modules of plugins, C on Zinc's native ABI (include/zn/native.h, a plugin's
   native/<x>.abi.c), called from JavaScript. One file for two places: the firmware, built by zinc with the modules a program uses (ZN_NATIVE,
   their list in the generated zn_native_modules.c), and zinc-mqjs, the computer's check of the program, which loads the same modules from the
   plugins' libraries built for the computer (ZN_NATIVE_DLOPEN, ZINC_MQJS_NATIVE="<library>=<Name>;..."). So the check runs the real C code.
   Arguments and results are converted by the export's signature letters: s i u b d f h, and the arrays B I D S (a JavaScript array or typed
   array in, an array out). Callbacks, promises and resources (c P R) are not carried: a module that has them is refused when it opens. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "mquickjs.h"
#include "zn/native.h"

#ifdef ZN_NATIVE_DLOPEN
#include <dlfcn.h>
#include <time.h>
#else
#include "esp_timer.h"
extern const ZnModule *(*const zn_native_modules[])(void); /* zn_native_modules.c, null-terminated */
#endif

#define MAX_MODULES 8
#define MAX_ARGS 8

typedef struct {
    const ZnModule *m;
    void *self;
} Module;

static Module modules[MAX_MODULES];
static int count, loaded;
static char error[160];
static int failed;
static void *arena[2 * MAX_ARGS + 2]; /* what a call allocates (copied arguments, its result), freed when it returns */
static int used;

static JSContext *calling; /* the context of the native call in progress, which zn_js_heap measures */

/* main/zn.h: the mquickjs heap, for zinc:device's memory(); here so that zinc-mqjs answers it too (a plugin's library finds it in the
   executable) */
void zn_js_heap(size_t *used, size_t *size)
{
    *used = *size = 0;
    if (calling) JS_GetHeapUsage(calling, used, size);
}

static void *take(size_t n)
{
    if (used == (int)(sizeof arena / sizeof arena[0])) return NULL;
    return arena[used++] = malloc(n ? n : 1);
}

static void drop(void)
{
    while (used) free(arena[--used]);
}

/* the engine's side of the ABI, the part a module without callbacks, promises or resources uses */
static void set_error(ZnCtx *cx, const char *message)
{
    (void)cx;
    snprintf(error, sizeof error, "%s", message);
    failed = 1;
}
static ZnStr ret_str(ZnCtx *cx, const char *p, uint32_t n)
{
    char *b = take(n + 1);
    ZnStr s = {b, b ? n : 0};
    (void)cx;
    if (b) {
        memcpy(b, p, n);
        b[n] = 0;
    }
    return s;
}
static void *ret_buf(ZnCtx *cx, uint32_t bytes) { (void)cx; return take(bytes); }
static uint64_t res_new(uint32_t kind, void *ptr) { (void)kind; (void)ptr; return 0; }
static void *res_get(uint64_t handle, uint32_t kind) { (void)handle; (void)kind; return NULL; }
static void res_keep(uint64_t handle) { (void)handle; }
static uint64_t cb_retain(uint64_t cb) { return cb; }
static void cb_release(uint64_t cb) { (void)cb; }
static int32_t cb_call(uint64_t cb, const ZnVal *args, uint32_t nargs, ZnVal *ret) { (void)cb; (void)args; (void)nargs; (void)ret; return ZN_ERROR; }
static int32_t cb_post(uint64_t cb, const char *sig, const ZnVal *args, uint32_t nargs) { (void)cb; (void)sig; (void)args; (void)nargs; return ZN_ERROR; }
static uint64_t promise_take(ZnCtx *cx) { (void)cx; return 0; }
static void promise_resolve(uint64_t promise, const char *type, const ZnVal *value) { (void)promise; (void)type; (void)value; }
static void promise_reject(uint64_t promise, const char *message) { (void)promise; (void)message; }
static void loop_ref(void) {}
static const char *cb_error(void) { return ""; }
static double now_ms(void)
{
#ifdef ZN_NATIVE_DLOPEN
    struct timespec t;
    clock_gettime(CLOCK_MONOTONIC, &t);
    return t.tv_sec * 1e3 + t.tv_nsec / 1e6;
#else
    return esp_timer_get_time() / 1e3;
#endif
}

static const ZnHostApi host = {
    .size = sizeof(ZnHostApi), .set_error = set_error, .ret_str = ret_str, .ret_buf = ret_buf, .res_new = res_new, .res_get = res_get,
    .res_retain = res_keep, .res_release = res_keep, .cb_retain = cb_retain, .cb_release = cb_release, .cb_call = cb_call, .cb_post = cb_post,
    .promise_take = promise_take, .promise_resolve = promise_resolve, .promise_reject = promise_reject, .loop_ref = loop_ref,
    .loop_unref = loop_ref, .now_ms = now_ms, .cb_error = cb_error,
};

/* the letters this bridge carries: in a parameter, and as the result (n: none) */
static int carried(const char *sig)
{
    const char *res = strchr(sig, '>');
    if (!res) return 0;
    for (const char *p = sig; p < res; p++)
        if (!strchr("siubdfhBIDS", *p)) return 0;
    return res[1] && !res[2] && strchr("siubdfhnBID", res[1]);
}

static void add(const ZnModule *m)
{
    if (!m || count == MAX_MODULES || (m->abi >> 16) != ZN_ABI_MAJOR) return;
    Module *x = &modules[count];
    x->m = m;
    x->self = NULL;
    if (m->init && m->init(&host, &x->self) != ZN_OK) return;
    count++;
}

static void load(void)
{
    if (loaded) return;
    loaded = 1;
#ifdef ZN_NATIVE_DLOPEN
    const char *list = getenv("ZINC_MQJS_NATIVE"); /* <library>=<Name>;<library>=<Name> */
    char item[1024];
    while (list && *list) {
        const char *end = strchr(list, ';');
        const size_t n = end ? (size_t)(end - list) : strlen(list);
        if (n < sizeof item) {
            memcpy(item, list, n);
            item[n] = 0;
            char *eq = strrchr(item, '=');
            void *lib = eq ? (*eq = 0, dlopen(item, RTLD_NOW | RTLD_LOCAL)) : NULL;
            char sym[96];
            if (lib) {
                snprintf(sym, sizeof sym, "zn_module_%s", eq + 1);
                const ZnModule *(*open)(void) = (const ZnModule *(*)(void))dlsym(lib, sym);
                if (open) add(open());
            }
        }
        list = end ? end + 1 : NULL;
    }
#else
    for (int i = 0; zn_native_modules[i]; i++) add(zn_native_modules[i]());
#endif
}

/* once per turn of the loop (main.c), as include/zn/native.h names it */
void zn_native_poll(uint64_t now)
{
    for (int i = 0; i < count; i++)
        if (modules[i].m->poll) modules[i].m->poll(modules[i].self, now);
}

/* __host_nativeOpen(name): "<index>\n<export> <sig>\n...", for requireNative() to make one function per export */
JSValue js_native_open(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv)
{
    JSCStringBuf b;
    const char *name = argc > 0 ? JS_ToCString(ctx, argv[0], &b) : NULL;
    (void)this_val;
    if (!name) return JS_EXCEPTION;
    load();
    for (int i = 0; i < count; i++) {
        const ZnModule *m = modules[i].m;
        if (strcmp(m->name, name)) continue;
        size_t size = 8;
        for (uint32_t k = 0; k < m->nexports; k++) {
            if (!carried(m->exports[k].sig))
                return JS_ThrowTypeError(ctx, "native module %s: %s(%s) uses a callback, a promise or a resource, which mquickjs does not carry yet", name,
                                         m->exports[k].name, m->exports[k].sig);
            size += strlen(m->exports[k].name) + strlen(m->exports[k].sig) + 2;
        }
        char *out = malloc(size);
        if (!out) return JS_ThrowOutOfMemory(ctx);
        int n = snprintf(out, size, "%d", i);
        for (uint32_t k = 0; k < m->nexports; k++) n += snprintf(out + n, size - n, "\n%s %s", m->exports[k].name, m->exports[k].sig);
        JSValue r = JS_NewStringLen(ctx, out, n);
        free(out);
        return r;
    }
    return JS_ThrowReferenceError(ctx, "native module %s is not in this firmware: zinc builds the modules of the plugins a program imports into it", name);
}

/* an array argument (a JavaScript array or typed array) as n packed elements of `width` bytes */
static int array_arg(JSContext *ctx, JSValue v, char letter, ZnVal *out)
{
    JSValue len = JS_GetPropertyStr(ctx, v, "length");
    int n;
    if (JS_IsException(len) || JS_ToInt32(ctx, &n, len) || n < 0) return -1;
    const size_t width = letter == 'B' ? 1 : letter == 'I' ? 4 : letter == 'D' ? 8 : sizeof(ZnStr);
    char *p = take(n * width);
    if (!p) return -1;
    for (int i = 0; i < n; i++) {
        JSValue e = JS_GetPropertyUint32(ctx, v, i);
        double d;
        if (letter == 'S') {
            JSCStringBuf b;
            size_t sl;
            const char *s = JS_ToCStringLen(ctx, &sl, e, &b);
            char *c = s ? take(sl + 1) : NULL;
            if (!c) return -1;
            memcpy(c, s, sl + 1);
            ((ZnStr *)p)[i] = (ZnStr){c, (uint32_t)sl};
            continue;
        }
        if (JS_ToNumber(ctx, &d, e)) return -1;
        if (letter == 'B') ((uint8_t *)p)[i] = (uint8_t)(int)d;
        else if (letter == 'I') ((int32_t *)p)[i] = (int32_t)d;
        else ((double *)p)[i] = d;
    }
    out->v.p = p;
    out->v.n = (uint32_t)n;
    return 0;
}

static JSValue result(JSContext *ctx, char letter, const ZnVal *r)
{
    switch (letter) {
    case 'n': return JS_UNDEFINED;
    case 'i': return JS_NewInt32(ctx, (int32_t)r->i);
    case 'u': return JS_NewUint32(ctx, (uint32_t)r->u);
    case 'b': return JS_NewBool(r->i != 0);
    case 'd': case 'f': return JS_NewFloat64(ctx, r->d);
    case 'h': return JS_NewFloat64(ctx, (double)r->h);
    case 's': return JS_NewStringLen(ctx, r->s.p ? r->s.p : "", r->s.n);
    }
    JSGCRef a_ref; /* B I D: an array, kept where the collector finds it while its numbers are made */
    JSValue *a = JS_PushGCRef(ctx, &a_ref);
    *a = JS_NewArray(ctx, (int)r->v.n);
    for (uint32_t i = 0; i < r->v.n && !JS_IsException(*a); i++) {
        const JSValue e = letter == 'B' ? JS_NewInt32(ctx, ((const uint8_t *)r->v.p)[i])
                          : letter == 'I' ? JS_NewInt32(ctx, ((const int32_t *)r->v.p)[i])
                                          : JS_NewFloat64(ctx, ((const double *)r->v.p)[i]);
        JS_SetPropertyUint32(ctx, *a, i, e);
    }
    return JS_PopGCRef(ctx, &a_ref);
}

/* __host_nativeCall(module, export, a0...a7): the export's arguments converted, the call, its result */
JSValue js_native_call(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv)
{
    int mi, xi;
    (void)this_val;
    if (argc < 2 || JS_ToInt32(ctx, &mi, argv[0]) || JS_ToInt32(ctx, &xi, argv[1]) || mi < 0 || mi >= count || xi < 0 ||
        (uint32_t)xi >= modules[mi].m->nexports)
        return JS_ThrowTypeError(ctx, "__host_nativeCall: no such native export");
    const ZnExport *x = &modules[mi].m->exports[xi];
    const char *res = strchr(x->sig, '>');
    const int nargs = (int)(res - x->sig);
    if (nargs > MAX_ARGS) return JS_ThrowRangeError(ctx, "native %s: %d arguments at most under mquickjs", x->name, MAX_ARGS);
    ZnVal args[MAX_ARGS], ret;
    memset(args, 0, sizeof args);
    memset(&ret, 0, sizeof ret);
    for (int i = 0; i < nargs; i++) {
        const JSValue v = 2 + i < argc ? argv[2 + i] : JS_UNDEFINED;
        const char l = x->sig[i];
        double d;
        int bad = 0;
        if (l == 's') {
            JSCStringBuf b;
            size_t sl;
            const char *s = JS_ToCStringLen(ctx, &sl, v, &b);
            char *c = s ? take(sl + 1) : NULL;
            if (c) {
                memcpy(c, s, sl + 1);
                args[i].s = (ZnStr){c, (uint32_t)sl};
            } else bad = 1;
        } else if (strchr("BIDS", l)) bad = array_arg(ctx, v, l, &args[i]);
        else if (l == 'b') args[i].i = JS_ToNumber(ctx, &d, v) ? (bad = 1, 0) : d != 0;
        else if (JS_ToNumber(ctx, &d, v)) bad = 1;
        else if (l == 'd' || l == 'f') args[i].d = d;
        else if (l == 'h') args[i].h = (uint64_t)d;
        else args[i].i = l == 'u' ? (int64_t)(uint32_t)(int64_t)d : (int64_t)(int32_t)(int64_t)d;
        if (bad) {
            drop();
            return JS_IsException(v) ? JS_EXCEPTION : JS_ThrowTypeError(ctx, "native %s: argument %d does not convert to '%c'", x->name, i + 1, l);
        }
    }
    failed = 0;
    calling = ctx;
    const int32_t st = x->fn(modules[mi].self, NULL, args, &ret);
    if (st != ZN_OK) {
        drop();
        return JS_ThrowInternalError(ctx, "%s", failed ? error : st == ZN_PENDING ? "a native promise is not carried under mquickjs" : "native call failed");
    }
    const JSValue r = result(ctx, res[1], &ret);
    drop();
    return r;
}
