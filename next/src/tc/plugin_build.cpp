#include "tc/plugin_build.h"
#include "tc/policy.h"
#include "zn/log.h"
#include "tc/tlog.h"
#include "tc/tuf.h"
#include "zapp.h"
#include "yyjson.h"

#include <dlfcn.h>
#include <sys/stat.h>
#include <sys/wait.h>

#include <algorithm>
#include <chrono>
#include <ctime>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <map>
#include <memory>
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

bool haveCommand(const std::string& c) {   // asked again at every compile: one shell per command and process (ZN-614)
  static std::map<std::string, bool> known;
  auto it = known.find(c);
  if (it != known.end()) return it->second;
  std::string o;
  return known[c] = capture("command -v " + q(c), o) && !o.empty();
}

bool endsWith(const std::string& s, const char* e) { std::size_t n = std::strlen(e); return s.size() >= n && s.compare(s.size() - n, n, e) == 0; }

struct Cross { std::string name, zigTarget, zig; bool on = false; } gCross;
std::string crossArch() { const Target* t = findTarget(gCross.name); return t ? t->cpuFlags : ""; }

// The compilers: $CXX / $CC, else c++ / cc, else the pinned zig (downloaded on first use).
// The compilers of a plugin (ZN-332): the pinned zig by default, so the cache key names the compiler by its version, not by where it is, and two machines building the same
// plugin for the same target compute the same key (a prebuilt binary can match). ZINC_PLUGIN_CC=system, or zinc.json "pluginCompiler": "system", uses $CXX / $CC or the
// system c++ / cc instead; their key then carries the compiler's --version line. `id` is what the key hashes.
std::string gAr = "ar", gKeyTarget;
// zig compiles libc++, libc++abi and libunwind from its own lib/ into Linux plugins and writes their paths (assert and __PRETTY_FUNCTION__ strings): it sees that
// directory through a fixed link, /tmp/zinc-zig-<version>-lib, so the bytes do not depend on where ZINC_HOME is (ZN-333). An unusable link: the real path.
std::string zigEnv(const std::string& zig) {
  const fs::path lib = fs::path(zig).parent_path() / "lib", link = fs::path("/tmp") / ("zinc-zig-" + zigVersion() + "-lib");
  std::error_code ec;
  if (!fs::exists(link / "libcxx", ec)) {   // missing or broken: (re)made, pointing at this zig
    fs::remove(link, ec);
    fs::create_directory_symlink(lib, link, ec);
  }
  return fs::exists(link / "libcxx", ec) ? "ZIG_LIB_DIR=" + q(link.string()) + " " : std::string();
}   // gKeyTarget: the machine the code is for, as the key names it
bool compilers(bool system, std::string& cxx, std::string& cc, std::string& id, std::string& err) {
  if (gCross.on) { cxx = zigEnv(gCross.zig) + q(gCross.zig) + " c++ -target " + gCross.zigTarget + crossArch(); cc = zigEnv(gCross.zig) + q(gCross.zig) + " cc -target " + gCross.zigTarget + crossArch(); gAr = q(gCross.zig) + " ar"; id = "zig " + zigVersion(); gKeyTarget = gCross.zigTarget + crossArch(); return true; }
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
  cxx = zigEnv(zig) + q(zig) + " c++";
  cc = zigEnv(zig) + q(zig) + " cc";
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

// A published binary (ZN-337): binaries/<target>/<name>-<cache key>.tar from the signed plugin index (the TUF client checks the index's signatures and the
// archive's length and SHA-256), unpacked into the cache entry with its digest, so nothing is compiled. The key covers the sources, so a changed plugin misses.
// Off with ZINC_PREBUILT=0; no trusted index root, or the index unreachable: a silent miss; a refused archive is said, then the plugin is built here.
void fetchPrebuilt(const std::string& name, const std::string& key, const std::string& target, const std::string& engineRoot, const std::string& dir, const std::string& vdir, PluginLib& out) {
  const Policy& policy = currentPolicy();   // ZN-346: published binaries allowed or source only, tiers, rebuilds, transparency
  if (!policy.prebuilt) return;
  std::unique_ptr<tuf::Client> index;
  std::string err, bytes;
  if (!tuf::openIndex(engineRoot, index, err)) return;   // no index here: build
  tuf::Client& c = *index;
  std::error_code ec;
  tuf::Target t;
  // an official binary (signed by the top-level role), else a verified publisher's (<publisher>/binaries/...) once enough rebuilds matched it (ZN-340)
  std::string path = "binaries/" + target + "/" + name + "-" + key + ".tar";
  if (!c.find(path, t, err) || !policy.accepts("official")) {
    std::vector<tuf::Target> all;
    t = tuf::Target{};
    if (c.all(all, err)) for (const tuf::Target& x : all) {
      const std::string tail = "/binaries/" + target + "/" + name + "-" + key + ".tar";
      if (x.role != "targets" && x.path.size() > tail.size() && x.path.compare(x.path.size() - tail.size(), tail.size(), tail) == 0) { t = x; break; }
    }
    if (t.path.empty() || !policy.accepts("verified")) return;   // no binary for this key, or the policy refuses verified publishers: build
    path = t.path;
    tuf::Target att;
    std::string attBytes, e2;
    long long matches = 0;
    if (c.find("rebuilds/" + t.sha256 + ".json", att, e2) && att.role == "targets" && c.download(att, attBytes, e2))
      if (yyjson_doc* d = yyjson_read(attBytes.data(), attBytes.size(), 0)) { yyjson_val* m = yyjson_obj_get(yyjson_doc_get_root(d), "matches"); matches = yyjson_is_int(m) ? yyjson_get_sint(m) : 0; yyjson_doc_free(d); }
    const long long need = policy.rebuilds;
    std::fprintf(stderr, "zinc: plugin '%s': a binary of verified publisher %s, %lld matching rebuild(s) of the %lld required%s\n", name.c_str(), t.role.c_str(), matches, need, matches >= need ? "" : ": building it here");
    if (matches < need) return;
  }
  if (!c.download(t, bytes, err)) { std::fprintf(stderr, "zinc: the published binary %s was refused (%s); building plugin '%s' here\n", path.c_str(), err.c_str(), name.c_str()); return; }
  if (policy.transparency == "required" && tuf::logKey(engineRoot).empty()) { std::fprintf(stderr, "zinc: the policy requires the transparency log and no log key is pinned; building plugin '%s' here\n", name.c_str()); return; }
  if (const std::string lk = tuf::logKey(engineRoot); !lk.empty() && !tlog::checkArtifact(tuf::indexFetch(tuf::indexUrl()), lk, home() + "/index/log-state.json", t.path, t.sha256, err)) {
    std::fprintf(stderr, "zinc: the published binary %s was refused (%s); building plugin '%s' here\n", path.c_str(), err.c_str(), name.c_str());   // ZN-343: what is installed must be in the public log
    return;
  }
  std::map<std::string, std::string> files;
  if (!zapp::untar(bytes, files, err)) { std::fprintf(stderr, "zinc: the published binary %s is not a readable archive (%s); building it here\n", path.c_str(), err.c_str()); return; }
  const std::string shared = fs::path(out.shared).filename().string();
  std::string so, ar, vendor;
  for (const auto& [n, b] : files) {
    const std::string f = fs::path(n).filename().string();
    if (f == shared) so = b; else if (f == "plugin.a") ar = b; else if (f == "vendor.a") vendor = b;
  }
  if (ar.empty() || (so.empty() && !gCross.on) || (!out.vendor.empty() && vendor.empty())) { std::fprintf(stderr, "zinc: the published binary %s lacks a library; building it here\n", path.c_str()); return; }
  std::ofstream(out.shared, std::ios::binary) << (so.empty() ? std::string("cross build: no shared library\n") : so);
  std::ofstream(out.archive, std::ios::binary) << ar;
  if (!out.vendor.empty()) { fs::create_directories(vdir, ec); std::ofstream(out.vendor, std::ios::binary) << vendor; }
  std::ofstream(dir + "/plugin.sha256") << sha256File(out.shared) << " " << sha256File(out.archive) << "\n";
  out.fetched = true;
}

// The defines a plugin is compiled with: the runtime's own, the manifest's, the options as ZP_ defines.
std::vector<std::string> buildDefines(const frontend::FoundPlugin& p, const frontend::PluginTarget& ts, const std::string& engineRoot, const std::string& projectDir, const std::string& target) {
  std::vector<std::string> defines{"ZRT_HEAP_BYTES=536870912u", gCross.on || pluginTarget() == "linux" ? "ZRT_PLATFORM=\"linux\"" : "ZRT_PLATFORM=\"macos\"", "ZRT_POINT_POOL=262144", "ZRT_GROW_DRAW_CMDS"};
  for (const std::string& d : ts.defines) defines.push_back(d);
  for (const std::string& d : frontend::pluginDefines(p, projectDir, engineRoot + "/..", target)) defines.push_back(d);
  return defines;
}
bool systemCompiler(const std::string& projectDir) {   // ZINC_PLUGIN_CC=system or zinc.json "pluginCompiler": "system"
  if (const char* pc = std::getenv("ZINC_PLUGIN_CC"); pc && *pc) return std::string(pc) == "system";
  std::string zj;
  return readAll(projectDir + "/zinc.json", zj) && (zj.find("\"pluginCompiler\": \"system\"") != std::string::npos || zj.find("\"pluginCompiler\":\"system\"") != std::string::npos);
}

bool buildPluginSlow(const frontend::FoundPlugin& p, const std::string& engineRoot, const std::string& projectDir, const std::string& target, PluginLib& out, std::string& err) {
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
  if (!ts.pkg.empty()) {   // one query for all of them: this runs at every compile and start, and each pkg-config costs a process (16 of them for zinc:video, 140 ms; ZN-614)
    std::string all, o;
    for (const std::string& pkg : ts.pkg) all += " " + q(pkg);
    const bool have = haveCommand("pkg-config");
    if (!have || !capture("(pkg-config --exists" + all + " && pkg-config --cflags" + all + " && echo @@ && pkg-config --libs" + all + ")", o) || o.find("@@") == std::string::npos) {
      std::string missing = ts.pkg[0], x;
      if (have) for (const std::string& pkg : ts.pkg) if (!capture("pkg-config --exists " + q(pkg) + " && echo ok", x) || x.empty()) { missing = pkg; break; }
      std::string hint;
      for (const std::string& pk : ts.packages) hint += (hint.empty() ? "" : ", ") + pk;
      err = "plugin '" + m.name + "' needs the system library '" + missing + "'" + (have ? "" : " (and pkg-config)") + ": install " + (hint.empty() ? "its development package" : "the package " + hint) +
            (pluginTarget() == "macos" ? " (for example with brew)" : " (for example with apt or apk)") + ", then run the command again";
      return false;
    }
    auto trim = [](std::string t) { while (!t.empty() && std::isspace(static_cast<unsigned char>(t.back()))) t.pop_back(); while (!t.empty() && std::isspace(static_cast<unsigned char>(t.front()))) t.erase(0, 1); return t; };
    const std::size_t at = o.find("@@");
    std::string c = trim(o.substr(0, at)), l = trim(o.substr(at + 2));
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
  const std::vector<std::string> defines = buildDefines(p, ts, engineRoot, projectDir, target);
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
        log::write("plugin", log::Info, m.name + ": prebuilt in the plugin (" + pre.string() + ")", out.seconds * 1000);
        return true;
      }
      std::fprintf(stderr, "zinc: plugin '%s': its prebuilt libraries for %s were built for other options or another engine; building it here\n", m.name.c_str(), (gCross.on ? gCross.name : target).c_str());
    }
  }
  const bool system = systemCompiler(projectDir);
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
  for (const std::string& hp : {root + "/include/zn/native.h", root + "/src/native/zrt_compat.h", runtime + "/zrt.h", runtime + "/zrt_raster.h", runtime + "/gl_replay.cpp", runtime + "/include/hal.h"}) h.add(sha256File(hp));
  for (const std::string& s : own) {   // the files beside the sources, in name order: headers, and sources one of them #includes (display-gl's gl_renderer.cpp)
    std::vector<std::string> hs;
    std::error_code e2;
    for (const auto& f : fs::directory_iterator(fs::path(s).parent_path(), e2)) {
      const std::string ext = f.path().extension().string();
      if (ext == ".h" || ext == ".hpp" || ext == ".inc" || ext == ".cpp" || ext == ".cc" || ext == ".c" || ext == ".mm") hs.push_back(f.path().string());
    }
    std::sort(hs.begin(), hs.end());
    for (const std::string& f : hs) h.add(sha256File(f));
  }
  for (const std::string& s : vendored) { vh.add(fs::path(s).filename().string()); vh.add(sha256File(s)); }   // by content, so a copy of the plugin shares the archive
  h.add(gKeyTarget); vh.add(gKeyTarget);   // the machine the code is for: aarch64-linux-gnu from a Mac and in a Linux container alike
  std::string cache = home() + "/cache/" + (gCross.on ? gCross.name : target) + "/plugins";
  const std::string keyHex = h.hex();
  std::string dir = cache + "/" + m.name + "-" + keyHex;
  std::string vdir = cache + "/" + m.name + "-vendor-" + vh.hex();
  bool dyn = true;
  std::string ext = pluginTarget() == "macos" ? ".dylib" : ".so";
  out.shared = dir + "/plugin" + ext;
  out.archive = dir + "/plugin.a";
  if (!vendored.empty()) out.vendor = vdir + "/vendor.a";
  (void)dyn;
  // reproducible objects (ZN-333): the paths of this machine (the plugin, the cache entry, the engine, the toolchains) become fixed names in __FILE__ and the object files
  const std::string remap = " -ffile-prefix-map=" + q(p.dir) + "=plugins/" + m.name + " -ffile-prefix-map=" + q(dir) + "=cache -ffile-prefix-map=" + q(vdir) + "=cache" +
                            " -ffile-prefix-map=" + q(fs::path(root).parent_path().string()) + "=zinc -ffile-prefix-map=" + q(home() + "/toolchains") + "=toolchains";
  fs::create_directories(dir, ec);
  if (!fs::exists(out.shared) || !fs::exists(out.archive)) fetchPrebuilt(m.name, keyHex, gCross.on ? gCross.name : target, engineRoot, dir, vdir, out);   // ZN-337: a published binary first
  if (!vendored.empty() && !fs::exists(out.vendor)) {   // the vendored C libraries: compiled once for these defines
    fs::create_directories(vdir, ec);
    std::string objs;
    int k = 0;
    for (const std::string& s : vendored) {
      std::string o = vdir + "/v" + std::to_string(k++) + ".o";
      std::string cflagsC = "-O2 -fPIC -w";
      for (const std::string& d : defines) if (d.rfind("ZP_", 0) != 0 && d.rfind("ZRT_", 0) != 0) cflagsC += " -D" + q(d);
      if (!run(cc + " " + cflagsC + remap + " -c " + q(s) + " -o " + q(o), err, "the C compiler on " + s)) return false;
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
      + (pluginTarget() == "macos" ? " -I" + q(std::string(ZN_SDL_INCLUDE).rfind("@root@", 0) == 0 ? root + std::string(ZN_SDL_INCLUDE).substr(6) : std::string(ZN_SDL_INCLUDE)) : std::string())   // SDL3 (the host's): the emulator windows of the display drivers, zinc:3d's GL context
#endif
      ;
    std::vector<std::string> objs;
    int k = 0;
    for (const std::string& s : own) {
      std::string o = dir + "/o" + std::to_string(k++) + ".o";
      if (!run(cxx + " " + flags + remap + defs + inc + " -c " + q(s) + " -o " + q(o), err, "the C++ compiler on " + fs::path(s).filename().string())) return false;
      objs.push_back(o);
    }
    if (!display) { std::string o = dir + "/thunk.o"; if (!run(cxx + " " + flags + remap + defs + inc + " -c " + q(thunk) + " -o " + q(o), err, "the C++ compiler on the thunk of " + m.name)) return false; objs.push_back(o); }
    std::string list;
    for (const std::string& o : objs) list += " " + q(o);
    std::string linkLibs;
    for (const std::string& l : libs) linkLibs += " " + l;
    std::string undefined = pluginTarget() == "macos" ? " -undefined dynamic_lookup -Wl,-install_name,@rpath/plugin.dylib -Wl,-S" : "";   // zrt and the registry come from the zinc that loads it; a fixed install name, not the cache path, and no debug stabs naming the objects (ZN-333)
    std::string vend = out.vendor.empty() ? "" : " " + q(out.vendor);
    if (!gCross.on && !run(cxx + " -shared -fPIC" + undefined + " -o " + q(out.shared) + list + vend + linkLibs, err, "linking " + m.name)) return false;
    fs::remove(out.archive, ec);
    if (!run(arTool() + " rcs " + q(out.archive) + list, err, "ar")) return false;
    if (gCross.on) { std::ofstream(out.shared) << "cross build: no shared library\n"; }   // a placeholder so the cache check below finds the entry
    { std::ofstream(digestFile) << sha256File(out.shared) << " " << sha256File(out.archive) << "\n"; }
    out.rebuilt = true;
  }
  out.seconds = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
  log::write("plugin", log::Info, m.name + ": " + (out.fetched ? "fetched from the index" : out.rebuilt ? "built" : "cache hit") + " (" + dir + ")", out.seconds * 1000);   // ZN-368
  return true;
}

