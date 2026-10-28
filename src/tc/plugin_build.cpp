#include "tc/plugin_build.h"
#include "tc/policy.h"
#include "i18n/i18n.h"
#include "zn/log.h"
#include "tc/tlog.h"
#include "tc/tuf.h"
#include "zapp.h"
#include "yyjson.h"

#include <sys/stat.h>
#ifndef _WIN32
#include <fcntl.h>
#include <sys/file.h>
#include <unistd.h>
#endif

#include "platform/platform.h"

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

// stdout of a POSIX-shaped shell line (its own redirects merge the rest in), and its exit status (-1 when the shell
// itself cannot run): on Windows the whole line is one argv element of Git for Windows' sh, run by zn::plat::capture
// (cmd.exe would mangle both the '...' quoting of the tools and a "C:\Program Files" path, and its /C strips the
// line's outer quotes); elsewhere the host shell runs it directly
static int captureSh(const std::string& cmd, std::string& out) {
  out.clear();
#ifdef _WIN32
  const std::string sh = zn::plat::shellPath();
  if (sh.empty()) return -1;   // no Git for Windows: install it (zinc needs bash for the tests anyway)
  return zn::plat::capture({sh, "-c", cmd}, out);
#else
  FILE* f = ::popen(cmd.c_str(), "r");
  if (!f) return -1;
  char buf[512];
  std::size_t n;
  while ((n = std::fread(buf, 1, sizeof buf, f)) > 0) out.append(buf, n);
  return ::pclose(f);
#endif
}

// stdout of a command, and whether it succeeded
bool capture(const std::string& cmd, std::string& out) {
  const int st = captureSh(cmd + " 2>/dev/null", out);
  while (!out.empty() && (out.back() == '\n' || out.back() == '\r' || out.back() == ' ')) out.pop_back();
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
// native/<x>.spec.ts, never a hidden file: `unzip` of an archive made on a Mac leaves ._<x>.spec.ts (AppleDouble) beside each file that had attributes (ZN-718)
bool isSpec(const fs::path& p) { const std::string f = p.filename().string(); return endsWith(f, ".spec.ts") && f[0] != '.'; }
bool isAbi(const std::string& impl) { return endsWith(impl, ".abi.c") || endsWith(impl, ".abi.cpp"); }   // on include/zn/native.h, with its own zn_module_<X>: no thunk

struct Cross { std::string name, zigTarget, zig; bool on = false, shared = false; } gCross;   // shared: link the .so too (a prebuilt library for the device, ZN-823)
std::string buildOs();   // the system the code is for: this machine's, "linux" in a cross build
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

// The import library of zinc.exe next to it (or under a build directory under engineRoot): the plugins' native code
// calls the engine's hal_*/zrt_*/registry directly (docs/reports/zinc-windows-port.md), which a PE cannot resolve at
// load without one. "" when none: the plugin then refuses with a plain message.
static std::string zincImplib(const std::string& engineRoot) {
  if (const char* e = std::getenv("ZINC_IMPLIB"); e && *e) { if (fs::exists(e)) return e; }
  const std::string exe = executablePath();
  if (!exe.empty()) {
    const fs::path dir = fs::path(exe).parent_path();
    if (fs::exists(dir / "libzinc.dll.a")) return (dir / "libzinc.dll.a").string();
  }
  for (const char* b : {"build-win", "build", "build-dbgsym"}) {
    const fs::path p = fs::path(engineRoot) / b / "libzinc.dll.a";
    if (fs::exists(p)) return p.string();
  }
  return "";
}

std::string arTool() { return gAr; }

bool run(const std::string& cmd, std::string& err, const std::string& what) {
  log::Phase phase("plugin", what, "plugin", what);
  std::string out;
  const int st = captureSh(cmd + " 2>&1", out);
  if (st < 0) { err = "cannot run " + what; return false; }
  if (st != 0) {
    err = what + " failed:\n" + out.substr(0, 3000);
    if ((out.find("framework") != std::string::npos || out.find("SDK") != std::string::npos) && !xcodeToolsInstalled())
      err += "\nthis plugin links macOS frameworks, which come from the SDK of the Xcode command line tools, not installed on this Mac: run `xcode-select --install`, then this command again";
    return false;
  }
  return true;
}

// ---- A Rust crate of the plugin (plugin.json targets.<id>.cargo: its directory, ZN loro plugin): cargo builds it as a static library for this machine's Rust
// triple, which the plugin's shared library and the programs linking the plugin take like a system library. Its target directory is in the cache, one per
// plugin directory and target, so cargo's own incremental build applies and two checkouts of a plugin never write over each other.
const char* rustTriple() {
#if defined(__APPLE__) && defined(__aarch64__)
  return "aarch64-apple-darwin";
#elif defined(__APPLE__)
  return "x86_64-apple-darwin";
#elif defined(_WIN32)
  return "x86_64-pc-windows-gnu";   // zig links against MinGW, never MSVC
#elif defined(__aarch64__)
  return "aarch64-unknown-linux-gnu";
#elif defined(__arm__)
  return "armv7-unknown-linux-gnueabihf";
#else
  return "x86_64-unknown-linux-gnu";
#endif
}
// $CARGO, else cargo on the PATH, else rustup's ~/.cargo/bin/cargo (not on the PATH of an app started from the Finder); "" when none
std::string cargoCommand() {
  if (const char* c = std::getenv("CARGO"); c && *c) return c;
  if (haveCommand("cargo")) return "cargo";
  const char* h = std::getenv("HOME");
  if (h && fs::exists(std::string(h) + "/.cargo/bin/cargo")) return std::string(h) + "/.cargo/bin/cargo";
  return "";
}
// the files of a crate that its build reads: everything but its target/ directory (and hidden files), directories included (their mtime moves when a file comes or goes)
std::vector<std::string> crateFiles(const fs::path& dir) {
  std::vector<std::string> out{dir.string()};
  std::error_code ec;
  for (auto it = fs::recursive_directory_iterator(dir, ec); it != fs::recursive_directory_iterator(); it.increment(ec)) {
    const std::string name = it->path().filename().string();
    if (name == "target" || name[0] == '.') { if (it->is_directory(ec)) it.disable_recursion_pending(); continue; }
    out.push_back(it->path().string());
  }
  std::sort(out.begin(), out.end());
  return out;
}
bool buildCargo(const frontend::FoundPlugin& p, const std::string& crate, const std::string& target, std::string& archive, std::string& err) {
  const std::string& name = p.manifest.name;
  if (gCross.on) { err = "plugin '" + name + "' has Rust code (cargo), which a cross build does not compile yet: build the program on a " + gCross.name + " machine"; return false; }
  const fs::path dir = fs::path(p.dir) / crate;
  if (!fs::exists(dir / "Cargo.toml")) { err = "plugin '" + name + "': its cargo crate " + dir.string() + " has no Cargo.toml"; return false; }
  const std::string cargo = cargoCommand();
  if (cargo.empty()) {
    err = "plugin '" + name + "' has Rust code and needs cargo, which this machine does not have: install Rust with rustup (https://rustup.rs), then run the command again";
    return false;
  }
  Hash where;
  std::error_code wec;
  where.add(fs::weakly_canonical(fs::absolute(p.dir, wec), wec).string());   // however the plugin directory was spelled (relative from the tests, absolute from a project)
  const std::string tdir = home() + "/cache/" + target + "/cargo/" + name + "-" + where.hex(), triple = rustTriple();
  // --locked when the crate has its Cargo.lock: the versions it pins, never newer ones; cd: rustup reads the crate's rust-toolchain.toml from there
  const std::string cmd = "cd " + q(dir.string()) + " && " + q(cargo) + " build --release --quiet" + (fs::exists(dir / "Cargo.lock") ? " --locked" : "") +
                          " --target " + triple + " --target-dir " + q(tdir);
  if (!run(cmd, err, "cargo (the Rust code of " + name + ")")) return false;
  std::error_code ec;
  for (const auto& e : fs::directory_iterator(fs::path(tdir) / triple / "release", ec))
    if (e.path().extension() == ".a" && e.path().filename().string().rfind("lib", 0) == 0) { archive = e.path().string(); return true; }
  err = "plugin '" + name + "': cargo built no static library (its Cargo.toml needs [lib] crate-type = [\"staticlib\"])";
  return false;
}

}  // namespace

