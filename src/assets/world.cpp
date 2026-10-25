// The world importer. See world.h, include/zn/zworld.h and docs/plugins/3d.md "Large static worlds".
#include "assets/world.h"

#include "assets/model.h"
#include "zn/zworld.h"

#include "cgltf.h"   // the implementation is model.cpp's
#include "meshoptimizer.h"
#include "yyjson.h"

#include <algorithm>
#include <array>
#include <cstdio>
#include <tuple>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <memory>
#include <set>

namespace fs = std::filesystem;

namespace zn::assets {
namespace {

using Opts = std::map<std::string, std::string>;
using Side = std::map<std::string, std::string>;

std::string dirOf(const std::string& n) { const auto s = n.rfind('/'); return s == std::string::npos ? std::string() : n.substr(0, s + 1); }
std::string normal(const std::string& p) { return fs::path(p).lexically_normal().generic_string(); }
std::string decoded(const char* uri) {
  std::string s(uri);
  s.resize(cgltf_decode_uri(s.data()));
  return s;
}
double num(const Opts& o, const char* k, double otherwise) {
  const auto it = o.find(k);
  return it == o.end() ? otherwise : std::strtod(it->second.c_str(), nullptr);
}
/** The bytes of a base64 data: URI. */
std::string base64(const char* uri) {
  const char* comma = std::strchr(uri, ',');
  std::string o;
  std::uint32_t acc = 0;
  int bits = 0;
  for (const char* c = comma ? comma + 1 : ""; *c; ++c) {
    const char ch = *c;
    const int v = ch >= 'A' && ch <= 'Z' ? ch - 'A' : ch >= 'a' && ch <= 'z' ? ch - 'a' + 26 : ch >= '0' && ch <= '9' ? ch - '0' + 52 : ch == '+' || ch == '-' ? 62 : ch == '/' || ch == '_' ? 63 : -1;
    if (v < 0) continue;
    acc = acc << 6 | static_cast<std::uint32_t>(v);
    if ((bits += 6) >= 8) { bits -= 8; o += static_cast<char>(acc >> bits & 0xff); }
  }
  return o;
}
bool isManifest(const std::string& name) { return name.size() > 5 && name.compare(name.size() - 5, 5, ".json") == 0; }
/** The scenes a .world.json names, relative to the assets directory. */
bool manifestScenes(const std::string& name, const std::string& in, std::vector<std::string>& out, std::string& err) {
  yyjson_doc* d = yyjson_read(in.data(), in.size(), 0);
  yyjson_val* s = d ? yyjson_obj_get(yyjson_doc_get_root(d), "scenes") : nullptr;
  size_t i, n;
  yyjson_val* v;
  if (yyjson_is_arr(s)) yyjson_arr_foreach(s, i, n, v) if (yyjson_is_str(v)) out.push_back(normal(dirOf(name) + yyjson_get_str(v)));
  yyjson_doc_free(d);
  if (out.empty()) { err = "a world manifest lists its glTF or GLB files: {\"scenes\": [\"city.glb\"]}"; return false; }
  return true;
}

// ---------------------------------------------------------------- reading the scenes
struct V { float p[3], n[3], t[2], c[4]; };
struct Tri { V v[3]; int mat, obj; };
struct Mat { std::string tex; std::uint32_t kind, flags, emis; };
struct Obj { std::string id, node, file, base; int level; float mn[3], mx[3]; std::vector<Tri> tris; };

std::uint32_t byte(float v) { return v <= 0 ? 0u : v >= 1 ? 255u : static_cast<std::uint32_t>(std::lround(v * 255)); }

/** cgltf reads the external buffers from the bytes the build read (`side`), never from the disk. */
cgltf_result readSide(const cgltf_memory_options*, const cgltf_file_options* f, const char* path, cgltf_size* size, void** data) {
  const Side& side = *static_cast<const Side*>(f->user_data);
  const auto it = side.find(normal(path));
  if (it == side.end()) return cgltf_result_file_not_found;
  void* p = std::malloc(it->second.size() ? it->second.size() : 1);
  if (!p) return cgltf_result_out_of_memory;
  std::memcpy(p, it->second.data(), it->second.size());
  *size = it->second.size();
  *data = p;
  return cgltf_result_success;
}
void releaseSide(const cgltf_memory_options*, const cgltf_file_options*, void* data) { std::free(data); }

struct Reader {
  const ToolPath& basisu;
  const Opts& opts;
  std::string dir, stem;   // of the index
  std::vector<Mat> mats;
  std::map<std::string, int> matIds;
  std::vector<Obj> objs;
  std::vector<BundleEntry> pictures;
  std::map<std::string, std::string> pictureOf;   // scene and image index -> the name a chunk gives it

