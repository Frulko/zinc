// Tile maps (ZN-443, docs/reports/zinc-next-assets.md "Tile maps"), private to src/assets: a Tiled map (.tmj, its tilesets embedded or
// external .tsj) or an LDtk project (.ldtk) becomes the table zinc:tilemap reads, the entry <map>.tilemap, and the tiles it uses become
// frames of an atlas (sprite.h), so its levels draw from atlas pages.
#pragma once
#include <functional>
#include <map>
#include <string>
#include <vector>

namespace zn::assets {

/** The atlas of a map's tiles when its rule names none (`"atlas"`). */
inline constexpr char kTileAtlas[] = "tiles";

/** The files a map reads besides itself, relative to the assets directory, sorted: Tiled's external tilesets and every tileset image, LDtk's
 *  tileset images. `read` gives the bytes of one of them (an external tileset names its image). False with `err` when the map is not one
 *  this importer reads (Tiled's XML formats among them: export them as JSON). */
bool tilemapDeps(const std::string& name, const std::string& json, const std::function<bool(const std::string&, std::string&)>& read,
                 std::vector<std::string>& deps, std::string& err);
/** A map to its artifact: "ZTM1", the u32 size of the frames of its tiles (spriteArtifact), those frames, then its table. `side`: the
 *  bytes of tilemapDeps's files by name; `opts`: its rule's (`atlas` names the atlas of its tiles). */
bool importTilemap(const std::string& name, const std::string& in, const std::map<std::string, std::string>& side,
                   const std::map<std::string, std::string>& opts, std::string& out, std::string& err);
/** importTilemap's artifact to its frames and its table; false when it is not one. */
bool splitTilemap(const std::string& artifact, std::string& frames, std::string& table);

}  // namespace zn::assets
