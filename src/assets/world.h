#pragma once
// Large static worlds (docs/plugins/3d.md "Large static worlds"): the `world` importer turns a glTF or GLB scene, or a `.world.json` listing
// several ({"scenes": ["a.glb", "b.gltf"]}), into a world of zinc:3d (include/zn/zworld.h): the index <stem>.zworld, its chunks
// <stem>.*.zwc, the pictures they name, and <stem>.zworld.json, the provenance (each source node: the cells, levels, chunks and batches its
// triangles went to, for the Inspector and the Blender scene contract's worldSources). cgltf reads the scenes, meshoptimizer 1.3 simplifies
// the levels a scene does not give. Its artifact is a bundle of entries (model.h), as a model's.
//
// The cells are a grid of `cell` metres on x and z; a node no wider than a cell goes whole to the cell of its centre, a wider one (a ground)
// triangle by triangle. Each cell has up to three levels: near (the source), mid and far, given by nodes named <name>_LOD1 and <name>_LOD2 (or
// extras {"level": "mid"}) beside <name>, else simplified from the finest given (`mid` and `far`: the ratios of triangles kept, `error` the
// mid level's largest error relative to the part, five times it for the far one). Chunks: a cell's near level, a block of `block` x `block`
// cells' mid level, the whole world's far level. In a chunk, one batch per material (vertex colours carry the base colour, so materials that
// differ only by it share a batch), its faces ordered by cell, then the 16 compass sectors of the upright ones, then the rest. `levels` (a
// target option, "mid,far"): the levels this target carries; `texture.*`: the texture importer's options for the pictures embedded.
// A scenes entry may also be {"file":"model.glb","id":"stable-instance-id","matrix":[16 column-major affine numbers]}:
// the shared authoring scene importer uses it to preserve instances and their global transforms without copying source geometry.
#include <functional>
#include <map>
#include <string>
#include <vector>

#include "assets/texture.h"

namespace zn::assets {

/** The files a world source reads besides itself (the scenes of a .world.json, their external buffers), relative to the assets directory.
 *  `read` reads one of them (a scene, for its buffers). */
bool worldDeps(const std::string& name, const std::string& in, const std::function<bool(const std::string&, std::string&)>& read,
               std::vector<std::string>& deps, std::string& err);

/** The bundle of the world `name` (its files in `side` by name). */
bool importWorld(const ToolPath& basisu, const std::string& name, const std::string& in, const std::map<std::string, std::string>& side,
                 const std::map<std::string, std::string>& opts, std::string& out, std::string& err);

}  // namespace zn::assets