  /** The picture of an image, relative to the index's directory ("" when the texture importer cannot read it). */
  bool picture(const cgltf_data* d, std::size_t scene, const cgltf_image* im, const std::string& file, std::string& out, std::string& err) {
    const std::size_t i = static_cast<std::size_t>(im - d->images);
    const std::string key = std::to_string(scene) + ":" + std::to_string(i);
    if (auto it = pictureOf.find(key); it != pictureOf.end()) { out = it->second; return true; }
    std::string bytes;
    if (im->uri && std::strncmp(im->uri, "data:", 5) != 0) {   // a file of the project, imported by its own rule
      const std::string p = normal(dirOf(file) + decoded(im->uri));
      if (p.compare(0, dir.size(), dir) != 0) { err = "image " + p + " is not under " + (dir.empty() ? "the assets directory" : dir) + ", where the world is"; return false; }
      out = p.substr(dir.size());
    } else {
      if (im->buffer_view && im->buffer_view->buffer->data)
        bytes.assign(static_cast<const char*>(im->buffer_view->buffer->data) + im->buffer_view->offset, im->buffer_view->size);
      else if (im->uri) bytes = base64(im->uri);
      const bool png = bytes.size() > 8 && bytes.compare(0, 8, "\x89PNG\r\n\x1a\n") == 0;
      const bool jpg = bytes.size() > 3 && static_cast<unsigned char>(bytes[0]) == 0xFF && static_cast<unsigned char>(bytes[1]) == 0xD8;
      if (!png && !jpg) { out.clear(); pictureOf[key] = out; return true; }
      out = stem + "." + (scene ? "s" + std::to_string(scene) + "." : std::string()) + std::to_string(i) + (png ? ".png" : ".jpg");
      Opts t;
      for (const auto& [k, v] : opts) if (k.rfind("texture.", 0) == 0) t[k.substr(8)] = v;
      BundleEntry e{dir + out, 1, 0, 0, {}};
      if (!importTexture(basisu, e.name, bytes, t, e.data, err)) { err = "image " + std::to_string(i) + ": " + err; return false; }
      pictures.push_back(std::move(e));
    }
    pictureOf[key] = out;
    return true;
  }

  bool material(const cgltf_data* d, std::size_t scene, const cgltf_material* m, const std::string& file, int& id, std::string& err) {
    std::string tex;
    const cgltf_texture* t = m && m->has_pbr_metallic_roughness ? m->pbr_metallic_roughness.base_color_texture.texture : nullptr;
    if (t && t->image && !picture(d, scene, t->image, file, tex, err)) return false;
    const bool dbl = m && m->double_sided, blend = m && m->alpha_mode == cgltf_alpha_mode_blend;
    const float a = m && m->has_pbr_metallic_roughness ? m->pbr_metallic_roughness.base_color_factor[3] : 1;
    // the kinds a console draws in its own layout (render3d.psp.cpp): a picture's uvs live in a wall; what blends goes last
    const std::uint32_t kind = blend ? zworld::Open : !tex.empty() ? zworld::Wall : dbl ? zworld::Open : zworld::Solid;
    const std::uint32_t flags = 1u | (m && m->unlit ? 4u : 0u) | (dbl ? 8u : 0u) | (blend ? (1u << 6) | (byte(a) << 8) : 0u);   // vertex colours, render3d.spec.ts draw
    const float* e = m ? m->emissive_factor : nullptr;
    const std::uint32_t emis = e ? byte(e[0]) << 16 | byte(e[1]) << 8 | byte(e[2]) : 0;
    const std::string key = tex + "|" + std::to_string(kind) + "|" + std::to_string(flags) + "|" + std::to_string(emis);
    const auto [it, fresh] = matIds.emplace(key, static_cast<int>(mats.size()));
    if (fresh) mats.push_back({tex, kind, flags, emis});
    id = it->second;
    return true;
  }

