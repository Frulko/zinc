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
#include "gl/webgl_js.h"
#include "zn/js_ext.h"
#include "tc/bundle.h"
#include "ir/ir.h"
#include "aot/aot.h"
#include "zn/host.h"
#include "prof/prof.h"
#include "res/res.h"
#include "zn/hostsys.h"
#include "qjs/qjs.h"
#ifdef ZN_HOST_LIBS
#define HOSTLIBS + std::string(" ") + hostLibs()   // the window library the host links (@bin@: the directory of this zinc, ZN-333)
#else
#define HOSTLIBS
#endif
#include "frontend/profile.h"
int runTestCommand(const std::string& self, const zn::frontend::Profile& p, const std::string& engineRoot, std::string dir, const std::string& runner);   // src/test_cmd.cpp
#include "tc/plugin_build.h"
#include "tc/policy.h"
#include "tc/tc.h"
#include "sim/program_dut.h"
#include "sim/replay.h"
#include "dev/client.h"
#include "dev/core.h"
#include <unistd.h>
#include "vm/vm.h"
#include "zbc/zbc.h"
#include "zapp.h"
#include <thread>
#include <set>
#include "host/permissions.h"
namespace zn::text { void installSegmenter(); void installShapedGfx(); }
#ifdef ZN_HOST_GFX
#include "res/codec.h"
namespace zrt::raster { bool image_size(int32_t id, int32_t* w, int32_t* h); void dyn_resize(int32_t id, int32_t w, int32_t h); uint32_t* dyn_pixels(int32_t id); void dyn_update(int32_t id, const uint32_t* px, int32_t stride); }   // gl.zincPresent (ZN-205)
namespace zrt::gfx { extern uint8_t* (*encode_webp_hook)(const uint32_t* px, int32_t w, int32_t h, size_t* n, void* (*alloc)(size_t)); }
// ZINC_SHOT=*.webp and `zinc capture --format webp`: lossless WebP (ZN-226)
static uint8_t* webpShot(const uint32_t* px, int32_t w, int32_t h, size_t* n, void* (*alloc)(size_t)) {
  std::vector<uint8_t> rgb(static_cast<size_t>(w) * h * 3);
  for (size_t i = 0; i < static_cast<size_t>(w) * h; ++i) { rgb[i * 3] = static_cast<uint8_t>(px[i] >> 16); rgb[i * 3 + 1] = static_cast<uint8_t>(px[i] >> 8); rgb[i * 3 + 2] = static_cast<uint8_t>(px[i]); }
  std::vector<uint8_t> out = zn::res::encodeWebp(rgb.data(), w, h, 3, true);
  uint8_t* o = out.empty() ? nullptr : static_cast<uint8_t*>(alloc(out.size()));
  if (o) { std::memcpy(o, out.data(), out.size()); *n = out.size(); }
  return o;
}
#endif
#include "vm/vm.h"
#include "vm/vm.h"
#include "zbc/zbc.h"

