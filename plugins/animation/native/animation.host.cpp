#define ZRT_HOSTED_CPP
#include "zinc_native_animation.h"
#include "skin_runtime.h"

struct HostAnimation : NativeAnimation {
  std::vector<std::unique_ptr<zn_animation::Skin>> skins;
  std::string lastError;
  zn_animation::Skin* get(int32_t handle) { return handle >= 0 && size_t(handle) < skins.size() ? skins[handle].get() : nullptr; }
  zrt::String version() override { return zrt::String::from("ozz-animation 0.17.0", 20); }
  zrt::String error() override { return zrt::String::from(lastError.data(), uint32_t(lastError.size())); }
  int32_t open(zrt::Array<uint8_t> data) override {
    auto skin = std::make_unique<zn_animation::Skin>();
    if (!data.a || !skin->load(data.a->data, size_t(data.length()))) { lastError = skin->error; return -1; }
    lastError.clear();
    for (size_t i = 0; i < skins.size(); ++i) if (!skins[i]) { skins[i] = std::move(skin); return int32_t(i); }
    skins.push_back(std::move(skin)); return int32_t(skins.size()-1);
  }
  void close(int32_t handle) override { if (get(handle)) skins[handle].reset(); }
  zrt::String clips(int32_t handle) override {
    auto* s = get(handle); std::string names;
    if (s) for (const auto& c : s->clips) { if (!names.empty()) names += '|'; names += c.name; }
    return zrt::String::from(names.data(), uint32_t(names.size()));
  }
  double duration(int32_t h, int32_t clip) override { auto* s = get(h); return s && clip >= 0 && size_t(clip) < s->clips.size() ? s->clips[clip].animation->duration() : 0; }
  int32_t vertices(int32_t h) override { auto* s = get(h); return s ? int32_t(s->positions.size()/3) : 0; }
  int32_t joints(int32_t h) override { auto* s = get(h); return s ? s->skeleton->num_joints() : 0; }
  zrt::String signature(int32_t h) override {
    auto* s = get(h); std::string result;
    if (s) for (int i = 0; i < s->skeleton->num_joints(); ++i) {
      const std::string name=s->skeleton->joint_names()[i];
      result += std::to_string(s->skeleton->joint_parents()[i]) + ":" + std::to_string(name.size()) + ":" + name + ";";
    }
    return zrt::String::from(result.data(), uint32_t(result.size()));
  }
  uint32_t color(int32_t h) override { auto* s = get(h); return s ? s->color : 0; }
  zrt::Array<int32_t> indices(int32_t h) override {
    auto* s = get(h); auto out = zrt::Array<int32_t>::with_cap(s ? int32_t(s->indices.size()) : 0);
    if (s) for (auto i : s->indices) out.push_raw(i);
    return out;
  }
  zrt::Array<int32_t> colors(int32_t h) override {
    auto* s = get(h); auto out = zrt::Array<int32_t>::with_cap(s ? int32_t(s->colors.size()) : 0);
    if (s) for (auto color : s->colors) out.push_raw(color);
    return out;
  }
  bool geometry(int32_t h, zrt::Array<double> p, zrt::Array<double> n) override {
    auto* s = get(h); if (!s || size_t(p.length()) != s->outputPositions.size() || size_t(n.length()) != s->outputNormals.size()) return false;
    for (size_t i = 0; i < s->outputPositions.size(); ++i) { p.a->data[i] = s->outputPositions[i]; n.a->data[i] = s->outputNormals[i]; }
    return true;
  }
  bool sample(int32_t h, int32_t a, double ta, int32_t b, double tb, double weight, zrt::Array<double> p, zrt::Array<double> n) override {
    auto* s = get(h); if (!s) return false;
    if (!s->sample(a, ta, b, tb, weight)) { lastError = s->error; return false; }
    return geometry(h, p, n);
  }
  bool joint(int32_t h, zrt::String name, zrt::Array<double> matrix) override {
    auto* s = get(h); if (!s || matrix.length() != 16) return false;
    auto found = s->jointByName.find(std::string(name.ptr(), name.bytes())); if (found == s->jointByName.end()) return false;
    for (int c = 0; c < 4; ++c) { float v[4]; ozz::math::StorePtrU(s->models[found->second].cols[c], v); for (int r = 0; r < 4; ++r) matrix.a->data[c*4+r] = v[r]; }
    return true;
  }
};
NativeAnimation* zinc_create_Animation() { static HostAnimation instance; instance.rc = zrt::IMMORTAL; return &instance; }
