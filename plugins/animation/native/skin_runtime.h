// cgltf exchange -> ozz sampling/blending/skinning. The renderer and gameplay clock are owned by Zinc.
#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>
#define CGLTF_IMPLEMENTATION
#include "cgltf.h"
#include "ozz/animation/offline/raw_skeleton.h"
#include "ozz/animation/offline/skeleton_builder.h"
#include "ozz/animation/offline/raw_animation.h"
#include "ozz/animation/offline/animation_builder.h"
#include "ozz/animation/runtime/skeleton.h"
#include "ozz/animation/runtime/animation.h"
#include "ozz/animation/runtime/sampling_job.h"
#include "ozz/animation/runtime/blending_job.h"
#include "ozz/animation/runtime/local_to_model_job.h"
#include "ozz/geometry/runtime/skinning_job.h"
#include "ozz/base/maths/soa_transform.h"
#include "ozz/base/maths/simd_math.h"

namespace zn_animation {
using namespace ozz::math;
using RawSkeleton = ozz::animation::offline::RawSkeleton;
using RawAnimation = ozz::animation::offline::RawAnimation;
struct Clip { std::string name; ozz::unique_ptr<ozz::animation::Animation> animation; };

struct Skin {
  std::string error;
  ozz::unique_ptr<ozz::animation::Skeleton> skeleton;
  std::vector<Clip> clips;
  std::vector<cgltf_node*> sourceNodes;
  std::unordered_map<std::string, int> jointByName;
  std::vector<int> remap;
  ozz::vector<Float4x4> inverseBind, models, palette;
  ozz::vector<SoaTransform> a, b, blended;
  ozz::animation::SamplingJob::Context contextA, contextB;
  std::vector<float> positions, normals, weights, outputPositions, outputNormals;
  std::vector<uint16_t> joints;
  std::vector<int32_t> indices;
  std::vector<uint32_t> colors;
  uint32_t color = 0xd59b56;
  static constexpr int maxVertices = 4096, maxJoints = 64;

