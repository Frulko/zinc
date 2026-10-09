/* A native module written in C99 (ZN-096): every kind of export the ABI has. Built with -std=c99 -Wall -Wextra -Werror -pedantic. */
#define _DEFAULT_SOURCE   /* usleep under -std=c99 with glibc (macOS declares it anyway) */
#include <pthread.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include "zn/native.h"

static const ZnHostApi* H;
int fixture_finalized;   /* read by the test driver */
static uint64_t gCallback;

typedef struct { int value; } Box;
static void box_finalize(void* p) { free(p); ++fixture_finalized; }

static int32_t f_add(void* self, ZnCtx* cx, const ZnVal* a, ZnVal* r) { (void)self; (void)cx; r->i = (int32_t)(a[0].i + a[1].i); return ZN_OK; }
static int32_t f_scale(void* self, ZnCtx* cx, const ZnVal* a, ZnVal* r) { (void)self; (void)cx; r->d = a[0].d * a[1].d; return ZN_OK; }
static int32_t f_greet(void* self, ZnCtx* cx, const ZnVal* a, ZnVal* r) {
  char buf[128];
  (void)self;
  snprintf(buf, sizeof buf, "hello, %s", a[0].s.p);   /* the argument is NUL-terminated */
  r->s = H->ret_str(cx, buf, (uint32_t)strlen(buf));
  return ZN_OK;
}
static int32_t f_sum(void* self, ZnCtx* cx, const ZnVal* a, ZnVal* r) {
  const uint8_t* p = (const uint8_t*)a[0].v.p;
  int32_t t = 0;
  uint32_t i;
  (void)self; (void)cx;
  for (i = 0; i < a[0].v.n; ++i) t += p[i];
  r->i = t;
  return ZN_OK;
}
static int32_t f_reverse(void* self, ZnCtx* cx, const ZnVal* a, ZnVal* r) {
  const uint8_t* p = (const uint8_t*)a[0].v.p;
  uint8_t* out = (uint8_t*)H->ret_buf(cx, a[0].v.n);
  uint32_t i;
  (void)self;
  for (i = 0; i < a[0].v.n; ++i) out[i] = p[a[0].v.n - 1 - i];
  r->v.p = out;
  r->v.n = a[0].v.n;
  return ZN_OK;
}
static int32_t f_set_callback(void* self, ZnCtx* cx, const ZnVal* a, ZnVal* r) {
  (void)self; (void)cx; (void)r;
  if (gCallback) H->cb_release(gCallback);
  gCallback = H->cb_retain(a[0].h);
  return ZN_OK;
}
static int32_t f_call_sum(void* self, ZnCtx* cx, const ZnVal* a, ZnVal* r) {   /* a callback that returns a value, asked for twice during the call */
  ZnVal arg[2], res;
  double total = 0;
  (void)self; (void)cx;
  arg[0].i = 3; arg[1].d = 1.5;
  if (H->cb_call(a[0].h, arg, 2, &res) != 0) { H->set_error(cx, "the callback failed"); return ZN_ERROR; }
  total += res.d;
  arg[0].i = 4; arg[1].d = 2.5;
  if (H->cb_call(a[0].h, arg, 2, &res) != 0) { H->set_error(cx, "the callback failed"); return ZN_ERROR; }
  total += res.d;
  r->d = total;
  return ZN_OK;
}
static int32_t f_fire(void* self, ZnCtx* cx, const ZnVal* a, ZnVal* r) {
  ZnVal arg[2];
  (void)self; (void)cx; (void)r;
  if (!gCallback) { H->set_error(cx, "no callback set"); return ZN_ERROR; }
  arg[0].i = a[0].i * 2;
  arg[1].s.p = "fire";
  arg[1].s.n = 4;
  return H->cb_call(gCallback, arg, 2, NULL);
}

typedef struct { uint64_t promise; int value; int fail; } Later;
static void* later_thread(void* p) {
  Later* l = (Later*)p;
  ZnVal v;
  usleep(20000);
  if (l->fail) H->promise_reject(l->promise, "later failed");
  else { v.i = l->value + 100; H->promise_resolve(l->promise, "i", &v); }
  H->loop_unref();
  free(l);
  return NULL;
}
static int32_t start_later(ZnCtx* cx, int value, int fail) {
  pthread_t t;
  Later* l = (Later*)malloc(sizeof *l);
  l->promise = H->promise_take(cx);
  l->value = value;
  l->fail = fail;
  H->loop_ref();
  pthread_create(&t, NULL, later_thread, l);
  pthread_detach(t);
  return ZN_PENDING;
}
static int32_t f_later(void* self, ZnCtx* cx, const ZnVal* a, ZnVal* r) { (void)self; (void)r; return start_later(cx, (int)a[0].i, 0); }
static int32_t f_later_fail(void* self, ZnCtx* cx, const ZnVal* a, ZnVal* r) { (void)self; (void)r; (void)a; return start_later(cx, 0, 1); }

