// Fonts (ZN-442, docs/reports/games/toolchain-assets-loading.md 4.4), private to src/assets: a TrueType or OpenType file of the assets
// directory reduced to its charset with hb-subset, and with `"sdf": "msdf"` a multi-channel distance field atlas of those characters drawn by
// msdfgen (third_party/msdfgen), which zinc:gfx/msdf draws sharp at any size and under any matrix (ImageFlag.Msdf, include/zn/msdf.h).
#pragma once
#include <cstddef>
#include <map>
#include <string>
#include <vector>

namespace zn::assets {

/** The items of the rule option `charset`: a name or a JSON array of names. */
std::vector<std::string> charsetItems(const std::string& option);
/** Whether `item` is a named set: ascii, latin-1, latin-ext, greek, cyrillic, punctuation. Any other item is a glob of files of the assets
 *  directory (the build reads them as the font's side files). */
bool namedCharset(const std::string& item);

/** A font file to its bundle (model.h bundleOf): the font subset to the charset (entry `name`), and with `sdf` "msdf" its atlas (`name`.msdf,
 *  a ZIM1 rgba8 image, straight, the distances in red, green and blue) and the atlas's table (`name`.msdf.json: size, range, ascent, descent,
 *  lineGap in pixels at `size`; glyphs [codepoint, x, y, w, h, left, top, advance]). Options: `charset` (named sets and globs, latin-1 when
 *  absent; a JSON file adds its string values, any other file its text), `sdf` ("msdf" or "none"), `size` (pixels per em of the atlas, 16
 *  to 128, 32). `side`: the charset's files by name. */
bool importFont(const std::string& name, const std::string& in, const std::map<std::string, std::string>& side, const std::map<std::string, std::string>& opts,
                std::string& out, std::string& err);

/** The characters a TrueType file maps (its cmap): the report's `glyphs` of a font. */
std::size_t fontCharacters(const std::string& ttf);

}  // namespace zn::assets
