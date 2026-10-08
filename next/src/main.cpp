#include "zn/native.h"
#include <chrono>
#include <cstdio>
#include <dlfcn.h>
#include <cstdlib>
#include <filesystem>
#include <cstring>
#include <fstream>
#include <iterator>
#include <vector>
#include <sstream>
#include <string>

#include "frontend/check.h"
#include "frontend/diagnostics.h"
#include "frontend/lexer.h"
#include "frontend/modules.h"
#include "frontend/native_gen.h"
#include "frontend/parser.h"
#include "frontend/plugin_manifest.h"
#include "frontend/project.h"
#include "cli_core.h"
#include "lsp/lsp.h"
#include "frontend/capabilities.h"
#ifdef ZN_WEBGL
#include "gl/webgl_js.h"
#endif
#include "tc/bundle.h"
#include "ir/ir.h"
#include "aot/aot.h"
#include "zn/host.h"
#include "prof/prof.h"
#include "res/res.h"
#include "zn/hostsys.h"
#include "qjs/qjs.h"
#ifdef ZN_HOST_LIBS
#define HOSTLIBS + std::string(" ") + ZN_HOST_LIBS   // the window library the host links
#else
#define HOSTLIBS
#endif
#include "frontend/profile.h"
int runTestCommand(const std::string& self, const zn::frontend::Profile& p, const std::string& engineRoot, std::string dir, const std::string& runner);   // src/test_cmd.cpp
#include "tc/plugin_build.h"
#include "tc/tc.h"
#include "dev/client.h"
#include "dev/core.h"
#include <unistd.h>
#include "vm/vm.h"
#include "zbc/zbc.h"
namespace zn::text { void installSegmenter(); }
#include "vm/vm.h"
#include "vm/vm.h"
#include "zbc/zbc.h"

static const char* const kVersionText = "0.0.1";
static std::string gRoot = ZN_SOURCE_DIR;  // the engine files: the checkout, or the package around the binary (zn::tc::sourceRoot)
static bool readFile(const std::string& path, std::string& out) {
  if (!std::filesystem::is_regular_file(path)) return false;
  std::ifstream in(path, std::ios::binary);
  if (!in) return false;
  std::stringstream buf;
  buf << in.rdbuf();
  out = buf.str();
  return true;
}

// Loads the entry file and the files it imports, checks the program; diagnostics are printed. Returns false on errors.
static std::vector<zn::tc::PluginLib> gPlugins;  // the native plugins built and loaded for this program, for the link line of zinc build
static std::string gProjectDir = ".";
static std::string gBakedSize;   // "WxH" of the board, for the main of a program zinc build writes

// A native module that is not registered: find its plugin (the engine's, the project's, pluginDirs), build it into the cache and load it (ZN-101).
static void installNativeProvider(const char* entry) {
  namespace fs = std::filesystem;
  std::string pf = zn::frontend::findProjectFile(entry);
  gProjectDir = pf.empty() ? fs::absolute(entry).parent_path().string() : fs::path(pf).parent_path().string();
  zn::frontend::gNativeProvider = [](const std::string& module, std::string& err) {
    std::vector<std::string> problems;
    std::string root = gRoot + "/..";
    static std::vector<zn::frontend::FoundPlugin> found;
    found = zn::frontend::discoverPlugins(root, gProjectDir, problems);
    const zn::frontend::FoundPlugin* p = zn::tc::pluginForModule(found, module);
    if (!p) { err = "no plugin provides it (zinc plugins lists them)"; return false; }
    zn::tc::PluginLib lib;
    if (!zn::tc::buildPlugin(*p, gRoot, gProjectDir, zn::tc::pluginTarget(), lib, err)) return false;
    if (!zn::tc::loadPlugin(lib, err)) return false;
    gPlugins.push_back(lib);
    return true;
  };
  zn::frontend::gNativePreferred = [](const std::string& module) {
    const char* det = std::getenv("ZINC_DETERMINISTIC");
    if (!det || !*det || !std::strcmp(det, "0")) return true;
    std::vector<std::string> problems;
    auto found = zn::frontend::discoverPlugins(gRoot + "/..", gProjectDir, problems);
    const zn::frontend::FoundPlugin* p = zn::tc::pluginForModule(found, module);
    return p && p->manifest.deterministic;
  };
}

// A display driver (zinc.json `display`, the board's, or ZINC_DISPLAY): build its plugin into the cache and load it, so that it registers with the HAL (ZN-104). Not in a headless or
// deterministic run (golden tests, captures) unless the driver was asked for with ZINC_DISPLAY. A driver that cannot be built is reported and the host window keeps the screen.
static void installDisplayDriver(const std::string& projectDir, const char* entry) {
  namespace fs = std::filesystem;
  auto set = [](const char* n) { const char* v = std::getenv(n); return v && *v && *v != '0'; };
  bool headless = set("ZINC_HEADLESS") || set("ZINC_DETERMINISTIC") || std::getenv("ZINC_RECORD") || std::getenv("ZINC_REPLAY");
  std::string dir = projectDir;
  if (dir.empty()) { std::string pf = zn::frontend::findProjectFile(entry); if (!pf.empty()) dir = fs::path(pf).parent_path().string(); }
  if (dir.empty()) dir = ".";
  auto sel = zn::frontend::selectDisplay(dir, gRoot + "/..", zn::tc::pluginTarget());
  if (sel.width > 0 && sel.height > 0) { gBakedSize = std::to_string(sel.width) + "x" + std::to_string(sel.height); setenv("ZINC_SIZE", gBakedSize.c_str(), 0); }
  if (sel.driver.empty() || (headless && !set("ZINC_DISPLAY"))) return;
  std::vector<std::string> problems;
  auto found = zn::frontend::discoverPlugins(gRoot + "/..", dir, problems);
  const zn::frontend::FoundPlugin* hit = nullptr;
  for (const auto& f : found) if (f.manifest.kind == "display" && (f.manifest.name == sel.driver || f.manifest.name == "display-" + sel.driver)) hit = &f;
  if (!hit) { std::fprintf(stderr, "zinc: display driver '%s' not found (zinc plugins lists them)\n", sel.driver.c_str()); return; }
  zn::tc::PluginLib lib;
  std::string err;
  if (!zn::tc::buildPlugin(*hit, gRoot, dir, zn::tc::pluginTarget(), lib, err) || !zn::tc::loadPlugin(lib, err)) { std::fprintf(stderr, "zinc: display driver '%s': %s\n", sel.driver.c_str(), err.c_str()); return; }
  gPlugins.push_back(lib);
}

#ifdef ZN_HOST_GFX
#include "hal_window.h"
#include "yyjson.h"
extern "C" void hal_set_window_config(const HalWindowConfig*) __attribute__((weak));   // the SDL HAL has it; the headless HAL does not
// zinc.json app.window (ZN-233): the properties the window needs before it exists. A size given here is used when the target does not give one.
static void applyAppWindow(const std::string& json, zn::frontend::TargetOptions& target) {
  yyjson_doc* doc = yyjson_read(json.c_str(), json.size(), 0);
  if (!doc) return;
  yyjson_val* w = yyjson_doc_get_root(doc);
  auto num = [&](const char* k, double& d) { yyjson_val* v = yyjson_obj_get(w, k); if (v && yyjson_is_num(v)) { d = yyjson_get_num(v); return true; } return false; };
  auto flag = [&](const char* k, bool& b) { yyjson_val* v = yyjson_obj_get(w, k); if (v && yyjson_is_bool(v)) { b = yyjson_get_bool(v); return true; } return false; };
  HalWindowConfig c = {};
  double x = 0, y = 0, n = 0;
  if (num("width", n) && target.width == 0) target.width = static_cast<int>(n);
  if (num("height", n) && target.height == 0) target.height = static_cast<int>(n);
  if (num("minWidth", n)) c.min_w = static_cast<int>(n);
  if (num("minHeight", n)) c.min_h = static_cast<int>(n);
  if (num("x", x) && num("y", y)) { c.has_position = 1; c.x = static_cast<int>(x); c.y = static_cast<int>(y); }
  bool b = false, frame = true;
  if (yyjson_val* tc = yyjson_obj_get(w, "transparentColor"); tc && yyjson_is_str(tc)) c.transparent_key = static_cast<unsigned>(std::strtoul(yyjson_get_str(tc) + (yyjson_get_str(tc)[0] == '#' ? 1 : 0), nullptr, 16));   // "#rrggbb": the colour that is see-through
  if (flag("alwaysOnTop", b)) c.always_on_top = b;
  if (flag("transparent", b)) c.transparent = b;
  if (flag("resizable", b)) c.not_resizable = !b;
  if (flag("frame", frame) && !frame) c.borderless = 1;
  if (yyjson_val* tb = yyjson_obj_get(w, "titleBar"); tb && yyjson_is_str(tb) && !std::strcmp(yyjson_get_str(tb), "none")) c.borderless = 1;
  if (yyjson_val* t = yyjson_obj_get(w, "title"); t && yyjson_is_str(t)) std::snprintf(c.title, sizeof c.title, "%s", yyjson_get_str(t));
  yyjson_doc_free(doc);
  if (hal_set_window_config) hal_set_window_config(&c);
}
#endif

static const zn::frontend::Profile* gProfile = nullptr;   // --profile / zinc.json "profile"
static bool gStrict = false;  // --strict (a file-local switch of the command line, set once in main)

