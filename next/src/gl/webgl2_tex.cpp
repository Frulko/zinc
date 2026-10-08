// WebGL 2.0 textures, samplers, queries, sync objects, transform feedback and framebuffer blits (ZN-203.07).
#include <algorithm>
#include <cstring>

#include "gl/webgl1.h"
#include "glad/gl.h"

namespace zn::gl {
namespace {

struct Fmt { std::uint32_t internal, format, type; int bpp; };
#define F(i, f, t, b) {GL_##i, f, t, b}
constexpr std::uint32_t HALF = 0x140B, U1010102 = 0x8368, U10F11F11F = 0x8C3B, U5999 = 0x8C3E, U248 = 0x84FA, F32U248 = 0x8DAD;
constexpr std::uint32_t RED_ = 0x1903, RG_ = 0x8227, REDI = 0x8D94, RGI = 0x8228, RGBI = 0x8D98, RGBAI = 0x8D99, DEPTH_ = 0x1902, DEPTHST = 0x84F9;
// The sized and unsized combinations of texImage2D / texImage3D in WebGL 2 (ES 3.0 table 3.2)
const Fmt kFormats[] = {
  F(R8, RED_, GL_UNSIGNED_BYTE, 1), F(R8_SNORM, RED_, GL_BYTE, 1), F(R16F, RED_, HALF, 2), F(R16F, RED_, GL_FLOAT, 4), F(R32F, RED_, GL_FLOAT, 4),
  F(R8UI, REDI, GL_UNSIGNED_BYTE, 1), F(R8I, REDI, GL_BYTE, 1), F(R16UI, REDI, GL_UNSIGNED_SHORT, 2), F(R16I, REDI, GL_SHORT, 2), F(R32UI, REDI, GL_UNSIGNED_INT, 4), F(R32I, REDI, GL_INT, 4),
  F(RG8, RG_, GL_UNSIGNED_BYTE, 2), F(RG8_SNORM, RG_, GL_BYTE, 2), F(RG16F, RG_, HALF, 4), F(RG16F, RG_, GL_FLOAT, 8), F(RG32F, RG_, GL_FLOAT, 8),
  F(RG8UI, RGI, GL_UNSIGNED_BYTE, 2), F(RG8I, RGI, GL_BYTE, 2), F(RG16UI, RGI, GL_UNSIGNED_SHORT, 4), F(RG16I, RGI, GL_SHORT, 4), F(RG32UI, RGI, GL_UNSIGNED_INT, 8), F(RG32I, RGI, GL_INT, 8),
  F(RGB8, GL_RGB, GL_UNSIGNED_BYTE, 3), F(SRGB8, GL_RGB, GL_UNSIGNED_BYTE, 3), F(RGB565, GL_RGB, GL_UNSIGNED_BYTE, 3), F(RGB565, GL_RGB, GL_UNSIGNED_SHORT_5_6_5, 2), F(RGB8_SNORM, GL_RGB, GL_BYTE, 3),
  F(R11F_G11F_B10F, GL_RGB, U10F11F11F, 4), F(R11F_G11F_B10F, GL_RGB, HALF, 6), F(R11F_G11F_B10F, GL_RGB, GL_FLOAT, 12), F(RGB9_E5, GL_RGB, U5999, 4), F(RGB9_E5, GL_RGB, HALF, 6), F(RGB9_E5, GL_RGB, GL_FLOAT, 12),
  F(RGB16F, GL_RGB, HALF, 6), F(RGB16F, GL_RGB, GL_FLOAT, 12), F(RGB32F, GL_RGB, GL_FLOAT, 12),
  F(RGB8UI, RGBI, GL_UNSIGNED_BYTE, 3), F(RGB8I, RGBI, GL_BYTE, 3), F(RGB16UI, RGBI, GL_UNSIGNED_SHORT, 6), F(RGB16I, RGBI, GL_SHORT, 6), F(RGB32UI, RGBI, GL_UNSIGNED_INT, 12), F(RGB32I, RGBI, GL_INT, 12),
  F(RGBA8, GL_RGBA, GL_UNSIGNED_BYTE, 4), F(SRGB8_ALPHA8, GL_RGBA, GL_UNSIGNED_BYTE, 4), F(RGBA8_SNORM, GL_RGBA, GL_BYTE, 4),
  F(RGB5_A1, GL_RGBA, GL_UNSIGNED_BYTE, 4), F(RGB5_A1, GL_RGBA, GL_UNSIGNED_SHORT_5_5_5_1, 2), F(RGB5_A1, GL_RGBA, U1010102, 4),
  F(RGBA4, GL_RGBA, GL_UNSIGNED_BYTE, 4), F(RGBA4, GL_RGBA, GL_UNSIGNED_SHORT_4_4_4_4, 2), F(RGB10_A2, GL_RGBA, U1010102, 4),
  F(RGBA16F, GL_RGBA, HALF, 8), F(RGBA16F, GL_RGBA, GL_FLOAT, 16), F(RGBA32F, GL_RGBA, GL_FLOAT, 16),
  F(RGBA8UI, RGBAI, GL_UNSIGNED_BYTE, 4), F(RGBA8I, RGBAI, GL_BYTE, 4), F(RGB10_A2UI, RGBAI, U1010102, 4), F(RGBA16UI, RGBAI, GL_UNSIGNED_SHORT, 8), F(RGBA16I, RGBAI, GL_SHORT, 8), F(RGBA32UI, RGBAI, GL_UNSIGNED_INT, 16), F(RGBA32I, RGBAI, GL_INT, 16),
  F(DEPTH_COMPONENT16, DEPTH_, GL_UNSIGNED_SHORT, 2), F(DEPTH_COMPONENT16, DEPTH_, GL_UNSIGNED_INT, 4), F(DEPTH_COMPONENT24, DEPTH_, GL_UNSIGNED_INT, 4), F(DEPTH_COMPONENT32F, DEPTH_, GL_FLOAT, 4),
  F(DEPTH24_STENCIL8, DEPTHST, U248, 4), F(DEPTH32F_STENCIL8, DEPTHST, F32U248, 8),
};
#undef F

bool sizedFormat(std::uint32_t internal) { for (const Fmt& f : kFormats) if (f.internal == internal) return true; return false; }
bool lookup(std::uint32_t internal, std::uint32_t format, std::uint32_t type, int& bpp) {
  for (const Fmt& f : kFormats) if (f.internal == internal && f.format == format && f.type == type) { bpp = f.bpp; return true; }
  return false;
}
bool isUnsizedLegacy(std::uint32_t f) { return f == GL_ALPHA || f == GL_RGB || f == GL_RGBA || f == GL_LUMINANCE || f == GL_LUMINANCE_ALPHA; }
int levelsFor(int w, int h, int d) { int m = std::max({w, h, d}), n = 1; while (m > 1) { m >>= 1; ++n; } return n; }

}  // namespace

Id& WebGL1::boundTex(std::uint32_t target) {
  switch (target) {
    case GL_TEXTURE_CUBE_MAP: return texCube_[activeUnit_];
    case GL_TEXTURE_3D: return tex3d_[activeUnit_];
    case GL_TEXTURE_2D_ARRAY: return texArr_[activeUnit_];
    default: return tex2d_[activeUnit_];
  }
}

// One upload for texImage2D (sized), texImage3D, texSubImage3D and the texStorage calls. Returns false after setting the error.
bool WebGL1::uploadTexture(bool storage, std::uint32_t target, int level, std::uint32_t ifmt, int w, int h, int d, std::uint32_t format, std::uint32_t type, const void* data, std::size_t dataBytes, int xoff, int yoff, int zoff, bool sub) {
  const bool face = target >= GL_TEXTURE_CUBE_MAP_POSITIVE_X && target <= GL_TEXTURE_CUBE_MAP_NEGATIVE_Z;
  const bool three = target == GL_TEXTURE_3D || target == GL_TEXTURE_2D_ARRAY;
  const std::uint32_t bindTarget = face ? GL_TEXTURE_CUBE_MAP : target;
  if (!(target == GL_TEXTURE_2D || face || three)) { error(GL_INVALID_ENUM); return false; }
  Id id = boundTex(bindTarget);
  if (!id) { error(GL_INVALID_OPERATION); return false; }
  Tex& t = textures_[id];
  if (storage) {
    if (!sizedFormat(ifmt)) { error(GL_INVALID_ENUM); return false; }
    if (t.immutable) { error(GL_INVALID_OPERATION); return false; }
    int levels = level;   // for storage, `level` carries the level count
    if (levels < 1 || w < 1 || h < 1 || d < 1 || w > maxTexSize_ || h > maxTexSize_ || levels > levelsFor(w, h, target == GL_TEXTURE_3D ? d : 1)) { error(GL_INVALID_VALUE); return false; }
    // glTexStorage* is GL 4.2 (macOS stops at 4.1): the levels are allocated one by one, which looks the same once the wrapper refuses later respecification
    std::uint32_t fmt = 0, typ = 0;
    for (const Fmt& f : kFormats) if (f.internal == ifmt) { fmt = f.format; typ = f.type; break; }
    int lw = w, lh = h, ld = d;
    for (int l = 0; l < levels; ++l) {
      if (three) glTexImage3D(bindTarget, l, static_cast<GLint>(ifmt), lw, lh, target == GL_TEXTURE_3D ? ld : d, 0, fmt, typ, nullptr);
      else if (bindTarget == GL_TEXTURE_CUBE_MAP) for (int f = 0; f < 6; ++f) glTexImage2D(GL_TEXTURE_CUBE_MAP_POSITIVE_X + f, l, static_cast<GLint>(ifmt), lw, lh, 0, fmt, typ, nullptr);
      else glTexImage2D(bindTarget, l, static_cast<GLint>(ifmt), lw, lh, 0, fmt, typ, nullptr);
      lw = std::max(1, lw / 2); lh = std::max(1, lh / 2); ld = std::max(1, ld / 2);
    }
    glTexParameteri(bindTarget, GL_TEXTURE_MAX_LEVEL, levels - 1);
    t.immutable = true; t.levels = levels; t.w = w; t.h = h; t.d = d; t.format = ifmt;
    return true;
  }
  if (t.immutable && !sub) { error(GL_INVALID_OPERATION); return false; }   // storage fixed the sizes
  int bpp = 0;
  const bool legacy = !sub && isUnsizedLegacy(ifmt) && ifmt == format;   // unsized RGBA on a 3D or array texture too: three.js does it for its placeholders and browsers accept it
  if (!legacy) {
    const std::uint32_t lookupFormat = sub ? 0 : ifmt;
    if (sub) {   // the format of the existing level decides; here the (format, type) pair must exist for some internal format
      bool any = false;
      for (const Fmt& f : kFormats) if (f.format == format && f.type == type) { bpp = f.bpp; any = true; break; }
      if (!any && isUnsizedLegacy(format) && formatType(format, type, bpp)) any = true;
      if (!any) { error(GL_INVALID_OPERATION); return false; }
    } else if (!lookup(lookupFormat, format, type, bpp)) {
      error(sizedFormat(ifmt) || isUnsizedLegacy(ifmt) ? GL_INVALID_OPERATION : GL_INVALID_ENUM);
      return false;
    }
  } else if (!formatType(format, type, bpp)) { error(GL_INVALID_OPERATION); return false; }
  if (level < 0 || w < 0 || h < 0 || d < 0 || w > maxTexSize_ || h > maxTexSize_ || (three && d > 2048)) { error(GL_INVALID_VALUE); return false; }
  if (data) {
    const std::size_t row = (static_cast<std::size_t>(w) * bpp + unpackAlignment_ - 1) / unpackAlignment_ * unpackAlignment_;
    const std::size_t need = (h && w && d) ? row * static_cast<std::size_t>(h) * (d - 1) + row * (h - 1) + static_cast<std::size_t>(w) * bpp : 0;
    if (dataBytes < need) { error(GL_INVALID_OPERATION); return false; }
  }
  if (sub) {
    if (xoff < 0 || yoff < 0 || zoff < 0) { error(GL_INVALID_VALUE); return false; }
    if (three) glTexSubImage3D(bindTarget == target ? target : target, level, xoff, yoff, zoff, w, h, d, format, type, data);
    else glTexSubImage2D(target, level, xoff, yoff, w, h, format, type, data);
    return true;
  }
  if (three) glTexImage3D(target, level, static_cast<GLint>(ifmt), w, h, d, 0, format, type, data);
  else glTexImage2D(target, level, static_cast<GLint>(ifmt), w, h, 0, format, type, data);
  if (level == 0) { t.w = w; t.h = h; t.d = d; t.format = format; }
  return true;
}

void WebGL1::texImage3D(std::uint32_t target, int level, std::uint32_t ifmt, int w, int h, int d, int border, std::uint32_t format, std::uint32_t type, const void* data, std::size_t bytes) {
  if (version_ != 2) return error(GL_INVALID_OPERATION);
  if (target != GL_TEXTURE_3D && target != GL_TEXTURE_2D_ARRAY) return error(GL_INVALID_ENUM);
  if (border != 0) return error(GL_INVALID_VALUE);
  uploadTexture(false, target, level, ifmt, w, h, d, format, type, data, bytes, 0, 0, 0, false);
}
void WebGL1::texSubImage3D(std::uint32_t target, int level, int x, int y, int z, int w, int h, int d, std::uint32_t format, std::uint32_t type, const void* data, std::size_t bytes) {
  if (version_ != 2) return error(GL_INVALID_OPERATION);
  if (target != GL_TEXTURE_3D && target != GL_TEXTURE_2D_ARRAY) return error(GL_INVALID_ENUM);
  if (!data) return error(GL_INVALID_VALUE);
  uploadTexture(false, target, level, 0, w, h, d, format, type, data, bytes, x, y, z, true);
}
void WebGL1::texStorage2D(std::uint32_t target, int levels, std::uint32_t ifmt, int w, int h) {
  if (version_ != 2) return error(GL_INVALID_OPERATION);
  if (target != GL_TEXTURE_2D && target != GL_TEXTURE_CUBE_MAP) return error(GL_INVALID_ENUM);
  uploadTexture(true, target, levels, ifmt, w, h, 1, 0, 0, nullptr, 0, 0, 0, 0, false);
}
void WebGL1::texStorage3D(std::uint32_t target, int levels, std::uint32_t ifmt, int w, int h, int d) {
  if (version_ != 2) return error(GL_INVALID_OPERATION);
  if (target != GL_TEXTURE_3D && target != GL_TEXTURE_2D_ARRAY) return error(GL_INVALID_ENUM);
  uploadTexture(true, target, levels, ifmt, w, h, d, 0, 0, nullptr, 0, 0, 0, 0, false);
}
void WebGL1::copyTexSubImage3D(std::uint32_t target, int level, int xo, int yo, int zo, int x, int y, int w, int h) {
  if (version_ != 2) return error(GL_INVALID_OPERATION);
  if (target != GL_TEXTURE_3D && target != GL_TEXTURE_2D_ARRAY) return error(GL_INVALID_ENUM);
  if (level < 0 || xo < 0 || yo < 0 || zo < 0 || w < 0 || h < 0) return error(GL_INVALID_VALUE);
  if (!boundTex(target)) return error(GL_INVALID_OPERATION);
  glCopyTexSubImage3D(target, level, xo, yo, zo, x, y, w, h);
}

// ---- samplers
Id WebGL1::createSampler() { if (version_ != 2) { error(GL_INVALID_OPERATION); return 0; } Sampler s; glGenSamplers(1, &s.name); Id id = nextId_++; samplers_[id] = s; return id; }
void WebGL1::deleteSampler(Id id) {
  auto it = samplers_.find(id);
  if (it == samplers_.end()) return;
  for (int u = 0; u < 8; ++u) if (samplerUnit_[u] == id) samplerUnit_[u] = 0;
  glDeleteSamplers(1, &it->second.name);
  samplers_.erase(it);
}
void WebGL1::bindSampler(std::uint32_t unit, Id id) {
  if (unit >= 8) return error(GL_INVALID_VALUE);
  std::uint32_t name = 0;
  if (id) { auto it = samplers_.find(id); if (it == samplers_.end()) return error(GL_INVALID_OPERATION); it->second.bound = true; name = it->second.name; }
  samplerUnit_[unit] = id;
  glBindSampler(unit, name);
}
static bool samplerParamOk(std::uint32_t pname, int v) {
  switch (pname) {
    case GL_TEXTURE_MIN_FILTER: return v == GL_NEAREST || v == GL_LINEAR || v == GL_NEAREST_MIPMAP_NEAREST || v == GL_LINEAR_MIPMAP_NEAREST || v == GL_NEAREST_MIPMAP_LINEAR || v == GL_LINEAR_MIPMAP_LINEAR;
    case GL_TEXTURE_MAG_FILTER: return v == GL_NEAREST || v == GL_LINEAR;
    case GL_TEXTURE_WRAP_S: case GL_TEXTURE_WRAP_T: case GL_TEXTURE_WRAP_R: return v == GL_REPEAT || v == GL_CLAMP_TO_EDGE || v == GL_MIRRORED_REPEAT;
    case GL_TEXTURE_COMPARE_MODE: return v == GL_NONE || v == GL_COMPARE_REF_TO_TEXTURE;
    case GL_TEXTURE_COMPARE_FUNC: return v >= GL_NEVER && v <= GL_ALWAYS;
    case GL_TEXTURE_MIN_LOD: case GL_TEXTURE_MAX_LOD: return true;
  }
  return false;
}
void WebGL1::samplerParameteri(Id id, std::uint32_t pname, int v) {
  auto it = samplers_.find(id);
  if (it == samplers_.end()) return error(GL_INVALID_OPERATION);
  if (!samplerParamOk(pname, v)) return error(GL_INVALID_ENUM);
  glSamplerParameteri(it->second.name, pname, v);
}
void WebGL1::samplerParameterf(Id id, std::uint32_t pname, float v) {
  auto it = samplers_.find(id);
  if (it == samplers_.end()) return error(GL_INVALID_OPERATION);
  if (!samplerParamOk(pname, static_cast<int>(v))) return error(GL_INVALID_ENUM);
  glSamplerParameterf(it->second.name, pname, v);
}
WebGL1::Param WebGL1::getSamplerParameter(Id id, std::uint32_t pname) {
  Param r;
  auto it = samplers_.find(id);
  if (it == samplers_.end()) { error(GL_INVALID_OPERATION); return r; }
  if (!samplerParamOk(pname, pname == GL_TEXTURE_MIN_LOD || pname == GL_TEXTURE_MAX_LOD ? 0 : GL_NEAREST) && pname != GL_TEXTURE_COMPARE_MODE && pname != GL_TEXTURE_COMPARE_FUNC && pname != GL_TEXTURE_WRAP_S && pname != GL_TEXTURE_WRAP_T && pname != GL_TEXTURE_WRAP_R && pname != GL_TEXTURE_MAG_FILTER) { error(GL_INVALID_ENUM); return r; }
  r.ok = true;
  if (pname == GL_TEXTURE_MIN_LOD || pname == GL_TEXTURE_MAX_LOD) { GLfloat f = 0; glGetSamplerParameterfv(it->second.name, pname, &f); r.kind = 'f'; r.v.push_back(f); }
  else { GLint i = 0; glGetSamplerParameteriv(it->second.name, pname, &i); r.kind = 'i'; r.v.push_back(i); }
  return r;
}

// ---- queries
Id WebGL1::createQuery() { if (version_ != 2) { error(GL_INVALID_OPERATION); return 0; } Query q; glGenQueries(1, &q.name); Id id = nextId_++; queries_[id] = q; return id; }
void WebGL1::deleteQuery(Id id) { auto it = queries_.find(id); if (it == queries_.end()) return; glDeleteQueries(1, &it->second.name); queries_.erase(it); }
static bool queryTarget(std::uint32_t t) { return t == 0x8C2F || t == 0x8D6A || t == 0x8C88; }   // ANY_SAMPLES_PASSED, ..._CONSERVATIVE, TRANSFORM_FEEDBACK_PRIMITIVES_WRITTEN
void WebGL1::beginQuery(std::uint32_t target, Id id) {
  if (!queryTarget(target)) return error(GL_INVALID_ENUM);
  auto it = queries_.find(id);
  if (!id || it == queries_.end()) return error(GL_INVALID_OPERATION);
  if (activeQuery_[target] || it->second.active) return error(GL_INVALID_OPERATION);
  if (it->second.used && it->second.target != target) return error(GL_INVALID_OPERATION);   // a query keeps its target
  it->second.target = target; it->second.used = true; it->second.active = true;
  activeQuery_[target] = id;
  glBeginQuery(target == 0x8D6A ? 0x8C2F : target, it->second.name);
}
void WebGL1::endQuery(std::uint32_t target) {
  if (!queryTarget(target)) return error(GL_INVALID_ENUM);
  Id id = activeQuery_[target];
  if (!id) return error(GL_INVALID_OPERATION);
  queries_[id].active = false;
  activeQuery_[target] = 0;
  glEndQuery(target == 0x8D6A ? 0x8C2F : target);
}
WebGL1::Param WebGL1::getQuery(std::uint32_t target, std::uint32_t pname) {
  Param r;
  if (!queryTarget(target) || pname != 0x8865) { error(GL_INVALID_ENUM); return r; }   // CURRENT_QUERY
  Id id = activeQuery_[target];
  r.ok = true; r.kind = id ? 'o' : 'n'; r.object = id; r.objKind = 10;
  return r;
}
WebGL1::Param WebGL1::getQueryParameter(Id id, std::uint32_t pname) {
  Param r;
  auto it = queries_.find(id);
  if (it == queries_.end() || it->second.active || !it->second.used) { error(GL_INVALID_OPERATION); return r; }
  if (pname != 0x8866 && pname != 0x8867) { error(GL_INVALID_ENUM); return r; }   // QUERY_RESULT, QUERY_RESULT_AVAILABLE
  GLuint v = 0;
  glGetQueryObjectuiv(it->second.name, pname, &v);
  r.ok = true;
  r.kind = pname == 0x8867 ? 'b' : (it->second.target == 0x8C88 ? 'i' : 'b');
  r.v.push_back(v);
  return r;
}

// ---- sync objects
Id WebGL1::fenceSync(std::uint32_t condition, std::uint32_t flags) {
  if (version_ != 2 || condition != GL_SYNC_GPU_COMMANDS_COMPLETE) { error(GL_INVALID_ENUM); return 0; }
  if (flags != 0) { error(GL_INVALID_VALUE); return 0; }
  GLsync s = glFenceSync(condition, 0);
  Id id = nextId_++;
  syncs_[id] = s;
  return id;
}
void WebGL1::deleteSync(Id id) { auto it = syncs_.find(id); if (it == syncs_.end()) return; glDeleteSync(static_cast<GLsync>(it->second)); syncs_.erase(it); }
std::uint32_t WebGL1::clientWaitSync(Id id, std::uint32_t flags, double timeoutNs) {
  auto it = syncs_.find(id);
  if (it == syncs_.end()) { error(GL_INVALID_OPERATION); return GL_WAIT_FAILED; }
  if (flags & ~static_cast<std::uint32_t>(GL_SYNC_FLUSH_COMMANDS_BIT)) { error(GL_INVALID_VALUE); return GL_WAIT_FAILED; }
  if (timeoutNs < 0 || timeoutNs > 1e9) { error(GL_INVALID_OPERATION); return GL_WAIT_FAILED; }   // WebGL caps the wait at MAX_CLIENT_WAIT_TIMEOUT_WEBGL (0 in the spec's sense)
  return glClientWaitSync(static_cast<GLsync>(it->second), flags, static_cast<GLuint64>(timeoutNs));
}
void WebGL1::waitSync(Id id, std::uint32_t flags, std::int64_t timeout) {
  auto it = syncs_.find(id);
  if (it == syncs_.end()) return error(GL_INVALID_OPERATION);
  if (flags != 0 || timeout != -1) return error(GL_INVALID_VALUE);
  glWaitSync(static_cast<GLsync>(it->second), 0, GL_TIMEOUT_IGNORED);
}
WebGL1::Param WebGL1::getSyncParameter(Id id, std::uint32_t pname) {
  Param r;
  auto it = syncs_.find(id);
  if (it == syncs_.end()) { error(GL_INVALID_OPERATION); return r; }
  if (pname != GL_OBJECT_TYPE && pname != GL_SYNC_STATUS && pname != GL_SYNC_CONDITION && pname != GL_SYNC_FLAGS) { error(GL_INVALID_ENUM); return r; }
  GLint v = 0;
  glGetSynciv(static_cast<GLsync>(it->second), pname, 1, nullptr, &v);
  r.ok = true; r.kind = 'i'; r.v.push_back(v);
  return r;
}

// ---- transform feedback
Id WebGL1::createTransformFeedback() { if (version_ != 2 || !glGenTransformFeedbacks) { error(GL_INVALID_OPERATION); return 0; } TransformFeedback t; glGenTransformFeedbacks(1, &t.name); Id id = nextId_++; tfs_[id] = t; return id; }   // objects are GL 4.0; GLES 3.0 has them too
void WebGL1::deleteTransformFeedback(Id id) {
  auto it = tfs_.find(id);
  if (it == tfs_.end() || it->second.active) return;
  if (tf_ == id) { tf_ = 0; glBindTransformFeedback(GL_TRANSFORM_FEEDBACK, 0); }
  glDeleteTransformFeedbacks(1, &it->second.name);
  tfs_.erase(it);
}
void WebGL1::bindTransformFeedback(std::uint32_t target, Id id) {
  if (target != GL_TRANSFORM_FEEDBACK) return error(GL_INVALID_ENUM);
  auto cur = tfs_.find(tf_);
  if (cur != tfs_.end() && cur->second.active && !cur->second.paused) return error(GL_INVALID_OPERATION);
  std::uint32_t name = 0;
  if (id) { auto it = tfs_.find(id); if (it == tfs_.end()) return error(GL_INVALID_OPERATION); it->second.bound = true; name = it->second.name; }
  tf_ = id;
  glBindTransformFeedback(GL_TRANSFORM_FEEDBACK, name);
}
void WebGL1::beginTransformFeedback(std::uint32_t mode) {
  if (mode != GL_POINTS && mode != GL_LINES && mode != GL_TRIANGLES) return error(GL_INVALID_ENUM);
  if (!program_) return error(GL_INVALID_OPERATION);
  auto cur = tfs_.find(tf_);
  if (cur != tfs_.end() && cur->second.active) return error(GL_INVALID_OPERATION);
  if (cur != tfs_.end()) cur->second.active = true;
  else tfUnbound_ = 1;
  glBeginTransformFeedback(mode);
}
void WebGL1::endTransformFeedback() {
  auto cur = tfs_.find(tf_);
  if (cur != tfs_.end()) { if (!cur->second.active) return error(GL_INVALID_OPERATION); cur->second.active = false; cur->second.paused = false; }
  else { if (!tfUnbound_) return error(GL_INVALID_OPERATION); tfUnbound_ = 0; }
  glEndTransformFeedback();
}
void WebGL1::pauseTransformFeedback() { auto cur = tfs_.find(tf_); if (cur == tfs_.end() || !cur->second.active || cur->second.paused) return error(GL_INVALID_OPERATION); cur->second.paused = true; glPauseTransformFeedback(); }
void WebGL1::resumeTransformFeedback() { auto cur = tfs_.find(tf_); if (cur == tfs_.end() || !cur->second.active || !cur->second.paused) return error(GL_INVALID_OPERATION); cur->second.paused = false; glResumeTransformFeedback(); }
void WebGL1::transformFeedbackVaryings(Id pid, const std::vector<std::string>& names, std::uint32_t mode) {
  auto p = programs_.find(pid);
  if (p == programs_.end()) return error(GL_INVALID_OPERATION);
  if (mode != GL_INTERLEAVED_ATTRIBS && mode != GL_SEPARATE_ATTRIBS) return error(GL_INVALID_ENUM);
  if (mode == GL_SEPARATE_ATTRIBS && names.size() > 4) return error(GL_INVALID_VALUE);
  std::vector<const char*> v;
  for (const std::string& n : names) v.push_back(n.c_str());
  glTransformFeedbackVaryings(p->second.name, static_cast<GLsizei>(v.size()), v.data(), mode);
}
WebGL1::Active WebGL1::getTransformFeedbackVarying(Id pid, std::uint32_t index) {
  Active a;
  auto p = programs_.find(pid);
  if (p == programs_.end()) { error(GL_INVALID_OPERATION); return a; }
  GLint n = 0;
  glGetProgramiv(p->second.name, GL_TRANSFORM_FEEDBACK_VARYINGS, &n);
  if (index >= static_cast<std::uint32_t>(n)) { error(GL_INVALID_VALUE); return a; }
  char buf[256]; GLsizei len = 0; GLsizei size = 0; GLenum type = 0;
  glGetTransformFeedbackVarying(p->second.name, index, sizeof buf, &len, &size, &type, buf);
  a.name.assign(buf, static_cast<std::size_t>(len)); a.size = size; a.type = type; a.ok = true;
  return a;
}

// ---- blits, multisample storage, clearBuffer
void WebGL1::blitFramebuffer(int sx0, int sy0, int sx1, int sy1, int dx0, int dy0, int dx1, int dy1, std::uint32_t mask, std::uint32_t filter) {
  if (version_ != 2) return error(GL_INVALID_OPERATION);
  if (mask & ~static_cast<std::uint32_t>(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT | GL_STENCIL_BUFFER_BIT)) return error(GL_INVALID_VALUE);
  if (filter != GL_NEAREST && filter != GL_LINEAR) return error(GL_INVALID_ENUM);
  if ((mask & (GL_DEPTH_BUFFER_BIT | GL_STENCIL_BUFFER_BIT)) && filter == GL_LINEAR) return error(GL_INVALID_OPERATION);
  glBlitFramebuffer(sx0, sy0, sx1, sy1, dx0, dy0, dx1, dy1, mask, filter);
}
void WebGL1::renderbufferStorageMultisample(std::uint32_t target, int samples, std::uint32_t fmt, int w, int h) {
  if (version_ != 2) return error(GL_INVALID_OPERATION);
  if (target != GL_RENDERBUFFER) return error(GL_INVALID_ENUM);
  if (samples < 0 || w < 0 || h < 0 || w > maxTexSize_ || h > maxTexSize_) return error(GL_INVALID_VALUE);
  if (!rbo_) return error(GL_INVALID_OPERATION);
  Rbo& r = rbos_[rbo_];
  r.w = w; r.h = h; r.format = fmt;
  glRenderbufferStorageMultisample(GL_RENDERBUFFER, samples, fmt == GL_DEPTH_STENCIL ? GL_DEPTH24_STENCIL8 : fmt, w, h);
}
void WebGL1::clearBufferfv(std::uint32_t buffer, int drawbuffer, const float* v, std::size_t n) {
  if (version_ != 2) return error(GL_INVALID_OPERATION);
  if (buffer != GL_COLOR && buffer != GL_DEPTH) return error(GL_INVALID_ENUM);
  if (drawbuffer < 0 || (buffer == GL_DEPTH && drawbuffer != 0) || drawbuffer >= 4) return error(GL_INVALID_VALUE);
  if (n < (buffer == GL_COLOR ? 4u : 1u)) return error(GL_INVALID_VALUE);
  if (checkFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE) return error(GL_INVALID_FRAMEBUFFER_OPERATION);
  glClearBufferfv(buffer, drawbuffer, v);
}
void WebGL1::clearBufferiv(std::uint32_t buffer, int drawbuffer, const int* v, std::size_t n) {
  if (version_ != 2) return error(GL_INVALID_OPERATION);
  if (buffer != GL_COLOR && buffer != GL_STENCIL) return error(GL_INVALID_ENUM);
  if (drawbuffer < 0 || (buffer == GL_STENCIL && drawbuffer != 0) || drawbuffer >= 4) return error(GL_INVALID_VALUE);
  if (n < (buffer == GL_COLOR ? 4u : 1u)) return error(GL_INVALID_VALUE);
  if (checkFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE) return error(GL_INVALID_FRAMEBUFFER_OPERATION);
  glClearBufferiv(buffer, drawbuffer, v);
}
void WebGL1::clearBufferuiv(std::uint32_t buffer, int drawbuffer, const std::uint32_t* v, std::size_t n) {
  if (version_ != 2) return error(GL_INVALID_OPERATION);
  if (buffer != GL_COLOR) return error(GL_INVALID_ENUM);
  if (drawbuffer < 0 || drawbuffer >= 4) return error(GL_INVALID_VALUE);
  if (n < 4) return error(GL_INVALID_VALUE);
  if (checkFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE) return error(GL_INVALID_FRAMEBUFFER_OPERATION);
  glClearBufferuiv(buffer, drawbuffer, v);
}
void WebGL1::clearBufferfi(std::uint32_t buffer, int drawbuffer, float depth, int stencil) {
  if (version_ != 2) return error(GL_INVALID_OPERATION);
  if (buffer != GL_DEPTH_STENCIL) return error(GL_INVALID_ENUM);
  if (drawbuffer != 0) return error(GL_INVALID_VALUE);
  if (checkFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE) return error(GL_INVALID_FRAMEBUFFER_OPERATION);
  glClearBufferfi(buffer, drawbuffer, depth, stencil);
}
void WebGL1::invalidateFramebuffer(std::uint32_t target, const std::uint32_t* attachments, int n) {
  if (version_ != 2) return error(GL_INVALID_OPERATION);
  if (target != GL_FRAMEBUFFER && target != GL_READ_FRAMEBUFFER && target != GL_DRAW_FRAMEBUFFER) return error(GL_INVALID_ENUM);
  for (int i = 0; i < n; ++i) {
    const std::uint32_t a = attachments[i];
    const bool color = a >= GL_COLOR_ATTACHMENT0 && a < GL_COLOR_ATTACHMENT0 + 4, def = a == GL_COLOR || a == GL_DEPTH || a == GL_STENCIL;
    if (!(color || a == GL_DEPTH_ATTACHMENT || a == GL_STENCIL_ATTACHMENT || a == GL_DEPTH_STENCIL_ATTACHMENT || def)) return error(GL_INVALID_ENUM);
  }
}
void WebGL1::framebufferTextureLayer(std::uint32_t target, std::uint32_t attachment, Id tex, int level, int layer) {
  if (version_ != 2) return error(GL_INVALID_OPERATION);
  if (target != GL_FRAMEBUFFER && target != GL_READ_FRAMEBUFFER && target != GL_DRAW_FRAMEBUFFER) return error(GL_INVALID_ENUM);
  if (attachment != GL_DEPTH_ATTACHMENT && attachment != GL_STENCIL_ATTACHMENT && attachment != GL_DEPTH_STENCIL_ATTACHMENT && !(attachment >= GL_COLOR_ATTACHMENT0 && attachment < GL_COLOR_ATTACHMENT0 + 4)) return error(GL_INVALID_ENUM);
  if (level < 0 || layer < 0) return error(GL_INVALID_VALUE);
  if (!(target == GL_READ_FRAMEBUFFER ? fboRead_ : fbo_)) return error(GL_INVALID_OPERATION);
  std::uint32_t name = 0;
  if (tex) { auto it = textures_.find(tex); if (it == textures_.end()) return error(GL_INVALID_OPERATION); name = it->second.name; }
  glFramebufferTextureLayer(target, attachment, name, level, layer);
}
int WebGL1::getFragDataLocation(Id pid, const std::string& name) {
  auto p = programs_.find(pid);
  if (p == programs_.end() || !p->second.linked) { error(GL_INVALID_OPERATION); return -1; }
  return glGetFragDataLocation(p->second.name, name.c_str());
}
std::vector<int> WebGL1::getInternalformatParameter(std::uint32_t target, std::uint32_t ifmt, std::uint32_t pname) {
  if (target != GL_RENDERBUFFER) { error(GL_INVALID_ENUM); return {}; }
  if (pname != GL_SAMPLES) { error(GL_INVALID_ENUM); return {}; }
  const bool integer = ifmt == GL_R8UI || ifmt == GL_R8I || ifmt == GL_R16UI || ifmt == GL_R16I || ifmt == GL_R32UI || ifmt == GL_R32I || ifmt == GL_RG8UI || ifmt == GL_RG8I || ifmt == GL_RGBA8UI || ifmt == GL_RGBA8I;
  switch (ifmt) {
    case GL_R8: case GL_RG8: case GL_RGB8: case GL_RGBA8: case GL_SRGB8_ALPHA8: case GL_RGBA4: case GL_RGB565: case GL_RGB5_A1: case GL_RGB10_A2: case GL_RGB10_A2UI:
    case GL_DEPTH_COMPONENT16: case GL_DEPTH_COMPONENT24: case GL_DEPTH_COMPONENT32F: case GL_DEPTH24_STENCIL8: case GL_DEPTH32F_STENCIL8: case GL_STENCIL_INDEX8: break;
    default: if (!integer) { error(GL_INVALID_ENUM); return {}; }
  }
  GLint max = 0;
  glGetIntegerv(GL_MAX_SAMPLES, &max);
  std::vector<int> out;
  if (integer) return out;   // integer formats are not multisample renderable in ES 3.0
  for (int s : {8, 4, 2, 1}) if (s <= max) out.push_back(s);
  return out;
}

}  // namespace zn::gl
