#include "yyjson.h"
#include <map>
#include "qjs/qjs.h"
#include "zn/js_ext.h"
#include "zn/log.h"

#include <algorithm>
#include <array>
#include <functional>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <pthread.h>
#include <sstream>
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
  std::vector<zn::frontend::FoundPlugin> plugins;   // found at the first zinc: specifier that is no standard module (ZN-583.02)
  bool pluginsFound = false;
  struct Rejection { JSValue promise, reason; };
  std::vector<Rejection> rejected;   // promises rejected with no handler yet: reported once the jobs have drained, when nobody caught them (ZN-566)
  void* entryPromise = nullptr;      // the entry module's own promise: its rejection is the program's uncaught exception
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

std::string dirOf(const std::string& p) { auto k = p.find_last_of('/'); return k == std::string::npos ? "" : p.substr(0, k); }
// An absolute path for the resolver's tests: a POSIX '/accessories start' or a Windows drive letter ('C:' — the paths
// arrive as they came: backslashes from std::filesystem, forward slashes from the usual joins)
static bool pathAbs(const std::string& p) {
  if (p.empty()) return false;
  if (p[0] == '/') return true;
  if (p.size() > 1 && (p[0] >= 'a' && p[0] <= 'z' || p[0] >= 'A' && p[0] <= 'Z') && p[1] == ':') return true;
  return false;
}
std::string normalize(const std::string& p) {
  // both separators split; backslashes become forward slashes (the output is a plain join, Windows accepts '/') and a
  // Windows drive's "C:" survives as the root (".." cannot cross it)
  std::string plain;
  plain.reserve(p.size());
  for (char c : p) plain += c == '\\' ? '/' : c;
  const bool winDrive = plain.size() > 1 && (plain[0] >= 'a' && plain[0] <= 'z' || plain[0] >= 'A' && plain[0] <= 'Z') && plain[1] == ':';
  bool abs = !plain.empty() && plain[0] == '/';
  std::vector<std::string> parts;
  std::stringstream ss(plain);
  std::string seg;
  while (std::getline(ss, seg, '/')) {
    if (seg.empty() || seg == ".") continue;
    if (seg == ".." && !parts.empty() && parts.back() != "..") parts.pop_back(); else parts.push_back(seg);
  }
  std::string r = winDrive ? plain.substr(0, 2) + "/" : abs ? "/" : "";
  for (std::size_t i = winDrive ? 1 : 0; i < parts.size(); ++i) r += (i ? "/" : "") + parts[i];
  return r;
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

bool moduleText(Engine& e, const std::string& name, std::string& js, std::string& err) {
  std::string src, path = name;
  if (name == "zinc:native") { js = kNativeModule; return true; }   // plain JavaScript: nothing to strip
  if (const zn::frontend::LoaderStage& st = zn::frontend::loaderStage(); !st.source.empty() && name == st.path) return stripTypes(st.source, name, js, err);   // ZN-447
  if (name.rfind("zinc:", 0) == 0) {
    if (name == "zinc:gfx") src = gfxSource();
    else if (name == "zinc:platform") src = zn::frontend::platformModule(e.stdRoot + "/../../targets/capabilities.json");
    else if (name == "zinc:icons/lucide") src = zn::frontend::lucideModule(e.entry, e.stdRoot + "/../../next/third_party/lucide/icon-nodes.json");
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
  const std::string file = name.rfind("zinc:", 0) == 0 && !endsWith(path, ".tsx") ? name : path;
  // ponytail: the cache is never pruned (one small file per version of a module); prune by age if ~/.zinc/cache/qjs grows
  // the transform stage of the bundler (.tsx too), cached by content: the source, its name and what the transform reads besides (the UI preset and
  // layout of zinc.json, this build of the engine)
  std::string cached;
  if (!e.cacheDir.empty()) {
    std::uint64_t h = 1469598103934665603ull;
    for (const std::string& part : {src, file, zn::frontend::uiPreset(), zn::frontend::uiLayout(), std::string(__DATE__ __TIME__), std::string(std::getenv("ZINC_WEB_HOT") ? "hot" : ""), std::string(zn::frontend::currentProfile() ? zn::frontend::currentProfile()->name : "")})
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
    const std::string tmp = cached + "." + std::to_string(getpid());
    { std::ofstream out(tmp, std::ios::binary); out << js; }
    std::filesystem::rename(tmp, cached, ec);
  }
  return true;
}

// The entry file of the plugin that provides a module ('zinc:physics3d' -> plugins/physics3d/index.ts), "" when none does: the engine's plugins,
// the project's, then its pluginDirs, as for the typed engines. A plugin's files are then ordinary modules; its native code comes through zinc:native.
std::string pluginEntry(Engine& e, const std::string& name) {
  if (e.stdRoot.empty() || name == "zinc:native" || zn::frontend::builtinModuleSource(name)) return "";   // a plugin wins over lib/std, as in the typed loader (zinc:system/*)
  if (!e.pluginsFound) {
    e.pluginsFound = true;
    std::vector<std::string> problems;
    const std::string pf = zn::frontend::findProjectFile(e.entry);
    e.plugins = zn::frontend::discoverPlugins(e.stdRoot + "/../..", pf.empty() ? dirOf(e.entry) : dirOf(pf), problems);
  }
  for (const zn::frontend::FoundPlugin& p : e.plugins) if (p.manifest.kind == "module" && p.manifest.module == name) return normalize(p.dir + "/" + p.manifest.entry);
  for (const zn::frontend::FoundPlugin& p : e.plugins)   // `modules` of plugin.json: the other specifiers it answers (three/addons/..., zinc:3d/gltf)
    if (p.manifest.kind == "module") if (auto it = p.manifest.aliases.find(name); it != p.manifest.aliases.end()) return normalize(p.dir + "/" + it->second);
  return "";
}

bool isFile(const std::string& p) { std::error_code ec; return std::filesystem::is_regular_file(p, ec); }

// The file a path names, as written or with the extensions the typed loader tries; "" when none is there.
std::string probe(const std::string& path) {
  std::string stem = path;
  for (const char* js : {".js", ".mjs"}) if (endsWith(stem, js)) { stem.resize(stem.size() - std::strlen(js)); break; }
  for (const std::string& c : {path, path + ".ts", path + ".tsx", path + ".js", path + ".mjs", path + "/index.ts", path + "/index.tsx", path + "/index.js", stem + ".ts", stem + ".tsx"})
    if (isFile(c)) return c;
  return "";
}

// `paths` of the nearest tsconfig.json above `dir` (`three`, `inferno`, `@pocketjs/framework/solid`...), as the typed loader maps them
std::string byTsconfig(const std::string& dir, const std::string& spec) {
  for (std::string d = dir; !d.empty(); d = dirOf(d)) {
    std::string text;
    if (!readFile(d + "/tsconfig.json", text)) continue;
    zn::frontend::TsConfig cfg;
    std::string err, matched;
    if (!zn::frontend::parseTsConfig(text, cfg, err)) return "";
    const std::string root = cfg.baseUrl.empty() ? d : normalize(d + "/" + cfg.baseUrl);
    for (const std::string& t : zn::frontend::mapSpecifier(cfg, spec, matched)) if (std::string f = probe(normalize(root + "/" + t)); !f.empty()) return f;
    return "";
  }
  return "";
}

// A package of node_modules above `dir`, as Node and the bundlers find it: `pkg/sub/path` as a file, else package.json "exports" (".": a string or
// the "import" / "module" / "default" condition), "module", "main", index.js. A CommonJS package is found but only the linker (zinc bundle) runs it.
std::string byNodeModules(const std::string& dir, const std::string& spec) {
  const std::size_t cut = spec[0] == '@' ? spec.find('/', spec.find('/') + 1) : spec.find('/');
  const std::string pkg = spec.substr(0, cut), sub = cut == std::string::npos ? "" : spec.substr(cut + 1);
  for (std::string d = dir; !d.empty(); d = dirOf(d)) {
    const std::string root = d + "/node_modules/" + pkg;
    std::error_code ec;
    if (!std::filesystem::is_directory(root, ec)) continue;
    if (!sub.empty()) {   // pkg/sub/path: package.json "exports" ("./sub/path", or a "./*" pattern) first, else the file
      std::string text0;
      if (readFile(root + "/package.json", text0)) {
        yyjson_doc* doc = yyjson_read(text0.data(), text0.size(), 0);
        yyjson_val* ex = doc ? yyjson_obj_get(yyjson_doc_get_root(doc), "exports") : nullptr;
        yyjson_val* hit = yyjson_is_obj(ex) ? yyjson_obj_get(ex, ("./" + sub).c_str()) : nullptr;
        std::string rep;
        size_t i, n; yyjson_val *k, *v;
        if (!hit && yyjson_is_obj(ex)) yyjson_obj_foreach(ex, i, n, k, v) {
          const std::string key = yyjson_get_str(k);
          const std::size_t star = key.find('*');
          const std::string want = "./" + sub;
          if (star == std::string::npos || want.size() < key.size() - 1 || want.compare(0, star, key, 0, star) != 0 || want.compare(want.size() - (key.size() - star - 1), std::string::npos, key, star + 1, std::string::npos) != 0) continue;
          hit = v;
          rep = want.substr(star, want.size() - (key.size() - 1));
          break;
        }
        for (int depth = 0; depth < 4 && yyjson_is_obj(hit); ++depth) {
          yyjson_val* c = nullptr;
          for (const char* kk : {"import", "module", "default"}) if ((c = yyjson_obj_get(hit, kk))) break;
          hit = c;
        }
        std::string target = yyjson_is_str(hit) ? yyjson_get_str(hit) : "";
        yyjson_doc_free(doc);
        for (std::size_t at; !rep.empty() && (at = target.find('*')) != std::string::npos;) target.replace(at, 1, rep);
        if (!target.empty()) if (std::string f = probe(normalize(root + "/" + target)); !f.empty()) return f;
      }
      return probe(root + "/" + sub);
    }
    std::string text, main;
    if (readFile(root + "/package.json", text)) {
      yyjson_doc* doc = yyjson_read(text.data(), text.size(), 0);
      yyjson_val* j = doc ? yyjson_doc_get_root(doc) : nullptr;
      yyjson_val* ex = j ? yyjson_obj_get(j, "exports") : nullptr;
      if (yyjson_is_obj(ex) && yyjson_obj_get(ex, ".")) ex = yyjson_obj_get(ex, ".");
      for (int depth = 0; depth < 3 && yyjson_is_obj(ex); ++depth) {   // nested conditions: {"import": {"default": "./x.mjs"}}
        yyjson_val* c = nullptr;
        for (const char* k : {"import", "module", "default"}) if ((c = yyjson_obj_get(ex, k))) break;
        ex = c;
      }
      if (yyjson_is_str(ex)) main = yyjson_get_str(ex);
      for (const char* k : {"module", "main"}) if (main.empty() && j && yyjson_is_str(yyjson_obj_get(j, k))) main = yyjson_get_str(yyjson_obj_get(j, k));
      yyjson_doc_free(doc);
    }
    return probe(normalize(root + "/" + (main.empty() ? "index.js" : main)));
  }
  return "";
}

char* normalizeName(JSContext* ctx, const char* base, const char* name, void* opaque) {
  std::string n = name;
  std::string r = n;
  auto* e = static_cast<Engine*>(opaque);
  std::string dir = dirOf(base);
  if (e && std::string_view(base).rfind("zinc:", 0) == 0) {   // a standard module's own imports (zinc:ui -> ./palette): beside its file
    std::string_view f = zn::frontend::stdModuleFile(base);
    if (!f.empty() && !e->stdRoot.empty()) dir = dirOf(e->stdRoot + "/" + std::string(f));
  }
  if (e) { auto it = e->imports.find(n); if (it != e->imports.end()) r = it->second; }
  if (r == n && (n.rfind("./", 0) == 0 || n.rfind("../", 0) == 0)) {
    r = normalize(dir + "/" + n);
    if (std::string f = probe(r); !f.empty()) r = f;
  } else if (e && r == n && !pathAbs(n)) {   // a bare specifier or a zinc: module: a plugin, then (bare) tsconfig.json paths, the compat packages, node_modules
    std::string f = pluginEntry(*e, n);
    if (f.empty() && n.rfind("zinc:", 0) != 0) {
      f = byTsconfig(dir, n);
      if (std::string_view cm = zn::frontend::compatModuleFile(n); f.empty() && !cm.empty() && !e->stdRoot.empty()) f = normalize(e->stdRoot + "/" + std::string(cm));
      if (f.empty()) f = byNodeModules(dir, n);
    }
    if (!f.empty()) r = f;
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

void report(JSContext* ctx, JSValue ex, const char* what = "Uncaught") {
  const char* s = JS_ToCString(ctx, ex);
  JSValue st = JS_GetPropertyStr(ctx, ex, "stack");
  const char* stack = JS_IsUndefined(st) ? nullptr : JS_ToCString(ctx, st);
  std::fflush(stdout);
  const std::string trace = !stack ? "" : gMapJson.empty() ? stack : mapStack(stack, gMapFile, gMapJson);
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

bool callFn(Engine& e, JSValueConst f, JSValueConst arg, bool hasArg) {
  JSValue r = JS_Call(e.ctx, f, JS_UNDEFINED, hasArg ? 1 : 0, hasArg ? &arg : nullptr);
  if (JS_IsException(r)) { JSValue ex = JS_GetException(e.ctx); report(e.ctx, ex); JS_FreeValue(e.ctx, ex); return false; }
  JS_FreeValue(e.ctx, r);
  return drain(e);
}

bool wantsFrames(Engine& e) { JSValue cb = global(e, "__zincFrameCb"); const bool yes = JS_IsFunction(e.ctx, cb); JS_FreeValue(e.ctx, cb); return yes; }

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
    if (!ok) return false;
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
  JSValue next = global(e, "__nextTimer");
  bool ok = true;
  while (ok && !wantsFrames(e)) {
    std::fflush(stdout);   // as in the frame loop
    JSValue fn = JS_Call(e.ctx, next, JS_UNDEFINED, 0, nullptr);
    if (JS_IsNull(fn) || JS_IsException(fn)) { JS_FreeValue(e.ctx, fn); break; }
    ok = callFn(e, fn, JS_UNDEFINED, false);
    JS_FreeValue(e.ctx, fn);
  }
  JS_FreeValue(e.ctx, next);
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
  c.bare = (c.name.rfind("zinc:", 0) != 0 && c.name[0] != '/' && c.name[0] != '.') || c.name.find("/node_modules/") != std::string::npos;   // a package (CommonJS too): the linker reads it
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

bool collect(const std::string& entry, const std::string& stdRoot, const std::string& cacheDir, std::vector<Collected>& mods, std::string& err) {
  Walk w;
  w.e.stdRoot = stdRoot;
  w.e.cacheDir = cacheDir;
  w.e.entry = entry;
  {   // importmap.json next to the entry, as run reads it
    std::string text, dir = dirOf(entry);
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

int run(const Options& o) {
  const auto startedAt = std::chrono::steady_clock::now();
  zn::log::step("context", "initialise QuickJS and host services...");
  Engine e;
  e.stdRoot = o.stdRoot;
  e.cacheDir = o.cacheDir;
  zn_lre_delegate(qjs_lre_realloc, qjs_lre_check_timeout, qjs_lre_check_stack_overflow);
  e.rt = JS_NewRuntime();
#ifdef ZN_QJS_PROFILE
  if (o.profileHz || std::getenv("ZN_QJS_DUMP")) profileStart(e.rt, o.profileHz);   // a dump alone (tools/qjs2c) prints no report
#endif
  e.ctx = JS_NewContext(e.rt);
  JS_SetMemoryLimit(e.rt, 0);
  if (const std::size_t n = stackBudget()) JS_SetMaxStackSize(e.rt, n);
  JS_SetHostPromiseRejectionTracker(e.rt, trackRejection, &e);
  JS_SetModuleLoaderFunc(e.rt, normalizeName, loadModule, &e);
  installHost(e.ctx);
  installNative(e.ctx);
  zn::qjs::runContextHooks(e.ctx);   // native classes of other modules (WebGL), ZN-203.03
  JSValue pre = JS_Eval(e.ctx, kPrelude, std::strlen(kPrelude), "<prelude>", JS_EVAL_TYPE_GLOBAL);
  if (JS_IsException(pre)) { JSValue ex = JS_GetException(e.ctx); report(e.ctx, ex); return 101; }
  JS_FreeValue(e.ctx, pre);
  JSValue shims = JS_Eval(e.ctx, kWebShims, std::strlen(kWebShims), "<web-shims>", JS_EVAL_TYPE_GLOBAL);
  if (JS_IsException(shims)) { JSValue ex = JS_GetException(e.ctx); report(e.ctx, ex); return 101; }
  JS_FreeValue(e.ctx, shims);
  {   // what a bundle has folded in (zinc bundle --define), as globals: the same program runs bundled or not
    const std::string caps = capsJson(o.stdRoot + "/../../targets/capabilities.json");
    const std::string defs = "globalThis.__ZINC_ENGINE__ = 'quickjs'; globalThis.__ZINC_CAPS__ = " + caps +
                             "; globalThis.__ZINC_TARGET__ = __ZINC_CAPS__.TARGET; globalThis.__ZINC_PROFILE__ = __ZINC_CAPS__.PROFILE;";
    JS_FreeValue(e.ctx, JS_Eval(e.ctx, defs.data(), defs.size(), "<defines>", JS_EVAL_TYPE_GLOBAL));
  }

  std::string entry = o.entry;
  if (!entry.empty() && !pathAbs(entry)) { char b[4096]; if (getcwd(b, sizeof b)) entry = normalize(std::string(b) + "/" + entry); }
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
  JSValue mod;
  if (endsWith(entry, ".qbc")) {   // a bundle's bytecode (zinc bundle --bytecode): no parse; the version check is QuickJS's own
    if (!readFile(entry, js)) { std::fprintf(stderr, "cannot read %s\n", entry.c_str()); return 101; }
    mod = JS_ReadObject(e.ctx, reinterpret_cast<const uint8_t*>(js.data()), js.size(), JS_READ_OBJ_BYTECODE);
    if (!JS_IsException(mod) && JS_ResolveModule(e.ctx, mod) < 0) { JS_FreeValue(e.ctx, mod); mod = JS_EXCEPTION; }
    gMapFile = entry.substr(0, entry.size() - 4) + ".js";   // compiled under the name of its .js: that bundle's source map
    if (!JS_IsException(mod)) setMeta(e.ctx, static_cast<JSModuleDef*>(JS_VALUE_GET_PTR(mod)), gMapFile);
    if (!readFile(gMapFile + ".map", gMapJson)) gMapJson.clear();
  } else {
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
  std::fflush(stdout);
  zn::log::step("exit", "QuickJS-ng, status " + std::to_string(rc), zn::log::since(startedAt));
  return rc;
}

}  // namespace zn::qjs