// The system permissions of the zinc.json that governs `path`, for the compile (an import of zinc:system/<feature> needs its id); a manifest rule that fails stops the command.
static bool loadManifestPermissions(const char* path) {
  static std::vector<std::string> granted;
  granted.clear();
  std::string appJson, scopesJson;
  std::string pf = zn::frontend::findProjectFile(path);
  if (!pf.empty()) {
    std::ifstream in(pf);
    std::stringstream ss; ss << in.rdbuf();
    zn::frontend::Project p;
    std::string err;
    if (!zn::frontend::parseProject(ss.str(), p, err)) { if (p.fatal) { std::fprintf(stderr, "zinc: %s: %s\n", pf.c_str(), err.c_str()); return false; } }
    else { granted = zn::frontend::permissionsFor(p, gProfile ? gProfile->name : zn::tc::pluginTarget()); appJson = p.app.json; scopesJson = p.scopes; }
  }
  zn::frontend::setSystemPermissions(&granted);
  zn::frontend::setSystemAppJson(appJson);
  zn::frontend::setSystemScopesJson(scopesJson);
  return true;
}

static bool loadChecked(const char* path, zn::frontend::Program& prog, zn::frontend::Checked& checked) {
  if (!loadManifestPermissions(path)) return false;
  installNativeProvider(path);
  prog = zn::frontend::loadProgram(path, readFile, gStrict, gRoot + "/../lib/std");
  auto diags = prog.diags;
  if (diags.empty()) {
    checked = zn::frontend::check(prog.ast);
    diags = checked.diags;
  }
  for (const auto& d : diags) std::fprintf(stderr, "%s\n", zn::frontend::formatDiag(prog, d).c_str());
  return diags.empty();
}

// Compiles a source file down to a ZBC module, printing diagnostics; returns 0 on success.
static bool gDeviceCore = false;  // the program goes to a device core (ESP32): the optimizer only writes runtime calls that every core release has
static std::vector<std::string> gSources;  // the texts of the files of the last program compiled: they decide which fonts and images are baked

// The baked fonts and images of the last program compiled, as one blob (src/res); assets are the `assets` directory beside the entry file or above it.
static bool bakeResources(const char* entry, std::vector<std::uint8_t>& blob, std::string& err) {
  namespace fs = std::filesystem;
  zn::res::Options o;
  o.fontDir = gRoot + "/../lib/fonts";
  fs::path dir = fs::absolute(entry).parent_path();
  for (fs::path d : {dir / "assets", dir.parent_path() / "assets"}) if (fs::is_directory(d)) { o.assetsDir = d.string(); break; }
  return zn::res::bake(gSources, o, blob, err);
}

static std::vector<std::string> gHostImports;   // the host modules ('zinc:gfx', 'zinc:sys'...) the last program compiled imports, directly or through the standard modules
static void scanHostImports(const zn::frontend::Program& prog) {
  gHostImports.clear();
  for (const auto& f : prog.files) {
    const std::string& t = f.text;
    for (std::size_t at = t.find("zinc:"); at != std::string::npos; at = t.find("zinc:", at + 1)) {
      if (at == 0 || (t[at - 1] != '\'' && t[at - 1] != '"')) continue;
      std::size_t e = at;
      while (e < t.size() && (std::isalnum(static_cast<unsigned char>(t[e])) || t[e] == ':' || t[e] == '/' || t[e] == '_' || t[e] == '-')) ++e;
      std::string spec = t.substr(at, e - at);
      if (e < t.size() && t[e] == t[at - 1] && zn::frontend::builtinModuleSource(spec) && std::find(gHostImports.begin(), gHostImports.end(), spec) == gHostImports.end()) gHostImports.push_back(spec);
    }
  }
}
static int compileToZbc(const char* path, zn::zbc::Module& out) {
  zn::frontend::Program prog;
  zn::frontend::Checked checked;
  if (!loadChecked(path, prog, checked)) return 1;
  scanHostImports(prog);
  gSources.clear();
  for (const auto& f : prog.files) gSources.push_back(f.text);
  std::vector<zn::frontend::Diag> diags;
  {
    auto low = zn::ir::lower(prog.ast, checked, prog.files[0].text);
    diags = low.diags;
    if (diags.empty()) {
      if (!std::getenv("ZN_NO_OPT")) zn::ir::optimize(low.module, gDeviceCore);
      zn::ir::insertRc(low.module);
      std::string badIr = zn::ir::verify(low.module);
      if (!badIr.empty()) { std::fprintf(stderr, "internal error: invalid IR after reference counting: %s\n", badIr.c_str()); return 3; }
      auto em = zn::zbc::emit(low.module);
      for (const auto& e : em.errors) std::fprintf(stderr, "%s: %s\n", path, e.c_str());
      if (!em.errors.empty()) return 1;
      std::string bad = zn::zbc::verify(em.module);
      if (!bad.empty()) { std::fprintf(stderr, "internal error: invalid ZBC: %s\n", bad.c_str()); return 3; }
      out = std::move(em.module);
      return 0;
    }
  }
  for (const auto& d : diags) std::fprintf(stderr, "%s\n", zn::frontend::formatDiag(prog, d).c_str());
  return 1;
}

extern "C" const ZnModule* zn_module_QuickJS(void);   // src/qjs/script_native.cpp: zinc:script on the engine's QuickJS-ng
#ifdef ZN_NATIVE_FIXTURE
extern "C" const ZnModule* fixture_module(void);
#endif

// The BundleSpec of a zinc.json `app` (icon made absolute against the project directory).
static zn::tc::BundleSpec bundleSpecOf(const zn::frontend::Project& p, const std::string& projectDir) {
  zn::tc::BundleSpec b;
  b.id = p.app.id; b.name = p.app.name.empty() ? p.name : p.app.name; b.version = p.app.version; b.category = p.app.category; b.copyright = p.app.copyright;
  b.dock = p.app.dock; b.urlSchemes = p.app.urlSchemes; b.fileTypes = p.app.fileTypes;
  if (!p.app.icon.empty()) b.icon = (std::filesystem::path(projectDir) / p.app.icon).lexically_normal().string();
  return b;
}
static std::vector<std::string> gOriginalArgs;   // argv as the user typed it: the dev bundle starts the engine again with it
static std::string gBundleOut;                   // `zinc build --bundle ... -o <out>.app`: the bundle to assemble once the program is linked
static zn::tc::BundleSpec gBundleSpec;

