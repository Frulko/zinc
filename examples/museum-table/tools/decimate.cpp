// Decimates a Wavefront OBJ (v, vt, vn, triangles `f v/vt/vn`) to a target triangle count with meshoptimizer, keeping texture seams and normals.
// The sample model of this example was made with it from the Smithsonian's 150 000-triangle file (see ../LICENSES.md and fetch-collection.sh):
//   c++ -O2 -std=c++17 -I third_party/meshoptimizer examples/museum-table/tools/decimate.cpp third_party/meshoptimizer/*.cpp -o /tmp/decimate
//   /tmp/decimate in.obj out.obj 14000
// The output has one v, vt and vn per vertex and faces `f i/i/i`, at most 65535 vertices (the limit of a zinc:3d mesh).
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

#include "meshoptimizer.h"

struct Vertex { float px, py, pz, nx, ny, nz, u, v; };

int main(int argc, char** argv) {
  if (argc < 4) { fprintf(stderr, "usage: decimate in.obj out.obj triangles\n"); return 2; }
  FILE* in = fopen(argv[1], "r");
  if (!in) { fprintf(stderr, "cannot read %s\n", argv[1]); return 1; }
  std::vector<float> pos, uv, nrm;
  std::vector<Vertex> corners;
  char line[512];
  while (fgets(line, sizeof line, in)) {
    float a, b, c;
    if (line[0] == 'v' && line[1] == ' ' && sscanf(line + 2, "%f %f %f", &a, &b, &c) == 3) { pos.push_back(a); pos.push_back(b); pos.push_back(c); }
    else if (line[0] == 'v' && line[1] == 't' && sscanf(line + 3, "%f %f", &a, &b) == 2) { uv.push_back(a); uv.push_back(b); }
    else if (line[0] == 'v' && line[1] == 'n' && sscanf(line + 3, "%f %f %f", &a, &b, &c) == 3) { nrm.push_back(a); nrm.push_back(b); nrm.push_back(c); }
    else if (line[0] == 'f' && line[1] == ' ') {
      int v[3], t[3], n[3];
      if (sscanf(line + 2, "%d/%d/%d %d/%d/%d %d/%d/%d", &v[0], &t[0], &n[0], &v[1], &t[1], &n[1], &v[2], &t[2], &n[2]) != 9) { fprintf(stderr, "only triangles `f v/vt/vn` are read: %s", line); return 1; }
      for (int k = 0; k < 3; k++) {
        const size_t vi = static_cast<size_t>(v[k] - 1) * 3, ti = static_cast<size_t>(t[k] - 1) * 2, ni = static_cast<size_t>(n[k] - 1) * 3;
        if (vi + 2 >= pos.size() || ti + 1 >= uv.size() || ni + 2 >= nrm.size()) { fprintf(stderr, "index out of range: %s", line); return 1; }
        corners.push_back(Vertex{pos[vi], pos[vi + 1], pos[vi + 2], nrm[ni], nrm[ni + 1], nrm[ni + 2], uv[ti], uv[ti + 1]});
      }
    }
  }
  fclose(in);
  if (corners.empty()) { fprintf(stderr, "no faces in %s\n", argv[1]); return 1; }

  // weld the corners that are the same vertex (the source repeats every texture coordinate per face)
  std::vector<unsigned int> remap(corners.size());
  const size_t welded = meshopt_generateVertexRemap(remap.data(), nullptr, corners.size(), corners.data(), corners.size(), sizeof(Vertex));
  std::vector<Vertex> vertices(welded);
  std::vector<unsigned int> indices(corners.size());
  meshopt_remapVertexBuffer(vertices.data(), corners.data(), corners.size(), sizeof(Vertex), remap.data());
  meshopt_remapIndexBuffer(indices.data(), nullptr, corners.size(), remap.data());

  const size_t target = static_cast<size_t>(atoi(argv[3])) * 3;
  const float weights[5] = {0.5f, 0.5f, 0.5f, 2.0f, 2.0f};   // normals, then the texture coordinates (a slipped texture shows more than a facet)
  std::vector<unsigned int> out(indices.size());
  float error = 0;
  out.resize(meshopt_simplifyWithAttributes(out.data(), indices.data(), indices.size(), &vertices[0].px, vertices.size(), sizeof(Vertex),
                                            &vertices[0].nx, sizeof(Vertex), weights, 5, nullptr, target, 0.05f, 0, &error));
  meshopt_optimizeVertexCache(out.data(), out.data(), out.size(), vertices.size());
  std::vector<Vertex> kept(vertices.size());
  kept.resize(meshopt_optimizeVertexFetch(kept.data(), out.data(), out.size(), vertices.data(), vertices.size(), sizeof(Vertex)));
  if (kept.size() > 65535) { fprintf(stderr, "%zu vertices: over the 65535 of a zinc:3d mesh, ask for fewer triangles\n", kept.size()); return 1; }

  FILE* o = fopen(argv[2], "w");
  if (!o) { fprintf(stderr, "cannot write %s\n", argv[2]); return 1; }
  fprintf(o, "# %zu vertices, %zu triangles, decimated from %zu triangles with meshoptimizer %d (relative error %.5f)\n", kept.size(), out.size() / 3,
          indices.size() / 3, MESHOPTIMIZER_VERSION, error);
  for (const Vertex& v : kept) fprintf(o, "v %.5f %.5f %.5f\n", v.px, v.py, v.pz);
  for (const Vertex& v : kept) fprintf(o, "vt %.5f %.5f\n", v.u, v.v);
  for (const Vertex& v : kept) fprintf(o, "vn %.3f %.3f %.3f\n", v.nx, v.ny, v.nz);
  for (size_t i = 0; i < out.size(); i += 3) fprintf(o, "f %u/%u/%u %u/%u/%u %u/%u/%u\n", out[i] + 1, out[i] + 1, out[i] + 1, out[i + 1] + 1, out[i + 1] + 1, out[i + 1] + 1, out[i + 2] + 1, out[i + 2] + 1, out[i + 2] + 1);
  fclose(o);
  printf("%s: %zu vertices, %zu triangles (from %zu), relative error %.5f\n", argv[2], kept.size(), out.size() / 3, indices.size() / 3, error);
  return 0;
}
