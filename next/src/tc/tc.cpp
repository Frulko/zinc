#include "tc/tc.h"

#include <algorithm>
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

// The pins: the archive of each tool for each host and its SHA-256. zig: https://ziglang.org/download/index.json (0.15.2);
// QEMU for ESP32 (Espressif's build, xtensa): the checksum file of https://github.com/espressif/qemu/releases/tag/esp-develop-9.2.2-20260417.
struct Pin { const char* host; const char* file; const char* sha256; };
constexpr Pin kZigPins[] = {
    {"aarch64-macos", "zig-aarch64-macos-0.15.2.tar.xz", "3cc2bab367e185cdfb27501c4b30b1b0653c28d9f73df8dc91488e66ece5fa6b"},
    {"x86_64-macos", "zig-x86_64-macos-0.15.2.tar.xz", "375b6909fc1495d16fc2c7db9538f707456bfc3373b14ee83fdd3e22b3d43f7f"},
    {"x86_64-linux", "zig-x86_64-linux-0.15.2.tar.xz", "02aa270f183da276e5b5920b1dac44a63f1a49e55050ebde3aecc9eb82f93239"},
    {"aarch64-linux", "zig-aarch64-linux-0.15.2.tar.xz", "958ed7d1e00d0ea76590d27666efbf7a932281b3d7ba0c6b01b0ff26498f667f"},
};
constexpr const char* kEsptoolVersion = "v5.4.0";  // checksums: the digests GitHub lists for the release assets
constexpr Pin kEsptoolPins[] = {
    {"aarch64-macos", "esptool-v5.4.0-macos-arm64.tar.gz", "ba332671130939e2e6db90c2784488f7e62a1459b0fe3c5ec66e9a366821de7a"},
    {"x86_64-macos", "esptool-v5.4.0-macos-amd64.tar.gz", "910bb64fe39a84c792752701293c8aa294faeef229fe8705ecd6955b01db3778"},
    {"aarch64-linux", "esptool-v5.4.0-linux-aarch64.tar.gz", "2964fff085071c1403f2cf812a7a1d425f987f9992851a60236bbee17b6e7dcc"},
    {"x86_64-linux", "esptool-v5.4.0-linux-amd64.tar.gz", "61648fbae20735cabb342f2fbe8fc89b3046e1ed6f9c3e09528d837dc9a9b152"},
};
constexpr const char* kQemuVersion = "esp_develop_9.2.2_20260417";
constexpr Pin kQemuPins[] = {
    {"aarch64-macos", "qemu-xtensa-softmmu-esp_develop_9.2.2_20260417-aarch64-apple-darwin.tar.xz", "bb8c15810565d3df1665dc34962430885e11bc95575b228fb44698146be1e9d6"},
    {"x86_64-macos", "qemu-xtensa-softmmu-esp_develop_9.2.2_20260417-x86_64-apple-darwin.tar.xz", "ae8170fe46bcdfa54a7c0d7afcdb7a066711991be680f72ff7bbc6c4ae3ad88f"},
    {"aarch64-linux", "qemu-xtensa-softmmu-esp_develop_9.2.2_20260417-aarch64-linux-gnu.tar.xz", "00de5985094c14e47d1b38464a006b8ed64fd0fa7a289c56da24f3a329f65339"},
    {"x86_64-linux", "qemu-xtensa-softmmu-esp_develop_9.2.2_20260417-x86_64-linux-gnu.tar.xz", "0eecb2a34a5586c0e59110f77b9343b7b336e82fdb0e1a30e1dc1bab8a547e35"},
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

// Downloads `pin` from `url`, checks it against the pin before anything is unpacked, and unpacks it into `dir` (the archive holds one directory).
// `marker` is a file that must be in the unpacked directory. Nothing happens when `marker` is already there.
static bool fetchTool(const char* what, const Pin& pin, const std::string& url, const fs::path& dir, const char* marker, std::string& err) {
  if (fs::exists(dir / marker)) return true;
  std::error_code ec;
  fs::create_directories(dir.parent_path(), ec);
  fs::path archive = dir.parent_path() / (std::string(pin.file) + ".part");
  std::fprintf(stderr, "zinc: downloading %s %s (once)...\n", what, url.c_str());
  std::string cmd = "curl -fL --retry 3 -sS -o " + quote(archive.string()) + " " + quote(url);
  if (!run(cmd, err, "the download")) return false;
  std::string got = sha256File(archive.string());
  if (got != pin.sha256) {
    fs::remove(archive, ec);
    err = "checksum mismatch for " + std::string(pin.file) + ": expected " + pin.sha256 + ", got " + (got.empty() ? "nothing" : got) + "; the download was discarded";
    return false;
  }
  std::fprintf(stderr, "zinc: checksum verified (%s)\n", got.c_str());
  fs::path tmp = dir.parent_path() / (std::string("extract-") + dir.filename().string());
  fs::remove_all(tmp, ec);
  fs::create_directories(tmp, ec);
  if (!run("tar -xf " + quote(archive.string()) + " -C " + quote(tmp.string()), err, "unpacking")) { fs::remove_all(tmp, ec); return false; }
  fs::path inner;
  for (auto& e : fs::directory_iterator(tmp)) inner = e.path();
  if (inner.empty() || !fs::exists(inner / marker)) { err = std::string("the archive has no ") + marker; fs::remove_all(tmp, ec); return false; }
  fs::remove_all(dir, ec);
  fs::rename(inner, dir, ec);
  if (ec) { err = "cannot move the toolchain into place: " + ec.message(); return false; }
  fs::remove_all(tmp, ec);
  fs::remove(archive, ec);
  std::ofstream(dir / "SHA256") << pin.sha256 << "  " << pin.file << "\n";
  return true;
}

bool ensureZig(std::string& zigPath, std::string& err) {
  if (const char* z = std::getenv("ZINC_ZIG")) {
    if (!fs::exists(z)) { err = std::string("ZINC_ZIG points to a missing file: ") + z; return false; }
    zigPath = z;
    return true;
  }
  const Pin* pin = nullptr;
  for (const Pin& p : kZigPins) if (hostName() == p.host) pin = &p;
  if (!pin) { err = "no pinned zig for this machine (" + hostName() + "); set ZINC_ZIG to a zig " + kVersion + " you installed"; return false; }
  fs::path dir = fs::path(home()) / "toolchains" / (std::string("zig-") + pin->host + "-" + kVersion);
  std::string base = std::getenv("ZINC_TC_MIRROR") ? std::getenv("ZINC_TC_MIRROR") : std::string("https://ziglang.org/download/") + kVersion;
  if (!fetchTool("the toolchain", *pin, base + "/" + pin->file, dir, "zig", err)) return false;
  zigPath = (dir / "zig").string();
  return true;
}

bool ensureEsptool(std::string& path, std::string& err) {
  if (const char* e = std::getenv("ZINC_ESPTOOL")) { path = e; return true; }
  const Pin* pin = nullptr;
  for (const Pin& p : kEsptoolPins) if (hostName() == p.host) pin = &p;
  if (!pin) { err = "no pinned esptool for this machine (" + hostName() + "); set ZINC_ESPTOOL to an esptool you installed"; return false; }
  fs::path dir = fs::path(home()) / "toolchains" / (std::string("esptool-") + pin->host + "-" + kEsptoolVersion);
  std::string base = std::getenv("ZINC_TC_MIRROR") ? std::getenv("ZINC_TC_MIRROR") : std::string("https://github.com/espressif/esptool/releases/download/") + kEsptoolVersion;
  if (!fetchTool("esptool", *pin, base + "/" + pin->file, dir, "esptool", err)) return false;
  path = (dir / "esptool").string();
  return true;
}

bool qemuCommand(const std::string& chip, const std::string& root, std::string& cmd, std::string& err) {
  if (chip != "esp32") { err = "no emulator for " + chip; return false; }
  fs::path flash = fs::path(root) / "firmware/esp32/prebuilt/esp32-core-flash.bin";
  if (!fs::exists(flash)) { err = "the core firmware image is missing: " + flash.string() + " (tools/build-esp32-core builds it)"; return false; }
  fs::path bin;
  if (const char* q = std::getenv("ZINC_QEMU")) bin = q;
  else {
    const Pin* pin = nullptr;
    for (const Pin& p : kQemuPins) if (hostName() == p.host) pin = &p;
    if (!pin) { err = "no pinned QEMU for this machine (" + hostName() + "); set ZINC_QEMU to qemu-system-xtensa from Espressif's build"; return false; }
    fs::path dir = fs::path(home()) / "toolchains" / (std::string("qemu-xtensa-") + pin->host + "-" + kQemuVersion);
    std::string base = std::getenv("ZINC_TC_MIRROR") ? std::getenv("ZINC_TC_MIRROR") : std::string("https://github.com/espressif/qemu/releases/download/esp-develop-9.2.2-20260417");
    if (!fetchTool("the emulator", *pin, base + "/" + pin->file, dir, "bin/qemu-system-xtensa", err)) return false;
    bin = dir / "bin/qemu-system-xtensa";
  }
  // a copy of the flash: the emulator writes to it
  fs::path work = fs::path(home()) / "cache" / "esp32-flash.bin";
  std::error_code ec;
  fs::create_directories(work.parent_path(), ec);
  fs::copy_file(flash, work, fs::copy_options::overwrite_existing, ec);
  {  // the emulator wants a whole 4 MB flash: erased flash reads 0xFF
    std::ofstream f(work, std::ios::binary | std::ios::app);
    std::string pad(4096, '\xff');
    for (std::uintmax_t n = fs::file_size(work, ec); n < (4u << 20);) {
      std::size_t k = static_cast<std::size_t>(std::min<std::uintmax_t>(pad.size(), (4u << 20) - n));
      f.write(pad.data(), static_cast<std::streamsize>(k));
      n += k;
    }
  }
  cmd = quote(bin.string()) + " -nographic -machine esp32 -m 4M -drive file=" + quote(work.string()) + ",if=mtd,format=raw -global driver=timer.esp32.timg,property=wdt_disable,value=true -serial stdio -monitor none 2>/dev/null";
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
