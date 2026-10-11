// The asset build (ZN-434, docs/reports/zinc-next-assets.md): every file of a project's assets directory goes through the importer its rules
// name, the artifacts are kept in a content-addressed cache shared by every project (~/.zinc/cache/assets), the groups become ZPK packs
// (src/zpk) and report.json lists what each asset cost. An importer is a pure function of (its id and version, the engine's build, its options,
// the source bytes): the XXH3-128 of those is the artifact's key, so a second build of an unchanged project runs no importer, and the packs
// are the same bytes in any directory and any ZINC_HOME.
#pragma once
#include <cstdint>
#include <functional>
#include <map>
#include <string>
#include <string_view>
#include <vector>

#include "assets/texture.h"
#include "res/res.h"

namespace zn::assets {

/** The kind byte of a pack entry (zpk::Entry::kind). */
enum Kind : std::uint8_t { Data = 0, Image = 1, Fonts = 2, SplashFrame = 3 };

/** Pixel layouts of the image importer: rows top to bottom after a 16-byte header (include/zn/zim.h), premultiplied alpha. */
enum class Format : std::uint8_t { Rgba8 = 1, Rgb565 = 2, Rgba4444 = 3 };
constexpr std::size_t kImageHeader = 16;

/** Files whose path matches `match` (a glob relative to the assets directory: `*` within a name, `**` across directories, `{a,b}` alternatives)
 *  go to importer `as` with `options`. Every matching rule applies in order, a later one overriding the keys of an earlier one. */
struct Rule { std::string match, as; std::map<std::string, std::string> options; };
/** The assets a group's `include` globs match and its `exclude` globs do not go into one pack, <name>.zpk; the first group that takes an asset
 *  wins, and an asset no group takes goes to "default". */
struct Group { std::string name; std::vector<std::string> include, exclude; };

/** The engine splash (ZN-446): zinc.json `splash` for the target. Its entry, `.splash` of boot.zpk (a hidden name, which no asset has), is
 *  ZSP1 (little-endian): magic, u32 background 0xAARRGGBB, u8 fit (0 contain, 1 cover, 2 center), 3 bytes 0, u32 minMs, u32 fadeMs; then the
 *  image as the image importer writes it (ZIM1 rgba8, premultiplied), absent for a background alone. Stored uncompressed: the host maps it. */
struct Splash { bool on = false; std::string image; std::uint32_t background = 0xff000000; std::uint8_t fit = 0; std::uint32_t minMs = 0, fadeMs = 0; };
constexpr char kSplashEntry[] = ".splash";
/** The ZSP1 bytes of `s`, its image imported through the cache. `artifact`: the file the cache keeps them in ("" without a cache); `hit`: found there. */
bool splash(const Splash& s, const std::string& cacheDir, const std::string& tool, std::string& out, std::string& artifact, std::string& err, bool* hit = nullptr);

struct Options {
  std::string sourceDir;   // the assets directory
  std::string outDir;      // where the packs and report.json go (build/assets/<target>)
  std::string cacheDir;    // the artifacts by key; empty: no cache (ZINC_NO_CACHE), every asset is imported
  std::string tool;        // the build of the engine (its version and executable stamp): part of every key, so a new engine imports again
  std::string target, profile = "dev";   // named in the report; "release" compresses the packs (the target's `pack` codec, zstd by default), "dev" stores entries as they are
  /** The asset profile in force on the target (zinc assets info): `texture` (the formats of texture rules in a release build; a dev build makes
   *  rgba8), `maxSize` and `pot` (texture rules), `pack` (none, lz4, zstd, zstd-dict). */
  std::map<std::string, std::string> targetProfile;
  ToolPath basisu;            // the texture encoder (zn::tc::ensureBasisu), asked for when a texture rule needs a block format
  std::vector<Rule> rules;    // after the built-in ones: PNG, JPEG, WebP and SVG to "image" (rgba8), anything else to "copy"
  std::vector<Group> groups;
  Splash splash;              // on: its entry goes into boot.zpk (a pack of the splash alone when no group is named boot)
};

/** packBytes: what its entry takes in its pack (compressed); format and gpuBytes, for an image: its layout and what its texels take on the GPU. */
struct Item { std::string name, importer, group; std::uint64_t sourceBytes = 0, outputBytes = 0; double ms = 0; bool cached = false; std::string format; std::uint64_t gpuBytes = 0, packBytes = 0; };
struct Pack { std::string file, group; std::size_t entries = 0; std::uint64_t bytes = 0; };
struct Report { std::vector<Item> items; std::vector<Pack> packs; std::size_t imported = 0; double ms = 0; };

/** Imports what changed, writes the packs (a pack whose bytes did not change is not rewritten; packs of groups that no longer exist are
 *  removed) and report.json. False with `err` naming the asset when an importer fails. */
bool build(const Options& opt, Report& report, std::string& err);
std::string reportJson(const Options& opt, const Report& report);

/** The importer the rules (after the built-in ones) give the asset `name` (relative to the assets directory, '/' separated), as build() picks it. */
std::string importerFor(const std::string& name, const std::vector<Rule>& rules);

/** A cache key: XXH3-128 over parts, each hashed on its own so that their boundaries count. */
class Key {
 public:
  Key& add(std::string_view part);
  std::string hex() const;   // 32 hex digits
 private:
  std::string digests_;
};

/** The artifact stored under `key` in `cacheDir`, else `make`'s output, then stored (written aside and renamed: concurrent builds are safe).
 *  `hit` says which. The cache keeps the most recently used artifacts within its budget (2 GiB, ZINC_ASSET_CACHE_MB). */
bool cached(const std::string& cacheDir, const std::string& key, const std::function<bool(std::string& out, std::string& err)>& make,
            std::string& out, bool& hit, std::string& err);

/** The font baker (src/res) behind the cache: the key covers the sources, the options, the engine's build and every file of the font
 *  and assets directories the baker may read, so an unchanged program is not baked twice (zinc run, pack, build and export). */
bool bake(const std::vector<std::string>& sources, const res::Options& opt, const std::string& cacheDir, const std::string& tool,
          std::vector<std::uint8_t>& blob, bool& hit, std::string& err);

}  // namespace zn::assets