  bool node(const cgltf_data* d, std::size_t scene, const cgltf_node* nd, const std::string& file, int depth, std::string& err) {
    if (nd->mesh) {
      Obj o;
      o.file = file;
      o.node = nd->name ? nd->name : "node" + std::to_string(nd - d->nodes);
      o.id = o.node;
      o.base = o.node;
      o.level = 0;
      if (o.base.size() > 5) {   // <name>_LOD1 (Unity, Unreal and Godot's spelling)
        std::string tail = o.base.substr(o.base.size() - 5);
        for (char& c : tail) c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
        if (tail.compare(0, 4, "_LOD") == 0 && tail[4] >= '0' && tail[4] <= '2') { o.level = tail[4] - '0'; o.base.resize(o.base.size() - 5); }
      }
      if (nd->extras.data) {   // {"id": "<the authoring id>", "level": "near" | "mid" | "far" | 0..2}
        yyjson_doc* x = yyjson_read(nd->extras.data, std::strlen(nd->extras.data), 0);
        yyjson_val* r = x ? yyjson_doc_get_root(x) : nullptr;
        if (yyjson_val* v = yyjson_obj_get(r, "id"); yyjson_is_str(v)) o.id = yyjson_get_str(v);
        if (yyjson_val* v = yyjson_obj_get(r, "level")) {
          const std::string s = yyjson_is_str(v) ? yyjson_get_str(v) : "";
          o.level = yyjson_is_num(v) ? std::clamp(static_cast<int>(yyjson_get_num(v)), 0, 2) : s == "mid" ? 1 : s == "far" ? 2 : 0;
        }
        yyjson_doc_free(x);
      }
      float m[16];
      cgltf_node_transform_world(nd, m);
      const float det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
      const float sg = det < 0 ? -1.0f : 1.0f;
      const float cof[9] = {m[5] * m[10] - m[6] * m[9], m[6] * m[8] - m[4] * m[10], m[4] * m[9] - m[5] * m[8],
                            m[2] * m[9] - m[1] * m[10], m[0] * m[10] - m[2] * m[8], m[1] * m[8] - m[0] * m[9],
                            m[1] * m[6] - m[2] * m[5], m[2] * m[4] - m[0] * m[6], m[0] * m[5] - m[1] * m[4]};
      for (cgltf_size pi = 0; pi < nd->mesh->primitives_count; ++pi) {
        const cgltf_primitive& prim = nd->mesh->primitives[pi];
        if (prim.type != cgltf_primitive_type_triangles && prim.type != cgltf_primitive_type_triangle_strip && prim.type != cgltf_primitive_type_triangle_fan) continue;
        const cgltf_accessor *pa = nullptr, *na = nullptr, *ta = nullptr, *ca = nullptr;
        for (cgltf_size i = 0; i < prim.attributes_count; ++i) {
          const cgltf_attribute& a = prim.attributes[i];
          if (a.type == cgltf_attribute_type_position) pa = a.data;
          else if (a.type == cgltf_attribute_type_normal) na = a.data;
          else if (a.type == cgltf_attribute_type_texcoord && a.index == 0) ta = a.data;
          else if (a.type == cgltf_attribute_type_color && a.index == 0) ca = a.data;
        }
        if (!pa || !pa->count) continue;
        int mat = 0;
        if (!material(d, scene, prim.material, file, mat, err)) return false;
        const std::size_t n = pa->count, cc = ca ? cgltf_num_components(ca->type) : 0;
        std::vector<float> P(n * 3), N, T, C;
        cgltf_accessor_unpack_floats(pa, P.data(), P.size());
        if (na && na->count >= n) { N.resize(n * 3); cgltf_accessor_unpack_floats(na, N.data(), N.size()); }
        if (ta && ta->count >= n && !mats[static_cast<std::size_t>(mat)].tex.empty()) { T.resize(n * 2); cgltf_accessor_unpack_floats(ta, T.data(), T.size()); }
        if (ca && ca->count >= n && (cc == 3 || cc == 4)) { C.resize(n * cc); cgltf_accessor_unpack_floats(ca, C.data(), C.size()); }
        const cgltf_material* mt = prim.material;
        const cgltf_texture_view* tv = mt && mt->has_pbr_metallic_roughness ? &mt->pbr_metallic_roughness.base_color_texture : nullptr;
        if (!T.empty() && tv && tv->has_transform) {   // KHR_texture_transform
          const cgltf_texture_transform& x = tv->transform;
          const float c = std::cos(x.rotation), s = std::sin(x.rotation);
          for (std::size_t i = 0; i < n; ++i) {
            const float u = T[i * 2] * x.scale[0], v = T[i * 2 + 1] * x.scale[1];
            T[i * 2] = x.offset[0] + c * u + s * v;
            T[i * 2 + 1] = x.offset[1] - s * u + c * v;
          }
        }
        const float* f = mt && mt->has_pbr_metallic_roughness ? mt->pbr_metallic_roughness.base_color_factor : nullptr;
        auto vertex = [&](std::uint32_t i) {
          V v{};
          const float* q = &P[i * 3];
          for (int r = 0; r < 3; ++r) v.p[r] = m[r] * q[0] + m[4 + r] * q[1] + m[8 + r] * q[2] + m[12 + r];
          if (!N.empty()) {
            const float* w = &N[i * 3];
            for (int r = 0; r < 3; ++r) v.n[r] = sg * (cof[r * 3] * w[0] + cof[r * 3 + 1] * w[1] + cof[r * 3 + 2] * w[2]);
            const float l = std::sqrt(v.n[0] * v.n[0] + v.n[1] * v.n[1] + v.n[2] * v.n[2]);
            for (float& c : v.n) c = l > 0 ? c / l : 0;
          }
          if (!T.empty()) { v.t[0] = T[i * 2]; v.t[1] = T[i * 2 + 1]; }
          for (int k = 0; k < 4; ++k) v.c[k] = (C.empty() ? 1.0f : k < static_cast<int>(cc) ? C[i * cc + k] : 1.0f) * (f ? f[k] : 1.0f);
          return v;
        };
        std::vector<std::uint32_t> ix;
        if (prim.indices) for (cgltf_size i = 0; i < prim.indices->count; ++i) ix.push_back(static_cast<std::uint32_t>(cgltf_accessor_read_index(prim.indices, i)));
        else for (std::size_t i = 0; i < n; ++i) ix.push_back(static_cast<std::uint32_t>(i));
        for (std::size_t i = 0; i + 2 < ix.size(); i += prim.type == cgltf_primitive_type_triangles ? 3 : 1) {
          std::uint32_t a = ix[i], b = ix[i + 1], c = ix[i + 2];
          if (prim.type == cgltf_primitive_type_triangle_strip && (i & 1)) std::swap(a, b);
          if (prim.type == cgltf_primitive_type_triangle_fan) a = ix[0];
          if (a >= n || b >= n || c >= n) continue;
          if (det < 0) std::swap(b, c);
          Tri t{{vertex(a), vertex(b), vertex(c)}, mat, static_cast<int>(objs.size())};
          if (N.empty()) {   // no normals: the face's
            float u[3], w[3], fn[3];
            for (int r = 0; r < 3; ++r) { u[r] = t.v[1].p[r] - t.v[0].p[r]; w[r] = t.v[2].p[r] - t.v[0].p[r]; }
            fn[0] = u[1] * w[2] - u[2] * w[1]; fn[1] = u[2] * w[0] - u[0] * w[2]; fn[2] = u[0] * w[1] - u[1] * w[0];
            const float l = std::sqrt(fn[0] * fn[0] + fn[1] * fn[1] + fn[2] * fn[2]);
            for (V& v : t.v) for (int r = 0; r < 3; ++r) v.n[r] = l > 0 ? fn[r] / l : 0;
          }
          o.tris.push_back(t);
        }
      }
      if (!o.tris.empty()) {
        for (int a = 0; a < 3; ++a) { o.mn[a] = 1e30f; o.mx[a] = -1e30f; }
        for (const Tri& t : o.tris) for (const V& v : t.v) for (int a = 0; a < 3; ++a) { o.mn[a] = std::min(o.mn[a], v.p[a]); o.mx[a] = std::max(o.mx[a], v.p[a]); }
        objs.push_back(std::move(o));
      }
    }
    if (depth < 64) for (cgltf_size i = 0; i < nd->children_count; ++i) if (!node(d, scene, nd->children[i], file, depth + 1, err)) return false;
    return true;
  }