// ---- The start's fast path (ZN-617): what the last build of a plugin found, kept in a stamp beside its cache entries and taken while no
// input changed, so a start runs no pkg-config, regenerates no thunk and hashes no file. Inputs (the spec, the sources and the files beside
// them, plugin.json, the .pc files pkg-config read, the engine's ABI headers, zinc itself) are compared by inode, size and mtime; the
// libraries by inode, size and ctime, which no program can set back, so a library changed since is not taken (the slow path checks its
// digest). The stamp's name holds what is not a file: the plugin's directory, the target, the defines (options from zinc.json), the
// compiler choice and the pkg-config environment.
namespace {
#ifdef __APPLE__
long long mtimeNs(const struct stat& st) { return static_cast<long long>(st.st_mtimespec.tv_sec) * 1000000000LL + st.st_mtimespec.tv_nsec; }
long long ctimeNs(const struct stat& st) { return static_cast<long long>(st.st_ctimespec.tv_sec) * 1000000000LL + st.st_ctimespec.tv_nsec; }
#else
long long mtimeNs(const struct stat& st) { return static_cast<long long>(st.st_mtim.tv_sec) * 1000000000LL + st.st_mtim.tv_nsec; }
long long ctimeNs(const struct stat& st) { return static_cast<long long>(st.st_ctim.tv_sec) * 1000000000LL + st.st_ctim.tv_nsec; }
#endif
/** "<ino> <size> <time>" of a file (mtime for an input, ctime for a library); empty when it is missing. */
std::string statLine(const std::string& path, bool library) {
  struct stat st;
  if (::stat(path.c_str(), &st) != 0) return "";
  return std::to_string(static_cast<unsigned long long>(st.st_ino)) + " " + std::to_string(static_cast<long long>(st.st_size)) + " " + std::to_string(library ? ctimeNs(st) : mtimeNs(st));
}
std::string stampPath(const frontend::FoundPlugin& p, const std::string& engineRoot, const std::string& projectDir, const std::string& target) {
  const frontend::PluginTarget& ts = p.manifest.targetSettings.at(target);
  Hash h;
  h.add("stamp 1"); h.add(fs::path(p.dir).lexically_normal().string()); h.add(target); h.add(gCross.on ? gCross.name : "");
  for (const std::string& d : buildDefines(p, ts, engineRoot, projectDir, target)) h.add(d);
  const bool system = systemCompiler(projectDir);
  h.add(system ? "system" : "zig");
  for (const char* v : {"CXX", "CC", "PKG_CONFIG_PATH", "PKG_CONFIG_LIBDIR", "PKG_CONFIG_SYSROOT_DIR"}) { const char* e = std::getenv(v); h.add(e ? e : "-"); }
  return home() + "/cache/" + (gCross.on ? gCross.name : target) + "/plugin-stamps/" + p.manifest.name + "-" + h.hex().substr(0, 16);
}
/** The files the build read: what a stamp compares. */
std::vector<std::string> stampInputs(const frontend::FoundPlugin& p, const std::string& engineRoot, const std::string& target) {
  const frontend::PluginManifest& m = p.manifest;
  const frontend::PluginTarget& ts = m.targetSettings.at(target);
  std::vector<std::string> in{(fs::path(p.dir) / "plugin.json").string(), executablePath()};
  const std::string root = engineRoot, runtime = root + "/../runtime";
  for (const std::string& hp : {root + "/include/zn/native.h", root + "/src/native/zrt_compat.h", runtime + "/zrt.h", runtime + "/zrt_raster.h", runtime + "/gl_replay.cpp", runtime + "/include/hal.h"}) in.push_back(hp);
  std::vector<std::string> dirs;
  std::error_code ec;
  if (m.kind != "display") {
    const fs::path nativeDir = fs::path(p.dir) / "native";
    for (const auto& e : fs::directory_iterator(nativeDir, ec)) in.push_back(e.path().string());   // the spec, every implementation, the headers beside them
    dirs.push_back(nativeDir.string());
    in.push_back(nativeDir.string());   // a directory's mtime moves when a file is added or removed
  }
  for (const std::string& s : ts.sources) {
    const fs::path sp = fs::path(p.dir) / s;
    in.push_back(sp.string());
    const std::string d = sp.parent_path().string();
    if (std::find(dirs.begin(), dirs.end(), d) == dirs.end()) { dirs.push_back(d); in.push_back(d); for (const auto& e : fs::directory_iterator(d, ec)) in.push_back(e.path().string()); }
  }
  if (!ts.pkg.empty() && haveCommand("pkg-config")) {   // the .pc files of the packages and of everything they require
    std::string all, o;
    for (const std::string& pkg : ts.pkg) all += " " + q(pkg);
    capture("todo='" + all + "'; seen=' '; while [ -n \"$(echo $todo)\" ]; do set -- $todo; x=$1; shift; todo=\"$*\"; case \"$seen\" in *\" $x \"*) continue;; esac; seen=\"$seen$x \"; pkg-config --path \"$x\" 2>/dev/null; todo=\"$todo $(pkg-config --print-requires --print-requires-private \"$x\" 2>/dev/null | awk '{print $1}' | tr '\\n' ' ')\"; done", o);
    std::istringstream ls(o);
    for (std::string line; std::getline(ls, line);) if (!line.empty()) in.push_back(line);
  }
  std::sort(in.begin(), in.end());
  in.erase(std::unique(in.begin(), in.end()), in.end());
  return in;
}
void writeStamp(const std::string& path, const PluginLib& out, const std::vector<std::string>& inputs) {
  std::string t = "zinc-plugin-stamp 1\nmodule " + out.module + "\nflags " + (out.display ? "1" : "0") + (out.prebuilt ? "1" : "0") + (out.fetched ? "1" : "0") + "\nkey " + out.key + "\n";
  for (const auto& [kind, f] : {std::pair<const char*, const std::string*>{"shared", &out.shared}, {"archive", &out.archive}, {"vendor", &out.vendor}}) {
    if (f->empty()) continue;
    const std::string st = statLine(*f, true);
    if (st.empty()) return;
    t += std::string("lib ") + kind + " " + st + " " + *f + "\n";
  }
  for (const std::string& a : out.linkArgs) t += "link " + a + "\n";
  for (const std::string& f : inputs) { const std::string st = statLine(f, false); t += "in " + (st.empty() ? "- - -" : st) + " " + f + "\n"; }
  std::error_code ec;
  fs::create_directories(fs::path(path).parent_path(), ec);
  { std::ofstream(path + ".tmp") << t; }
  fs::rename(path + ".tmp", path, ec);
}
/** The stamp's results, when every input and library is as it was. */
bool readStamp(const std::string& path, PluginLib& out) {
  std::string t;
  if (!readAll(path, t)) return false;
  std::istringstream ls(t);
  std::string line;
  if (!std::getline(ls, line) || line != "zinc-plugin-stamp 1") return false;
  PluginLib r;
  r.plugin = out.plugin;
  while (std::getline(ls, line)) {
    const std::size_t sp = line.find(' ');
    const std::string tag = line.substr(0, sp), rest = sp == std::string::npos ? "" : line.substr(sp + 1);
    if (tag == "module") r.module = rest;
    else if (tag == "flags" && rest.size() == 3) { r.display = rest[0] == '1'; r.prebuilt = rest[1] == '1'; r.fetched = rest[2] == '1'; }
    else if (tag == "key") r.key = rest;
    else if (tag == "link") r.linkArgs.push_back(rest);
    else if (tag == "lib" || tag == "in") {   // lib <kind> <ino> <size> <time> <path> / in <ino> <size> <time> <path>
      std::istringstream f(rest);
      std::string kind, ino, size, time, p;
      if (tag == "lib") f >> kind;
      f >> ino >> size >> time;
      std::getline(f, p);
      if (!p.empty() && p[0] == ' ') p.erase(0, 1);
      const std::string now = statLine(p, tag == "lib");
      if (now != (ino == "-" ? std::string() : ino + " " + size + " " + time)) return false;
      if (kind == "shared") r.shared = p; else if (kind == "archive") r.archive = p; else if (kind == "vendor") r.vendor = p;
    }
  }
  if (r.archive.empty() || (r.shared.empty() && !gCross.on)) return false;
  out = r;
  return true;
}
}  // namespace

