#pragma once
// GPU textures (ZN-439, docs/reports/zinc-next-assets.md "Textures"): the `texture` importer resizes an image for its target (maxSize, pot),
// makes its mipmaps (stb_image_resize2: alpha-weighted, in linear light unless the texture is linear data), premultiplies its alpha and encodes
// it in the format its target's profile prefers: the 16-bit layouts here, the GPU block formats through basis_universal's basisu (UASTC, then
// transcoded per format), or a KTX2 file as basisu writes it for the browser. The result is a ZIM1 entry (include/zn/zim.h) or that KTX2 file.
#include <cstdint>
#include <functional>
#include <map>
#include <string>
#include <string_view>
#include <vector>

namespace zn::assets {

/** The path of basisu, fetched and built on first use (zn::tc::ensureBasisu); false with `err` when it cannot be had. */
using ToolPath = std::function<bool(std::string& path, std::string& err)>;

/** A PNG, JPEG, WebP, BMP, GIF or SVG file to straight-alpha RGBA texels; `scale`: texels a point (an SVG is drawn at `opts` scale, at most
 *  1024 texels wide). */
bool decodeImage(const std::string& name, const std::string& in, const std::map<std::string, std::string>& opts, int& w, int& h, int& scale,
                 std::vector<std::uint8_t>& rgba, std::string& err);

/** `rgba` (w x h, straight alpha, sRGB) resampled to dw x dh. */
void resizeRgba(const std::vector<std::uint8_t>& rgba, int w, int h, std::vector<std::uint8_t>& out, int dw, int dh);

/** The texture of `in`. Options: `format` (formats in preference order, `a|b`: an image with alpha takes the first that has alpha, an opaque
 *  one the first, or a later one without alpha that is smaller), `maxSize`, `pot`, `mipmaps` (true), `premultiply` (true), `linear` (false:
 *  colour in sRGB); for clut8, `colors` (256) and `night` (assets.cpp: a night picture beside it, whose bytes are `night`, quantised with
 *  it into the second palette). `basisu` is asked for only when a block format is chosen. */
bool importTexture(const ToolPath& basisu, const std::string& name, const std::string& in, const std::map<std::string, std::string>& opts,
                   std::string& out, std::string& err, const std::string* night = nullptr);

/** What the report says of an image artifact from its first bytes (512 are enough): its format and the bytes its texels take on the GPU
 *  (every level of a ZIM1 entry; for a KTX2 file, the levels transcoded to 4 x 4 blocks of 16 bytes, or 8 for opaque ETC1S). */
bool describeImage(std::string_view head, std::string& format, std::uint64_t& gpuBytes);

}  // namespace zn::assets
