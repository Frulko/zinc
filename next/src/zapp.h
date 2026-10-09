// .zapp archives (ZN-318): one runnable file per app, like LÖVE's .love. A POSIX ustar archive written deterministically (sorted names, time 0,
// owner 0, mode 0644), so two packs of the same project are byte-identical and `tar tf app.zapp` lists it:
//   manifest.json   {"format": 1, "engine": "0.0.1", "name": ..., "files": {"<name>": "<sha256>"...}, "signature": ""}
//   zinc.json       the project's manifest (window, targets, permissions)
//   program.zbc     the compiled program
//   resources.bin   the baked fonts and images (src/res)
//   assets/...      the project's assets, read at run time through zinc:assets
// Reading checks every header checksum and every file against the manifest's SHA-256, and refuses a newer format or engine.
#pragma once
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

/** The archive of `files` (name -> bytes): manifest.json is made here from the others. */
std::string pack(const std::map<std::string, std::string>& files, const std::string& name, const std::string& engine);

/** The files of a ustar archive (`files`: name -> bytes; directories left out), every header checksum checked, names outside it refused. */
bool untar(const std::string& archive, std::map<std::string, std::string>& files, std::string& err);

/** The files of an archive, checked; false with `err` for a corrupted archive or one made for a newer format or engine than `engine`. */
bool unpack(const std::string& archive, const std::string& engine, std::map<std::string, std::string>& files, std::string& err);

}  // namespace zn::zapp