int main(int argc, char** argv) {
  for (int k = 0; k < argc; ++k) gOriginalArgs.push_back(argv[k]);
  { char e[256]; zn_register_module(zn_module_QuickJS(), e, sizeof e); }
#ifdef ZN_NATIVE_FIXTURE
  { char e[256]; zn_register_module(fixture_module(), e, sizeof e); }   // a test module in C99 (tests/native/fixture.c): what the native-call fixtures call
#endif
  gRoot = zn::tc::sourceRoot(ZN_SOURCE_DIR);
  if (std::getenv("ZINC_DEVAPP_SELFTEST") && std::getenv("ZINC_DEVAPP")) std::fprintf(stderr, "devapp: %s (bundle id of this process: %s)\n", std::getenv("ZINC_DEVAPP"), zn::tc::runningBundleId().c_str());   // ZN-234 selftest
  if (char* self = realpath(argv[0], nullptr)) { setenv("ZINC_BIN", self, 0); std::free(self); }  // the apps that start `zinc` (Zinc Atelier) find this binary through it
#ifdef ZN_HOST_GFX
  zn::host::installGfx();
#endif
  for (int k = 1; k < argc; ++k) {  // `--strict` anywhere on the command line selects the strict profile; `--force` builds despite unmet `requires`
    if (!std::strcmp(argv[k], "--force")) { zn::frontend::setForce(true); for (int j = k; j + 1 < argc; ++j) argv[j] = argv[j + 1]; --argc; --k; }
    else if (!std::strcmp(argv[k], "--strict")) { gStrict = true; for (int j = k; j + 1 < argc; ++j) argv[j] = argv[j + 1]; --argc; --k; }
  }
  // `--profile esp32` (or --profile=esp32) anywhere: the target's `number`, typing and heap budget on the host (ZN-120)
  for (int k = 1; k < argc; ++k) {
    std::string name;
    int used = 0;
    if (!std::strcmp(argv[k], "--profile") && k + 1 < argc) { name = argv[k + 1]; used = 2; }
    else if (!std::strncmp(argv[k], "--profile=", 10)) { name = argv[k] + 10; used = 1; }
    if (!used) continue;
    const zn::frontend::Profile* pr = zn::frontend::findProfile(name);
    if (!pr) { std::string all; for (const std::string& n : zn::frontend::profileNames()) all += (all.empty() ? "" : ", ") + n; std::fprintf(stderr, "zinc: unknown profile '%s' (available: %s)\n", name.c_str(), all.c_str()); return 2; }
    gProfile = pr;
    for (int j = k; j + used < argc; ++j) argv[j] = argv[j + used];
    argc -= used; --k;
  }
  {   // help, init and the bare project commands (ZN-138)
    std::vector<std::string> cl(argv, argv + argc);
    if (argc >= 2 && (!std::strcmp(argv[1], "help") || !std::strcmp(argv[1], "--help") || !std::strcmp(argv[1], "-h"))) { if (!std::strcmp(argv[1], "--help") || !std::strcmp(argv[1], "-h")) cl.insert(cl.begin() + 1, "help"); return zn::cli::help(cl); }
    if (argc >= 3 && (!std::strcmp(argv[argc - 1], "--help") || !std::strcmp(argv[argc - 1], "-h"))) return zn::cli::help({cl[0], "help", cl[1]});
    if (argc >= 2 && !std::strcmp(argv[1], "init")) return zn::cli::init(cl, gRoot);
    if (argc >= 2 && !std::strcmp(argv[1], "capture") && !(argc >= 3 && !std::strcmp(argv[2], "--scene"))) return zn::cli::capture(cl);
    if (argc >= 2 && !std::strcmp(argv[1], "bench")) return zn::cli::bench(cl);
    if (argc >= 2 && !std::strcmp(argv[1], "dev")) return zn::cli::dev(cl);
    if (argc >= 2 && !std::strcmp(argv[1], "lsp")) return zn::lsp::serve(gRoot + "/../lib/std");
    if (argc >= 2 && !std::strcmp(argv[1], "monitor")) return zn::cli::monitor(cl);
    if (argc >= 2 && !std::strcmp(argv[1], "export")) return zn::cli::exportApp(cl);
    if (argc >= 2 && !std::strcmp(argv[1], "deploy")) return zn::cli::deploy(cl);
    if (argc >= 2 && !std::strcmp(argv[1], "tsconfig")) return zn::cli::tsconfig(cl, gRoot);
    if (argc >= 2 && !std::strcmp(argv[1], "infer")) return zn::cli::infer(cl);
    std::string derr;
    if (!zn::cli::discoverEntry(cl, derr)) { std::fprintf(stderr, "zinc: %s\n", derr.c_str()); return 2; }
    if (cl.size() != static_cast<std::size_t>(argc) || !std::equal(cl.begin(), cl.end(), argv, [](const std::string& a, const char* b) { return a == b; })) {
      static std::vector<std::string> keep;
      static std::vector<char*> ptrs;
      keep = cl;
      for (std::string& x : keep) ptrs.push_back(x.data());
      ptrs.push_back(nullptr);
      argv = ptrs.data();
      argc = static_cast<int>(keep.size());
    }
  }
  if (gProfile) { zn::frontend::applyProfile(*gProfile); if (gProfile->strict && argc > 1 && !std::strcmp(argv[1], "build")) gStrict = true; }   // `run` keeps gradual typing on the host (the .f32 goldens run so); a build for the target is strict
  if (argc >= 2 && !std::strcmp(argv[1], "doctor")) {   // zinc doctor: the engine, the renderer of this machine, the pinned tools, the host tools (ZN-138, ZN-175)
    const zn::frontend::Profile* hp = gProfile ? gProfile : zn::frontend::findProfile(
#if defined(__APPLE__)
        "macos"
#else
        "linux"
#endif
    );
    zn::frontend::Caps caps = zn::frontend::capsFor(*hp, gRoot);
    std::string gpu = caps["gpu"], tier = caps["tier"], note;
#if !defined(__APPLE__)
    if (!gProfile) {   // probe: no EGL/GLES library means the software raster draws
      void* egl = dlopen("libEGL.so.1", RTLD_LAZY);
      if (egl) dlclose(egl);
      void* gles = dlopen("libGLESv2.so.2", RTLD_LAZY);
      if (gles) dlclose(gles);
      if (!egl || !gles) { gpu = "none"; tier = "T0"; note = " (libEGL/libGLESv2 not found: software raster)"; }
    }
#endif
    return zn::cli::doctor(gRoot, std::string("profile ") + hp->name + "\ngpu " + gpu + note + "\ntier " + tier + "\nrenderer " + (gpu == "none" ? "cpu" : "auto") + "\n");
  }
  if (argc >= 2 && !std::strcmp(argv[1], "test")) {   // zinc test [--profile P] [dir]: the conformance programs against the goldens of the profile (ZN-122)
    const zn::frontend::Profile* tp = gProfile ? gProfile : zn::frontend::findProfile(
#if defined(__APPLE__)
        "macos"
#else
        "linux"
#endif
    );
    if (tp != gProfile) zn::frontend::applyProfile(*tp);
    char* self = realpath(argv[0], nullptr);
    std::string runner, tdir;
    for (int k = 2; k < argc; ++k) { if (!std::strcmp(argv[k], "--runner") && k + 1 < argc) runner = argv[++k]; else tdir = argv[k]; }
    int rc = runTestCommand(self ? self : argv[0], *tp, gRoot, tdir, runner);
    std::free(self);
    return rc;
  }
  if (argc == 2 && !std::strcmp(argv[1], "devapp-id")) { std::puts(zn::tc::runningBundleId().c_str()); return 0; }   // the CFBundleIdentifier of this process ("" outside a bundle): the selftest of the dev bundle
  for (int k = 1; k + 1 < argc && argc > 1 && !std::strcmp(argv[1], "build"); ++k) {   // zinc build --bundle <file> -o <out>.app: the program inside a macOS bundle
    if (std::strcmp(argv[k], "--bundle")) continue;
    for (int j = k; j + 1 < argc; ++j) argv[j] = argv[j + 1];
    --argc; --k;
    gBundleOut = "?";
  }
  if (argc == 2 && !std::strcmp(argv[1], "--root")) { std::puts(gRoot.c_str()); return 0; }  // where the engine files are read from
  if (argc == 2 && !std::strcmp(argv[1], "--version")) {
    std::printf("zinc-next %s\n", kVersionText);
    return 0;
  }
  if (argc >= 3 && (!std::strcmp(argv[1], "profile") || !std::strcmp(argv[1], "mem"))) {  // zinc profile|mem <file.ts|file.zbc> [options]: the interpreter under a profiler
    bool isMem = !std::strcmp(argv[1], "mem"), json = false, checkLeaks = false;
    zn::prof::ProfileOptions po;
    po.speedscope = "zinc.speedscope.json";
    for (int k = 3; k < argc; ++k) {
      if (!std::strcmp(argv[k], "--json")) json = true;
      else if (!std::strcmp(argv[k], "--check-leaks")) checkLeaks = true;
      else if (!std::strcmp(argv[k], "--hz") && k + 1 < argc) po.hz = std::atoi(argv[++k]);
      else if (!std::strcmp(argv[k], "--speedscope") && k + 1 < argc) po.speedscope = argv[++k];
      else if (!std::strcmp(argv[k], "--folded") && k + 1 < argc) po.folded = argv[++k];
      else { std::fprintf(stderr, "unknown option %s\n", argv[k]); return 2; }
    }
    zn::zbc::Module zm;
    std::string path = argv[2];
    if (path.size() > 4 && path.substr(path.size() - 4) == ".zbc") {
      std::ifstream in(path, std::ios::binary);
      if (!in) { std::fprintf(stderr, "cannot read %s\n", argv[2]); return 2; }
      std::vector<std::uint8_t> bytes((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
      std::string err;
      if (!zn::zbc::decode(bytes, zm, err)) { std::fprintf(stderr, "%s: %s\n", argv[2], err.c_str()); return 1; }
      err = zn::zbc::verify(zm);
      if (!err.empty()) { std::fprintf(stderr, "%s: invalid ZBC: %s\n", argv[2], err.c_str()); return 1; }
    } else if (int rc = compileToZbc(argv[2], zm)) return rc;
    std::string out, report;
    zn::rt::Result res = isMem ? zn::prof::memory(zm, out, json, report) : zn::prof::profile(zm, out, po, report);
    std::fwrite(out.data(), 1, out.size(), stderr);  // the program's own output goes to stderr: stdout is the report
    std::fputs(report.c_str(), stdout);
    if (!res.ok) { std::fprintf(stderr, "%s\n", res.error.c_str()); return res.error.rfind("panic: ", 0) == 0 ? 101 : 1; }
    if (!isMem) std::fprintf(stderr, "wrote %s\n", po.speedscope.c_str());
    if (checkLeaks && res.leaked) { std::fprintf(stderr, "leaked %zu object(s)\n", res.leaked); return 4; }
    return 0;
  }
#ifdef ZN_WEBGL
  zn::text::installSegmenter();   // Intl.Segmenter in the QuickJS engine (ZN-165)
  zn::gl::installWebGLBindings();   // document.createElement('canvas').getContext('webgl') in the QuickJS engine (ZN-203.03)
#endif
  if (argc >= 5 && !std::strcmp(argv[1], "run") && !std::strcmp(argv[3], "--engine")) {  // zinc run <file> --engine quickjs [-- args...]: plain JavaScript or stripped TypeScript on QuickJS-ng
    if (std::strcmp(argv[4], "quickjs")) { std::fprintf(stderr, "zinc: unknown engine '%s' (quickjs)\n", argv[4]); return 2; }
    zn::qjs::Options qo;
    qo.entry = argv[2];
    qo.stdRoot = gRoot + "/../lib/std";
#ifdef ZN_HOST_GFX
    {
      std::vector<std::string> args;
      for (int k = 6; k < argc; ++k) args.push_back(argv[k]);
      zn::host::setProgramArgs(args);
      namespace fs = std::filesystem;
      fs::path dir = fs::absolute(argv[2]).parent_path();
      for (fs::path d : {dir / "assets", dir.parent_path() / "assets"}) if (fs::is_directory(d)) { setenv("ZINC_ASSETS", d.c_str(), 0); break; }
      std::vector<std::uint8_t> blob;
      std::string err;
      {  // the fonts and images the program names: the texts of its files (the Zinc loader follows the imports, a program that does not parse as Zinc bakes from its own text)
        installNativeProvider(argv[2]);
        zn::frontend::Program prog = zn::frontend::loadProgram(argv[2], readFile, false, qo.stdRoot);
        gSources.clear();
        for (const auto& f : prog.files) gSources.push_back(f.text);
        if (gSources.empty()) { std::string t; if (readFile(argv[2], t)) gSources.push_back(t); }
      }
      if (bakeResources(argv[2], blob, err)) zn::host::installResources(blob.data(), blob.size());
    }
#endif
    return zn::qjs::run(qo);
  }
  if (argc >= 3 && !std::strcmp(argv[1], "run") && (argc == 3 || !std::strcmp(argv[3], "--"))) {  // zinc run <file> [-- args...]  // zinc run <file.ts|file.zbc>: compile if needed, verify, execute
    std::string path = argv[2];
    std::string projectDir;
    zn::frontend::TargetOptions window;  // zinc.json: what concerns the host
    {
      namespace fs = std::filesystem;
      std::string projFile = zn::frontend::findProjectFile(path);
      zn::frontend::Project project;
      bool have = false;
      if (!projFile.empty()) {
        std::ifstream in(projFile);
        std::stringstream ss;
        ss << in.rdbuf();
        std::string err;
        if (zn::frontend::parseProject(ss.str(), project, err)) { have = true; projectDir = fs::path(projFile).parent_path().string(); for (const std::string& w : project.warnings) std::fprintf(stderr, "zinc: %s: %s\n", projFile.c_str(), w.c_str()); }
        else { std::fprintf(stderr, "zinc: %s: %s\n", projFile.c_str(), err.c_str()); if (project.fatal) return 2; }
      }
      if (have && !project.profile.empty() && !gProfile) {   // zinc.json "profile": the target's number, typing and heap on the host
        gProfile = zn::frontend::findProfile(project.profile);
        if (!gProfile) { std::fprintf(stderr, "zinc: %s: unknown profile '%s'\n", projFile.c_str(), project.profile.c_str()); return 2; }
        zn::frontend::applyProfile(*gProfile);
      }
      if (have && !project.requires_.empty()) {   // zinc.json "requires" against the profile in force (ZN-123); the host's own profile meets what the machine has
        const zn::frontend::Profile* rp = zn::frontend::currentProfile();
        if (rp) {
          std::string why = zn::frontend::explain(project.requires_, zn::frontend::capsFromFile(*rp, gRoot + "/../targets/capabilities.json"), rp->name);
          if (!why.empty()) {
            std::string nm = project.name.empty() ? fs::path(projectDir).filename().string() : project.name;
            if (!zn::frontend::force()) { std::fprintf(stderr, "zinc: %s cannot run on %s: it requires %s (zinc.json \"requires\"; --force builds anyway)\n", nm.c_str(), rp->name, why.c_str()); return 1; }
            std::fprintf(stderr, "zinc: warning: %s requires %s; building anyway (--force)\n", nm.c_str(), why.c_str());
          }
        }
      }
#ifdef __APPLE__
      if (have && !project.app.id.empty() && !project.permissions.empty() && !std::getenv("ZINC_DEVAPP") && !std::getenv("ZINC_HEADLESS") && !std::getenv("ZINC_DETERMINISTIC")) {
        // a program that uses the system modules runs from a dev bundle (own bundle id, name and icon): the process then behaves as the shipped app does (ZN-234)
        std::string engine = zn::tc::executablePath(), app, berr;
        bool refreshed = false;
        auto t0 = std::chrono::steady_clock::now();
        if (!engine.empty() && zn::tc::ensureDevBundle(bundleSpecOf(project, projectDir), engine, zn::tc::home() + "/cache/macos/devapp", app, refreshed, berr)) {
          if (std::getenv("ZINC_DEVAPP_SELFTEST")) std::fprintf(stderr, "devapp: %s %s in %.1f ms\n", refreshed ? "refreshed" : "up to date", app.c_str(), std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count());
          setenv("ZINC_DEVAPP", app.c_str(), 1);
          setenv("ZINC_ROOT", gRoot.c_str(), 0);
          std::vector<char*> av;
          for (std::string& a : gOriginalArgs) av.push_back(a.data());
          av.push_back(nullptr);
          std::string exe = app + "/Contents/MacOS/zinc";
          execv(exe.c_str(), av.data());
          std::fprintf(stderr, "zinc: cannot start the dev bundle %s: %s\n", app.c_str(), std::strerror(errno));
        } else if (!berr.empty()) std::fprintf(stderr, "zinc: no dev bundle (%s); running without a bundle id\n", berr.c_str());
      }
#endif
      std::error_code ec;
      if (fs::is_directory(path, ec)) {  // `zinc run examples/breakout`: its zinc.json entry, or src/main.ts[x]
        std::string e = zn::frontend::entryOf(path, have && fs::path(projectDir) == fs::absolute(path).lexically_normal() ? &project : nullptr);
        if (e.empty()) { std::fprintf(stderr, "zinc: %s: no entry (zinc.json \"entry\", src/main.ts, src/main.tsx, main.ts or main.tsx)\n", path.c_str()); return 2; }
        path = e;
      }
      if (have) {  // the profile of the target this machine runs: macos, linux, else the simulator's
#if defined(__APPLE__)
        const char* order[] = {"macos", "sim"};
#else
        const char* order[] = {"linux", "sim"};
#endif
        for (const char* t : order) { auto it = project.targets.find(t); if (it != project.targets.end()) { window = it->second; break; } }
#ifdef ZN_HOST_GFX
        if (!project.app.window.empty()) applyAppWindow(project.app.window, window);   // zinc.json app.window: size when the target gives none, window properties for the HAL
#endif
      }
    }
    installDisplayDriver(projectDir, path.c_str());
    if (window.width > 0 && window.height > 0) setenv("ZINC_SIZE", (std::to_string(window.width) + "x" + std::to_string(window.height)).c_str(), 0);
    if (window.zoom > 0) setenv("ZINC_ZOOM", std::to_string(window.zoom).c_str(), 0);
    if (!window.resize.empty()) setenv("ZINC_RESIZE", window.resize.c_str(), 0);
    if (window.fullscreen) setenv("ZINC_FULLSCREEN", "1", 0);
    if (window.kiosk) setenv("ZINC_KIOSK", "1", 0);
#ifdef ZN_HOST_GFX
    zn::host::setGrowDrawCommands(window.growDrawCommands);
#endif
    zn::zbc::Module zm;
    if (path.size() > 4 && path.substr(path.size() - 4) == ".zbc") {
      std::ifstream in(path, std::ios::binary);
      if (!in) { std::fprintf(stderr, "cannot read %s\n", argv[2]); return 2; }
      std::vector<std::uint8_t> bytes((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
      std::string err;
      auto t0 = std::chrono::steady_clock::now();
      if (!zn::zbc::decode(bytes, zm, err)) { std::fprintf(stderr, "%s: %s\n", argv[2], err.c_str()); return 1; }
      auto t1 = std::chrono::steady_clock::now();
      err = zn::zbc::verify(zm);
      if (std::getenv("ZN_TIMING")) std::fprintf(stderr, "decode %.2f ms, verify %.2f ms\n", std::chrono::duration<double, std::milli>(t1 - t0).count(), std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t1).count());
      if (!err.empty()) { std::fprintf(stderr, "%s: invalid ZBC: %s\n", argv[2], err.c_str()); return 1; }
    } else if (int rc = compileToZbc(path.c_str(), zm)) return rc;
    std::string out;
    bool trace = std::getenv("ZN_TRACE_FREE") != nullptr;
    std::string absPath = std::filesystem::absolute(path).string();
    if (!projectDir.empty()) { std::error_code ec; std::filesystem::current_path(projectDir, ec); }  // the program's relative file names (media/...) are the project's
#ifdef ZN_HOST_GFX
    {  // the program's arguments (after `--`) and its assets directory (beside the entry file or above it) for zinc:sys and zinc:assets
      std::vector<std::string> args;
      for (int k = 4; k < argc; ++k) args.push_back(argv[k]);
      zn::host::setProgramArgs(args);
      namespace fs = std::filesystem;
      fs::path dir = fs::path(absPath).parent_path();
      for (fs::path d : {dir / "assets", dir.parent_path() / "assets"}) if (fs::is_directory(d)) { setenv("ZINC_ASSETS", d.c_str(), 0); break; }
    }
    if (zn::aot::usesHost(zm)) {  // a program that draws: bake its fonts and images (from its sources) and install them
      std::vector<std::uint8_t> blob;
      std::string err;
      if (!bakeResources(absPath.c_str(), blob, err) || !zn::host::installResources(blob.data(), blob.size())) { std::fprintf(stderr, "zinc: cannot prepare the fonts and images: %s\n", err.c_str()); return 1; }
    }
#endif
    if (gProfile) zn::rt::setHeapBudget(static_cast<std::size_t>(gProfile->heapBytes));   // the target's heap: an overflow stops the program like on the device
    auto res = zn::vm::run(zm, out, trace);
    return zn::rt::report(res, out, trace);
  }
  if (argc >= 2 && !std::strcmp(argv[1], "device-sim")) {  // zinc device-sim: the device core of src/dev on stdin and stdout (what a flashed ESP32 does on its UART)
    zn::dev::CoreConfig cfg;
    for (int k = 2; k + 1 < argc; k += 2) {
      if (!std::strcmp(argv[k], "--stack")) cfg.stackSlots = static_cast<std::size_t>(std::atoll(argv[k + 1]));
      else if (!std::strcmp(argv[k], "--depth")) cfg.maxDepth = static_cast<std::size_t>(std::atoll(argv[k + 1]));
      else if (!std::strcmp(argv[k], "--modules")) {   // the host modules this simulated device provides: "zinc:sys,zinc:gfx" (or "-")
        cfg.reportModules = true;
        std::string m = argv[k + 1];
        for (std::size_t from = 0; m != "-" && from <= m.size();) { std::size_t c = m.find(',', from); cfg.modules.push_back(m.substr(from, c == std::string::npos ? std::string::npos : c - from)); if (c == std::string::npos) break; from = c + 1; }
      } else if (!std::strcmp(argv[k], "--board")) {   // a board preset (boards/<name>.json): what its display and sensors make available
        std::string text, err2;
        std::ifstream bf(gRoot + "/../boards/" + argv[k + 1] + ".json");
        if (!bf) { std::fprintf(stderr, "zinc: unknown board '%s' (boards/*.json)\n", argv[k + 1]); return 2; }
        std::stringstream bs; bs << bf.rdbuf(); text = bs.str();
        cfg.reportModules = true;
        cfg.modules = {"zinc:sys"};
        if (text.find("\"display\"") != std::string::npos) cfg.modules.push_back("zinc:gfx");
        if (text.find("\"imu-qmi8658\"") != std::string::npos) cfg.modules.push_back("zinc:imu");
      }
    }
    zn::dev::Core core(cfg, [](const char* p, std::size_t n) { std::fwrite(p, 1, n, stdout); std::fflush(stdout); });
    core.announce();
    std::uint8_t buf[512];
    for (;;) {
      ssize_t n = ::read(0, buf, sizeof buf);
      if (n <= 0) return 0;
      core.feed(buf, static_cast<std::size_t>(n));
    }
  }
  if (argc >= 5 && !std::strcmp(argv[1], "run") && !std::strcmp(argv[3], "--target")) {  // zinc run <file> --target esp32 [--port P | --device CMD | --qemu] [--boot-ms N] [--log]
    std::string target = argv[4], port, deviceCmd;
    bool qemu = false, showLog = false;
    int bootMs = 15000, runMs = 60000;
    for (int k = 5; k < argc; ++k) {
      if (!std::strcmp(argv[k], "--port") && k + 1 < argc) port = argv[++k];
      else if (!std::strcmp(argv[k], "--device") && k + 1 < argc) deviceCmd = argv[++k];
      else if (!std::strcmp(argv[k], "--qemu")) qemu = true;
      else if (!std::strcmp(argv[k], "--boot-ms") && k + 1 < argc) bootMs = std::atoi(argv[++k]);
      else if (!std::strcmp(argv[k], "--run-ms") && k + 1 < argc) runMs = std::atoi(argv[++k]);
      else if (!std::strcmp(argv[k], "--log")) showLog = true;
      else { std::fprintf(stderr, "unknown option %s\n", argv[k]); return 2; }
    }
    if (target != "esp32") { std::fprintf(stderr, "zinc: --target %s runs through `zinc build --target`; `run` supports esp32\n", target.c_str()); return 2; }
    zn::zbc::Module zm;
    gDeviceCore = true;
    if (int rc = compileToZbc(argv[2], zm)) return rc;
    std::vector<std::uint8_t> bytes = zn::zbc::encode(zm);
    zn::dev::Link link;
    std::string err;
    if (!deviceCmd.empty()) { if (!zn::dev::spawnCommand(deviceCmd, link, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; } }
    else if (qemu) {
      std::string cmd;
      if (!zn::tc::qemuCommand("esp32", gRoot, cmd, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
      if (!zn::dev::spawnCommand(cmd, link, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
    } else {
      if (port.empty()) port = zn::dev::findSerialPort();
      if (port.empty()) { std::fprintf(stderr, "zinc: no ESP32 found on a serial port; plug it in, give --port <path>, or try the emulator with --qemu\n"); return 1; }
      if (!zn::dev::openSerial(port, 115200, link, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
    }
    zn::dev::Answer ans;
    std::string log;
    bool ok = zn::dev::upload(link, bytes, ans, err, bootMs, runMs, &log, &gHostImports);
    zn::dev::closeLink(link);
    if (showLog) std::fputs(log.c_str(), stderr);
    if (!ok) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
    std::fwrite(ans.output.data(), 1, ans.output.size(), stdout);
    if (std::getenv("ZN_DEVICE_STATS")) std::fprintf(stderr, "device: core %s, free heap %zu bytes, status %d, %zu object(s) left\n", ans.coreVersion.c_str(), ans.freeHeap, ans.status, ans.leaked);
    return ans.status;
  }
  if (argc >= 4 && !std::strcmp(argv[1], "flash") && !std::strcmp(argv[2], "--target")) {  // zinc flash --target esp32 [--port P]: the core firmware onto the board
    if (std::strcmp(argv[3], "esp32")) { std::fprintf(stderr, "zinc: flash supports esp32\n"); return 2; }
    std::string port, err, tool;
    for (int k = 4; k + 1 < argc; k += 2) if (!std::strcmp(argv[k], "--port")) port = argv[k + 1];
    if (port.empty()) port = zn::dev::findSerialPort();
    if (port.empty()) { std::fprintf(stderr, "zinc: no ESP32 found on a serial port; plug it in or give --port <path>\n"); return 1; }
    std::string image = gRoot + "/firmware/esp32/prebuilt/esp32-core-flash.bin";
    if (!std::filesystem::exists(image)) { std::fprintf(stderr, "zinc: the core firmware image is missing: %s\n", image.c_str()); return 1; }
    if (!zn::tc::ensureEsptool(tool, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
    std::string cmd = "'" + tool + "' --chip esp32 -p '" + port + "' -b 460800 write-flash 0x0 '" + image + "'";
    std::fprintf(stderr, "zinc: flashing the core to %s\n", port.c_str());
    return std::system(cmd.c_str()) == 0 ? 0 : 1;
  }
  if (argc == 8 && !std::strcmp(argv[1], "capture") && !std::strcmp(argv[2], "--scene") && !std::strcmp(argv[5], "--bench")) {  // zinc capture --scene <dump> <file> --bench <runs> <threads>: "bench <w>x<h> cmds=N median_us=.. p99_us=.." (ZN-171)
    zn::zbc::Module zm;
    if (int rc = compileToZbc(argv[4], zm)) return rc;
    std::vector<std::uint8_t> blob;
    std::string err;
    if (!bakeResources(argv[4], blob, err) || !zn::host::installResources(blob.data(), blob.size())) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
    zn::host::RenderBench rb;
    if (!zn::host::benchScene(argv[3], std::atoi(argv[6]), std::atoi(argv[7]), rb)) { std::fprintf(stderr, "zinc: cannot replay %s\n", argv[3]); return 1; }
    std::printf("bench %dx%d cmds=%d median_us=%.0f p99_us=%.0f hash=%016llx\n", rb.width, rb.height, rb.cmds, rb.medianUs, rb.p99Us, static_cast<unsigned long long>(rb.hash));
    return 0;
  }
  if (argc == 6 && !std::strcmp(argv[1], "capture") && !std::strcmp(argv[2], "--scene") && !std::strcmp(argv[4], "--damage")) {   // zinc capture --scene <before> --damage <now>: "damage <n> rects equal|DIFFERENT" (ZN-179)
    int n = 0;
    bool same = false;
    if (!zn::host::damageCheck(argv[3], argv[5], n, same)) { std::fprintf(stderr, "zinc: cannot compare %s and %s\n", argv[3], argv[5]); return 1; }
    std::printf("damage %d rects %s\n", n, same ? "equal" : "DIFFERENT");
    return same ? 0 : 1;
  }
  if (argc == 7 && !std::strcmp(argv[1], "capture") && !std::strcmp(argv[2], "--scene") && !std::strcmp(argv[5], "-o")) {  // zinc capture --scene <dump> <file> -o <png>: replay a ZINC_SCENE_DUMP through the software raster, with the fonts and images of <file> (ZN-170)
    zn::zbc::Module zm;
    if (int rc = compileToZbc(argv[4], zm)) return rc;
    std::vector<std::uint8_t> blob;
    std::string err;
    if (!bakeResources(argv[4], blob, err) || !zn::host::installResources(blob.data(), blob.size())) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
    if (!zn::host::replayScene(argv[3], argv[6])) { std::fprintf(stderr, "zinc: cannot replay %s\n", argv[3]); return 1; }
    return 0;
  }
  if (argc == 5 && !std::strcmp(argv[1], "bake") && !std::strcmp(argv[3], "-o")) {  // zinc bake <file> -o <blob>: the baked fonts and images of a program (for inspection and tests)
    zn::zbc::Module zm;
    if (int rc = compileToZbc(argv[2], zm)) return rc;
    std::vector<std::uint8_t> blob;
    std::string err;
    if (!bakeResources(argv[2], blob, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
    std::ofstream out(argv[4], std::ios::binary);
    out.write(reinterpret_cast<const char*>(blob.data()), static_cast<std::streamsize>(blob.size()));
    return out ? 0 : 2;
  }
  if (argc >= 2 && !std::strcmp(argv[1], "toolchain")) {  // zinc toolchain install|path|targets|sha256 <file>
    std::string sub = argc >= 3 ? argv[2] : "";
    if (sub == "install" || sub == "path") {
      std::string zig, err;
      if (!zn::tc::ensureZig(zig, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
      std::puts(zig.c_str());
      return 0;
    }
    if (sub == "esptool") {
      std::string tool, err;
      if (!zn::tc::ensureEsptool(tool, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
      std::puts(tool.c_str());
      return 0;
    }
    if (sub == "targets") {
      for (const auto& t : zn::tc::targets()) std::printf("%-14s %s\n", t.name, t.note);
      return 0;
    }
    if (sub == "sha256" && argc == 4) {
      std::string h = zn::tc::sha256File(argv[3]);
      if (h.empty()) { std::fprintf(stderr, "cannot read %s\n", argv[3]); return 2; }
      std::printf("%s  %s\n", h.c_str(), argv[3]);
      return 0;
    }
    std::fprintf(stderr, "usage: zinc toolchain install | path | esptool | targets | sha256 <file>\n");
    return 2;
  }
  if (argc == 7 && !std::strcmp(argv[1], "build") && !std::strcmp(argv[2], "--target") && !std::strcmp(argv[5], "-o")) {  // zinc build --target <t> <file> -o <out>: a program for another machine
    namespace fs = std::filesystem;
    const zn::tc::Target* target = zn::tc::findTarget(argv[3]);
    if (!target) { std::fprintf(stderr, "unknown target '%s' (zinc toolchain targets)\n", argv[3]); return 2; }
    zn::zbc::Module zm;
    if (int rc = compileToZbc(argv[4], zm)) return rc;
    std::string zig, err;
    if (!zn::tc::ensureZig(zig, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
    fs::path cpp = fs::path(argv[6]).string() + ".cpp";
    std::vector<std::uint8_t> blob;
    std::string libsDir;
    const bool draws = zn::aot::usesHost(zm) || !gPlugins.empty();
    std::vector<zn::tc::PluginLib> crossPlugins;
    if (draws) {   // a program that draws: the graphics host cross-built for the target (headless null HAL), the fonts and images baked in, the surface size of the project for the target
      if (!zn::tc::ensureCrossLibs(zig, gRoot, argv[3], libsDir, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
      if (!bakeResources(argv[4], blob, err)) { std::fprintf(stderr, "zinc: cannot bake the fonts and images: %s\n", err.c_str()); return 1; }
      std::string pdir = zn::frontend::findProjectFile(argv[4]);
      pdir = pdir.empty() ? "." : fs::path(pdir).parent_path().string();
      auto sel = zn::frontend::selectDisplay(pdir, gRoot + "/..", "linux");
      if (sel.width > 0 && sel.height > 0) gBakedSize = std::to_string(sel.width) + "x" + std::to_string(sel.height);
      // the native code of the plugins the program calls, built again for the target (the desktop ones, dlopen'ed to compile, are for this machine)
      std::vector<std::string> problems;
      auto found = zn::frontend::discoverPlugins(gRoot + "/..", pdir, problems);
      const zn::tc::Target* tg0 = zn::tc::findTarget(argv[3]);
      zn::tc::setCrossTarget(tg0->name, tg0->zigTarget, zig);
      for (const zn::tc::PluginLib& host : gPlugins) {
        if (host.display) continue;   // a display driver is not cross-built: the program runs headless on the null HAL
        const zn::frontend::FoundPlugin* hit = nullptr;
        for (const auto& f : found) if (f.manifest.name == host.plugin) hit = &f;
        zn::tc::PluginLib lib;
        if (!hit || !zn::tc::buildPlugin(*hit, gRoot, pdir, "linux", lib, err)) { zn::tc::clearCrossTarget(); std::fprintf(stderr, "zinc: plugin '%s' for %s: %s\n", host.plugin.c_str(), argv[3], err.c_str()); return 1; }
        crossPlugins.push_back(lib);
      }
      zn::tc::clearCrossTarget();
    }
    { std::ofstream o(cpp); std::string text = zn::aot::emitCpp(zm, blob.empty() ? nullptr : &blob);
      if (draws && !gBakedSize.empty()) { std::size_t at = text.find("int main() {\n"); if (at != std::string::npos) text.insert(at + 13, "  setenv(\"ZINC_SIZE\", \"" + gBakedSize + "\", 0);   // the project's surface\n"); }
      o << text; if (!o) { std::fprintf(stderr, "cannot write %s\n", cpp.c_str()); return 2; } }
    bool ok;
    if (draws) {
      const zn::tc::Target* tg = zn::tc::findTarget(argv[3]);
      std::string L = libsDir + "/", q = "'";
      std::string cmd = q + zig + "' c++ -std=c++20 -target " + tg->zigTarget + (std::string(tg->name) == "armhf-linux" ? " -mcpu=arm1176jzf_s" : "") + " -O2 -w -ffp-contract=off -I '" + gRoot + "/include' -I '" + gRoot + "/src' -I '" + gRoot + "/third_party/mimalloc/include' '" + cpp.string() + "'";
      for (const zn::tc::PluginLib& pl : crossPlugins) {
        cmd += " -Wl,--whole-archive '" + pl.archive + "' -Wl,--no-whole-archive";   // the module registers from a static constructor
        if (!pl.vendor.empty()) cmd += " '" + pl.vendor + "'";
        for (const std::string& a : pl.linkArgs) cmd += " " + a;
      }
      for (const char* lib : {"zn_rt", "zn_mimalloc", "zn_zbc", "zn_ir", "zn_frontend", "zn_native", "zn_host_gfx", "zn_codec", "zn_uv", "zn_llhttp", "zn_mbedtls", "zn_regexp", "zn_yyjson"}) if (fs::exists(L + "lib" + lib + ".a")) cmd += " '" + L + "lib" + lib + ".a'";
      cmd += " -lpthread -o '" + std::string(argv[6]) + "'";
      ok = std::system(cmd.c_str()) == 0;
      if (!ok) err = "the cross compiler failed: " + cmd;
    } else ok = zn::tc::crossBuild(zig, gRoot, cpp.string(), argv[3], argv[6], err);
    if (!std::getenv("ZN_KEEP_CPP")) fs::remove(cpp);
    if (!ok) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
    return 0;
  }
  if (argc == 5 && !std::strcmp(argv[1], "build") && !std::strcmp(argv[3], "-o")) {  // zinc build <file> -o <out>: compile to C++ and then to a native program
    static std::string bundleExe;
    if (!gBundleOut.empty()) {   // --bundle: <out> is the .app, the program is linked into it
#ifdef __APPLE__
      gBundleOut = argv[4];
      std::string pf = zn::frontend::findProjectFile(argv[2]);
      zn::frontend::Project proj;
      std::string perr;
      if (!pf.empty()) { std::ifstream in(pf); std::stringstream ss; ss << in.rdbuf(); if (!zn::frontend::parseProject(ss.str(), proj, perr)) { std::fprintf(stderr, "zinc: %s: %s\n", pf.c_str(), perr.c_str()); return 2; } }
      if (proj.app.id.empty()) { std::fprintf(stderr, "zinc: --bundle needs \"app\": { \"id\": ... } in zinc.json\n"); return 2; }
      gBundleSpec = bundleSpecOf(proj, pf.empty() ? "." : std::filesystem::path(pf).parent_path().string());
      std::error_code mk;
      std::filesystem::create_directories(std::filesystem::path(gBundleOut) / "Contents/MacOS", mk);
      bundleExe = (std::filesystem::path(gBundleOut) / "Contents/MacOS" / gBundleSpec.exeName).string();
      argv[4] = bundleExe.data();
#else
      std::fprintf(stderr, "zinc: build --bundle writes macOS bundles; the Linux AppDir is not written yet\n");
      return 2;
#endif
    }
    zn::zbc::Module zm;
    if (int rc = compileToZbc(argv[2], zm)) return rc;
    installDisplayDriver("", argv[2]);   // a board or a display driver of the project: the driver is linked into the program
    namespace fs = std::filesystem;
    fs::path libs = fs::absolute(argv[0]).parent_path(), cpp = fs::path(argv[4]).string() + ".cpp";
    std::vector<std::uint8_t> blob;
    if (zn::aot::usesHost(zm)) {
      std::string err;
      if (!bakeResources(argv[2], blob, err)) { std::fprintf(stderr, "zinc: cannot bake the fonts and images: %s\n", err.c_str()); return 1; }
    }
    { std::ofstream o(cpp); std::string text = zn::aot::emitCpp(zm, blob.empty() ? nullptr : &blob); if (!gBakedSize.empty()) { std::size_t at = text.find("int main() {\n"); if (at != std::string::npos) text.insert(at + 13, "  setenv(\"ZINC_SIZE\", \"" + gBakedSize + "\", 0);   // the board's surface\n"); } o << text; if (!o) { std::fprintf(stderr, "cannot write %s\n", cpp.c_str()); return 2; } }
    const char* cxx = std::getenv("CXX");
    bool haveLibs = fs::exists(libs / "libzn_rt.a");
    bool haveCxx = cxx || std::system("command -v c++ >/dev/null 2>&1") == 0;
    if (!haveLibs || !haveCxx) {  // a packaged zinc on a machine without a compiler: the pinned zig builds the program for this machine (no graphics host in that path)
      if (zn::aot::usesHost(zm)) { std::fprintf(stderr, "zinc: a program that draws needs a C++ compiler on this machine (install one, or set CXX)\n"); fs::remove(cpp); return 1; }
      std::string zig, err;
      if (!zn::tc::ensureZig(zig, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); fs::remove(cpp); return 1; }
      bool ok = zn::tc::crossBuild(zig, gRoot, cpp.string(), zn::tc::hostName(), argv[4], err);
      if (!std::getenv("ZN_KEEP_CPP")) fs::remove(cpp);
      if (!ok) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
      return 0;
    }
    bool usesScript = false;
    for (const auto& nt : zm.natives) usesScript = usesScript || nt.module == "QuickJS";
    std::string nativeLibs = usesScript ? " '" + (libs / "libzn_script.a").string() + "' '" + (libs / "libzn_quickjs.a").string() + "'" : std::string();  // the plugins' native code that the program calls: their static archives and the libraries they need (and the host library, for zrt)
    for (const zn::tc::PluginLib& pl : gPlugins) {
      if (pl.display) {   // a display driver registers from a static constructor: link its objects whole, nothing refers to them
#ifdef __APPLE__
        nativeLibs += " -Wl,-force_load,'" + pl.archive + "'";
#else
        nativeLibs += " -Wl,--whole-archive '" + pl.archive + "' -Wl,--no-whole-archive";
#endif
      } else nativeLibs += " '" + pl.archive + "'";
      if (!pl.vendor.empty()) nativeLibs += " '" + pl.vendor + "'";
      for (const std::string& a : pl.linkArgs) nativeLibs += " " + a;
    }
    std::string cmd = std::string(cxx ? cxx : "c++") + " -std=c++20 -O2 -w -ffp-contract=off -I '" + gRoot + "/include' -I '" + gRoot + "/src' -I '" + gRoot + "/third_party/mimalloc/include' '" + cpp.string() + "' '" + (libs / "libzn_rt.a").string() + "' '" + (libs / "libzn_mimalloc.a").string() + "' '" +
                      (libs / "libzn_zbc.a").string() + "' '" + (libs / "libzn_ir.a").string() + "' '" + (libs / "libzn_frontend.a").string() + "'" + (fs::exists(libs / "libzn_regexp.a") ? " '" + (libs / "libzn_regexp.a").string() + "'" : std::string()) + " '" + (libs / "libzn_native.a").string() + "'" + (!zm.natives.empty() && fs::exists(libs / "libzn_native_fixture.a") ? " '" + (libs / "libzn_native_fixture.a").string() + "'" : std::string()) +   // the native registry; libunicode: the string runtime needs it
                      (!nativeLibs.empty() ? nativeLibs : std::string()) + ((zn::aot::usesHost(zm) || !nativeLibs.empty()) && fs::exists(libs / "libzn_host_gfx.a") ? " '" + (libs / "libzn_host_gfx.a").string() + "'" + (fs::exists(libs / "libzn_codec.a") ? " '" + (libs / "libzn_codec.a").string() + "'" : std::string()) + (fs::exists(libs / "libzn_uv.a") ? " '" + (libs / "libzn_uv.a").string() + "'" : std::string()) + (fs::exists(libs / "libzn_llhttp.a") ? " '" + (libs / "libzn_llhttp.a").string() + "'" : std::string()) + (fs::exists(libs / "libzn_mbedtls.a") ? " '" + (libs / "libzn_mbedtls.a").string() + "'" : std::string()) + (fs::exists(libs / "libzn_regexp.a") ? " '" + (libs / "libzn_regexp.a").string() + "'" : std::string()) + " -lpthread" HOSTLIBS : std::string()) + " -o '" + argv[4] + "'";  // the graphics host, used by programs that call it
    int rc = std::system(cmd.c_str());
    if (!std::getenv("ZN_KEEP_CPP")) fs::remove(cpp);
    if (rc != 0) { std::fprintf(stderr, "the C++ compiler failed: %s\n", cmd.c_str()); return 1; }
    if (!gBundleOut.empty()) {
      std::string berr;
      if (!zn::tc::writeBundle(gBundleSpec, bundleExe, gBundleOut, berr)) { std::fprintf(stderr, "zinc: bundle: %s\n", berr.c_str()); return 1; }
      std::fprintf(stderr, "zinc: wrote %s (ad-hoc signed; to sign for distribution: codesign --force --options runtime --sign \"Developer ID Application: ...\" %s)\n", gBundleOut.c_str(), gBundleOut.c_str());
    }
    return 0;
  }
  if (argc == 3 && !std::strcmp(argv[1], "--emit=cpp")) {  // zinc --emit=cpp <file>: the C++ of the AOT build
    zn::zbc::Module zm;
    if (int rc = compileToZbc(argv[2], zm)) return rc;
    std::fputs(zn::aot::emitCpp(zm).c_str(), stdout);
    return 0;
  }
  if (argc == 3 && !std::strcmp(argv[1], "--emit=zbc")) { // zinc --emit=zbc <file>: disassembly
    zn::zbc::Module zm;
    if (int rc = compileToZbc(argv[2], zm)) return rc;
    std::fputs(zn::zbc::disassemble(zm).c_str(), stdout);
    return 0;
  }
  if (argc == 4 && !std::strcmp(argv[1], "--emit=zbc-bin")) {  // zinc --emit=zbc-bin <file> <out.zbc>
    zn::zbc::Module zm;
    if (int rc = compileToZbc(argv[2], zm)) return rc;
    auto bytes = zn::zbc::encode(zm);
    std::ofstream out(argv[3], std::ios::binary);
    out.write(reinterpret_cast<const char*>(bytes.data()), static_cast<std::streamsize>(bytes.size()));
    return out ? 0 : 2;
  }
  if (argc == 4 && !std::strcmp(argv[1], "zbc")) {  // zinc zbc --check|--dump <file.zbc>: decode and verify a bytecode file
    std::ifstream in(argv[3], std::ios::binary);
    if (!in) { std::fprintf(stderr, "cannot read %s\n", argv[3]); return 2; }
    std::vector<std::uint8_t> bytes((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
    zn::zbc::Module zm;
    std::string err;
    if (!zn::zbc::decode(bytes, zm, err)) { std::fprintf(stderr, "%s: %s\n", argv[3], err.c_str()); return 1; }
    err = zn::zbc::verify(zm);
    if (!err.empty()) { std::fprintf(stderr, "%s: invalid ZBC: %s\n", argv[3], err.c_str()); return 1; }
    if (!std::strcmp(argv[2], "--dump")) std::fputs(zn::zbc::disassemble(zm).c_str(), stdout);
    return 0;
  }
  if (argc == 4 && !std::strcmp(argv[1], "lex")) {  // zinc lex --check|--dump <file>
    std::ifstream in(argv[3], std::ios::binary);
    if (!in) { std::fprintf(stderr, "cannot read %s\n", argv[3]); return 2; }
    std::stringstream buf;
    buf << in.rdbuf();
    std::string src = buf.str();
    std::string_view name = argv[3];
    auto toks = zn::frontend::lex(src, name.size() >= 4 && name.substr(name.size() - 4) == ".tsx");
    if (!std::strcmp(argv[2], "--dump")) { std::fputs(zn::frontend::dump(src, toks).c_str(), stdout); return 0; }
    std::string err = zn::frontend::check(src, toks);
    if (!err.empty()) { std::fprintf(stderr, "%s: %s\n", argv[3], err.c_str()); return 1; }
    return 0;
  }
  if (argc == 4 && !std::strcmp(argv[1], "parse")) {  // zinc parse --check|--dump <file>
    std::ifstream in(argv[3], std::ios::binary);
    if (!in) { std::fprintf(stderr, "cannot read %s\n", argv[3]); return 2; }
    std::stringstream buf;
    buf << in.rdbuf();
    std::string src = buf.str();
    auto res = zn::frontend::parse(src);
    for (const auto& d : res.diags) std::fprintf(stderr, "%s\n", zn::frontend::format(d, src, argv[3]).c_str());
    if (!res.diags.empty()) return 1;
    if (!std::strcmp(argv[2], "--dump")) { std::fputs(zn::frontend::dump(res.ast).c_str(), stdout); return 0; }
    std::string err = zn::frontend::validate(res.ast);
    if (!err.empty()) { std::fprintf(stderr, "%s: %s\n", argv[3], err.c_str()); return 1; }
    return 0;
  }
  if (argc >= 3 && !std::strcmp(argv[1], "native-gen")) {  // zinc native-gen [--c] <x.spec.ts> [outdir]: zinc_native_<x>.h (zrt types, for the plugins' x.host.cpp), or with --c the export table for include/zn/native.h
    bool c = !std::strcmp(argv[2], "--c"), thunk = !std::strcmp(argv[2], "--thunk");
    int first = c || thunk ? 3 : 2;
    if (argc <= first) { std::fprintf(stderr, "usage: zinc native-gen [--c] <x.spec.ts> [outdir]\n"); return 2; }
    std::ifstream in(argv[first]);
    if (!in) { std::fprintf(stderr, "zinc: cannot read %s\n", argv[first]); return 2; }
    std::string text((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
    zn::frontend::NativeGen g;
    std::string err;
    if (!zn::frontend::generateNative(argv[first], text, g, err)) { std::fprintf(stderr, "%s: %s\n", argv[first], err.c_str()); return 1; }
    std::string lower = g.name;
    for (char& ch : lower) ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
    if (thunk && g.thunk.empty()) { std::fprintf(stderr, "%s: no thunk: %s\n", argv[first], g.thunkNote.c_str()); return 1; }
    if (c && g.cHeader.empty()) { std::fprintf(stderr, "%s: no C header: %s\n", argv[first], g.cNote.c_str()); return 1; }
    std::string dir = argc > first + 1 ? argv[first + 1] : ".";
    std::string file = dir + "/zinc_native_" + lower + (c ? "_abi.h" : thunk ? "_thunk.cpp" : ".h");
    std::ofstream o(file);
    o << (c ? g.cHeader : thunk ? g.thunk : g.cppHeader);
    if (!o) { std::fprintf(stderr, "zinc: cannot write %s\n", file.c_str()); return 2; }
    std::printf("%s\n", file.c_str());
    return 0;
  }
  if (argc == 4 && !std::strcmp(argv[1], "check") && !std::strcmp(argv[2], "--json")) {  // zinc check --json <file>: the diagnostics as LSP-shaped JSON on stdout (what the prototype prints), exit 1 when there are errors
    zn::frontend::Program prog = zn::frontend::loadProgram(argv[3], readFile, gStrict, gRoot + "/../lib/std");
    std::vector<zn::frontend::Diag> diags = prog.diags;
    if (diags.empty()) { zn::frontend::Checked checked = zn::frontend::check(prog.ast); diags = checked.diags; }
    auto quote = [](const std::string& t) { std::string q = "\""; for (char c : t) { if (c == '"' || c == '\\') { q += '\\'; q += c; } else if (c == '\n') q += "\\n"; else if (static_cast<unsigned char>(c) < 32) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", c); q += b; } else q += c; } return q + "\""; };
    std::string out = "[";
    for (std::size_t k = 0; k < diags.size(); ++k) {
      const zn::frontend::Diag& d = diags[k];
      std::string line = zn::frontend::formatDiag(prog, d);   // file:line:col: error Zxxxx: message
      std::size_t a = line.find(':'), b = line.find(':', a + 1), c = line.find(':', b + 1);
      std::string file = line.substr(0, a);
      int ln = std::atoi(line.c_str() + a + 1), col = std::atoi(line.c_str() + b + 1);
      std::size_t m = line.find(": error ", c);
      std::string message = m == std::string::npos ? line.substr(c + 1) : line.substr(line.find(": ", m + 8) + 2);
      out += std::string(k ? ",\n" : "\n") + "  {\"uri\": " + quote(file) + ", \"range\": {\"start\": {\"line\": " + std::to_string(ln - 1) + ", \"character\": " + std::to_string(col - 1) + "}}, \"code\": " + quote(d.code) + ", \"severity\": 1, \"message\": " + quote(message) + "}";
    }
    out += diags.empty() ? "]\n" : "\n]\n";
    std::fputs(out.c_str(), stdout);
    return diags.empty() ? 0 : 1;
  }
  if (argc == 4 && !std::strcmp(argv[1], "check")) {  // zinc check --check|--types <file>: parse, then check
    zn::frontend::Program prog;
    zn::frontend::Checked checked;
    if (!loadChecked(argv[3], prog, checked)) return 1;
    if (!std::strcmp(argv[2], "--types")) std::fputs(zn::frontend::dumpTypes(checked, prog.ast, prog.files[0].text).c_str(), stdout);
    return 0;
  }
  if (argc >= 2 && !std::strcmp(argv[1], "update")) {  // zinc update [--check] [manifest-url]: look for a newer release; without --check, download and verify it
    bool checkOnly = argc >= 3 && !std::strcmp(argv[2], "--check");
    const char* url = argc >= (checkOnly ? 4 : 3) ? argv[checkOnly ? 3 : 2] : std::getenv("ZINC_UPDATE_URL");
    if (!url || !*url) { std::fprintf(stderr, "usage: zinc update [--check] <manifest-url>   (or set ZINC_UPDATE_URL)\n"); return 2; }
    zn::tc::UpdateInfo info;
    std::string err;
    if (!zn::tc::fetchManifest(url, info, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
    if (!zn::tc::newerVersion(info.version, kVersionText)) { std::printf("zinc %s is up to date (latest %s)\n", kVersionText, info.version.c_str()); return 0; }
    std::printf("zinc %s is available (this is %s)%s%s\n", info.version.c_str(), kVersionText, info.notes.empty() ? "" : ": ", info.notes.c_str());
    if (checkOnly) return 10;  // an update exists
    std::string path;
    if (!zn::tc::downloadUpdate(info, zn::tc::home() + "/updates", path, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
    std::printf("downloaded and verified: %s\nopen it to install (the macOS app: drag it over the old one; Linux: unpack over the old directory)\n", path.c_str());
    return 0;
  }
  if (argc >= 2 && !std::strcmp(argv[1], "plugins")) {  // zinc plugins [project-dir] [--defines <plugin> [target]]: the toolbox table (the engine's plugins/, the project's, its pluginDirs), or the C++ defines one plugin gets
    std::vector<std::string> problems;
    std::string project = argc >= 3 && std::strncmp(argv[2], "--", 2) ? argv[2] : ".";
    std::string root = gRoot + "/..";
    auto found = zn::frontend::discoverPlugins(root, project, problems);
    int rc = problems.empty() ? 0 : 1;
    if (argc >= 5 && !std::strcmp(argv[argc - (argc >= 6 ? 3 : 2)], "--defines")) {
      std::string name = argv[argc - (argc >= 6 ? 2 : 1)], target = argc >= 6 ? argv[argc - 1] : "macos";
      bool hit = false;
      for (const auto& f : found) if (f.manifest.name == name) { hit = true; for (const std::string& d : zn::frontend::pluginDefines(f, project, root, target)) std::printf("%s\n", d.c_str()); }
      if (!hit) { std::fprintf(stderr, "zinc: no plugin named '%s'\n", name.c_str()); rc = 1; }
    } else std::fputs(zn::frontend::listPlugins(found).c_str(), stdout);
    for (const std::string& p : problems) std::fprintf(stderr, "zinc: %s\n", p.c_str());
    return rc;
  }
  if (argc >= 3 && !std::strcmp(argv[1], "plugin-build")) {  // zinc plugin-build <plugin> [project-dir]: compile the plugin's native code into the cache (or find it there) and say where it is
    std::string project = argc >= 4 ? argv[3] : ".";
    std::vector<std::string> problems;
    auto found = zn::frontend::discoverPlugins(gRoot + "/..", project, problems);
    const zn::frontend::FoundPlugin* hit = nullptr;
    for (const auto& f : found) if (f.manifest.name == argv[2]) hit = &f;
    if (!hit) { std::fprintf(stderr, "zinc: no plugin named '%s' (zinc plugins lists them)\n", argv[2]); return 1; }
    zn::tc::PluginLib lib;
    std::string err;
    if (!zn::tc::buildPlugin(*hit, gRoot, project, zn::tc::pluginTarget(), lib, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
    std::printf("%s %s %.2fs %s\n", lib.plugin.c_str(), lib.rebuilt ? "built" : "cached", lib.seconds, lib.shared.c_str());
    return 0;
  }
  if (argc == 4 && !std::strcmp(argv[1], "ir") && !std::strcmp(argv[2], "--check")) {  // zinc ir --check <file.ir>: read a dump back, verify it, and check that it dumps to the same text
    std::string text, err;
    if (!readFile(argv[3], text)) { std::fprintf(stderr, "cannot read %s\n", argv[3]); return 2; }
    zn::ir::Module m;
    if (!zn::ir::parse(text, m, err)) { std::fprintf(stderr, "%s: %s\n", argv[3], err.c_str()); return 1; }
    std::string bad = zn::ir::verify(m);
    if (!bad.empty()) { std::fprintf(stderr, "%s: invalid IR: %s\n", argv[3], bad.c_str()); return 1; }
    if (zn::ir::dump(m) != text) { std::fprintf(stderr, "%s: the dump read back differs from the file (not in canonical form)\n", argv[3]); return 1; }
    std::printf("ok: zir %d, %zu classes, %zu functions\n", zn::ir::kTextVersion, m.classes.size(), m.functions.size());
    return 0;
  }
  if (argc == 3 && (!std::strcmp(argv[1], "--emit=ir") || !std::strcmp(argv[1], "--emit=ir-rc"))) {  // zinc --emit=ir <file>: parse, check, lower, verify, dump
    zn::frontend::Program prog;
    zn::frontend::Checked checked;
    if (!loadChecked(argv[2], prog, checked)) return 1;
    auto low = zn::ir::lower(prog.ast, checked, prog.files[0].text);
    if (low.diags.empty()) {
      if (!std::strcmp(argv[1], "--emit=ir-rc")) { if (!std::getenv("ZN_NO_OPT")) zn::ir::optimize(low.module, gDeviceCore); zn::ir::insertRc(low.module); }
      std::string bad = zn::ir::verify(low.module);
      if (!bad.empty()) { std::fprintf(stderr, "internal error: invalid IR: %s\n", bad.c_str()); if (std::getenv("ZN_DUMP_BAD")) { std::string d = zn::ir::dump(low.module); std::fwrite(d.data(), 1, d.size(), stdout); } return 3; }
      std::fputs(zn::ir::dump(low.module).c_str(), stdout);
      return 0;
    }
    for (const auto& d : low.diags) std::fprintf(stderr, "%s\n", zn::frontend::formatDiag(prog, d).c_str());
    return 1;
  }
  if (argc == 3 && !std::strcmp(argv[1], "explain")) {  // zinc explain Z0001|--markdown|--codes
    std::string out = !std::strcmp(argv[2], "--markdown") ? zn::frontend::markdown()
                    : !std::strcmp(argv[2], "--codes")    ? zn::frontend::codes()
                                                          : zn::frontend::explain(argv[2]);
    if (out.empty()) { std::fprintf(stderr, "unknown diagnostic code: %s\n", argv[2]); return 1; }
    std::fputs(out.c_str(), stdout);
    return 0;
  }
  std::fputs("usage: zinc --version | lex|parse --check|--dump <file> | explain <code>\n", stderr);
  return 2;
}