  bool fail(const std::string& message) { error = message; return false; }
  bool tree(cgltf_node* node, RawSkeleton::Joint& out, int depth) {
    if (depth > maxJoints || sourceNodes.size() >= maxJoints) return fail("skeleton exceeds 64 nodes");
    if (!node->name || !*node->name || jointByName.count(node->name)) return fail("joint names must be nonempty and unique");
    if (node->has_matrix) return fail(std::string(node->name) + ": skeleton matrix transforms must be baked to TRS");
    for (int i = 0; i < 3; ++i) if (!std::isfinite(node->translation[i]) || !std::isfinite(node->scale[i])) return fail("non-finite rest transform");
    float norm = 0;
    for (float q : node->rotation) { if (!std::isfinite(q)) return fail("non-finite rest quaternion"); norm += q*q; }
    if (std::abs(norm-1) > .001f) return fail("rest quaternion must be normalized");
    const auto* s = node->scale;
    if (!(s[0] > 0) || std::abs(s[0] - s[1]) > 1e-5f || std::abs(s[0] - s[2]) > 1e-5f) return fail(std::string(node->name) + ": nonuniform/negative skeleton scale unsupported");
    out.name = node->name;
    out.transform.translation = {node->translation[0], node->translation[1], node->translation[2]};
    out.transform.rotation = {node->rotation[0], node->rotation[1], node->rotation[2], node->rotation[3]};
    out.transform.scale = {s[0], s[1], s[2]};
    jointByName[node->name] = int(sourceNodes.size()); sourceNodes.push_back(node);
    out.children.resize(node->children_count);
    for (size_t i = 0; i < node->children_count; ++i) if (!tree(node->children[i], out.children[i], depth + 1)) return false;
    return true;
  }
  static const cgltf_accessor* attribute(const cgltf_primitive& p, cgltf_attribute_type kind) {
    for (size_t i = 0; i < p.attributes_count; ++i) if (p.attributes[i].type == kind && p.attributes[i].index == 0) return p.attributes[i].data;
    return nullptr;
  }
  bool load(const uint8_t* bytes, size_t length) {
    cgltf_options options{}; cgltf_data* raw = nullptr;
    if (length > 32 * 1024 * 1024 || cgltf_parse(&options, bytes, length, &raw) != cgltf_result_success) return fail("not a supported GLB (32 MiB maximum)");
    std::unique_ptr<cgltf_data, decltype(&cgltf_free)> data(raw, cgltf_free);
    if (raw->file_type != cgltf_file_type_glb || cgltf_load_buffers(&options, raw, nullptr) != cgltf_result_success || cgltf_validate(raw) != cgltf_result_success) return fail("GLB buffers/accessors are invalid; external files are not accepted");
    if (raw->skins_count != 1 || raw->meshes_count != 1 || raw->animations_count == 0) return fail("expected exactly one skinned mesh and at least one named clip");
    if (raw->extensions_required_count) return fail("required glTF extensions are not supported by the skin profile");
    cgltf_node* meshNode = nullptr;
    for (size_t i = 0; i < raw->nodes_count; ++i) if (raw->nodes[i].skin) {
      if (meshNode) return fail("skin profile expects one mesh instance");
      meshNode = &raw->nodes[i];
    }
    if (!meshNode || !meshNode->mesh || meshNode->mesh->primitives_count != 1) return fail("skin profile expects one mesh primitive");
    const auto& skin = raw->skins[0];
    if (skin.joints_count == 0 || skin.joints_count > maxJoints || !skin.inverse_bind_matrices) return fail("missing bind matrices or joint budget exceeded");
    cgltf_node* root = skin.joints[0]; while (root->parent) root = root->parent;
    RawSkeleton rest; rest.roots.resize(1);
    if (!tree(root, rest.roots[0], 0)) return false;
    skeleton = ozz::animation::offline::SkeletonBuilder()(rest);
    if (!skeleton) return fail("invalid skeleton rest pose");
    jointByName.clear();
    for (int i = 0; i < skeleton->num_joints(); ++i) jointByName[skeleton->joint_names()[i]] = i;
    remap.resize(skin.joints_count); inverseBind.resize(skin.joints_count); palette.resize(skin.joints_count);
    for (size_t i = 0; i < skin.joints_count; ++i) {
      auto found = jointByName.find(skin.joints[i]->name ? skin.joints[i]->name : "");
      if (found == jointByName.end()) return fail("skin references a joint outside the skeleton root");
      remap[i] = found->second; float matrix[16];
      if (!cgltf_accessor_read_float(skin.inverse_bind_matrices, i, matrix, 16)) return fail("invalid inverse bind matrix");
      for (float f : matrix) if (!std::isfinite(f)) return fail("non-finite bind matrix");
      for (int c = 0; c < 4; ++c) inverseBind[i].cols[c] = simd_float4::LoadPtrU(matrix + c * 4);
    }
    const auto& p = meshNode->mesh->primitives[0];
    if (p.type != cgltf_primitive_type_triangles || p.targets_count) return fail("only triangle skins without morph targets are supported");
    if (p.material && (p.material->alpha_mode != cgltf_alpha_mode_opaque || p.material->pbr_metallic_roughness.base_color_texture.texture ||
        p.material->pbr_metallic_roughness.metallic_roughness_texture.texture || p.material->normal_texture.texture ||
        p.material->occlusion_texture.texture || p.material->emissive_texture.texture)) return fail("skin profile supports opaque flat base color; bake/remove textures");
    for (size_t i = 0; i < p.attributes_count; ++i) if (p.attributes[i].index > 0 &&
        (p.attributes[i].type == cgltf_attribute_type_joints || p.attributes[i].type == cgltf_attribute_type_weights)) return fail("more than four influences per vertex unsupported");
    const auto* pos = attribute(p, cgltf_attribute_type_position);
    const auto* nrm = attribute(p, cgltf_attribute_type_normal);
    const auto* jnt = attribute(p, cgltf_attribute_type_joints);
    const auto* wgt = attribute(p, cgltf_attribute_type_weights);
    if (!pos || !nrm || !jnt || !wgt || !p.indices || pos->count > maxVertices || pos->count == 0 ||
        nrm->count != pos->count || jnt->count != pos->count || wgt->count != pos->count) return fail("missing skin attributes or 4096-vertex budget exceeded");
    positions.resize(pos->count * 3); normals.resize(pos->count * 3); joints.resize(pos->count * 4); weights.resize(pos->count * 4);
    for (size_t i = 0; i < pos->count; ++i) {
      float joint[4], weight[4];
      if (!cgltf_accessor_read_float(pos, i, positions.data() + i * 3, 3) || !cgltf_accessor_read_float(nrm, i, normals.data() + i * 3, 3) ||
          !cgltf_accessor_read_float(jnt, i, joint, 4) || !cgltf_accessor_read_float(wgt, i, weight, 4)) return fail("invalid vertex accessor");
      float total = 0;
      for (int k = 0; k < 4; ++k) {
        if (!std::isfinite(joint[k]) || joint[k] < 0 || joint[k] >= skin.joints_count || joint[k] != std::floor(joint[k]) || !std::isfinite(weight[k]) || weight[k] < 0) return fail("invalid joint index/weight");
        joints[i * 4 + k] = uint16_t(joint[k]); total += weight[k];
      }
      if (std::abs(total - 1) > .001f) return fail("vertex weights must sum to one");
      for (int k = 0; k < 4; ++k) weights[i * 4 + k] = weight[k] / total;
      for (int k = 0; k < 3; ++k) if (!std::isfinite(positions[i*3+k]) || !std::isfinite(normals[i*3+k])) return fail("non-finite vertex");
    }
    indices.resize(p.indices->count);
    if (indices.size() > 8192*3) return fail("skin exceeds 8192-triangle budget");
    if (indices.size() % 3) return fail("incomplete triangle indices");
    for (size_t i = 0; i < indices.size(); ++i) { auto index = cgltf_accessor_read_index(p.indices, i); if (index >= pos->count) return fail("vertex index out of range"); indices[i] = int32_t(index); }
    if (p.material && p.material->has_pbr_metallic_roughness) {
      const auto* c = p.material->pbr_metallic_roughness.base_color_factor;
      color = (uint32_t(std::clamp(c[0], 0.f, 1.f) * 255) << 16) | (uint32_t(std::clamp(c[1], 0.f, 1.f) * 255) << 8) | uint32_t(std::clamp(c[2], 0.f, 1.f) * 255);
    }
    if (const auto* col = attribute(p, cgltf_attribute_type_color)) {
      if (col->count != pos->count) return fail("invalid vertex color count");
      colors.resize(pos->count);
      for (size_t i = 0; i < col->count; ++i) {
        float c[4] = {1,1,1,1};
        if (!cgltf_accessor_read_float(col, i, c, 4)) return fail("invalid vertex colors");
        for (float v : c) if (!std::isfinite(v) || v < 0 || v > 1) return fail("invalid vertex color value");
        colors[i] = (uint32_t(c[0]*255) << 16) | (uint32_t(c[1]*255) << 8) | uint32_t(c[2]*255);
      }
    }
    for (size_t i = 0; i < raw->animations_count; ++i) if (!animation(raw->animations[i])) return false;
    sourceNodes.clear();
    models.resize(skeleton->num_joints()); a.resize(skeleton->num_soa_joints()); b.resize(a.size()); blended.resize(a.size());
    contextA.Resize(skeleton->num_joints()); contextB.Resize(skeleton->num_joints());
    outputPositions.resize(positions.size()); outputNormals.resize(normals.size());
    return sample(-1, 0, -1, 0, 0);
  }
  bool animation(const cgltf_animation& source) {
    if (!source.name || !*source.name || std::string(source.name).find('|') != std::string::npos) return fail("animation must have a nonempty name without |");
    for (const auto& clip : clips) if (clip.name == source.name) return fail("duplicate clip name");
    RawAnimation raw; raw.name = source.name; raw.tracks.resize(skeleton->num_joints());
    for (auto* node : sourceNodes) {
      auto& track = raw.tracks[jointByName[node->name]];
      track.translations.push_back({0, {node->translation[0], node->translation[1], node->translation[2]}});
      track.rotations.push_back({0, {node->rotation[0], node->rotation[1], node->rotation[2], node->rotation[3]}});
      track.scales.push_back({0, {node->scale[0], node->scale[1], node->scale[2]}});
    }
    float duration = 0;
    for (size_t i = 0; i < source.channels_count; ++i) {
      const auto& channel = source.channels[i]; const auto* sampler = channel.sampler;
      auto found = channel.target_node && channel.target_node->name ? jointByName.find(channel.target_node->name) : jointByName.end();
      if (found == jointByName.end() || !sampler || (sampler->interpolation != cgltf_interpolation_type_linear && sampler->interpolation != cgltf_interpolation_type_step) || !sampler->input || !sampler->output || sampler->input->count != sampler->output->count) return fail(std::string(source.name) + ": only LINEAR and constant STEP skeletal channels are supported; bake the clip");
      auto& track = raw.tracks[found->second];
      if (channel.target_path == cgltf_animation_path_type_translation) track.translations.clear();
      else if (channel.target_path == cgltf_animation_path_type_rotation) track.rotations.clear();
      else if (channel.target_path == cgltf_animation_path_type_scale) track.scales.clear();
      else return fail(std::string(source.name) + ": unsupported morph/animation path");
      float first[4] = {};
      for (size_t k = 0; k < sampler->input->count; ++k) {
        float time, value[4] = {0, 0, 0, 1};
        const int count = channel.target_path == cgltf_animation_path_type_rotation ? 4 : 3;
        if (!cgltf_accessor_read_float(sampler->input, k, &time, 1) || !cgltf_accessor_read_float(sampler->output, k, value, count) || !std::isfinite(time) || time < 0) return fail("invalid clip key");
        for (int v = 0; v < count; ++v) if (!std::isfinite(value[v])) return fail("non-finite clip value");
        if (k == 0) std::copy(value, value+count, first);
        if (sampler->interpolation == cgltf_interpolation_type_step) for (int v = 0; v < count; ++v) if (std::abs(value[v]-first[v]) > 1e-7f) return fail(std::string(source.name) + ": changing STEP channel must be baked to LINEAR");
        duration = std::max(duration, time);
        if (channel.target_path == cgltf_animation_path_type_translation) track.translations.push_back({time, {value[0], value[1], value[2]}});
        if (channel.target_path == cgltf_animation_path_type_rotation) {
          float norm = value[0]*value[0]+value[1]*value[1]+value[2]*value[2]+value[3]*value[3];
          if (std::abs(norm-1) > .001f) return fail("clip quaternion must be normalized");
          track.rotations.push_back({time, {value[0], value[1], value[2], value[3]}});
        }
        if (channel.target_path == cgltf_animation_path_type_scale) {
          if (value[0] <= 0 || std::abs(value[0]-value[1]) > 1e-5 || std::abs(value[0]-value[2]) > 1e-5) return fail("animated nonuniform/negative scale unsupported");
          track.scales.push_back({time, {value[0], value[1], value[2]}});
        }
      }
    }
    raw.duration = duration;
    if (!raw.Validate()) return fail(std::string(source.name) + ": invalid clip duration/order");
    auto built = ozz::animation::offline::AnimationBuilder()(raw);
    if (!built) return fail("ozz animation compression failed");
    clips.push_back({source.name, std::move(built)}); return true;
  }
  bool sampling(int clip, double time, ozz::animation::SamplingJob::Context& context, ozz::vector<SoaTransform>& output) {
    if (clip == -1) { std::copy(skeleton->joint_rest_poses().begin(), skeleton->joint_rest_poses().end(), output.begin()); return true; }
    if (clip < 0 || size_t(clip) >= clips.size() || !std::isfinite(time)) return fail("invalid clip/time");
    const auto* animation = clips[clip].animation.get();
    ozz::animation::SamplingJob job; job.animation = animation; job.context = &context;
    job.ratio = std::clamp(float(time / animation->duration()), 0.f, 1.f); job.output = ozz::make_span(output);
    return job.Run() || fail("ozz sampling failed");
  }
  bool sample(int clipA, double timeA, int clipB, double timeB, double weight) {
    if (!std::isfinite(weight) || weight < 0 || weight > 1) return fail("blend must be within 0..1");
    if (!sampling(clipA, timeA, contextA, a) || !sampling(clipB, timeB, contextB, b)) return false;
    ozz::animation::BlendingJob::Layer layers[2];
    layers[0].weight = float(1-weight); layers[0].transform = ozz::make_span(a);
    layers[1].weight = float(weight); layers[1].transform = ozz::make_span(b);
    ozz::animation::BlendingJob blend; blend.layers = ozz::make_span(layers); blend.rest_pose = skeleton->joint_rest_poses(); blend.output = ozz::make_span(blended);
    if (!blend.Run()) return fail("ozz blending failed");
    ozz::animation::LocalToModelJob modelsJob; modelsJob.skeleton = skeleton.get(); modelsJob.input = ozz::make_span(blended); modelsJob.output = ozz::make_span(models);
    if (!modelsJob.Run()) return fail("ozz local-to-model failed");
    for (size_t i = 0; i < palette.size(); ++i) palette[i] = models[remap[i]] * inverseBind[i];
    ozz::geometry::SkinningJob skin;
    skin.vertex_count = int(positions.size()/3); skin.influences_count = 4;
    skin.joint_matrices = ozz::make_span(palette); skin.joint_indices = ozz::make_span(joints); skin.joint_indices_stride = 4*sizeof(uint16_t);
    skin.joint_weights = ozz::make_span(weights); skin.joint_weights_stride = 4*sizeof(float);
    skin.in_positions = ozz::make_span(positions); skin.in_positions_stride = 3*sizeof(float);
    skin.in_normals = ozz::make_span(normals); skin.in_normals_stride = 3*sizeof(float);
    skin.out_positions = ozz::make_span(outputPositions); skin.out_positions_stride = 3*sizeof(float);
    skin.out_normals = ozz::make_span(outputNormals); skin.out_normals_stride = 3*sizeof(float);
    return skin.Run() || fail("ozz CPU skinning failed");
  }
};
} // namespace zn_animation
