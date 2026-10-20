/* Native modules for Zinc Next (ZN-096): the C ABI between the engine and a module written in C or C++ (a plugin's native side: sqlite, canvas2d, sockets ...).
 *
 * One typed export table per module; every export has a signature string made of the letters of include/zn/runtime.h. The engine checks it against the program's
 * `requireNative<Spec>` at load, so a mismatch is a diagnostic and never a crash. The rules come from Node-API (an ABI version with a size field, finalizers, a thread-safe post
 * to the loop) and from WIT (borrowed arguments, module-owned results, resources with their own finalizer). No C++ exception and no engine type crosses this header: it
 * compiles as C99 and as C++20 and knows nothing of libuv or of the runtime's objects (docs/reports/zinc-next-native-abi.md).
 *
 * Signature letters (parameters, then `>`, then the result):
 *   s string (UTF-8, borrowed, NUL after the last byte)   i i32   u u32   b boolean   d f64   f f32   n none (result only)   h an integer handle the module owns
 *   B u8[]   I i32[]   D f64[]   S string[]    arrays are borrowed views (a copy of the program's array, valid for the call)
 *   R<k>  a resource of kind k (one decimal digit 0-9): the engine owns the reference count and calls the kind's finalizer when the last reference dies
 *   c(sig) a callback with that signature (a parameter only)   P<t> a promise of t (a result only)
 */
#ifndef ZN_NATIVE_H
#define ZN_NATIVE_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* The ABI version (ZN-353, v1 frozen): major and minor in one number, (major << 16) | minor. Within a major version every change is additive: an engine
 * function appended to ZnHostApi or a field appended to ZnModule (both carry their size), a new signature letter or flag; nothing is removed, reordered or
 * retyped (tools/abi-check compares this header with tests/data/native-abi-v1.txt). The engine refuses a module built for another major, or for a newer minor
 * than its own (it would call what this engine lacks), and loads one built for an older minor. 1.0: the first table; 1.1: ZnHostApi.cb_error. */
#define ZN_ABI_MAJOR 1u
#define ZN_ABI_MINOR 1u
#define ZN_ABI_VERSION ((ZN_ABI_MAJOR << 16) | ZN_ABI_MINOR)

typedef struct ZnStr { const char* p; uint32_t n; } ZnStr;     /* UTF-8; as an argument p[n] == 0 */
typedef struct ZnView { const void* p; uint32_t n; } ZnView;   /* n packed elements of the type the signature names (u8, i32 or f64; a string[] is ZnStr[]) */
typedef union ZnVal {                                          /* one argument or result: 16 bytes */
  int64_t i;     /* i, u, b (0 or 1), and the numbers of i32 and u32 sign- or zero-extended */
  uint64_t u;
  double d;      /* d, and f (widened) */
  ZnStr s;
  ZnView v;
  uint64_t h;    /* h, R<k> (a generational handle: res_get returns null for a stale one or one of another kind), c(...) (a callback handle), P<t> (a promise handle) */
} ZnVal;

typedef struct ZnCtx ZnCtx;   /* one call, owned by the engine */

#define ZN_OK 0
#define ZN_PENDING 1           /* the export returns a promise: it called promise_take and completes it later (from any thread) */
#define ZN_ERROR 2             /* any other value is an error too; the message is the one given to set_error */
/* Anything else is an error: the export called set_error (or the engine uses a generic message) and the engine throws a Zinc Error at the call site. */

typedef int32_t (*ZnFn)(void* self, ZnCtx* cx, const ZnVal* args, ZnVal* ret);

typedef struct ZnExport {
  const char* name;
  const char* sig;
  ZnFn fn;
  uint32_t flags;              /* ZN_PURE_SCALAR: only i u b d f in and out, no context needed (a fast path of the engine) */
} ZnExport;
#define ZN_PURE_SCALAR 1u

typedef struct ZnKind {        /* a kind of resource */
  uint32_t id;                 /* 0 to 9: the k of R<k> */
  const char* name;
  void (*finalize)(void* ptr);
} ZnKind;

struct ZnHostApi;
typedef struct ZnModule {
  uint32_t abi;                /* ZN_ABI_VERSION the module was built for */
  uint32_t size;               /* sizeof(ZnModule): lets the engine read an older, shorter struct */
  const char* name;            /* "Sqlite": what requireNative('Sqlite') names */
  const ZnExport* exports; uint32_t nexports;
  const ZnKind* kinds; uint32_t nkinds;
  uint32_t flags;              /* ZN_THREADS: the module posts from other threads */
  int32_t (*init)(const struct ZnHostApi* host, void** self);   /* ZN_OK, or non-zero to refuse loading */
  void (*poll)(void* self, uint64_t now_ms);                    /* once per loop turn; may be null */
  void (*shutdown)(void* self);                                 /* in reverse load order, after the program has ended; may be null */
} ZnModule;
#define ZN_THREADS 1u

