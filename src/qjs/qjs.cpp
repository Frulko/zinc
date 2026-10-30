#include "yyjson.h"
#include <map>
#include <set>
#include "qjs/qjs.h"
#include "zn/js_ext.h"
#include "zn/log.h"
#include "zn/loop.h"

#include <algorithm>
#include <array>
#include <chrono>
#include <functional>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <pthread.h>
#include <sstream>
#include <thread>
#include <unistd.h>
#include <vector>

extern "C" {
void zn_lre_delegate(void* (*)(void*, void*, size_t), int (*)(void*), bool (*)(void*, size_t));   // src/host/lre_host.c
void* qjs_lre_realloc(void*, void*, size_t);                                                       // quickjs.c, renamed (CMakeLists.txt)
int qjs_lre_check_timeout(void*);
bool qjs_lre_check_stack_overflow(void*, size_t);
#include "../../third_party/quickjs-ng/quickjs.h"
}

#include "frontend/modules.h"
#include "frontend/plugin_manifest.h"
#include "frontend/profile.h"
#include "frontend/project.h"
#include "frontend/tsconfig.h"
#include "qjs/strip.h"
#include "zn/host.h"
#include "zn/worker_bridge.h"
#include "zn/native.h"
#include "zn/resource_stats.h"
#include "zn/runtime.h"

