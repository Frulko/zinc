#pragma once
// The toolchain manager (ZN-029): `zig c++` as a hidden, pinned toolchain. It is downloaded on first use into ~/.zinc (or $ZINC_HOME),
// its SHA-256 is checked against the pin in this module before anything is extracted, and it cross-compiles the runtime and the
// program that `zinc build` writes for a target (aarch64 and x86_64 Linux, macOS), with no Docker and no installation by hand.
// Environment: ZINC_HOME (where toolchains and object caches live), ZINC_ZIG (use this zig instead of the pinned one, for development),
// ZINC_TC_MIRROR (a base URL, or file:// directory, that replaces https://ziglang.org/download/<version> for the downloads).
#include <functional>
#include <string>
#include <vector>

namespace zn::tc {

struct Target {
  const char* name;      // what the user writes: aarch64-linux
  const char* zigTarget; // what zig is given: aarch64-linux-gnu
  const char* cpuFlags;  // the CPU every compile for this target uses ("" for zig's default): the oldest core of the boards it runs on
  const char* note;
};
const std::vector<Target>& targets();
const Target* findTarget(const std::string& name);
// Phones and tablets (ZN-618, D59): built by the platform's own tools through zinc export --target <name> (Gradle and the NDK, Xcode), not by the
// pinned zig: zigTarget is empty and note says what the build needs.
const std::vector<Target>& appTargets();
const Target* findAppTarget(const std::string& name);

std::string home();         // $ZINC_HOME or ~/.zinc
std::string hostName();     // the pin key of this machine: aarch64-macos, x86_64-linux, ...
std::string zigVersion();   // the pinned version

// Hex SHA-256 of a file, empty when it cannot be read.
std::string sha256File(const std::string& path);

// Downloads (ZN-339): every source of `rel` is tried in order, the mirrors of ZINC_MIRRORS (base URLs, spaces or commas: <mirror>/<rel>) then `origin`
// (a whole URL, "" for none); each answer must pass `accept` (its pinned hash, its signature), else it is reported and the next source is tried.
// curl honours HTTPS_PROXY / http_proxy / NO_PROXY. ZINC_OFFLINE=1: only file:// sources.
using Accept = std::function<bool(const std::string& path, std::string& why)>;
bool downloadTo(const std::string& origin, const std::string& rel, const std::string& out, const Accept& accept, std::string& err);
bool downloadBytes(const std::string& origin, const std::string& rel, std::string& bytes, const std::function<bool(const std::string& bytes, std::string& why)>& accept, std::string& err);
bool offline();
std::vector<std::string> mirrors();
std::string sha256Hex(const std::string& bytes);   // of bytes in memory

// Run shell commands with bounded parallelism and live progress, stopping new jobs after a failure.
bool runCommands(const std::vector<std::string>& commands, unsigned limit, const char* stage);

// The path of a usable zig: $ZINC_ZIG, or the pinned one (downloaded and verified when missing). False with `err` set when that fails.
bool ensureZig(std::string& zigPath, std::string& err);

// macOS: whether the Xcode command line tools (a C++ compiler and the SDK that the frameworks come from) are installed: `xcode-select -p` names a directory that
// holds an SDK. True elsewhere. It never opens the system's install window (xcrun would).
bool xcodeToolsInstalled();
// What a command prints when it needs them (`why`: what needs them, what still works without), and, in a terminal, the offer to run `xcode-select --install` (a
// system window downloads and installs them) as Homebrew does. Prints nothing off macOS.
void offerXcodeTools(const char* why);

// The path of esptool (Espressif's flashing tool, a standalone binary), downloaded and verified like the zig. $ZINC_ESPTOOL names your own.
bool ensureEsptool(std::string& path, std::string& err);
// itch.io's butler (ZN-325): ZINC_BUTLER, or the pinned release fetched once into ~/.zinc/toolchains, its SHA-256 checked. butlerPath() is
// where it is (or will be) without fetching it.
bool ensureButler(std::string& path, std::string& err);
std::string butlerPath();
std::string butlerVersion();
// esbuild (docs/reports/zinc-quickjs-bundler.md), the linker and minifier of `zinc bundle`: ZINC_ESBUILD, or the pinned npm package of this platform
// fetched once into ~/.zinc/toolchains/esbuild-<host>-<version>, its SHA-256 checked. esbuildPath() is where it is (or will be) without fetching it.
bool ensureEsbuild(std::string& path, std::string& err);
std::string esbuildPath();
std::string esbuildVersion();
// basis_universal's basisu (ZN-439), the GPU texture encoder of the asset build: ZINC_BASISU, or the pinned source archive (SHA-256 checked before it
// is unpacked) built once with the pinned zig into ~/.zinc/toolchains/basisu-<host>-<version>/basisu. basisuPath() is where it is (or will be).
bool ensureBasisu(std::string& path, std::string& err);
std::string basisuPath();
std::string basisuVersion();
// gltfpack (ZN-441), the model processor of the asset build: ZINC_GLTFPACK, or the meshoptimizer 1.3 archive (the library third_party vendors)
// built the same way into ~/.zinc/toolchains/gltfpack-<host>-1.3/gltfpack.
bool ensureGltfpack(std::string& path, std::string& err);
std::string gltfpackPath();
std::string gltfpackVersion();

// The command line that starts the ESP32 emulator on the core firmware image, with the serial port on its stdin and stdout. Downloads the
// pinned QEMU (Espressif's build) on first use, the same way as the zig. $ZINC_QEMU names a qemu-system-xtensa of your own.
bool qemuCommand(const std::string& chip, const std::string& sourceRoot, std::string& cmd, std::string& err);

// The pinned tools of this machine (zinc doctor): what zinc downloads on first use, where it keeps it, and whether it is there already.
struct PinnedTool { std::string name, version, archive, sha256, dir; bool present; };
std::vector<PinnedTool> pinnedTools();

// Compiles `cppFile` (the C++ of a program, src/aot) together with the runtime for `target` and writes the executable `outFile`.
// `sourceRoot` is the directory of the engine sources (next/). Objects of the runtime are cached per target under home()/cache.
bool crossBuild(const std::string& zig, const std::string& sourceRoot, const std::string& cppFile, const std::string& target, const std::string& outFile, std::string& err);

// The libraries of the graphics host (zn_host_gfx and what it needs: runtime, rasterizer, null HAL, codecs, libuv, TLS...) built for `target` with the pinned zig, in
// <sourceRoot>/build/cross-<target>; built when missing (CMake with zig as the compiler: tools/cross-libs does the same by hand). `dir` is where they are.
bool ensureCrossLibs(const std::string& zig, const std::string& sourceRoot, const std::string& target, std::string& dir, std::string& err);

// The directory of the engine's own files (next/ of a checkout, or share/zinc/next of a package): lib/std, the runtime sources for cross builds, the
// core firmware. $ZINC_ROOT, else `<exe>/../share/zinc/next` (Linux package) or `<exe>/../Resources/zinc/next` (macOS app), else `compiledIn` (a
// development build runs from its checkout).
std::string sourceRoot(const std::string& compiledIn);
std::string executablePath();  // the running binary, resolved; empty when unknown

// Updates: a manifest is a text file of `key=value` lines (version, url, sha256, notes), fetched with curl from $ZINC_UPDATE_URL (or an argument).
struct UpdateInfo { std::string version, url, sha256, notes; };
// A manifest carries `sig=<128 hex>`: an Ed25519 signature (RFC 8032) of the manifest text without that line. fetchManifest refuses a manifest whose signature does not verify with one of the trusted
// public keys (hex, 64 digits): $ZINC_UPDATE_PUBKEY, the lines of ~/.zinc/update-keys, the keys compiled in (the release key). Without a trusted key there is no update.
bool verifyManifest(const std::string& text, const std::vector<std::string>& trustedKeys, std::string& err);
std::vector<std::string> trustedUpdateKeys();
bool signManifest(const std::string& text, const std::string& seedHex, std::string& signedText, std::string& err);   // the `zinc update-sign` recipe of a release
bool newKeyPair(std::string& seedHex, std::string& publicHex);
bool signBytes(const std::string& bytes, const std::string& seedHex, std::string& sigHex, std::string& err);   // a detached Ed25519 signature, 128 hex digits (zinc sign: plugin archives)
bool verifyBytes(const std::string& bytes, const std::string& sigHex, const std::string& publicHex);
bool fetchManifest(const std::string& manifestUrl, UpdateInfo& info, std::string& err);
// The same for an app's channel (ZN-324): verified with the app's own public keys; a relative `url` in the manifest is resolved against the manifest's.
// A release made without a signing key writes `signature=none` and no sig= line: refused unless allowUnsigned. maxSeconds > 0: one try, that long at most.
bool fetchManifest(const std::string& manifestUrl, UpdateInfo& info, std::string& err, const std::vector<std::string>& keys, bool allowUnsigned = false, double maxSeconds = 0);
std::string publicKeyOf(const std::string& seedHex);   // the hex Ed25519 public key of a signing seed, "" when the seed is not 64 hex digits
bool newerVersion(const std::string& candidate, const std::string& current);  // semver: dotted numbers, -prerelease below its release, +build ignored
// Downloads info.url into `dir`, checks its SHA-256 against the manifest before keeping it; `path` is the verified file.
bool downloadUpdate(const UpdateInfo& info, const std::string& dir, std::string& path, std::string& err);

// zinc itself (src/tc/selfupdate.cpp). The version and the release key are build constants: CMake -DZN_VERSION (default: git describe, else
// 0.0.0-dev) and -DZN_UPDATE_PUBKEY (the hex Ed25519 public key whose seed signs the release manifests; default none).
const char* version();
const char* releaseKey();
// `zinc update [--check] [--rollback] [--channel stable|beta] [manifest-url]`: the engine installed by install.sh (<engine>/.zinc-install) replaced by the
// release of its channel, verified, unpacked beside it and swapped in as a whole directory (the old one kept as <engine>.prev).
int updateCommand(const std::vector<std::string>& args);
// One dim line on stderr when the daily check found a newer release (zinc run, zinc dev); the check itself runs in a detached child.
void updateNotice();
// For zinc doctor: "" when this zinc does not update itself (a source build, an app bundle), else "up to date" / "<version> available" / "not checked: <why>".
std::string updateStatus();

}  // namespace zn::tc