/* What the engine offers a module: a size-prefixed table (it only grows). Thread: E = the engine's thread only, A = any thread. */
typedef struct ZnHostApi {
  uint32_t size;
  void (*set_error)(ZnCtx* cx, const char* message);                     /* E: the text of the error the call throws (copied) */
  ZnStr (*ret_str)(ZnCtx* cx, const char* p, uint32_t n);                /* E: copies into the call's arena; put the result in ret->s */
  void* (*ret_buf)(ZnCtx* cx, uint32_t bytes);                           /* E: scratch for an array result; fill it, then set ret->v */
  uint64_t (*res_new)(uint32_t kind, void* ptr);                         /* E: a resource with one reference; 0 when the kind is unknown */
  void* (*res_get)(uint64_t handle, uint32_t kind);                      /* E: the pointer, or null (stale handle, other kind) */
  void (*res_retain)(uint64_t handle);                                   /* E */
  void (*res_release)(uint64_t handle);                                  /* E: the last release runs the kind's finalizer */
  uint64_t (*cb_retain)(uint64_t cb);                                    /* E: keeps a callback argument beyond the call */
  void (*cb_release)(uint64_t cb);                                       /* E */
  int32_t (*cb_call)(uint64_t cb, const ZnVal* args, uint32_t nargs, ZnVal* ret);   /* E: runs the callback now; its status */
  int32_t (*cb_post)(uint64_t cb, const char* sig, const ZnVal* args, uint32_t nargs);   /* A: queues a call for the engine's thread; sig names the callback's parameters ("is", "B"): strings and arrays are copied (S is not supported) */
  uint64_t (*promise_take)(ZnCtx* cx);                                   /* E: the promise of this call (return ZN_PENDING); complete it exactly once */
  void (*promise_resolve)(uint64_t promise, const char* type, const ZnVal* value);   /* A: type is the result's letter ("i", "s", "B", "n" with no value): strings and arrays are copied */
  void (*promise_reject)(uint64_t promise, const char* message);         /* A: copied */
  void (*loop_ref)(void);                                                /* A: the program stays alive while a native operation is pending */
  void (*loop_unref)(void);                                              /* A */
  double (*now_ms)(void);                                                /* A: the engine's clock (virtual in a deterministic run) */
  const char* (*cb_error)(void);                                         /* E: the message of the last cb_call that failed (the callback threw); valid until the next call */
} ZnHostApi;

/* ---- the engine's side: the registry (src/rt/native.cpp) ---- */

/* Registers a module (the engine's generated main calls this, no static constructors). 0 on success, else a negative status and a message in err: ABI mismatch, a
 * malformed or duplicate export, an unknown kind, init refused. */
int32_t zn_register_module(const ZnModule* module, char* err, size_t errsize);
/* The export `name` of a registered module, or null. */
const ZnExport* zn_native_find(const char* module, const char* name);
int32_t zn_native_has_module(const char* module);   /* 1 when a module of that name is registered */
/* A call as the interpreter makes it: finds the export, checks that its signature equals `sig` (null: skip the check) and runs it. Returns the export's status
 * (ZN_OK, ZN_PENDING, an error: the message is in err) or a negative one when nothing was called (-1 unknown module or export, -2 signature mismatch). */
int32_t zn_native_call(const char* module, const char* name, const char* sig, const ZnVal* args, ZnVal* ret, char* err, size_t errsize);
/* The promise the last pending call took (valid right after ZN_PENDING). */
uint64_t zn_native_last_promise(void);
/* Ends every module (shutdown, in reverse load order) and finalizes the resources that are left. */
void zn_native_shutdown(void);

/* How the engine hears completions: set once; the functions run on the engine's thread, from zn_native_drain. */
typedef struct ZnSink {
  void* user;
  void (*resolve)(void* user, uint64_t promise, const ZnVal* value);   /* null for a promise of n; a string or array value is valid for the call only */
  void (*reject)(void* user, uint64_t promise, const char* message);
  int32_t (*call)(void* user, uint64_t cb, const ZnVal* args, uint32_t nargs, ZnVal* ret);   /* runs a callback */
  void (*release)(void* user, uint64_t cb);                                                 /* the last native reference to a callback ended */
  const char* (*error)(void* user);                                                         /* the message of the last failed call */
  void (*hold)(void* user, uint64_t cb);                                                    /* a native module took its first reference to a callback (cb_retain) */
} ZnSink;
void zn_native_set_sink(const ZnSink* sink);
/* The program ended: every callback a module still held is released (the modules stay registered; a module that keeps a handle across runs must ask for a new one). */
void zn_native_drop_callbacks(void);
/* Runs the queued posts and completions (the loop calls this each turn); returns how many ran. */
uint32_t zn_native_drain(void);
/* Operations pending (loop_ref minus loop_unref) and queued work: whether the program must stay alive. */
int32_t zn_native_pending(void);
/* Calls every module's poll once. */
void zn_native_poll(uint64_t now_ms);

#ifdef __cplusplus
}
#endif
#endif /* ZN_NATIVE_H */
