#pragma once
// 3D models (ZN-441, docs/reports/zinc-next-assets.md "Models"): the `model` importer runs a glTF or GLB file through gltfpack (meshoptimizer 1.3,
// a pinned tool: zn::tc::ensureGltfpack). For three (`format` glb, the default) it writes a GLB with quantised attributes (KHR_mesh_quantization)
// compressed with EXT_meshopt_compression; for zinc:3d (`format` zmesh) a ZMS1 file (include/zn/zmesh.h) in the renderer's own layout. The
// images embedded in the model go through the texture importer and become entries of their own, which the model names by URI; `lods` adds
// simplified copies. Its artifact is a bundle of entries (splitBundle).
#include <cstdint>
#include <map>
#include <string>
#include <string_view>
#include <vector>

#include "assets/texture.h"

namespace zn::assets {

/** The files a .gltf names besides itself (external buffers), relative to the assets directory; images stay references to assets of their
 *  own. False with `err` when the JSON is not readable. A .glb names none. */
bool modelDeps(const std::string& name, const std::string& in, std::vector<std::string>& deps, std::string& err);

/** The bundle of `in` (the model `name`, its external buffers in `side` by name). Options: `format` (glb or zmesh), `simplify` (the ratio of
 *  triangles kept, 1), `lods` (ratios: an entry <stem>.lod<n>.<ext> each), `compress` (true: EXT_meshopt_compression), `keepNodes` (true: named
 *  nodes keep their place; zmesh flattens the scene anyway), `gltfpack` (more arguments), and `texture.*`: the texture importer's options for
 *  the images it holds (`texture.format` follows the target's profile, as a texture rule's `format` does). */
bool importModel(const ToolPath& gltfpack, const ToolPath& basisu, const std::string& name, const std::string& in, const std::map<std::string, std::string>& side,
                 const std::map<std::string, std::string>& opts, std::string& out, std::string& err);

/** A bundle: "ZAB1", u32 entries, each u32 name length, the name, u8 kind (0 data, 1 image), u32 size; then their bytes in that order. The
 *  main entry first, its LODs, then its textures. */
struct BundleEntry { std::string name; std::uint8_t kind = 0; std::uint64_t offset = 0, size = 0; std::string data; };
/** The entries of a bundle from its first bytes, without their data; false when `head` is shorter than the directory (`need` says how long it
 *  is, 0 when the bundle is damaged). */
bool bundleDirectory(std::string_view head, std::vector<BundleEntry>& out, std::size_t& need);
/** Every entry with its bytes. False when the bundle is damaged. */
bool splitBundle(const std::string& bundle, std::vector<BundleEntry>& out);

}  // namespace zn::assets