namespace zn::qjs {
namespace {

struct Engine {
  JSRuntime* rt = nullptr;
  JSContext* ctx = nullptr;
  std::string stdRoot;
  std::string entry;   // the program's entry file (zinc:icons/lucide reads its project)
  std::string cacheDir;   // the transformed modules by content hash ("" : none)
  std::map<std::string, std::string> imports;   // bare specifiers -> files, from importmap.json next to the entry (like a browser import map): `import 'three'` (ZN-204)
  std::set<std::string> packageFiles;   // the files node_modules resolved, by their real path: a package even when its link points outside node_modules (pnpm's store, a workspace)
  zn::frontend::ModuleResolver res;   // how a specifier becomes a file, as for every engine (frontend/resolve.h)
  std::string modules;   // a directory whose <name>.js stands for zinc:<name> (the ESP32's modules under --engine mquickjs, src/cli_mqjs.cpp)
  struct Rejection { JSValue promise, reason; };
  std::vector<Rejection> rejected;   // promises rejected with no handler yet: reported once the jobs have drained, when nobody caught them (ZN-566)
  void* entryPromise = nullptr;      // the entry module's own promise: its rejection is the program's uncaught exception
  bool worker = false;               // a zinc:worker program (runWorker): no native modules, frames or web environment
};

bool readFile(const std::string& path, std::string& out) {
  std::ifstream in(path, std::ios::binary);
  if (!in) return false;
  std::stringstream ss;
  ss << in.rdbuf();
  out = ss.str();
  return true;
}
bool endsWith(const std::string& s, const char* suffix) { std::size_t n = std::strlen(suffix); return s.size() >= n && s.compare(s.size() - n, n, suffix) == 0; }

using zn::frontend::dirOf;
using zn::frontend::normalize;
// An absolute path for the resolver's tests: a POSIX '/accessories start' or a Windows drive letter ('C:' — the paths
// arrive as they came: backslashes from std::filesystem, forward slashes from the usual joins)
static bool pathAbs(const std::string& p) {
  if (p.empty()) return false;
  if (p[0] == '/') return true;
  if (p.size() > 1 && (p[0] >= 'a' && p[0] <= 'z' || p[0] >= 'A' && p[0] <= 'Z') && p[1] == ':') return true;
  return false;
}
// ---- the host calls, generated from the runtime table: one JS function per `host.*` row, its arguments decoded by the row's letters
using zn::host::HostArg;

JSValue hostFn(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv, int magic) {
  const auto id = static_cast<zn::Rt>(magic);
  const zn::RtInfo& ri = zn::rtInfo(id);
  const bool sys = zn::isSysRow(id);
  if (id == zn::Rt::HostSysWrite || id == zn::Rt::HostSysWriteErr || id == zn::Rt::HostSysExit) {
    if (id == zn::Rt::HostSysExit) {
      int32_t code = 0;
      if (argc > 0) JS_ToInt32(ctx, &code, argv[0]);
      std::fflush(stdout);
      std::exit(code);
    }
    size_t n = 0;
    const char* p = argc > 0 ? JS_ToCStringLen(ctx, &n, argv[0]) : nullptr;
    if (p) { std::fwrite(p, 1, n, id == zn::Rt::HostSysWrite ? stdout : stderr); JS_FreeCString(ctx, p); }
    return JS_UNDEFINED;
  }
  if (zn::host::workerBridge.onWorker()) {   // as the typed engines' runtime calls (src/rt/rtcalls.cpp)
    if (!sys || zn::isLayoutRow(id)) return JS_ThrowTypeError(ctx, "this module draws or lays out: it is not available in a worker (do the drawing on the main side and post the result)");
    if (zn::host::workerBridge.stopping()) return JS_ThrowInternalError(ctx, "terminated");
  }
  if (id == zn::Rt::HostEvReady) zn::host::workerBridge.deliver();   // the messages of zinc:worker become events of this loop
  else if (id == zn::Rt::HostLoopWait) zn::host::workerBridge.idleWait();
  zn::host::HostCall call = zn::isLayoutRow(static_cast<zn::Rt>(id)) ? zn::host::hostLayout : sys ? zn::host::hostSys : zn::host::hostGfx;
  if (!call) return JS_ThrowInternalError(ctx, "%s is not available in this build", ri.name);
  HostArg args[zn::kMaxHostParams], res;
  std::array<std::string, zn::kMaxHostParams> strings;   // one per parameter, in place: a call without strings or arrays allocates nothing (ZN-567)
  std::array<std::vector<std::uint64_t>, zn::kMaxHostParams> arrays;
  const unsigned np = zn::rtParamCount(ri);
  for (unsigned k = 0; k < np; ++k) {
    JSValueConst v = static_cast<int>(k) < argc ? argv[k] : JS_UNDEFINED;
    HostArg& h = args[k];
    switch (zn::rtParam(ri, k)) {
      case 'd': { double d = 0; JS_ToFloat64(ctx, &d, v); h.d = d; break; }
      case 's': {
        size_t n = 0;
        const char* p = JS_ToCStringLen(ctx, &n, v);
        if (!p) return JS_EXCEPTION;
        strings[k].assign(p, n);
        JS_FreeCString(ctx, p);
        h.p = strings[k].data(); h.n = static_cast<std::uint32_t>(n);
        break;
      }
      case 'D': case 'B': {
        JSValue len = JS_GetPropertyStr(ctx, v, "length");
        int32_t n = 0;
        JS_ToInt32(ctx, &n, len);
        JS_FreeValue(ctx, len);
        arrays[k].assign(static_cast<size_t>(n < 0 ? 0 : n), 0);
        for (int32_t i = 0; i < n; ++i) {
          JSValue e = JS_GetPropertyUint32(ctx, v, static_cast<uint32_t>(i));
          double d = 0;
          JS_ToFloat64(ctx, &d, e);
          JS_FreeValue(ctx, e);
          if (zn::rtParam(ri, k) == 'D') std::memcpy(&arrays[k][static_cast<size_t>(i)], &d, 8);
          else arrays[k][static_cast<size_t>(i)] = static_cast<std::uint64_t>(static_cast<std::int64_t>(d)) & 0xFF;
        }
        h.p = arrays[k].data(); h.n = static_cast<std::uint32_t>(n);
        break;
      }
      case 'u': { double d = 0; JS_ToFloat64(ctx, &d, v); h.i = static_cast<std::int64_t>(static_cast<std::uint32_t>(static_cast<std::int64_t>(d))); break; }
      case 'b': h.i = JS_ToBool(ctx, v) ? 1 : 0; break;
      default: { int32_t i = 0; JS_ToInt32(ctx, &i, v); h.i = i; break; }
    }
  }
  call(static_cast<int>(id), args, &res);
  switch (zn::rtRet(ri)) {
    case 'd': return JS_NewFloat64(ctx, res.d);
    case 'i': return JS_NewInt32(ctx, static_cast<int32_t>(res.i));
    case 'b': return JS_NewBool(ctx, res.i != 0);
    case 's': return JS_NewStringLen(ctx, static_cast<const char*>(res.p), res.n);
    default: return JS_UNDEFINED;
  }
}

void installHost(JSContext* ctx) {
  JSValue g = JS_GetGlobalObject(ctx);
  for (unsigned i = static_cast<unsigned>(zn::Rt::HostGfxFrames); i < static_cast<unsigned>(zn::Rt::Count); ++i) {
    const bool loop = i >= static_cast<unsigned>(zn::Rt::HostLoopWait) && i <= static_cast<unsigned>(zn::Rt::HostLoopNow);   // the loader stage waits for its first jobs (ZN-447)
    if (i >= static_cast<unsigned>(zn::Rt::HostHostLast) && !loop && !zn::isLayoutRow(static_cast<zn::Rt>(i)) && !zn::isGfxTailRow(static_cast<zn::Rt>(i)) && !zn::isSysTailRow(static_cast<zn::Rt>(i))) continue;   // the rows past the host block that are host calls too: the layout engine (ZN-284.01), the zinc:gfx rows appended since (commands, resize, transform, sprites)
    const zn::RtInfo& ri = zn::kRtInfo[i];
    std::string name = std::string("__host_") + zn::rtMember(ri);
    JS_SetPropertyStr(ctx, g, name.c_str(), JS_NewCFunctionMagic(ctx, hostFn, name.c_str(), static_cast<int>(zn::rtParamCount(ri)), JS_CFUNC_generic_magic, static_cast<int>(i)));
  }
  JS_FreeValue(ctx, g);
}

// ---- modules
// zinc:gfx brings its own frame loop (the C++ one below): the API part of the Zinc module follows the marker line.
std::string gfxSource() {
  const char* full = zn::frontend::builtinModuleSource("zinc:gfx");
  std::string s = full ? full : "";
  auto at = s.find("// ---- api");
  std::string api = at == std::string::npos ? "" : s.substr(at);
  return "let __frameCb = null;\n"
         "const __resizeFns = []; let __lastW = 0, __lastH = 0;\n"   // onResize (ZN-608): the frame callback reports a new size first
         "const __winIds = [], __winFns = [];\n"   // the windows beside the main one (ZN-663, ZN-685) and their frame callbacks
         "function __frameStep(dt) {\n"   // what the typed engine's __gfxLoop does between begin and end
         "  if (__resizeFns.length > 0 && (__host_gfxWidth() !== __lastW || __host_gfxHeight() !== __lastH)) {\n"
         "    __lastW = __host_gfxWidth(); __lastH = __host_gfxHeight(); for (const f of __resizeFns) f(__lastW, __lastH); }\n"
         "  if (__frameCb !== null && (__winIds.length === 0 || __host_gfxWindowOpen(0) !== 0)) __frameCb(dt);\n"   // a closed main window is hidden while others are open
         "  for (let i = 0; i < __winIds.length; i++) {\n"
         "    const id = __winIds[i];\n"
         "    if (__host_gfxWindowOpen(id) === 0) { __winIds.splice(i, 1); __winFns.splice(i, 1); i--; continue; }\n"
         "    __host_gfxBeginWindow(id); __winFns[i](dt); __host_gfxEndWindow(); }\n"
         "  if (__overFn !== null && !__overFn(dt)) __overFn = null; }\n"   // overlay (ZN-447): over the program's drawing
         "let __overFn = null;\n"
         "let __pausedFn = null;\n"   // zinc:devtools' pumps while the inspector pauses the program (frameLoop below)
         "export function onPausedFrame(f) { __pausedFn = f; }\n"
         "globalThis.__zincPausedFrame = () => { if (__pausedFn !== null) __pausedFn(); };\n"
         "export function overlay(draw) { __overFn = draw; }\n"
         "export function overlaid() { return __overFn !== null; }\n"
         "export function onFrame(cb) { __frameCb = cb; globalThis.__zincFrameCb = __frameStep; }\n"
         "export function onResize(cb) {\n"
         "  if (__resizeFns.length === 0) { __host_gfxSetResize(1); __lastW = __host_gfxWidth(); __lastH = __host_gfxHeight(); }\n"
         "  __resizeFns.push(cb); }\n"
         "export function frame() { return globalThis.__zincFrameNo | 0; }\n"
         "export function openWindow(title, w, h, cb) {\n"
         "  const id = __host_gfxOpenWindow(title, w, h);\n"
         "  if (id > 0) { __winIds.push(id); __winFns.push(cb); globalThis.__zincFrameCb = __frameStep; }\n"
         "  return id; }\n"
         "export function closeWindow(id) { __host_gfxCloseWindow(id); }\n"
         "export function windowOpen(id) { return __host_gfxWindowOpen(id) !== 0; }\n" + api;
}

// A CommonJS file (`module.exports = ...`, `require('./x')`): a .cjs, or a .js with no line that starts with import or export
bool isCommonJs(const std::string& path, const std::string& src) {
  if (endsWith(path, ".cjs")) return true;
  if (!endsWith(path, ".js")) return false;
  for (std::size_t at = 0; at < src.size();) {
    std::size_t b = src.find_first_not_of(" \t\r", at), e = src.find('\n', at);
    if (e == std::string::npos) e = src.size();
    if (b < e) {
      std::string_view line(src.data() + b, e - b);
      for (std::string_view kw : {"import", "export"})
        if (line.substr(0, kw.size()) == kw && line.size() > kw.size() && std::string_view(" {*'\"").find(line[kw.size()]) != std::string_view::npos) return false;
    }
    at = e + 1;
  }
  auto bare = [&](std::string_view word) {   // the word itself, not a property (`instance.exports.add` of WebAssembly) nor the end of a longer name
    for (std::size_t at = 0; (at = src.find(word, at)) != std::string::npos; at += word.size()) {
      const char c = at ? src[at - 1] : ' ';
      if (!std::isalnum(static_cast<unsigned char>(c)) && c != '_' && c != '$' && c != '.') return true;
    }
    return false;
  };
  return bare("module.exports") || bare("exports.");
}

// A CommonJS module run as an ES module whose default export is its module.exports, as Node imports one. The files it requires with a string
// (`require('./distance.js')`, a CommonJS package) are found before it runs and wrapped beside it, as a bundler does; any other require throws.
// ponytail: no named exports (Node finds some with cjs-module-lexer); `import { x } from 'cjs-package'` fails to link, `import p from` works
void commonJsModule(zn::frontend::ModuleResolver& res, const std::string& path, const std::string& src, std::string& js) {
  std::map<std::string, int> index;
  std::vector<std::string> parts;
  std::function<int(const std::string&, const std::string&)> add = [&](const std::string& file, const std::string& text) {
    if (auto it = index.find(file); it != index.end()) return it->second;
    const int id = static_cast<int>(parts.size());
    index[file] = id;
    parts.emplace_back();
    std::string deps;
    for (std::size_t at = 0; (at = text.find("require(", at)) != std::string::npos;) {
      at += 8;
      if (at - 8 > 0 && (std::isalnum(static_cast<unsigned char>(text[at - 9])) || text[at - 9] == '_' || text[at - 9] == '.' || text[at - 9] == '$')) continue;
      std::size_t q = text.find_first_not_of(" \t", at);
      if (q == std::string::npos || (text[q] != '\'' && text[q] != '"')) continue;
      const std::size_t close = text.find(text[q], q + 1);
      if (close == std::string::npos) break;
      const std::string spec = text.substr(q + 1, close - q - 1);
      std::string found = spec.rfind("./", 0) == 0 || spec.rfind("../", 0) == 0 ? res.file(normalize(dirOf(file) + "/" + spec), file) : res.package(dirOf(file), spec);
      std::string dep;
      if (found.empty() || !readFile(found, dep)) continue;
      int d = -1;
      if (endsWith(found, ".json")) { d = static_cast<int>(parts.size()); index[found] = d; parts.push_back("__cjs[" + std::to_string(d) + "] = [function (module) { module.exports = " + dep + "; }, {}];\n"); }
      else if (isCommonJs(found, dep)) d = add(found, dep);
      if (d >= 0) deps += (deps.empty() ? "" : ", ") + std::string("\"") + spec + "\": " + std::to_string(d);
    }
    parts[static_cast<std::size_t>(id)] = "__cjs[" + std::to_string(id) + "] = [function (module, exports, require) {\n" + text + "\n}, {" + deps + "}];\n";
    return id;
  };
  add(path, src);
  js = "const __cjs = [], __cjsCache = [];\n";
  for (const std::string& p : parts) js += p;
  js += "function __cjsLoad(i) {\n"
        "  if (__cjsCache[i]) return __cjsCache[i].exports;\n"
        "  const m = { exports: {} };\n"
        "  __cjsCache[i] = m;\n"
        "  const deps = __cjs[i][1];\n"
        "  __cjs[i][0].call(m.exports, m, m.exports, (id) => {\n"
        "    if (!(id in deps)) throw new Error(\"Cannot find module '\" + id + \"': a CommonJS module run by zinc can require its own files and CommonJS packages\");\n"
        "    return __cjsLoad(deps[id]);\n"
        "  });\n"
        "  return m.exports;\n"
        "}\n"
        "export default __cjsLoad(0);\n";
}

bool moduleText(Engine& e, const std::string& name, std::string& js, std::string& err) {
  std::string src, path = name;
  if (name == "zinc:native") { js = kNativeModule; return true; }   // plain JavaScript: nothing to strip
  if (const zn::frontend::LoaderStage& st = zn::frontend::loaderStage(); !st.source.empty() && name == st.path) return stripTypes(st.source, name, js, err);   // ZN-447
  if (name.rfind("zinc:", 0) == 0) {
    if (name == "zinc:gfx") src = gfxSource();
    else if (name == "zinc:platform") src = zn::frontend::platformModule(e.stdRoot + "/../../targets/capabilities.json");
    else if (name == "zinc:icons/lucide") src = zn::frontend::lucideModule(e.entry, e.stdRoot + "/../../third_party/lucide/icon-nodes.json");
    else if (const char* b = zn::frontend::builtinModuleSource(name)) src = b;
    else if (std::string g = zn::frontend::generatedModuleSource(name); !g.empty()) src = std::move(g);
    else {
      std::string_view f = zn::frontend::stdModuleFile(name);
      if (f.empty() || e.stdRoot.empty()) { err = "cannot find module '" + name + "'"; return false; }
      path = e.stdRoot + "/" + std::string(f);
      if (!readFile(path, src)) { err = "cannot read " + path; return false; }
    }
  } else if (!readFile(path, src)) {
    if (std::getenv("ZN_QJS_DEBUG")) std::fprintf(stderr, "qjs: module failli: name=<%s> path=<%s>\n", name.c_str(), path.c_str());
    err = "cannot load module " + name; return false;
  }
  if (name.rfind("zinc:", 0) != 0 && isCommonJs(path, src)) { commonJsModule(e.res, path, src, js); return true; }
  const std::string file = name.rfind("zinc:", 0) == 0 && !endsWith(path, ".tsx") ? name : path;
  // ponytail: the cache is never pruned (one small file per version of a module); prune by age if ~/.zinc/cache/qjs grows
  // the transform stage of the bundler (.tsx too), cached by content: the source, its name and what the transform reads besides (the UI preset and
  // layout of zinc.json; the directory is per build of the engine)
  std::string cached;
  // ponytail: a module that uses zinc:worker is transformed at each run: its message schemas come from the types of the files it imports
  // (workerTypesForJs), which the content hash does not cover
  if (!e.cacheDir.empty() && src.find("zinc:worker") == std::string::npos) {
    std::uint64_t h = 1469598103934665603ull;
    for (const std::string& part : {src, file, zn::frontend::uiPreset(), zn::frontend::uiLayout(), std::string(std::getenv("ZINC_WEB_HOT") ? "hot" : ""), std::string(zn::frontend::currentProfile() ? zn::frontend::currentProfile()->name : "")})
      for (unsigned char c : part + '\0') { h ^= c; h *= 1099511628211ull; }
    char key[40];
    std::snprintf(key, sizeof key, "/%016llx-%zx.js", static_cast<unsigned long long>(h), src.size());
    cached = e.cacheDir + key;
    if (readFile(cached, js)) return true;
  }
  if (!toJavaScript(src, file, js, err)) return false;
  if (!cached.empty()) {   // written aside then renamed: two programs starting at once never read half a file
    std::error_code ec;
    std::filesystem::create_directories(e.cacheDir, ec);
    const std::string tmp = cached + "." + std::to_string(getpid()) + "." + std::to_string(std::hash<std::thread::id>()(std::this_thread::get_id()));   // a worker's thread may write the same module
    { std::ofstream out(tmp, std::ios::binary); out << js; }
    std::filesystem::rename(tmp, cached, ec);
  }
  return true;
}

// QuickJS's module-name normalizer: importmap.json beside the entry (as a browser's import map), the board's modules (zinc:<name> under
// --engine mquickjs), then the resolver every engine shares (frontend/resolve.h). A zinc: name it leaves as it is is a host or standard module (moduleText).
char* normalizeName(JSContext* ctx, const char* base, const char* name, void* opaque) {
  Engine& e = *static_cast<Engine*>(opaque);
  const std::string n = name;
  std::string r = n, from = base;
  if (from.rfind("zinc:", 0) == 0) {   // a standard module's own imports (zinc:ui -> ./palette): beside its file
    std::string_view f = zn::frontend::stdModuleFile(base);
    if (!f.empty() && !e.stdRoot.empty()) from = e.stdRoot + "/" + std::string(f);
  }
  if (auto it = e.imports.find(n); it != e.imports.end()) r = it->second;
  else if (n.rfind("./", 0) == 0 || n.rfind("../", 0) == 0) {
    r = normalize(dirOf(from) + "/" + n);
    if (std::string f = e.res.file(r, from); !f.empty()) r = f;
  } else if (n.rfind("zinc:", 0) == 0) {   // a plugin wins over lib/std, as in the typed loader (zinc:system/*); never over a host module
    std::error_code ec;
    if (!e.modules.empty() && std::filesystem::exists(e.modules + "/" + n.substr(5) + ".js", ec)) r = e.modules + "/" + n.substr(5) + ".js";
    else if (n != "zinc:native" && !zn::frontend::builtinModuleSource(n) && !e.stdRoot.empty()) {
      e.res.plugins(e.entry);   // the program's project first: a script bundle's registry is not in it
      const std::map<std::string, std::string>& pl = e.res.plugins(from);
      if (auto it = pl.find(n); it != pl.end()) r = it->second;
    }
  } else if (!pathAbs(n)) {   // a bare specifier: tsconfig.json paths, a plugin, a compat package, node_modules
    e.res.plugins(e.entry);
    const zn::frontend::ModuleResolver::Bare b = e.res.bare(n, from, true);
    if (!b.file.empty()) r = b.file;
    if (b.package) e.packageFiles.insert(b.file);
  }
  char* out = static_cast<char*>(js_malloc(ctx, r.size() + 1));
  std::memcpy(out, r.c_str(), r.size() + 1);
  return out;
}

// import.meta.url of a module (QuickJS leaves import.meta empty for the host to fill): file:// and the path, or the zinc: name
void setMeta(JSContext* ctx, JSModuleDef* m, const std::string& name) {
  JSValue meta = JS_GetImportMeta(ctx, m);
  if (JS_IsObject(meta)) JS_SetPropertyStr(ctx, meta, "url", JS_NewString(ctx, (pathAbs(name) ? (name[0] == '/' ? "file://" + name : "file:///" + name) : name).c_str()));
  JS_FreeValue(ctx, meta);
}

JSModuleDef* loadModule(JSContext* ctx, const char* name, void* opaque) {
  auto* e = static_cast<Engine*>(opaque);
  std::string js, err;
  if (!moduleText(*e, name, js, err)) { JS_ThrowReferenceError(ctx, "%s", err.c_str()); return nullptr; }
  if (std::strcmp(name, "zinc:worker") == 0) js += kWorkerSelfJs;
  JSValue v = JS_Eval(ctx, js.data(), js.size(), name, JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);
  if (JS_IsException(v)) return nullptr;
  auto* m = static_cast<JSModuleDef*>(JS_VALUE_GET_PTR(v));
  JS_FreeValue(ctx, v);
  setMeta(ctx, m, name);
  return m;
}

// ---- running
// The stack JavaScript may use on this thread: what is left of it below here, less 1 MiB for the native code a script calls at its deepest (a shader
// compile, text shaping), 8 MiB at most; 0 when the system does not say (QuickJS keeps its own 1 MiB). A limit as large as the thread's stack (8 MiB
// on the macOS main thread) lets a deep recursion leave the stack before QuickJS looks: SIGSEGV where JavaScript expects a RangeError (ZN-566).
// The typed engine's twin is cStackLimit in src/rt/machine.cpp.
std::size_t stackBudget() {
  char* low = nullptr;
#if defined(__APPLE__)
  low = static_cast<char*>(pthread_get_stackaddr_np(pthread_self())) - pthread_get_stacksize_np(pthread_self());
#elif defined(__linux__)
  pthread_attr_t a;
  void* addr = nullptr; size_t sz = 0;
  if (pthread_getattr_np(pthread_self(), &a) == 0) { pthread_attr_getstack(&a, &addr, &sz); pthread_attr_destroy(&a); low = static_cast<char*>(addr); }
#endif
  char* here = static_cast<char*>(__builtin_frame_address(0));   // not a local's address: a sanitizer may keep locals off the stack
  if (!low || here <= low) return 0;
  const std::size_t left = static_cast<std::size_t>(here - low), margin = 1u << 20;
  return left > 2 * margin ? std::min<std::size_t>(left - margin, 8u << 20) : left / 2;
}

// A bundle run with its source map beside it (zinc bundle --sourcemap): the traces name the files and lines the user wrote
std::string gMapFile, gMapJson;
std::string gTraceName;   // the name a bundle's bytecode was compiled under, when it runs (its frames carry it)
thread_local std::string* tWorkerError = nullptr;   // on a worker's thread: where its first uncaught error goes (its parent's onerror), not stderr

void report(JSContext* ctx, JSValue ex, const char* what = "Uncaught") {
  const char* s = JS_ToCString(ctx, ex);
  if (tWorkerError) {
    if (tWorkerError->empty()) *tWorkerError = std::string(what) + " " + (s ? s : "exception");
    if (s) JS_FreeCString(ctx, s);
    return;
  }
  JSValue st = JS_GetPropertyStr(ctx, ex, "stack");
  const char* stack = JS_IsUndefined(st) ? nullptr : JS_ToCString(ctx, st);
  std::fflush(stdout);
  std::string trace = stack ? stack : "";
  if (!gTraceName.empty() && gTraceName != gMapFile)   // bytecode compiled elsewhere (an exported app moved since): its frames name the bundle here
    for (std::size_t at = 0; (at = trace.find("(" + gTraceName + ":", at)) != std::string::npos; at += gMapFile.size()) trace.replace(at + 1, gTraceName.size(), gMapFile);
  if (!gMapJson.empty()) trace = mapStack(trace, gMapFile, gMapJson);
  std::fprintf(stderr, "%s %s\n%s", what, s ? s : "exception", trace.c_str());
  if (stack) JS_FreeCString(ctx, stack);
  JS_FreeValue(ctx, st);
  if (s) JS_FreeCString(ctx, s);
}

JSValue global(Engine& e, const char* name) { JSValue g = JS_GetGlobalObject(e.ctx); JSValue v = JS_GetPropertyStr(e.ctx, g, name); JS_FreeValue(e.ctx, g); return v; }

// QuickJS tells of each promise rejected with no handler, and again when one is attached later: what is still here when the jobs have drained was caught by nobody.
void trackRejection(JSContext* ctx, JSValueConst promise, JSValueConst reason, bool handled, void* opaque) {
  auto& v = static_cast<Engine*>(opaque)->rejected;
  if (!handled) { v.push_back({JS_DupValue(ctx, promise), JS_DupValue(ctx, reason)}); return; }
  for (std::size_t i = 0; i < v.size(); ++i)
    if (JS_VALUE_GET_PTR(v[i].promise) == JS_VALUE_GET_PTR(promise)) { JS_FreeValue(ctx, v[i].promise); JS_FreeValue(ctx, v[i].reason); v.erase(v.begin() + static_cast<long>(i)); break; }
}

// Runs the pending promise jobs, then reports the rejections nobody handled (ZN-566); false (the error printed) when the program must stop: a job threw,
// the entry module rejected, or a promise did with no web environment to hear it (the typed engine and Node end the program there; a browser prints and
// goes on). The web environment's __zincUnhandledRejection dispatches `unhandledrejection` and answers true when a listener prevented the message.
bool drain(Engine& e) {
  for (;;) {
    JSContext* c = nullptr;
    int r = JS_ExecutePendingJob(e.rt, &c);
    if (r < 0) { JSValue ex = JS_GetException(c); report(c, ex); JS_FreeValue(c, ex); return false; }
    if (r > 0) continue;
    if (e.rejected.empty()) return true;
    const Engine::Rejection x = e.rejected.front();
    e.rejected.erase(e.rejected.begin());
    const bool entry = JS_VALUE_GET_PTR(x.promise) == e.entryPromise;
    JSValue hook = entry ? JS_UNDEFINED : global(e, "__zincUnhandledRejection");
    const bool web = JS_IsFunction(e.ctx, hook);
    bool quiet = false;
    if (web) {
      JSValueConst args[2] = {x.promise, x.reason};
      JSValue q = JS_Call(e.ctx, hook, JS_UNDEFINED, 2, args);
      if (JS_IsException(q)) JS_FreeValue(e.ctx, JS_GetException(e.ctx));
      else quiet = JS_ToBool(e.ctx, q) > 0;
      JS_FreeValue(e.ctx, q);
    }
    if (!quiet) report(e.ctx, x.reason, entry ? "Uncaught" : "Uncaught (in promise)");
    JS_FreeValue(e.ctx, hook); JS_FreeValue(e.ctx, x.promise); JS_FreeValue(e.ctx, x.reason);
    if (!web) return false;
  }
}

// The native modules' turn: their pollers, then the callbacks and completions they queued (src/qjs/native_js.cpp's sink runs them), then the jobs these left.
bool callFn(Engine& e, JSValueConst f, JSValueConst arg, bool hasArg) {
  JSValue r = JS_Call(e.ctx, f, JS_UNDEFINED, hasArg ? 1 : 0, hasArg ? &arg : nullptr);
  if (JS_IsException(r)) { JSValue ex = JS_GetException(e.ctx); report(e.ctx, ex); JS_FreeValue(e.ctx, ex); return false; }
  JS_FreeValue(e.ctx, r);
  return drain(e);
}

// the host loop's events (zinc:osc, a fetch's answer) through the prelude's __pollHost, then the native modules' pollers and what they
// queued. The pollers come last: a native operation the host events started (a child spawned once a fetch settled) takes its loop
// reference in this same turn, so the run loop sees it pending instead of ending the program
bool nativeTurn(Engine& e) {
  JSValue poll = global(e, "__pollHost");
  const bool ok = callFn(e, poll, JS_UNDEFINED, false);
  JS_FreeValue(e.ctx, poll);
  if (!ok) return false;
  if (e.worker) return true;   // the native registry is the main program's (D183)
  zn_native_poll(0);
  return zn_native_drain() == 0 || drain(e);
}

bool wantsFrames(Engine& e) { JSValue cb = global(e, "__zincFrameCb"); const bool yes = JS_IsFunction(e.ctx, cb); JS_FreeValue(e.ctx, cb); return yes; }

// Date.now's origin: the wall clock when the program starts, or 0 in deterministic mode (the rule of zrt's det_init), so Date.now gives Unix
// milliseconds as on the typed engine and the virtual clock in a test
long long wallBaseMs() {
  auto set = [](const char* k) { const char* v = std::getenv(k); return v && *v; };
  const char* d = std::getenv("ZINC_DETERMINISTIC");
  if (set("ZINC_REPLAY") || set("ZINC_RECORD") || (d && *d && *d != '0')) return 0;
  return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
}

void hostCall(zn::Rt id, HostArg* r, const HostArg* a = nullptr) { (zn::isLayoutRow(id) ? zn::host::hostLayout : zn::isSysRow(id) ? zn::host::hostSys : zn::host::hostGfx)(static_cast<int>(id), a, r); }

// the frame loop of a zinc:gfx program: poll, clock, due timers, begin, the callback, end (what the typed engine's __gfxLoop does)
bool frameLoop(Engine& e) {
  HostArg r;
  hostCall(zn::Rt::HostGfxFrames, &r);
  const long frames = static_cast<long>(r.i);
  JSValue setClock = global(e, "__setClock"), due = global(e, "__dueTimer"), cb = global(e, "__zincFrameCb"), clockFn = global(e, "__clock");
  double clock = 0;   // goes on from where the timers before the first frame left the virtual clock (onFrame after an awaited timer, ZN-566)
  { JSValue c = JS_Call(e.ctx, clockFn, JS_UNDEFINED, 0, nullptr); JS_ToFloat64(e.ctx, &clock, c); JS_FreeValue(e.ctx, c); }
  bool ok = true;
  long drawn = 0;
  // one frame; false when it failed or the program asks to quit. The window HAL may draw frames from inside the poll while macOS holds the
  // loop in a live resize (zn::host::redraw, armed for the poll only): they are this same step, one level down.
  static std::function<bool()>* redrawStep = nullptr;
  std::function<bool()> step = [&]() -> bool {
    HostArg r;
    std::fflush(stdout);   // what the program printed reaches a file or a pipe at each turn, as on the typed engine (ZN-638)
    std::function<bool()>* saved = redrawStep;
    redrawStep = &step;
    zn::host::redraw = [] { if (std::function<bool()>* s = redrawStep) { redrawStep = nullptr; (*s)(); redrawStep = s; } };
    hostCall(zn::Rt::HostGfxPoll, &r);
    redrawStep = saved;
    if (!ok || !nativeTurn(e)) return false;
    HostArg paused;
    hostCall(zn::Rt::HostGfxPaused, &paused);
    if (paused.i != 0) {   // the inspector pauses the program (src/host/gfx_host.cpp): no timer, no clock time, zinc:devtools' pumps, the frame kept or drawn again with dt 0
      JSValue pf = global(e, "__zincPausedFrame");
      if (JS_IsFunction(e.ctx, pf)) ok = callFn(e, pf, JS_UNDEFINED, false);
      JS_FreeValue(e.ctx, pf);
      hostCall(zn::Rt::HostGfxBegin, &r);
      if (ok && paused.i == 2 && JS_IsFunction(e.ctx, cb)) { JSValue dv = JS_NewFloat64(e.ctx, 0); ok = callFn(e, cb, dv, true); JS_FreeValue(e.ctx, dv); }
      hostCall(zn::Rt::HostGfxEnd, &r);
      hostCall(zn::Rt::HostGfxShouldQuit, &r);
      return ok && !r.i;
    }
    double dt = r.d;
    clock += dt * 1000;
    JSValue cv = JS_NewFloat64(e.ctx, clock);
    JS_FreeValue(e.ctx, JS_Call(e.ctx, setClock, JS_UNDEFINED, 1, &cv));
    JS_FreeValue(e.ctx, cv);
    for (;;) {  // timers due at the new clock fire in order of time then creation
      JSValue now = JS_NewFloat64(e.ctx, clock);
      JSValue fn = JS_Call(e.ctx, due, JS_UNDEFINED, 1, &now);
      JS_FreeValue(e.ctx, now);
      if (JS_IsNull(fn) || JS_IsException(fn)) { JS_FreeValue(e.ctx, fn); break; }
      ok = callFn(e, fn, JS_UNDEFINED, false);
      JS_FreeValue(e.ctx, fn);
      if (!ok) return false;
    }
    hostCall(zn::Rt::HostGfxBegin, &r);
    if (JS_IsFunction(e.ctx, cb)) { JSValue dv = JS_NewFloat64(e.ctx, dt); ok = callFn(e, cb, dv, true); JS_FreeValue(e.ctx, dv); }
    hostCall(zn::Rt::HostGfxEnd, &r);
    JSValue g = JS_GetGlobalObject(e.ctx);
    JS_SetPropertyStr(e.ctx, g, "__zincFrameNo", JS_NewInt32(e.ctx, static_cast<int32_t>(++drawn)));
    JS_FreeValue(e.ctx, g);
    hostCall(zn::Rt::HostGfxShouldQuit, &r);
    return ok && !r.i;
  };
  for (long f = 0; f < frames && step(); ++f) {}
  zn::host::redraw = nullptr;
  hostCall(zn::Rt::HostGfxFinish, &r);
  JS_FreeValue(e.ctx, setClock); JS_FreeValue(e.ctx, due); JS_FreeValue(e.ctx, cb); JS_FreeValue(e.ctx, clockFn);
  return ok;
}

// no frame loop yet: timers in order, the clock jumping to each, until none is left or the program asks for frames (onFrame after an await, ZN-566)
bool timerLoop(Engine& e) {
  JSValue next = global(e, "__nextTimer"), due = global(e, "__dueTimer"), clockFn = global(e, "__clock"), setClock = global(e, "__setClock");
  bool ok = true;
  while (ok && !wantsFrames(e)) {
    std::fflush(stdout);   // as in the frame loop
    if (e.worker && zn::host::workerBridge.stopping()) break;   // terminate()
    if (!nativeTurn(e)) { ok = false; break; }
    JSValue fn;
    if ((!e.worker && zn_native_pending() > 0) || zn::loop::active()) {   // a native operation or a host one (a server listening, a fetch) is in flight: the clock follows the wall clock, so its answer comes before a later timer
      double clock = 0;
      JSValue c = JS_Call(e.ctx, clockFn, JS_UNDEFINED, 0, nullptr);
      JS_ToFloat64(e.ctx, &clock, c);
      JS_FreeValue(e.ctx, c);
      JSValue now = JS_NewFloat64(e.ctx, clock);
      fn = JS_Call(e.ctx, due, JS_UNDEFINED, 1, &now);
      if (JS_IsNull(fn)) {
        if (e.worker) zn::host::workerBridge.idleWait();   // nothing to do: a deterministic parent may go on (src/rt/worker.cpp)
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
        JSValue cv = JS_NewFloat64(e.ctx, clock + 1);
        JS_FreeValue(e.ctx, JS_Call(e.ctx, setClock, JS_UNDEFINED, 1, &cv));
        continue;
      }
    } else fn = JS_Call(e.ctx, next, JS_UNDEFINED, 0, nullptr);   // nothing else can happen: the clock jumps to the next timer
    if (JS_IsNull(fn) || JS_IsException(fn)) { JS_FreeValue(e.ctx, fn); break; }
    ok = callFn(e, fn, JS_UNDEFINED, false);
    JS_FreeValue(e.ctx, fn);
  }
  JS_FreeValue(e.ctx, next); JS_FreeValue(e.ctx, due); JS_FreeValue(e.ctx, clockFn); JS_FreeValue(e.ctx, setClock);
  return ok;
}

// the walk of `collect`: the engine's own resolution, each module recorded with its transformed text
struct Walk { Engine e; std::vector<Collected> mods; std::map<std::string, std::size_t> at; };

char* walkName(JSContext* ctx, const char* base, const char* name, void* opaque) {
  auto* w = static_cast<Walk*>(opaque);
  char* r = normalizeName(ctx, base, name, &w->e);
  if (auto it = w->at.find(base); it != w->at.end() && r) w->mods[it->second].deps.push_back({name, r});
  return r;
}

JSModuleDef* walkLoad(JSContext* ctx, const char* name, void* opaque) {
  auto* w = static_cast<Walk*>(opaque);
  Collected c;
  c.name = name;
  c.host = c.name == "zinc:native";
  c.bare = (c.name.rfind("zinc:", 0) != 0 && c.name[0] != '/' && c.name[0] != '.') || c.name.find("/node_modules/") != std::string::npos || w->e.packageFiles.count(c.name);   // a package (CommonJS too): the linker reads it
  std::string err;
  if (c.bare) c.js = "export {};";
  else if (!moduleText(w->e, c.name, c.js, err)) { JS_ThrowReferenceError(ctx, "%s", err.c_str()); return nullptr; }
  w->at[c.name] = w->mods.size();
  w->mods.push_back(c);
  const std::string& js = w->mods.back().js;
  JSValue v = JS_Eval(ctx, js.data(), js.size(), name, JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);   // a syntax error is reported here, before the linker
  if (JS_IsException(v)) return nullptr;
  auto* m = static_cast<JSModuleDef*>(JS_VALUE_GET_PTR(v));
  JS_FreeValue(ctx, v);
  return m;
}

std::string exceptionText(JSContext* ctx) {
  JSValue ex = JS_GetException(ctx);
  const char* m = JS_ToCString(ctx, ex);
  JSValue st = JS_GetPropertyStr(ctx, ex, "stack");
  const char* stack = JS_IsUndefined(st) ? nullptr : JS_ToCString(ctx, st);
  std::string r = std::string(m ? m : "error") + (stack && *stack ? "\n" + std::string(stack) : "");
  if (stack) JS_FreeCString(ctx, stack);
  if (m) JS_FreeCString(ctx, m);
  JS_FreeValue(ctx, st);
  JS_FreeValue(ctx, ex);
  while (!r.empty() && r.back() == '\n') r.pop_back();
  return r;
}

}  // namespace

bool collect(const std::string& entry, const std::string& stdRoot, const std::string& cacheDir, std::vector<Collected>& mods, std::string& err, const std::string& program, const std::string& modules) {
  Walk w;
  w.e.modules = modules;
  w.e.stdRoot = w.e.res.stdRoot = stdRoot;
  w.e.cacheDir = cacheDir;
  w.e.entry = program.empty() ? entry : program;
  {   // importmap.json next to the entry, as run reads it
    std::string text, dir = dirOf(w.e.entry);
    if (readFile(dir + "/importmap.json", text)) {
      yyjson_doc* doc = yyjson_read(text.data(), text.size(), 0);
      yyjson_val* im = doc ? yyjson_obj_get(yyjson_doc_get_root(doc), "imports") : nullptr;
      size_t i, n; yyjson_val *k, *v;
      if (im && yyjson_is_obj(im)) yyjson_obj_foreach(im, i, n, k, v) if (yyjson_is_str(v)) w.e.imports[yyjson_get_str(k)] = normalize(yyjson_get_str(v)[0] == '/' ? std::string(yyjson_get_str(v)) : dir + "/" + yyjson_get_str(v));
      yyjson_doc_free(doc);
    }
  }
  JSRuntime* rt = JS_NewRuntime();
  JSContext* ctx = JS_NewContext(rt);
  JS_SetModuleLoaderFunc(rt, walkName, walkLoad, &w);
  Collected c;
  c.name = entry;
  bool ok = moduleText(w.e, entry, c.js, err);
  if (ok) {
    w.at[entry] = 0;
    w.mods.push_back(c);
    JSValue mv = JS_Eval(ctx, c.js.data(), c.js.size(), entry.c_str(), JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);
    ok = !JS_IsException(mv) && JS_ResolveModule(ctx, mv) >= 0;   // loads every static import through walkLoad
    if (!ok) err = exceptionText(ctx);
    JS_FreeValue(ctx, mv);
  }
  JS_FreeContext(ctx);
  JS_FreeRuntime(rt);
  mods = std::move(w.mods);
  return ok;
}

bool compileBytecode(const std::string& js, const std::string& name, std::string& bytes, std::string& err) {
  JSRuntime* rt = JS_NewRuntime();
  JSContext* ctx = JS_NewContext(rt);
  JS_SetModuleLoaderFunc(rt, nullptr, [](JSContext* c, const char* mod, void*) -> JSModuleDef* {   // a bundle imports zinc:native only; it is not written with it
    const std::string src = std::strcmp(mod, "zinc:native") ? "" : kNativeModule;
    JSValue v = JS_Eval(c, src.data(), src.size(), mod, JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);
    if (JS_IsException(v)) return nullptr;
    auto* m = static_cast<JSModuleDef*>(JS_VALUE_GET_PTR(v));
    JS_FreeValue(c, v);
    return m;
  }, nullptr);
  JSValue m = JS_Eval(ctx, js.data(), js.size(), name.c_str(), JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);
  bool ok = !JS_IsException(m);
  if (!ok) err = exceptionText(ctx);
  else {
    size_t n = 0;
    uint8_t* b = JS_WriteObject(ctx, &n, m, JS_WRITE_OBJ_BYTECODE | JS_WRITE_OBJ_STRIP_SOURCE);   // the lines stay (debug info): the traces keep their positions
    if (b) { bytes.assign(reinterpret_cast<char*>(b), n); js_free(ctx, b); } else { ok = false; err = exceptionText(ctx); }
  }
  JS_FreeValue(ctx, m);
  JS_FreeContext(ctx);
  JS_FreeRuntime(rt);
  return ok;
}

namespace {

// A context on e.rt with the host calls, zinc:worker's globals, the native modules (not in a worker), the prelude, the web shims and the defines.
bool context(Engine& e, const std::string& mainDir) {
  e.ctx = JS_NewContext(e.rt);
  JS_SetMemoryLimit(e.rt, 0);
  if (const std::size_t n = stackBudget()) JS_SetMaxStackSize(e.rt, n);
  JS_SetHostPromiseRejectionTracker(e.rt, trackRejection, &e);
  JS_SetModuleLoaderFunc(e.rt, normalizeName, loadModule, &e);
  installHost(e.ctx);
  installWorker(e.ctx, mainDir);
  if (!e.worker) {
    installNative(zn::qjs::napiEnv(e.ctx));
    zn::qjs::runContextHooks(zn::qjs::napiEnv(e.ctx));   // native classes of other modules (WebGL), ZN-203.03
  }
  JSValue pre = JS_Eval(e.ctx, kPrelude, std::strlen(kPrelude), "<prelude>", JS_EVAL_TYPE_GLOBAL);
  if (JS_IsException(pre)) { JSValue ex = JS_GetException(e.ctx); report(e.ctx, ex); return false; }
  JS_FreeValue(e.ctx, pre);
  JSValue shims = JS_Eval(e.ctx, kWebShims, std::strlen(kWebShims), "<web-shims>", JS_EVAL_TYPE_GLOBAL);
  if (JS_IsException(shims)) { JSValue ex = JS_GetException(e.ctx); report(e.ctx, ex); return false; }
  JS_FreeValue(e.ctx, shims);
  {   // what a bundle has folded in (zinc bundle --define), as globals: the same program runs bundled or not
    const std::string caps = capsJson(e.stdRoot + "/../../targets/capabilities.json");
    const std::string defs = "globalThis.__ZINC_ENGINE__ = 'quickjs'; globalThis.__ZINC_CAPS__ = " + caps +
                             "; globalThis.__ZINC_TARGET__ = __ZINC_CAPS__.TARGET; globalThis.__ZINC_PROFILE__ = __ZINC_CAPS__.PROFILE;" +
                             "globalThis.__zincWallBase = " + std::to_string(wallBaseMs()) + ";";
    JS_FreeValue(e.ctx, JS_Eval(e.ctx, defs.data(), defs.size(), "<defines>", JS_EVAL_TYPE_GLOBAL));
  }
  return true;
}

const Engine* gMain = nullptr;   // the main program's engine: a worker loads its modules the same way (set before any worker starts, then only read)

}  // namespace

bool runWorker(const std::string& entry, std::string& error) {
  Engine e;
  e.worker = true;
  if (gMain) { e.stdRoot = e.res.stdRoot = gMain->stdRoot; e.cacheDir = gMain->cacheDir; e.imports = gMain->imports; e.modules = gMain->modules; }
  e.entry = entry;
  tWorkerError = &error;
  e.rt = JS_NewRuntime();
  JS_SetInterruptHandler(e.rt, [](JSRuntime*, void*) { return zn::host::workerBridge.stopping() ? 1 : 0; }, nullptr);   // terminate() stops a busy loop too
  bool ok = context(e, "");
  JSValue res = JS_UNDEFINED;
  if (ok) {
    std::string js, err;
    if (!moduleText(e, entry, js, err)) { error = err; ok = false; }
    else {
      JSValue mod = JS_Eval(e.ctx, js.data(), js.size(), entry.c_str(), JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);
      if (!JS_IsException(mod)) setMeta(e.ctx, static_cast<JSModuleDef*>(JS_VALUE_GET_PTR(mod)), entry);
      res = JS_IsException(mod) ? mod : JS_EvalFunction(e.ctx, mod);
      if (JS_IsException(res)) { JSValue ex = JS_GetException(e.ctx); report(e.ctx, ex); JS_FreeValue(e.ctx, ex); ok = false; }
      else {
        e.entryPromise = JS_VALUE_GET_PTR(res);
        ok = drain(e) && timerLoop(e);
      }
    }
  }
  std::fflush(stdout);
  tWorkerError = nullptr;
  JS_FreeValue(e.ctx, res);
  for (const Engine::Rejection& x : e.rejected) { JS_FreeValue(e.ctx, x.promise); JS_FreeValue(e.ctx, x.reason); }
  JS_FreeContext(e.ctx);
  JS_FreeRuntime(e.rt);
  return ok || !error.empty() ? ok : (error = "the worker failed", false);
}

int run(const Options& o) {
  const auto startedAt = std::chrono::steady_clock::now();
  zn::log::step("context", "initialise QuickJS and host services...");
  Engine e;
  e.stdRoot = e.res.stdRoot = o.stdRoot;
  e.cacheDir = o.cacheDir;
  zn_lre_delegate(qjs_lre_realloc, qjs_lre_check_timeout, qjs_lre_check_stack_overflow);
  e.rt = JS_NewRuntime();
#ifdef ZN_QJS_PROFILE
  if (o.profileHz || std::getenv("ZN_QJS_DUMP")) profileStart(e.rt, o.profileHz);   // a dump alone (tools/qjs2c) prints no report
#endif
  std::string entry = o.entry;
  if (!entry.empty() && !pathAbs(entry)) { char b[4096]; if (getcwd(b, sizeof b)) entry = normalize(std::string(b) + "/" + entry); }
  if (!context(e, dirOf(entry))) return 101;
  static ZnResourceStatsRegistration heap("js.heap", [](void* rt) {   // the inspector's Info view, as the other engines' (src/engine)
    JSMemoryUsage u;
    JS_ComputeMemoryUsage(static_cast<JSRuntime*>(rt), &u);
    return ZnResourceStats{static_cast<uint64_t>(u.obj_count), static_cast<uint64_t>(u.malloc_size), 0, 0, 0};
  }, e.rt);
  gMain = &e;
  // a bundle's bytecode (zinc build, zinc export, zinc bundle --bytecode): <name>.qbc beside <name>.js runs instead of the source while it is not
  // older than the bundle and this QuickJS reads it (its version byte and checksum); otherwise the bundle runs, with no error (ZN-773.09)
  std::string qbc;
  {
    std::error_code ec;
    const bool named = endsWith(entry, ".qbc");
    const std::string stem = entry.substr(0, entry.size() - (named ? 4 : endsWith(entry, ".js") ? 3 : 0));
    if (named && !std::filesystem::exists(stem + ".js", ec)) qbc = entry;   // a .qbc alone runs as before: no source to fall back to
    else if (stem.size() < entry.size()) {
      entry = stem + ".js";
      if (std::filesystem::exists(stem + ".qbc", ec) && std::filesystem::last_write_time(stem + ".qbc", ec) >= std::filesystem::last_write_time(entry, ec) && !ec) qbc = stem + ".qbc";
    }
  }
  e.entry = entry;
  if (!webEnv(e.ctx, e.stdRoot, entry)) return 101;
  {   // importmap.json next to the entry: {"imports": {"three": "../../third_party/three/build/three.module.js"}} (paths relative to the file)
    std::string text, dir = dirOf(entry);
    if (readFile(dir + "/importmap.json", text)) {
      yyjson_doc* doc = yyjson_read(text.data(), text.size(), 0);
      yyjson_val* im = doc ? yyjson_obj_get(yyjson_doc_get_root(doc), "imports") : nullptr;
      size_t i, n; yyjson_val *k, *v;
      if (im && yyjson_is_obj(im)) yyjson_obj_foreach(im, i, n, k, v) if (yyjson_is_str(v)) e.imports[yyjson_get_str(k)] = normalize(yyjson_get_str(v)[0] == '/' ? std::string(yyjson_get_str(v)) : dir + "/" + yyjson_get_str(v));
      yyjson_doc_free(doc);
    }
  }
  int rc = 0;
  std::string js, err;
  JSValue stage = JS_UNDEFINED;   // zinc.json "loading" (ZN-447): the loader stage runs before the entry's modules, as on the typed engines
  if (const zn::frontend::LoaderStage& st = zn::frontend::loaderStage(); !st.source.empty()) {
    if (!moduleText(e, st.path, js, err)) { std::fprintf(stderr, "%s\n", err.c_str()); return 101; }
    JSValue m = JS_Eval(e.ctx, js.data(), js.size(), st.path.c_str(), JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);
    stage = JS_IsException(m) ? m : JS_EvalFunction(e.ctx, m);
    if (JS_IsException(stage)) { JSValue ex = JS_GetException(e.ctx); report(e.ctx, ex); JS_FreeValue(e.ctx, ex); return 101; }
    e.entryPromise = JS_VALUE_GET_PTR(stage);   // a throw in the stage rejects its module's promise: reported as the entry's would be
    if (!drain(e)) { JS_FreeValue(e.ctx, stage); return 101; }
  }
  zn::log::step("load", zn::log::shortPath(entry));
  JSValue mod = JS_EXCEPTION;
  if (!qbc.empty()) {   // no parse
    const bool alone = endsWith(entry, ".qbc");
    if (!readFile(qbc, js)) { if (alone) { std::fprintf(stderr, "cannot read %s\n", qbc.c_str()); return 101; } }
    else mod = JS_ReadObject(e.ctx, reinterpret_cast<const uint8_t*>(js.data()), js.size(), JS_READ_OBJ_BYTECODE);
    if (!JS_IsException(mod) && JS_ResolveModule(e.ctx, mod) < 0) { JS_FreeValue(e.ctx, mod); mod = JS_EXCEPTION; }
    gMapFile = qbc.substr(0, qbc.size() - 4) + ".js";   // that bundle's source map
    if (!JS_IsException(mod)) {
      auto* m = static_cast<JSModuleDef*>(JS_VALUE_GET_PTR(mod));
      const JSAtom atom = JS_GetModuleName(e.ctx, m);   // the bundle's path when it was compiled: its frames name it
      if (const char* name = JS_AtomToCString(e.ctx, atom)) { gTraceName = name; JS_FreeCString(e.ctx, name); }
      JS_FreeAtom(e.ctx, atom);
      setMeta(e.ctx, m, gMapFile);
      zn::log::step("bytecode", zn::log::shortPath(qbc) + " instead of the source");
    } else if (!alone) {   // stale (another QuickJS) or damaged: the source
      JS_FreeValue(e.ctx, JS_GetException(e.ctx));
      zn::log::step("bytecode", zn::log::shortPath(qbc) + " not readable by this QuickJS, the source instead");
    }
    if (!readFile(gMapFile + ".map", gMapJson)) gMapJson.clear();
  }
  if (qbc.empty() || (JS_IsException(mod) && !endsWith(entry, ".qbc"))) {   // the source
    if (!moduleText(e, entry, js, err)) { std::fprintf(stderr, "%s\n", err.c_str()); return 101; }
    if (readFile(entry + ".map", gMapJson)) gMapFile = entry;
    mod = JS_Eval(e.ctx, js.data(), js.size(), entry.c_str(), JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);
    if (!JS_IsException(mod)) setMeta(e.ctx, static_cast<JSModuleDef*>(JS_VALUE_GET_PTR(mod)), entry);
  }
  if (JS_IsException(mod)) { JSValue ex = JS_GetException(e.ctx); report(e.ctx, ex); JS_FreeValue(e.ctx, ex); return 101; }
  zn::log::step("run", "QuickJS-ng, executing JavaScript");
  JSValue res = JS_EvalFunction(e.ctx, mod);  // links the imports through the loader, then runs; a promise (top-level await)
  if (JS_IsException(res)) { JSValue ex = JS_GetException(e.ctx); report(e.ctx, ex); JS_FreeValue(e.ctx, ex); rc = 101; }
  else {
    e.entryPromise = JS_VALUE_GET_PTR(res);   // kept to the end, so no other promise takes its address: drain reports its rejection, now or after a top-level await
    if (!(drain(e) && timerLoop(e) && (!wantsFrames(e) || frameLoop(e)))) rc = 101;
    JS_FreeValue(e.ctx, res);
  }
  JS_FreeValue(e.ctx, stage);
  zn::host::workerBridge.shutdown();   // the workers it started end with it
  gMain = nullptr;
  std::fflush(stdout);
  zn::log::step("exit", "QuickJS-ng, status " + std::to_string(rc), zn::log::since(startedAt));
  return rc;
}

}  // namespace zn::qjs
