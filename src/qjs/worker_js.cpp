// zinc:worker on QuickJS (D181, ZN-587): a worker is its own QuickJS runtime and context on its own thread (qjs.cpp runWorker), started and
// fed by the threads, queues and loop events of src/rt/worker.cpp (zn::host::workerBridge), so the tools see the same workers. Messages are
// the typed engines' D173 record wire (include/zn/rec.h): the schemas of `new Worker<In, Out>` and of `self.onmessage`'s MessageEvent<T> are
// written into the program by the transform (strip.cpp workerTypesForJs); the receiver decodes by the sender's schema into its own type
// (fields matched by name, i32 and u32 truncated, defaults for the fields the sender lacks), as src/rt/worker.cpp does. A type the schema text
// cannot name (a generic one: Envelope<T> of workerPort) gives '' on both sides, and the message is QuickJS's own structured clone instead.
#include <cmath>
#include <cstring>
#include <deque>
#include <string>
#include <unordered_map>
#include <vector>

#include "qjs/qjs.h"
#include "zn/worker_bridge.h"
#include "zn/rec.h"

extern "C" {
#include "../../third_party/quickjs-ng/quickjs.h"
}

namespace zn::qjs {
namespace {

using zn::host::workerBridge;

thread_local std::vector<std::uint8_t> tCurrent;   // the message __host_workerNext took, read by __recRead
thread_local std::deque<std::string> tPending;     // the schemas __recTypes passed to the next `new Worker`

const rec::Schema* schemaOf(const std::string& text) {
  thread_local std::unordered_map<std::string, rec::Schema> cache;
  auto it = cache.find(text);
  if (it != cache.end()) return &it->second;
  rec::Schema s;
  if (!rec::parse(text, s)) return nullptr;
  return &cache.emplace(text, std::move(s)).first->second;
}

std::string str(JSContext* ctx, JSValueConst v) {
  size_t n = 0;
  const char* p = JS_ToCStringLen(ctx, &n, v);
  if (!p) { JS_FreeValue(ctx, JS_GetException(ctx)); return {}; }
  std::string r(p, n);
  JS_FreeCString(ctx, p);
  return r;
}
std::string named(const std::string& at) { return at.empty() ? "the message" : "'" + at + "'"; }
double toInt(double d) { return std::isfinite(d) && std::fabs(d) < 9.2e18 ? static_cast<double>(static_cast<std::int64_t>(d)) : 0; }   // a fraction dropped, as the typed wire

bool encode(JSContext* ctx, JSValueConst v, const rec::Schema& s, rec::Writer& w, std::string& err, const std::string& at) {
  if (s.k == '?') {
    if (JS_IsNull(v) || JS_IsUndefined(v)) { w.u8(0); return true; }
    w.u8(1);
    return encode(ctx, v, s.kids[0], w, err, at);
  }
  if (JS_IsNull(v) || JS_IsUndefined(v)) { err = named(at) + " is null"; return false; }
  auto wrong = [&](const char* what) { err = named(at) + " is not " + what; return false; };
  switch (s.k) {
    case 'd': case 'i': case 'u': {
      double d;
      if (!JS_IsNumber(v) || JS_ToFloat64(ctx, &d, v)) return wrong("a number");
      if (s.k == 'd') w.f64(d);
      else if (s.k == 'i') w.i32(static_cast<std::int32_t>(static_cast<std::int64_t>(toInt(d))));
      else w.u32(static_cast<std::uint32_t>(static_cast<std::int64_t>(toInt(d))));
      return true;
    }
    case 'b': if (!JS_IsBool(v)) return wrong("a boolean"); w.u8(JS_ToBool(ctx, v) ? 1 : 0); return true;
    case 's': {
      if (!JS_IsString(v)) return wrong("a string");
      size_t n = 0;
      const char* p = JS_ToCStringLen(ctx, &n, v);
      if (!p) return false;
      w.bytes(p, n);
      JS_FreeCString(ctx, p);
      return true;
    }
    case 'B': {
      if (JS_GetTypedArrayType(v) == JS_TYPED_ARRAY_UINT8) {
        size_t n = 0;
        const std::uint8_t* p = JS_GetUint8Array(ctx, &n, v);
        if (!p) return false;
        w.bytes(p, n);
        return true;
      }
      if (!JS_IsArray(v)) return wrong("a u8[]");
      int64_t n = 0;
      if (JS_GetLength(ctx, v, &n)) return false;
      w.u32(static_cast<std::uint32_t>(n));
      for (int64_t i = 0; i < n; ++i) {   // ponytail: one property read per byte; a Uint8Array takes the memcpy path above
        JSValue e = JS_GetPropertyInt64(ctx, v, i);
        int32_t b = 0;
        JS_ToInt32(ctx, &b, e);
        JS_FreeValue(ctx, e);
        w.u8(static_cast<std::uint8_t>(b));
      }
      return true;
    }
    case '*': {
      if (!JS_IsArray(v)) return wrong("an array");
      int64_t n = 0;
      if (JS_GetLength(ctx, v, &n)) return false;
      w.u32(static_cast<std::uint32_t>(n));
      for (int64_t i = 0; i < n; ++i) {
        JSValue e = JS_GetPropertyInt64(ctx, v, i);
        const bool ok = encode(ctx, e, s.kids[0], w, err, at + "[]");
        JS_FreeValue(ctx, e);
        if (!ok) return false;
      }
      return true;
    }
    default: {
      if (!JS_IsObject(v)) return wrong("a record");
      const std::size_t start = w.begin();
      for (std::size_t k = 0; k < s.kids.size(); ++k) {
        JSValue f = JS_GetPropertyStr(ctx, v, s.names[k].c_str());
        const bool ok = encode(ctx, f, s.kids[k], w, err, at.empty() ? s.names[k] : at + "." + s.names[k]);
        JS_FreeValue(ctx, f);
        if (!ok) return false;
      }
      w.end(start);
      return true;
    }
  }
}

bool skip(rec::Reader& r, const rec::Schema& s) {
  double d; std::uint32_t u; std::uint8_t b; const std::uint8_t* at;
  switch (s.k) {
    case 'd': return r.f64(d);
    case 'i': case 'u': return r.u32(u);
    case 'b': return r.u8(b);
    case 's': case 'B': return r.bytes(at, u);
    case '*': if (!r.u32(u)) return false; while (u--) if (!skip(r, s.kids[0])) return false; return true;
    case '?': return r.u8(b) && (!b || skip(r, s.kids[0]));
    default: { rec::Reader body; return r.record(body); }
  }
}

JSValue fallback(JSContext* ctx, const rec::Schema& t) {   // a field the sender does not have: 0, false, "", [], null, a record of defaults
  switch (t.k) {
    case 'd': case 'i': case 'u': return JS_NewInt32(ctx, 0);
    case 'b': return JS_FALSE;
    case 's': return JS_NewString(ctx, "");
    case 'B': case '*': return JS_NewArray(ctx);
    case '?': return JS_NULL;
    default: {
      JSValue o = JS_NewObject(ctx);
      for (std::size_t k = 0; k < t.kids.size(); ++k) JS_DefinePropertyValueStr(ctx, o, t.names[k].c_str(), fallback(ctx, t.kids[k]), JS_PROP_C_W_E);
      return o;
    }
  }
}

JSValue number(JSContext* ctx, double d, char t) {
  if (t == 'i') return JS_NewInt32(ctx, static_cast<std::int32_t>(static_cast<std::int64_t>(toInt(d))));
  if (t == 'u') return JS_NewUint32(ctx, static_cast<std::uint32_t>(static_cast<std::int64_t>(toInt(d))));
  return JS_NewFloat64(ctx, d);
}

const char* letter(char k) {
  switch (k) {
    case 'd': case 'i': case 'u': return "a number";
    case 'b': return "a boolean";
    case 's': return "a string";
    case 'B': return "a u8[]";
    case '*': return "an array";
    default: return "a record";
  }
}

// One value of wire schema `w` as the receiver's type `t0`; JS_EXCEPTION with `err` set (empty: the bytes are malformed).
JSValue decode(JSContext* ctx, rec::Reader& r, const rec::Schema& w0, const rec::Schema& t0, std::string& err, const std::string& at) {
  const rec::Schema* w = &w0;
  const rec::Schema* t = &t0;
  const bool nullable = t->k == '?';
  if (nullable) t = &t->kids[0];
  if (w->k == '?') {
    std::uint8_t b;
    if (!r.u8(b)) return JS_EXCEPTION;
    if (!b) return nullable ? JS_NULL : fallback(ctx, *t);
    w = &w->kids[0];
  }
  const auto numeric = [](char c) { return c == 'd' || c == 'i' || c == 'u'; };
  if (!(numeric(w->k) ? numeric(t->k) : w->k == t->k)) { err = named(at) + " is " + letter(w->k) + " in the message and " + letter(t->k) + " here"; return JS_EXCEPTION; }
  switch (w->k) {
    case 'd': { double d; return r.f64(d) ? number(ctx, d, t->k) : JS_EXCEPTION; }
    case 'i': { std::int32_t i; return r.i32(i) ? number(ctx, i, t->k) : JS_EXCEPTION; }
    case 'u': { std::uint32_t u; return r.u32(u) ? number(ctx, u, t->k) : JS_EXCEPTION; }
    case 'b': { std::uint8_t b; return r.u8(b) ? JS_NewBool(ctx, b != 0) : JS_EXCEPTION; }
    case 's': { const std::uint8_t* p; std::uint32_t n; return r.bytes(p, n) ? JS_NewStringLen(ctx, reinterpret_cast<const char*>(p), n) : JS_EXCEPTION; }
    case 'B': {   // a u8[] as the program writes one: an array of numbers
      const std::uint8_t* p; std::uint32_t n;
      if (!r.bytes(p, n)) return JS_EXCEPTION;
      JSValue a = JS_NewArray(ctx);
      for (std::uint32_t i = 0; i < n; ++i) JS_SetPropertyInt64(ctx, a, i, JS_NewInt32(ctx, p[i]));
      return a;
    }
    case '*': {
      std::uint32_t n;
      if (!r.u32(n) || n > static_cast<std::uint64_t>(r.end - r.p)) return JS_EXCEPTION;   // every item is at least one byte
      JSValue a = JS_NewArray(ctx);
      for (std::uint32_t i = 0; i < n; ++i) {
        JSValue e = decode(ctx, r, w->kids[0], t->kids[0], err, at + "[]");
        if (JS_IsException(e)) { JS_FreeValue(ctx, a); return e; }
        JS_SetPropertyInt64(ctx, a, i, e);
      }
      return a;
    }
    default: {
      rec::Reader body;
      if (!r.record(body)) return JS_EXCEPTION;
      std::vector<JSValue> vals(t->kids.size(), JS_UNINITIALIZED);
      auto drop = [&] { for (JSValue& v : vals) if (!JS_IsUninitialized(v)) JS_FreeValue(ctx, v); };
      for (std::size_t k = 0; k < w->kids.size() && body.more(); ++k) {   // a field past the end of the body keeps its default (an older sender)
        std::size_t j = 0;
        while (j < t->names.size() && t->names[j] != w->names[k]) ++j;
        if (j == t->names.size()) { if (!skip(body, w->kids[k])) { drop(); return JS_EXCEPTION; } continue; }
        JSValue v = decode(ctx, body, w->kids[k], t->kids[j], err, at.empty() ? t->names[j] : at + "." + t->names[j]);
        if (JS_IsException(v)) { drop(); return v; }
        vals[j] = v;
      }
      JSValue o = JS_NewObject(ctx);   // the receiver's fields in its own order
      for (std::size_t j = 0; j < vals.size(); ++j)
        JS_DefinePropertyValueStr(ctx, o, t->names[j].c_str(), JS_IsUninitialized(vals[j]) ? fallback(ctx, t->kids[j]) : vals[j], JS_PROP_C_W_E);
      return o;
    }
  }
}

// __recPost(handle, value, schema): the value's bytes onto the receiver's queue (handle 0: a worker to its parent)
JSValue recPost(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
  int64_t h = 0;
  JS_ToInt64(ctx, &h, argv[0]);
  const std::string text = argc > 2 ? str(ctx, argv[2]) : std::string();
  std::vector<std::uint8_t> bytes;
  if (text.empty()) {   // untyped: QuickJS's structured clone
    size_t n = 0;
    std::uint8_t* p = JS_WriteObject(ctx, &n, argv[1], 0);
    if (!p) return JS_EXCEPTION;
    bytes.assign(p, p + n);
    js_free(ctx, p);
  } else {
    const rec::Schema* s = schemaOf(text);
    if (!s) return JS_ThrowTypeError(ctx, "postMessage: a schema this engine cannot read");
    rec::Writer w;
    std::string err;
    if (!encode(ctx, argv[1], *s, w, err, "")) return JS_HasException(ctx) ? JS_EXCEPTION : JS_ThrowTypeError(ctx, "postMessage: %s", err.c_str());
    bytes = std::move(w.out);
  }
  if (const char* e = workerBridge.post(h, std::move(bytes))) return JS_ThrowTypeError(ctx, "%s", e);
  return JS_UNDEFINED;
}

// __recRead(schema, target?): the current message, sent by `schema`, as a value of `target` (the receiver's own type; '' or absent: the same)
JSValue recRead(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
  const std::string text = argc > 0 ? str(ctx, argv[0]) : std::string();
  std::string target = argc > 1 && JS_IsString(argv[1]) ? str(ctx, argv[1]) : std::string();
  std::vector<std::uint8_t> bytes;
  bytes.swap(tCurrent);   // its bytes are not kept past the read
  if (text.empty()) return JS_ReadObject(ctx, bytes.data(), bytes.size(), 0);
  const rec::Schema* w = schemaOf(text);
  const rec::Schema* t = target.empty() ? w : schemaOf(target);
  if (!w || !t) return JS_ThrowTypeError(ctx, "onmessage: a schema this engine cannot read");
  rec::Reader r{bytes.data(), bytes.data() + bytes.size()};
  std::string err;
  JSValue v = decode(ctx, r, *w, *t, err, "");
  if (JS_IsException(v) && !JS_HasException(ctx)) return JS_ThrowTypeError(ctx, "onmessage: %s", err.empty() ? "the message's bytes do not match its type" : err.c_str());
  return v;
}

// __recTypes(sIn, sOut, entry): the schemas of the next `new Worker<In, Out>(entry)`, which its constructor takes with __recSchemaOf
JSValue recTypes(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
  if (argc < 3) return JS_UNDEFINED;
  tPending.push_back(str(ctx, argv[0]));
  tPending.push_back(str(ctx, argv[1]));
  return JS_DupValue(ctx, argv[2]);
}
JSValue recSchemaOf(JSContext* ctx, JSValueConst, int, JSValueConst*) {
  if (tPending.empty()) return JS_NewString(ctx, "");   // no types written (a .js program): the messages are cloned
  std::string s = std::move(tPending.front());
  tPending.pop_front();
  return JS_NewStringLen(ctx, s.data(), s.size());
}
// __recAs(schema, handler): the type its MessageEvent<T> names, for self.onmessage
JSValue recAs(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
  if (argc < 2) return JS_UNDEFINED;
  if (JS_IsObject(argv[1])) JS_DefinePropertyValueStr(ctx, argv[1], "__recType", JS_DupValue(ctx, argv[0]), 0);
  return JS_DupValue(ctx, argv[1]);
}

// __host_workerStart(entry, sIn, sOut): the entry is a file:// URL (new URL('./work.ts', import.meta.url)) or a path
std::string gMainDir;   // the main program's directory: a relative entry is read from there
JSValue workerStart(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
  std::string entry = str(ctx, argv[0]);
  if (entry.rfind("file://", 0) == 0) entry = entry.substr(7);
  if (!entry.empty() && entry[0] != '/' && !(entry.size() > 1 && entry[1] == ':')) entry = gMainDir + "/" + entry;
  std::string err;
  const int h = workerBridge.start(entry, argc > 1 ? str(ctx, argv[1]) : "", argc > 2 ? str(ctx, argv[2]) : "", runWorker, err);
  return JS_NewInt32(ctx, h);
}
JSValue workerNext(JSContext* ctx, JSValueConst, int, JSValueConst* argv) {
  int64_t h = 0;
  JS_ToInt64(ctx, &h, argv[0]);
  return JS_NewBool(ctx, workerBridge.next(h, tCurrent));
}
JSValue workerError(JSContext* ctx, JSValueConst, int, JSValueConst* argv) {
  int64_t h = 0;
  JS_ToInt64(ctx, &h, argv[0]);
  const std::string e = workerBridge.error(h);
  return JS_NewStringLen(ctx, e.data(), e.size());
}
JSValue workerClose(JSContext* ctx, JSValueConst, int, JSValueConst* argv) {
  int64_t h = 0;
  JS_ToInt64(ctx, &h, argv[0]);
  workerBridge.close(h);
  return JS_UNDEFINED;
}
JSValue workerSchema(JSContext* ctx, JSValueConst, int, JSValueConst* argv) {
  int32_t which = 0;
  JS_ToInt32(ctx, &which, argv[0]);
  const std::string s = workerBridge.schema(which);
  return JS_NewStringLen(ctx, s.data(), s.size());
}
JSValue workerMark(JSContext* ctx, JSValueConst, int, JSValueConst* argv) {
  int64_t h = 0;
  int32_t phase = 0;
  JS_ToInt64(ctx, &h, argv[0]);
  JS_ToInt32(ctx, &phase, argv[1]);
  workerBridge.mark(h, phase);
  return JS_UNDEFINED;
}

}  // namespace

// What zinc:worker's module gets on QuickJS after its own code (qjs.cpp loadModule): the typed engines' checker turns `self.onmessage = f`
// into __workerOnMessage<T>(f) and `self.postMessage(v)` into __workerPost<T>(v); here a setter and a method do it, the handler's T from __recAs.
const char* kWorkerSelfJs = R"JS(
;Object.defineProperty(WorkerSelf.prototype, 'onmessage', { configurable: true, set(f) {
  const s = __host_workerSchema(0), t = f && f.__recType || '';
  __workerSelfPump = f ? () => {
    while (__host_workerNext(0)) { const v = __recRead(s, t); __host_workerMark(0, 1); f(new MessageEvent(v)); __host_workerMark(0, 2); }
  } : null;
} });
WorkerSelf.prototype.postMessage = function (message, transfer = []) { __workerPost(message, transfer); };
)JS";

void installWorker(JSContext* ctx, const std::string& mainDir) {
  if (!mainDir.empty()) gMainDir = mainDir;
  JSValue g = JS_GetGlobalObject(ctx);
  auto fn = [&](const char* name, JSCFunction* f, int n) { JS_SetPropertyStr(ctx, g, name, JS_NewCFunction(ctx, f, name, n)); };
  fn("__recPost", recPost, 3);
  fn("__recRead", recRead, 2);
  fn("__recTypes", recTypes, 3);
  fn("__recSchemaOf", recSchemaOf, 0);
  fn("__recAs", recAs, 2);
  fn("__host_workerStart", workerStart, 3);
  fn("__host_workerNext", workerNext, 1);
  fn("__host_workerError", workerError, 1);
  fn("__host_workerClose", workerClose, 1);
  fn("__host_workerSchema", workerSchema, 1);
  fn("__host_workerMark", workerMark, 2);
  JS_FreeValue(ctx, g);
}

}  // namespace zn::qjs
