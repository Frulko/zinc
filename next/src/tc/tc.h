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

// Compiles `cppFile` (the C++ of a program, src/aot) together with the runtime for `target` and writes the executable `outFile`.
// `sourceRoot` is the directory of the engine sources (next/). Objects of the runtime are cached per target under home()/cache.
bool crossBuild(const std::string& zig, const std::string& sourceRoot, const std::string& cppFile, const std::string& target, const std::string& outFile, std::string& err);

}  // namespace zn::tc