static const char* const kVersionText = "0.0.1";
#ifdef ZN_HOST_LIBS
static std::string hostLibs() {   // ZN_HOST_LIBS with @bin@ (the directory of this zinc, where the build tree keeps libSDL3.a) filled in
  std::string s = ZN_HOST_LIBS;
  const std::string bin = std::filesystem::path(zn::tc::executablePath()).parent_path().string();
  for (std::size_t at; (at = s.find("@bin@")) != std::string::npos;) s.replace(at, 5, bin);
  return s;
}
#endif
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
  zn::cli::warnRevoked(gProjectDir);   // plugins of zinc.lock the index revoked (ZN-345)
  zn::tc::loadPolicy(gProjectDir);     // the trust policy of the plugins built for it (ZN-346)
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
  zn::frontend::gNativeLive = [](const std::string& module) {
    const char* det = std::getenv("ZINC_DETERMINISTIC");
    if (det && *det && std::strcmp(det, "0")) return false;
    std::vector<std::string> problems;
    auto found = zn::frontend::discoverPlugins(gRoot + "/..", gProjectDir, problems);
    const zn::frontend::FoundPlugin* p = zn::tc::pluginForModule(found, module);
    return p && p->manifest.live;
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
static std::string gBuildTarget;   // the machine a `run --target` / `build --target` compiles for (its ui.layout rules, ZN-285); "" = the profile or this host
static bool gStrict = false;  // --strict (a file-local switch of the command line, set once in main)

// The system permissions of the zinc.json that governs `path`, for the compile (an import of zinc:system/<feature> needs its id); a manifest rule that fails stops the command.
static bool loadManifestPermissions(const char* path) {
  static std::vector<std::string> granted;
  granted.clear();
  std::string appJson, scopesJson, uiLayout = "classic";
  std::string pf = zn::frontend::findProjectFile(path);
  zn::frontend::Project p;
  if (!pf.empty()) {
    std::ifstream in(pf);
    std::stringstream ss; ss << in.rdbuf();
    std::string err;
    if (!zn::frontend::parseProject(ss.str(), p, err)) { if (p.fatal) { std::fprintf(stderr, "zinc: %s: %s\n", pf.c_str(), err.c_str()); return false; } }
    else { granted = zn::frontend::permissionsFor(p, gProfile ? gProfile->name : zn::tc::pluginTarget()); appJson = p.app.json; scopesJson = p.scopes; }
  }
  {  // the layout engine (ZN-285): zinc.json "ui", or ZINC_UI_LAYOUT for a run (ZN-286), against the rules of the machine compiled for
    if (const char* forced = std::getenv("ZINC_UI_LAYOUT"); forced && *forced) p.uiLayout = forced;
    const std::string target = !gBuildTarget.empty() ? gBuildTarget : gProfile ? gProfile->name : zn::tc::pluginTarget();
    std::string lerr;
    zn::frontend::Caps caps;
    if (const zn::frontend::Profile* tp = zn::frontend::findProfile(target)) caps = zn::frontend::capsFromFile(*tp, gRoot + "/../targets/capabilities.json");
    if (p.uiLayout != "" && p.uiLayout != "classic" && p.uiLayout != "rn" && p.uiLayout != "auto") { std::fprintf(stderr, "zinc: ZINC_UI_LAYOUT must be classic, rn or auto\n"); return false; }
    if (!zn::frontend::resolveUiLayout(p, caps, target, uiLayout, lerr)) { std::fprintf(stderr, "zinc: %s: %s\n", pf.empty() ? "ZINC_UI_LAYOUT" : pf.c_str(), lerr.c_str()); return false; }
  }
  zn::frontend::setUiLayout(uiLayout);
  zn::frontend::setUiPreset(p.uiPreset);
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
  if (zn::frontend::uiPreset() != "react-native") return zn::res::bake(gSources, o, blob, err);
  std::vector<std::string> src = gSources;
  src.push_back("text-[14px]");   // React Native's default text size under the preset (ZN-385)
  return zn::res::bake(src, o, blob, err);
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
      if (gProfile) { out.profile = gProfile->name; out.heapBytes = static_cast<std::uint32_t>(std::min<std::uint64_t>(gProfile->heapBytes, 0xFFFFFFFFu)); }
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
  const std::string who = b.name.empty() ? "This app" : b.name;   // macOS asks the user with these strings; without them the request fails (ZN-322.03)
  for (const std::string& e : p.permissions) {
    if (e == "camera") b.usage.push_back({"NSCameraUsageDescription", who + " uses the camera."});
    else if (e == "microphone") b.usage.push_back({"NSMicrophoneUsageDescription", who + " uses the microphone."});
    else if (e == "location") { b.usage.push_back({"NSLocationWhenInUseUsageDescription", who + " uses your location."}); b.usage.push_back({"NSLocationUsageDescription", who + " uses your location."}); }
  }
  return b;
}
// zinc.json "permissions" (ZN-322.03): the generated main of a program that calls the host enforces them from its first instruction.
static void injectPermissions(const std::string& cpp, const char* entry, const std::string& target) {
  std::string pf = zn::frontend::findProjectFile(entry);
  zn::frontend::Project proj;
  std::string perr;
  if (pf.empty()) return;
  { std::ifstream in(pf); std::stringstream ss; ss << in.rdbuf(); if (!zn::frontend::parseProject(ss.str(), proj, perr)) return; }
  if (!proj.permissionsDeclared) return;
  std::string joined;
  for (const std::string& e : zn::frontend::permissionsFor(proj, target)) {
    for (char c : e) { if (c == '"' || c == '\\') joined += '\\'; joined += c; }
    joined += "\\n";
  }
  std::string text;
  { std::ifstream in(cpp); std::stringstream ss; ss << in.rdbuf(); text = ss.str(); }
  std::size_t at = text.find("  zn::host::installGfx();\n"), mainAt = text.find("int main() {\n");
  if (at == std::string::npos || mainAt == std::string::npos) return;
  text.insert(at, "  zn_host_permissions_enforce(\"" + joined + "\");\n");
  text.insert(mainAt, "extern \"C\" void zn_host_permissions_enforce(const char*);\n");
  std::ofstream o(cpp); o << text;
}
// What a program links, for the SBOM and licences of `zinc export` (ZN-323): the scopes of third_party/components.json its link command pulls in, and its plugins.
static void writeComponents(const std::string& file, const std::string& link, const std::vector<zn::tc::PluginLib>& plugins) {
  if (!std::getenv("ZINC_COMPONENTS")) return;   // asked by zinc export only: a plain build leaves no file beside the program
  std::ofstream cf(file);
  cf << "runtime\n";
  if (link.find("zn_host_gfx") != std::string::npos) cf << "host\n";
  if (link.find("zn_yoga") != std::string::npos) cf << "rn\n";
  if (link.find("zn_harfbuzz") != std::string::npos) cf << "shaped\n";
  if (link.find("zn_quickjs") != std::string::npos) cf << "script\n";
  if (link.find("zn_frontend") != std::string::npos) cf << "frontend\n";
  for (const zn::tc::PluginLib& pl : plugins) if (!pl.display) cf << "plugin:" << pl.plugin << "\n";
}
// A .zapp archive (ZN-318), checked and unpacked once into ~/.zinc/cache/zapp/<sha>; `zbc` is its program. False with `err` when refused.
static bool unpackZapp(const std::string& archive, std::string& zbc, std::string& err) {
  namespace fs = std::filesystem;
  std::map<std::string, std::string> files;
  if (!zn::zapp::unpack(archive, kVersionText, files, err)) return false;
  if (!files.count("program.zbc")) { err = "the archive has no program.zbc"; return false; }
  const fs::path dir = fs::path(zn::tc::home()) / "cache" / "zapp" / zn::tc::sha256Hex(archive).substr(0, 24);
  std::error_code ec;
  if (!fs::exists(dir / "program.zbc", ec)) {
    const fs::path tmp = dir.string() + ".part" + std::to_string(::getpid());
    for (const auto& [n, bytes] : files) {
      fs::create_directories((tmp / n).parent_path(), ec);
      std::ofstream o(tmp / n, std::ios::binary); o.write(bytes.data(), static_cast<std::streamsize>(bytes.size()));
    }
    fs::create_directories(dir.parent_path(), ec);
    fs::rename(tmp, dir, ec);
    if (ec) fs::remove_all(tmp, ec);   // another run unpacked it first
  }
  zbc = (dir / "program.zbc").string();
  return true;
}
// A fused executable (ZN-319): this binary followed by a .zapp and a 16-byte trailer, the archive's size (8 bytes, little endian) and "ZNFUSED1".
static const char kFuseMagic[9] = "ZNFUSED1";
static bool fusedArchive(std::string& archive) {
  std::ifstream f(zn::tc::executablePath(), std::ios::binary | std::ios::ate);
  if (!f) return false;
  const std::streamoff end = f.tellg();
  if (end < 16) return false;
  char t[16];
  f.seekg(end - 16); f.read(t, 16);
  if (!f || std::memcmp(t + 8, kFuseMagic, 8) != 0) return false;
  std::uint64_t n = 0;
  for (int i = 7; i >= 0; --i) n = (n << 8) | static_cast<unsigned char>(t[i]);
  if (n == 0 || static_cast<std::streamoff>(n) > end - 16) return false;
  archive.resize(n);
  f.seekg(end - 16 - static_cast<std::streamoff>(n)); f.read(archive.data(), static_cast<std::streamsize>(n));
  return static_cast<bool>(f);
}
// App updates at launch (ZN-324.02). ~/.zinc/apps/<id>/ holds `staged` (the path of a verified update to try), `current` (the update in use) and
// `trial` (written when a staged update starts; removed when it proves healthy). A launch finding `trial` left behind means the update on trial
// crashed: it is dropped and the previous version runs. Nothing is overwritten, so a fused executable updates the same way as a .zapp.
static std::string gTrialDir;   // set while a staged update runs on trial: promoted once it ran 5 s or exited normally
static void promoteTrial() {
  namespace fs = std::filesystem;
  if (gTrialDir.empty()) return;
  std::error_code ec;
  std::ifstream sf(gTrialDir + "/staged"); std::string staged; std::getline(sf, staged); sf.close();
  if (!staged.empty()) { std::ofstream(gTrialDir + "/current") << staged << "\n"; }
  fs::remove(gTrialDir + "/staged", ec); fs::remove(gTrialDir + "/trial", ec);
  gTrialDir.clear();
}
static std::string chooseAppVersion(const std::string& zbc) {
  namespace fs = std::filesystem;
  std::ifstream pf(fs::path(zbc).parent_path() / "zinc.json");
  std::stringstream ps; ps << pf.rdbuf();
  zn::frontend::Project proj; std::string err;
  if (!pf || !zn::frontend::parseProject(ps.str(), proj, err) || proj.app.id.empty() || proj.updateKey.empty()) return zbc;
  const std::string dir = zn::tc::home() + "/apps/" + proj.app.id;
  const std::string base = proj.app.version.empty() ? "0.0.0" : proj.app.version;
  std::error_code ec;
  auto line = [](const std::string& f) { std::ifstream in(f); std::string l; std::getline(in, l); return l; };
  auto versionOf = [&](const std::string& zappPath, std::string& out) {   // unpacked (and checked) with its own manifest's version
    std::ifstream zf(zappPath, std::ios::binary);
    std::stringstream zs; zs << zf.rdbuf();
    if (!zf || !unpackZapp(zs.str(), out, err)) return std::string();
    std::ifstream jf(fs::path(out).parent_path() / "zinc.json"); std::stringstream js; js << jf.rdbuf();
    zn::frontend::Project p2; std::string e2;
    return zn::frontend::parseProject(js.str(), p2, e2) && p2.app.id == proj.app.id ? (p2.app.version.empty() ? "0.0.0" : p2.app.version) : std::string();
  };
  if (fs::exists(dir + "/trial", ec)) {   // the update on trial did not make it: back to the previous version
    std::fprintf(stderr, "zinc: the update %s of %s failed to start; it was rolled back\n", line(dir + "/staged").c_str(), proj.app.id.c_str());
    fs::remove(dir + "/trial", ec); fs::remove(dir + "/staged", ec);
  }
  std::string run = zbc, best = base, z;
  const std::string current = line(dir + "/current");
  if (!current.empty()) { std::string v = versionOf(current, z); if (!v.empty() && zn::tc::newerVersion(v, best)) { run = z; best = v; } }
  const std::string staged = line(dir + "/staged");
  if (!staged.empty()) {
    std::string v = versionOf(staged, z);
    if (!v.empty() && zn::tc::newerVersion(v, best)) { std::ofstream(dir + "/trial") << v << "\n"; gTrialDir = dir; std::atexit(promoteTrial); return z; }
    fs::remove(dir + "/staged", ec);   // not newer than what runs (or unreadable): nothing to try
  }
  return run;
}
// The app API of updates (ZN-324.03), called by the system plugin (zinc:system/update) through this weak symbol: the running app's zinc.json
// update block (set by `zinc run`), the launch arguments for a restart.
static zn::frontend::Project gUpdProject;
static std::vector<std::string> gLaunchArgs;   // argv as the process got it, before a fused app or a .zapp rewrote it
static std::string* gRunOut = nullptr;          // what the running program printed so far (the VM writes it out at the end): a restart prints it first
static int updateReply(char* out, int cap, const std::string& json) { std::snprintf(out, static_cast<std::size_t>(cap), "%s", json.c_str()); return 1; }
static std::string jsonText(const std::string& s) { std::string o = "\""; for (char c : s) { if (c == '"' || c == '\\') o += '\\'; if (c == '\n') { o += "\\n"; continue; } o += c; } return o + "\""; }
extern "C" int zn_host_update(const char* op, const char* args, char* out, int cap) {
  (void)args;
  const zn::frontend::Project& p = gUpdProject;
  const std::string what = op ? op : "";
  auto failed = [&](const std::string& m) { return updateReply(out, cap, "{\"error\":{\"code\":\"failed\",\"message\":" + jsonText(m) + "}}"); };
  if (what == "update.healthy") { promoteTrial(); return updateReply(out, cap, "{}"); }
  if (what == "update.restart") {
    if (gRunOut) { std::fwrite(gRunOut->data(), 1, gRunOut->size(), stdout); gRunOut->clear(); }
    std::fflush(stdout); std::fflush(stderr);
    std::vector<char*> av;
    std::string exe = zn::tc::executablePath();
    for (std::string& a : gLaunchArgs) av.push_back(a.data());
    av.push_back(nullptr);
    execv(exe.c_str(), av.data());
    return failed(std::string("cannot restart: ") + std::strerror(errno));
  }
  if (p.updateKey.empty() || p.updateUrl.empty()) return failed("zinc.json has no \"update\": { \"url\", \"publicKey\" }");
  const std::string channel = p.updateChannel.empty() ? "stable" : p.updateChannel, version = p.app.version.empty() ? "0.0.0" : p.app.version;
  const std::string url = p.updateUrl.size() > 9 && p.updateUrl.compare(p.updateUrl.size() - 9, 9, ".manifest") == 0 ? p.updateUrl : p.updateUrl + (p.updateUrl.back() == '/' ? "" : "/") + channel + ".manifest";
  zn::tc::UpdateInfo info; std::string err;
  if (!zn::tc::fetchManifest(url, info, err, {p.updateKey})) return failed(err);
  const bool newer = zn::tc::newerVersion(info.version, version);
  if (what == "update.check") return updateReply(out, cap, std::string("{\"available\":") + (newer ? "true" : "false") + ",\"version\":" + jsonText(info.version) + ",\"notes\":" + jsonText(info.notes) + "}");
  if (what == "update.download") {
    if (!newer) return failed("no newer version on the " + channel + " channel (" + info.version + ", this is " + version + ")");
    const std::string dir = zn::tc::home() + "/apps/" + (p.app.id.empty() ? p.name : p.app.id);
    std::string path;
    if (!zn::tc::downloadUpdate(info, dir + "/updates", path, err)) return failed(err);
    std::ofstream(dir + "/staged") << path << "\n";
    return updateReply(out, cap, "{\"version\":" + jsonText(info.version) + ",\"path\":" + jsonText(path) + "}");
  }
  return 0;
}
static std::vector<std::string> gFusedArgs;
static std::vector<char*> gFusedArgv;
static std::vector<std::string> gOriginalArgs;   // argv as the user typed it: the dev bundle starts the engine again with it
static std::string gBundleOut;                   // `zinc build --bundle ... -o <out>.app`: the bundle to assemble once the program is linked
static zn::tc::BundleSpec gBundleSpec;

#ifdef ZN_HOST_GFX
// gl.zincPresent (WebGL module): RGBA rows bottom to top -> the 0xRRGGBB runtime image, top to bottom
static bool glPresent(int image, const unsigned char* rgba, int w, int h) {   // gl.zincPresent: RGBA rows bottom to top -> the 0xRRGGBB runtime image, top to bottom
    int32_t iw = 0, ih = 0;
    if (!zrt::raster::image_size(image, &iw, &ih)) return false;
    const int ss = (iw > 0 && ih > 0 && w % iw == 0 && h % ih == 0 && w / iw == h / ih && w / iw > 1 && w / iw <= 4) ? w / iw : 1;   // a canvas that is a whole multiple of the image: supersampling, averaged down (anti-aliasing for contexts without MSAA)
    if (ss == 1 && (iw != w || ih != h)) zrt::raster::dyn_resize(image, w, h);
    uint32_t* dst = zrt::raster::dyn_pixels(image);
    if (!dst) return false;
    if (ss > 1) {
      for (int y = 0; y < ih; ++y)
        for (int x = 0; x < iw; ++x) {
          unsigned r = 0, g = 0, b = 0;
          for (int sy = 0; sy < ss; ++sy) {
            const unsigned char* src = rgba + static_cast<size_t>(h - 1 - (y * ss + sy)) * w * 4 + static_cast<size_t>(x) * ss * 4;
            for (int sx = 0; sx < ss; ++sx, src += 4) { r += src[0]; g += src[1]; b += src[2]; }
          }
          const unsigned n = static_cast<unsigned>(ss * ss);
          dst[static_cast<size_t>(y) * iw + x] = ((r / n) << 16) | ((g / n) << 8) | (b / n);
        }
      zrt::raster::dyn_update(image, nullptr, 0);
      return true;
    }
    for (int y = 0; y < h; ++y) {
      const unsigned char* src = rgba + static_cast<size_t>(h - 1 - y) * w * 4;
      for (int x = 0; x < w; ++x, src += 4) dst[static_cast<size_t>(y) * w + x] = (uint32_t(src[0]) << 16) | (uint32_t(src[1]) << 8) | src[2];
    }
    zrt::raster::dyn_update(image, nullptr, 0);
    return true;
}
#endif
// WebGL lives in a module beside zinc (ZN-330.01): libzn_webgl.dylib / .so (or $ZINC_WEBGL_LIB), loaded the first time a QuickJS context is made; zinc carries no WebGL,
// glad or glslang. Without the module, QuickJS programs run without `document` (and zinc.json "webgl" says why).
static void webglHook(JSContext* ctx) {
  static const zn::gl::ContextInstall install = []() -> zn::gl::ContextInstall {
    namespace fs = std::filesystem;
    const char* env = std::getenv("ZINC_WEBGL_LIB");
#if defined(__APPLE__)
    const char* file = "libzn_webgl.dylib";
#else
    const char* file = "libzn_webgl.so";
#endif
    const std::string path = env && *env ? std::string(env) : (fs::path(zn::tc::executablePath()).parent_path() / file).string();
    void* h = dlopen(path.c_str(), RTLD_NOW | RTLD_LOCAL);
    const char* wanted = std::getenv("ZINC_WEBGL");
    if (!h) { if (wanted && *wanted && *wanted != '0') std::fprintf(stderr, "zinc: WebGL is not available: %s\n", dlerror()); return nullptr; }
    auto open = reinterpret_cast<zn::gl::ContextInstall (*)(zn::gl::PresentHook)>(dlsym(h, "zn_webgl_open"));
#ifdef ZN_HOST_GFX
    return open ? open(glPresent) : nullptr;
#else
    return open ? open(nullptr) : nullptr;
#endif
  }();
  if (install) install(ctx);
}

int main(int argc, char** argv) {
  for (int k = 0; k < argc; ++k) gLaunchArgs.push_back(argv[k]);
  {   // a fused app: every argument is the app's; it runs as `zinc run <its program> -- args`
    std::string archive, zbc, err;
    if (fusedArchive(archive)) {
      if (!unpackZapp(archive, zbc, err)) { std::fprintf(stderr, "%s: %s\n", argv[0], err.c_str()); return 1; }
      zbc = chooseAppVersion(zbc);   // a newer version staged or in use (ZN-324.02)
      gFusedArgs = {argv[0], "run", zbc, "--"};
      for (int k = 1; k < argc; ++k) gFusedArgs.push_back(argv[k]);
      for (std::string& a : gFusedArgs) gFusedArgv.push_back(a.data());
      gFusedArgv.push_back(nullptr);
      argc = static_cast<int>(gFusedArgs.size());
      argv = gFusedArgv.data();
    }
  }
  for (int k = 0; k < argc; ++k) gOriginalArgs.push_back(argv[k]);
  for (int k = 1; k + 1 < argc; ++k)   // --clock virtual|real (ZN-293): the program's time source, whatever the command; `--` ends the options
    if (!std::strcmp(argv[k], "--")) break;
    else if (!std::strcmp(argv[k], "--clock")) {
      if (std::strcmp(argv[k + 1], "virtual") && std::strcmp(argv[k + 1], "real")) { std::fprintf(stderr, "zinc: --clock is virtual or real\n"); return 2; }
      setenv("ZINC_CLOCK", argv[k + 1], 1);
      for (int j = k; j + 2 < argc + 1; ++j) argv[j] = argv[j + 2];
      argc -= 2;
      break;
    }
  { char e[256]; zn_register_module(zn_module_QuickJS(), e, sizeof e); }
#ifdef ZN_NATIVE_FIXTURE
  { char e[256]; zn_register_module(fixture_module(), e, sizeof e); }   // a test module in C99 (tests/native/fixture.c): what the native-call fixtures call
#endif
  gRoot = zn::tc::sourceRoot(ZN_SOURCE_DIR);
  if (std::getenv("ZINC_DEVAPP_SELFTEST") && std::getenv("ZINC_DEVAPP")) std::fprintf(stderr, "devapp: %s (bundle id of this process: %s)\n", std::getenv("ZINC_DEVAPP"), zn::tc::runningBundleId().c_str());   // ZN-234 selftest
  if (char* self = realpath(argv[0], nullptr)) { setenv("ZINC_BIN", self, 0); std::free(self); }  // the apps that start `zinc` (Zinc Atelier) find this binary through it
#ifdef ZN_HOST_GFX
  zn::host::installGfx();
  zn::host::installLayout();
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
    if (argc >= 2 && (!std::strcmp(argv[1], "init") || !std::strcmp(argv[1], "new"))) return zn::cli::init(cl, gRoot);
    if (argc >= 2 && !std::strcmp(argv[1], "capture") && !(argc >= 3 && !std::strcmp(argv[2], "--scene"))) return zn::cli::capture(cl);
    if (argc >= 2 && !std::strcmp(argv[1], "bench")) return zn::cli::bench(cl);
    if (argc >= 2 && !std::strcmp(argv[1], "dev")) return zn::cli::dev(cl);
    if (argc >= 2 && !std::strcmp(argv[1], "lsp")) return zn::lsp::serve(gRoot + "/../lib/std");
    if (argc >= 2 && !std::strcmp(argv[1], "monitor")) return zn::cli::monitor(cl);
    if (argc >= 2 && !std::strcmp(argv[1], "export")) return zn::cli::exportApp(cl, gRoot);
    if (argc >= 2 && !std::strcmp(argv[1], "deploy")) return zn::cli::deploy(cl);
    if (argc >= 2 && !std::strcmp(argv[1], "add")) return zn::cli::addPlugin(cl, gRoot);
    if (argc >= 2 && !std::strcmp(argv[1], "index-sign")) return zn::cli::indexSign(cl);
    if (argc >= 2 && !std::strcmp(argv[1], "index-get")) return zn::cli::indexGet(cl);
    if (argc >= 2 && !std::strcmp(argv[1], "install")) return zn::cli::installPlugins(cl, gRoot);
    if (argc >= 2 && !std::strcmp(argv[1], "trust")) return zn::cli::trustPlugin(cl);
    if (argc >= 2 && !std::strcmp(argv[1], "remove")) return zn::cli::removePlugin(cl);
    if (argc >= 3 && !std::strcmp(argv[1], "plugins") && !std::strcmp(argv[2], "update")) return zn::cli::updatePlugins(cl, gRoot);
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
#ifdef ZN_HOST_GFX
  zrt::gfx::encode_webp_hook = webpShot;
#endif
  zn::text::installSegmenter();   // Intl.Segmenter in the QuickJS engine (ZN-165)
  zn::qjs::addContextHook(webglHook);   // document.createElement('canvas').getContext('webgl') in the QuickJS engine (ZN-203.03), from the module
  if (argc >= 5 && !std::strcmp(argv[1], "run") && !std::strcmp(argv[3], "--engine")) {  // zinc run <file> --engine quickjs [-- args...]: plain JavaScript or stripped TypeScript on QuickJS-ng
    if (std::strcmp(argv[4], "quickjs")) { std::fprintf(stderr, "zinc: unknown engine '%s' (quickjs)\n", argv[4]); return 2; }
    zn::qjs::Options qo;
    static std::string entryOfDir;   // a project directory runs its entry (zinc.json "entry", src/main.ts...), as `zinc run <dir>` does
    if (std::filesystem::is_directory(argv[2])) {
      zn::frontend::Project proj;
      std::string pf = std::string(argv[2]) + "/zinc.json", perr;
      bool have = false;
      if (std::filesystem::exists(pf)) { std::ifstream in(pf); std::stringstream ss; ss << in.rdbuf(); have = zn::frontend::parseProject(ss.str(), proj, perr); }
      entryOfDir = zn::frontend::entryOf(argv[2], have ? &proj : nullptr);
      if (entryOfDir.empty()) { std::fprintf(stderr, "zinc: no entry in %s (zinc.json \"entry\", src/main.ts or main.ts)\n", argv[2]); return 2; }
      argv[2] = entryOfDir.data();
    }
    qo.entry = argv[2];
    qo.stdRoot = gRoot + "/../lib/std";
    if (!loadManifestPermissions(argv[2])) return 2;   // zinc.json "ui" (UI_LAYOUT of zinc:platform) and the permissions, as for the typed engines
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
  if (argc >= 2 && !std::strcmp(argv[1], "pack")) {   // zinc pack [dir] [-o app.zapp]: the program, its baked resources, assets and zinc.json in one file (ZN-318)
    namespace fs = std::filesystem;
    std::string dir = ".", outPath;
    for (int k = 2; k < argc; ++k) {
      if (!std::strcmp(argv[k], "-o") && k + 1 < argc) outPath = argv[++k];
      else if (argv[k][0] != '-') dir = argv[k];
      else { std::fprintf(stderr, "zinc pack: unknown option %s\nusage: zinc pack [dir] [-o app.zapp]\n", argv[k]); return 2; }
    }
    const std::string projDir = fs::absolute(dir).lexically_normal().string();
    std::ifstream pf(fs::path(projDir) / "zinc.json");
    std::stringstream ps; ps << pf.rdbuf();
    zn::frontend::Project project; std::string perr;
    const bool have = pf && zn::frontend::parseProject(ps.str(), project, perr);
    const std::string entry = zn::frontend::entryOf(projDir, have ? &project : nullptr);
    if (entry.empty()) { std::fprintf(stderr, "zinc pack: %s has no zinc.json entry nor src/main.ts[x]\n", projDir.c_str()); return 2; }
    std::string name = have && !project.name.empty() ? project.name : fs::path(projDir).filename().string();
    zn::zbc::Module zm;
    if (int rc = compileToZbc(entry.c_str(), zm)) return rc;
    std::map<std::string, std::string> files;
    const auto zbc = zn::zbc::encode(zm);
    files["program.zbc"] = std::string(zbc.begin(), zbc.end());
    std::vector<std::uint8_t> blob; std::string err;
    if (zn::aot::usesHost(zm)) {   // a program that draws: its baked fonts and images (a command-line program needs none)
      if (!bakeResources(entry.c_str(), blob, err)) { std::fprintf(stderr, "zinc pack: cannot bake the fonts and images: %s\n", err.c_str()); return 1; }
      files["resources.bin"] = std::string(blob.begin(), blob.end());
    }
    if (have) files["zinc.json"] = ps.str();
    std::error_code ec;
    const fs::path assets = fs::path(projDir) / "assets";
    if (fs::is_directory(assets, ec))
      for (auto it = fs::recursive_directory_iterator(assets, ec); it != fs::recursive_directory_iterator(); it.increment(ec)) {
        const std::string rel = fs::relative(it->path(), projDir).generic_string();
        if (!it->is_regular_file() || rel.find("/.") != std::string::npos) continue;   // hidden files (.gitkeep, .DS_Store) stay out
        std::ifstream af(it->path(), std::ios::binary); std::stringstream as; as << af.rdbuf();
        files[rel] = as.str();
      }
    if (outPath.empty()) { fs::create_directories(fs::path(projDir) / "build", ec); outPath = (fs::path(projDir) / "build" / (name + ".zapp")).string(); }
    const std::string archive = zn::zapp::pack(files, name, kVersionText);
    std::ofstream out(outPath, std::ios::binary);
    out.write(archive.data(), static_cast<std::streamsize>(archive.size()));
    if (!out) { std::fprintf(stderr, "zinc pack: cannot write %s\n", outPath.c_str()); return 1; }
    std::printf("packed %s (%zu files, %zu bytes)\n", outPath.c_str(), files.size() + 1, archive.size());
    return 0;
  }
  if (argc >= 3 && !std::strcmp(argv[1], "fuse")) {   // zinc fuse app.zapp [--target T] [-o app]: this engine with the archive appended, one executable (ZN-319)
    namespace fs = std::filesystem;
    std::string in = argv[2], outPath, target;
    for (int k = 3; k < argc; ++k) {
      if (!std::strcmp(argv[k], "-o") && k + 1 < argc) outPath = argv[++k];
      else if (!std::strcmp(argv[k], "--target") && k + 1 < argc) target = argv[++k];
      else { std::fprintf(stderr, "zinc fuse: unknown option %s\nusage: zinc fuse app.zapp [--target T] [-o app]\n", argv[k]); return 2; }
    }
#if defined(__APPLE__)
    const char* host = "macos";
#else
    const char* host = "linux";
#endif
    if (!target.empty() && target != host) { std::fprintf(stderr, "zinc fuse: only this machine's target (%s) for now: a prebuilt runtime for %s is not available yet (ZN-392); zinc export --target %s builds it with the AOT\n", host, target.c_str(), target.c_str()); return 2; }
    std::ifstream zf(in, std::ios::binary);
    std::stringstream zs; zs << zf.rdbuf();
    const std::string archive = zs.str();
    std::map<std::string, std::string> files; std::string err;
    if (!zf || !zn::zapp::unpack(archive, kVersionText, files, err)) { std::fprintf(stderr, "zinc fuse: %s: %s\n", in.c_str(), zf ? err.c_str() : "cannot read it"); return 1; }
    if (outPath.empty()) outPath = fs::path(in).replace_extension().string();
    std::ifstream self(zn::tc::executablePath(), std::ios::binary);
    std::stringstream ss; ss << self.rdbuf();
    const std::string engine = ss.str();   // (a fused binary runs its app whatever its arguments, so the engine here is never a fused one)
    std::string trailer(8, '\0');
    for (int i = 0; i < 8; ++i) trailer[i] = static_cast<char>((static_cast<std::uint64_t>(archive.size()) >> (8 * i)) & 0xff);
    trailer += std::string(kFuseMagic, 8);
    std::ofstream out(outPath, std::ios::binary);
    out << engine << archive << trailer;
    if (!out) { std::fprintf(stderr, "zinc fuse: cannot write %s\n", outPath.c_str()); return 1; }
    out.close();
    fs::permissions(outPath, fs::perms::owner_all | fs::perms::group_read | fs::perms::group_exec | fs::perms::others_read | fs::perms::others_exec, fs::perm_options::replace);
    std::printf("fused %s (%s, %zu bytes: engine %zu + app %zu)\n", outPath.c_str(), host, engine.size() + archive.size() + 16, engine.size(), archive.size());
    return 0;
  }
  if (argc >= 3 && !std::strcmp(argv[1], "run") && (argc == 3 || !std::strcmp(argv[3], "--"))) {  // zinc run <file> [-- args...]  // zinc run <file.ts|file.zbc>: compile if needed, verify, execute
    std::string path = argv[2];
    if (path.size() > 5 && path.compare(path.size() - 5, 5, ".zapp") == 0) {   // a packed app (ZN-318): checked, unpacked once into the cache, run from there
      std::ifstream zf(path, std::ios::binary);
      if (!zf) { std::fprintf(stderr, "zinc: cannot read %s\n", path.c_str()); return 2; }
      std::stringstream zs; zs << zf.rdbuf();
      std::string zbc, err;
      if (!unpackZapp(zs.str(), zbc, err)) { std::fprintf(stderr, "zinc: %s: %s\n", path.c_str(), err.c_str()); return 1; }
      zbc = chooseAppVersion(zbc);   // a newer version staged or in use (ZN-324.02)
      gOriginalArgs[2] = zbc;
      path = zbc;
    }
    std::string projectDir;
    zn::frontend::TargetOptions window;  // zinc.json: what concerns the host
    bool shapedText = false;             // zinc.json "text": "shaped" (ZN-224)
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
        std::error_code eq;   // `zinc run .` too: lexically_normal keeps a trailing slash on "./", so compare the directories themselves
        std::string e = zn::frontend::entryOf(path, have && fs::equivalent(fs::path(projectDir), fs::path(path), eq) ? &project : nullptr);
        if (e.empty()) { std::fprintf(stderr, "zinc: %s: no entry (zinc.json \"entry\", src/main.ts, src/main.tsx, main.ts or main.tsx)\n", path.c_str()); return 2; }
        path = e;
      }
      {   // zinc.json "permissions" at run time (ZN-322): warned while developing, refused when enforced (exported apps, ZINC_PERMISSIONS=enforce)
#if defined(__APPLE__)
        const std::vector<std::string> granted = have ? zn::frontend::permissionsFor(project, "macos") : std::vector<std::string>{};
#else
        const std::vector<std::string> granted = have ? zn::frontend::permissionsFor(project, "linux") : std::vector<std::string>{};
#endif
        const char* mode = std::getenv("ZINC_PERMISSIONS");
        zn::host::perm::configure(granted, have && project.permissionsDeclared, mode && !std::strcmp(mode, "enforce"), projectDir.empty() ? "." : projectDir);
      }
      if (have) gUpdProject = project;   // zinc:system/update (ZN-324.03)
      if (have) {
        shapedText = project.text == "shaped";
        if (!project.keyboard.empty()) setenv("ZINC_KEYBOARD", project.keyboard.c_str(), 0);   // zinc.json "keyboard" (ZN-227)
        if (project.webgl) setenv("ZINC_WEBGL", "1", 0);   // zinc.json "webgl" (ZN-205)
        if (!project.scheme.empty()) setenv("ZINC_SCHEME", project.scheme.c_str(), 0);   // zinc.json "scheme" (ZN-271)
        // the profile of the target this machine runs: macos, linux, else the simulator's
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
    if (shapedText || (std::getenv("ZINC_TEXT") && !std::strcmp(std::getenv("ZINC_TEXT"), "shaped"))) zn::text::installShapedGfx();   // ZN-224
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
      {   // a compiled program (a .zapp's, a fused app's) loads the native plugins it calls, as a compile would have (ZN-324.03)
        installNativeProvider(path.c_str());
        std::set<std::string> mods;
        for (const auto& nt : zm.natives) if (nt.module != "QuickJS" && nt.module != "Fixture") mods.insert(nt.module);
        for (const std::string& m : mods) {
          std::string why;
          if (!zn::frontend::gNativeProvider(m, why)) { std::fprintf(stderr, "zinc: %s: the native module '%s' cannot be loaded: %s\n", argv[2], m.c_str(), why.c_str()); return 1; }
        }
      }
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
    if (zn::aot::usesHost(zm)) {  // a program that draws: bake its fonts and images (from its sources) and install them; a packed program brings them (resources.bin)
      std::vector<std::uint8_t> blob;
      std::string err;
      const std::filesystem::path baked = std::filesystem::path(absPath).parent_path() / "resources.bin";
      std::error_code rec;
      if (gSources.empty() && std::filesystem::exists(baked, rec)) { std::ifstream rf(baked, std::ios::binary); blob.assign(std::istreambuf_iterator<char>(rf), std::istreambuf_iterator<char>()); }
      else if (!bakeResources(absPath.c_str(), blob, err)) blob.clear();
      if (blob.empty() || !zn::host::installResources(blob.data(), blob.size())) { std::fprintf(stderr, "zinc: cannot prepare the fonts and images: %s\n", err.c_str()); return 1; }
    }
#endif
    if (!gTrialDir.empty()) std::thread([] { std::this_thread::sleep_for(std::chrono::seconds(5)); promoteTrial(); }).detach();   // an update on trial that runs 5 s is healthy
    gRunOut = &out;
    auto res = zn::vm::run(zm, out, trace);
    if (!gTrialDir.empty() && !res.ok) std::_Exit(zn::rt::report(res, out, trace));   // failed on trial: leave `trial` for the next launch to roll back
    return zn::rt::report(res, out, trace);
  }
  if (argc >= 3 && !std::strcmp(argv[1], "sim")) {   // zinc sim <scenario.yaml> [--out DIR] [--update-goldens]: the steps of a scenario against the program it names (ZN-295)
    namespace fs = std::filesystem;
    std::string outDir, recordTo, replayOf; bool update = false;
    for (int k = 3; k < argc; ++k) {
      if (!std::strcmp(argv[k], "--out") && k + 1 < argc) outDir = argv[++k];
      else if (!std::strcmp(argv[k], "--record") && k + 1 < argc) recordTo = argv[++k];   // after the run: the trace (inputs and outputs) as a .zsim
      else if (!std::strcmp(argv[k], "--replay") && k + 1 < argc) replayOf = argv[++k];   // instead of the steps: the .zsim is replayed against the scenario's program and compared
      else if (!std::strcmp(argv[k], "--update-goldens")) update = true;
      else { std::fprintf(stderr, "zinc sim: unknown option %s\n", argv[k]); return 2; }
    }
    std::ifstream in(argv[2]);
    if (!in) { std::fprintf(stderr, "zinc sim: cannot read %s\n", argv[2]); return 2; }
    std::stringstream text; text << in.rdbuf();
    zn::sim::Scenario sc; std::string err;
    if (!zn::sim::parseScenario(text.str(), sc, err)) { std::fprintf(stderr, "zinc sim: %s: %s\n", argv[2], err.c_str()); return 2; }
    const fs::path base = fs::absolute(fs::path(argv[2])).parent_path();
    zn::sim::Board board; bool haveBoard = false;
    if (!sc.board.empty()) {
      std::ifstream bf(base / sc.board);
      std::stringstream bt; bt << bf.rdbuf();
      if (!bf || !zn::sim::parseBoard(bt.str(), board, err)) { std::fprintf(stderr, "zinc sim: board %s: %s\n", sc.board.c_str(), bf ? err.c_str() : "cannot read it"); return 2; }
      haveBoard = true;
    }
    if (sc.project.empty()) { std::fprintf(stderr, "zinc sim: the scenario has no `project:` (the program to run, relative to the scenario)\n"); return 2; }
    zn::sim::ProgramDut::Config cfg;
    cfg.zinc = zn::tc::executablePath(); cfg.project = (base / sc.project).lexically_normal().string();
    cfg.scratch = (fs::temp_directory_path() / ("zinc-sim-" + std::to_string(::getpid()))).string();
    cfg.board = haveBoard ? &board : nullptr;
    zn::sim::ProgramDut dut(cfg);
    if (!replayOf.empty()) {
      std::ifstream zf(replayOf, std::ios::binary); std::stringstream zs; zs << zf.rdbuf();
      zn::sim::Trace recorded;
      if (!zf || !zn::sim::Trace::parse(zs.str(), recorded, err)) { std::fprintf(stderr, "zinc sim: %s: %s\n", replayOf.c_str(), zf ? err.c_str() : "cannot read it"); return 2; }
      zn::sim::ReplayResult rr = zn::sim::replayTrace(dut, recorded);
      std::error_code ec2; fs::remove_all(cfg.scratch, ec2);
      std::printf("replay %s: %s\n", replayOf.c_str(), rr.message.c_str());
      return rr.ok ? 0 : 1;
    }
    zn::sim::RunOptions opt; opt.baseDir = base.string(); opt.outDir = outDir; opt.updateGoldens = update;
    zn::sim::RunResult r = zn::sim::runScenario(sc, dut, opt);
    if (!recordTo.empty() && r.ok) {
      zn::sim::Trace tr;
      if (!dut.recordTrace(tr, err)) { std::fprintf(stderr, "zinc sim: cannot record: %s\n", err.c_str()); return 1; }
      std::ofstream zf(recordTo, std::ios::binary); const std::string bytes = tr.serialize(); zf.write(bytes.data(), static_cast<std::streamsize>(bytes.size()));
      std::printf("recorded %zu events (%zu bytes) to %s\n", tr.events().size(), bytes.size(), recordTo.c_str());
    }
    if (update && !r.newHashes.empty()) {   // the hashes of the steps that changed are rewritten in the scenario file
      std::string t = text.str();
      for (const auto& h : r.newHashes) for (std::size_t at = t.find(h.first); at != std::string::npos; at = t.find(h.first, at + h.second.size())) t.replace(at, h.first.size(), h.second);
      std::ofstream out(argv[2]); out << t;
      std::printf("rewrote %zu hash(es) in %s\n", r.newHashes.size(), argv[2]);
    }
    std::error_code ec; fs::remove_all(cfg.scratch, ec);
    std::printf("%s%s%s\n", sc.name.empty() ? "" : (sc.name + ": ").c_str(), r.ok ? "" : "", zn::sim::describe(sc, r).c_str());
    return r.ok ? 0 : 1;
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
    gBuildTarget = target;
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
    gBuildTarget = std::string(argv[3]) == "rpi" ? "rpi1" : argv[3];
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
    { std::ofstream o(cpp); std::string text = zn::aot::emitCpp(zm, blob.empty() ? nullptr : &blob, (zn::frontend::uiLayout() == "rn" || zn::frontend::directLayoutUse()));
      if (draws && !gBakedSize.empty()) { std::size_t at = text.find("int main() {\n"); if (at != std::string::npos) text.insert(at + 13, "  setenv(\"ZINC_SIZE\", \"" + gBakedSize + "\", 0);   // the project's surface\n"); }
      o << text; if (!o) { std::fprintf(stderr, "cannot write %s\n", cpp.c_str()); return 2; } }
    if (draws) injectPermissions(cpp.string(), argv[4], std::string(argv[3]).find("macos") != std::string::npos ? "macos" : "linux");   // ZN-322.03
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
      for (const char* lib : {"zn_rt", "zn_mimalloc", "zn_zbc", "zn_ir", "zn_frontend", "zn_native", "zn_host_gfx", "zn_layout", "zn_yoga", "zn_codec", "zn_uv", "zn_llhttp", "zn_mbedtls", "zn_regexp", "zn_yyjson"}) if (fs::exists(L + "lib" + lib + ".a")) cmd += " '" + L + "lib" + lib + ".a'";
      cmd += " -lpthread -o '" + std::string(argv[6]) + "'";
      writeComponents(std::string(argv[6]) + ".components", cmd, crossPlugins);   // ZN-323
      ok = std::system(cmd.c_str()) == 0;
      if (!ok) err = "the cross compiler failed: " + cmd;
    } else { ok = zn::tc::crossBuild(zig, gRoot, cpp.string(), argv[3], argv[6], err); writeComponents(std::string(argv[6]) + ".components", "", {}); }   // only the runtime
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
    { std::ofstream o(cpp); std::string text = zn::aot::emitCpp(zm, blob.empty() ? nullptr : &blob, (zn::frontend::uiLayout() == "rn" || zn::frontend::directLayoutUse())); if (!gBakedSize.empty()) { std::size_t at = text.find("int main() {\n"); if (at != std::string::npos) text.insert(at + 13, "  setenv(\"ZINC_SIZE\", \"" + gBakedSize + "\", 0);   // the board's surface\n"); } o << text; if (!o) { std::fprintf(stderr, "cannot write %s\n", cpp.c_str()); return 2; } }
    std::string shapedLibs;   // "text": "shaped" (ZN-224): the shaping tier is linked into this program only
    if (zn::aot::usesHost(zm)) {
      std::string pf = zn::frontend::findProjectFile(argv[2]);
      zn::frontend::Project proj;
      std::string perr;
      if (!pf.empty()) { std::ifstream in(pf); std::stringstream ss; ss << in.rdbuf(); zn::frontend::parseProject(ss.str(), proj, perr); }
      if (proj.text == "shaped") {
        std::string text;
        { std::ifstream in(cpp); std::stringstream ss; ss << in.rdbuf(); text = ss.str(); }
        std::size_t at = text.find("  zn::host::installGfx();\n"), mainAt = text.find("int main() {\n");
        if (at != std::string::npos && mainAt != std::string::npos) {
          text.insert(at + 26, "  zn_install_shaped_text();\n");
          text.insert(mainAt, "void zn_install_shaped_text();\n");
          { std::ofstream o(cpp); o << text; }
          for (const char* l : {"libzn_text_gfx.a", "libzn_text.a", "libzn_harfbuzz.a", "libzn_sheenbidi.a", "libzn_unibreak.a"}) shapedLibs += " '" + (libs / l).string() + "'";
        }
      }
    }
    if (zn::aot::usesHost(zm)) injectPermissions(cpp.string(), argv[2], zn::tc::hostName().find("macos") != std::string::npos ? "macos" : "linux");   // ZN-322.03
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
    std::string nativeLibs = usesScript ? " '" + (libs / "libzn_script.a").string() + "' '" + (libs / "libzn_qjs_ext.a").string() + "' '" + (libs / "libzn_quickjs.a").string() + "'" : std::string();  // the plugins' native code that the program calls: their static archives and the libraries they need (and the host library, for zrt)
    nativeLibs += shapedLibs;
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
    std::string cmd = std::string(cxx ? cxx : "c++") + " -std=c++20 -O2 -w -ffp-contract=off -I '" + gRoot + "/include' -I '" + gRoot + "/src' -I '" + gRoot + "/third_party/mimalloc/include' '" + cpp.string() + "' '" + (libs / "libzn_rt.a").string() + "' '" + (zm.heapBytes && fs::exists(libs / "libzn_rt_new.a") ? (libs / "libzn_rt_new.a").string() + "' '" : std::string()) + (libs / "libzn_mimalloc.a").string() + "' '" +
                      (libs / "libzn_zbc.a").string() + "' '" + (libs / "libzn_ir.a").string() + "' '" + (libs / "libzn_frontend.a").string() + "'" + (fs::exists(libs / "libzn_regexp.a") ? " '" + (libs / "libzn_regexp.a").string() + "'" : std::string()) + " '" + (libs / "libzn_native.a").string() + "'" + (!zm.natives.empty() && fs::exists(libs / "libzn_native_fixture.a") ? " '" + (libs / "libzn_native_fixture.a").string() + "'" : std::string()) +   // the native registry; libunicode: the string runtime needs it
                      (!nativeLibs.empty() ? nativeLibs : std::string()) + (zn::aot::usesLayout(zm) && (zn::frontend::uiLayout() == "rn" || zn::frontend::directLayoutUse()) && fs::exists(libs / "libzn_layout.a") ? " '" + (libs / "libzn_layout.a").string() + "' '" + (libs / "libzn_yoga.a").string() + "'" : std::string()) + ((zn::aot::usesHost(zm) || !nativeLibs.empty()) && fs::exists(libs / "libzn_host_gfx.a") ? " '" + (libs / "libzn_host_gfx.a").string() + "'" + (fs::exists(libs / "libzn_codec.a") ? " '" + (libs / "libzn_codec.a").string() + "'" : std::string()) + (fs::exists(libs / "libzn_uv.a") ? " '" + (libs / "libzn_uv.a").string() + "'" : std::string()) + (fs::exists(libs / "libzn_llhttp.a") ? " '" + (libs / "libzn_llhttp.a").string() + "'" : std::string()) + (fs::exists(libs / "libzn_mbedtls.a") ? " '" + (libs / "libzn_mbedtls.a").string() + "'" : std::string()) + (fs::exists(libs / "libzn_regexp.a") ? " '" + (libs / "libzn_regexp.a").string() + "'" : std::string()) + " -lpthread" HOSTLIBS : std::string()) + " -o '" + argv[4] + "'";  // the graphics host, used by programs that call it
    writeComponents(std::string(argv[4]) + ".components", cmd, gPlugins);   // for the SBOM of zinc export (ZN-323)
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
    if (const char* t = std::getenv("ZINC_DEVICE_TARGET")) { gDeviceCore = true; gBuildTarget = t; }   // as `run --target esp32` compiles (zinc export --target esp32)
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
  if (argc == 2 && !std::strcmp(argv[1], "update-keygen")) {   // zinc update-keygen: a new Ed25519 key pair for signing releases (seed secret, public key for ~/.zinc/update-keys or the build)
    std::string seed, pub;
    if (!zn::tc::newKeyPair(seed, pub)) { std::fprintf(stderr, "zinc: no randomness\n"); return 1; }
    std::printf("seed=%s\npublic=%s\n", seed.c_str(), pub.c_str());
    return 0;
  }
  if (argc == 4 && !std::strcmp(argv[1], "sign")) {   // zinc sign <file> <seed-hex>: <file>.sig, the detached signature zinc add --key checks (ZN-328.02)
    std::ifstream in(argv[2], std::ios::binary);
    const std::string bytes((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
    std::string sig, err;
    if (!in && bytes.empty()) { std::fprintf(stderr, "zinc sign: cannot read %s\n", argv[2]); return 2; }
    if (!zn::tc::signBytes(bytes, argv[3], sig, err)) { std::fprintf(stderr, "zinc sign: %s\n", err.c_str()); return 2; }
    std::ofstream out(std::string(argv[2]) + ".sig");
    out << sig << "\n";
    if (!out) { std::fprintf(stderr, "zinc sign: cannot write %s.sig\n", argv[2]); return 1; }
    std::printf("%s.sig\n", argv[2]);
    return 0;
  }
  if (argc == 4 && !std::strcmp(argv[1], "update-sign")) {   // zinc update-sign <manifest> <seed-hex>: the manifest with its sig= line (stdout)
    std::string text, out, err;
    if (!readFile(argv[2], text)) { std::fprintf(stderr, "cannot read %s\n", argv[2]); return 2; }
    if (!zn::tc::signManifest(text, argv[3], out, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
    std::fputs(out.c_str(), stdout);
    return 0;
  }
  if (argc >= 2 && (!std::strcmp(argv[1], "publish") || !std::strcmp(argv[1], "update-app"))) {   // app updates (ZN-324.01)
    // zinc publish [dir] --key <seed-hex> [--channel C] [--notes text] [-o out]: <out>/<name>-<version>.zapp and <out>/<channel>.manifest signed with the app's key
    // zinc update-app [dir] [--check] [--channel C]: the app's channel checked (signature, newer version), the update downloaded and verified
    namespace fs = std::filesystem;
    const bool publish = !std::strcmp(argv[1], "publish");
    std::string dir = ".", key, channel, notes, outDir;
    bool checkOnly = false;
    for (int k = 2; k < argc; ++k) {
      if (!std::strcmp(argv[k], "--key") && k + 1 < argc) key = argv[++k];
      else if (!std::strcmp(argv[k], "--channel") && k + 1 < argc) channel = argv[++k];
      else if (!std::strcmp(argv[k], "--notes") && k + 1 < argc) notes = argv[++k];
      else if (!std::strcmp(argv[k], "-o") && k + 1 < argc) outDir = argv[++k];
      else if (!std::strcmp(argv[k], "--check")) checkOnly = true;
      else if (argv[k][0] != '-') dir = argv[k];
      else { std::fprintf(stderr, "zinc %s: unknown option %s\n", argv[1], argv[k]); return 2; }
    }
    std::ifstream pf(fs::path(dir) / "zinc.json");
    std::stringstream ps; ps << pf.rdbuf();
    zn::frontend::Project proj; std::string err;
    if (!pf || !zn::frontend::parseProject(ps.str(), proj, err)) { std::fprintf(stderr, "zinc %s: %s has no readable zinc.json%s%s\n", argv[1], dir.c_str(), err.empty() ? "" : ": ", err.c_str()); return 2; }
    if (proj.updateKey.empty()) { std::fprintf(stderr, "zinc %s: zinc.json needs \"update\": { \"url\": ..., \"publicKey\": ... } (zinc update-keygen makes a key pair)\n", argv[1]); return 2; }
    if (channel.empty()) channel = proj.updateChannel;
    const std::string version = proj.app.version.empty() ? "0.0.0" : proj.app.version, name = proj.name.empty() ? fs::absolute(dir).filename().string() : proj.name;
    if (publish) {
      if (zn::tc::publicKeyOf(key) != proj.updateKey) { std::fprintf(stderr, "zinc publish: --key is not the seed of zinc.json update.publicKey\n"); return 2; }
      if (outDir.empty()) outDir = (fs::path(dir) / "dist" / "updates").string();
      std::error_code ec; fs::create_directories(outDir, ec);
      const std::string file = name + "-" + version + ".zapp", zapp = (fs::path(outDir) / file).string();
      const std::string cmd = "'" + zn::tc::executablePath() + "' pack '" + dir + "' -o '" + zapp + "' >/dev/null";
      if (std::system(cmd.c_str()) != 0) { std::fprintf(stderr, "zinc publish: the pack failed\n"); return 1; }
      std::string manifest = "app=" + (proj.app.id.empty() ? name : proj.app.id) + "\nchannel=" + channel + "\nversion=" + version + "\nurl=" + file + "\nsha256=" + zn::tc::sha256File(zapp) + "\n";
      if (!notes.empty()) manifest += "notes=" + notes + "\n";
      std::string signedText;
      if (!zn::tc::signManifest(manifest, key, signedText, err)) { std::fprintf(stderr, "zinc publish: %s\n", err.c_str()); return 1; }
      const fs::path mf = fs::path(outDir) / (channel + ".manifest");
      std::ofstream(mf) << signedText;
      std::printf("published %s %s on %s: %s, %s\n", name.c_str(), version.c_str(), channel.c_str(), zapp.c_str(), mf.string().c_str());
      return 0;
    }
    if (proj.updateUrl.empty()) { std::fprintf(stderr, "zinc update-app: zinc.json update.url is where the channel manifests are\n"); return 2; }
    const std::string url = proj.updateUrl.size() > 9 && proj.updateUrl.compare(proj.updateUrl.size() - 9, 9, ".manifest") == 0 ? proj.updateUrl : proj.updateUrl + (proj.updateUrl.back() == '/' ? "" : "/") + channel + ".manifest";
    zn::tc::UpdateInfo info;
    if (!zn::tc::fetchManifest(url, info, err, {proj.updateKey})) { std::fprintf(stderr, "zinc update-app: %s\n", err.c_str()); return 1; }
    if (!zn::tc::newerVersion(info.version, version)) {
      if (info.version != version) { std::fprintf(stderr, "zinc update-app: refused: the %s channel offers %s, older than %s\n", channel.c_str(), info.version.c_str(), version.c_str()); return 1; }
      std::printf("%s %s is up to date\n", name.c_str(), version.c_str());
      return 0;
    }
    std::printf("%s %s is available (this is %s)%s%s\n", name.c_str(), info.version.c_str(), version.c_str(), info.notes.empty() ? "" : ": ", info.notes.c_str());
    if (checkOnly) return 10;
    std::string path;
    if (!zn::tc::downloadUpdate(info, zn::tc::home() + "/apps/" + (proj.app.id.empty() ? name : proj.app.id) + "/updates", path, err)) { std::fprintf(stderr, "zinc update-app: %s\n", err.c_str()); return 1; }
    { std::ofstream(zn::tc::home() + "/apps/" + (proj.app.id.empty() ? name : proj.app.id) + "/staged") << path << "\n"; }   // the next launch tries it (ZN-324.02)
    std::printf("downloaded and verified: %s\n", path.c_str());
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
  if (argc >= 3 && !std::strcmp(argv[1], "plugins") && !std::strcmp(argv[2], "search")) return zn::cli::indexSearch(std::vector<std::string>(argv, argv + argc), gRoot);   // ZN-336.03
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
  if (argc >= 3 && !std::strcmp(argv[1], "plugin-build")) {  // zinc plugin-build <plugin> [project-dir] [--prebuild]: compile the plugin's native code into the cache (or find it there) and say where it is
    // --prebuild: also copy the libraries into the plugin's prebuilt/<target>/ with their key, for a publisher to ship (ZN-328.03)
    // --pack <file.tar>: the same files as a deterministic ustar archive (<target>/plugin.*, key), byte-identical across machines of one target (ZN-333)
    std::string packOut;
    if (argc >= 5 && !std::strcmp(argv[argc - 2], "--pack")) { packOut = argv[argc - 1]; argc -= 2; }
    const bool prebuild = !std::strcmp(argv[argc - 1], "--prebuild");
    if (prebuild) --argc;
    std::string project = argc >= 4 ? argv[3] : ".";
    std::vector<std::string> problems;
    auto found = zn::frontend::discoverPlugins(gRoot + "/..", project, problems);
    const zn::frontend::FoundPlugin* hit = nullptr;
    for (const auto& f : found) if (f.manifest.name == argv[2]) hit = &f;
    if (!hit) { std::fprintf(stderr, "zinc: no plugin named '%s' (zinc plugins lists them)\n", argv[2]); return 1; }
    zn::tc::PluginLib lib;
    std::string err;
    zn::tc::loadPolicy(project);   // ZN-346
    if (!zn::tc::buildPlugin(*hit, gRoot, project, zn::tc::pluginTarget(), lib, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
    std::printf("%s %s %.2fs %s\n", lib.plugin.c_str(), lib.prebuilt ? "prebuilt" : lib.fetched ? "fetched" : lib.rebuilt ? "built" : "cached", lib.seconds, lib.shared.c_str());
    if (!packOut.empty()) {
      namespace fs = std::filesystem;
      std::vector<zn::zapp::TarEntry> files;
      const std::string t = zn::tc::pluginTarget();
      auto add = [&](const std::string& from, const std::string& name) {
        std::ifstream in(from, std::ios::binary);
        if (in) files.push_back({t + "/" + name, std::string((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>()), 0644, false});
      };
      add(lib.shared, fs::path(lib.shared).filename().string());
      add(lib.archive, "plugin.a");
      if (!lib.vendor.empty()) add(lib.vendor, "vendor.a");
      files.push_back({t + "/key", lib.key + "\n", 0644, false});
      std::sort(files.begin(), files.end(), [](const zn::zapp::TarEntry& a, const zn::zapp::TarEntry& b) { return a.name < b.name; });
      files.insert(files.begin(), {t, "", 0755, true});
      std::ofstream(packOut, std::ios::binary) << zn::zapp::ustar(files);
      std::printf("pack: %s\n", packOut.c_str());
    }
    if (prebuild && !lib.prebuilt) {
      namespace fs = std::filesystem;
      const fs::path pre = fs::path(hit->dir) / "prebuilt" / zn::tc::pluginTarget();
      std::error_code ec;
      fs::create_directories(pre, ec);
      for (const std::string& f : {lib.shared, lib.archive, lib.vendor}) if (!f.empty()) fs::copy_file(f, pre / (&f == &lib.vendor ? "vendor.a" : fs::path(f).filename().string()), fs::copy_options::overwrite_existing, ec);
      std::ofstream(pre / "key") << lib.key << "\n";
      if (ec) { std::fprintf(stderr, "zinc: cannot write %s: %s\n", pre.string().c_str(), ec.message().c_str()); return 1; }
      std::printf("prebuilt: %s\n", pre.string().c_str());
    }
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
