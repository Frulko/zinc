#pragma once
// ZWD1, a static world for zinc:3d (plugins/3d/index.ts World, plugins/3d/native/render3d.host.cpp): cells on the ground, each with up to
// three levels of detail (0 the finest), each level held by a chunk, a file loaded and freed as one. A chunk's batches are a few large
// buffers whose indices are grouped by cell and, for upright faces, by the compass sector they face, so a frame draws index ranges: the
// cells in view, and of their walls only the sectors that can face the eye (Pocket Tokyo's model, docs/reports/pocket3d-techniques.md).
// examples/tokyo/tools/city-world.py writes one from Pocket Tokyo's pack. Little-endian, every section a multiple of 4 bytes.
//
// Index (`.zworld`):
//   header, 16 B: "ZWD1", u32 version (1), u32 cells, u32 chunks
//   cells, 44 B each: f32 min[3], f32 max[3], f32 reach[2] (the distances from near to mid and from mid to far; 0: the view's), i32 chunk
//          of each level (-1: none)
//   chunks: each u32 level, u32 name length, the name's UTF-8 bytes padded to 4 (relative to the index's directory)
// Chunk (`.zwc`):
//   header, 16 B: "ZWC1", u32 batches, u32 spans, u32 names
//   batches, 84 B each: u32 kind (0 top, 1 wall, 2 solid, 3 open), u32 draw flags (render3d.spec.ts draw), u32 colour 0xRRGGBB, u32
//          emissive, u32 night emissive, i32 texture name, i32 night texture name (-1 none), i32 first cell, u32 cells, u32 groups (1: by
//          cell; 17: by cell, then 16 sectors and the faces that look up or down), u32 first span, u32 vertices (1..65535), u32 indices,
//          f32 origin[3], f32 size[3], f32 uv scale, f32 0
//   names: each u32 length, its UTF-8 bytes padded to 4 (pictures, relative to the index's directory)
//   spans: u32 index offsets: per batch cells x groups + 1, where each group starts in its indices, then their end
//   per batch: its vertices, 20 B each (s16 position over the box: origin + (q + 32768) / 65535 x size; s16 uv x uv scale; RGBA8 colour;
//          s8 normal x 127; 3 bytes 0), then u16 indices padded to 4 (counter-clockwise front faces)
#include <cstdint>

namespace zn::zworld {

inline constexpr std::uint32_t kVersion = 1, kHeader = 16, kCell = 44, kBatch = 84, kVertex = 20, kLevels = 3, kSectors = 16;
inline constexpr std::uint32_t kGroups = kSectors + 1;   // a cell's groups when its faces are ordered by sector
enum Kind : std::uint32_t { Top = 0, Wall = 1, Solid = 2, Open = 3, Kinds = 4 };

}  // namespace zn::zworld
