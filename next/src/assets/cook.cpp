#include "assets/cook.h"

#include "cgltf.h"
#include "meshoptimizer.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <string>
#include <vector>

namespace fs = std::filesystem;
namespace zn::assets {

namespace {
struct V { float px, py, pz, nx, ny, nz; std::uint8_t r, g, b; };
}

bool cook(const std::string& gltfPath, const CookProfile& profile, const std::string& outDir, CookReceipt& receipt, std::string& err) {
  receipt.scene = gltfPath;
  receipt.profile = profile.name;

  cgltf_options opt{};
  cgltf_data* data = nullptr;
  cgltf_result r = cgltf_parse_file(&opt, gltfPath.c_str(), &data);
  if (r != cgltf_result_success) { err = "cgltf parse failed"; return false; }
  r = cgltf_load_buffers(&opt, data, gltfPath.c_str());
  if (r != cgltf_result_success) { cgltf_free(data); err = "cgltf load buffers failed"; return false; }

  std::vector<V> verts;
  std::vector<std::uint32_t> idx;
  for (std::size_t mi = 0; mi < data->meshes_count; ++mi) {
    for (std::size_t pi = 0; pi < data->meshes[mi].primitives_count; ++pi) {
      const cgltf_primitive& p = data->meshes[mi].primitives[pi];
      if (p.type != cgltf_primitive_type_triangles) continue;
      const cgltf_accessor* posA = nullptr, *nrmA = nullptr;
      for (std::size_t ai = 0; ai < p.attributes_count; ++ai) {
        if (p.attributes[ai].type == cgltf_attribute_type_position) posA = p.attributes[ai].data;
        if (p.attributes[ai].type == cgltf_attribute_type_normal) nrmA = p.attributes[ai].data;
      }
      if (!posA) continue;
      std::size_t base = verts.size();
      for (std::size_t i = 0; i < posA->count; ++i) {
        float pos[3] = {0, 0, 0}, nrm[3] = {0, 0, 1};
        cgltf_accessor_read_float(posA, i, pos, 3);
        if (nrmA) cgltf_accessor_read_float(nrmA, i, nrm, 3);
        // bake vertex light: sun + ambient
        float ndl = std::max(0.0f, nrm[1]) * 0.7f + 0.3f;
        V v{pos[0], pos[1], pos[2], nrm[0], nrm[1], nrm[2],
            (std::uint8_t)(ndl * 200), (std::uint8_t)(ndl * 200), (std::uint8_t)(ndl * 200)};
        verts.push_back(v);
      }
      if (p.indices) {
        for (std::size_t i = 0; i < p.indices->count; ++i) idx.push_back(base + (std::uint32_t)cgltf_accessor_read_index(p.indices, i));
      } else {
        for (std::size_t i = 0; i < posA->count; ++i) idx.push_back(base + (std::uint32_t)i);
      }
    }
  }
  cgltf_free(data);

  if (verts.empty()) { err = "no geometry"; return false; }

  // bounding box
  float mn[3] = {verts[0].px, verts[0].py, verts[0].pz}, mx[3] = {mn[0], mn[1], mn[2]};
  for (auto& v : verts) for (int k = 0; k < 3; ++k) { float* p = k == 0 ? &v.px : k == 1 ? &v.py : &v.pz; mn[k] = std::min(mn[k], *p); mx[k] = std::max(mx[k], *p); }
  float ext[3] = {mx[0]-mn[0], mx[1]-mn[1], mx[2]-mn[2]};
  for (int k = 0; k < 3; ++k) if (ext[k] < 1e-6f) ext[k] = 1.0f;

  // quantization error estimate
  double qerr = 0;
  for (auto& v : verts) {
    float qx = (v.px - mn[0]) / ext[0] * 65535.0f;
    float qy = (v.py - mn[1]) / ext[1] * 65535.0f;
    float qz = (v.pz - mn[2]) / ext[2] * 65535.0f;
    float rx = mn[0] + (qx / 65535.0f) * ext[0];
    qerr += std::fabs(rx - v.px);
  }
  qerr /= verts.size();

  // LODs
  std::vector<std::uint32_t> lodIdx = idx;
  std::uint64_t tris = idx.size() / 3;
  receipt.lodTris.push_back({"lod0", tris});
  // simplify for lod1
  std::vector<std::uint32_t> simp(idx.size());
  float threshold = 0.5f;
  std::size_t simpCount = meshopt_simplify(simp.data(), idx.data(), idx.size(), &verts[0].px, verts.size(), sizeof(V), idx.size() / 2, threshold, 0);
  simp.resize(simpCount);
  receipt.lodTris.push_back({"lod1", simpCount / 3});

  // budget check
  if (profile.triBudget > 0 && tris > profile.triBudget) {
    receipt.ok = false;
    receipt.error = "budget overrun: cell default section triangles " + std::to_string(tris) + " > " + std::to_string(profile.triBudget);
    err = receipt.error;
    return false;
  }

  // write pack (deterministic binary)
  fs::create_directories(outDir);
  std::string outPath = outDir + "/" + profile.name + ".zcook";
  std::ofstream o(outPath, std::ios::binary);
  // header
  o.write("ZCK1", 4);
  // profile name
  std::uint32_t pn = profile.name.size();
  o.write(reinterpret_cast<const char*>(&pn), 4); o.write(profile.name.data(), pn);
  // bounds
  for (int k = 0; k < 3; ++k) o.write(reinterpret_cast<const char*>(&mn[k]), 4);
  for (int k = 0; k < 3; ++k) o.write(reinterpret_cast<const char*>(&ext[k]), 4);
  // vertex count
  std::uint32_t vc = verts.size();
  o.write(reinterpret_cast<const char*>(&vc), 4);
  // vertices: quantized positions (i16) + color
  for (auto& v : verts) {
    std::int16_t qx = (std::int16_t)((v.px - mn[0]) / ext[0] * 32767.0f);
    std::int16_t qy = (std::int16_t)((v.py - mn[1]) / ext[1] * 32767.0f);
    std::int16_t qz = (std::int16_t)((v.pz - mn[2]) / ext[2] * 32767.0f);
    o.write(reinterpret_cast<const char*>(&qx), 2);
    o.write(reinterpret_cast<const char*>(&qy), 2);
    o.write(reinterpret_cast<const char*>(&qz), 2);
    o.write(reinterpret_cast<const char*>(&v.r), 1);
    o.write(reinterpret_cast<const char*>(&v.g), 1);
    o.write(reinterpret_cast<const char*>(&v.b), 1);
  }
  // indices
  std::uint32_t ic = idx.size();
  o.write(reinterpret_cast<const char*>(&ic), 4);
  for (auto i : idx) { std::uint16_t u = (std::uint16_t)i; o.write(reinterpret_cast<const char*>(&u), 2); }
  o.close();

  receipt.triangles = tris;
  receipt.vertices = verts.size();
  receipt.quantErr = qerr;
  receipt.ok = true;

  // receipt json
  std::ofstream rf(outDir + "/" + profile.name + ".receipt.json");
  rf << "{\n";
  rf << "  \"scene\": \"" << gltfPath << "\",\n";
  rf << "  \"profile\": \"" << profile.name << "\",\n";
  rf << "  \"triangles\": " << tris << ",\n";
  rf << "  \"vertices\": " << verts.size() << ",\n";
  rf << "  \"quantError\": " << qerr << ",\n";
  rf << "  \"lod\": [\n";
  for (std::size_t i = 0; i < receipt.lodTris.size(); ++i) {
    rf << "    {\"name\": \"" << receipt.lodTris[i].first << "\", \"triangles\": " << receipt.lodTris[i].second << "}";
    if (i + 1 < receipt.lodTris.size()) rf << ",";
    rf << "\n";
  }
  rf << "  ]\n";
  rf << "}\n";
  rf.close();

  return true;
}

bool readCook(const std::string& path, CookReceipt& receipt, std::string& err) {
  std::ifstream in(path, std::ios::binary);
  if (!in) { err = "cannot open " + path; return false; }
  char magic[4]; in.read(magic, 4);
  if (std::string(magic, 4) != "ZCK1") { err = "bad magic"; return false; }
  std::uint32_t pn; in.read(reinterpret_cast<char*>(&pn), 4);
  std::string profile(pn, '\0'); in.read(profile.data(), pn);
  float mn[3], ext[3]; in.read(reinterpret_cast<char*>(mn), 12); in.read(reinterpret_cast<char*>(ext), 12);
  std::uint32_t vc; in.read(reinterpret_cast<char*>(&vc), 4);
  // skip vertices (6 bytes + 3 bytes each)
  in.seekg(vc * 9, std::ios::cur);
  std::uint32_t ic; in.read(reinterpret_cast<char*>(&ic), 4);
  receipt.profile = profile;
  receipt.vertices = vc;
  receipt.triangles = ic / 3;
  receipt.ok = true;
  return true;
}

}  // namespace zn::assets