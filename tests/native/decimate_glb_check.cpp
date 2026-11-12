// Independent cgltf decoding of the fixed converter's output, compared corner by corner with its OBJ input.
#define CGLTF_IMPLEMENTATION
#include "cgltf.h"
#include <cassert>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
struct Corner { float p[3], n[3], uv[2]; };
int main(int argc, char** argv) {
  assert(argc == 3);
  std::ifstream source(argv[1]); assert(source);
  std::vector<float> positions, normals, uvs;
  std::vector<Corner> corners;
  std::string line;
  while (std::getline(source, line)) {
    std::istringstream input(line); std::string kind; input >> kind;
    if (kind == "v" || kind == "vn" || kind == "vt") {
      auto& out = kind == "v" ? positions : kind == "vn" ? normals : uvs;
      float value;
      for (int i = 0; i < (kind == "vt" ? 2 : 3); ++i) { assert(bool(input >> value)); out.push_back(value); }
    } else if (kind == "f") for (int i = 0; i < 3; ++i) {
      std::string word; input >> word; unsigned p = 0, t = 0, n = 0;
      assert(std::sscanf(word.c_str(), "%u/%u/%u", &p, &t, &n) == 3 && p && t && n);
      Corner c{};
      for (int k = 0; k < 3; ++k) { c.p[k] = positions.at((p - 1) * 3 + k); c.n[k] = normals.at((n - 1) * 3 + k); }
      for (int k = 0; k < 2; ++k) c.uv[k] = uvs.at((t - 1) * 2 + k);
      corners.push_back(c);
    }
  }
  cgltf_options options{}; cgltf_data* data = nullptr;
  assert(cgltf_parse_file(&options, argv[2], &data) == cgltf_result_success);
  struct Document { cgltf_data* value; ~Document() { cgltf_free(value); } } document{data};
  assert(cgltf_load_buffers(&options, data, argv[2]) == cgltf_result_success);
  assert(cgltf_validate(data) == cgltf_result_success);
  assert(data->file_type == cgltf_file_type_glb && data->meshes_count == 1 && data->meshes[0].primitives_count == 1 && data->nodes_count == 1);
  const auto& primitive = data->meshes[0].primitives[0];
  assert(primitive.type == cgltf_primitive_type_triangles && primitive.indices && primitive.indices->count == corners.size());
  const cgltf_accessor *p = nullptr, *n = nullptr, *uv = nullptr;
  for (cgltf_size i = 0; i < primitive.attributes_count; ++i) {
    const auto& attribute = primitive.attributes[i];
    if (attribute.type == cgltf_attribute_type_position) p = attribute.data;
    if (attribute.type == cgltf_attribute_type_normal) n = attribute.data;
    if (attribute.type == cgltf_attribute_type_texcoord) uv = attribute.data;
  }
  assert(p && n && uv && p->count <= 65535 && p->has_min && p->has_max);
  for (size_t i = 0; i < corners.size(); ++i) {
    const cgltf_size index = cgltf_accessor_read_index(primitive.indices, i); assert(index < p->count);
    float position[3], normal[3], texture[2];
    assert(cgltf_accessor_read_float(p, index, position, 3) && cgltf_accessor_read_float(n, index, normal, 3) && cgltf_accessor_read_float(uv, index, texture, 2));
    const Corner& c = corners[i];
    const double length = std::sqrt(double(c.n[0]) * c.n[0] + double(c.n[1]) * c.n[1] + double(c.n[2]) * c.n[2]);
    double unit = 0;
    for (int k = 0; k < 3; ++k) { assert(position[k] == c.p[k]); assert(std::abs(normal[k] - c.n[k] / length) < 1e-7); unit += double(normal[k]) * normal[k]; }
    assert(std::abs(unit - 1) < 2e-7 && texture[0] == c.uv[0] && texture[1] == 1 - c.uv[1]);
  }
  assert(data->materials_count == 1 && data->materials[0].has_specular);
  const auto& material = data->materials[0];
  for (float factor : material.specular.specular_color_factor) assert(std::abs(factor - 38.0 / 255) < 1e-7);
  assert(material.specular.specular_factor == 1 && material.pbr_metallic_roughness.metallic_factor == 0);
  const double smoothness = 1 - material.pbr_metallic_roughness.roughness_factor;
  assert(std::abs(1000 * smoothness * smoothness - 48) < 1e-4);
  assert(data->images_count == 1 && data->images[0].uri && std::strlen(data->images[0].uri) > 0 && !data->images[0].buffer_view);
  std::printf("cgltf validates %zu vertices/%zu triangles; source corners, normals, UV and material match\n", size_t(p->count), corners.size() / 3);
}
