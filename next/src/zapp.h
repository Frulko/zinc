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

namespace zn::zapp {

constexpr int kFormat = 1;

/** The archive of `files` (name -> bytes): manifest.json is made here from the others. */
std::string pack(const std::map<std::string, std::string>& files, const std::string& name, const std::string& engine);

/** The files of an archive, checked; false with `err` for a corrupted archive or one made for a newer format or engine than `engine`. */
bool unpack(const std::string& archive, const std::string& engine, std::map<std::string, std::string>& files, std::string& err);

}  // namespace zn::zapp
