#include "tc/tc.h"

#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <map>
#include <sstream>

extern "C" {
#include "sha256.h"  // third_party/sha256 (public domain)
}

namespace fs = std::filesystem;

namespace zn::tc {
namespace {

constexpr const char* kVersion = "0.15.2";

// The pins: the tarball of each host and its SHA-256 (from https://ziglang.org/download/index.json, version 0.15.2).
struct Pin { const char* host; const char* file; const char* sha256; };
constexpr Pin kPins[] = {
    {"aarch64-macos", "zig-aarch64-macos-0.15.2.tar.xz", "3cc2bab367e185cdfb27501c4b30b1b0653c28d9f73df8dc91488e66ece5fa6b"},
    {"x86_64-macos", "zig-x86_64-macos-0.15.2.tar.xz", "375b6909fc1495d16fc2c7db9538f707456bfc3373b14ee83fdd3e22b3d43f7f"},
    {"x86_64-linux", "zig-x86_64-linux-0.15.2.tar.xz", "02aa270f183da276e5b5920b1dac44a63f1a49e55050ebde3aecc9eb82f93239"},
    {"aarch64-linux", "zig-aarch64-linux-0.15.2.tar.xz", "958ed7d1e00d0ea76590d27666efbf7a932281b3d7ba0c6b01b0ff26498f667f"},
};

std::string quote(const std::string& s) {
  std::string r = "'";
  for (char c : s) { if (c == '\'') r += "'\\''"; else r += c; }
  return r + "'";
}

bool run(const std::string& cmd, std::string& err, const char* what) {
  int rc = std::system(cmd.c_str());
  if (rc != 0) { err = std::string(what) + " failed: " + cmd; return false; }
  return true;
}

}  // namespace

const std::vector<Target>& targets() {
  static const std::vector<Target> t = {
      {"aarch64-linux", "aarch64-linux-gnu", "Raspberry Pi 3 and 4 (64-bit), reMarkable Paper Pro, servers"},
      {"armhf-linux", "arm-linux-gnueabihf", "32-bit Raspberry Pi OS"},
      {"x86_64-linux", "x86_64-linux-gnu", "PC and server Linux"},
      {"aarch64-macos", "aarch64-macos", "Apple Silicon"},
      {"x86_64-macos", "x86_64-macos", "Intel Mac"},
  };
  return t;
}

const Target* findTarget(const std::string& name) {
  for (const Target& t : targets()) if (name == t.name) return &t;
  return nullptr;
}

std::string home() {
  if (const char* h = std::getenv("ZINC_HOME")) return h;
  const char* u = std::getenv("HOME");
  return std::string(u ? u : ".") + "/.zinc";
}

std::string hostName() {
#if defined(__APPLE__)
  const char* os = "macos";
#elif defined(__linux__)
  const char* os = "linux";
#else
  const char* os = "unknown";
#endif
#if defined(__aarch64__) || defined(__arm64__)
  return std::string("aarch64-") + os;
#elif defined(__x86_64__)
  return std::string("x86_64-") + os;
#else
  return std::string("unknown-") + os;
#endif
}

std::string zigVersion() { return kVersion; }

std::string sha256File(const std::string& path) {
  std::ifstream in(path, std::ios::binary);
  if (!in) return "";
  SHA256_CTX ctx;
  sha256_init(&ctx);
  char buf[1 << 16];
  while (in.read(buf, sizeof buf) || in.gcount() > 0) sha256_update(&ctx, reinterpret_cast<const BYTE*>(buf), static_cast<size_t>(in.gcount()));
  BYTE out[SHA256_BLOCK_SIZE];
  sha256_final(&ctx, out);
  static const char* hex = "0123456789abcdef";
  std::string r;
  for (BYTE b : out) { r += hex[b >> 4]; r += hex[b & 15]; }
  return r;
}

bool ensureZig(std::string& zigPath, std::string& err) {
  if (const char* z = std::getenv("ZINC_ZIG")) {
    if (!fs::exists(z)) { err = std::string("ZINC_ZIG points to a missing file: ") + z; return false; }
    zigPath = z;
    return true;
  }
  const Pin* pin = nullptr;
  for (const Pin& p : kPins) if (hostName() == p.host) pin = &p;
  if (!pin) { err = "no pinned zig for this machine (" + hostName() + "); set ZINC_ZIG to a zig " + kVersion + " you installed"; return false; }
  fs::path dir = fs::path(home()) / "toolchains" / (std::string("zig-") + pin->host + "-" + kVersion);
  fs::path zig = dir / "zig";
  if (fs::exists(zig)) { zigPath = zig.string(); return true; }
  // download, verify, then extract: nothing from an archive that does not match the pin is ever unpacked
  std::error_code ec;
  fs::create_directories(dir.parent_path(), ec);
  fs::path archive = dir.parent_path() / (std::string(pin->file) + ".part");
  std::string base = std::getenv("ZINC_TC_MIRROR") ? std::getenv("ZINC_TC_MIRROR") : std::string("https://ziglang.org/download/") + kVersion;
  std::string url = base + "/" + pin->file;
  std::fprintf(stderr, "zinc: downloading the toolchain %s (zig %s, once)...\n", url.c_str(), kVersion);
  if (!run("curl -fL --retry 3 -sS -o " + quote(archive.string()) + " " + quote(url), err, "the download")) return false;
  std::string got = sha256File(archive.string());
  if (got != pin->sha256) {
    fs::remove(archive, ec);
    err = "checksum mismatch for " + std::string(pin->file) + ": expected " + pin->sha256 + ", got " + (got.empty() ? "nothing" : got) + "; the download was discarded";
    return false;
  }
  std::fprintf(stderr, "zinc: checksum verified (%s)\n", got.c_str());
  fs::path tmp = dir.parent_path() / (std::string("extract-") + pin->host);
  fs::remove_all(tmp, ec);
  fs::create_directories(tmp, ec);
  if (!run("tar -xJf " + quote(archive.string()) + " -C " + quote(tmp.string()), err, "unpacking")) { fs::remove_all(tmp, ec); return false; }
  fs::path inner;  // the archive holds one directory: zig-<host>-<version>
  for (auto& e : fs::directory_iterator(tmp)) inner = e.path();
  if (inner.empty() || !fs::exists(inner / "zig")) { err = "the archive has no zig binary"; fs::remove_all(tmp, ec); return false; }
  fs::remove_all(dir, ec);
  fs::rename(inner, dir, ec);
  if (ec) { err = "cannot move the toolchain into place: " + ec.message(); return false; }
  fs::remove_all(tmp, ec);
  fs::remove(archive, ec);
  std::ofstream(dir / "SHA256") << pin->sha256 << "  " << pin->file << "\n";
  zigPath = zig.string();
  return true;
}

bool crossBuild(const std::string& zig, const std::string& root, const std::string& cppFile, const std::string& target, const std::string& outFile, std::string& err) {
  const Target* t = findTarget(target);
  if (!t) { err = "unknown target '" + target + "' (zinc toolchain targets)"; return false; }
  fs::path cache = fs::path(home()) / "cache" / t->name;
  std::error_code ec;
  fs::create_directories(cache, ec);
  std::string flags = std::string("-target ") + t->zigTarget + " -O2 -w -I " + quote(root + "/include") + " -I " + quote(root + "/src") + " -I " + quote(root + "/third_party/mimalloc/include");
  if (std::string(t->name) == "armhf-linux") flags += " -mcpu=arm1176jzf_s";  // runs on every 32-bit Pi, the first one included
  struct Src { std::string path; bool c; };
  std::vector<Src> srcs = {{"src/rt/machine.cpp", false}, {"src/rt/rtcalls.cpp", false}, {"src/rt/program.cpp", false}, {"src/rt/alloc.cpp", false}, {"src/zbc/zbc.cpp", false}, {"third_party/mimalloc/src/static.c", true}};
  std::string objs;
  for (const Src& s : srcs) {
    std::string src = root + "/" + s.path;
    std::string key = sha256File(src).substr(0, 16);
    // a header change must rebuild too: the key covers the headers of include/ and src/ through their combined size and time
    std::string headers;
    for (const char* dir : {"include/zn", "src/rt", "src/zbc"})
      for (auto& e : fs::directory_iterator(root + "/" + dir)) if (e.path().extension() == ".h") headers += e.path().filename().string() + std::to_string(fs::file_size(e.path())) + ";";
    std::hash<std::string> h;
    std::string obj = (cache / (fs::path(s.path).filename().string() + "." + key + "." + std::to_string(h(headers) & 0xFFFFFF) + ".o")).string();
    if (!fs::exists(obj)) {
      std::fprintf(stderr, "zinc: compiling %s for %s\n", s.path.c_str(), t->name);
      std::string cmd = quote(zig) + (s.c ? " cc " : " c++ -std=c++20 ") + flags + " -c " + quote(src) + " -o " + quote(obj);
      if (!run(cmd, err, "the compiler")) { fs::remove(obj, ec); return false; }
    }
    objs += " " + quote(obj);
  }
  std::string cmd = quote(zig) + " c++ -std=c++20 " + flags + " " + quote(cppFile) + objs + " -o " + quote(outFile);
  return run(cmd, err, "the compiler");
}

}  // namespace zn::tc