static void* post_thread(void* p) {
  ZnVal args[2];
  char text[32];
  (void)p;
  snprintf(text, sizeof text, "from thread");
  args[0].i = 7;
  args[1].s.p = text;
  args[1].s.n = (uint32_t)strlen(text);
  H->cb_post(gCallback, "is", args, 2);   /* the string is copied: text goes out of scope */
  H->loop_unref();
  return NULL;
}
static int32_t f_post_from_thread(void* self, ZnCtx* cx, const ZnVal* a, ZnVal* r) {
  pthread_t t;
  (void)self; (void)cx; (void)a; (void)r;
  H->loop_ref();
  pthread_create(&t, NULL, post_thread, NULL);
  pthread_detach(t);
  return ZN_OK;
}

static int32_t f_open(void* self, ZnCtx* cx, const ZnVal* a, ZnVal* r) {
  Box* b = (Box*)malloc(sizeof *b);
  (void)self; (void)cx;
  b->value = (int)a[0].i;
  r->h = H->res_new(0, b);
  return ZN_OK;
}
static int32_t f_get(void* self, ZnCtx* cx, const ZnVal* a, ZnVal* r) {
  Box* b = (Box*)H->res_get(a[0].h, 0);
  (void)self;
  if (!b) { H->set_error(cx, "stale or foreign resource"); return ZN_ERROR; }
  r->i = b->value;
  return ZN_OK;
}
static int32_t f_close(void* self, ZnCtx* cx, const ZnVal* a, ZnVal* r) { (void)self; (void)cx; (void)r; H->res_release(a[0].h); return ZN_OK; }
static int32_t f_finalized(void* self, ZnCtx* cx, const ZnVal* a, ZnVal* r) { (void)self; (void)cx; (void)a; r->i = fixture_finalized; return ZN_OK; }
static int32_t f_fail(void* self, ZnCtx* cx, const ZnVal* a, ZnVal* r) { (void)self; (void)a; (void)r; H->set_error(cx, "the fixture failed on purpose"); return ZN_ERROR; }

static const ZnExport kExports[] = {
  {"add", "ii>i", f_add, ZN_PURE_SCALAR}, {"scale", "dd>d", f_scale, ZN_PURE_SCALAR}, {"greet", "s>s", f_greet, 0}, {"sum", "B>i", f_sum, 0}, {"reverse", "B>B", f_reverse, 0},
  {"setCallback", "c(is>n)>n", f_set_callback, 0}, {"fire", "i>n", f_fire, 0}, {"callSum", "c(id>d)>d", f_call_sum, 0}, {"later", "i>Pi", f_later, 0}, {"laterFail", ">Pi", f_later_fail, 0},
  {"postFromThread", ">n", f_post_from_thread, 0}, {"open", "i>R0", f_open, 0}, {"get", "R0>i", f_get, 0}, {"close", "R0>n", f_close, 0}, {"finalized", ">i", f_finalized, 0},
  {"fail", ">n", f_fail, 0}};
static const ZnKind kKinds[] = {{0, "Box", box_finalize}};

static int32_t fixture_init(const ZnHostApi* host, void** self) { H = host; *self = NULL; return ZN_OK; }
static void fixture_shutdown(void* self) { (void)self; if (gCallback) { H->cb_release(gCallback); gCallback = 0; } }

const ZnModule* fixture_module(void) {
  static ZnModule m;
  m.abi = ZN_ABI_VERSION;
  m.size = (uint32_t)sizeof m;
  m.name = "Fixture";
  m.exports = kExports;
  m.nexports = (uint32_t)(sizeof kExports / sizeof kExports[0]);
  m.kinds = kKinds;
  m.nkinds = 1;
  m.flags = ZN_THREADS;
  m.init = fixture_init;
  m.poll = NULL;
  m.shutdown = fixture_shutdown;
  return &m;
}
