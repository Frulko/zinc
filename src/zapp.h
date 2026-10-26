// .zapp archives (ZN-318): one runnable file per app, like LÖVE's .love. A POSIX ustar archive written deterministically (sorted names, time 0,
// owner 0, mode 0644), so two packs of the same project are byte-identical and `tar tf app.zapp` lists it:
//   manifest.json   {"format": 1, "engine": "0.0.1", "needs": {"zbc": 8, "rt": 412}, "name": ..., "files": {"<name>": "<sha256>"...}, "signature": ""}
//   zinc.json       the project's manifest (window, targets, permissions)
//   program.zbc     the compiled program
//   resources.bin   the baked fonts and images (src/res)
//   assets/...      the project's assets, read at run time through zinc:assets
// Reading checks every header checksum and every file against the manifest's SHA-256, and refuses a newer format. With `needs` (a compiled
// program) it runs on any engine that reads that ZBC version and has that many runtime calls (the table only grows), whatever `engine` says:
// an app is not tied to the version that packed it. Without `needs` (an older pack, a JavaScript project) a newer `engine` is refused.
#pragma once
#include <cstdint>
#include <map>
#include <string>
#include <utility>
#include <vector>

namespace zn::zapp {

constexpr int kFormat = 1;

/** One member of a ustar archive: a file (mode 0644 or 0755) or, when `dir`, a directory (mode 0755). */
struct TarEntry { std::string name, data; unsigned mode = 0644; bool dir = false; };
/** A ustar archive of `entries` in the given order, deterministic (time 0, owner 0): .zapp, and the control and data members of a .deb. */
std::string ustar(const std::vector<TarEntry>& entries);
/** A Unix ar archive ("!<arch>", as .deb files use) of (name, bytes) members in order, deterministic (time 0, owner 0, mode 0644). */
std::string ar(const std::vector<std::pair<std::string, std::string>>& members);

/** The archive of `files` (name -> bytes): manifest.json is made here from the others. `zbc` > 0: the program's ZBC version and the
 *  runtime calls it needs (zn::aot::rtNeeded), written as `needs`. */
std::string pack(const std::map<std::string, std::string>& files, const std::string& name, const std::string& engine, unsigned zbc = 0, unsigned rt = 0);

/** The files of a ustar archive (`files`: name -> bytes; directories left out), every header checksum checked, names outside it refused. */
bool untar(const std::string& archive, std::map<std::string, std::string>& files, std::string& err);

/** The files of an archive, checked; false with `err` for a corrupted archive or one made for a newer format or engine than `engine`. */
bool unpack(const std::string& archive, const std::string& engine, std::map<std::string, std::string>& files, std::string& err);

/** The .zapp at [offset, offset + size) of the file `path` (a .zapp, or the end of a fused executable), as files in `dir` = <cacheRoot>/<the
 *  manifest's hash> (ZN-430). The first time, every member is streamed through its SHA-256 into the directory; after that only the headers
 *  and the manifest are read while the file keeps its size and time (a stamp in the directory), and a changed file is checked again member
 *  by member before it runs. The same refusals as unpack(), with its messages. */
bool unpackTo(const std::string& path, std::uint64_t offset, std::uint64_t size, const std::string& engine, const std::string& cacheRoot, std::string& dir, std::string& err);

}  // namespace zn::zapp