std::string cargoPath() { return cargoCommand(); }

void setCrossTarget(const std::string& name, const std::string& zigTarget, const std::string& zig, bool shared) { gCross = Cross{name, zigTarget, zig, true, shared}; }
void clearCrossTarget() { gCross = Cross{}; }

std::string pluginTarget() {
#if defined(__APPLE__)
  return "macos";
#elif defined(_WIN32)
  return "windows";
#else
  return "linux";
#endif
}

std::string deviceTarget() {
  if (const char* e = std::getenv("ZINC_DEVICE_TARGET")) return e;
  std::string machine;
  return pluginTarget() == "linux" && readAll("/sys/devices/soc0/machine", machine) && machine.rfind("reMarkable", 0) == 0 ? "rmpp" : "";
}

namespace { std::string buildOs() { return gCross.on ? "linux" : pluginTarget(); } }

const frontend::FoundPlugin* pluginForModule(const std::vector<frontend::FoundPlugin>& plugins, const std::string& module) {
  for (const frontend::FoundPlugin& p : plugins) {
    std::error_code ec;
    for (const auto& e : fs::directory_iterator(fs::path(p.dir) / "native", ec)) {
      std::string path = e.path().string(), text;
      if (!isSpec(e.path()) || !readAll(path, text)) continue;
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

// The files a source #includes from outside its own directory ("../display-rmpp/stream.h" in display-fbdev), and theirs: a change there
// rebuilds the plugin. ponytail: quoted "../" includes only; vendored trees (third_party/) are pinned and not followed further.
static void outsideIncludes(const std::string& file, std::vector<std::string>& out) {
  std::ifstream in(file);
  std::string line;
  while (std::getline(in, line)) {
    const size_t i = line.find("#include \"../");
    if (i == std::string::npos || line.find_first_not_of(" \t") != i) continue;
    const size_t e = line.find('"', i + 10);
    if (e == std::string::npos) continue;
    std::error_code ec;
    const std::string f = fs::weakly_canonical(fs::path(file).parent_path() / line.substr(i + 10, e - i - 10), ec).string();
    if (ec || std::find(out.begin(), out.end(), f) != out.end() || !fs::is_regular_file(f, ec)) continue;
    out.push_back(f);
    if (f.find("/third_party/") == std::string::npos) outsideIncludes(f, out);
  }
}

// The defines a plugin is compiled with: the runtime's own, the manifest's, the options as ZP_ defines.
std::vector<std::string> buildDefines(const frontend::FoundPlugin& p, const frontend::PluginTarget& ts, const std::string& engineRoot, const std::string& projectDir, const std::string& target) {
  std::vector<std::string> defines{"ZRT_HEAP_BYTES=536870912u", buildOs() == "macos" ? "ZRT_PLATFORM=\"macos\"" : buildOs() == "windows" ? "ZRT_PLATFORM=\"windows\"" : "ZRT_PLATFORM=\"linux\"", "ZRT_POINT_POOL=262144", "ZRT_GROW_DRAW_CMDS"};
  for (const std::string& d : ts.defines) defines.push_back(d);
  for (const std::string& d : frontend::pluginDefines(p, projectDir, engineRoot, target)) defines.push_back(d);
  return defines;
}
bool systemCompiler(const std::string& projectDir) {   // ZINC_PLUGIN_CC=system or zinc.json "pluginCompiler": "system"
  if (const char* pc = std::getenv("ZINC_PLUGIN_CC"); pc && *pc) return std::string(pc) == "system";
  std::string zj;
  return readAll(projectDir + "/zinc.json", zj) && (zj.find("\"pluginCompiler\": \"system\"") != std::string::npos || zj.find("\"pluginCompiler\":\"system\"") != std::string::npos);
}

std::string prebuiltKey(const frontend::FoundPlugin& p, const std::string& engineRoot, const std::string& projectDir, const std::string& target) {
  const std::string runtime = engineRoot + "/runtime";
  Hash k;
  for (const std::string& d : buildDefines(p, p.manifest.targetSettings.at(target), engineRoot, projectDir, target)) k.add(d);
  for (const std::string& hp : {engineRoot + "/include/zn/native.h", engineRoot + "/src/native/zrt_compat.h", runtime + "/zrt.h", runtime + "/include/hal.h"}) k.add(sha256File(hp));
  k.add(p.manifest.kind == "display" ? "display" : "module");
  return k.hex();
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
  for (const auto& e : fs::directory_iterator(nativeDir, ec)) if (isSpec(e.path())) { specPath = e.path().string(); base = e.path().filename().string(); base.resize(base.size() - 8); }
  if (specPath.empty() || !readAll(specPath, specText)) { err = "plugin '" + m.name + "' has no native/*.spec.ts"; return false; }
  if (!frontend::generateNative(specPath, specText, gen, err)) return false;
  out.module = gen.name;
  // the implementation: the manifest's, else <x>.<target>.cpp, else <x>.host.cpp, else <x>.abi.c or .abi.cpp (on include/zn/native.h, it defines zn_module_<X> itself: no thunk)
  auto it = m.nativeImpl.find(target);
  if (it != m.nativeImpl.end()) impl = (fs::path(p.dir) / it->second).string();
  else for (std::string cand : {base + "." + target + ".cpp", base + ".host.cpp", base + ".abi.c", base + ".abi.cpp"}) if (impl.empty() && fs::exists(nativeDir / cand)) impl = (nativeDir / cand).string();
  if (!isAbi(impl) && gen.thunk.empty()) { err = "plugin '" + m.name + "': no thunk can be written for its spec: " + gen.thunkNote; return false; }
  if (isAbi(impl) && gen.cHeader.empty()) { err = "plugin '" + m.name + "': its spec has no C export table (" + gen.cNote + "), which native/" + base + ".abi.c(pp) needs"; return false; }
  }
  const bool abi = isAbi(impl);
  // no source is not an error yet: an install holds the plugin's prebuilt libraries and not its C++ (ZN-718)
  const std::string noSource = display || !impl.empty() ? "" : "plugin '" + m.name + "' has no native source for target '" + target + "' (expected native/" + base + ".host.cpp) and no prebuilt library for this engine";
  const frontend::PluginTarget& ts = m.targetSettings.at(target);
  // system libraries: pkg-config must know them; if not, say what to install
  std::vector<std::string> cflags, libs;
  // a cross build asks pkg-config about the target's sysroot, $ZINC_HOME/sysroots/<target> (the usr/ tree of the device's -dev packages), never about this machine.
  // ponytail: the directory is filled by hand (docs/reports/raspberry-pi.md); ZN-334 makes the toolchain manager fetch a pinned one.
  const std::string sysroot = gCross.on ? home() + "/sysroots/" + gCross.name : "";
  if (gCross.on && !ts.pkg.empty() && !fs::exists(sysroot)) { err = "plugin '" + m.name + "' needs the system library '" + ts.pkg[0] + "', which a cross build for " + gCross.name + " looks for in the sysroot " + sysroot + " (not there)"; return false; }
  std::string pc = "pkg-config";
  if (gCross.on) {
    std::string dirs;
    for (const auto& e : fs::directory_iterator(fs::path(sysroot) / "usr/lib", ec)) if (fs::exists(e.path() / "pkgconfig")) dirs += (e.path() / "pkgconfig").string() + ":";   // usr/lib/<multiarch triple>/pkgconfig
    pc = "PKG_CONFIG_ALLOW_SYSTEM_CFLAGS=1 PKG_CONFIG_SYSROOT_DIR=" + q(sysroot) + " PKG_CONFIG_LIBDIR=" + q(dirs + sysroot + "/usr/lib/pkgconfig:" + sysroot + "/usr/share/pkgconfig") + " pkg-config";
  }
  std::vector<std::string> packages;
  for (const std::string& pkg : ts.pkg) {
#ifdef ZN_SDL_INCLUDE
    if (!gCross.on && pluginTarget() == "macos" && pkg == "sdl3") continue;   // use the host's SDL, never load a second copy
#endif
    packages.push_back(pkg);
  }
  if (!packages.empty()) {   // one query for all of them: this runs at every compile and start, and each pkg-config costs a process (16 of them for zinc:video, 140 ms; ZN-614)
    std::string all, o;
    for (const std::string& pkg : packages) all += " " + q(pkg);
    const bool have = haveCommand("pkg-config");
    if (!have || !capture("(" + pc + " --exists" + all + " && " + pc + " --cflags" + all + " && echo @@ && " + pc + " --libs" + all + ")", o) || o.find("@@") == std::string::npos) {
      std::string missing = packages[0], x;
      if (have) for (const std::string& pkg : packages) if (!capture(pc + " --exists " + q(pkg) + " && echo ok", x) || x.empty()) { missing = pkg; break; }
      std::string hint;
      for (const std::string& pk : ts.packages) hint += (hint.empty() ? "" : ", ") + pk;
      err = "plugin '" + m.name + "' needs the system library '" + missing + "'" + (have ? "" : " (and pkg-config)") + ": install " + (hint.empty() ? "its development package" : "the package " + hint) +
            (gCross.on ? " of the device into " + sysroot : pluginTarget() == "macos" ? " (for example with brew)" : " (for example with apt or apk)") + ", then run the command again";
      return false;
    }
    auto trim = [](std::string t) { while (!t.empty() && std::isspace(static_cast<unsigned char>(t.back()))) t.pop_back(); while (!t.empty() && std::isspace(static_cast<unsigned char>(t.front()))) t.erase(0, 1); return t; };
    const std::size_t at = o.find("@@");
    std::string c = trim(o.substr(0, at)), l = trim(o.substr(at + 2));
    if (!c.empty()) cflags.push_back(c);
    if (!l.empty()) libs.push_back(l);
    // the device's libraries name symbols of its own glibc, newer than the one zig targets (pthread_once@GLIBC_2.34): they resolve on the device, not at this link
    if (gCross.on) libs.push_back("-Wl,--allow-shlib-undefined");
  }
  // a cross build: what the device's compiler searches by itself in the sysroot, after zig's own headers: Debian's multiarch include directory
  // (ffi.h), usr/include for a plugin that names its library in `libs` without a pkg-config module (zinc:midi's ALSA), and the multiarch
  // library directory (libffi.pc says /usr/lib)
  if (gCross.on && fs::exists(sysroot + "/usr/include")) {
    cflags.push_back("-idirafter " + q(sysroot + "/usr/include"));
    auto multiarch = [&](const std::string& dir, const std::string& flag, std::vector<std::string>& to) {
      for (const auto& e : fs::directory_iterator(sysroot + dir, ec))
        if (e.path().filename().string().find("-linux-gnu") != std::string::npos) to.push_back(flag + q(e.path().string()));
    };
    multiarch("/usr/include", "-idirafter ", cflags);
    multiarch("/usr/lib", "-L", libs);
  }
  // a path in `flags`, `libs` or `linkFlags` that starts with ./ or ../ (or follows -I / -L) is relative to the plugin, not to wherever zinc runs
  auto rel = [&](const std::string& t) {
    size_t at = t.rfind("-I", 0) == 0 || t.rfind("-L", 0) == 0 ? 2 : 0;
    if (t.compare(at, 2, "./") != 0 && t.compare(at, 3, "../") != 0) return t;
    const std::string pth = (fs::path(p.dir) / t.substr(at)).lexically_normal().generic_string();
    return t.substr(0, at) + (at ? q(pth) : pth);
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
  std::string runtime = root + "/runtime";
  // sources of the manifest: .c files, and C++ files under vendor/ (ZN-583.02: Jolt), are vendored libraries; the rest are compiled with the plugin
  std::vector<std::string> own, vendored;
  if (!display) own.push_back(impl);
  for (const std::string& s : ts.sources) (endsWith(s, ".c") || s.rfind("vendor/", 0) == 0 ? vendored : own).push_back((fs::path(p.dir) / s).string());
  // prebuilt libraries shipped with the plugin (ZN-328.03): prebuilt/<target>/ holds plugin.dylib or .so, plugin.a, vendor.a when it has vendored C, and `key`: the
  // digest of the ABI headers and the defines they were built with (zinc plugin-build --prebuild writes them). A matching key uses them, no compiler needed; otherwise
  // (other options in zinc.json, another engine) the plugin is built locally as before.
  {
    out.key = prebuiltKey(p, engineRoot, projectDir, target);
    const fs::path pre = fs::path(p.dir) / "prebuilt" / (gCross.on && target == "linux" ? gCross.name : target);   // a device's own entry: prebuilt/rmpp (ZN-841)
    std::string key;
    if (readAll((pre / "key").string(), key)) {
      while (!key.empty() && (key.back() == '\n' || key.back() == '\r' || key.back() == ' ')) key.pop_back();
      const std::string ext = buildOs() == "macos" ? ".dylib" : buildOs() == "windows" ? ".dll" : ".so";
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
  if (!noSource.empty()) { err = noSource; return false; }
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
  if (buildOs() == "macos") h.add("-Wl,-headerpad_max_install_names");
  if (buildOs() == "linux") h.add("-Wl,-S");   // the libraries linked before were not stripped   // a link flag: the libraries linked before it was added are not reused
  for (const std::string& f : ts.vendorFlags) vh.add(f);
  vh.add("-g0");   // the vendored libraries carry no debug information: zig's clang writes it by default, and it was 70 to 85% of their archives
  h.add(ccId); vh.add(ccId);
  h.add(gen.cppHeader); h.add(abi ? gen.cHeader : gen.thunk);
  h.add(display ? "display" : "module");
  for (const std::string& s : own) { std::string t; readAll(s, t); h.add(relToPlugin(s)); h.add(t); }
  for (const std::string& hp : {root + "/include/zn/native.h", root + "/src/native/zrt_compat.h", runtime + "/zrt.h", runtime + "/zrt_raster.h", runtime + "/gl_replay.cpp", runtime + "/gl_replay_shaders.h", runtime + "/gl_caps.h", runtime + "/include/hal.h"}) h.add(sha256File(hp));
  if (buildOs() == "windows") h.add(sha256File(zincImplib(engineRoot)));   // DATA vs code exports in libzinc.dll.a change the DLL's import table
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
  { std::vector<std::string> inc; for (const std::string& s : own) outsideIncludes(s, inc); for (const std::string& f : inc) h.add(sha256File(f)); }
  if (!ts.cargo.empty()) {   // the crate's static library, linked like a system library; its bytes in the key, so a changed crate relinks the plugin
    std::string rust;
    if (!buildCargo(p, ts.cargo, target, rust, err)) return false;
    libs.push_back(q(rust));
    out.linkArgs.push_back(q(rust));
    h.add(sha256File(rust));
  }
  for (const std::string& s : vendored) { vh.add(fs::path(s).filename().string()); vh.add(sha256File(s)); }   // by content, so a copy of the plugin shares the archive
  {   // a vendored library's configuration beside plugin.json (zinc:lvgl's lv_conf.h), which its sources include
    std::vector<std::string> conf;
    std::error_code e2;
    for (const auto& f : fs::directory_iterator(p.dir, e2)) if (f.is_regular_file() && f.path().extension() == ".h") conf.push_back(f.path().string());
    std::sort(conf.begin(), conf.end());
    for (const std::string& f : conf) vh.add(sha256File(f));
  }
  h.add(gKeyTarget); vh.add(gKeyTarget);   // the machine the code is for: aarch64-linux-gnu from a Mac and in a Linux container alike
  if (gCross.shared) h.add("shared");   // never the placeholder of a cross build without the .so
  std::string cache = home() + "/cache/" + (gCross.on ? gCross.name : target) + "/plugins";
  const std::string vendorHex = vh.hex();
  h.add(vendorHex);   // the library links the vendored archive: a new archive (its sources, defines, configuration header) relinks it
  const std::string keyHex = h.hex();
  std::string dir = cache + "/" + m.name + "-" + keyHex;
  std::string vdir = cache + "/" + m.name + "-vendor-" + vendorHex;
  bool dyn = true;
  const bool windowsHost = buildOs() == "windows";
  std::string ext = buildOs() == "macos" ? ".dylib" : windowsHost ? ".dll" : ".so";
  out.shared = dir + "/plugin" + ext;
  out.archive = dir + "/plugin.a";
  if (!vendored.empty()) out.vendor = vdir + "/vendor.a";
  (void)dyn;
  // reproducible objects (ZN-333): the paths of this machine (the plugin, the cache entry, the engine, the toolchains) become fixed names in __FILE__ and the object files
  const std::string remap = " -ffile-prefix-map=" + q(p.dir) + "=plugins/" + m.name + " -ffile-prefix-map=" + q(dir) + "=cache -ffile-prefix-map=" + q(vdir) + "=cache" +
                            " -ffile-prefix-map=" + q(root) + "=zinc -ffile-prefix-map=" + q(home() + "/toolchains") + "=toolchains";
  fs::create_directories(dir, ec);
  if (!fs::exists(out.shared) || !fs::exists(out.archive)) fetchPrebuilt(m.name, keyHex, gCross.on ? gCross.name : target, engineRoot, dir, vdir, out);   // ZN-337: a published binary first
  bool told = false;   // ZN-774.03: a first build takes 5 to 20 s; the person is told before it starts, once, which plugin and that it is once
  auto tell = [&] { if (!told) log::step("plugin", i18n::tr("cli.run.plugin_build", {{"plugin", m.name}})); told = true; };
  if (!vendored.empty() && !fs::exists(out.vendor)) {   // the vendored C libraries: compiled once for these defines
    tell();
    fs::create_directories(vdir, ec);
    std::string objs;
    int k = 0;
    for (const std::string& s : vendored) {
      std::string o = vdir + "/v" + std::to_string(k++) + ".o";
      const bool isC = endsWith(s, ".c");   // a vendored C++ library takes the plugin's C++ flags (its -I among them), not the engine's include paths
      std::string cflagsC = (isC ? cc + " -O2 -fPIC -w" : cxx + " " + flags) + " -g0";
      if (isC) for (const std::string& f : ts.flags) if (f.rfind("-std=", 0) != 0) cflagsC += " " + rel(f);   // ZN-583.01: Box2D's include/ and -ffp-contract=off
      for (const std::string& f : ts.vendorFlags) if (!isC || f.rfind("-std=", 0) != 0) cflagsC += " " + rel(f);
      for (const std::string& d : defines) if (d.rfind("ZP_", 0) != 0 && d.rfind("ZRT_", 0) != 0) cflagsC += " -D" + q(d);
      if (!run(cflagsC + remap + " -c " + q(s) + " -o " + q(o), err, std::string(isC ? "the C compiler on " : "the C++ compiler on ") + s)) return false;
      objs += " " + q(o);
    }
    if (!run(arTool() + " rcs " + q(out.vendor) + objs, err, "ar")) return false;
    out.rebuilt = true;
  }
  // trust: the digest written after the build must still match the library (a tampered cache entry is refused, never loaded); an entry without one is rebuilt
  std::string digestFile = dir + "/plugin.sha256", recorded;
  if (fs::exists(out.shared) && readAll(digestFile, recorded)) {
    while (!recorded.empty() && (recorded.back() == '\n' || recorded.back() == '\r' || recorded.back() == ' ')) recorded.pop_back();
    if (recorded != sha256File(out.shared) + " " + sha256File(out.archive)) {
      err = "the native library of plugin '" + m.name + "' in " + dir + " does not match its recorded digest: refused (delete the directory to rebuild it)";
      return false;
    }
  } else { fs::remove(out.shared, ec); }
  if (!fs::exists(out.shared) || !fs::exists(out.archive)) {
    tell();
    std::string gdir = dir + "/gen";
    fs::create_directories(gdir, ec);
    std::string lower = gen.name;
    for (char& c : lower) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    std::string thunk = gdir + "/zinc_native_" + lower + "_thunk.cpp";
    if (abi) { std::ofstream(gdir + "/zinc_native_" + lower + "_abi.h") << gen.cHeader; }
    else if (!display) {
      { std::ofstream(gdir + "/zinc_native_" + lower + ".h") << gen.cppHeader; }
      { std::ofstream(thunk) << gen.thunk; }
    }
    // third_party last: a plugin may compile a library the engine vendors by its directory (three: "meshoptimizer/vertexcodec.cpp", ZN-441)
    std::string inc = " -I" + q(gdir) + " -I" + q(root + "/src") + " -I" + q(root + "/include") + " -I" + q(runtime) + " -I" + q(runtime + "/include") + " -I" + q(p.dir)
#ifdef ZN_SDL_INCLUDE
      + (!display && fs::exists(root + "/plugins/display-gl/zgl.h") ? " -I" + q(root + "/plugins/display-gl") : std::string())   // zinc:mapping draws through the GL context of display-gl (zgl.h)
      + (buildOs() == "macos" ? " -I" + q(std::string(ZN_SDL_INCLUDE).rfind("@root@", 0) == 0 ? root + std::string(ZN_SDL_INCLUDE).substr(6) : std::string(ZN_SDL_INCLUDE)) : std::string())   // SDL3 (the host's): the emulator windows of the display drivers, zinc:3d's GL context
#endif
      + " -I" + q(root + "/third_party");
    std::vector<std::string> objs;
    int k = 0;
    for (const std::string& s : own) {
      std::string o = dir + "/o" + std::to_string(k++) + ".o";
      const bool isC = endsWith(s, ".c");   // the .abi.c implementation: C99 on include/zn/native.h
      if (!run((isC ? cc + " -std=c11 -O2 -fPIC -w" : cxx + " " + flags) + remap + defs + inc + " -c " + q(s) + " -o " + q(o), err, std::string(isC ? "the C compiler on " : "the C++ compiler on ") + fs::path(s).filename().string())) return false;
      objs.push_back(o);
    }
    if (!display && !abi) { std::string o = dir + "/thunk.o"; if (!run(cxx + " " + flags + remap + defs + inc + " -c " + q(thunk) + " -o " + q(o), err, "the C++ compiler on the thunk of " + m.name)) return false; objs.push_back(o); }
    std::string list;
    for (const std::string& o : objs) list += " " + q(o);
    std::string linkLibs;
    for (const std::string& l : libs) linkLibs += " " + l;
    std::string undefined;
    if (buildOs() == "macos")
      // zrt and the registry come from the zinc that loads it; a fixed install name, not the cache path, and no debug stabs naming the objects (ZN-333);
      // room in the header for a longer install name: Homebrew rewrites it to the keg's path and failed the install without it (v0.4.2)
      undefined = " -undefined dynamic_lookup -Wl,-install_name,@rpath/plugin.dylib -Wl,-S -Wl,-headerpad_max_install_names";
    else if (windowsHost) {   // a PE dll exports nothing on its own: all symbols, and the engine's import library to resolve zrt/hal against
      const std::string implib = zincImplib(engineRoot);
      if (implib.empty()) { err = "plugin '" + m.name + "' needs the import library of zinc (libzinc.dll.a beside the zinc that loads it, or ZINC_IMPLIB)"; return false; }
      undefined = " -Wl,--export-all-symbols " + q(implib);
    } else undefined = " -Wl,-S";   // Linux: no debug sections, which zig's libc++ brings into each library (1.3 of svg's 1.7 MB, ZN-823)
    std::string vend = out.vendor.empty() ? "" : " " + q(out.vendor);
    if ((!gCross.on || gCross.shared) && !run(cxx + " -shared -fPIC" + undefined + " -o " + q(out.shared) + list + vend + linkLibs, err, "linking " + m.name)) return false;
    fs::remove(out.archive, ec);
    if (!run(arTool() + " rcs " + q(out.archive) + list, err, "ar")) return false;
    if (gCross.on && !gCross.shared) { std::ofstream(out.shared) << "cross build: no shared library\n"; }   // a placeholder so the cache check below finds the entry
    { std::ofstream(digestFile) << sha256File(out.shared) << " " << sha256File(out.archive) << "\n"; }
    out.rebuilt = true;
  }
  out.seconds = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
  log::write("plugin", log::Info, m.name + ": " + (out.fetched ? "fetched from the index" : out.rebuilt ? "built" : "cache hit") + " (" + dir + ")", out.seconds * 1000);   // ZN-368
  if (out.fetched || out.rebuilt) log::step("plugin", m.name + (out.fetched ? ": downloaded" : ": built here"), out.seconds * 1000);   // what a first start spends (ZN-824)
  return true;
}

// ---- The start's fast path (ZN-617): what the last build of a plugin found, kept in a stamp beside its cache entries and taken while no
// input changed, so a start runs no pkg-config, regenerates no thunk and hashes no file. Inputs (the spec, the sources and the files beside
// them, plugin.json, the .pc files pkg-config read, the engine's ABI headers, zinc itself) are compared by inode, size and mtime; the
// libraries by inode, size and ctime, which no program can set back, so a library changed since is not taken (the slow path checks its
// digest). The stamp's name holds what is not a file: the plugin's directory, the target, the defines (options from zinc.json), the
// compiler choice and the pkg-config environment.
namespace {
#if defined(_WIN32)
// no inode and no change time that a program cannot set: size and modification time (ZN-333's guarantee is weaker there, see zinc-windows-port.md)
std::string statLine(const std::string& path, bool) {
  long long size = 0, mtime = 0;
  if (!zn::plat::fileStamp(path, size, mtime)) return "";
  return "0 " + std::to_string(size) + " " + std::to_string(mtime);
}
#else
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
#endif
std::string stampPath(const frontend::FoundPlugin& p, const std::string& engineRoot, const std::string& projectDir, const std::string& target) {
  const frontend::PluginTarget& ts = p.manifest.targetSettings.at(target);
  Hash h;
  h.add("stamp 1"); h.add(fs::path(p.dir).lexically_normal().string()); h.add(target); h.add(gCross.on ? gCross.name : ""); if (gCross.shared) h.add("shared");
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
  const std::string root = engineRoot, runtime = root + "/runtime";
  for (const std::string& hp : {root + "/include/zn/native.h", root + "/src/native/zrt_compat.h", runtime + "/zrt.h", runtime + "/zrt_raster.h", runtime + "/gl_replay.cpp", runtime + "/gl_replay_shaders.h", runtime + "/gl_caps.h", runtime + "/include/hal.h"}) in.push_back(hp);
  if (target == "windows") { const std::string im = zincImplib(engineRoot); if (!im.empty()) in.push_back(im); }
  std::vector<std::string> dirs;
  std::error_code ec;
  in.push_back(p.dir);   // the configuration headers beside plugin.json (zinc:lvgl's lv_conf.h), which the vendored sources include; one added
  for (const auto& e : fs::directory_iterator(p.dir, ec)) if (e.is_regular_file() && e.path().extension() == ".h") in.push_back(e.path().string());
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
  { std::vector<std::string> inc; for (const std::string& f : in) if (endsWith(f, ".cpp") || endsWith(f, ".cc") || endsWith(f, ".mm") || endsWith(f, ".h") || endsWith(f, ".inc")) outsideIncludes(f, inc);
    in.insert(in.end(), inc.begin(), inc.end()); }
  if (!ts.cargo.empty()) for (const std::string& f : crateFiles(fs::path(p.dir) / ts.cargo)) in.push_back(f);   // a Rust crate: its sources, Cargo.toml and Cargo.lock
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
  { std::ofstream(path + ".tmp", std::ios::binary) << t; }
  fs::rename(path + ".tmp", path, ec);
}
/** The stamp's results, when every input and library is as it was. */
bool readStamp(const std::string& path, PluginLib& out) {
  std::string t;
  if (!readAll(path, t)) return false;
  std::istringstream ls(t);
  std::string line;
  if (!std::getline(ls, line)) return false;
  if (!line.empty() && line.back() == '\r') line.pop_back();
  if (line != "zinc-plugin-stamp 1") return false;
  PluginLib r;
  r.plugin = out.plugin;
  while (std::getline(ls, line)) {
    if (!line.empty() && line.back() == '\r') line.pop_back();
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

// The choices of buildPluginSlow for a target, without compiling: the implementation (the manifest's, <x>.<target>.cpp, <x>.host.cpp), the
// manifest's sources split as there, its defines and flags. ponytail: system libraries (pkg) are not resolved; a plugin that needs one is refused.
bool pluginSource(const frontend::FoundPlugin& p, const std::string& engineRoot, const std::string& projectDir, const std::string& target, const std::string& genDir, PluginSource& out, std::string& err) {
  const frontend::PluginManifest& m = p.manifest;
  out = PluginSource{};
  out.plugin = m.name;
  auto ts = m.targetSettings.find(target);
  if (m.kind == "display" || ts == m.targetSettings.end()) { err = "plugin '" + m.name + "' has no native build for " + target; return false; }
  if (!ts->second.pkg.empty()) { err = "plugin '" + m.name + "' needs the system library '" + ts->second.pkg[0] + "', which an app cannot link yet"; return false; }
  const fs::path nativeDir = fs::path(p.dir) / "native";
  std::string specPath, specText, base, impl;
  std::error_code ec;
  for (const auto& e : fs::directory_iterator(nativeDir, ec)) if (isSpec(e.path())) { specPath = e.path().string(); base = e.path().filename().string(); base.resize(base.size() - 8); }
  frontend::NativeGen gen;
  if (specPath.empty() || !readAll(specPath, specText)) { err = "plugin '" + m.name + "' has no native/*.spec.ts"; return false; }
  if (!frontend::generateNative(specPath, specText, gen, err)) return false;
  out.module = gen.name;
  std::string lower = gen.name;
  for (char& c : lower) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  fs::create_directories(genDir, ec);
  const std::string& cls = ts->second.nativeClass;
  auto it = m.nativeImpl.find(target);
  if (!cls.empty()) {   // a Java or Objective-C/Swift class behind the spec (ZN-628): the generated bridge is the implementation, the interface goes with the sources
    if (gen.java.empty()) { err = "plugin '" + m.name + "': targets." + target + ".class needs a spec the phone glue carries: " + gen.mobileNote; return false; }
    const bool android = target == "android";
    impl = genDir + "/zinc_native_" + lower + (android ? "_android.cpp" : "_ios.mm");
    std::ofstream(impl) << (android ? gen.jniBridge : gen.objcBridge);
    if (android) { out.java.push_back(genDir + "/" + gen.javaName + ".java"); std::ofstream(out.java.back()) << gen.java; }
    else {
      std::ofstream(genDir + "/" + gen.objcName + ".h") << gen.objcHeader;
      bool swift = false;
      for (const std::string& s : ts->second.sources) swift = swift || endsWith(s, ".swift");
      if (swift) { out.own.push_back(genDir + "/" + gen.objcName + ".swift"); std::ofstream(out.own.back()) << gen.swiftProtocol; }   // for the author's Swift class to conform to
    }
    std::string q = "ZN_NATIVE_CLASS=\"";
    for (char c : cls) if (std::isalnum(static_cast<unsigned char>(c)) || c == '.' || c == '_' || c == '$') q += c;
    out.defines.push_back(q + "\"");
    if (!android) out.flags.push_back("-fobjc-arc");   // the bridge keeps the instance and the blocks as ARC references
  } else if (it != m.nativeImpl.end()) impl = (fs::path(p.dir) / it->second).string();
  else for (std::string cand : {base + "." + target + ".cpp", base + "." + target + ".mm", base + ".host.cpp", base + ".abi.c", base + ".abi.cpp"}) if (impl.empty() && fs::exists(nativeDir / cand)) impl = (nativeDir / cand).string();
  if (impl.empty()) { err = "plugin '" + m.name + "' has no native source for " + target; return false; }
  out.own.push_back(impl);
  for (const std::string& s : ts->second.sources) (endsWith(s, ".java") || endsWith(s, ".kt") ? out.java : endsWith(s, ".c") || s.rfind("vendor/", 0) == 0 ? out.vendored : out.own).push_back((fs::path(p.dir) / s).string());
  { std::vector<std::string> d = buildDefines(p, ts->second, engineRoot, projectDir, target); out.defines.insert(out.defines.begin(), d.begin(), d.end()); }   // ZN_NATIVE_CLASS stays after them
  out.libs = ts->second.libs;
  out.frameworks = ts->second.frameworks;
  out.vendorFlags = ts->second.vendorFlags;
  for (const std::string& f : ts->second.flags) {
    const size_t at = f.rfind("-I", 0) == 0 ? 2 : 0;
    out.flags.push_back(f.compare(at, 2, "./") != 0 && f.compare(at, 3, "../") != 0 ? f : f.substr(0, at) + (fs::path(p.dir) / f.substr(at)).lexically_normal().string());
  }
  if (isAbi(impl)) { std::ofstream(genDir + "/zinc_native_" + lower + "_abi.h") << gen.cHeader; return true; }   // it defines zn_module_<X> itself
  std::ofstream(genDir + "/zinc_native_" + lower + ".h") << gen.cppHeader;
  std::ofstream(genDir + "/zinc_native_" + lower + "_thunk.cpp") << gen.thunk;
  out.own.push_back(genDir + "/zinc_native_" + lower + "_thunk.cpp");
  return true;
}

namespace {
struct BuildLock {   // an exclusive flock on $ZINC_HOME/cache/.build-lock, released when the process ends whatever happens
#ifndef _WIN32
  int fd = -1;
  BuildLock() {
    std::error_code ec;
    fs::create_directories(home() + "/cache", ec);
    fd = ::open((home() + "/cache/.build-lock").c_str(), O_RDWR | O_CREAT | O_CLOEXEC, 0644);
    if (fd >= 0) ::flock(fd, LOCK_EX);
  }
  ~BuildLock() { if (fd >= 0) ::close(fd); }
#endif   // ponytail: no lock on Windows yet (LockFileEx when it builds plugins in parallel)
};
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
      log::step("plugin", m.name + ": cached native library");
      return true;
    }
  }
  // one build at a time per ZINC_HOME: two programs started together (the examples run in parallel, a test beside an app) would compile
  // and link the same cache entry over each other, and macOS on arm64 refuses a library rewritten under a process that mapped it
  BuildLock lock;
  if (!stamp.empty() && readStamp(stamp, out)) return true;   // built by the program that held the lock
  if (!buildPluginSlow(p, engineRoot, projectDir, target, out, err)) return false;
  if (!stamp.empty()) writeStamp(stamp, out, stampInputs(p, engineRoot, target));
  return true;
}

// zinc keeps SDL3 in its window module (src/host/window_module.cpp, ZN-592.01): the display drivers, and the plugins whose load stops on an
// SDL function (zinc:3d's GL context, webview), get it loaded first; compiled programs link SDL3 and have no such function.
#ifdef _WIN32
static int (*const zn_window_load)(void) = nullptr;   // no window module on Windows yet: SDL3 is linked into zinc.exe there
#else
extern "C" int zn_window_load(void) __attribute__((weak));
#endif

// A library the plugin's library needs is gone (a Homebrew upgrade that left FFmpeg on an older x265): its name and how to get it back, not the
// loader's report of every path it tried (macOS: "Library not loaded: <path>\n  Referenced from: <uuid> <path>"; Linux: "<lib>: cannot open
// shared object file"). "" when the error is another one.
static std::string missingLibrary(const PluginLib& lib, const std::string& why) {
  namespace fs = std::filesystem;
  std::string path, from;
  if (std::size_t at = why.find("Library not loaded: "); at != std::string::npos) {
    path = why.substr(at + 20, why.find('\n', at) - at - 20);
    if (std::size_t r = why.find("Referenced from: "); r != std::string::npos) {
      std::string line = why.substr(r + 17, why.find('\n', r) - r - 17);
      if (std::size_t gt = line.find("> "); gt != std::string::npos) line = line.substr(gt + 2);
      from = line;
    }
  } else if (std::size_t at = why.find(": cannot open shared object file"); at != std::string::npos && why.compare(0, at, lib.shared) != 0) {
    path = why.substr(0, at);
  }
  if (path.empty()) return "";
  auto formula = [](const std::string& p) -> std::string {   // the Homebrew formula a file belongs to: .../Cellar/<it>/... or .../opt/<it>/lib/...
    for (const char* k : {"/Cellar/", "/opt/homebrew/opt/", "/usr/local/opt/"})
      if (std::size_t at = p.find(k); at != std::string::npos) return p.substr(at + std::strlen(k), p.find('/', at + std::strlen(k)) - at - std::strlen(k));
    return "";
  };
  std::string f = formula(from);
  if (f.empty()) f = formula(path);
  return "a library that the " + lib.plugin + " plugin needs is missing: " + fs::path(path).filename().string() +
         (f.empty() ? " (install it again, then run the command again)" : " (reinstall it: brew reinstall " + f + ")");
}

/** A plugin's exports as the `exports` file holds them: "module <name>", then "<function> <signature>" per line. */
static std::string exportsText(const PluginLib& lib, const ZnModule* mod) {
  std::string t = "module " + lib.module + "\n";
  for (uint32_t i = 0; i < mod->nexports; ++i) t += std::string(mod->exports[i].name) + " " + mod->exports[i].sig + "\n";
  return t;
}

bool loadPlugin(const PluginLib& lib, std::string& err) {
  const bool global = lib.display;   // a driver's zgl_* functions are what GPU plugins (zinc:mapping) bind to
  if (lib.display && zn_window_load) zn_window_load();
  void* h = zn::plat::libOpen(lib.shared, global);
  if (!h) {
    std::string why = zn::plat::libError();
    if (zn_window_load && why.find("'_SDL_") != std::string::npos && zn_window_load()) { h = zn::plat::libOpen(lib.shared, global); if (!h) why = zn::plat::libError(); }
    if (!h) {
      err = missingLibrary(lib, why);
      if (err.empty()) err = std::string("cannot load ") + lib.shared + ": " + why;
      else zn::log::write("plugin", zn::log::Debug, lib.plugin + ": " + why);   // the loader's whole report: ZINC_LOG=plugin:debug
      return false;
    }
  }
  if (lib.display) return true;   // its static constructor has registered it with the HAL
  using Open = const ZnModule* (*)();
  auto open = reinterpret_cast<Open>(zn::plat::libSymbol(h, ("zn_module_" + lib.module).c_str()));
  if (!open) { err = "plugin '" + lib.plugin + "' does not export zn_module_" + lib.module; return false; }
  char e[256] = "";
  const ZnModule* mod = open();
  if (zn_register_module(mod, e, sizeof e) != 0) { err = "plugin '" + lib.plugin + "': " + e; return false; }
  std::string list = (std::filesystem::path(lib.shared).parent_path() / "exports").string();
  if (!lib.prebuilt && !std::filesystem::exists(list)) {   // prebuilt libraries may live in a sealed app; cache exports only beside local builds
    std::ofstream out(list + ".tmp");
    out << exportsText(lib, mod);
    out.close();
    std::error_code ec;
    if (out) std::filesystem::rename(list + ".tmp", list, ec);
  }
  return true;
}

std::string pluginExportsFile(const PluginLib& lib) {
  if (std::ifstream in((std::filesystem::path(lib.shared).parent_path() / "exports").string()); in) { std::stringstream s; s << in.rdbuf(); return s.str(); }
  // a prebuilt library has no file beside it (its directory may be the install's, read-only): the library says it
  void* h = zn::plat::libOpen(lib.shared, false);
  using Open = const ZnModule* (*)();
  auto open = h ? reinterpret_cast<Open>(zn::plat::libSymbol(h, ("zn_module_" + lib.module).c_str())) : nullptr;
  const ZnModule* mod = open ? open() : nullptr;
  return mod ? exportsText(lib, mod) : "";
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
