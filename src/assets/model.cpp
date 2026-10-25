// The model importer (ZN-441). See model.h and docs/reports/zinc-next-assets.md "Models".
#include "assets/model.h"

#include "zn/zmesh.h"

#include "yyjson.h"
#define CGLTF_IMPLEMENTATION
#include "cgltf.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <memory>
#include <unistd.h>

namespace fs = std::filesystem;

namespace zn::assets {
namespace {

using Opts = std::map<std::string, std::string>;

std::string optOr(const Opts& o, const char* k, const std::string& otherwise) {
  const auto it = o.find(k);
  return it == o.end() ? otherwise : it->second;
}
bool flagOr(const Opts& o, const char* k, bool otherwise) {
  const auto it = o.find(k);
  return it == o.end() ? otherwise : it->second == "true" || it->second == "1";
}
std::string quote(const std::string& s) {
  std::string r = "'";
  for (char c : s) { if (c == '\'') r += "'\\''"; else r += c; }
  return r + "'";
}
bool readFile(const fs::path& p, std::string& out) {
  std::ifstream in(p, std::ios::binary);
  if (!in) return false;
  out.assign(std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>());
  return true;
}
bool writeFile(const fs::path& p, std::string_view bytes) {
  std::ofstream o(p, std::ios::binary);
  o.write(bytes.data(), static_cast<std::streamsize>(bytes.size()));
  return static_cast<bool>(o);
}
std::uint32_t le32(const char* p) {
  const auto* u = reinterpret_cast<const unsigned char*>(p);
  return u[0] | u[1] << 8 | u[2] << 16 | static_cast<std::uint32_t>(u[3]) << 24;
}
void put32(std::string& o, std::uint32_t v) { for (int i = 0; i < 4; ++i) o += static_cast<char>(v >> (8 * i) & 0xff); }
void pad4(std::string& o) { while (o.size() % 4) o += '\0'; }

/** A directory of its own for one import, removed with it. */
struct Scratch {
  fs::path dir;
  Scratch() {
    static int n = 0;
    std::error_code ec;
    dir = fs::temp_directory_path(ec) / ("zinc-model-" + std::to_string(::getpid()) + "-" + std::to_string(++n));
    fs::remove_all(dir, ec);
    fs::create_directories(dir, ec);
  }
  ~Scratch() { std::error_code ec; fs::remove_all(dir, ec); }
};

std::string dirOf(const std::string& name) { const auto s = name.rfind('/'); return s == std::string::npos ? std::string() : name.substr(0, s + 1); }
std::string baseOf(const std::string& name) { const auto s = name.rfind('/'); return s == std::string::npos ? name : name.substr(s + 1); }

/** %XX escapes of a URI. */
std::string decodeUri(std::string_view s) {
  std::string o;
  for (std::size_t i = 0; i < s.size(); ++i) {
    if (s[i] == '%' && i + 2 < s.size() && std::isxdigit(static_cast<unsigned char>(s[i + 1])) && std::isxdigit(static_cast<unsigned char>(s[i + 2]))) {
      o += static_cast<char>(std::stoi(std::string(s.substr(i + 1, 2)), nullptr, 16));
      i += 2;
    } else o += s[i];
  }
  return o;
}
/** A relative URI for a file name: what is not unreserved (RFC 3986) is escaped, so the loaders' decodeUri gives the name back. */
std::string encodeUri(std::string_view s) {
  std::string o;
  for (unsigned char c : s) {
    if (std::isalnum(c) || c == '-' || c == '.' || c == '_' || c == '~') o += static_cast<char>(c);
    else { char b[4]; std::snprintf(b, sizeof b, "%%%02X", c); o += b; }
  }
  return o;
}
/** A file's name from its place beside the model: `name`'s directory, then the URI, `.` and `..` resolved. */
std::string besides(const std::string& name, std::string_view uri) { return fs::path(dirOf(name) + decodeUri(uri)).lexically_normal().generic_string(); }

/** The payload of a base64 data: URI. */
bool dataUri(std::string_view s, std::string& out) {
  if (s.substr(0, 5) != "data:") return false;
  const auto comma = s.find(',');
  if (comma == std::string_view::npos || s.substr(0, comma).find(";base64") == std::string_view::npos) return false;
  out.clear();
  std::uint32_t acc = 0;
  int bits = 0;
  for (char c : s.substr(comma + 1)) {
    int v = c >= 'A' && c <= 'Z' ? c - 'A' : c >= 'a' && c <= 'z' ? c - 'a' + 26 : c >= '0' && c <= '9' ? c - '0' + 52 : c == '+' || c == '-' ? 62 : c == '/' || c == '_' ? 63 : -1;
    if (v < 0) continue;
    acc = acc << 6 | static_cast<std::uint32_t>(v);
    if ((bits += 6) >= 8) { bits -= 8; out += static_cast<char>(acc >> bits & 0xff); }
  }
  return true;
}

/** The JSON and the binary chunk of a GLB, or the text of a .gltf (bin empty). */
bool splitGlb(const std::string& in, std::string& json, std::string& bin, std::string& err) {
  if (in.size() < 12 || in.compare(0, 4, "glTF") != 0) { json = in; bin.clear(); return true; }
  if (le32(in.data() + 4) != 2) { err = "GLB version " + std::to_string(le32(in.data() + 4)) + " (2 is read)"; return false; }
  for (std::size_t at = 12; at + 8 <= in.size();) {
    const std::uint32_t len = le32(in.data() + at), type = le32(in.data() + at + 4);
    if (len > in.size() - at - 8) break;
    if (type == 0x4E4F534A && json.empty()) json = in.substr(at + 8, len);
    else if (type == 0x004E4942 && bin.empty()) bin = in.substr(at + 8, len);
    at += 8 + (len + 3) / 4 * 4;
  }
  if (json.empty()) { err = "a GLB without its JSON chunk"; return false; }
  return true;
}

using Doc = std::unique_ptr<yyjson_mut_doc, decltype(&yyjson_mut_doc_free)>;
Doc readJson(const std::string& json, std::string& err) {
  yyjson_doc* d = yyjson_read(json.data(), json.size(), 0);
  Doc m(d ? yyjson_doc_mut_copy(d, nullptr) : nullptr, yyjson_mut_doc_free);
  yyjson_doc_free(d);
  if (!m || !yyjson_mut_is_obj(yyjson_mut_doc_get_root(m.get()))) err = "not glTF: its JSON does not read";
  return m;
}
long num(yyjson_mut_val* o, const char* k, long otherwise) {
  yyjson_mut_val* v = yyjson_mut_obj_get(o, k);
  return yyjson_mut_is_num(v) ? static_cast<long>(yyjson_mut_get_num(v)) : otherwise;
}
std::string_view str(yyjson_mut_val* o, const char* k) {
  yyjson_mut_val* v = yyjson_mut_obj_get(o, k);
  return yyjson_mut_is_str(v) ? std::string_view(yyjson_mut_get_str(v), yyjson_mut_get_len(v)) : std::string_view();
}
void setStr(yyjson_mut_doc* d, yyjson_mut_val* o, const char* k, const std::string& v) {
  yyjson_mut_obj_remove_key(o, k);
  yyjson_mut_obj_add_strncpy(d, o, k, v.data(), v.size());
}

/** The extension of an image from its first bytes: png, jpg, webp, or "" for what the texture importer does not read. */
std::string imageExt(const std::string& b) {
  if (b.size() > 8 && b.compare(0, 8, "\x89PNG\r\n\x1a\n") == 0) return "png";
  if (b.size() > 3 && static_cast<unsigned char>(b[0]) == 0xFF && static_cast<unsigned char>(b[1]) == 0xD8) return "jpg";
  if (b.size() > 12 && b.compare(0, 4, "RIFF") == 0 && b.compare(8, 4, "WEBP") == 0) return "webp";
  return "";
}

std::string writeBundle(const std::vector<BundleEntry>& entries) {
  std::string b = "ZAB1";
  put32(b, static_cast<std::uint32_t>(entries.size()));
  for (const BundleEntry& e : entries) {
    put32(b, static_cast<std::uint32_t>(e.name.size()));
    b += e.name;
    b += static_cast<char>(e.kind);
    put32(b, static_cast<std::uint32_t>(e.data.size()));
  }
  for (const BundleEntry& e : entries) b += e.data;
  return b;
}

/** The model rewritten for gltfpack in `s`: in.gltf beside its buffers b<n>.bin, every embedded image a file named by its URI (`textures`, through
 *  the texture importer: the entries the model's URIs name). gltfpack keeps those URIs (-tr) and drops what nothing references. */
bool prepare(const ToolPath& basisu, const std::string& name, const std::string& in, const std::map<std::string, std::string>& side, const Opts& opts,
             const Scratch& s, std::vector<BundleEntry>& textures, std::string& err) {
  std::string json, bin;
  if (!splitGlb(in, json, bin, err)) return false;
  Doc doc = readJson(json, err);
  if (!doc) return false;
  yyjson_mut_doc* d = doc.get();
  yyjson_mut_val* root = yyjson_mut_doc_get_root(d);
  std::vector<std::string> buffers;
  yyjson_mut_val* bufs = yyjson_mut_obj_get(root, "buffers");
  for (std::size_t i = 0; i < yyjson_mut_arr_size(bufs); ++i) {
    yyjson_mut_val* b = yyjson_mut_arr_get(bufs, i);
    const std::string_view uri = str(b, "uri");
    std::string bytes;
    if (uri.empty()) {
      if (i != 0 || in.compare(0, 4, "glTF") != 0) { err = "buffer " + std::to_string(i) + " has no data"; return false; }
      bytes = bin;
    } else if (!dataUri(uri, bytes)) {
      const auto it = side.find(besides(name, uri));
      if (it == side.end()) { err = "cannot read " + besides(name, uri) + ", which it names"; return false; }
      bytes = it->second;
    }
    const std::string file = "b" + std::to_string(i) + ".bin";
    if (!writeFile(s.dir / file, bytes)) { err = "cannot write in " + s.dir.string(); return false; }
    setStr(d, b, "uri", file);
    buffers.push_back(std::move(bytes));
  }
  // images read as data (normal, occlusion, metal and roughness maps) stay linear; colour is sRGB
  std::vector<bool> linear(yyjson_mut_arr_size(yyjson_mut_obj_get(root, "images")), false);
  yyjson_mut_val* texs = yyjson_mut_obj_get(root, "textures");
  auto markLinear = [&](yyjson_mut_val* info) {
    const long t = num(info, "index", -1), src = t < 0 ? -1 : num(yyjson_mut_arr_get(texs, static_cast<std::size_t>(t)), "source", -1);
    if (src >= 0 && static_cast<std::size_t>(src) < linear.size()) linear[static_cast<std::size_t>(src)] = true;
  };
  yyjson_mut_val* mats = yyjson_mut_obj_get(root, "materials");
  for (std::size_t i = 0; i < yyjson_mut_arr_size(mats); ++i) {
    yyjson_mut_val* m = yyjson_mut_arr_get(mats, i);
    markLinear(yyjson_mut_obj_get(m, "normalTexture"));
    markLinear(yyjson_mut_obj_get(m, "occlusionTexture"));
    markLinear(yyjson_mut_obj_get(yyjson_mut_obj_get(m, "pbrMetallicRoughness"), "metallicRoughnessTexture"));
  }
  yyjson_mut_val* views = yyjson_mut_obj_get(root, "bufferViews");
  yyjson_mut_val* images = yyjson_mut_obj_get(root, "images");
  for (std::size_t i = 0; i < yyjson_mut_arr_size(images); ++i) {
    yyjson_mut_val* im = yyjson_mut_arr_get(images, i);
    const std::string_view uri = str(im, "uri");
    std::string bytes;
    if (!uri.empty() && !dataUri(uri, bytes)) continue;   // a file of its own: an asset of the project, imported by its own rule
    if (uri.empty()) {
      yyjson_mut_val* v = yyjson_mut_arr_get(views, static_cast<std::size_t>(std::max(0L, num(im, "bufferView", -1))));
      const long b = num(v, "buffer", -1), off = num(v, "byteOffset", 0), len = num(v, "byteLength", -1);
      if (num(im, "bufferView", -1) < 0 || b < 0 || static_cast<std::size_t>(b) >= buffers.size() || off < 0 || len < 0 ||
          static_cast<std::size_t>(off + len) > buffers[static_cast<std::size_t>(b)].size()) { err = "image " + std::to_string(i) + " has no data"; return false; }
      bytes = buffers[static_cast<std::size_t>(b)].substr(static_cast<std::size_t>(off), static_cast<std::size_t>(len));
    }
    const std::string ext = imageExt(bytes);
    if (ext.empty()) continue;   // KTX2 or another format the texture importer does not read: left in the model as it is
    const std::string file = baseOf(name) + "." + std::to_string(i) + "." + ext;
    Opts t;
    for (const auto& [k, v] : opts) if (k.rfind("texture.", 0) == 0) t[k.substr(8)] = v;
    if (linear[i] && !t.count("linear")) t["linear"] = "true";
    BundleEntry e{dirOf(name) + file, 1, 0, 0, {}};
    if (!importTexture(basisu, e.name, bytes, t, e.data, err)) { err = "image " + std::to_string(i) + ": " + err; return false; }
    textures.push_back(std::move(e));
    if (!writeFile(s.dir / file, bytes)) { err = "cannot write in " + s.dir.string(); return false; }
    setStr(d, im, "uri", encodeUri(file));
    yyjson_mut_obj_remove_key(im, "bufferView");
    yyjson_mut_obj_remove_key(im, "mimeType");
  }
  std::size_t len = 0;
  char* text = yyjson_mut_write(d, 0, &len);
  const bool ok = text && writeFile(s.dir / "in.gltf", std::string_view(text, len));
  std::free(text);
  if (!ok) err = "cannot write in " + s.dir.string();
  return ok;
}

bool runGltfpack(const std::string& tool, const Scratch& s, const std::string& args, std::string& out, std::string& err) {
  const fs::path o = s.dir / "out.glb", log = s.dir / "log";
  std::error_code ec;
  fs::remove(o, ec);
  const std::string cmd = quote(tool) + " -i " + quote((s.dir / "in.gltf").string()) + " -o " + quote(o.string()) + args + " >" + quote(log.string()) + " 2>&1";
  if (std::system(cmd.c_str()) == 0 && readFile(o, out)) return true;
  std::string text;
  readFile(log, text);
  err = "gltfpack failed: " + (text.size() > 600 ? text.substr(text.size() - 600) : text);
  return false;
}

// ---------------------------------------------------------------- GLB to ZMS1
struct Part {
  const cgltf_material* material;
  std::uint32_t flags;
  std::vector<float> pos, nrm, uv;
  std::vector<std::uint32_t> col;
  std::vector<std::uint16_t> idx;
};

std::uint32_t byte(float v) { return v <= 0 ? 0u : v >= 1 ? 255u : static_cast<std::uint32_t>(std::lround(v * 255)); }

/** The triangles of `prim` at the world matrix `m` (column-major) into the parts of its material, a new part when one would pass 65535 vertices. */
void addPrimitive(const cgltf_primitive& prim, const float* m, std::vector<Part>& parts) {
  if (prim.type != cgltf_primitive_type_triangles && prim.type != cgltf_primitive_type_triangle_strip && prim.type != cgltf_primitive_type_triangle_fan) return;
  const cgltf_accessor *pa = nullptr, *na = nullptr, *ta = nullptr, *ca = nullptr;
  for (cgltf_size i = 0; i < prim.attributes_count; ++i) {
    const cgltf_attribute& a = prim.attributes[i];
    if (a.type == cgltf_attribute_type_position) pa = a.data;
    else if (a.type == cgltf_attribute_type_normal) na = a.data;
    else if (a.type == cgltf_attribute_type_texcoord && a.index == 0) ta = a.data;
    else if (a.type == cgltf_attribute_type_color && a.index == 0) ca = a.data;
  }
  if (!pa || pa->count == 0) return;
  const std::size_t n = pa->count;
  const cgltf_material* mat = prim.material;
  const cgltf_texture_view* tv = mat && mat->has_pbr_metallic_roughness ? &mat->pbr_metallic_roughness.base_color_texture : nullptr;
  if (!tv || !tv->texture) ta = nullptr;   // uvs only serve a texture
  std::vector<float> P(n * 3), N(na ? n * 3 : 0), T(ta ? n * 2 : 0), C;
  cgltf_accessor_unpack_floats(pa, P.data(), P.size());
  if (na && na->count >= n) cgltf_accessor_unpack_floats(na, N.data(), N.size()); else { N.clear(); na = nullptr; }
  if (ta && ta->count >= n) cgltf_accessor_unpack_floats(ta, T.data(), T.size()); else { T.clear(); ta = nullptr; }
  const std::size_t cc = ca ? cgltf_num_components(ca->type) : 0;
  if (ca && ca->count >= n && (cc == 3 || cc == 4)) { C.resize(n * cc); cgltf_accessor_unpack_floats(ca, C.data(), C.size()); } else ca = nullptr;
  if (ta && tv->has_transform) {   // KHR_texture_transform: offset, rotation, scale (gltfpack writes one for quantised uvs)
    const cgltf_texture_transform& x = tv->transform;
    const float c = std::cos(x.rotation), sn = std::sin(x.rotation);
    for (std::size_t i = 0; i < n; ++i) {
      const float u = T[i * 2] * x.scale[0], v = T[i * 2 + 1] * x.scale[1];
      T[i * 2] = x.offset[0] + c * u + sn * v;
      T[i * 2 + 1] = x.offset[1] - sn * u + c * v;
    }
  }
  // positions by m, normals by its cofactor matrix (the inverse transpose times the determinant), a mirrored node turns its triangles over
  const float det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
  const float sg = det < 0 ? -1.0f : 1.0f;
  const float cof[9] = {m[5] * m[10] - m[6] * m[9], m[6] * m[8] - m[4] * m[10], m[4] * m[9] - m[5] * m[8],
                        m[2] * m[9] - m[1] * m[10], m[0] * m[10] - m[2] * m[8], m[1] * m[8] - m[0] * m[9],
                        m[1] * m[6] - m[2] * m[5], m[2] * m[4] - m[0] * m[6], m[0] * m[5] - m[1] * m[4]};
  std::vector<std::uint32_t> ix;
  if (prim.indices) for (cgltf_size i = 0; i < prim.indices->count; ++i) ix.push_back(static_cast<std::uint32_t>(cgltf_accessor_read_index(prim.indices, i)));
  else for (std::size_t i = 0; i < n; ++i) ix.push_back(static_cast<std::uint32_t>(i));
  std::vector<std::uint32_t> tris;
  for (std::size_t i = 0; i + 2 < ix.size(); i += prim.type == cgltf_primitive_type_triangles ? 3 : 1) {
    std::uint32_t a = ix[i], b = ix[i + 1], c = ix[i + 2];
    if (prim.type == cgltf_primitive_type_triangle_strip && (i & 1)) std::swap(a, b);
    if (prim.type == cgltf_primitive_type_triangle_fan) a = ix[0];
    if (a >= n || b >= n || c >= n) continue;
    if (det < 0) std::swap(b, c);
    tris.insert(tris.end(), {a, b, c});
  }
  const std::uint32_t flags = (ta ? zmesh::Uvs : 0) | (ca ? zmesh::Colors : 0) | (na ? 0 : zmesh::Flat) |
                              (mat && mat->double_sided ? zmesh::DoubleSided : 0) | (mat && mat->unlit ? zmesh::Unlit : 0) |
                              (mat && mat->alpha_mode == cgltf_alpha_mode_blend ? zmesh::Blend : 0);
  Part* p = nullptr;
  for (Part& q : parts) if (q.material == mat && q.flags == flags) p = &q;   // the last one of its kind: the earlier ones are full
  std::vector<std::int32_t> at(n, -1);
  for (std::size_t t = 0; t < tris.size(); t += 3) {
    std::uint32_t fresh = 0;
    for (int k = 0; k < 3; ++k) fresh += at[tris[t + k]] < 0;
    if (!p || p->pos.size() / 3 + fresh > zmesh::kMaxVertices) {
      parts.push_back(Part{mat, flags, {}, {}, {}, {}, {}});
      p = &parts.back();
      std::fill(at.begin(), at.end(), -1);
    }
    for (int k = 0; k < 3; ++k) {
      const std::uint32_t v = tris[t + k];
      if (at[v] < 0) {
        at[v] = static_cast<std::int32_t>(p->pos.size() / 3);
        const float* q = &P[v * 3];
        for (int r = 0; r < 3; ++r) p->pos.push_back(m[r] * q[0] + m[4 + r] * q[1] + m[8 + r] * q[2] + m[12 + r]);
        if (na) {
          const float* w = &N[v * 3];
          float o[3];
          for (int r = 0; r < 3; ++r) o[r] = sg * (cof[r * 3] * w[0] + cof[r * 3 + 1] * w[1] + cof[r * 3 + 2] * w[2]);
          const float l = std::sqrt(o[0] * o[0] + o[1] * o[1] + o[2] * o[2]);
          for (float c : o) p->nrm.push_back(l > 0 ? c / l : 0);
        } else p->nrm.insert(p->nrm.end(), 3, 0.0f);
        if (ta) { p->uv.push_back(T[v * 2]); p->uv.push_back(T[v * 2 + 1]); }
        if (ca) p->col.push_back(byte(C[v * cc]) << 16 | byte(C[v * cc + 1]) << 8 | byte(C[v * cc + 2]));
      }
      p->idx.push_back(static_cast<std::uint16_t>(at[v]));
    }
  }
}

void walk(const cgltf_node* node, std::vector<Part>& parts, int depth) {
  if (node->mesh) {
    float m[16];
    cgltf_node_transform_world(node, m);
    for (cgltf_size i = 0; i < node->mesh->primitives_count; ++i) addPrimitive(node->mesh->primitives[i], m, parts);
  }
  if (depth < 64) for (cgltf_size i = 0; i < node->children_count; ++i) walk(node->children[i], parts, depth + 1);   // glTF node graphs are trees
}

/** The default scene of a GLB (gltfpack's: one buffer, the binary chunk; images by URI) as ZMS1. */
bool toZmesh(const std::string& glb, std::string& out, std::string& err) {
  cgltf_options o{};
  cgltf_data* raw = nullptr;
  if (cgltf_parse(&o, glb.data(), glb.size(), &raw) != cgltf_result_success) { err = "cgltf cannot read gltfpack's output"; return false; }
  std::unique_ptr<cgltf_data, decltype(&cgltf_free)> data(raw, cgltf_free);
  for (cgltf_size i = 0; i < raw->buffers_count; ++i)
    if (raw->buffers[i].uri && std::strncmp(raw->buffers[i].uri, "data:", 5) != 0) { err = "gltfpack's output names a buffer file"; return false; }
  if (cgltf_load_buffers(&o, raw, nullptr) != cgltf_result_success) { err = "cgltf cannot read gltfpack's buffers"; return false; }
  std::vector<Part> parts;
  const cgltf_scene* scene = raw->scene ? raw->scene : raw->scenes_count ? &raw->scenes[0] : nullptr;
  if (scene) for (cgltf_size i = 0; i < scene->nodes_count; ++i) walk(scene->nodes[i], parts, 0);
  else for (cgltf_size i = 0; i < raw->nodes_count; ++i) if (!raw->nodes[i].parent) walk(&raw->nodes[i], parts, 0);
  if (parts.empty()) { err = "no triangles in the default scene"; return false; }
  std::vector<std::string> names;
  auto textureOf = [&](const cgltf_material* mat) -> std::int32_t {
    const cgltf_texture* t = mat && mat->has_pbr_metallic_roughness ? mat->pbr_metallic_roughness.base_color_texture.texture : nullptr;
    if (!t || !t->image || !t->image->uri || std::strncmp(t->image->uri, "data:", 5) == 0) return -1;
    const std::string n = decodeUri(t->image->uri);
    for (std::size_t i = 0; i < names.size(); ++i) if (names[i] == n) return static_cast<std::int32_t>(i);
    names.push_back(n);
    return static_cast<std::int32_t>(names.size() - 1);
  };
  std::vector<std::int32_t> tex;
  for (const Part& p : parts) tex.push_back(textureOf(p.material));
  out = "ZMS1";
  put32(out, static_cast<std::uint32_t>(parts.size()));
  put32(out, static_cast<std::uint32_t>(names.size()));
  put32(out, 0);
  for (const std::string& n : names) { put32(out, static_cast<std::uint32_t>(n.size())); out += n; pad4(out); }
  auto raw32 = [&](const void* p, std::size_t bytes) { out.append(static_cast<const char*>(p), bytes); };   // every Zinc target is little-endian
  for (std::size_t i = 0; i < parts.size(); ++i) {
    const Part& p = parts[i];
    const cgltf_material* mat = p.material;
    const float* f = mat && mat->has_pbr_metallic_roughness ? mat->pbr_metallic_roughness.base_color_factor : nullptr;
    const std::uint32_t colour = f ? byte(f[3]) << 24 | byte(f[0]) << 16 | byte(f[1]) << 8 | byte(f[2]) : 0xffffffffu;
    const std::uint32_t nv = static_cast<std::uint32_t>(p.pos.size() / 3), ni = static_cast<std::uint32_t>(p.idx.size());
    const std::uint32_t flags = p.flags & ~(tex[i] < 0 ? static_cast<std::uint32_t>(zmesh::Uvs) : 0u);
    const std::size_t start = out.size();
    put32(out, nv);
    put32(out, ni);
    put32(out, flags);
    put32(out, colour);
    put32(out, static_cast<std::uint32_t>(tex[i]));
    put32(out, 0);
    raw32(p.pos.data(), p.pos.size() * 4);
    raw32(p.nrm.data(), p.nrm.size() * 4);
    if (flags & zmesh::Uvs) raw32(p.uv.data(), p.uv.size() * 4);
    if (flags & zmesh::Colors) raw32(p.col.data(), p.col.size() * 4);
    raw32(p.idx.data(), p.idx.size() * 2);
    pad4(out);
    if (out.size() - start != zmesh::partBytes(nv, ni, flags)) { err = "a part of the wrong size (zmesh.h)"; return false; }
  }
  return true;
}

/** `name` with its extension replaced: truck.glb, ".lod1", "zmesh" -> truck.lod1.zmesh. */
std::string renamed(const std::string& name, const std::string& suffix, const std::string& ext) {
  const auto dot = name.rfind('.');
  const bool hasExt = dot != std::string::npos && dot >= dirOf(name).size();
  return (hasExt ? name.substr(0, dot) : name) + suffix + "." + (!ext.empty() ? ext : hasExt ? name.substr(dot + 1) : "glb");
}

/** The numbers of a rule's list ("0.5,0.25" or the JSON text [0.5, 0.25]). */
std::vector<double> ratios(const std::string& s) {
  std::vector<double> r;
  for (std::size_t i = 0; i < s.size();) {
    char* end = nullptr;
    const double v = std::strtod(s.c_str() + i, &end);
    if (end != s.c_str() + i) { r.push_back(v); i = static_cast<std::size_t>(end - s.c_str()); }
    else ++i;
  }
  return r;
}

}  // namespace

std::string bundleOf(const std::vector<BundleEntry>& entries) { return writeBundle(entries); }

bool modelDeps(const std::string& name, const std::string& in, std::vector<std::string>& deps, std::string& err) {
  std::string json, bin;
  if (!splitGlb(in, json, bin, err)) return false;
  Doc doc = readJson(json, err);
  if (!doc) return false;
  yyjson_mut_val* bufs = yyjson_mut_obj_get(yyjson_mut_doc_get_root(doc.get()), "buffers");
  for (std::size_t i = 0; i < yyjson_mut_arr_size(bufs); ++i) {
    const std::string_view uri = str(yyjson_mut_arr_get(bufs, i), "uri");
    if (!uri.empty() && uri.substr(0, 5) != "data:") deps.push_back(besides(name, uri));
  }
  return true;
}

bool importModel(const ToolPath& gltfpack, const ToolPath& basisu, const std::string& name, const std::string& in, const std::map<std::string, std::string>& side,
                 const Opts& opts, std::string& out, std::string& err) {
  const std::string format = optOr(opts, "format", "glb");
  if (format != "glb" && format != "zmesh") { err = "format \"" + format + "\" is not glb (three) or zmesh (zinc:3d)"; return false; }
  const bool zm = format == "zmesh";
  std::string tool;
  if (!gltfpack || !gltfpack(tool, err)) { if (err.empty()) err = "no gltfpack"; return false; }
  Scratch s;
  std::vector<BundleEntry> textures;
  if (!prepare(basisu, name, in, side, opts, s, textures, err)) return false;
  // -tr: the images keep their URIs; -kn: named nodes stay (the program finds them); quantised and compressed for three, floats for zinc:3d
  std::string args = " -tr";
  if (zm) args += " -noq";
  else {
    if (flagOr(opts, "keepNodes", true)) args += " -kn";
    if (flagOr(opts, "compress", true)) args += " -cc";
  }
  const std::string extra = optOr(opts, "gltfpack", "");
  if (!extra.empty()) args += " " + extra;   // ponytail: the rule's own words, split by the shell; the project is the author's
  auto variant = [&](double ratio, std::string& bytes) {
    char r[32];
    std::snprintf(r, sizeof r, " -si %g", ratio);
    std::string glb;
    if (!runGltfpack(tool, s, args + (ratio < 1 ? std::string(r) : std::string()), glb, err)) return false;
    if (!zm) { bytes = std::move(glb); return true; }
    return toZmesh(glb, bytes, err);
  };
  const double simplify = std::strtod(optOr(opts, "simplify", "1").c_str(), nullptr);
  if (!(simplify > 0 && simplify <= 1)) { err = "simplify must be a ratio in (0, 1]"; return false; }
  std::vector<BundleEntry> entries(1);
  entries[0].name = zm ? renamed(name, "", "zmesh") : name;
  if (!variant(simplify, entries[0].data)) return false;
  const std::vector<double> lods = ratios(optOr(opts, "lods", ""));
  for (std::size_t i = 0; i < lods.size(); ++i) {
    if (!(lods[i] > 0 && lods[i] <= 1)) { err = "lods: each ratio in (0, 1]"; return false; }
    entries.push_back({renamed(name, ".lod" + std::to_string(i + 1), zm ? "zmesh" : ""), 0, 0, 0, {}});
    if (!variant(lods[i], entries.back().data)) return false;
  }
  for (BundleEntry& t : textures) entries.push_back(std::move(t));
  out = writeBundle(entries);
  return true;
}

bool bundleDirectory(std::string_view b, std::vector<BundleEntry>& out, std::size_t& need) {
  need = 0;
  out.clear();
  if (b.size() < 8) { need = 8; return false; }
  if (b.substr(0, 4) != "ZAB1") return false;
  std::size_t at = 8;
  std::uint64_t offset = 0;
  for (std::uint32_t n = le32(b.data() + 4); n--;) {
    if (at + 4 > b.size()) { need = at + 4; return false; }
    const std::uint32_t nl = le32(b.data() + at);
    if (nl > 4096) return false;   // a name of a pack entry, never this long
    if (at + 9 + nl > b.size()) { need = at + 9 + nl; return false; }
    out.push_back({std::string(b.substr(at + 4, nl)), static_cast<std::uint8_t>(b[at + 4 + nl]), offset, le32(b.data() + at + 5 + nl), {}});
    offset += out.back().size;
    at += 9 + nl;
  }
  for (BundleEntry& e : out) e.offset += at;
  return true;
}

bool splitBundle(const std::string& b, std::vector<BundleEntry>& out) {
  std::size_t need = 0;
  if (!bundleDirectory(b, out, need) || (out.empty() ? 8 : out.back().offset + out.back().size) != b.size()) return false;
  for (BundleEntry& e : out) e.data = b.substr(e.offset, e.size);
  return true;
}

}  // namespace zn::assets
