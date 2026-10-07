#include "tc/plugin_build.h"

#include <dlfcn.h>
#include <sys/wait.h>

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

// The compilers: $CXX / $CC, else c++ / cc, else the pinned zig (downloaded on first use).
bool compilers(std::string& cxx, std::string& cc, std::string& err) {
  const char* x = std::getenv("CXX");
  const char* c = std::getenv("CC");
  if (x && c) { cxx = x; cc = c; return true; }
  if (haveCommand("c++") && haveCommand("cc")) { cxx = x ? x : "c++"; cc = c ? c : "cc"; return true; }
  std::string zig;
  if (!ensureZig(zig, err)) return false;
  cxx = q(zig) + " c++";
  cc = q(zig) + " cc";
  return true;
}

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
  // the spec, its generated header and thunk
  fs::path nativeDir = fs::path(p.dir) / "native";
  std::string specPath, specText, base;
  std::error_code ec;
  for (const auto& e : fs::directory_iterator(nativeDir, ec)) if (endsWith(e.path().string(), ".spec.ts")) { specPath = e.path().string(); base = e.path().filename().string(); base.resize(base.size() - 8); }
  if (specPath.empty() || !readAll(specPath, specText)) { err = "plugin '" + m.name + "' has no native/*.spec.ts"; return false; }
  frontend::NativeGen gen;
  if (!frontend::generateNative(specPath, specText, gen, err)) return false;
  if (gen.thunk.empty()) { err = "plugin '" + m.name + "': no thunk can be written for its spec: " + gen.thunkNote; return false; }
  out.module = gen.name;
  // the implementation: the manifest's, else <x>.<target>.cpp, else <x>.host.cpp
  std::string impl;
  auto it = m.nativeImpl.find(target);
  if (it != m.nativeImpl.end()) impl = (fs::path(p.dir) / it->second).string();
  else for (std::string cand : {base + "." + target + ".cpp", base + ".host.cpp"}) if (impl.empty() && fs::exists(nativeDir / cand)) impl = (nativeDir / cand).string();
  if (impl.empty()) { err = "plugin '" + m.name + "' has no native source for target '" + target + "' (expected native/" + base + ".host.cpp)"; return false; }
  const frontend::PluginTarget& ts = m.targetSettings.at(target);
  std::string cxx, cc;
  if (!compilers(cxx, cc, err)) return false;
  // system libraries: pkg-config must know them; if not, say what to install
  std::vector<std::string> cflags, libs;
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
  for (const std::string& f : ts.frameworks) { libs.push_back("-framework " + f); }
  for (const std::string& l : ts.libs) libs.push_back(l.rfind("-", 0) == 0 ? l : "-l" + l);
  for (const std::string& l : ts.linkFlags) libs.push_back(l);
  out.linkArgs = libs;
  // flags: the runtime's own, the manifest's defines, the options as ZP_ defines
  std::vector<std::string> defines{"ZRT_HEAP_BYTES=536870912u", "ZRT_PLATFORM=\"macos\"", "ZRT_POINT_POOL=262144", "ZRT_GROW_DRAW_CMDS"};
  for (const std::string& d : ts.defines) defines.push_back(d);
  for (const std::string& d : frontend::pluginDefines(p, projectDir, engineRoot + "/..", target)) defines.push_back(d);
  std::string flags = "-std=c++17 -O2 -fPIC -fno-exceptions -fno-rtti -fwrapv -ffp-contract=off -fno-threadsafe-statics -w";
  for (const std::string& f : ts.flags) flags += " " + f;
  for (const std::string& c : cflags) flags += " " + c;
  std::string defs;
  for (const std::string& d : defines) defs += " -D" + q(d);
  std::string root = fs::path(engineRoot).string();
  std::string runtime = root + "/../runtime";
  // sources of the manifest: .c files are vendored libraries, the rest are compiled with the plugin
  std::vector<std::string> own{impl}, vendored;
  for (const std::string& s : ts.sources) (endsWith(s, ".c") ? vendored : own).push_back((fs::path(p.dir) / s).string());
  // cache keys
  Hash h, vh;
  for (const std::string& d : defines) { h.add(d); vh.add(d); }
  h.add(flags); vh.add(flags);
  h.add(cxx); vh.add(cc);
  h.add(gen.cppHeader); h.add(gen.thunk);
  for (const std::string& s : own) { std::string t; readAll(s, t); h.add(s); h.add(t); }
  for (const std::string& hp : {root + "/include/zn/native.h", root + "/src/native/zrt_compat.h", runtime + "/zrt.h"}) h.add(sha256File(hp));
  for (const std::string& s : vendored) { vh.add(fs::path(s).filename().string()); vh.add(sha256File(s)); }   // by content, so a copy of the plugin shares the archive
  h.add(target);
  std::string cache = home() + "/cache/" + target + "/plugins";
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
    if (!run("ar rcs " + q(out.vendor) + objs, err, "ar")) return false;
    out.rebuilt = true;
  }
  if (!fs::exists(out.shared) || !fs::exists(out.archive)) {
    std::string gdir = dir + "/gen";
    fs::create_directories(gdir, ec);
    std::string lower = gen.name;
    for (char& c : lower) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    { std::ofstream(gdir + "/zinc_native_" + lower + ".h") << gen.cppHeader; }
    std::string thunk = gdir + "/zinc_native_" + lower + "_thunk.cpp";
    { std::ofstream(thunk) << gen.thunk; }
    std::string inc = " -I" + q(gdir) + " -I" + q(root + "/src") + " -I" + q(root + "/include") + " -I" + q(runtime) + " -I" + q(runtime + "/include") + " -I" + q(p.dir);
    std::vector<std::string> objs;
    int k = 0;
    for (const std::string& s : own) {
      std::string o = dir + "/o" + std::to_string(k++) + ".o";
      if (!run(cxx + " " + flags + defs + inc + " -c " + q(s) + " -o " + q(o), err, "the C++ compiler on " + fs::path(s).filename().string())) return false;
      objs.push_back(o);
    }
    { std::string o = dir + "/thunk.o"; if (!run(cxx + " " + flags + defs + inc + " -c " + q(thunk) + " -o " + q(o), err, "the C++ compiler on the thunk of " + m.name)) return false; objs.push_back(o); }
    std::string list;
    for (const std::string& o : objs) list += " " + q(o);
    std::string linkLibs;
    for (const std::string& l : libs) linkLibs += " " + l;
    std::string undefined = pluginTarget() == "macos" ? " -undefined dynamic_lookup" : "";   // zrt and the registry come from the zinc that loads it
    std::string vend = out.vendor.empty() ? "" : " " + q(out.vendor);
    if (!run(cxx + " -shared -fPIC" + undefined + " -o " + q(out.shared) + list + vend + linkLibs, err, "linking " + m.name)) return false;
    fs::remove(out.archive, ec);
    if (!run("ar rcs " + q(out.archive) + list, err, "ar")) return false;
    out.rebuilt = true;
  }
  out.seconds = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
  return true;
}

bool loadPlugin(const PluginLib& lib, std::string& err) {
  void* h = dlopen(lib.shared.c_str(), RTLD_NOW | RTLD_LOCAL);
  if (!h) { err = std::string("cannot load ") + lib.shared + ": " + dlerror(); return false; }
  using Open = const ZnModule* (*)();
  auto open = reinterpret_cast<Open>(dlsym(h, ("zn_module_" + lib.module).c_str()));
  if (!open) { err = "plugin '" + lib.plugin + "' does not export zn_module_" + lib.module; return false; }
  char e[256] = "";
  if (zn_register_module(open(), e, sizeof e) != 0) { err = "plugin '" + lib.plugin + "': " + e; return false; }
  return true;
}

}  // namespace zn::tc
