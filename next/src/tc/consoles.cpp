// The SDKs of the consoles and the old iPhone (ZN-456): pinned like the zig, checked before anything is unpacked. Only a maintainer rebuilding a
// console core (next/targets/console) or an AOT build needs them; docs/targets/handhelds.md says how to use each.
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <string>
#include <vector>

#include "tc/tc.h"

namespace fs = std::filesystem;

namespace zn::tc {
namespace {

struct HostPin { const char* host; const char* file; const char* sha256; };
struct Archive { const char* target; const char* base; std::vector<HostPin> pins; };

// pspdev v20261001 (2026-10-01; GCC 15.2.0, binutils 2.44, newlib 4.5.0; pspsdk BSD, GCC GPL with the runtime exception): the release's assets,
// SHA-256 from GitHub's digests. VitaSDK sdk-snapshot-20261015.850.1 (GCC 15.2.0; vita-headers MIT): the release's SHA256SUMS. ps2dev v2.0.0
// (2026-05-17; ps2sdk AFL-2.0 and BSD, gsKit BSD-style, GCC GPL with the runtime exception): GitHub's digests.
const std::vector<Archive>& archives() {
  static const std::vector<Archive> a = {
      {"psp", "https://github.com/pspdev/pspdev/releases/download/v20261001",
       {{"aarch64-macos", "pspdev-macos-latest-arm64.tar.gz", "8efc2e9c41ad3c7e0b0eab2ca0ce2ae69dff329cee577ffd9e4a53edbe2e3acb"},
        {"x86_64-macos", "pspdev-macos-15-intel-x86_64.tar.gz", "bcf1133c438cd632671312b1399cf57b1e2f066665cdc9b0141255ae1cf8d19d"},
        {"x86_64-linux", "pspdev-ubuntu-latest-x86_64.tar.gz", "a86efe624e770005290919617859e9df24bd8fcd3e364f4587f23ec7364b0acd"},
        {"aarch64-linux", "pspdev-ubuntu-24.04-arm-arm64.tar.gz", "0638f5f32fe4354c70040f8ee987b2e7111a981e93499d3986d30b15d1fb8e61"}}},
      {"vita", "https://github.com/vitasdk/autobuilds/releases/download/sdk-snapshot-20261015.850.1",
       {{"aarch64-macos", "vitasdk-arm64-apple-darwin-2026-10-15_05-00-31.tar.bz2", "99f2e1cfb89f0995d80f50f55c927d2c6032c3938f2d79d7b18bba4c9e4ab4ce"},
        {"x86_64-macos", "vitasdk-x86_64-apple-darwin-2026-10-15_05-17-51.tar.bz2", "b801d0db100e8be48134ce1b1d1f3ab86ac27bbcb60ff23f533b8bde069df6d5"},
        {"x86_64-linux", "vitasdk-x86_64-linux-gnu-2026-10-15_05-01-16.tar.bz2", "801f483928523fe63547faf58a7dfdaca7482b26c33af0064acea96a906f7662"},
        {"aarch64-linux", "vitasdk-aarch64-linux-gnu-2026-10-15_05-00-35.tar.bz2", "f312261397ba4400baa6a0b15a9670d1fcb7463b55b0cd54879fbd0126c0b17d"}}},
      {"ps2", "https://github.com/ps2dev/ps2dev/releases/download/v2.0.0",
       {{"aarch64-macos", "ps2dev-macos-latest.tar.gz", "6f6df659d2d49738f21f53a53c361a74182d0e4c2495e31e76972ff818bc21cb"},
        {"x86_64-macos", "ps2dev-macos-15-intel.tar.gz", "833d2dc1e3cbfa2091047e4539e1bd0bd2836668f886a1c8a75e6e09deb56bef"},
        {"x86_64-linux", "ps2dev-ubuntu-latest.tar.gz", "c8e5dedccf62084d476894e88cd0451b57f1ed288e741eb3c1263010aaffc028"},
        {"aarch64-linux", "ps2dev-ubuntu-24.04-arm.tar.gz", "ed69330f235d421754196acf866f8590e5f92e8b92571f1c7e05e853900e7622"}}},
  };
  return a;
}
// devkitARM r67-era image of 2026-06-10 (GCC 16.1.0), amd64 and arm64: devkitPro publishes it, and asks that its packages are not mirrored
constexpr const char* kDevkitArmImage = "docker.io/devkitpro/devkitarm@sha256:116afba8df8453961de2936ffab20dd441edf4d682856c1ec8b0e53d7ed0bbf5";

const HostPin* pinOf(const std::string& target) {
  for (const Archive& a : archives())
    if (target == a.target)
      for (const HostPin& p : a.pins) if (hostName() == p.host) return &p;
  return nullptr;
}
std::string sdkDir(const ConsoleSdk& s) { return (fs::path(home()) / "toolchains" / (std::string(s.sdk) + "-" + hostName() + "-" + s.version)).string(); }
bool ok(const std::string& cmd) { return std::system((cmd + " >/dev/null 2>&1").c_str()) == 0; }
std::string quoted(const std::string& s) { std::string r = "'"; for (char c : s) r += c == '\'' ? std::string("'\\''") : std::string(1, c); return r + "'"; }

// an iPhoneOS SDK whose libSystem stubs still list armv7 (the iOS 9 of the iPhone 4S): ZINC_IOS_LEGACY_SDK, else one of an installed Xcode
std::string armv7Sdk() {
  auto armv7 = [](const fs::path& sdk) {
    std::FILE* f = std::fopen((sdk / "usr/lib/libSystem.tbd").string().c_str(), "rb");
    if (!f) return false;
    char buf[4096];
    const std::size_t n = std::fread(buf, 1, sizeof buf - 1, f);
    std::fclose(f);
    buf[n] = 0;
    return std::string(buf).find("armv7") != std::string::npos;
  };
  if (const char* e = std::getenv("ZINC_IOS_LEGACY_SDK")) return armv7(e) ? e : "";
  std::error_code ec;
  for (auto it = fs::directory_iterator("/Applications", ec); !ec && it != fs::directory_iterator(); it.increment(ec)) {
    if (it->path().filename().string().rfind("Xcode", 0) != 0) continue;
    const fs::path sdks = it->path() / "Contents/Developer/Platforms/iPhoneOS.platform/Developer/SDKs";
    std::error_code e2;
    for (auto s = fs::directory_iterator(sdks, e2); !e2 && s != fs::directory_iterator(); s.increment(e2))
      if (armv7(s->path())) return s->path().string();
  }
  return "";
}
}  // namespace

const std::vector<ConsoleSdk>& consoleSdks() {
  static const std::vector<ConsoleSdk> s = {
      {"psp", "pspdev", "v20261001", "PSPDEV", "bin/psp-g++", "Sony PSP: pspdev v20261001 (GCC 15.2.0), zinc toolchain install psp; emulator PPSSPP"},
      {"vita", "vitasdk", "20261015", "VITASDK", "bin/arm-vita-eabi-g++", "PS Vita: VitaSDK sdk-snapshot-20261015 (GCC 15.2.0), zinc toolchain install vita; emulator Vita3K with Sony's firmware"},
      {"ps2", "ps2dev", "v2.0.0", "PS2DEV", "ee/bin/mips64r5900el-ps2-elf-g++", "PlayStation 2: ps2dev v2.0.0, zinc toolchain install ps2; emulator Play! (no BIOS needed)"},
      {"n3ds", "devkitarm", "20260610", "DEVKITPRO", "devkitARM/bin/arm-none-eabi-g++", "Nintendo 3DS: devkitARM (GCC 16.1.0) in devkitPro's docker image pinned by digest, or $DEVKITPRO"},
      {"ios-legacy", "xcode", "13.4.1", "ZINC_IOS_LEGACY_SDK", "", "iPhone 4S on iOS 9 (armv7): Xcode's clang and ld-classic with an iPhoneOS SDK that has armv7 stubs (Xcode 13.4.1)"},
  };
  return s;
}
const ConsoleSdk* findConsoleSdk(const std::string& target) {
  for (const ConsoleSdk& s : consoleSdks()) if (target == s.target) return &s;
  return nullptr;
}

bool consoleSdkPresent(const ConsoleSdk& s, std::string& where, std::string& why) {
  const std::string t = s.target;
  if (t == "ios-legacy") {
    where = armv7Sdk();
    if (!where.empty()) return true;
    why = "no iPhoneOS SDK with armv7 stubs: download Xcode 13.4.1 from https://developer.apple.com/download/all/ (an Apple ID, free), put it in /Applications "
          "as Xcode-13.4.1.app beside your Xcode, or set ZINC_IOS_LEGACY_SDK to its Contents/Developer/Platforms/iPhoneOS.platform/Developer/SDKs/iPhoneOS15.5.sdk";
    return false;
  }
  if (const char* e = std::getenv(s.env); e && *e) {
    where = e;
    if (fs::exists(fs::path(e) / s.compiler)) return true;
    why = std::string("$") + s.env + " has no " + s.compiler;
    return false;
  }
  if (t == "n3ds") {
    where = kDevkitArmImage;
    if (ok("docker image inspect " + where)) return true;
    why = ok("docker info") ? "the image is not pulled yet (zinc toolchain install n3ds)" : "docker is not running (or set $DEVKITPRO to a devkitPro install)";
    return false;
  }
  where = sdkDir(s);
  if (fs::exists(fs::path(where) / s.compiler)) return true;
  why = pinOf(t) ? "not installed yet (zinc toolchain install " + t + ")" : "no pinned " + std::string(s.sdk) + " for this machine (" + hostName() + "): set $" + s.env;
  return false;
}

bool ensureConsoleSdk(const std::string& target, std::string& where, std::string& err) {
  const ConsoleSdk* s = findConsoleSdk(target);
  if (!s) { err = "no console target '" + target + "' (zinc toolchain targets)"; return false; }
  std::string why;
  if (consoleSdkPresent(*s, where, why)) return true;
  if (target == "ios-legacy" || std::getenv(s->env)) { err = target + ": " + why; return false; }
  if (target == "n3ds") {
    if (!ok("docker info")) { err = "n3ds: " + why; return false; }
    std::fprintf(stderr, "zinc: pulling %s (once, about 520 MB)...\n", kDevkitArmImage);
    if (std::system(("docker pull " + quoted(kDevkitArmImage) + " >&2").c_str()) != 0) { err = "n3ds: docker pull " + std::string(kDevkitArmImage) + " failed"; return false; }
    return true;
  }
  const HostPin* p = pinOf(target);
  if (!p) { err = target + ": " + why; return false; }
  std::string base;
  for (const Archive& a : archives()) if (target == a.target) base = a.base;
  if (const char* m = std::getenv("ZINC_TC_MIRROR")) base = m;
  return fetchArchive(s->sdk, p->file, p->sha256, base + "/" + p->file, where, s->compiler, err);
}

}  // namespace zn::tc
