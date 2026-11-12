// The museum's OBJ decimator and fixed glTF 2.0 writer (one textured, glazed triangle mesh).
// c++ -O2 -std=c++17 -I third_party/meshoptimizer examples/museum-table/tools/decimate.cpp third_party/meshoptimizer/*.cpp -o /tmp/decimate
// /tmp/decimate in.obj out.obj 12000
// /tmp/decimate tools/source/vase.obj assets/models/vase.glb 12000 vase.jpg
// A target at or above the source count only converts the mesh; it does not simplify it again.
#include <algorithm>
#include <charconv>
#include <cmath>
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <iomanip>
#include <limits>
#include <sstream>
#include <string>
#include <vector>
#include <sys/stat.h>
#include <unistd.h>
#include "meshoptimizer.h"

struct Vertex { float px, py, pz, nx, ny, nz, u, v; };
static_assert(sizeof(Vertex) == 32 && sizeof(float) == 4 && std::numeric_limits<float>::is_iec559, "GLB needs eight packed IEEE float32 attributes");

static bool error(const std::string& message) { std::fprintf(stderr, "%s\n", message.c_str()); return false; }
static bool number(const std::string& word, unsigned& out) {
  const auto result = std::from_chars(word.data(), word.data() + word.size(), out);
  return result.ec == std::errc{} && result.ptr == word.data() + word.size() && out > 0;
}
static bool readObj(const char* path, std::vector<Vertex>& corners) {
  std::ifstream in(path);
  if (!in) return error(std::string("cannot read ") + path);
  std::vector<float> pos, uv, normals;
  char line[4096];
  size_t lineNo = 0;
  while (in.getline(line, sizeof line)) {
    ++lineNo;
    std::istringstream words(line);
    std::string kind;
    words >> kind;
    if (kind == "v" || kind == "vt" || kind == "vn") {
      float x = 0, y = 0, z = 0;
      if (!(words >> x >> y) || (kind != "vt" && !(words >> z)) || !std::isfinite(x) || !std::isfinite(y) || !std::isfinite(z))
        return error("invalid or nonfinite vertex at line " + std::to_string(lineNo));
      std::vector<float>& values = kind == "v" ? pos : kind == "vt" ? uv : normals;
      values.push_back(x); values.push_back(y);
      if (kind != "vt") values.push_back(z);
    } else if (kind == "f") {
      for (int k = 0; k < 3; ++k) {
        std::string word;
        if (!(words >> word)) return error("expected triangle v/vt/vn at line " + std::to_string(lineNo));
        const size_t a = word.find('/'), b = a == std::string::npos ? a : word.find('/', a + 1);
        unsigned p = 0, t = 0, n = 0;
        if (a == std::string::npos || b == std::string::npos || !number(word.substr(0, a), p) || !number(word.substr(a + 1, b - a - 1), t) || !number(word.substr(b + 1), n) ||
            p > pos.size() / 3 || t > uv.size() / 2 || n > normals.size() / 3)
          return error("invalid triangle index at line " + std::to_string(lineNo));
        const size_t pi = size_t(p - 1) * 3, ti = size_t(t - 1) * 2, ni = size_t(n - 1) * 3;
        if (corners.size() >= 3000000) return error("OBJ exceeds one million triangles");
        corners.push_back({pos[pi], pos[pi + 1], pos[pi + 2], normals[ni], normals[ni + 1], normals[ni + 2], uv[ti], uv[ti + 1]});
      }
      std::string extra;
      if (words >> extra && extra.front() != '#') return error("only triangles are read at line " + std::to_string(lineNo));
    }
  }
  if (!in.eof()) return error("cannot read OBJ or line exceeds 4095 bytes");
  if (corners.empty()) return error("OBJ has no triangles");
  return true;
}
static void u32(std::vector<unsigned char>& out, uint32_t value) {
  for (int i = 0; i < 4; ++i) out.push_back(static_cast<unsigned char>(value >> (i * 8)));
}
static void f32(std::vector<unsigned char>& out, float value) {
  uint32_t bits = 0; static_assert(sizeof bits == sizeof value); std::memcpy(&bits, &value, sizeof bits); u32(out, bits);
}
static std::vector<unsigned char> glb(const std::vector<Vertex>& vertices, const std::vector<unsigned>& indices, const std::string& texture) {
  std::vector<unsigned char> bin;
  float lo[3] = {INFINITY, INFINITY, INFINITY}, hi[3] = {-INFINITY, -INFINITY, -INFINITY};
  for (const Vertex& v : vertices) {
    const float position[3] = {v.px, v.py, v.pz};
    for (int k = 0; k < 3; ++k) { lo[k] = std::min(lo[k], position[k]); hi[k] = std::max(hi[k], position[k]); f32(bin, position[k]); }
    const double length = std::sqrt(double(v.nx) * v.nx + double(v.ny) * v.ny + double(v.nz) * v.nz);
    if (length <= 0 || !std::isfinite(length)) { error("GLB needs nonzero finite normals"); return {}; }
    f32(bin, float(v.nx / length)); f32(bin, float(v.ny / length)); f32(bin, float(v.nz / length));
    f32(bin, v.u); f32(bin, 1 - v.v); // OBJ is bottom-left, zinc:3d and glTF texture coordinates are top-left.
  }
  const size_t indexOffset = bin.size();
  for (unsigned index : indices) { bin.push_back(static_cast<unsigned char>(index)); bin.push_back(static_cast<unsigned char>(index >> 8)); }
  const size_t bufferLength = bin.size();
  while (bin.size() % 4) bin.push_back(0);
  std::ostringstream json;
  json << std::setprecision(9)
       << "{\"asset\":{\"version\":\"2.0\",\"generator\":\"Zinc museum decimate\"},\"scene\":0,\"scenes\":[{\"nodes\":[0]}],\"nodes\":[{\"mesh\":0}],"
       << "\"buffers\":[{\"byteLength\":" << bufferLength << "}],\"bufferViews\":[{\"buffer\":0,\"byteLength\":" << indexOffset << ",\"byteStride\":32,\"target\":34962},{\"buffer\":0,\"byteOffset\":" << indexOffset << ",\"byteLength\":" << indices.size() * 2 << ",\"target\":34963}],"
       << "\"accessors\":[{\"bufferView\":0,\"componentType\":5126,\"count\":" << vertices.size() << ",\"type\":\"VEC3\",\"min\":[" << lo[0] << ',' << lo[1] << ',' << lo[2] << "],\"max\":[" << hi[0] << ',' << hi[1] << ',' << hi[2] << "]},"
       << "{\"bufferView\":0,\"byteOffset\":12,\"componentType\":5126,\"count\":" << vertices.size() << ",\"type\":\"VEC3\"},"
       << "{\"bufferView\":0,\"byteOffset\":24,\"componentType\":5126,\"count\":" << vertices.size() << ",\"type\":\"VEC2\"},"
       << "{\"bufferView\":1,\"componentType\":5123,\"count\":" << indices.size() << ",\"type\":\"SCALAR\"}],"
       << "\"images\":[{\"uri\":\"" << texture << "\"}],\"textures\":[{\"source\":0}],\"extensionsUsed\":[\"KHR_materials_specular\"],\"extensionsRequired\":[\"KHR_materials_specular\"],"
       << "\"materials\":[{\"pbrMetallicRoughness\":{\"baseColorTexture\":{\"index\":0},\"metallicFactor\":0,\"roughnessFactor\":" << std::setprecision(17) << 1 - std::sqrt(48.0 / 1000) << "},\"extensions\":{\"KHR_materials_specular\":{\"specularColorFactor\":[" << 38.0 / 255 << ',' << 38.0 / 255 << ',' << 38.0 / 255 << "]}}}],"
       << "\"meshes\":[{\"primitives\":[{\"attributes\":{\"POSITION\":0,\"NORMAL\":1,\"TEXCOORD_0\":2},\"indices\":3,\"material\":0}]}]}";
  std::string text = json.str(); while (text.size() % 4) text.push_back(' ');
  if (text.size() + bin.size() > UINT32_MAX - 28) { error("GLB is too large"); return {}; }
  std::vector<unsigned char> bytes;
  u32(bytes, 0x46546c67); u32(bytes, 2); u32(bytes, uint32_t(28 + text.size() + bin.size()));
  u32(bytes, uint32_t(text.size())); u32(bytes, 0x4e4f534a); bytes.insert(bytes.end(), text.begin(), text.end());
  u32(bytes, uint32_t(bin.size())); u32(bytes, 0x004e4942); bytes.insert(bytes.end(), bin.begin(), bin.end());
  return bytes;
}
static bool publish(const char* path, const std::vector<unsigned char>& bytes) {
  std::string temporary = std::string(path) + ".XXXXXX";
  std::vector<char> name(temporary.begin(), temporary.end()); name.push_back(0);
  const int fd = mkstemp(name.data());
  if (fd < 0) return error(std::string("cannot create output beside ") + path);
  struct Pending { const char* path; ~Pending() { unlink(path); } } pending{name.data()};
  FILE* out = fdopen(fd, "wb");
  if (!out) { close(fd); return error("cannot open temporary output"); }
  const bool written = std::fwrite(bytes.data(), 1, bytes.size(), out) == bytes.size();
  const bool closed = std::fclose(out) == 0;
  if (!written || !closed) return error("cannot write complete output");
  if (std::rename(name.data(), path) != 0) return error(std::string("cannot publish ") + path);
  return true;
}
int main(int argc, char** argv) {
  unsigned triangles = 0;
  if ((argc != 4 && argc != 5) || !number(argv[3], triangles) || triangles > UINT32_MAX / 3) { error("usage: decimate in.obj out.obj triangles | decimate in.obj out.glb triangles texture.jpg"); return 2; }
  const std::string output = argv[2];
  const bool binary = output.size() >= 4 && output.substr(output.size() - 4) == ".glb";
  const std::string texture = argc == 5 ? argv[4] : "";
  if ((binary && (texture.empty() || texture == "." || texture == ".." || texture.find_first_not_of("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.") != std::string::npos)) || (!binary && argc != 4)) { error("GLB needs a relative texture filename (no path or JSON escapes)"); return 2; }
  struct stat inputStat{}, outputStat{};
  if (stat(argv[1], &inputStat) == 0 && stat(argv[2], &outputStat) == 0 && inputStat.st_dev == outputStat.st_dev && inputStat.st_ino == outputStat.st_ino) { error("input and output must be different files"); return 2; }
  // shortcut: regular OBJ inputs are capped at 64 MiB/one million triangles; stream larger collections before raising these bounds.
  if (stat(argv[1], &inputStat) != 0 || !S_ISREG(inputStat.st_mode) || inputStat.st_size <= 0 || inputStat.st_size > 64 * 1024 * 1024) { error("OBJ must be a nonempty regular file of at most 64 MiB"); return 1; }
  std::vector<Vertex> corners;
  if (!readObj(argv[1], corners)) return 1;
  std::vector<unsigned> remap(corners.size()), indices(corners.size());
  const size_t welded = meshopt_generateVertexRemap(remap.data(), nullptr, corners.size(), corners.data(), corners.size(), sizeof(Vertex));
  std::vector<Vertex> vertices(welded);
  meshopt_remapVertexBuffer(vertices.data(), corners.data(), corners.size(), sizeof(Vertex), remap.data());
  meshopt_remapIndexBuffer(indices.data(), nullptr, corners.size(), remap.data());
  std::vector<unsigned> reduced = indices;
  float relativeError = 0;
  if (triangles < indices.size() / 3) {
    const float weights[5] = {0.5f, 0.5f, 0.5f, 2.0f, 2.0f};
    reduced.resize(meshopt_simplifyWithAttributes(reduced.data(), indices.data(), indices.size(), &vertices[0].px, vertices.size(), sizeof(Vertex), &vertices[0].nx, sizeof(Vertex), weights, 5, nullptr, size_t(triangles) * 3, 0.05f, 0, &relativeError));
    meshopt_optimizeVertexCache(reduced.data(), reduced.data(), reduced.size(), vertices.size());
  }
  if (reduced.empty()) { error("simplification produced no triangles"); return 1; }
  std::vector<Vertex> kept(vertices.size());
  kept.resize(meshopt_optimizeVertexFetch(kept.data(), reduced.data(), reduced.size(), vertices.data(), vertices.size(), sizeof(Vertex)));
  if (kept.size() > 65535) { error("more than 65535 vertices; ask for fewer triangles"); return 1; }
  std::vector<unsigned char> bytes;
  if (binary) { bytes = glb(kept, reduced, texture); if (bytes.empty()) return 1; }
  else {
    std::ostringstream obj;
    obj << "# " << kept.size() << " vertices, " << reduced.size() / 3 << " triangles, decimated from " << indices.size() / 3 << " triangles with meshoptimizer " << MESHOPTIMIZER_VERSION << " (relative error " << std::fixed << std::setprecision(5) << relativeError << ")\n";
    for (const Vertex& v : kept) obj << "v " << std::setprecision(5) << v.px << ' ' << v.py << ' ' << v.pz << '\n';
    for (const Vertex& v : kept) obj << "vt " << v.u << ' ' << v.v << '\n';
    for (const Vertex& v : kept) obj << "vn " << std::setprecision(3) << v.nx << ' ' << v.ny << ' ' << v.nz << '\n';
    for (size_t i = 0; i < reduced.size(); i += 3) { obj << 'f'; for (int k = 0; k < 3; ++k) { const unsigned n = reduced[i + k] + 1; obj << ' ' << n << '/' << n << '/' << n; } obj << '\n'; }
    const std::string text = obj.str(); bytes.assign(text.begin(), text.end());
  }
  if (!publish(argv[2], bytes)) return 1;
  std::printf("%s: %zu vertices, %zu triangles (from %zu), relative error %.5f\n", argv[2], kept.size(), reduced.size() / 3, indices.size() / 3, relativeError);
  return 0;
}
