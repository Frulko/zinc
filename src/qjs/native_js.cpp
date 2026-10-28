// Native modules on the JavaScript engines (ZN-583.02; Node-API since ZN-773, so the same code binds them on every engine): `requireNative('Sqlite')` of a plugin's spec file gives an object whose functions call the
// module's exports through the registry of include/zn/native.h, the arguments and the result converted by the export's signature letters, as
// src/rt/rtcalls.cpp does for the typed engines. So a plugin's index.ts runs unchanged here, on the same native code.
// A function passed for a callback (c(...)) gets a handle that the registry's sink calls on the engine's thread (cb_call at once, cb_post from the
// loop's zn_native_drain, src/qjs/qjs.cpp); a promise result (P<t>) is a JS promise that the sink settles when the module completes it.
#include "qjs/qjs.h"

#include <cstring>
#include <deque>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#include <napi/js_native_api.h>
#ifdef ZN_NAPI_INLINE
#include <napi/inline.h>   // the hot Node-API calls inlined when built for QuickJS (ZN-773)
#endif

#include "frontend/modules.h"
#include "zn/native.h"
#include "zn/native_sig.h"
#include "zn/rec.h"

namespace zn::qjs {

// 'zinc:native' for this engine. NativeModule is a type in the spec files; a module cannot import a name that is not exported.
const char* kNativeModule =
    "export const NativeModule = undefined;\n"
    "export function requireNative(name, rec) {\n"   // rec: the record schemas of the spec's members (recordSchemasForJs, ZN-850)
    "  return new Proxy({}, { get(t, k) {\n"
    "    if (typeof k !== 'string') return undefined;\n"
    "    if (k in t) return t[k];\n"
    "    let f = __nativeFn(name, k);\n"
    "    const s = rec && rec[k];\n"
    "    if (f && s) {\n"
    "      const g = f, n = s.length - 1, r = s[n];\n"
    "      f = (...a) => {\n"
    "        for (let i = 0; i < n; i++) if (s[i]) a[i] = __recEncode(a[i], s[i]);\n"
    "        const v = g(...a);\n"
    "        return !r ? v : v instanceof Promise ? v.then((x) => __recDecode(x, r)) : __recDecode(v, r);\n"
    "      };\n"
    "    }\n"
    "    return (t[k] = f);\n"
    "  } });\n"
    "}\n";

namespace {

struct Bound { std::string module, name; nsig::Sig sig; };
std::vector<std::unique_ptr<Bound>>& bound() { static std::vector<std::unique_ptr<Bound>> v; return v; }

std::size_t width(char l) { return l == 'D' ? 8 : l == 'B' ? 1 : 4; }
napi_typedarray_type typedKind(char l) { return l == 'D' ? napi_float64_array : l == 'B' ? napi_uint8_array : l == 'U' ? napi_uint32_array : napi_int32_array; }

// A number as JavaScript's ToNumber gives it (the typed engines' conversion of a wrong type); false with an exception pending.
bool number(napi_env env, napi_value v, double& d) {
  if (napi_get_value_double(env, v, &d) == napi_ok) return true;
  napi_value n;
  return napi_coerce_to_number(env, v, &n) == napi_ok && napi_get_value_double(env, n, &d) == napi_ok;
}
bool int32(napi_env env, napi_value v, std::int32_t& i) {
  if (napi_get_value_int32(env, v, &i) == napi_ok) return true;
  napi_value n;
  return napi_coerce_to_number(env, v, &n) == napi_ok && napi_get_value_int32(env, n, &i) == napi_ok;
}
bool uint32(napi_env env, napi_value v, std::uint32_t& u) {
  if (napi_get_value_uint32(env, v, &u) == napi_ok) return true;
  napi_value n;
  return napi_coerce_to_number(env, v, &n) == napi_ok && napi_get_value_uint32(env, n, &u) == napi_ok;
}
bool text(napi_env env, napi_value v, std::string& out) {
  napi_value str = v;
  napi_valuetype t;
  if (napi_typeof(env, v, &t) != napi_ok || (t != napi_string && napi_coerce_to_string(env, v, &str) != napi_ok)) return false;
  std::size_t n = 0;
  if (napi_get_value_string_utf8(env, str, nullptr, 0, &n) != napi_ok) return false;
  out.resize(n);
  return napi_get_value_string_utf8(env, str, out.data(), n + 1, &n) == napi_ok;
}
napi_value throwAs(napi_env env, const char* ctor, const std::string& message) {
  napi_value g, c, msg, err;
  napi_get_global(env, &g);
  napi_get_named_property(env, g, ctor, &c);
  napi_create_string_utf8(env, message.data(), message.size(), &msg);
  if (napi_new_instance(env, c, 1, &msg, &err) == napi_ok) napi_throw(env, err);
  return nullptr;
}

// The elements of a JS array or typed array, packed as the letter says (f64, i32, u32 or bytes).
bool pack(napi_env env, napi_value v, char l, std::vector<std::uint8_t>& out) {
  bool isTyped = false;
  napi_is_typedarray(env, v, &isTyped);
  if (isTyped) {
    napi_typedarray_type type;
    std::size_t length = 0, offset = 0;
    void* data = nullptr;
    napi_get_typedarray_info(env, v, &type, &length, &data, nullptr, &offset);
    if (type == typedKind(l)) {   // the same element type: its bytes as they are
      const auto* p = static_cast<const std::uint8_t*>(data);
      if (p) out.assign(p, p + length * width(l));
      return true;
    }
  }
  napi_value lv;
  double n = 0;
  if (napi_get_named_property(env, v, "length", &lv) != napi_ok || !number(env, lv, n)) return false;
  if (!(n > 0)) n = 0;
  const auto count = static_cast<std::size_t>(n);
  out.resize(count * width(l));
  for (std::size_t i = 0; i < count; ++i) {
    napi_value e;
    double d = 0;
    if (napi_get_element(env, v, static_cast<std::uint32_t>(i), &e) != napi_ok || !number(env, e, d)) return false;
    std::uint8_t* at = out.data() + i * width(l);
    if (l == 'D') std::memcpy(at, &d, 8);
    else if (l == 'B') *at = static_cast<std::uint8_t>(static_cast<std::int64_t>(d));
    else { auto x = static_cast<std::int32_t>(static_cast<std::int64_t>(d)); std::memcpy(at, &x, 4); }
  }
  return true;
}

// An array result, or an array the module changed: a typed array of its element type (one copy).
napi_value typed(napi_env env, char l, const ZnView& v) {
  const std::size_t bytes = static_cast<std::size_t>(v.n) * width(l);
  void* data = nullptr;
  napi_value buf, arr;
  if (napi_create_arraybuffer(env, bytes, &data, &buf) != napi_ok) return nullptr;
  if (bytes) std::memcpy(data, v.p, bytes);
  return napi_create_typedarray(env, typedKind(l), v.n, buf, 0, &arr) == napi_ok ? arr : nullptr;
}

// An out parameter: the program's array takes the module's new contents (a typed array is filled in place, as far as it reaches).
void writeBack(napi_env env, napi_value target, char l, const ZnView& v) {
  bool isTyped = false;
  napi_is_typedarray(env, target, &isTyped);
  if (!isTyped) { napi_value zero; napi_create_int32(env, 0, &zero); napi_set_named_property(env, target, "length", zero); }
  for (std::uint32_t i = 0; i < v.n; ++i) {
    const void* at = static_cast<const std::uint8_t*>(v.p) + static_cast<std::size_t>(i) * width(l);
    double d = 0;
    if (l == 'D') std::memcpy(&d, at, 8);
    else if (l == 'B') d = *static_cast<const std::uint8_t*>(at);
    else if (l == 'U') { std::uint32_t x; std::memcpy(&x, at, 4); d = x; }
    else { std::int32_t x; std::memcpy(&x, at, 4); d = x; }
    napi_value e;
    napi_create_double(env, d, &e);
    napi_set_element(env, target, i, e);
  }
}

// The functions the modules hold (handle -> function and its letters) and the promises they will settle.
struct Cb { napi_env env; napi_ref fn; std::string params; char result; int rc; };
struct Pending { napi_env env; napi_deferred deferred; char of; };
std::unordered_map<std::uint64_t, Cb> gCbs;
std::unordered_map<std::uint64_t, Pending> gPromises;
std::uint64_t gNextCb = 1;
std::string gCbError;

// A value of the module as a JS value, by its letter.
napi_value toJs(napi_env env, char l, const ZnVal& v) {
  napi_value r = nullptr;
  switch (l) {
    case 'd': napi_create_double(env, v.d, &r); break;
    case 'i': napi_create_int32(env, static_cast<std::int32_t>(v.i), &r); break;
    case 'u': napi_create_uint32(env, static_cast<std::uint32_t>(v.i), &r); break;
    case 'b': napi_get_boolean(env, v.i != 0, &r); break;
    case 's': napi_create_string_utf8(env, v.s.p, v.s.n, &r); break;
    case 'n': napi_get_undefined(env, &r); break;
    default: r = typed(env, l, v.v);
  }
  return r;
}

void cbUnref(std::uint64_t h) {
  auto it = gCbs.find(h);
  if (it == gCbs.end() || --it->second.rc > 0) return;
  napi_delete_reference(it->second.env, it->second.fn);
  gCbs.erase(it);
}

std::int32_t sinkCall(void*, std::uint64_t h, const ZnVal* args, std::uint32_t n, ZnVal* ret) {
  auto it = gCbs.find(h);
  if (it == gCbs.end()) return -1;
  const Cb c = it->second;   // a copy: the callback may release itself
  napi_env env = c.env;
  napi_handle_scope scope;
  napi_open_handle_scope(env, &scope);
  napi_value fn, undef, r;
  napi_get_reference_value(env, c.fn, &fn);
  napi_get_undefined(env, &undef);
  std::vector<napi_value> a;
  for (std::uint32_t k = 0; k < n && k < c.params.size(); ++k) a.push_back(toJs(env, c.params[k], args[k]));
  if (napi_call_function(env, undef, fn, a.size(), a.data(), &r) != napi_ok) {   // its message goes to the module, as on the typed engines
    napi_value ex;
    gCbError = "exception";
    if (napi_get_and_clear_last_exception(env, &ex) == napi_ok) text(env, ex, gCbError);
    napi_close_handle_scope(env, scope);
    return -1;
  }
  if (ret) {
    static std::string keep;
    switch (c.result) {
      case 'd': number(env, r, ret->d); break;
      case 'i': case 'u': { double d = 0; number(env, r, d); ret->i = static_cast<std::int64_t>(d); break; }
      case 'b': { napi_value bv; bool x = false; napi_coerce_to_bool(env, r, &bv); napi_get_value_bool(env, bv, &x); ret->i = x; break; }
      case 's': keep.clear(); text(env, r, keep); ret->s = ZnStr{keep.data(), static_cast<std::uint32_t>(keep.size())}; break;
      default: break;
    }
  }
  napi_close_handle_scope(env, scope);
  return 0;
}

void settle(std::uint64_t promise, const ZnVal* v, const char* message) {
  auto it = gPromises.find(promise);
  if (it == gPromises.end()) return;
  const Pending p = it->second;
  gPromises.erase(it);
  napi_handle_scope scope;
  napi_open_handle_scope(p.env, &scope);
  napi_value arg;
  if (message) {
    napi_value msg;
    napi_create_string_utf8(p.env, message, NAPI_AUTO_LENGTH, &msg);
    napi_create_error(p.env, nullptr, msg, &arg);
    napi_reject_deferred(p.env, p.deferred, arg);
  } else {
    if (v) arg = toJs(p.env, p.of, *v);
    else napi_get_undefined(p.env, &arg);
    napi_resolve_deferred(p.env, p.deferred, arg);
  }
  napi_close_handle_scope(p.env, scope);
}
void sinkResolve(void*, std::uint64_t p, const ZnVal* v) { settle(p, v, nullptr); }
void sinkReject(void*, std::uint64_t p, const char* m) { settle(p, nullptr, m ? m : ""); }
void sinkRelease(void*, std::uint64_t h) { cbUnref(h); }
void sinkHold(void*, std::uint64_t h) { auto it = gCbs.find(h); if (it != gCbs.end()) ++it->second.rc; }
const char* sinkError(void*) { return gCbError.c_str(); }

napi_value call(napi_env env, napi_callback_info info) {
  void* data = nullptr;
  napi_value argv[16];
  std::size_t argc = 16;
  napi_get_cb_info(env, info, &argc, argv, nullptr, &data);
  const Bound& b = *bound()[reinterpret_cast<std::size_t>(data)];
  const std::string& ps = b.sig.params;
  if (ps.size() > 16) return throwAs(env, "TypeError", "native " + b.module + "." + b.name + ": more than 16 parameters");
  std::vector<ZnVal> args(ps.size() + 1);
  std::deque<std::vector<std::uint8_t>> packed;
  std::deque<std::vector<ZnStr>> views;
  std::deque<std::string> strings;
  std::vector<std::uint64_t> handles;   // the callbacks of this call: its own reference ends when it returns
  std::size_t cbi = 0;
  auto release = [&] { for (std::uint64_t h : handles) cbUnref(h); };
  auto str = [&](napi_value v, ZnStr& out) {
    strings.emplace_back();
    if (!text(env, v, strings.back())) return false;
    out = ZnStr{strings.back().data(), static_cast<std::uint32_t>(strings.back().size())};
    return true;
  };
  napi_value undef;
  napi_get_undefined(env, &undef);
  for (std::size_t k = 0; k < ps.size(); ++k) {
    napi_value v = k < argc ? argv[k] : undef;
    ZnVal& a = args[k];
    a.u = 0;
    bool ok = true;
    switch (ps[k]) {
      case 'd': ok = number(env, v, a.d); break;
      case 'i': { std::int32_t i = 0; ok = int32(env, v, i); a.i = i; break; }
      case 'u': { std::uint32_t u = 0; ok = uint32(env, v, u); a.i = u; break; }
      case 'b': { napi_value bv; bool x = false; ok = napi_coerce_to_bool(env, v, &bv) == napi_ok && napi_get_value_bool(env, bv, &x) == napi_ok; a.i = x ? 1 : 0; break; }
      case 's': ok = str(v, a.s); break;
      case 'c': {
        std::string params;
        char result = 'n';
        nsig::parseCallback(b.sig.cbs[cbi++], params, result);
        napi_valuetype t;
        if (napi_typeof(env, v, &t) != napi_ok || t != napi_function) { release(); return throwAs(env, "TypeError", "native " + b.module + "." + b.name + ": argument " + std::to_string(k + 1) + " is not a function"); }
        a.h = gNextCb++;
        napi_ref ref;
        napi_create_reference(env, v, 1, &ref);
        gCbs[a.h] = Cb{env, ref, params, result, 1};
        handles.push_back(a.h);
        break;
      }
      case 'S': {
        napi_value lv;
        std::int32_t n = 0;
        ok = napi_get_named_property(env, v, "length", &lv) == napi_ok && int32(env, lv, n);
        views.emplace_back(static_cast<std::size_t>(n < 0 ? 0 : n));
        for (std::int32_t i = 0; ok && i < n; ++i) {
          napi_value e;
          ok = napi_get_element(env, v, static_cast<std::uint32_t>(i), &e) == napi_ok && str(e, views.back()[static_cast<std::size_t>(i)]);
        }
        a.v = ZnView{views.back().data(), static_cast<std::uint32_t>(views.back().size())};
        break;
      }
      default:   // B I U D
        packed.emplace_back();
        ok = pack(env, v, ps[k], packed.back());
        a.v = ZnView{packed.back().data(), static_cast<std::uint32_t>(packed.back().size() / width(ps[k]))};
    }
    if (!ok) { release(); return nullptr; }
  }
  std::vector<const void*> sent(ps.size());
  for (std::size_t k = 0; k < ps.size(); ++k) sent[k] = args[k].v.p;
  char err[256] = "";
  ZnVal ret;
  ret.u = 0;
  const std::int32_t st = zn_native_call(b.module.c_str(), b.name.c_str(), nullptr, args.data(), &ret, err, sizeof err);
  release();
  if (b.sig.result == 'P' && st == ZN_PENDING) {
    napi_deferred deferred;
    napi_value promise;
    if (napi_create_promise(env, &deferred, &promise) != napi_ok) return nullptr;
    gPromises[zn_native_last_promise()] = Pending{env, deferred, b.sig.promiseOf};
    return promise;
  }
  if (st == ZN_OK && b.sig.result == 'P') return throwAs(env, "Error", "native " + b.module + "." + b.name + ": an export with a promise result did not take its promise");
  if (st != ZN_OK) { napi_throw_error(env, nullptr, ("native " + b.module + "." + b.name + ": " + err).c_str()); return nullptr; }
  for (std::size_t k = 0; k < ps.size() && k < argc; ++k)
    if (std::strchr("BIUD", ps[k]) && args[k].v.p != sent[k]) writeBack(env, argv[k], ps[k], args[k].v);
  napi_value r = nullptr;
  switch (b.sig.result) {
    case 'd': napi_create_double(env, ret.d, &r); break;
    case 'i': napi_create_int32(env, static_cast<std::int32_t>(ret.i), &r); break;
    case 'u': napi_create_uint32(env, static_cast<std::uint32_t>(ret.i), &r); break;
    case 'b': napi_get_boolean(env, ret.i != 0, &r); break;
    case 's': napi_create_string_utf8(env, ret.s.p, ret.s.n, &r); break;
    case 'n': break;
    default: r = typed(env, b.sig.result, ret.v);
  }
  return r;
}

// __nativeFn(module, export): the function of one export, undefined when the module has none of that name. A module that is not registered
// yet is built and loaded by the provider the CLI installed (the plugin of that name).
napi_value nativeFn(napi_env env, napi_callback_info info) {
  std::size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  std::string module, name;
  if (argc < 2 || !text(env, argv[0], module) || !text(env, argv[1], name)) return nullptr;
  if (!zn_native_has_module(module.c_str())) {
    std::string why = "no plugin provider in this build";
    if (!zn::frontend::gNativeProvider || !zn::frontend::gNativeProvider(module, why)) return throwAs(env, "ReferenceError", "native module '" + module + "': " + why);
  }
  const ZnExport* e = zn_native_find(module.c_str(), name.c_str());
  if (!e) return nullptr;
  auto b = std::make_unique<Bound>();
  b->module = module;
  b->name = name;
  if (!nsig::parse(e->sig, b->sig)) return throwAs(env, "TypeError", "native " + module + "." + name + ": a signature this engine cannot read (" + e->sig + ")");
  bound().push_back(std::move(b));
  napi_value fn;
  napi_create_function(env, name.c_str(), name.size(), call, reinterpret_cast<void*>(bound().size() - 1), &fn);
  return fn;
}

// ---- native records (ZN-850, include/zn/rec.h): __recDecode(bytes, schema) builds the object graph in one native call (the fields of every record
// set in the same order, so the objects of a list share one shape); __recEncode(value, schema) is the reverse. As the typed engines do (src/rt/rtcalls.cpp).
const rec::Schema* recSchema(const std::string& text) {
  static std::unordered_map<std::string, rec::Schema> cache;
  auto it = cache.find(text);
  if (it != cache.end()) return &it->second;
  rec::Schema s;
  if (!rec::parse(text, s)) return nullptr;
  return &cache.emplace(text, std::move(s)).first->second;
}

struct RecJs {
  napi_env env;
  std::unordered_map<const rec::Schema*, std::vector<napi_value>> keys;   // the field names of the call, made once
  napi_value key(const rec::Schema& s, std::size_t i) {
    std::vector<napi_value>& v = keys[&s];
    if (v.empty()) for (const std::string& n : s.names) { napi_value k; napi_create_string_utf8(env, n.data(), n.size(), &k); v.push_back(k); }
    return v[i];
  }
  napi_value num(double d) { napi_value r; napi_create_double(env, d, &r); return r; }
  napi_value str(const void* p, std::size_t n) { napi_value r; napi_create_string_utf8(env, static_cast<const char*>(p), n, &r); return r; }
  napi_value list(rec::Reader* r, const rec::Schema& e, std::uint32_t n, const std::uint8_t* bytes) {
    if (bytes) return typed(env, 'B', ZnView{bytes, n});   // u8[]: a Uint8Array, as a B result is
    napi_value arr;
    napi_create_array_with_length(env, n, &arr);
    for (std::uint32_t i = 0; i < n; ++i) { napi_value v = r ? value(*r, e) : nullptr; if (!v) return nullptr; napi_set_element(env, arr, i, v); }
    return arr;
  }
  napi_value record(rec::Reader* body, const rec::Schema& s) {
    napi_value o;
    napi_create_object(env, &o);
    for (std::size_t i = 0; i < s.kids.size(); ++i) {
      napi_value v = body && body->more() ? value(*body, s.kids[i]) : fallback(s.kids[i]);
      if (!v) return nullptr;
      napi_set_property(env, o, key(s, i), v);
    }
    return o;
  }
  napi_value fallback(const rec::Schema& s) {   // a field past the end of an older writer's record
    napi_value r;
    switch (s.k) {
      case 'd': case 'i': case 'u': return num(0);
      case 'b': napi_get_boolean(env, false, &r); return r;
      case 's': return str("", 0);
      case 'B': return list(nullptr, s, 0, reinterpret_cast<const std::uint8_t*>(""));
      case '*': return list(nullptr, s, 0, nullptr);
      case '?': napi_get_null(env, &r); return r;
      default: return record(nullptr, s);
    }
  }
  napi_value value(rec::Reader& r, const rec::Schema& s) {
    switch (s.k) {
      case 'd': { double d; return r.f64(d) ? num(d) : nullptr; }
      case 'i': { std::int32_t i; return r.i32(i) ? num(i) : nullptr; }
      case 'u': { std::uint32_t u; return r.u32(u) ? num(u) : nullptr; }
      case 'b': { std::uint8_t b; napi_value v; if (!r.u8(b)) return nullptr; napi_get_boolean(env, b != 0, &v); return v; }
      case 's': { const std::uint8_t* p; std::uint32_t n; return r.bytes(p, n) ? str(p, n) : nullptr; }
      case 'B': { const std::uint8_t* p; std::uint32_t n; return r.bytes(p, n) ? list(nullptr, s, n, p) : nullptr; }
      case '*': { std::uint32_t n; return r.u32(n) && n <= static_cast<std::uint64_t>(r.end - r.p) ? list(&r, s.kids[0], n, nullptr) : nullptr; }
      case '?': { std::uint8_t b; napi_value v; if (!r.u8(b)) return nullptr; if (b) return value(r, s.kids[0]); napi_get_null(env, &v); return v; }
      default: { rec::Reader body; return r.record(body) ? record(&body, s) : nullptr; }
    }
  }
  bool encode(napi_value v, const rec::Schema& s, rec::Writer& w, std::string& err, const std::string& at) {
    napi_valuetype t = napi_undefined;
    napi_typeof(env, v, &t);
    auto wrong = [&](const char* what) { err = (at.empty() ? std::string("the value") : "'" + at + "'") + " is not " + what; return false; };
    if (s.k == '?') { if (t == napi_null || t == napi_undefined) { w.u8(0); return true; } w.u8(1); return encode(v, s.kids[0], w, err, at); }
    switch (s.k) {
      case 'd': case 'i': case 'u': {
        double d;
        if (t != napi_number || napi_get_value_double(env, v, &d) != napi_ok) return wrong("a number");
        if (s.k == 'd') w.f64(d); else if (s.k == 'i') w.i32(static_cast<std::int32_t>(static_cast<std::int64_t>(d))); else w.u32(static_cast<std::uint32_t>(static_cast<std::int64_t>(d)));
        return true;
      }
      case 'b': { bool b; if (t != napi_boolean || napi_get_value_bool(env, v, &b) != napi_ok) return wrong("a boolean"); w.u8(b); return true; }
      case 's': { std::string x; if (t != napi_string || !text(env, v, x)) return wrong("a string"); w.bytes(x.data(), x.size()); return true; }
      case 'B': { std::vector<std::uint8_t> b; if (t != napi_object || !pack(env, v, 'B', b)) return wrong("an array of bytes"); w.bytes(b.data(), b.size()); return true; }
      case '*': {
        bool isArr = false;
        std::uint32_t n = 0;
        if (napi_is_array(env, v, &isArr) != napi_ok || !isArr || napi_get_array_length(env, v, &n) != napi_ok) return wrong("an array");
        w.u32(n);
        for (std::uint32_t i = 0; i < n; ++i) { napi_value e; napi_get_element(env, v, i, &e); if (!encode(e, s.kids[0], w, err, at + "[" + std::to_string(i) + "]")) return false; }
        return true;
      }
      default: {
        if (t != napi_object) return wrong("a record");
        std::size_t start = w.begin();
        for (std::size_t i = 0; i < s.kids.size(); ++i) {
          napi_value f;
          napi_get_property(env, v, key(s, i), &f);
          if (!encode(f, s.kids[i], w, err, at.empty() ? s.names[i] : at + "." + s.names[i])) return false;
        }
        w.end(start);
        return true;
      }
    }
  }
};

napi_value recCall(napi_env env, napi_callback_info info) {
  std::size_t argc = 2;
  napi_value argv[2];
  void* data = nullptr;
  napi_get_cb_info(env, info, &argc, argv, nullptr, &data);
  std::string schema;
  const rec::Schema* s = argc == 2 && text(env, argv[1], schema) ? recSchema(schema) : nullptr;
  if (!s) return throwAs(env, "TypeError", "native record: a schema this engine cannot read");
  RecJs rj{env, {}};
  if (data) {   // __recEncode
    rec::Writer w;
    std::string err;
    if (!rj.encode(argv[0], *s, w, err, "")) return throwAs(env, "TypeError", "native record: " + err);
    return typed(env, 'B', ZnView{w.out.data(), static_cast<std::uint32_t>(w.out.size())});
  }
  std::vector<std::uint8_t> bytes;
  if (!pack(env, argv[0], 'B', bytes)) return nullptr;
  rec::Reader r{bytes.data(), bytes.data() + bytes.size()};
  napi_value v = rj.value(r, *s);
  return v ? v : throwAs(env, "TypeError", "native record: the bytes do not match the record's schema");
}

}  // namespace

void installNative(napi_env env) {
  napi_value g, fn;
  napi_get_global(env, &g);
  napi_create_function(env, "__nativeFn", NAPI_AUTO_LENGTH, nativeFn, nullptr, &fn);
  napi_set_named_property(env, g, "__nativeFn", fn);
  napi_create_function(env, "__recDecode", NAPI_AUTO_LENGTH, recCall, nullptr, &fn);
  napi_set_named_property(env, g, "__recDecode", fn);
  napi_create_function(env, "__recEncode", NAPI_AUTO_LENGTH, recCall, reinterpret_cast<void*>(1), &fn);
  napi_set_named_property(env, g, "__recEncode", fn);
  ZnSink sink{nullptr, sinkResolve, sinkReject, sinkCall, sinkRelease, sinkError, sinkHold};
  zn_native_set_sink(&sink);
}

}  // namespace zn::qjs