  bool scene(std::size_t index, const std::string& file, const std::string& bytes, const Side& side, std::string& err) {
    cgltf_options o{};
    o.file.read = readSide;
    o.file.release = releaseSide;
    o.file.user_data = const_cast<Side*>(&side);
    cgltf_data* raw = nullptr;
    if (cgltf_parse(&o, bytes.data(), bytes.size(), &raw) != cgltf_result_success) { err = file + ": not glTF or GLB"; return false; }
    std::unique_ptr<cgltf_data, decltype(&cgltf_free)> data(raw, cgltf_free);
    if (cgltf_load_buffers(&o, raw, file.c_str()) != cgltf_result_success) { err = file + ": cannot read its buffers"; return false; }
    const cgltf_scene* s = raw->scene ? raw->scene : raw->scenes_count ? &raw->scenes[0] : nullptr;
    if (s) { for (cgltf_size i = 0; i < s->nodes_count; ++i) if (!node(raw, index, s->nodes[i], file, 0, err)) return false; }
    else for (cgltf_size i = 0; i < raw->nodes_count; ++i) if (!raw->nodes[i].parent && !node(raw, index, &raw->nodes[i], file, 0, err)) return false;
    return true;
  }
};

// ---------------------------------------------------------------- levels
/** `tris` with `ratio` of its triangles kept (meshoptimizer's simplifier; its borders stay where they are, so cells still meet). */
std::vector<Tri> simplified(const std::vector<Tri>& tris, double ratio, float error) {
  if (tris.empty() || ratio >= 1) return tris;
  std::vector<V> corners;
  corners.reserve(tris.size() * 3);
  for (const Tri& t : tris) for (const V& v : t.v) corners.push_back(v);
  std::vector<unsigned> remap(corners.size());
  const std::size_t nv = meshopt_generateVertexRemap(remap.data(), nullptr, corners.size(), corners.data(), corners.size(), sizeof(V));
  std::vector<V> verts(nv);
  meshopt_remapVertexBuffer(verts.data(), corners.data(), corners.size(), sizeof(V), remap.data());
  std::vector<unsigned> idx(remap), out(remap.size());
  const std::size_t target = static_cast<std::size_t>(static_cast<double>(idx.size() / 3) * ratio) * 3;
  out.resize(meshopt_simplify(out.data(), idx.data(), idx.size(), verts[0].p, nv, sizeof(V), target, error, meshopt_SimplifyLockBorder, nullptr));
  std::vector<Tri> r;
  for (std::size_t i = 0; i + 2 < out.size(); i += 3) r.push_back(Tri{{verts[out[i]], verts[out[i + 1]], verts[out[i + 2]]}, tris[0].mat, -1});
  return r;
}

// ---------------------------------------------------------------- chunks
void put32(std::string& o, std::uint32_t v) { for (int i = 0; i < 4; ++i) o += static_cast<char>(v >> (8 * i) & 0xff); }
void putf(std::string& o, float f) { std::uint32_t v; std::memcpy(&v, &f, 4); put32(o, v); }
void pad4(std::string& o) { while (o.size() % 4) o += '\0'; }

/** One cell's triangles of one material at one level, and the source nodes they come from. */
struct Part { int cell, mat; std::vector<Tri> tris; std::set<int> objs; };
/** A part, or a piece of one (at most 65535 vertices): its vertices in the order its indices first use them, its faces by group. */
struct Piece { int cell; std::vector<V> v; std::vector<std::uint16_t> idx; std::uint32_t count[zworld::kGroups] = {}; const Part* part; };

int groupOf(const Tri& t, bool dbl) {
  if (dbl) return zworld::kSectors;   // seen from both sides: never left out
  float u[3], w[3];
  for (int r = 0; r < 3; ++r) { u[r] = t.v[1].p[r] - t.v[0].p[r]; w[r] = t.v[2].p[r] - t.v[0].p[r]; }
  const float nx = u[1] * w[2] - u[2] * w[1], ny = u[2] * w[0] - u[0] * w[2], nz = u[0] * w[1] - u[1] * w[0];
  const float l = std::sqrt(nx * nx + ny * ny + nz * nz);
  if (l <= 0 || std::fabs(ny / l) >= 0.2f) return zworld::kSectors;   // looks up or down
  // the sector its normal looks to: sector k faces -pi + (k + 0.5) 2 pi / 16 (city-world.py sector_normal)
  const int k = static_cast<int>(std::floor((std::atan2(nz, nx) + 3.14159265358979) / (6.28318530717959 / zworld::kSectors)));
  return std::clamp(k, 0, static_cast<int>(zworld::kSectors) - 1);
}

std::vector<Piece> pieces(const Part& p, const Mat& m) {
  std::vector<std::pair<int, const Tri*>> order;
  for (const Tri& t : p.tris) order.push_back({groupOf(t, m.flags & 8), &t});
  std::stable_sort(order.begin(), order.end(), [](const auto& a, const auto& b) { return a.first < b.first; });
  std::vector<Piece> out;
  std::map<std::string, std::uint16_t> at;
  for (const auto& [g, t] : order) {
    if (out.empty() || out.back().v.size() + 3 > 65535) { out.push_back(Piece{p.cell, {}, {}, {}, &p}); at.clear(); }
    Piece& pc = out.back();
    for (const V& v : t->v) {
      const std::string key(reinterpret_cast<const char*>(&v), sizeof v);
      auto [it, fresh] = at.emplace(key, static_cast<std::uint16_t>(pc.v.size()));
      if (fresh) pc.v.push_back(v);
      pc.idx.push_back(it->second);
    }
    ++pc.count[g];
  }
  return out;
}

/** Provenance: a node's triangles at a level of a cell, in a batch of a chunk. */
struct Where { int obj, cell, level; std::string chunk; int batch; };

/** A chunk (zworld.h ZWC1) of `parts`, ordered by material then cell. */
std::string chunk(const std::vector<Part>& parts, const std::vector<Mat>& mats, int level, const std::string& name, std::vector<Where>& where) {
  struct Batch { int mat; std::vector<Piece> ps; std::size_t nv = 0; };
  std::vector<Batch> batches;
  for (const Part& p : parts)
    for (Piece& pc : pieces(p, mats[static_cast<std::size_t>(p.mat)])) {
      Batch* b = batches.empty() ? nullptr : &batches.back();
      if (!b || b->mat != p.mat || b->ps.back().cell >= pc.cell || b->nv + pc.v.size() > 65535) { batches.push_back({p.mat, {}, 0}); b = &batches.back(); }
      b->nv += pc.v.size();
      b->ps.push_back(std::move(pc));
    }
  std::vector<std::string> names;
  std::string recs, spans, data;
  std::uint32_t nspans = 0;
  for (std::size_t bi = 0; bi < batches.size(); ++bi) {
    const Batch& b = batches[bi];
    const Mat& m = mats[static_cast<std::size_t>(b.mat)];
    float lo[3] = {1e30f, 1e30f, 1e30f}, hi[3] = {-1e30f, -1e30f, -1e30f}, uvMax = 0;
    for (const Piece& pc : b.ps) for (const V& v : pc.v) {
      for (int a = 0; a < 3; ++a) { lo[a] = std::min(lo[a], v.p[a]); hi[a] = std::max(hi[a], v.p[a]); }
      uvMax = std::max({uvMax, std::fabs(v.t[0]), std::fabs(v.t[1])});
    }
    float size[3];
    for (int a = 0; a < 3; ++a) size[a] = std::max(hi[a] - lo[a], 1e-3f);
    const float us = std::max(uvMax, 1e-6f) / 32767;
    const int first = b.ps.front().cell, cells = b.ps.back().cell - first + 1;
    std::int32_t tex = -1;
    if (!m.tex.empty()) {
      auto it = std::find(names.begin(), names.end(), m.tex);
      tex = static_cast<std::int32_t>(it - names.begin());
      if (it == names.end()) names.push_back(m.tex);
    }
    std::string vb, ib;
    std::uint32_t cur = 0;
    std::size_t k = 0;
    const std::uint32_t firstSpan = nspans;
    for (int c = first; c < first + cells; ++c) {
      const Piece* pc = k < b.ps.size() && b.ps[k].cell == c ? &b.ps[k++] : nullptr;
      for (std::uint32_t g = 0; g < zworld::kGroups; ++g) { put32(spans, cur); ++nspans; if (pc) cur += pc->count[g] * 3; }
      if (!pc) continue;
      const std::uint16_t base = static_cast<std::uint16_t>(vb.size() / zworld::kVertex);
      for (const V& v : pc->v) {
        auto s16 = [&](std::int32_t q) { q = std::clamp(q, -32768, 32767); vb += static_cast<char>(q & 0xff); vb += static_cast<char>((q >> 8) & 0xff); };
        for (int a = 0; a < 3; ++a) s16(static_cast<std::int32_t>(std::lround((v.p[a] - lo[a]) / size[a] * 65535)) - 32768);
        s16(static_cast<std::int32_t>(std::lround(v.t[0] / us)));
        s16(static_cast<std::int32_t>(std::lround(v.t[1] / us)));
        for (int ch = 0; ch < 4; ++ch) vb += static_cast<char>(byte(v.c[ch]));
        for (int a = 0; a < 3; ++a) vb += static_cast<char>(static_cast<std::int8_t>(std::clamp(std::lround(v.n[a] * 127), -127L, 127L)));
        vb.append(3, '\0');
      }
      for (std::uint16_t i : pc->idx) { const std::uint16_t x = static_cast<std::uint16_t>(base + i); ib += static_cast<char>(x & 0xff); ib += static_cast<char>(x >> 8); }
      for (int o : pc->part->objs) where.push_back({o, c, level, name, static_cast<int>(bi)});
    }
    put32(spans, cur); ++nspans;
    for (std::uint32_t v : {m.kind, m.flags, 0xffffffu, m.emis, m.emis}) put32(recs, v);
    put32(recs, static_cast<std::uint32_t>(tex)); put32(recs, 0xffffffffu);   // no night picture
    put32(recs, static_cast<std::uint32_t>(first)); put32(recs, static_cast<std::uint32_t>(cells)); put32(recs, zworld::kGroups);
    put32(recs, firstSpan); put32(recs, static_cast<std::uint32_t>(vb.size() / zworld::kVertex)); put32(recs, cur);
    for (float f : {lo[0], lo[1], lo[2], size[0], size[1], size[2], us, 0.0f}) putf(recs, f);
    data += vb + ib;
    pad4(data);
  }
  std::string out = "ZWC1";
  put32(out, static_cast<std::uint32_t>(batches.size())); put32(out, nspans); put32(out, static_cast<std::uint32_t>(names.size()));
  out += recs;
  for (const std::string& n : names) { put32(out, static_cast<std::uint32_t>(n.size())); out += n; pad4(out); }
  return out + spans + data;
}

std::string jsonString(const std::string& s) {
  std::string o = "\"";
  for (char c : s) {
    if (c == '"' || c == '\\') { o += '\\'; o += c; }
    else if (static_cast<unsigned char>(c) < 0x20) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", c); o += b; }
    else o += c;
  }
  return o + "\"";
}

}  // namespace

bool worldDeps(const std::string& name, const std::string& in, const std::function<bool(const std::string&, std::string&)>& read,
               std::vector<std::string>& deps, std::string& err) {
  if (!isManifest(name)) return modelDeps(name, in, deps, err);
  std::vector<std::string> scenes;
  if (!manifestScenes(name, in, scenes, err)) return false;
  for (const std::string& s : scenes) {
    std::string bytes;
    if (!read(s, bytes)) { err = "cannot read " + s + ", which it names"; return false; }
    deps.push_back(s);
    if (!modelDeps(s, bytes, deps, err)) { err = s + ": " + err; return false; }
  }
  std::sort(deps.begin(), deps.end());
  deps.erase(std::unique(deps.begin(), deps.end()), deps.end());
  return true;
}

bool importWorld(const ToolPath& basisu, const std::string& name, const std::string& in, const Side& side, const Opts& opts, std::string& out, std::string& err) {
  const double cell = num(opts, "cell", 128), ratio[3] = {1, num(opts, "mid", 0.3), num(opts, "far", 0.08)};
  const float error = static_cast<float>(num(opts, "error", 0.02));
  const int block = static_cast<int>(num(opts, "block", 4));
  if (!(cell > 0) || block < 1 || !(ratio[1] > 0 && ratio[1] <= 1) || !(ratio[2] > 0 && ratio[2] <= 1)) {
    err = "a world's cell (metres), block (cells), mid and far (ratios in (0, 1]) must be positive";
    return false;
  }
  const std::string lv = opts.count("levels") ? opts.at("levels") : "near,mid,far";
  const bool carry[3] = {lv.find("near") != std::string::npos, lv.find("mid") != std::string::npos, lv.find("far") != std::string::npos};
  if (!carry[0] && !carry[1] && !carry[2]) { err = "levels names none of near, mid and far"; return false; }

  std::string stem = name.substr(dirOf(name).size());
  for (const char* ext : {".world.json", ".json", ".glb", ".gltf"})
    if (stem.size() > std::strlen(ext) && stem.compare(stem.size() - std::strlen(ext), std::strlen(ext), ext) == 0) { stem.resize(stem.size() - std::strlen(ext)); break; }
  Reader rd{basisu, opts, dirOf(name), stem, {}, {}, {}, {}, {}};
  if (isManifest(name)) {
    std::vector<std::string> scenes;
    if (!manifestScenes(name, in, scenes, err)) return false;
    for (std::size_t i = 0; i < scenes.size(); ++i) {
      const auto it = side.find(scenes[i]);
      if (it == side.end()) { err = "cannot read " + scenes[i] + ", which it names"; return false; }
      if (!rd.scene(i, scenes[i], it->second, side, err)) return false;
    }
  } else if (!rd.scene(0, name, in, side, err)) return false;
  if (rd.objs.empty()) { err = "no triangles in its scenes"; return false; }

  // the grid: from the scene's lowest corner, on multiples of the cell
  float lo[2] = {1e30f, 1e30f};
  for (const Obj& o : rd.objs) { lo[0] = std::min(lo[0], o.mn[0]); lo[1] = std::min(lo[1], o.mn[2]); }
  const double x0 = std::floor(lo[0] / cell) * cell, z0 = std::floor(lo[1] / cell) * cell;
  auto cellOf = [&](float x, float z) { return std::make_pair(static_cast<int>(std::floor((x - x0) / cell)), static_cast<int>(std::floor((z - z0) / cell))); };
  // each (cell, level, material): the triangles given at that level, and those to simplify from a finer one
  struct Bin { std::vector<Tri> given, from[3]; std::set<int> objs; };
  std::map<std::pair<int, int>, std::map<std::pair<int, int>, Bin>> grid;   // (x, z) -> (level, material) -> bin
  std::map<std::string, std::vector<int>> bases;
  for (std::size_t i = 0; i < rd.objs.size(); ++i) bases[rd.objs[i].file + "\n" + rd.objs[i].base].push_back(static_cast<int>(i));
  for (const auto& [base, members] : bases) {
    int byLevel[3] = {-1, -1, -1}, finest = 3;
    for (int i : members) { const int l = rd.objs[static_cast<std::size_t>(i)].level; if (byLevel[l] < 0) byLevel[l] = i; finest = std::min(finest, l); }
    const Obj& head = rd.objs[static_cast<std::size_t>(byLevel[finest])];
    const bool whole = head.mx[0] - head.mn[0] <= cell && head.mx[2] - head.mn[2] <= cell;
    const auto home = cellOf((head.mn[0] + head.mx[0]) / 2, (head.mn[2] + head.mx[2]) / 2);
    for (int l = 0; l < 3; ++l) {
      if (!carry[l]) continue;
      int src = l;   // the level given, else the nearest finer one given, else the finest
      while (src >= 0 && byLevel[src] < 0) --src;
      if (src < 0) src = finest;
      const Obj& o = rd.objs[static_cast<std::size_t>(byLevel[src])];
      for (const Tri& t : o.tris) {
        const auto c = whole ? home : cellOf((t.v[0].p[0] + t.v[1].p[0] + t.v[2].p[0]) / 3, (t.v[0].p[2] + t.v[1].p[2] + t.v[2].p[2]) / 3);
        Bin& b = grid[c][{l, t.mat}];
        (src < l ? b.from[src] : b.given).push_back(t);
        b.objs.insert(t.obj);
      }
    }
  }
  // the cells with something in them, a block's in a row (a mid chunk holds a run of cells), and their levels' triangles
  struct Cell { std::pair<int, int> at; int blockX, blockZ; float mn[3], mx[3]; std::vector<Part> parts[3]; };
  std::vector<Cell> cells;
  for (auto& [at, bins] : grid) cells.push_back(Cell{at, at.first >= 0 ? at.first / block : 0, at.second >= 0 ? at.second / block : 0, {1e30f, 1e30f, 1e30f}, {-1e30f, -1e30f, -1e30f}, {}});
  auto blockKey = [&](const Cell& c) { return std::make_tuple(c.blockZ, c.blockX, c.at.second, c.at.first); };
  std::sort(cells.begin(), cells.end(), [&](const Cell& a, const Cell& b) { return blockKey(a) < blockKey(b); });
  for (int ci = 0; ci < static_cast<int>(cells.size()); ++ci) {
    Cell& c = cells[static_cast<std::size_t>(ci)];
    for (auto& [lm, bin] : grid[c.at]) {
      Part p{ci, lm.second, std::move(bin.given), std::move(bin.objs)};
      for (int s = 0; s < lm.first; ++s) {
        for (const Tri& t : bin.from[s]) for (const V& v : t.v) for (int a = 0; a < 3; ++a) { c.mn[a] = std::min(c.mn[a], v.p[a]); c.mx[a] = std::max(c.mx[a], v.p[a]); }
        const std::vector<Tri> r = simplified(bin.from[s], ratio[lm.first] / ratio[s], lm.first == 2 ? std::min(1.0f, error * 5) : error);
        p.tris.insert(p.tris.end(), r.begin(), r.end());
      }
      for (const Tri& t : p.tris) for (const V& v : t.v) for (int a = 0; a < 3; ++a) { c.mn[a] = std::min(c.mn[a], v.p[a]); c.mx[a] = std::max(c.mx[a], v.p[a]); }
      if (!p.tris.empty()) c.parts[lm.first].push_back(std::move(p));
    }
  }
  // the chunks: a cell's near level, a block's mid level, the world's far level; their parts ordered by material, then cell
  std::vector<BundleEntry> entries(1);
  std::vector<std::pair<std::uint32_t, std::string>> chunks;   // level, name relative to the index
  std::vector<std::array<std::int32_t, 3>> chunkOf(cells.size(), {-1, -1, -1});
  std::vector<Where> where;
  auto emit = [&](int level, const std::string& file, std::size_t from, std::size_t to) {
    std::vector<Part> parts;
    for (std::size_t i = from; i < to; ++i) for (Part& p : cells[i].parts[level]) parts.push_back(std::move(p));
    if (parts.empty()) return;
    std::stable_sort(parts.begin(), parts.end(), [](const Part& a, const Part& b) { return a.mat < b.mat; });
    entries.push_back({rd.dir + file, 0, 0, 0, chunk(parts, rd.mats, level, file, where)});
    for (std::size_t i = from; i < to; ++i) chunkOf[i][static_cast<std::size_t>(level)] = static_cast<std::int32_t>(chunks.size());
    chunks.push_back({static_cast<std::uint32_t>(level), file});
  };
  if (carry[2]) emit(2, stem + ".far.zwc", 0, cells.size());
  if (carry[1])
    for (std::size_t i = 0; i < cells.size();) {
      std::size_t j = i;
      while (j < cells.size() && cells[j].blockX == cells[i].blockX && cells[j].blockZ == cells[i].blockZ) ++j;
      emit(1, stem + ".b" + std::to_string(cells[i].blockX) + "_" + std::to_string(cells[i].blockZ) + ".mid.zwc", i, j);
      i = j;
    }
  if (carry[0]) for (std::size_t i = 0; i < cells.size(); ++i) emit(0, stem + ".c" + std::to_string(i) + ".near.zwc", i, i + 1);
  // the index
  std::string& idx = entries[0].data;
  entries[0].name = rd.dir + stem + ".zworld";
  idx = "ZWD1";
  put32(idx, zworld::kVersion); put32(idx, static_cast<std::uint32_t>(cells.size())); put32(idx, static_cast<std::uint32_t>(chunks.size()));
  for (std::size_t i = 0; i < cells.size(); ++i) {
    for (float f : cells[i].mn) putf(idx, f);
    for (float f : cells[i].mx) putf(idx, f);
    putf(idx, 0); putf(idx, 0);   // the view's reaches
    for (std::int32_t k : chunkOf[i]) put32(idx, static_cast<std::uint32_t>(k));
  }
  for (const auto& [level, file] : chunks) { put32(idx, level); put32(idx, static_cast<std::uint32_t>(file.size())); idx += file; pad4(idx); }
  // the provenance: each source node, where its triangles went
  std::string prov = "{\"version\": 1, \"world\": " + jsonString(stem + ".zworld") + ", \"cell\": " + std::to_string(cell) + ", \"origin\": [" +
                     std::to_string(x0) + ", " + std::to_string(z0) + "], \"block\": " + std::to_string(block) + ", \"cells\": " + std::to_string(cells.size()) +
                     ",\n \"sources\": [";
  std::stable_sort(where.begin(), where.end(), [](const Where& a, const Where& b) { return a.obj < b.obj; });
  for (std::size_t i = 0, first = 1; i < rd.objs.size(); ++i) {
    const Obj& o = rd.objs[i];
    prov += std::string(first ? "" : ",") + "\n  {\"id\": " + jsonString(o.id) + ", \"node\": " + jsonString(o.node) + ", \"file\": " + jsonString(o.file) +
            ", \"level\": " + std::to_string(o.level) + ", \"in\": [";
    first = 0;
    bool any = false;
    const auto lo2 = std::lower_bound(where.begin(), where.end(), static_cast<int>(i), [](const Where& w, int v) { return w.obj < v; });
    for (auto w = lo2; w != where.end() && w->obj == static_cast<int>(i); ++w) {
      prov += std::string(any ? ", " : "") + "[" + std::to_string(w->cell) + ", " + std::to_string(w->level) + ", " + jsonString(w->chunk) + ", " + std::to_string(w->batch) + "]";
      any = true;
    }
    prov += "]}";
  }
  prov += "\n]}\n";
  entries.push_back({rd.dir + stem + ".zworld.json", 0, 0, 0, std::move(prov)});
  for (BundleEntry& p : rd.pictures) entries.push_back(std::move(p));
  out = bundleOf(entries);
  return true;
}

}  // namespace zn::assets
