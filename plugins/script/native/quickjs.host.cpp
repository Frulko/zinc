// zinc:script engine 'quickjs' for macos and linux (quickjs.rpi1.cpp / quickjs.rmpp.cpp include this file).
// docs/plugins/script.md. One Vm per Script handle: a JSRuntime (memory limit, stack limit, interrupt handler for
// the time limit) with one JSContext holding the standard built-ins only (no quickjs-libc: no files, no network).
// Every host -> script entry (eval, call, set/get, settling a promise) is an Entry: the outermost one arms the
// deadline and runs the pending promise jobs before returning. Values cross as Dyn (to_dyn / to_js); functions of
// the script become JsFnBox objects, handles into the Vm's reference table.
#include "zinc_native_quickjs.h"
#include "../vendor/quickjs/quickjs.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <time.h>

using zrt::Array;
using zrt::Dyn;
using zrt::String;

namespace {

double mono_ms() { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return (double)t.tv_sec * 1e3 + (double)t.tv_nsec / 1e6; }
String str(const char* s) { return String::from(s, (uint32_t)strlen(s)); }
String str(const char* s, size_t n) { return String::from(s, (uint32_t)n); }
/** zrt strings are not NUL-terminated: QuickJS's parser needs a terminated copy. */
char* cdup(const String& s) { char* p = (char*)malloc(s.bytes() + 1); memcpy(p, s.ptr(), s.bytes()); p[s.bytes()] = 0; return p; }

struct Mod { char* name; char* src; };
struct Call { int32_t id; JSValue resolve, reject; };

struct Vm {
  int32_t h = 0;
  uint32_t gen = 0;
  JSRuntime* rt = nullptr;
  JSContext* ctx = nullptr;
  double limitMs = 0, memLimit = 0;
  double deadline = 0;
  bool interrupted = false, stopped = false, closing = false;
  int depth = 0;
  Dyn result, err;
  Array<zrt::Fn<Dyn(Array<Dyn>)>> fns = Array<zrt::Fn<Dyn(Array<Dyn>)>>::with_cap(0);
  Array<zrt::Fn<void(int32_t, Array<Dyn>)>> asyncFns = Array<zrt::Fn<void(int32_t, Array<Dyn>)>>::with_cap(0);
  zrt::Fn<String(String)> resolver;
  JSValue* refs = nullptr; int nrefs = 0;       // function handles (JS_UNINITIALIZED = free slot)
  Call* calls = nullptr; int ncalls = 0;        // pending async host calls
  Mod* mods = nullptr; int nmods = 0;           // defined module sources
  JSValue* ns = nullptr; int nns = 0;           // namespaces of loaded modules, in load order
  int32_t nextId = 0;
  Array<int32_t> pending = Array<int32_t>::with_cap(0);  // followed promises not settled yet
  bool cut = false;                                      // an entry hit a limit: its jobs were dropped
};

// ponytail: fixed table of live contexts; grow it if an app ever needs more than 64 scripts at once
const int MAXVM = 64;
Vm* vms[MAXVM];
uint32_t gens = 0;
zrt::Fn<void(int32_t, int32_t, int32_t, Dyn)> on_event;
bool finish_hooked = false;

Vm* vm_of(int32_t h) { return h >= 0 && h < MAXVM && vms[h] && !vms[h]->closing ? vms[h] : nullptr; }

// ---------------------------------------------------------------- script functions as Dyn values
int ref_add(Vm* vm, JSValueConst f) {
  int i = 0;
  while (i < vm->nrefs && !JS_IsUninitialized(vm->refs[i])) i++;
  if (i == vm->nrefs) {
    vm->refs = (JSValue*)realloc(vm->refs, sizeof(JSValue) * (size_t)(vm->nrefs * 2 + 8));
    for (int k = vm->nrefs; k < vm->nrefs * 2 + 8; k++) vm->refs[k] = JS_UNINITIALIZED;
    vm->nrefs = vm->nrefs * 2 + 8;
  }
  vm->refs[i] = JS_DupValue(vm->ctx, f);
  return i;
}
void ref_drop(Vm* vm, int32_t r) {
  if (r < 0 || r >= vm->nrefs || JS_IsUninitialized(vm->refs[r])) return;
  JS_FreeValue(vm->ctx, vm->refs[r]);
  vm->refs[r] = JS_UNINITIALIZED;
}

/** A script function held by the host (a Dyn object); the reference dies with it, or with its Vm. */
struct JsFnBox : zrt::Object {
  static constexpr uint32_t ZRT_CID = 0x5C0F17;
  int32_t h; uint32_t gen; int32_t ref;
  JsFnBox(int32_t h_, uint32_t g, int32_t r) : h(h_), gen(g), ref(r) {}
  bool zrt_isa(uint32_t id) const override { return id == ZRT_CID; }
  void zrt_str(zrt::StrBuilder& sb) const override { sb.cstr("function"); }
  void zrt_json(zrt::StrBuilder& sb) const override { sb.cstr("null"); }
  void zrt_inspect(zrt::StrBuilder& sb, zrt::Insp&) const override { sb.cstr("[Function]"); }
  ~JsFnBox() override { Vm* vm = h >= 0 && h < MAXVM ? vms[h] : nullptr; if (vm && vm->gen == gen) ref_drop(vm, ref); }
};

// ---------------------------------------------------------------- values
const int MAX_DEPTH = 64;

/** JS -> Dyn: numbers, strings, booleans, null / undefined, dense arrays, own enumerable string keys of other
 *  objects, functions as JsFnBox. false with a pending exception on failure (a getter threw, nesting too deep). */
bool to_dyn(Vm* vm, JSValueConst v, int depth, Dyn& out) {
  JSContext* ctx = vm->ctx;
  switch (JS_VALUE_GET_NORM_TAG(v)) {
    case JS_TAG_INT: out = Dyn((double)JS_VALUE_GET_INT(v)); return true;
    case JS_TAG_FLOAT64: out = Dyn(JS_VALUE_GET_FLOAT64(v)); return true;
    case JS_TAG_BOOL: out = Dyn((bool)JS_VALUE_GET_BOOL(v)); return true;
    case JS_TAG_NULL: out = Dyn(nullptr); return true;
    case JS_TAG_UNDEFINED: case JS_TAG_SYMBOL: out = Dyn(); return true;
    case JS_TAG_STRING: case JS_TAG_STRING_ROPE: {
      size_t n; const char* s = JS_ToCStringLen(ctx, &n, v);
      if (!s) return false;
      out = Dyn(str(s, n));
      JS_FreeCString(ctx, s);
      return true;
    }
    case JS_TAG_BIG_INT: case JS_TAG_SHORT_BIG_INT: {
      int64_t i = 0;
      if (JS_ToBigInt64(ctx, &i, v)) return false;
      out = Dyn((double)i);
      return true;
    }
    case JS_TAG_OBJECT: break;
    default: out = Dyn(); return true;
  }
  if (depth > MAX_DEPTH) { JS_ThrowTypeError(ctx, "value nested too deeply"); return false; }
  if (JS_IsFunction(ctx, v)) { out = Dyn(zrt::make<JsFnBox>(vm->h, vm->gen, ref_add(vm, v))); return true; }
  if (JS_IsArray(v)) {
    int64_t n = 0;
    if (JS_GetLength(ctx, v, &n)) return false;
    Array<Dyn> a = Array<Dyn>::with_cap((int32_t)n);
    for (int64_t i = 0; i < n; i++) {
      JSValue x = JS_GetPropertyInt64(ctx, v, i);
      if (JS_IsException(x)) return false;
      Dyn d;
      bool ok = to_dyn(vm, x, depth + 1, d);
      JS_FreeValue(ctx, x);
      if (!ok) return false;
      a.push_raw(d);
    }
    out = Dyn(a);
    return true;
  }
  JSPropertyEnum* tab = nullptr; uint32_t n = 0;
  if (JS_GetOwnPropertyNames(ctx, &tab, &n, v, JS_GPN_STRING_MASK | JS_GPN_ENUM_ONLY)) return false;
  Dyn o = zrt::dyn_obj();
  bool ok = true;
  for (uint32_t i = 0; i < n && ok; i++) {
    JSValue x = JS_GetProperty(ctx, v, tab[i].atom);
    if (JS_IsException(x)) { ok = false; break; }
    Dyn d;
    ok = to_dyn(vm, x, depth + 1, d);
    JS_FreeValue(ctx, x);
    size_t kn; const char* k = JS_AtomToCStringLen(ctx, &kn, tab[i].atom);
    if (ok && k) o.obj()->zrt_set(str(k, kn), d);
    if (k) JS_FreeCString(ctx, k);
  }
  JS_FreePropertyEnum(ctx, tab, n);
  if (ok) out = o;
  return ok;
}

/** Dyn -> JS (a copy). Objects of Zinc classes go through their JSON form; JsFnBox gives the function back. */
JSValue to_js(Vm* vm, const Dyn& d, int depth) {
  JSContext* ctx = vm->ctx;
  switch (d.tag()) {
    case 0: return JS_NewNumber(ctx, d.num());
    case Dyn::UNDEF: return JS_UNDEFINED;
    case Dyn::NUL: return JS_NULL;
    case Dyn::BOOL: return JS_NewBool(ctx, d.v & 1);
    case Dyn::STR: { String s = d.str(); return JS_NewStringLen(ctx, s.ptr(), s.bytes()); }
  }
  if (depth > MAX_DEPTH) return JS_ThrowTypeError(ctx, "value nested too deeply");
  if (d.tag() == Dyn::ARR) {
    Array<Dyn> a = d.arr();
    JSValue r = JS_NewArray(ctx);
    for (int32_t i = 0; i < a.length(); i++) {
      JSValue x = to_js(vm, a.get(i), depth + 1);
      if (JS_IsException(x)) { JS_FreeValue(ctx, r); return x; }
      JS_SetPropertyUint32(ctx, r, (uint32_t)i, x);
    }
    return r;
  }
  zrt::Object* o = d.obj();
  if (o->zrt_isa(JsFnBox::ZRT_CID)) {
    JsFnBox* b = (JsFnBox*)o;
    bool live = b->h == vm->h && b->gen == vm->gen && b->ref < vm->nrefs && !JS_IsUninitialized(vm->refs[b->ref]);
    return live ? JS_DupValue(ctx, vm->refs[b->ref]) : JS_UNDEFINED;
  }
  if (o->zrt_isa(zrt::DynObj::ZRT_CID)) {
    zrt::DynObj* m = (zrt::DynObj*)o;
    JSValue r = JS_NewObject(ctx);
    for (int32_t i = 0; i < m->m.slots(); i++) {
      if (!m->m.live_at(i)) continue;
      JSValue x = to_js(vm, m->m.val_at(i), depth + 1);
      if (JS_IsException(x)) { JS_FreeValue(ctx, r); return x; }
      String k = m->m.key_at(i);
      JSAtom a = JS_NewAtomLen(ctx, k.ptr(), k.bytes());
      JS_DefinePropertyValue(ctx, r, a, x, JS_PROP_C_W_E);
      JS_FreeAtom(ctx, a);
    }
    return r;
  }
  zrt::StrBuilder sb;
  o->zrt_json(sb);
  sb.ch(0);
  return JS_ParseJSON(ctx, sb.buf, sb.len - 1, "<host>");
}

// ---------------------------------------------------------------- errors
Dyn field(Dyn& o, const char* k, const Dyn& v) { o.obj()->zrt_set(str(k), v); return o; }
Dyn error_info(const char* kind, const String& type, const String& message, const String& file, int line, const String& stack) {
  Dyn o = zrt::dyn_obj();
  field(o, "kind", Dyn(str(kind))); field(o, "type", Dyn(type)); field(o, "message", Dyn(message));
  field(o, "file", Dyn(file)); field(o, "line", Dyn((double)line)); field(o, "stack", Dyn(stack));
  return o;
}
String prop_str(JSContext* ctx, JSValueConst o, const char* k) {
  JSValue v = JS_GetPropertyStr(ctx, o, k);
  String r;
  if (!JS_IsUndefined(v) && !JS_IsException(v)) { size_t n; const char* s = JS_ToCStringLen(ctx, &n, v); if (s) { r = str(s, n); JS_FreeCString(ctx, s); } }
  if (JS_IsException(v)) JS_FreeValue(ctx, JS_GetException(ctx));
  JS_FreeValue(ctx, v);
  return r;
}
/** Script frames of a QuickJS stack, normalised like the sim's (quickjs.sim.ts): `at fn (file:line:col)` or
 *  `at file:line:col`; native frames dropped. Sets file / line from the first one. */
String frames(const String& stack, String& file, int& line) {
  zrt::StrBuilder out;
  const char* p = stack.ptr(); const char* e = p + stack.bytes();
  while (p < e) {
    const char* nl = p; while (nl < e && *nl != '\n') nl++;
    const char* s = p; while (s < nl && *s == ' ') s++;
    p = nl + 1;
    if (nl - s < 4 || memcmp(s, "at ", 3) != 0) continue;
    s += 3;
    const char* fn = s; const char* fnEnd = s; const char* loc = s; const char* locEnd = nl;
    if (nl[-1] == ')') {
      const char* open = nullptr;
      for (const char* q = s; q + 1 < nl; q++) if (q[0] == ' ' && q[1] == '(') open = q;
      if (!open) continue;
      fnEnd = open; loc = open + 2; locEnd = nl - 1;
    }
    // loc = file:line:col
    const char* c2 = locEnd; while (c2 > loc && c2[-1] != ':') c2--;
    const char* c1 = c2 - 1; while (c1 > loc && c1[-1] != ':') c1--;
    if (c2 <= loc + 1 || c1 <= loc + 1) continue;  // `native` and other non-locations
    int ln = atoi(c1);
    if (ln <= 0) continue;
    bool anon = (fnEnd - fn == 6 && !memcmp(fn, "<eval>", 6)) || (fnEnd - fn == 11 && !memcmp(fn, "<anonymous>", 11)) || fnEnd == fn;
    if (out.len) out.ch('\n');
    out.cstr("at ");
    if (!anon) { out.raw(fn, (uint32_t)(fnEnd - fn)); out.cstr(" ("); }
    out.raw(loc, (uint32_t)(locEnd - loc));
    if (!anon) out.ch(')');
    if (!line) { file = str(loc, (size_t)(c1 - 1 - loc)); line = ln; }
  }
  return out.build();
}
/** Takes the pending exception of the context (or `ex`) and describes it in vm->err. */
void take_error(Vm* vm, JSValue ex) {
  JSContext* ctx = vm->ctx;
  char buf[96];
  if (vm->stopped) {
    vm->stopped = false;
    vm->cut = true;
    if (vm->interrupted) vm->err = error_info("interrupted", String(), str("script interrupted"), String(), 0, String());
    else { snprintf(buf, sizeof buf, "script ran longer than %.0f ms", vm->limitMs); vm->err = error_info("timeout", String(), str(buf), String(), 0, String()); }
    JS_FreeValue(ctx, ex);
    return;
  }
  if (JS_IsError(ex)) {
    String type = prop_str(ctx, ex, "name"), message = prop_str(ctx, ex, "message"), file;
    int line = 0;
    String stack = frames(prop_str(ctx, ex, "stack"), file, line);
    const char* kind = type == str("SyntaxError") ? "syntax" : "error";
    if (type == str("InternalError") && (message == str("out of memory") || message == str("string too long"))) {
      snprintf(buf, sizeof buf, "out of memory (limit %.0f bytes)", vm->memLimit);
      vm->err = error_info("memory", str("RangeError"), str(buf), String(), 0, String());
    } else vm->err = error_info(kind, type, message, file, line, stack);
  } else if (JS_IsNull(ex) || JS_IsUninitialized(ex)) {  // out of memory while throwing
    snprintf(buf, sizeof buf, "out of memory (limit %.0f bytes)", vm->memLimit);
    vm->err = error_info("memory", str("RangeError"), str(buf), String(), 0, String());
  } else {
    zrt::StrBuilder sb; sb.cstr("Uncaught ");
    size_t n; const char* s = JS_ToCStringLen(ctx, &n, ex);
    if (s) { sb.raw(s, (uint32_t)n); JS_FreeCString(ctx, s); } else JS_FreeValue(ctx, JS_GetException(ctx));
    vm->err = error_info("error", String(), sb.build(), String(), 0, String());
  }
  JS_FreeValue(ctx, ex);
}
void host_error(Vm* vm, const char* type, const String& message) { vm->err = error_info("error", str(type), message, String(), 0, String()); }

// ---------------------------------------------------------------- entries
int interrupt_handler(JSRuntime*, void* opaque) {
  Vm* vm = (Vm*)opaque;
  if (vm->interrupted || (vm->deadline > 0 && mono_ms() > vm->deadline)) { vm->stopped = true; return 1; }
  return 0;
}
void free_vm(Vm* vm);
/** Runs the pending promise jobs; false (error in vm->err) when one hit a limit. */
bool pump(Vm* vm) {
  for (;;) {
    JSContext* c = nullptr;
    int r = JS_ExecutePendingJob(vm->rt, &c);
    if (r == 0) return true;
    if (r < 0) { take_error(vm, JS_GetException(c)); return false; }
  }
}
/** A limit stopped the jobs of an entry: the promises they were settling never will, so every pending async result
 *  rejects with that error. */
void reject_pending(Vm* vm) {
  vm->cut = false;
  Array<int32_t> ids = vm->pending;
  vm->pending = Array<int32_t>::with_cap(0);
  for (int32_t i = 0; i < ids.length(); i++) if (on_event) on_event(vm->h, 2, ids.get(i), vm->err);
}
/** A host -> script entry: the outermost arms the time limit and runs the jobs its work queued. */
struct Entry {
  Vm* vm;
  explicit Entry(Vm* v) : vm(v) {
    if (vm->depth++ == 0) {
      vm->deadline = vm->limitMs > 0 ? mono_ms() + vm->limitMs : 0;
      vm->interrupted = false; vm->stopped = false;
      JS_UpdateStackTop(vm->rt);
    }
  }
  /** Ends the entry's work: pumps jobs when outermost; false if that failed. */
  bool finish() { return vm->depth > 1 || pump(vm); }
  ~Entry() {
    if (vm->depth == 1 && vm->cut) reject_pending(vm);
    if (--vm->depth == 0 && vm->closing) free_vm(vm);
  }
};

/** Consumes v: success -> result, exception -> error. */
bool settle_value(Vm* vm, Entry& en, JSValue v) {
  if (JS_IsException(v)) { take_error(vm, JS_GetException(vm->ctx)); en.finish(); return false; }
  Dyn d;
  bool ok = to_dyn(vm, v, 0, d);
  JS_FreeValue(vm->ctx, v);
  if (!ok) { take_error(vm, JS_GetException(vm->ctx)); return false; }
  if (!en.finish()) return false;
  vm->result = d;
  return true;
}

JSValue settle_cb(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv, int magic, JSValueConst* data) {
  Vm* vm = (Vm*)JS_GetContextOpaque(ctx);
  int32_t id = JS_VALUE_GET_INT(data[0]);
  int32_t at = vm->pending.indexOf(id);
  if (at < 0) return JS_UNDEFINED;  // already rejected by a limit
  vm->pending.splice(at, 1);
  Dyn v;
  JSValueConst x = argc > 0 ? argv[0] : JS_UNDEFINED;
  if (magic == 1) { if (!to_dyn(vm, x, 0, v)) { take_error(vm, JS_GetException(ctx)); magic = 2; v = vm->err; } }
  else { take_error(vm, JS_DupValue(ctx, x)); v = vm->err; }
  if (on_event) on_event(vm->h, magic, id, v);
  return JS_UNDEFINED;
}
/** Consumes v after an entry: a promise is followed (0 settled now, id pending), else like settle_value. */
int32_t follow(Vm* vm, Entry& en, JSValue v) {
  if (JS_IsException(v) || !JS_IsPromise(v)) return settle_value(vm, en, v) ? 0 : -1;
  if (!en.finish()) { JS_FreeValue(vm->ctx, v); return -1; }
  JSContext* ctx = vm->ctx;
  JSPromiseStateEnum st = JS_PromiseState(ctx, v);
  if (st == JS_PROMISE_FULFILLED) { JSValue r = JS_PromiseResult(ctx, v); JS_FreeValue(ctx, v); return settle_value(vm, en, r) ? 0 : -1; }
  if (st == JS_PROMISE_REJECTED) { JS_PromiseMarkAsHandled(ctx, v); take_error(vm, JS_PromiseResult(ctx, v)); JS_FreeValue(ctx, v); return -1; }
  int32_t id = ++vm->nextId;
  vm->pending.push(id);
  JSValue data = JS_NewInt32(ctx, id);
  JSValue ok = JS_NewCFunctionData(ctx, settle_cb, 1, 1, 1, &data), fail = JS_NewCFunctionData(ctx, settle_cb, 1, 2, 1, &data);
  JS_FreeValue(ctx, JS_PromiseThen(ctx, v, ok, fail));
  JS_FreeValue(ctx, ok); JS_FreeValue(ctx, fail); JS_FreeValue(ctx, v);
  return id;
}

// ---------------------------------------------------------------- host functions
bool args_of(Vm* vm, int argc, JSValueConst* argv, Array<Dyn>& args) {
  args = Array<Dyn>::with_cap(argc);
  for (int i = 0; i < argc; i++) { Dyn d; if (!to_dyn(vm, argv[i], 0, d)) return false; args.push_raw(d); }
  return true;
}
/** A Zinc throw (zrt::g_err) becomes an Error of the same name in the script. */
JSValue rethrow_zinc(JSContext* ctx) {
  zrt::Ref<zrt::Error> e = zrt::g_err;
  zrt::g_err = nullptr;
  JSValue err = JS_NewError(ctx);
  JS_SetPropertyStr(ctx, err, "message", JS_NewStringLen(ctx, e->message.ptr(), e->message.bytes()));
  if (!(e->name == str("Error"))) JS_SetPropertyStr(ctx, err, "name", JS_NewStringLen(ctx, e->name.ptr(), e->name.bytes()));
  return JS_Throw(ctx, err);
}
JSValue host_call(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv, int magic, JSValueConst*) {
  Vm* vm = (Vm*)JS_GetContextOpaque(ctx);
  Array<Dyn> args;
  if (!args_of(vm, argc, argv, args)) return JS_EXCEPTION;
  zrt::Fn<Dyn(Array<Dyn>)> f = vm->fns.get(magic);
  Dyn r = f(args);
  if (zrt::g_err.p) return rethrow_zinc(ctx);
  return to_js(vm, r, 0);
}
JSValue host_async(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv, int magic, JSValueConst*) {
  Vm* vm = (Vm*)JS_GetContextOpaque(ctx);
  Array<Dyn> args;
  if (!args_of(vm, argc, argv, args)) return JS_EXCEPTION;
  JSValue fns[2];
  JSValue p = JS_NewPromiseCapability(ctx, fns);
  if (JS_IsException(p)) return p;
  int32_t id = ++vm->nextId;
  vm->calls = (Call*)realloc(vm->calls, sizeof(Call) * (size_t)(vm->ncalls + 1));
  vm->calls[vm->ncalls++] = Call{id, fns[0], fns[1]};
  zrt::Fn<void(int32_t, Array<Dyn>)> f = vm->asyncFns.get(magic);
  f(id, args);
  if (zrt::g_err.p) { JS_FreeValue(ctx, p); return rethrow_zinc(ctx); }
  return p;
}
void define_fn(Vm* vm, const String& name, JSCFunctionData* fn, int magic) {
  char* n = cdup(name);
  JSValue f = JS_NewCFunctionData2(vm->ctx, fn, n, 0, magic, 0, nullptr);
  JSValue g = JS_GetGlobalObject(vm->ctx);
  JS_SetPropertyStr(vm->ctx, g, n, f);
  JS_FreeValue(vm->ctx, g);
  free(n);
}

// ---------------------------------------------------------------- modules
JSModuleDef* module_loader(JSContext* ctx, const char* name, void*) {
  Vm* vm = (Vm*)JS_GetContextOpaque(ctx);
  const char* src = nullptr;
  for (int i = 0; i < vm->nmods && !src; i++) if (!strcmp(vm->mods[i].name, name)) src = vm->mods[i].src;
  char* fetched = nullptr;
  if (!src && vm->resolver) {
    String s = vm->resolver(str(name));
    if (s.bytes()) src = fetched = cdup(s);
  }
  if (!src) { JS_ThrowReferenceError(ctx, "could not load module '%s'", name); return nullptr; }
  JSValue f = JS_Eval(ctx, src, strlen(src), name, JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);
  free(fetched);
  if (JS_IsException(f)) return nullptr;
  JSModuleDef* m = (JSModuleDef*)JS_VALUE_GET_PTR(f);
  JS_FreeValue(ctx, f);
  return m;
}
/** A global, else an export of a loaded module (latest first); undefined if none. */
JSValue lookup(Vm* vm, const String& name) {
  char* n = cdup(name);
  JSValue g = JS_GetGlobalObject(vm->ctx);
  JSValue f = JS_GetPropertyStr(vm->ctx, g, n);
  JS_FreeValue(vm->ctx, g);
  for (int i = vm->nns - 1; i >= 0 && JS_IsUndefined(f); i--) f = JS_GetPropertyStr(vm->ctx, vm->ns[i], n);
  free(n);
  return f;
}

void free_vm(Vm* vm) {
  JSContext* ctx = vm->ctx;
  for (int i = 0; i < vm->nrefs; i++) if (!JS_IsUninitialized(vm->refs[i])) JS_FreeValue(ctx, vm->refs[i]);
  for (int i = 0; i < vm->ncalls; i++) { JS_FreeValue(ctx, vm->calls[i].resolve); JS_FreeValue(ctx, vm->calls[i].reject); }
  for (int i = 0; i < vm->nns; i++) JS_FreeValue(ctx, vm->ns[i]);
  for (int i = 0; i < vm->nmods; i++) { free(vm->mods[i].name); free(vm->mods[i].src); }
  free(vm->refs); free(vm->calls); free(vm->ns); free(vm->mods);
  JS_FreeContext(ctx);
  JS_FreeRuntime(vm->rt);
  vms[vm->h] = nullptr;
  vm->~Vm();
  free(vm);
}
void free_all() {
  for (int i = 0; i < MAXVM; i++) if (vms[i]) { vms[i]->depth = 0; free_vm(vms[i]); }
  on_event = nullptr;
}

}  // namespace

