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

#include "res/res.h"

namespace zn::assets {

/** The kind byte of a pack entry (zpk::Entry::kind). */
enum Kind : std::uint8_t { Data = 0, Image = 1, Fonts = 2 };

/** Pixel layouts of the image importer: rows top to bottom after a 16-byte header (docs/reports/zinc-next-assets.md), premultiplied alpha. */
enum class Format : std::uint8_t { Rgba8 = 1, Rgb565 = 2, Rgba4444 = 3 };
constexpr std::size_t kImageHeader = 16;

/** Files whose path matches `match` (a glob relative to the assets directory: `*` within a name, `**` across directories, `{a,b}` alternatives)
 *  go to importer `as` with `options`. Every matching rule applies in order, a later one overriding the keys of an earlier one. */
struct Rule { std::string match, as; std::map<std::string, std::string> options; };
/** The assets a group's `include` globs match go into one pack, <name>.zpk; an asset no group takes goes to "default". */
struct Group { std::string name; std::vector<std::string> include; };

struct Options {
  std::string sourceDir;   // the assets directory
  std::string outDir;      // where the packs and report.json go (build/assets/<target>)
  std::string cacheDir;    // the artifacts by key; empty: no cache (ZINC_NO_CACHE), every asset is imported
  std::string tool;        // the build of the engine (its version and executable stamp): part of every key, so a new engine imports again
  std::string target, profile = "dev";   // named in the report; "release" compresses the packs with zstd, "dev" stores entries as they are
  std::vector<Rule> rules;    // after the built-in ones: PNG, JPEG, WebP and SVG to "image" (rgba8), anything else to "copy"
  std::vector<Group> groups;
};

struct Item { std::string name, importer, group; std::uint64_t sourceBytes = 0, outputBytes = 0; double ms = 0; bool cached = false; };
struct Pack { std::string file, group; std::size_t entries = 0; std::uint64_t bytes = 0; };
struct Report { std::vector<Item> items; std::vector<Pack> packs; std::size_t imported = 0; double ms = 0; };

/** Imports what changed, writes the packs (a pack whose bytes did not change is not rewritten; packs of groups that no longer exist are
 *  removed) and report.json. False with `err` naming the asset when an importer fails. */
bool build(const Options& opt, Report& report, std::string& err);
std::string reportJson(const Options& opt, const Report& report);

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
