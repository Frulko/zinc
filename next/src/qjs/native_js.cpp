// Native modules on the QuickJS engine (ZN-583.02): `requireNative('Sqlite')` of a plugin's spec file gives an object whose functions call the
// module's exports through the registry of include/zn/native.h, the arguments and the result converted by the export's signature letters, as
// src/rt/rtcalls.cpp does for the typed engines. So a plugin's index.ts runs unchanged here, on the same native code.
// ponytail: callbacks (c(...)) and promise results (P<t>) are not carried; an export that has one throws a TypeError naming it. Add them with
// the sink of zn_native_set_sink when a plugin with callbacks must run on this engine.
#include "qjs/qjs.h"

#include <cstring>
#include <deque>
#include <memory>
#include <string>
#include <vector>

extern "C" {
#include "../../third_party/quickjs-ng/quickjs.h"
}

#include "frontend/modules.h"
#include "zn/native.h"
#include "zn/native_sig.h"

namespace zn::qjs {

// 'zinc:native' for this engine. NativeModule is a type in the spec files; a module cannot import a name that is not exported.
const char* kNativeModule =
    "export const NativeModule = undefined;\n"
    "export function requireNative(name) {\n"
    "  return new Proxy({}, { get(t, k) { return typeof k !== 'string' ? undefined : k in t ? t[k] : (t[k] = __nativeFn(name, k)); } });\n"
    "}\n";

namespace {

struct Bound { std::string module, name; nsig::Sig sig; };
std::vector<std::unique_ptr<Bound>>& bound() { static std::vector<std::unique_ptr<Bound>> v; return v; }

std::size_t width(char l) { return l == 'D' ? 8 : l == 'B' ? 1 : 4; }
int typedKind(char l) { return l == 'D' ? JS_TYPED_ARRAY_FLOAT64 : l == 'B' ? JS_TYPED_ARRAY_UINT8 : l == 'U' ? JS_TYPED_ARRAY_UINT32 : JS_TYPED_ARRAY_INT32; }

// The elements of a JS array or typed array, packed as the letter says (f64, i32, u32 or bytes).
bool pack(JSContext* ctx, JSValueConst v, char l, std::vector<std::uint8_t>& out) {
  if (JS_GetTypedArrayType(v) == typedKind(l)) {   // the same element type: its bytes as they are
    size_t off = 0, len = 0, per = 0, size = 0;
    JSValue buf = JS_GetTypedArrayBuffer(ctx, v, &off, &len, &per);
    if (JS_IsException(buf)) return false;
    const std::uint8_t* p = JS_GetArrayBuffer(ctx, &size, buf);
    JS_FreeValue(ctx, buf);
    if (p) out.assign(p + off, p + off + len);
    return true;
  }
  JSValue lv = JS_GetPropertyStr(ctx, v, "length");
  std::int64_t n = 0;
  if (JS_IsException(lv) || JS_ToInt64(ctx, &n, lv)) return false;
  JS_FreeValue(ctx, lv);
  if (n < 0) n = 0;
  out.resize(static_cast<std::size_t>(n) * width(l));
  for (std::int64_t i = 0; i < n; ++i) {
    JSValue e = JS_GetPropertyInt64(ctx, v, i);
    double d = 0;
    if (JS_IsException(e) || JS_ToFloat64(ctx, &d, e)) return false;
    JS_FreeValue(ctx, e);
    std::uint8_t* at = out.data() + static_cast<std::size_t>(i) * width(l);
    if (l == 'D') std::memcpy(at, &d, 8);
    else if (l == 'B') *at = static_cast<std::uint8_t>(static_cast<std::int64_t>(d));
    else { auto x = static_cast<std::int32_t>(static_cast<std::int64_t>(d)); std::memcpy(at, &x, 4); }
  }
  return true;
}

// An array result, or an array the module changed: a typed array of its element type (one copy).
JSValue typed(JSContext* ctx, char l, const ZnView& v) {
  JSValue buf = JS_NewArrayBufferCopy(ctx, static_cast<const std::uint8_t*>(v.p), static_cast<std::size_t>(v.n) * width(l));
  if (JS_IsException(buf)) return buf;
  JSValue arr = JS_NewTypedArray(ctx, 1, &buf, static_cast<JSTypedArrayEnum>(typedKind(l)));
  JS_FreeValue(ctx, buf);
  return arr;
}

// An out parameter: the program's array takes the module's new contents (a typed array is filled in place, as far as it reaches).
void writeBack(JSContext* ctx, JSValueConst target, char l, const ZnView& v) {
  const bool isTyped = JS_GetTypedArrayType(target) >= 0;
  if (!isTyped) JS_SetPropertyStr(ctx, target, "length", JS_NewInt32(ctx, 0));
  for (std::uint32_t i = 0; i < v.n; ++i) {
    const void* at = static_cast<const std::uint8_t*>(v.p) + static_cast<std::size_t>(i) * width(l);
    double d = 0;
    if (l == 'D') std::memcpy(&d, at, 8);
    else if (l == 'B') d = *static_cast<const std::uint8_t*>(at);
    else if (l == 'U') { std::uint32_t x; std::memcpy(&x, at, 4); d = x; }
    else { std::int32_t x; std::memcpy(&x, at, 4); d = x; }
    JS_SetPropertyUint32(ctx, target, i, JS_NewFloat64(ctx, d));
  }
}

JSValue call(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv, int magic, JSValueConst*) {
  const Bound& b = *bound()[static_cast<std::size_t>(magic)];
  const std::string& ps = b.sig.params;
  std::vector<ZnVal> args(ps.size() + 1);
  std::deque<std::vector<std::uint8_t>> packed;
  std::deque<std::vector<ZnStr>> views;
  std::vector<const char*> strings;
  auto release = [&] { for (const char* s : strings) JS_FreeCString(ctx, s); };
  auto text = [&](JSValueConst v, ZnStr& out) {
    size_t n = 0;
    const char* p = JS_ToCStringLen(ctx, &n, v);
    if (!p) return false;
    strings.push_back(p);
    out = ZnStr{p, static_cast<std::uint32_t>(n)};
    return true;
  };
  for (std::size_t k = 0; k < ps.size(); ++k) {
    JSValueConst v = static_cast<int>(k) < argc ? argv[k] : JS_UNDEFINED;
    ZnVal& a = args[k];
    a.u = 0;
    bool ok = true;
    switch (ps[k]) {
      case 'd': ok = JS_ToFloat64(ctx, &a.d, v) == 0; break;
      case 'i': { std::int32_t i = 0; ok = JS_ToInt32(ctx, &i, v) == 0; a.i = i; break; }
      case 'u': { std::uint32_t u = 0; ok = JS_ToUint32(ctx, &u, v) == 0; a.i = u; break; }
      case 'b': a.i = JS_ToBool(ctx, v) ? 1 : 0; break;
      case 's': ok = text(v, a.s); break;
      case 'S': {
        JSValue lv = JS_GetPropertyStr(ctx, v, "length");
        std::int32_t n = 0;
        ok = !JS_IsException(lv) && JS_ToInt32(ctx, &n, lv) == 0;
        JS_FreeValue(ctx, lv);
        views.emplace_back(static_cast<std::size_t>(n < 0 ? 0 : n));
        for (std::int32_t i = 0; ok && i < n; ++i) {
          JSValue e = JS_GetPropertyUint32(ctx, v, static_cast<std::uint32_t>(i));
          ok = text(e, views.back()[static_cast<std::size_t>(i)]);
          JS_FreeValue(ctx, e);
        }
        a.v = ZnView{views.back().data(), static_cast<std::uint32_t>(views.back().size())};
        break;
      }
      default:   // B I U D
        packed.emplace_back();
        ok = pack(ctx, v, ps[k], packed.back());
        a.v = ZnView{packed.back().data(), static_cast<std::uint32_t>(packed.back().size() / width(ps[k]))};
    }
    if (!ok) { release(); return JS_EXCEPTION; }
  }
  std::vector<const void*> sent(ps.size());
  for (std::size_t k = 0; k < ps.size(); ++k) sent[k] = args[k].v.p;
  char err[256] = "";
  ZnVal ret;
  ret.u = 0;
  const std::int32_t st = zn_native_call(b.module.c_str(), b.name.c_str(), nullptr, args.data(), &ret, err, sizeof err);
  release();
  if (st != ZN_OK) return JS_ThrowInternalError(ctx, "native %s.%s: %s", b.module.c_str(), b.name.c_str(), err);
  for (std::size_t k = 0; k < ps.size() && static_cast<int>(k) < argc; ++k)
    if (std::strchr("BIUD", ps[k]) && args[k].v.p != sent[k]) writeBack(ctx, argv[k], ps[k], args[k].v);
  switch (b.sig.result) {
    case 'd': return JS_NewFloat64(ctx, ret.d);
    case 'i': return JS_NewInt32(ctx, static_cast<std::int32_t>(ret.i));
    case 'u': return JS_NewUint32(ctx, static_cast<std::uint32_t>(ret.i));
    case 'b': return JS_NewBool(ctx, ret.i != 0);
    case 's': return JS_NewStringLen(ctx, ret.s.p, ret.s.n);
    case 'n': return JS_UNDEFINED;
    default: return typed(ctx, b.sig.result, ret.v);
  }
}

// __nativeFn(module, export): the function of one export, undefined when the module has none of that name. A module that is not registered
// yet is built and loaded by the provider the CLI installed (the plugin of that name).
JSValue nativeFn(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
  const char* m = argc > 0 ? JS_ToCString(ctx, argv[0]) : nullptr;
  const char* n = argc > 1 ? JS_ToCString(ctx, argv[1]) : nullptr;
  if (!m || !n) { if (m) JS_FreeCString(ctx, m); return JS_EXCEPTION; }
  const std::string module = m, name = n;
  JS_FreeCString(ctx, m);
  JS_FreeCString(ctx, n);
  if (!zn_native_has_module(module.c_str())) {
    std::string why = "no plugin provider in this build";
    if (!zn::frontend::gNativeProvider || !zn::frontend::gNativeProvider(module, why)) return JS_ThrowReferenceError(ctx, "native module '%s': %s", module.c_str(), why.c_str());
  }
  const ZnExport* e = zn_native_find(module.c_str(), name.c_str());
  if (!e) return JS_UNDEFINED;
  auto b = std::make_unique<Bound>();
  b->module = module;
  b->name = name;
  if (!nsig::parse(e->sig, b->sig) || b->sig.result == 'P' || b->sig.params.find('c') != std::string::npos)
    return JS_ThrowTypeError(ctx, "native %s.%s (%s): callbacks and promises of native modules are not available on the QuickJS engine", module.c_str(), name.c_str(), e->sig);
  bound().push_back(std::move(b));
  return JS_NewCFunctionData(ctx, call, static_cast<int>(bound().back()->sig.params.size()), static_cast<int>(bound().size() - 1), 0, nullptr);
}

}  // namespace

void installNative(JSContext* ctx) {
  JSValue g = JS_GetGlobalObject(ctx);
  JS_SetPropertyStr(ctx, g, "__nativeFn", JS_NewCFunction(ctx, nativeFn, "__nativeFn", 2));
  JS_FreeValue(ctx, g);
}

}  // namespace zn::qjs