bool buildPlugin(const frontend::FoundPlugin& p, const std::string& engineRoot, const std::string& projectDir, const std::string& target, PluginLib& out, std::string& err) {
  const auto t0 = std::chrono::steady_clock::now();
  const frontend::PluginManifest& m = p.manifest;
  bool known = false;
  for (const std::string& t : m.targets) known = known || t == target;
  std::string stamp;
  if (known && !std::getenv("ZINC_PLUGIN_NO_STAMP")) {
    stamp = stampPath(p, engineRoot, projectDir, target);
    out = PluginLib{};
    out.plugin = m.name;
    if (readStamp(stamp, out)) {
      out.seconds = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
      log::write("plugin", log::Info, m.name + ": unchanged since its last build (" + stamp + ")", out.seconds * 1000);
      return true;
    }
  }
  if (!buildPluginSlow(p, engineRoot, projectDir, target, out, err)) return false;
  if (!stamp.empty()) writeStamp(stamp, out, stampInputs(p, engineRoot, target));
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
  const ZnModule* mod = open();
  if (zn_register_module(mod, e, sizeof e) != 0) { err = "plugin '" + lib.plugin + "': " + e; return false; }
  std::string list = (std::filesystem::path(lib.shared).parent_path() / "exports").string();
  if (!std::filesystem::exists(list)) {   // what pluginExports reads on the next compile or start (ZN-615); written whole, then renamed
    std::ofstream out(list + ".tmp");
    out << "module " << lib.module << "\n";
    for (uint32_t i = 0; i < mod->nexports; ++i) out << mod->exports[i].name << " " << mod->exports[i].sig << "\n";
    out.close();
    std::error_code ec;
    if (out) std::filesystem::rename(list + ".tmp", list, ec);
  }
  return true;
}

bool pluginExports(const PluginLib& lib, std::vector<std::pair<std::string, std::string>>& out) {
  std::ifstream in((std::filesystem::path(lib.shared).parent_path() / "exports").string());
  std::string line;
  if (lib.display || !std::getline(in, line) || line != "module " + lib.module) return false;
  out.clear();
  while (std::getline(in, line)) {
    std::size_t sp = line.find(' ');
    if (sp == std::string::npos) return false;
    out.emplace_back(line.substr(0, sp), line.substr(sp + 1));
  }
  return !out.empty();
}

}  // namespace zn::tc
