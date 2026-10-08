#pragma once
// The toolchain manager (ZN-029): `zig c++` as a hidden, pinned toolchain. It is downloaded on first use into ~/.zinc (or $ZINC_HOME),
// its SHA-256 is checked against the pin in this module before anything is extracted, and it cross-compiles the runtime and the
// program that `zinc build` writes for a target (aarch64 and x86_64 Linux, macOS), with no Docker and no installation by hand.
// Environment: ZINC_HOME (where toolchains and object caches live), ZINC_ZIG (use this zig instead of the pinned one, for development),
// ZINC_TC_MIRROR (a base URL, or file:// directory, that replaces https://ziglang.org/download/<version> for the downloads).
#include <string>
#include <vector>

namespace zn::tc {

struct Target {
  const char* name;      // what the user writes: aarch64-linux
  const char* zigTarget; // what zig is given: aarch64-linux-gnu
  const char* note;
};
const std::vector<Target>& targets();
const Target* findTarget(const std::string& name);

std::string home();         // $ZINC_HOME or ~/.zinc
std::string hostName();     // the pin key of this machine: aarch64-macos, x86_64-linux, ...
std::string zigVersion();   // the pinned version

// Hex SHA-256 of a file, empty when it cannot be read.
std::string sha256File(const std::string& path);

// The path of a usable zig: $ZINC_ZIG, or the pinned one (downloaded and verified when missing). False with `err` set when that fails.
bool ensureZig(std::string& zigPath, std::string& err);

// The path of esptool (Espressif's flashing tool, a standalone binary), downloaded and verified like the zig. $ZINC_ESPTOOL names your own.
bool ensureEsptool(std::string& path, std::string& err);

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
bool fetchManifest(const std::string& manifestUrl, UpdateInfo& info, std::string& err);
bool newerVersion(const std::string& candidate, const std::string& current);  // dotted numbers
// Downloads info.url into `dir`, checks its SHA-256 against the manifest before keeping it; `path` is the verified file.
bool downloadUpdate(const UpdateInfo& info, const std::string& dir, std::string& path, std::string& err);

}  // namespace zn::tc
