#include "tc/plugin_build.h"

#include <dlfcn.h>
#include <sys/wait.h>

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <sstream>

#include "frontend/native_gen.h"
extern "C" {
#include "sha256.h"
}
#include "tc/tc.h"
#include "zn/native.h"

namespace zn::tc {
namespace fs = std::filesystem;

namespace {

bool readAll(const std::string& path, std::string& out) {
  std::ifstream in(path, std::ios::binary);
  if (!in) return false;
  std::stringstream ss;
  ss << in.rdbuf();
  out = ss.str();
  return true;
}

struct Hash {
  SHA256_CTX c;
  Hash() { sha256_init(&c); }
  void add(const std::string& s) {
    std::string n = std::to_string(s.size()) + ":";   // a length first, so that two fields never run together
    sha256_update(&c, reinterpret_cast<const BYTE*>(n.data()), n.size());
    sha256_update(&c, reinterpret_cast<const BYTE*>(s.data()), s.size());
  }
  std::string hex() {
    BYTE h[32];
    sha256_final(&c, h);
    static const char* d = "0123456789abcdef";
    std::string r;
    for (int i = 0; i < 8; ++i) { r += d[h[i] >> 4]; r += d[h[i] & 15]; }   // 16 hex digits are plenty for a cache key
    return r;
  }
};

std::string q(const std::string& s) {   // shell quoting
  std::string r = "'";
  for (char c : s) { if (c == '\'') r += "'\\''"; else r += c; }
  return r + "'";
}

// stdout of a command, and whether it succeeded
bool capture(const std::string& cmd, std::string& out) {
  out.clear();
  FILE* f = popen((cmd + " 2>/dev/null").c_str(), "r");
  if (!f) return false;
  char buf[512];
  std::size_t n;
  while ((n = std::fread(buf, 1, sizeof buf, f)) > 0) out.append(buf, n);
  int st = pclose(f);
  while (!out.empty() && (out.back() == '\n' || out.back() == ' ')) out.pop_back();
  return st == 0;
}

bool haveCommand(const std::string& c) { std::string o; return capture("command -v " + q(c), o) && !o.empty(); }

bool endsWith(const std::string& s, const char* e) { std::size_t n = std::strlen(e); return s.size() >= n && s.compare(s.size() - n, n, e) == 0; }

struct Cross { std::string name, zigTarget, zig; bool on = false; } gCross;
std::string crossArch() { return gCross.name == "armhf-linux" ? " -mcpu=arm1176jzf_s" : ""; }

// The compilers: $CXX / $CC, else c++ / cc, else the pinned zig (downloaded on first use).
// The compilers of a plugin (ZN-332): the pinned zig by default, so the cache key names the compiler by its version, not by where it is, and two machines building the same
// plugin for the same target compute the same key (a prebuilt binary can match). ZINC_PLUGIN_CC=system, or zinc.json "pluginCompiler": "system", uses $CXX / $CC or the
// system c++ / cc instead; their key then carries the compiler's --version line. `id` is what the key hashes.
std::string gAr = "ar", gKeyTarget;   // gKeyTarget: the machine the code is for, as the key names it
bool compilers(bool system, std::string& cxx, std::string& cc, std::string& id, std::string& err) {
  if (gCross.on) { cxx = q(gCross.zig) + " c++ -target " + gCross.zigTarget + crossArch(); cc = q(gCross.zig) + " cc -target " + gCross.zigTarget + crossArch(); gAr = q(gCross.zig) + " ar"; id = "zig " + zigVersion(); gKeyTarget = gCross.zigTarget + crossArch(); return true; }
  if (system) {
    const char* x = std::getenv("CXX");
    const char* c = std::getenv("CC");
    if (!(x && c) && !(haveCommand("c++") && haveCommand("cc"))) { err = "ZINC_PLUGIN_CC=system, but this machine has no c++ and cc (or set CXX and CC)"; return false; }
    cxx = x ? x : "c++";
    cc = c ? c : "cc";
    gAr = "ar";
    std::string v;
    capture(cxx + " --version 2>&1 | head -1", v);
    id = "system " + v;
    gKeyTarget = hostName();
    return true;
  }
  std::string zig;
  if (!ensureZig(zig, err)) return false;
  cxx = q(zig) + " c++";
  cc = q(zig) + " cc";
  gAr = q(zig) + " ar";
  id = "zig " + zigVersion();   // the version, never the path
  gKeyTarget = hostName();
  if (const Target* t = findTarget(hostName()); t && pluginTarget() == "linux") {   // Linux: the triple a cross build from another machine uses (aarch64-linux-gnu), so both build the same code
    cxx += std::string(" -target ") + t->zigTarget;
    cc += std::string(" -target ") + t->zigTarget;
    gKeyTarget = t->zigTarget;
  }
  return true;
}

std::string arTool() { return gAr; }

bool run(const std::string& cmd, std::string& err, const std::string& what) {
  std::string log = cmd + " 2>&1";
  FILE* f = popen(log.c_str(), "r");
  if (!f) { err = "cannot run " + what; return false; }
  std::string out;
  char buf[512];
  std::size_t n;
  while ((n = std::fread(buf, 1, sizeof buf, f)) > 0) out.append(buf, n);
  if (pclose(f) != 0) { err = what + " failed:\n" + out.substr(0, 3000); return false; }
  return true;
}

}  // namespace

void setCrossTarget(const std::string& name, const std::string& zigTarget, const std::string& zig) { gCross = Cross{name, zigTarget, zig, true}; }
void clearCrossTarget() { gCross = Cross{}; }

std::string pluginTarget() {
#if defined(__APPLE__)
  return "macos";
#else
  return "linux";
#endif
}

const frontend::FoundPlugin* pluginForModule(const std::vector<frontend::FoundPlugin>& plugins, const std::string& module) {
  for (const frontend::FoundPlugin& p : plugins) {
    std::error_code ec;
    for (const auto& e : fs::directory_iterator(fs::path(p.dir) / "native", ec)) {
      std::string path = e.path().string(), text;
      if (!endsWith(path, ".spec.ts") || !readAll(path, text)) continue;
      frontend::NativeGen g;
      std::string err;
      if (frontend::generateNative(path, text, g, err) && g.name == module) return &p;
    }
  }
  return nullptr;
}

bool buildPlugin(const frontend::FoundPlugin& p, const std::string& engineRoot, const std::string& projectDir, const std::string& target, PluginLib& out, std::string& err) {
  auto t0 = std::chrono::steady_clock::now();
  const frontend::PluginManifest& m = p.manifest;
  out = PluginLib{};
  out.plugin = m.name;
  bool known = false;
  for (const std::string& t : m.targets) known = known || t == target;
  if (!known) { err = "plugin '" + m.name + "' is not available on target '" + target + "'"; return false; }
  bool display = m.kind == "display";   // a display driver (plugins/display-*): its sources only, no spec and no thunk
  out.display = display;
  fs::path nativeDir = fs::path(p.dir) / "native";
  std::string specPath, specText, base, impl;
  std::error_code ec;
  frontend::NativeGen gen;
  if (!display) {
  for (const auto& e : fs::directory_iterator(nativeDir, ec)) if (endsWith(e.path().string(), ".spec.ts")) { specPath = e.path().string(); base = e.path().filename().string(); base.resize(base.size() - 8); }
  if (specPath.empty() || !readAll(specPath, specText)) { err = "plugin '" + m.name + "' has no native/*.spec.ts"; return false; }
  if (!frontend::generateNative(specPath, specText, gen, err)) return false;
  if (gen.thunk.empty()) { err = "plugin '" + m.name + "': no thunk can be written for its spec: " + gen.thunkNote; return false; }
  out.module = gen.name;
  // the implementation: the manifest's, else <x>.<target>.cpp, else <x>.host.cpp
  auto it = m.nativeImpl.find(target);
  if (it != m.nativeImpl.end()) impl = (fs::path(p.dir) / it->second).string();
  else for (std::string cand : {base + "." + target + ".cpp", base + ".host.cpp"}) if (impl.empty() && fs::exists(nativeDir / cand)) impl = (nativeDir / cand).string();
  if (impl.empty()) { err = "plugin '" + m.name + "' has no native source for target '" + target + "' (expected native/" + base + ".host.cpp)"; return false; }
  }
  const frontend::PluginTarget& ts = m.targetSettings.at(target);
  // system libraries: pkg-config must know them; if not, say what to install
  std::vector<std::string> cflags, libs;
  if (gCross.on && !ts.pkg.empty()) { err = "plugin '" + m.name + "' needs the system library '" + ts.pkg[0] + "', which a cross build for " + gCross.name + " has no sysroot for yet"; return false; }
  for (const std::string& pkg : ts.pkg) {
    std::string o;
    if (!haveCommand("pkg-config") || !capture("pkg-config --exists " + q(pkg) + " && echo ok", o)) {
      std::string hint;
      for (const std::string& pk : ts.packages) hint += (hint.empty() ? "" : ", ") + pk;
      err = "plugin '" + m.name + "' needs the system library '" + pkg + "'" + (haveCommand("pkg-config") ? "" : " (and pkg-config)") + ": install " + (hint.empty() ? "its development package" : "the package " + hint) +
            (pluginTarget() == "macos" ? " (for example with brew)" : " (for example with apt or apk)") + ", then run the command again";
      return false;
    }
    std::string c, l;
    capture("pkg-config --cflags " + q(pkg), c);
    capture("pkg-config --libs " + q(pkg), l);
    if (!c.empty()) cflags.push_back(c);
    if (!l.empty()) libs.push_back(l);
  }
  // a path in `flags`, `libs` or `linkFlags` that starts with ./ or ../ (or follows -I / -L) is relative to the plugin, not to wherever zinc runs
  auto rel = [&](const std::string& t) {
    size_t at = t.rfind("-I", 0) == 0 || t.rfind("-L", 0) == 0 ? 2 : 0;
    if (t.compare(at, 2, "./") != 0 && t.compare(at, 3, "../") != 0) return t;
    return t.substr(0, at) + (fs::path(p.dir) / t.substr(at)).lexically_normal().string();
  };
  for (const std::string& f : ts.frameworks) { libs.push_back("-framework " + f); }
  for (const std::string& l : ts.libs) libs.push_back(l.rfind("-", 0) == 0 ? rel(l) : l.rfind(".", 0) == 0 ? q(rel(l)) : "-l" + l);
  for (const std::string& l : ts.linkFlags) libs.push_back(l.rfind("-", 0) == 0 ? rel(l) : q(rel(l)));
  out.linkArgs = libs;
  // flags: the runtime's own, the manifest's defines, the options as ZP_ defines
  std::vector<std::string> defines{"ZRT_HEAP_BYTES=536870912u", gCross.on || pluginTarget() == "linux" ? "ZRT_PLATFORM=\"linux\"" : "ZRT_PLATFORM=\"macos\"", "ZRT_POINT_POOL=262144", "ZRT_GROW_DRAW_CMDS"};
  for (const std::string& d : ts.defines) defines.push_back(d);
  for (const std::string& d : frontend::pluginDefines(p, projectDir, engineRoot + "/..", target)) defines.push_back(d);
  std::string flags = "-std=c++17 -O2 -fPIC -fno-exceptions -fno-rtti -fwrapv -ffp-contract=off -fno-threadsafe-statics -w";
  for (const std::string& f : ts.flags) flags += " " + rel(f);
  for (const std::string& c : cflags) flags += " " + c;
  std::string defs;
  for (const std::string& d : defines) defs += " -D" + q(d);
  std::string root = fs::path(engineRoot).string();
  std::string runtime = root + "/../runtime";
  // sources of the manifest: .c files are vendored libraries, the rest are compiled with the plugin
  std::vector<std::string> own, vendored;
  if (!display) own.push_back(impl);
  for (const std::string& s : ts.sources) (endsWith(s, ".c") ? vendored : own).push_back((fs::path(p.dir) / s).string());
  // prebuilt libraries shipped with the plugin (ZN-328.03): prebuilt/<target>/ holds plugin.dylib or .so, plugin.a, vendor.a when it has vendored C, and `key`: the
  // digest of the ABI headers and the defines they were built with (zinc plugin-build --prebuild writes them). A matching key uses them, no compiler needed; otherwise
  // (other options in zinc.json, another engine) the plugin is built locally as before.
  {
    Hash k;
    for (const std::string& d : defines) k.add(d);
    for (const std::string& hp : {root + "/include/zn/native.h", root + "/src/native/zrt_compat.h", runtime + "/zrt.h", runtime + "/include/hal.h"}) k.add(sha256File(hp));
    k.add(display ? "display" : "module");
    out.key = k.hex();
    const fs::path pre = fs::path(p.dir) / "prebuilt" / (gCross.on ? gCross.name : target);
    std::string key;
    if (readAll((pre / "key").string(), key)) {
      while (!key.empty() && (key.back() == '\n' || key.back() == ' ')) key.pop_back();
      const std::string ext = pluginTarget() == "macos" ? ".dylib" : ".so";
      if (key == out.key && fs::exists(pre / "plugin.a") && (gCross.on || fs::exists(pre / ("plugin" + ext)))) {
        out.shared = (pre / ("plugin" + ext)).string();
        out.archive = (pre / "plugin.a").string();
        if (fs::exists(pre / "vendor.a")) out.vendor = (pre / "vendor.a").string();
        out.prebuilt = true;
        out.seconds = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
        return true;
      }
      std::fprintf(stderr, "zinc: plugin '%s': its prebuilt libraries for %s were built for other options or another engine; building it here\n", m.name.c_str(), (gCross.on ? gCross.name : target).c_str());
    }
  }
  bool system = false;   // ZINC_PLUGIN_CC=system or zinc.json "pluginCompiler": "system"
  if (const char* pc = std::getenv("ZINC_PLUGIN_CC"); pc && *pc) system = std::string(pc) == "system";
  else if (std::string zj; readAll(projectDir + "/zinc.json", zj)) system = zj.find("\"pluginCompiler\": \"system\"") != std::string::npos || zj.find("\"pluginCompiler\":\"system\"") != std::string::npos;
  std::string cxx, cc, ccId;
  if (!compilers(system, cxx, cc, ccId, err)) return false;
  // cache keys: by content and by what the compiler is, never by where the plugin, the engine or the compiler sits on this machine
  std::string keyFlags = "-std=c++17 -O2 -fPIC -fno-exceptions -fno-rtti -fwrapv -ffp-contract=off -fno-threadsafe-statics -w";
  for (const std::string& f : ts.flags) keyFlags += " " + f;   // as written in plugin.json (`flags` resolves ./ paths against this machine's plugin directory)
  for (const std::string& c : cflags) keyFlags += " " + c;
  const auto relToPlugin = [&](const std::string& path) { return fs::path(path).lexically_relative(p.dir).generic_string(); };
  Hash h, vh;
  for (const std::string& d : defines) { h.add(d); vh.add(d); }
  h.add(keyFlags); vh.add(keyFlags);
  h.add(ccId); vh.add(ccId);
  h.add(gen.cppHeader); h.add(gen.thunk);
  h.add(display ? "display" : "module");
  for (const std::string& s : own) { std::string t; readAll(s, t); h.add(relToPlugin(s)); h.add(t); }
  for (const std::string& hp : {root + "/include/zn/native.h", root + "/src/native/zrt_compat.h", runtime + "/zrt.h", runtime + "/include/hal.h"}) h.add(sha256File(hp));
  for (const std::string& s : own) {   // the headers beside the sources, in name order
    std::vector<std::string> hs;
    std::error_code e2;
    for (const auto& f : fs::directory_iterator(fs::path(s).parent_path(), e2)) if (f.path().extension() == ".h") hs.push_back(f.path().string());
    std::sort(hs.begin(), hs.end());
    for (const std::string& f : hs) h.add(sha256File(f));
  }
  for (const std::string& s : vendored) { vh.add(fs::path(s).filename().string()); vh.add(sha256File(s)); }   // by content, so a copy of the plugin shares the archive
  h.add(gKeyTarget); vh.add(gKeyTarget);   // the machine the code is for: aarch64-linux-gnu from a Mac and in a Linux container alike
  std::string cache = home() + "/cache/" + (gCross.on ? gCross.name : target) + "/plugins";
  std::string dir = cache + "/" + m.name + "-" + h.hex();
  std::string vdir = cache + "/" + m.name + "-vendor-" + vh.hex();
  bool dyn = true;
  std::string ext = pluginTarget() == "macos" ? ".dylib" : ".so";
  out.shared = dir + "/plugin" + ext;
  out.archive = dir + "/plugin.a";
  if (!vendored.empty()) out.vendor = vdir + "/vendor.a";
  (void)dyn;
  fs::create_directories(dir, ec);
  if (!vendored.empty() && !fs::exists(out.vendor)) {   // the vendored C libraries: compiled once for these defines
    fs::create_directories(vdir, ec);
    std::string objs;
    int k = 0;
    for (const std::string& s : vendored) {
      std::string o = vdir + "/v" + std::to_string(k++) + ".o";
      std::string cflagsC = "-O2 -fPIC -w";
      for (const std::string& d : defines) if (d.rfind("ZP_", 0) != 0 && d.rfind("ZRT_", 0) != 0) cflagsC += " -D" + q(d);
      if (!run(cc + " " + cflagsC + " -c " + q(s) + " -o " + q(o), err, "the C compiler on " + s)) return false;
      objs += " " + q(o);
    }
    if (!run(arTool() + " rcs " + q(out.vendor) + objs, err, "ar")) return false;
    out.rebuilt = true;
  }
  // trust: the digest written after the build must still match the library (a tampered cache entry is refused, never loaded); an entry without one is rebuilt
  std::string digestFile = dir + "/plugin.sha256", recorded;
  if (fs::exists(out.shared) && readAll(digestFile, recorded)) {
    while (!recorded.empty() && (recorded.back() == '\n' || recorded.back() == ' ')) recorded.pop_back();
    if (recorded != sha256File(out.shared) + " " + sha256File(out.archive)) {
      err = "the native library of plugin '" + m.name + "' in " + dir + " does not match its recorded digest: refused (delete the directory to rebuild it)";
      return false;
    }
  } else { fs::remove(out.shared, ec); }
  if (!fs::exists(out.shared) || !fs::exists(out.archive)) {
    std::string gdir = dir + "/gen";
    fs::create_directories(gdir, ec);
    std::string lower = gen.name;
    for (char& c : lower) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    std::string thunk = gdir + "/zinc_native_" + lower + "_thunk.cpp";
    if (!display) {
      { std::ofstream(gdir + "/zinc_native_" + lower + ".h") << gen.cppHeader; }
      { std::ofstream(thunk) << gen.thunk; }
    }
    std::string inc = " -I" + q(gdir) + " -I" + q(root + "/src") + " -I" + q(root + "/include") + " -I" + q(runtime) + " -I" + q(runtime + "/include") + " -I" + q(p.dir)
#ifdef ZN_SDL_INCLUDE
      + (!display && fs::exists(root + "/../plugins/display-gl/zgl.h") ? " -I" + q(root + "/../plugins/display-gl") : std::string())   // zinc:mapping draws through the GL context of display-gl (zgl.h)
      + (display && pluginTarget() == "macos" ? " -I" + q(ZN_SDL_INCLUDE) : std::string())   // the emulator windows of the display drivers use SDL3 (the host's)
#endif
      ;
    std::vector<std::string> objs;
    int k = 0;
    for (const std::string& s : own) {
      std::string o = dir + "/o" + std::to_string(k++) + ".o";
      if (!run(cxx + " " + flags + defs + inc + " -c " + q(s) + " -o " + q(o), err, "the C++ compiler on " + fs::path(s).filename().string())) return false;
      objs.push_back(o);
    }
    if (!display) { std::string o = dir + "/thunk.o"; if (!run(cxx + " " + flags + defs + inc + " -c " + q(thunk) + " -o " + q(o), err, "the C++ compiler on the thunk of " + m.name)) return false; objs.push_back(o); }
    std::string list;
    for (const std::string& o : objs) list += " " + q(o);
    std::string linkLibs;
    for (const std::string& l : libs) linkLibs += " " + l;
    std::string undefined = pluginTarget() == "macos" ? " -undefined dynamic_lookup" : "";   // zrt and the registry come from the zinc that loads it
    std::string vend = out.vendor.empty() ? "" : " " + q(out.vendor);
    if (!gCross.on && !run(cxx + " -shared -fPIC" + undefined + " -o " + q(out.shared) + list + vend + linkLibs, err, "linking " + m.name)) return false;
    fs::remove(out.archive, ec);
    if (!run(arTool() + " rcs " + q(out.archive) + list, err, "ar")) return false;
    if (gCross.on) { std::ofstream(out.shared) << "cross build: no shared library\n"; }   // a placeholder so the cache check below finds the entry
    { std::ofstream(digestFile) << sha256File(out.shared) << " " << sha256File(out.archive) << "\n"; }
    out.rebuilt = true;
  }
  out.seconds = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
  return true;
}

bool loadPlugin(const PluginLib& lib, std::string& err) {
  void* h = dlopen(lib.shared.c_str(), RTLD_NOW | (lib.display ? RTLD_GLOBAL : RTLD_LOCAL));   // a driver's zgl_* functions are what GPU plugins (zinc:mapping) bind to
  if (!h) { err = std::string("cannot load ") + lib.shared + ": " + dlerror(); return false; }
  if (lib.display) return true;   // its static constructor has registered it with the HAL
  using Open = const ZnModule* (*)();
  auto open = reinterpret_cast<Open>(dlsym(h, ("zn_module_" + lib.module).c_str()));
  if (!open) { err = "plugin '" + lib.plugin + "' does not export zn_module_" + lib.module; return false; }
  char e[256] = "";
  if (zn_register_module(open(), e, sizeof e) != 0) { err = "plugin '" + lib.plugin + "': " + e; return false; }
  return true;
}

}  // namespace zn::tc
