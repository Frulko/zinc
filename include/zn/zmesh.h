#pragma once
// ZMS1, a model for zinc:3d (ZN-441, docs/reports/zinc-next-assets.md "Models"): written by the model importer (src/assets/model.cpp), read by
// zinc:3d (plugins/3d/index.ts walks the parts; render3d.host.cpp and render3d.gl.cpp take each part's arrays as they are: no parsing step).
// Little-endian, every section a multiple of 4 bytes:
//   header, 16 B: "ZMS1", u32 parts, u32 names, u32 0
//   names: each u32 length, its UTF-8 bytes, padded to 4 (texture entries, relative to the model's directory)
//   parts: each a 24-byte header (u32 vertices 1..65535, u32 indices (triangles x 3), u32 flags, u32 colour 0xAARRGGBB, i32 texture name or -1,
//          u32 0), then f32 positions[3v], f32 normals[3v], f32 uvs[2v] (Uvs; origin top-left), u32 colours 0xRRGGBB[v] (Colors),
//          u16 indices[i] padded to 4 (counter-clockwise front faces)
// The scene is flattened at build time: positions and normals are in the model's space.
#include <cstddef>
#include <cstdint>

namespace zn::zmesh {

inline constexpr std::size_t kHeader = 16, kPartHeader = 24;
inline constexpr std::uint32_t kMaxVertices = 65535;
enum Flags : std::uint32_t { Uvs = 1, Colors = 2, DoubleSided = 4, Unlit = 8, Flat = 16, Blend = 32 };   // Flat: the source had no normals (they are 0)

/** The bytes of a part's vertex arrays (its indices follow them). */
inline std::size_t vertexBytes(std::uint32_t vertices, std::uint32_t flags) {
  return static_cast<std::size_t>(vertices) * (24 + (flags & Uvs ? 8 : 0) + (flags & Colors ? 4 : 0));
}
/** The bytes of a part, its header included. */
inline std::size_t partBytes(std::uint32_t vertices, std::uint32_t indices, std::uint32_t flags) {
  return kPartHeader + vertexBytes(vertices, flags) + (static_cast<std::size_t>(indices) * 2 + 3) / 4 * 4;
}

}  // namespace zn::zmesh
