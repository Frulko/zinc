// cgltf (ZN-119) as an independent reader of the glTF models: prints meshes, triangles, vertices and the world bounding box the way tests/golden/host/gltf_stats.ts
// prints them from the three plugin's loader (the prototype's reader), so the two can be diffed. meshoptimizer's vertex cache optimiser runs on every index buffer and
// must keep the triangles.
#define CGLTF_IMPLEMENTATION
#include "cgltf.h"
#include "meshoptimizer.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <set>
#include <vector>

static void apply(const float* m, const float* p, float* o) {   // column-major 4x4
  for (int r = 0; r < 3; r++) o[r] = m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r];
}

int main(int argc, char** argv) {
  int bad = 0;
  for (int a = 1; a < argc; a++) {
    cgltf_options opt{};
    cgltf_data* d = nullptr;
    if (cgltf_parse_file(&opt, argv[a], &d) != cgltf_result_success || cgltf_load_buffers(&opt, d, argv[a]) != cgltf_result_success) { std::fprintf(stderr, "cannot read %s\n", argv[a]); return 2; }
    long meshes = 0, tris = 0, verts = 0, unique = 0;
    float lo[3] = {INFINITY, INFINITY, INFINITY}, hi[3] = {-INFINITY, -INFINITY, -INFINITY};
    auto count = [](const cgltf_primitive& pr) -> long {
      size_t idx = pr.indices ? pr.indices->count : 0;
      if (!pr.indices) for (cgltf_size k = 0; k < pr.attributes_count; k++) if (pr.attributes[k].type == cgltf_attribute_type_position) idx = pr.attributes[k].data->count;
      if (pr.type == cgltf_primitive_type_triangles) return static_cast<long>(idx / 3);
      if (pr.type == cgltf_primitive_type_triangle_strip || pr.type == cgltf_primitive_type_triangle_fan) return idx >= 3 ? static_cast<long>(idx - 2) : 0;
      return 0;
    };
    for (cgltf_size m = 0; m < d->meshes_count; m++) for (cgltf_size p = 0; p < d->meshes[m].primitives_count; p++) unique += count(d->meshes[m].primitives[p]);   // what the loader reports: each mesh once
    for (cgltf_size n = 0; n < d->nodes_count; n++) {
      const cgltf_node& node = d->nodes[n];
      if (!node.mesh) continue;
      float w[16];
      cgltf_node_transform_world(&node, w);
      for (cgltf_size p = 0; p < node.mesh->primitives_count; p++) {
        const cgltf_primitive& pr = node.mesh->primitives[p];
        const cgltf_accessor* pos = nullptr;
        for (cgltf_size k = 0; k < pr.attributes_count; k++) if (pr.attributes[k].type == cgltf_attribute_type_position) pos = pr.attributes[k].data;
        if (!pos) continue;
        meshes++;
        verts += pos->count;
        size_t idx = pr.indices ? pr.indices->count : pos->count;
        tris += count(pr);
        // the loader's Box3 transforms the corners of the geometry's own box
        float glo[3] = {INFINITY, INFINITY, INFINITY}, ghi[3] = {-INFINITY, -INFINITY, -INFINITY};
        for (cgltf_size i = 0; i < pos->count; i++) {
          float v[3]; cgltf_accessor_read_float(pos, i, v, 3);
          for (int c = 0; c < 3; c++) { glo[c] = std::min(glo[c], v[c]); ghi[c] = std::max(ghi[c], v[c]); }
        }
        for (int c = 0; c < 8; c++) {
          float corner[3] = {c & 1 ? ghi[0] : glo[0], c & 2 ? ghi[1] : glo[1], c & 4 ? ghi[2] : glo[2]}, o[3];
          apply(w, corner, o);
          for (int k = 0; k < 3; k++) { lo[k] = std::min(lo[k], o[k]); hi[k] = std::max(hi[k], o[k]); }
        }
        if (pr.indices && pr.type == cgltf_primitive_type_triangles && idx >= 3) {   // the vertex cache optimiser keeps the set of triangles
          std::vector<unsigned> in(idx), out(idx);
          cgltf_accessor_unpack_indices(pr.indices, in.data(), sizeof(unsigned), idx);
          meshopt_optimizeVertexCache(out.data(), in.data(), idx, pos->count);
          auto key = [](const std::vector<unsigned>& v) { std::multiset<std::vector<unsigned>> s; for (size_t t = 0; t + 2 < v.size(); t += 3) { std::vector<unsigned> tri{v[t], v[t + 1], v[t + 2]}; std::rotate(tri.begin(), std::min_element(tri.begin(), tri.end()), tri.end()); s.insert(tri); } return s; };
          if (key(in) != key(out)) { std::fprintf(stderr, "meshopt_optimizeVertexCache changed the triangles of %s\n", argv[a]); bad++; }
        }
      }
    }
    const char* base = std::strrchr(argv[a], '/'); base = base ? base + 1 : argv[a];
    std::printf("%s meshes=%ld triangles=%ld drawn=%ld vertices=%ld bbox=%.3f,%.3f,%.3f..%.3f,%.3f,%.3f\n", base, meshes, unique, tris, verts, lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]);
    cgltf_free(d);
  }
  return bad ? 1 : 0;
}