struct HostQuickJS : NativeQuickJS {
  int32_t create(double memoryLimit, double timeLimitMs, double stackSize) override {
    int h = 0;
    while (h < MAXVM && vms[h]) h++;
    if (h == MAXVM) return -1;
    JSRuntime* rt = JS_NewRuntime();
    if (!rt) return -1;
    if (memoryLimit > 0) JS_SetMemoryLimit(rt, (size_t)memoryLimit);
    if (stackSize > 0) JS_SetMaxStackSize(rt, (size_t)stackSize);
    JSContext* ctx = JS_NewContext(rt);
    if (!ctx) { JS_FreeRuntime(rt); return -1; }
    Vm* vm = new (calloc(1, sizeof(Vm))) Vm();
    vm->h = h; vm->gen = ++gens; vm->rt = rt; vm->ctx = ctx; vm->limitMs = timeLimitMs; vm->memLimit = memoryLimit;
    JS_SetContextOpaque(ctx, vm);
    JS_SetInterruptHandler(rt, interrupt_handler, vm);
    JS_SetModuleLoaderFunc(rt, nullptr, module_loader, vm);
    vms[h] = vm;
    if (!finish_hooked) { finish_hooked = true; zrt::at_finish(free_all); }
    return h;
  }
  void destroy(int32_t h) override {
    Vm* vm = vm_of(h);
    if (!vm) return;
    if (vm->depth > 0) vm->closing = true;  // freed when the running entry returns
    else free_vm(vm);
  }
  bool eval(int32_t h, String src, String file) override {
    Vm* vm = vm_of(h);
    if (!vm) return false;
    Entry en(vm);
    char* s = cdup(src); char* f = cdup(file);
    JSValue v = JS_Eval(vm->ctx, s, src.bytes(), f, JS_EVAL_TYPE_GLOBAL);
    free(s); free(f);
    return settle_value(vm, en, v);
  }
  int32_t evalAsync(int32_t h, String src, String file) override {
    Vm* vm = vm_of(h);
    if (!vm) return -1;
    Entry en(vm);
    char* s = cdup(src); char* f = cdup(file);
    JSValue v = JS_Eval(vm->ctx, s, src.bytes(), f, JS_EVAL_TYPE_GLOBAL);
    free(s); free(f);
    return follow(vm, en, v);
  }
  void define(int32_t h, String name, String src) override {
    Vm* vm = vm_of(h);
    if (!vm) return;
    vm->mods = (Mod*)realloc(vm->mods, sizeof(Mod) * (size_t)(vm->nmods + 1));
    vm->mods[vm->nmods++] = Mod{cdup(name), cdup(src)};
  }
  void resolver(int32_t h, zrt::Fn<String(String)> fn) override { if (Vm* vm = vm_of(h)) vm->resolver = fn; }
  bool load(int32_t h, String name, String src) override {
    Vm* vm = vm_of(h);
    if (!vm) return false;
    Entry en(vm);
    JSContext* ctx = vm->ctx;
    char* s = cdup(src); char* n = cdup(name);
    JSValue f = JS_Eval(ctx, s, src.bytes(), n, JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);
    free(s); free(n);
    if (JS_IsException(f)) return settle_value(vm, en, f);
    JSModuleDef* m = (JSModuleDef*)JS_VALUE_GET_PTR(f);
    int32_t r = follow(vm, en, JS_EvalFunction(ctx, f));  // module evaluation returns a promise
    if (r < 0) return false;
    vm->ns = (JSValue*)realloc(vm->ns, sizeof(JSValue) * (size_t)(vm->nns + 1));
    vm->ns[vm->nns++] = JS_GetModuleNamespace(ctx, m);
    vm->result = Dyn();
    return true;
  }
  /** Calls f (a function value, consumed) with args. */
  JSValue invoke(Vm* vm, JSValue f, const String& name, const Array<Dyn>& args) {
    JSContext* ctx = vm->ctx;
    if (!JS_IsFunction(ctx, f)) {
      JS_FreeValue(ctx, f);
      zrt::StrBuilder sb; to_s(sb, name); sb.cstr(" is not a function");
      return JS_ThrowTypeError(ctx, "%.*s", (int)sb.len, sb.buf);
    }
    int n = args.length();
    JSValue* av = (JSValue*)calloc((size_t)(n ? n : 1), sizeof(JSValue));
    JSValue r = JS_UNDEFINED;
    int i = 0;
    for (; i < n; i++) { av[i] = to_js(vm, args.get(i), 0); if (JS_IsException(av[i])) { r = JS_EXCEPTION; break; } }
    if (!JS_IsException(r)) r = JS_Call(ctx, f, JS_UNDEFINED, n, av);
    for (int k = 0; k < i; k++) JS_FreeValue(ctx, av[k]);
    free(av);
    JS_FreeValue(ctx, f);
    return r;
  }
  bool call(int32_t h, String fn, Array<Dyn> args) override {
    Vm* vm = vm_of(h);
    if (!vm) return false;
    Entry en(vm);
    return settle_value(vm, en, invoke(vm, lookup(vm, fn), fn, args));
  }
  int32_t callAsync(int32_t h, String fn, Array<Dyn> args) override {
    Vm* vm = vm_of(h);
    if (!vm) return -1;
    Entry en(vm);
    return follow(vm, en, invoke(vm, lookup(vm, fn), fn, args));
  }
  bool callRef(int32_t h, int32_t ref, Array<Dyn> args) override {
    Vm* vm = vm_of(h);
    if (!vm) return false;
    if (ref < 0 || ref >= vm->nrefs || JS_IsUninitialized(vm->refs[ref])) { host_error(vm, "TypeError", str("released function handle")); return false; }
    Entry en(vm);
    return settle_value(vm, en, invoke(vm, JS_DupValue(vm->ctx, vm->refs[ref]), str("function"), args));
  }
  int32_t refNamed(int32_t h, String name) override {
    Vm* vm = vm_of(h);
    if (!vm) return -1;
    Entry en(vm);
    JSValue f = lookup(vm, name);
    int32_t r = JS_IsFunction(vm->ctx, f) ? ref_add(vm, f) : -1;
    if (JS_IsException(f)) JS_FreeValue(vm->ctx, JS_GetException(vm->ctx));
    JS_FreeValue(vm->ctx, f);
    return r;
  }
  int32_t refValue(int32_t h, Dyn v) override {
    Vm* vm = vm_of(h);
    if (!vm || !zrt::isa<JsFnBox>(v)) return -1;
    JsFnBox* b = (JsFnBox*)v.obj();
    if (b->h != h || b->gen != vm->gen || b->ref >= vm->nrefs || JS_IsUninitialized(vm->refs[b->ref])) return -1;
    return ref_add(vm, vm->refs[b->ref]);
  }
  void unref(int32_t h, int32_t ref) override { if (Vm* vm = vm_of(h)) ref_drop(vm, ref); }
  bool set(int32_t h, String name, Dyn v) override {
    Vm* vm = vm_of(h);
    if (!vm) return false;
    Entry en(vm);
    JSValue x = to_js(vm, v, 0);
    if (JS_IsException(x)) return settle_value(vm, en, x);
    char* n = cdup(name);
    JSValue g = JS_GetGlobalObject(vm->ctx);
    int r = JS_SetPropertyStr(vm->ctx, g, n, x);
    JS_FreeValue(vm->ctx, g);
    free(n);
    return settle_value(vm, en, r < 0 ? JS_EXCEPTION : JS_UNDEFINED);
  }
  bool get(int32_t h, String name) override {
    Vm* vm = vm_of(h);
    if (!vm) return false;
    Entry en(vm);
    char* n = cdup(name);
    JSValue g = JS_GetGlobalObject(vm->ctx);
    JSValue v = JS_GetPropertyStr(vm->ctx, g, n);
    JS_FreeValue(vm->ctx, g);
    free(n);
    return settle_value(vm, en, v);
  }
  Dyn result(int32_t h) override { Vm* vm = vm_of(h); return vm ? vm->result : Dyn(); }
  Dyn error(int32_t h) override {
    Vm* vm = vm_of(h);
    return vm ? vm->err : error_info("host", str("Error"), str("zinc:script: the script was disposed"), String(), 0, String());
  }
  void expose(int32_t h, String name, zrt::Fn<Dyn(Array<Dyn>)> fn) override {
    Vm* vm = vm_of(h);
    if (!vm) return;
    vm->fns.push(fn);
    define_fn(vm, name, host_call, vm->fns.length() - 1);
  }
  void exposeAsync(int32_t h, String name, zrt::Fn<void(int32_t, Array<Dyn>)> start) override {
    Vm* vm = vm_of(h);
    if (!vm) return;
    vm->asyncFns.push(start);
    define_fn(vm, name, host_async, vm->asyncFns.length() - 1);
  }
  void settle(int32_t h, int32_t id, bool ok, Dyn value, String message) override {
    Vm* vm = vm_of(h);
    if (!vm) return;
    int i = 0;
    while (i < vm->ncalls && vm->calls[i].id != id) i++;
    if (i == vm->ncalls) return;
    Call c = vm->calls[i];
    vm->calls[i] = vm->calls[--vm->ncalls];
    JSContext* ctx = vm->ctx;
    Entry en(vm);
    JSValue arg;
    if (ok) arg = to_js(vm, value, 0);
    else {
      arg = JS_NewError(ctx);
      JS_SetPropertyStr(ctx, arg, "message", JS_NewStringLen(ctx, message.ptr(), message.bytes()));
      if (value.tag() == Dyn::STR && !(value.str() == str("Error"))) { String n = value.str(); JS_SetPropertyStr(ctx, arg, "name", JS_NewStringLen(ctx, n.ptr(), n.bytes())); }
    }
    if (JS_IsException(arg)) arg = JS_GetException(ctx), ok = false;
    JSValue r = JS_Call(ctx, ok ? c.resolve : c.reject, JS_UNDEFINED, 1, &arg);
    JS_FreeValue(ctx, arg); JS_FreeValue(ctx, r); JS_FreeValue(ctx, c.resolve); JS_FreeValue(ctx, c.reject);
    // ponytail: a job that hits a limit here has no caller to report to; it stays in vm->err
    en.finish();
  }
  void interrupt(int32_t h) override { if (Vm* vm = vm_of(h)) vm->interrupted = true; }
  double memoryUsed(int32_t h) override {
    Vm* vm = vm_of(h);
    if (!vm) return 0;
    JSMemoryUsage u;
    JS_ComputeMemoryUsage(vm->rt, &u);
    return (double)u.malloc_size;
  }
  void onEvent(zrt::Fn<void(int32_t, int32_t, int32_t, Dyn)> cb) override { on_event = cb; }
};

NativeQuickJS* zinc_create_QuickJS() { static HostQuickJS s; s.rc = zrt::IMMORTAL; return &s; }
