// Sprites and atlases (ZN-438, docs/reports/zinc-next-assets.md "Sprites and atlases"), private to src/assets: the files of a rule
// `"as": "sprite"` become trimmed frames, one cached artifact per file, and the frames of one atlas are packed into pages when their pack is
// written (stb_rect_pack): the entries <atlas>.atlas (the frame table, text) and <atlas>.atlas.<n> (the pages, ZIM1 rgba8, straight alpha).
#pragma once
#include <cstdint>
#include <map>
#include <string>
#include <utility>
#include <vector>

#include "zpk/zpk.h"

namespace zn::assets {

/** The 16-byte header of an image entry (ZIM1): format (assets.h Format), scale, flags (bit 0: premultiplied alpha), width, height. */
std::string zimHeader(int format, int scale, bool premultiplied, int w, int h);

/** A sprite source to its frames: a PNG, JPEG, WebP or SVG image (one frame, named by its path without @Nx), an Aseprite file (a frame per
 *  frame, an animation of the whole file and one per tag) or a TexturePacker / Aseprite JSON sheet (`sheet`: the bytes of the image it
 *  names). Trimmed to what is not transparent unless `trim` is false. The output is the artifact buildAtlas reads. */
bool importSprite(const std::string& name, const std::string& in, const std::string& sheet, const std::map<std::string, std::string>& opts,
                  std::string& out, std::string& err);
/** A frame another importer cut out of an image (a tile of a tile map's tileset): its full name in the atlas, one texel a point, w x h
 *  straight-alpha texels. */
struct Cut { std::string name; int w = 0, h = 0; std::vector<std::uint8_t> rgba; };
/** importSprite's artifact of `cuts`, trimmed as its frames are. Frames of one name in one atlas must have the same texels (two maps that use
 *  one tile): the atlas keeps one. */
std::string spriteArtifact(std::vector<Cut> cuts);
/** The image a JSON sheet names (meta.image), as a path of the assets directory; empty when `json` is not a sheet. */
std::string sheetImage(const std::string& name, const std::string& json);
/** The frames of `sources` (name, importSprite's artifact) packed into pages of at most `maxSize` texels a side (`pot`: power-of-two sides),
 *  each frame extruded by `extrude` points and `padding` texels apart. */
bool buildAtlas(const std::string& atlas, const std::vector<std::pair<std::string, std::string>>& sources, const std::map<std::string, std::string>& opts,
                std::vector<zpk::Input>& out, std::string& err);

}  // namespace zn::assets
