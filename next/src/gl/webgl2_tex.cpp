// WebGL 2.0 textures, samplers, queries, sync objects, transform feedback and framebuffer blits (ZN-203.07).
#include <algorithm>
#include <cmath>
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

}  // namespace
bool texFormatInfo(std::uint32_t internal, int& comps, char& cls) {
  switch (internal) { case GL_ALPHA: comps = -1; cls = 'f'; return true; case GL_LUMINANCE: comps = 1; cls = 'f'; return true; case GL_LUMINANCE_ALPHA: comps = -2; cls = 'f'; return true; case GL_RGB: comps = 3; cls = 'f'; return true; case GL_RGBA: comps = 4; cls = 'f'; return true; }   // -1: alpha only, -2: luminance alpha (both want an alpha channel)
  for (const Fmt& f : kFormats) if (f.internal == internal) {
    if (f.format == DEPTH_ || f.format == DEPTHST) return false;
    comps = f.format == RED_ || f.format == REDI ? 1 : f.format == RG_ || f.format == RGI ? 2 : f.format == GL_RGB || f.format == RGBI ? 3 : 4;
    cls = f.format == REDI || f.format == RGI || f.format == RGBI || f.format == RGBAI ? (f.type == GL_BYTE || f.type == GL_SHORT || f.type == GL_INT ? 'i' : 'u') : 'f';
    return true;
  }
  return false;
}
namespace {
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
bool WebGL1::uploadTexture(bool storage, std::uint32_t target, int level, std::uint32_t ifmt, int w, int h, int d, std::uint32_t format, std::uint32_t type, const void* data, std::size_t dataBytes, int xoff, int yoff, int zoff, bool sub) { ++fbGen_;
  const bool face = target >= GL_TEXTURE_CUBE_MAP_POSITIVE_X && target <= GL_TEXTURE_CUBE_MAP_NEGATIVE_Z;
  const bool three = target == GL_TEXTURE_3D || target == GL_TEXTURE_2D_ARRAY;
  const std::uint32_t bindTarget = face ? GL_TEXTURE_CUBE_MAP : target;
  if (!(target == GL_TEXTURE_2D || face || three || (storage && target == GL_TEXTURE_CUBE_MAP))) { error(GL_INVALID_ENUM); return false; }
  Id id = boundTex(bindTarget);
  if (!id) { error(GL_INVALID_OPERATION); return false; }
  Tex& t = textures_[id];
  if (storage) {
    std::size_t unused = 0;
    if (compressedBytes(ifmt, 1, 1, unused)) {   // a compressed format: every level allocated as blocks of zeros
      if (target == GL_TEXTURE_3D || t.immutable) { error(GL_INVALID_OPERATION); return false; }   // (3D textures take none of these formats)
      const int levels = level;
      if (levels < 1 || w < 1 || h < 1 || d < 1 || w > maxTexSize_ || h > maxTexSize_ || d > 2048) { error(GL_INVALID_VALUE); return false; }
      if (levels > levelsFor(w, h, 1)) { error(GL_INVALID_OPERATION); return false; }
      int lw = w, lh = h;
      for (int l = 0; l < levels; ++l) {
        std::size_t bytes = 0;
        compressedBytes(ifmt, lw, lh, bytes);
        if (target == GL_TEXTURE_2D_ARRAY) bytes *= static_cast<std::size_t>(d);
        const std::vector<std::uint8_t> zeros(bytes, 0);
        if (target == GL_TEXTURE_2D_ARRAY) glCompressedTexImage3D(GL_TEXTURE_2D_ARRAY, l, ifmt, lw, lh, d, 0, static_cast<GLsizei>(bytes), zeros.data());
        else if (bindTarget == GL_TEXTURE_CUBE_MAP) for (int f = 0; f < 6; ++f) glCompressedTexImage2D(GL_TEXTURE_CUBE_MAP_POSITIVE_X + f, l, ifmt, lw, lh, 0, static_cast<GLsizei>(bytes), zeros.data());
        else glCompressedTexImage2D(bindTarget, l, ifmt, lw, lh, 0, static_cast<GLsizei>(bytes), zeros.data());
        lw = std::max(1, lw / 2); lh = std::max(1, lh / 2);
      }
      glTexParameteri(bindTarget, GL_TEXTURE_MAX_LEVEL, levels - 1);
      t.immutable = true; t.levels = levels; t.w = w; t.h = h; t.d = target == GL_TEXTURE_2D_ARRAY ? d : 1; t.format = 0; t.cfmt = ifmt; t.f32 = t.f16 = false; t.swz = 0;
      return true;
    }
    if (!sizedFormat(ifmt)) { error(GL_INVALID_ENUM); return false; }
    if (t.immutable) { error(GL_INVALID_OPERATION); return false; }
    int levels = level;   // for storage, `level` carries the level count
    if (levels < 1 || w < 1 || h < 1 || d < 1 || w > (target == GL_TEXTURE_3D ? max3dSize_ : maxTexSize_) || h > (target == GL_TEXTURE_3D ? max3dSize_ : maxTexSize_) || (target == GL_TEXTURE_3D && d > max3dSize_)) { error(GL_INVALID_VALUE); return false; }
    if (levels > levelsFor(w, h, target == GL_TEXTURE_3D ? d : 1)) { error(GL_INVALID_OPERATION); return false; }   // more levels than the size has
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
    t.f32 = ifmt == GL_R32F || ifmt == GL_RG32F || ifmt == GL_RGB32F || ifmt == GL_RGBA32F; t.f16 = false; t.swz = 0;
    refreshSampling(id);
    return true;
  }
  if (t.immutable && !sub) { error(GL_INVALID_OPERATION); return false; }   // storage fixed the sizes
  if (t.cfmt && sub) { error(GL_INVALID_OPERATION); return false; }   // a compressed texture is updated with compressedTexSubImage*
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
  const int lim = level >= 0 && level <= 30 ? (target == GL_TEXTURE_3D ? max3dSize_ : maxTexSize_) >> level : 0;   // each level is half the one before it
  if (level < 0 || w < 0 || h < 0 || d < 0 || w > lim || h > lim || (target == GL_TEXTURE_3D ? d > lim : three && d > 2048)) { error(GL_INVALID_VALUE); return false; }
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
  // no data means zeros in WebGL; a driver re-specifying a level of the same size would keep the old pixels, so hand it zeros (default pixel-store state, no unpack buffer)
  std::vector<std::uint8_t> zeros;
  GLint pbo = 0, align = 0, ps[5] = {0, 0, 0, 0, 0};
  const GLenum psName[5] = {GL_UNPACK_ROW_LENGTH, GL_UNPACK_IMAGE_HEIGHT, GL_UNPACK_SKIP_PIXELS, GL_UNPACK_SKIP_ROWS, GL_UNPACK_SKIP_IMAGES};
  if (!data) {
    glGetIntegerv(GL_PIXEL_UNPACK_BUFFER_BINDING, &pbo);
    if (!pbo) {
      zeros.assign(static_cast<std::size_t>(w) * h * std::max(d, 1) * bpp, 0);
      glGetIntegerv(GL_UNPACK_ALIGNMENT, &align);
      for (int i = 0; i < 5; ++i) { glGetIntegerv(psName[i], &ps[i]); glPixelStorei(psName[i], 0); }
      glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
      data = zeros.data();
    }
  }
  if (three) glTexImage3D(target, level, static_cast<GLint>(ifmt), w, h, d, 0, format, type, data);
  else glTexImage2D(target, level, static_cast<GLint>(ifmt), w, h, 0, format, type, data);
  if (!zeros.empty()) { for (int i = 0; i < 5; ++i) glPixelStorei(psName[i], ps[i]); glPixelStorei(GL_UNPACK_ALIGNMENT, align); }
  if (level == 0) {
    t.w = w; t.h = h; t.d = d; t.format = format; t.cfmt = 0;
    t.f32 = ifmt == GL_R32F || ifmt == GL_RG32F || ifmt == GL_RGB32F || ifmt == GL_RGBA32F || (isUnsizedLegacy(ifmt) && type == GL_FLOAT);   // not filterable without OES_texture_float_linear
    t.f16 = false; t.swz = 0;
    refreshSampling(id);
  }
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
static bool samplerParamOk(std::uint32_t pname, int v, bool aniso = false) {
  switch (pname) {
    case 0x84FE: return aniso && v >= 1;   // TEXTURE_MAX_ANISOTROPY_EXT
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
  if (!samplerParamOk(pname, v, extOn(Ext::Aniso))) return error(pname == 0x84FE && extOn(Ext::Aniso) ? GL_INVALID_VALUE : GL_INVALID_ENUM);
  glSamplerParameteri(it->second.name, pname, v);
}
void WebGL1::samplerParameterf(Id id, std::uint32_t pname, float v) {
  auto it = samplers_.find(id);
  if (it == samplers_.end()) return error(GL_INVALID_OPERATION);
  if (!samplerParamOk(pname, pname == 0x84FE ? (v >= 1 ? 1 : 0) : static_cast<int>(v), extOn(Ext::Aniso))) return error(pname == 0x84FE && extOn(Ext::Aniso) ? GL_INVALID_VALUE : GL_INVALID_ENUM);
  glSamplerParameterf(it->second.name, pname, v);
}
WebGL1::Param WebGL1::getSamplerParameter(Id id, std::uint32_t pname) {
  Param r;
  auto it = samplers_.find(id);
  if (it == samplers_.end()) { error(GL_INVALID_OPERATION); return r; }
  if (pname == 0x84FE && extOn(Ext::Aniso)) { GLfloat f = 1; glGetSamplerParameterfv(it->second.name, pname, &f); r.ok = true; r.kind = 'f'; r.v.push_back(f); return r; }
  if (!samplerParamOk(pname, pname == GL_TEXTURE_MIN_LOD || pname == GL_TEXTURE_MAX_LOD ? 0 : GL_NEAREST) && pname != GL_TEXTURE_COMPARE_MODE && pname != GL_TEXTURE_COMPARE_FUNC && pname != GL_TEXTURE_WRAP_S && pname != GL_TEXTURE_WRAP_T && pname != GL_TEXTURE_WRAP_R && pname != GL_TEXTURE_MAG_FILTER) { error(GL_INVALID_ENUM); return r; }
  r.ok = true;
  if (pname == GL_TEXTURE_MIN_LOD || pname == GL_TEXTURE_MAX_LOD) { GLfloat f = 0; glGetSamplerParameterfv(it->second.name, pname, &f); r.kind = 'f'; r.v.push_back(f); }
  else { GLint i = 0; glGetSamplerParameteriv(it->second.name, pname, &i); r.kind = 'i'; r.v.push_back(i); }
  return r;
}

// ---- queries
Id WebGL1::createQuery() { if (version_ != 2) { error(GL_INVALID_OPERATION); return 0; } Query q; glGenQueries(1, &q.name); Id id = nextId_++; queries_[id] = q; return id; }
void WebGL1::deleteQuery(Id id) {
  auto it = queries_.find(id);
  if (it == queries_.end()) return;
  for (auto& a : activeQuery_) if (a.second == id) { a.second = 0; glEndQuery(a.first == 0x8D6A ? 0x8C2F : a.first); }   // deleting an active query ends it
  glDeleteQueries(1, &it->second.name);
  queries_.erase(it);
}
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
  pendingTask_.insert(id);
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
  if (pname == 0x8867 && pendingTask_.count(id)) v = 0;   // not available in the task that ended it
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
  pendingTask_.insert(id);
  return id;
}
void WebGL1::deleteSync(Id id) { auto it = syncs_.find(id); if (it == syncs_.end()) return; glDeleteSync(static_cast<GLsync>(it->second)); syncs_.erase(it); }
std::uint32_t WebGL1::clientWaitSync(Id id, std::uint32_t flags, double timeoutNs) {
  auto it = syncs_.find(id);
  if (it == syncs_.end()) { error(GL_INVALID_OPERATION); return GL_WAIT_FAILED; }
  if (flags & ~static_cast<std::uint32_t>(GL_SYNC_FLUSH_COMMANDS_BIT)) { error(GL_INVALID_VALUE); return GL_WAIT_FAILED; }
  if (timeoutNs < 0 || timeoutNs > 1e9) { error(GL_INVALID_OPERATION); return GL_WAIT_FAILED; }   // WebGL caps the wait at MAX_CLIENT_WAIT_TIMEOUT_WEBGL (0 in the spec's sense)
  if (pendingTask_.count(id)) return GL_TIMEOUT_EXPIRED;
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
  if (pname == GL_SYNC_STATUS && pendingTask_.count(id)) v = GL_UNSIGNALED;
  r.ok = true; r.kind = 'i'; r.v.push_back(v);
  return r;
}

// ---- transform feedback
Id WebGL1::createTransformFeedback() { if (version_ != 2 || !glGenTransformFeedbacks) { error(GL_INVALID_OPERATION); return 0; } TransformFeedback t; glGenTransformFeedbacks(1, &t.name); Id id = nextId_++; tfs_[id] = t; return id; }   // objects are GL 4.0; GLES 3.0 has them too
void WebGL1::deleteTransformFeedback(Id id) {
  auto it = tfs_.find(id);
  if (it == tfs_.end()) return;
  if (it->second.active) return error(GL_INVALID_OPERATION);
  if (tf_ == id) { tf_ = 0; glBindTransformFeedback(GL_TRANSFORM_FEEDBACK, 0); }
  glDeleteTransformFeedbacks(1, &it->second.name);
  for (auto x = indexed_.begin(); x != indexed_.end();) x = static_cast<std::uint32_t>(x->first >> 32) == GL_TRANSFORM_FEEDBACK_BUFFER && ((x->first >> 8) & 0xFFFFFF) == id ? indexed_.erase(x) : std::next(x);
  tfs_.erase(it);
  releaseBuffers();
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
  GLint varyings = 0;
  glGetProgramiv(programs_[program_].name, GL_TRANSFORM_FEEDBACK_VARYINGS, &varyings);
  if (varyings == 0) return error(GL_INVALID_OPERATION);   // nothing to record
  while (glGetError() != GL_NO_ERROR) {}
  glBeginTransformFeedback(mode);
  if (glGetError() != GL_NO_ERROR) return error(GL_INVALID_OPERATION);   // e.g. a varying without a buffer
  if (cur != tfs_.end()) cur->second.active = true;
  else tfUnbound_ = 1;
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
  auto span = [](int a, int b) { return a > b ? static_cast<std::int64_t>(a) - b : static_cast<std::int64_t>(b) - a; };
  if (span(sx0, sx1) > 0x7fffffff || span(sy0, sy1) > 0x7fffffff || span(dx0, dx1) > 0x7fffffff || span(dy0, dy1) > 0x7fffffff) return error(GL_INVALID_VALUE);
  if (fboRead_ == fbo_) return error(GL_INVALID_OPERATION);
  if (fboRead_ && fbo_) {   // the same image (object, level, face, layer) on both sides of a copied buffer
    auto img = [](GLenum target, GLenum att, GLint* v) {
      v[0] = GL_NONE; v[1] = v[2] = v[3] = v[4] = 0;
      glGetFramebufferAttachmentParameteriv(target, att, GL_FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE, &v[0]);
      if (v[0] == GL_NONE) return false;
      glGetFramebufferAttachmentParameteriv(target, att, GL_FRAMEBUFFER_ATTACHMENT_OBJECT_NAME, &v[1]);
      if (v[0] == GL_TEXTURE) {
        glGetFramebufferAttachmentParameteriv(target, att, GL_FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL, &v[2]);
        glGetFramebufferAttachmentParameteriv(target, att, GL_FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE, &v[3]);
        glGetFramebufferAttachmentParameteriv(target, att, GL_FRAMEBUFFER_ATTACHMENT_TEXTURE_LAYER, &v[4]);
      }
      return true;
    };
    auto same = [&](GLenum ra, GLenum da) { GLint r[5], d[5]; return img(GL_READ_FRAMEBUFFER, ra, r) && img(GL_DRAW_FRAMEBUFFER, da, d) && std::equal(r, r + 5, d); };
    bool clash = ((mask & GL_DEPTH_BUFFER_BIT) && same(GL_DEPTH_ATTACHMENT, GL_DEPTH_ATTACHMENT)) || ((mask & GL_STENCIL_BUFFER_BIT) && same(GL_STENCIL_ATTACHMENT, GL_STENCIL_ATTACHMENT));
    if (mask & GL_COLOR_BUFFER_BIT) for (int k = 0; k < 4; ++k) if (fbos_[fbo_].draw[k] && same(fbos_[fboRead_].readBuffer, fbos_[fbo_].draw[k])) clash = true;
    while (glGetError() != GL_NO_ERROR) {}
    if (clash) return error(GL_INVALID_OPERATION);
  }
  // multisampled read: the draw side must be single sampled, the regions equal and the formats the same; a multisampled draw image is never allowed
  auto samplesOf = [&](Id fb) {
    auto f = fbos_.find(fb);
    if (!fb || f == fbos_.end() || !f->second.colorRb) return 0;
    auto r = rbos_.find(f->second.colorRb);
    return r == rbos_.end() ? 0 : r->second.samples;
  };
  auto encoding = [](GLenum target) { GLint e = 0; glGetFramebufferAttachmentParameteriv(target, GL_COLOR_ATTACHMENT0, GL_FRAMEBUFFER_ATTACHMENT_COLOR_ENCODING, &e); while (glGetError() != GL_NO_ERROR) {} return e; };
  const int rs = samplesOf(fboRead_), ds = samplesOf(fbo_);
  if (ds > 0) return error(GL_INVALID_OPERATION);
  if (rs > 0 && (sx0 != dx0 || sy0 != dy0 || sx1 != dx1 || sy1 != dy1 || (fbo_ && fboRead_ && encoding(GL_READ_FRAMEBUFFER) != encoding(GL_DRAW_FRAMEBUFFER)))) return error(GL_INVALID_OPERATION);
  // the driver does not clip out-of-bounds regions like the spec: clip source then destination to the colour images, scaling the other side, and round to pixels
  auto size = [&](Id fb, int& w, int& h) {
    w = gl_.width(); h = gl_.height();
    auto f = fbos_.find(fb);
    if (!fb || f == fbos_.end()) return true;
    if (f->second.colorRb) { auto r = rbos_.find(f->second.colorRb); if (r == rbos_.end()) return false; w = r->second.w; h = r->second.h; return true; }
    auto t = textures_.find(f->second.color);
    if (t == textures_.end()) return false;
    w = std::max(1, t->second.w >> f->second.colorLevel); h = std::max(1, t->second.h >> f->second.colorLevel);
    return true;
  };
  int rw, rh, dw, dh;
  if ((mask & GL_COLOR_BUFFER_BIT) && size(fboRead_, rw, rh) && size(fbo_, dw, dh)) {
    auto clip = [](int& s0, int& s1, int& d0, int& d1, int sn, int dn) {
      if (s0 == s1 || d0 == d1 || (s0 >= 0 && s1 >= 0 && s0 <= sn && s1 <= sn && d0 >= 0 && d1 >= 0 && d0 <= dn && d1 <= dn)) return;
      double S0 = s0, S1 = s1, D0 = d0, D1 = d1;
      const double k = (D1 - D0) / (S1 - S0);   // destination pixels per source pixel, negative when one side is flipped
      auto toD = [&](double s) { return D0 + (s - S0) * k; };
      const double lo = std::min(S0, S1), hi = std::max(S0, S1);
      const double cl = std::max(lo, 0.0), ch = std::min(hi, static_cast<double>(sn));
      const double a = toD(S0 < S1 ? cl : ch), b = toD(S0 < S1 ? ch : cl);   // the new destination ends, still paired with the source ends
      const double ns0 = S0 < S1 ? cl : ch, ns1 = S0 < S1 ? ch : cl;
      D0 = a; D1 = b; S0 = ns0; S1 = ns1;
      const double dlo = std::min(D0, D1), dhi = std::max(D0, D1);
      const double c0 = std::max(dlo, 0.0), c1 = std::min(dhi, static_cast<double>(dn));
      const double k2 = (D1 - D0) / (S1 - S0);
      const double nd0 = D0 < D1 ? c0 : c1, nd1 = D0 < D1 ? c1 : c0;
      const double ss0 = S0 + (nd0 - D0) / k2, ss1 = S0 + (nd1 - D0) / k2;
      s0 = static_cast<int>(std::lround(ss0)); s1 = static_cast<int>(std::lround(ss1)); d0 = static_cast<int>(std::lround(nd0)); d1 = static_cast<int>(std::lround(nd1));
    };
    clip(sx0, sx1, dx0, dx1, rw, dw);
    clip(sy0, sy1, dy0, dy1, rh, dh);
    if (sx0 == sx1 || sy0 == sy1 || dx0 == dx1 || dy0 == dy1) return;   // nothing left inside
  }
  if ((mask & GL_COLOR_BUFFER_BIT) && srgbBlit(sx0, sy0, sx1, sy1, dx0, dy0, dx1, dy1, filter)) {
    mask &= ~static_cast<std::uint32_t>(GL_COLOR_BUFFER_BIT);
    if (!mask) return;
  }
  glBlitFramebuffer(sx0, sy0, sx1, sy1, dx0, dy0, dx1, dy1, mask, filter);
}
// The desktop driver copies sRGB images raw in a blit. WebGL wants the conversion (decode on read, encode on write, filtering in linear space), which sampling a texture and writing with
// FRAMEBUFFER_SRGB does: draw the source rectangle into the destination. Only for a 2D texture source whose encoding differs from the destination's, or a scaled filtered sRGB one.
bool WebGL1::srgbBlit(int sx0, int sy0, int sx1, int sy1, int dx0, int dy0, int dx1, int dy1, std::uint32_t filter) {
  if (gl_.info().es || !fboRead_) return false;
  const GLenum att = fbos_[fboRead_].readBuffer;
  GLint type = GL_NONE, name = 0, level = 0, face = 0, rEnc = GL_LINEAR, dEnc = GL_LINEAR;
  glGetFramebufferAttachmentParameteriv(GL_READ_FRAMEBUFFER, att, GL_FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE, &type);
  if (type != GL_TEXTURE) { while (glGetError() != GL_NO_ERROR) {} return false; }
  glGetFramebufferAttachmentParameteriv(GL_READ_FRAMEBUFFER, att, GL_FRAMEBUFFER_ATTACHMENT_OBJECT_NAME, &name);
  glGetFramebufferAttachmentParameteriv(GL_READ_FRAMEBUFFER, att, GL_FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL, &level);
  glGetFramebufferAttachmentParameteriv(GL_READ_FRAMEBUFFER, att, GL_FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE, &face);
  glGetFramebufferAttachmentParameteriv(GL_READ_FRAMEBUFFER, att, GL_FRAMEBUFFER_ATTACHMENT_COLOR_ENCODING, &rEnc);
  if (fbo_) glGetFramebufferAttachmentParameteriv(GL_DRAW_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_FRAMEBUFFER_ATTACHMENT_COLOR_ENCODING, &dEnc);
  while (glGetError() != GL_NO_ERROR) {}
  const bool scaled = sx1 - sx0 != dx1 - dx0 || sy1 - sy0 != dy1 - dy0;
  if (face != 0 || !(rEnc != dEnc || (rEnc == GL_SRGB && filter == GL_LINEAR && scaled))) return false;
  if (!blitProg_) {
    const char* vs = "#version 330 core\nuniform vec4 r; out vec2 uv; void main() { vec2 p = vec2(gl_VertexID & 1, gl_VertexID >> 1); uv = mix(r.xy, r.zw, p); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }";
    const char* fs = "#version 330 core\nuniform sampler2D s; in vec2 uv; out vec4 c; void main() { c = texture(s, uv); }";
    GLuint v = glCreateShader(GL_VERTEX_SHADER), f = glCreateShader(GL_FRAGMENT_SHADER);
    glShaderSource(v, 1, &vs, nullptr); glCompileShader(v);
    glShaderSource(f, 1, &fs, nullptr); glCompileShader(f);
    blitProg_ = glCreateProgram();
    glAttachShader(blitProg_, v); glAttachShader(blitProg_, f); glLinkProgram(blitProg_);
    glDeleteShader(v); glDeleteShader(f);
    glGenVertexArrays(1, &blitVao_);
  }
  // save what the draw touches
  GLint prog = 0, vao = 0, active = 0, tex = 0, smp = 0, vp[4], sc[4];
  GLboolean cm[4];
  glGetIntegerv(GL_CURRENT_PROGRAM, &prog); glGetIntegerv(GL_VERTEX_ARRAY_BINDING, &vao); glGetIntegerv(GL_ACTIVE_TEXTURE, &active);
  glGetIntegerv(GL_VIEWPORT, vp); glGetIntegerv(GL_SCISSOR_BOX, sc); glGetBooleanv(GL_COLOR_WRITEMASK, cm);
  const GLenum caps[] = {GL_BLEND, GL_DEPTH_TEST, GL_STENCIL_TEST, GL_CULL_FACE, GL_RASTERIZER_DISCARD, GL_SAMPLE_ALPHA_TO_COVERAGE};
  GLboolean on[6];
  for (int i = 0; i < 6; ++i) { on[i] = glIsEnabled(caps[i]); glDisable(caps[i]); }
  glActiveTexture(GL_TEXTURE0 + 31);
  glGetIntegerv(GL_TEXTURE_BINDING_2D, &tex); glGetIntegerv(GL_SAMPLER_BINDING, &smp);
  glBindSampler(31, 0);
  glBindTexture(GL_TEXTURE_2D, static_cast<GLuint>(name));
  GLint old[5], w = 1, h = 1;
  const GLenum pn[5] = {GL_TEXTURE_MIN_FILTER, GL_TEXTURE_MAG_FILTER, GL_TEXTURE_BASE_LEVEL, GL_TEXTURE_MAX_LEVEL, GL_TEXTURE_WRAP_S};
  GLint wrapT = 0;
  for (int i = 0; i < 5; ++i) glGetTexParameteriv(GL_TEXTURE_2D, pn[i], &old[i]);
  glGetTexParameteriv(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, &wrapT);
  glGetTexLevelParameteriv(GL_TEXTURE_2D, level, GL_TEXTURE_WIDTH, &w); glGetTexLevelParameteriv(GL_TEXTURE_2D, level, GL_TEXTURE_HEIGHT, &h);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, static_cast<GLint>(filter)); glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, static_cast<GLint>(filter));
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_BASE_LEVEL, level); glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAX_LEVEL, level);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE); glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
  float r[4] = {static_cast<float>(sx0) / w, static_cast<float>(sy0) / h, static_cast<float>(sx1) / w, static_cast<float>(sy1) / h};
  if (dx1 < dx0) std::swap(r[0], r[2]);
  if (dy1 < dy0) std::swap(r[1], r[3]);
  glUseProgram(blitProg_);
  glUniform4fv(glGetUniformLocation(blitProg_, "r"), 1, r);
  glUniform1i(glGetUniformLocation(blitProg_, "s"), 31);
  glBindVertexArray(blitVao_);
  glColorMask(GL_TRUE, GL_TRUE, GL_TRUE, GL_TRUE);
  glViewport(std::min(dx0, dx1), std::min(dy0, dy1), std::abs(dx1 - dx0), std::abs(dy1 - dy0));
  glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
  // put it all back
  glColorMask(cm[0], cm[1], cm[2], cm[3]);
  glViewport(vp[0], vp[1], vp[2], vp[3]); glScissor(sc[0], sc[1], sc[2], sc[3]);
  glBindVertexArray(static_cast<GLuint>(vao)); glUseProgram(static_cast<GLuint>(prog));
  for (int i = 0; i < 5; ++i) glTexParameteri(GL_TEXTURE_2D, pn[i], old[i]);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, wrapT);
  glBindTexture(GL_TEXTURE_2D, static_cast<GLuint>(tex)); glBindSampler(31, static_cast<GLuint>(smp));
  glActiveTexture(static_cast<GLenum>(active));
  for (int i = 0; i < 6; ++i) if (on[i]) glEnable(caps[i]);
  while (glGetError() != GL_NO_ERROR) {}
  return true;
}
void WebGL1::renderbufferStorageMultisample(std::uint32_t target, int samples, std::uint32_t fmt, int w, int h) { ++fbGen_;
  if (version_ != 2) return error(GL_INVALID_OPERATION);
  if (target != GL_RENDERBUFFER) return error(GL_INVALID_ENUM);
  if (!renderbufferFormatAllowed(fmt)) return error(GL_INVALID_ENUM);
  if (samples < 0 || w < 0 || h < 0 || w > maxTexSize_ || h > maxTexSize_) return error(GL_INVALID_VALUE);
  if (!rbo_) return error(GL_INVALID_OPERATION);
  Rbo& r = rbos_[rbo_];
  r.w = w; r.h = h; r.format = fmt; r.samples = samples;
  glRenderbufferStorageMultisample(GL_RENDERBUFFER, samples, fmt == GL_DEPTH_STENCIL ? GL_DEPTH24_STENCIL8 : fmt, w, h);
}
void WebGL1::clearBufferfv(std::uint32_t buffer, int drawbuffer, const float* v, std::size_t n) {
  if (version_ != 2) return error(GL_INVALID_OPERATION);
  if (buffer != GL_COLOR && buffer != GL_DEPTH) return error(GL_INVALID_ENUM);
  if (drawbuffer < 0 || (buffer == GL_DEPTH && drawbuffer != 0) || drawbuffer >= 4) return error(GL_INVALID_VALUE);
  if (n < (buffer == GL_COLOR ? 4u : 1u)) return error(GL_INVALID_VALUE);
  if (!framebufferReady()) return error(GL_INVALID_FRAMEBUFFER_OPERATION);
  if (buffer == GL_COLOR && !clearClassOk(drawbuffer, 'f')) return error(GL_INVALID_OPERATION);
  glClearBufferfv(buffer, drawbuffer, v);
}
void WebGL1::clearBufferiv(std::uint32_t buffer, int drawbuffer, const int* v, std::size_t n) {
  if (version_ != 2) return error(GL_INVALID_OPERATION);
  if (buffer != GL_COLOR && buffer != GL_STENCIL) return error(GL_INVALID_ENUM);
  if (drawbuffer < 0 || (buffer == GL_STENCIL && drawbuffer != 0) || drawbuffer >= 4) return error(GL_INVALID_VALUE);
  if (n < (buffer == GL_COLOR ? 4u : 1u)) return error(GL_INVALID_VALUE);
  if (!framebufferReady()) return error(GL_INVALID_FRAMEBUFFER_OPERATION);
  if (buffer == GL_COLOR && !clearClassOk(drawbuffer, 'i')) return error(GL_INVALID_OPERATION);
  glClearBufferiv(buffer, drawbuffer, v);
}
void WebGL1::clearBufferuiv(std::uint32_t buffer, int drawbuffer, const std::uint32_t* v, std::size_t n) {
  if (version_ != 2) return error(GL_INVALID_OPERATION);
  if (buffer != GL_COLOR) return error(GL_INVALID_ENUM);
  if (drawbuffer < 0 || drawbuffer >= 4) return error(GL_INVALID_VALUE);
  if (n < 4) return error(GL_INVALID_VALUE);
  if (!framebufferReady()) return error(GL_INVALID_FRAMEBUFFER_OPERATION);
  if (!clearClassOk(drawbuffer, 'u')) return error(GL_INVALID_OPERATION);
  glClearBufferuiv(buffer, drawbuffer, v);
}
void WebGL1::clearBufferfi(std::uint32_t buffer, int drawbuffer, float depth, int stencil) {
  if (version_ != 2) return error(GL_INVALID_OPERATION);
  if (buffer != GL_DEPTH_STENCIL) return error(GL_INVALID_ENUM);
  if (drawbuffer != 0) return error(GL_INVALID_VALUE);
  if (!framebufferReady()) return error(GL_INVALID_FRAMEBUFFER_OPERATION);
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
void WebGL1::framebufferTextureLayer(std::uint32_t target, std::uint32_t attachment, Id tex, int level, int layer) { ++fbGen_;
  if (version_ != 2) return error(GL_INVALID_OPERATION);
  if (target != GL_FRAMEBUFFER && target != GL_READ_FRAMEBUFFER && target != GL_DRAW_FRAMEBUFFER) return error(GL_INVALID_ENUM);
  if (attachment != GL_DEPTH_ATTACHMENT && attachment != GL_STENCIL_ATTACHMENT && attachment != GL_DEPTH_STENCIL_ATTACHMENT && !(attachment >= GL_COLOR_ATTACHMENT0 && attachment < GL_COLOR_ATTACHMENT0 + 4)) return error(GL_INVALID_ENUM);
  if (level < 0 || layer < 0) return error(GL_INVALID_VALUE);
  if (!(target == GL_READ_FRAMEBUFFER ? fboRead_ : fbo_)) return error(GL_INVALID_OPERATION);
  std::uint32_t name = 0;
  if (tex) {
    auto it = textures_.find(tex);
    if (it == textures_.end()) return error(GL_INVALID_OPERATION);
    name = it->second.name;
    if (it->second.target == GL_TEXTURE_3D || it->second.target == GL_TEXTURE_2D_ARRAY) {
      GLint lim = 0;
      glGetIntegerv(it->second.target == GL_TEXTURE_3D ? GL_MAX_3D_TEXTURE_SIZE : GL_MAX_ARRAY_TEXTURE_LAYERS, &lim);
      if (layer >= lim) return error(GL_INVALID_VALUE);
    }
  }
  attachRb(target == GL_READ_FRAMEBUFFER ? fboRead_ : fbo_, attachment, 0, name);
  glFramebufferTextureLayer(target, attachment, name, level, layer);
}
int WebGL1::getFragDataLocation(Id pid, const std::string& name) {
  auto p = programs_.find(pid);
  if (p == programs_.end() || !p->second.linked) { error(GL_INVALID_OPERATION); return -1; }
  return glGetFragDataLocation(p->second.name, name.c_str());
}
std::vector<int> WebGL1::getInternalformatParameter(std::uint32_t target, std::uint32_t ifmt, std::uint32_t pname, bool& ok) {
  ok = false;
  if (target != GL_RENDERBUFFER) { error(GL_INVALID_ENUM); return {}; }
  if (pname != GL_SAMPLES) { error(GL_INVALID_ENUM); return {}; }
  const bool integer = ifmt == GL_R8UI || ifmt == GL_R8I || ifmt == GL_R16UI || ifmt == GL_R16I || ifmt == GL_R32UI || ifmt == GL_R32I || ifmt == GL_RG8UI || ifmt == GL_RG8I || ifmt == GL_RGBA8UI || ifmt == GL_RGBA8I;
  switch (ifmt) {
    case GL_R8: case GL_RG8: case GL_RGB8: case GL_RGBA8: case GL_SRGB8_ALPHA8: case GL_RGBA4: case GL_RGB565: case GL_RGB5_A1: case GL_RGB10_A2: case GL_RGB10_A2UI:
    case GL_DEPTH_COMPONENT16: case GL_DEPTH_COMPONENT24: case GL_DEPTH_COMPONENT32F: case GL_DEPTH24_STENCIL8: case GL_DEPTH32F_STENCIL8: case GL_STENCIL_INDEX8: break;
    case GL_R16F: case GL_RG16F: case GL_RGBA16F: case GL_R32F: case GL_RG32F: case GL_RGBA32F: case GL_R11F_G11F_B10F: if (renderbufferFormatAllowed(ifmt)) break; error(GL_INVALID_ENUM); return {};   // the float formats need EXT_color_buffer_float / _half_float
    default: if (!integer) { error(GL_INVALID_ENUM); return {}; }
  }
  GLint max = 0;
  glGetIntegerv(GL_MAX_SAMPLES, &max);
  std::vector<int> out;
  ok = true;
  if (integer) return out;   // integer formats are not multisample renderable in ES 3.0
  for (int s : {8, 4, 2, 1}) if (s <= max) out.push_back(s);
  return out;
}


bool WebGL1::unpackBufferFits(std::int64_t offset, std::size_t bytes) {
  auto it = otherBuffers_.find(GL_PIXEL_UNPACK_BUFFER);
  if (it == otherBuffers_.end() || !it->second) return false;
  const Buf& b = buffers_[it->second];
  return offset >= 0 && offset + static_cast<std::int64_t>(bytes) <= b.size;
}
// ---- compressed textures: the block formats of WEBGL_compressed_texture_s3tc, _s3tc_srgb and EXT_texture_compression_rgtc (all 4 x 4 blocks)
namespace {
struct CFmt { std::uint32_t fmt; int bytes; Ext ext; };
constexpr CFmt kCompressed[] = {
  {0x83F0, 8, Ext::S3tc}, {0x83F1, 8, Ext::S3tc}, {0x83F2, 16, Ext::S3tc}, {0x83F3, 16, Ext::S3tc},
  {0x8C4C, 8, Ext::S3tcSrgb}, {0x8C4D, 8, Ext::S3tcSrgb}, {0x8C4E, 16, Ext::S3tcSrgb}, {0x8C4F, 16, Ext::S3tcSrgb},
  {0x8DBB, 8, Ext::Rgtc}, {0x8DBC, 8, Ext::Rgtc}, {0x8DBD, 16, Ext::Rgtc}, {0x8DBE, 16, Ext::Rgtc},
};
std::size_t blocksBytes(int w, int h, int blockBytes) { return static_cast<std::size_t>((w + 3) / 4) * static_cast<std::size_t>((h + 3) / 4) * static_cast<std::size_t>(blockBytes); }
}  // namespace
std::vector<std::uint32_t> WebGL1::compressedFormats() const {
  std::vector<std::uint32_t> v;
  for (const CFmt& f : kCompressed) if (extOn(f.ext)) v.push_back(f.fmt);
  return v;
}
bool WebGL1::compressedBytes(std::uint32_t fmt, int w, int h, std::size_t& bytes) const {
  for (const CFmt& f : kCompressed) if (f.fmt == fmt && extOn(f.ext)) { bytes = blocksBytes(w, h, f.bytes); return true; }
  return false;
}
void WebGL1::compressedTexImage2D(std::uint32_t target, int level, std::uint32_t ifmt, int w, int h, int border, const void* data, std::size_t bytes, std::int64_t pbo) {
  ++fbGen_;
  const bool face = target >= GL_TEXTURE_CUBE_MAP_POSITIVE_X && target <= GL_TEXTURE_CUBE_MAP_NEGATIVE_Z;
  if (target != GL_TEXTURE_2D && !face) return error(GL_INVALID_ENUM);
  std::size_t want = 0;
  if (!compressedBytes(ifmt, w < 0 ? 0 : w, h < 0 ? 0 : h, want)) return error(GL_INVALID_ENUM);   // not a format the page enabled
  if (level < 0 || level > 30 || w < 0 || h < 0 || border != 0 || w > (maxTexSize_ >> level) || h > (maxTexSize_ >> level)) return error(GL_INVALID_VALUE);
  const Id id = (face ? texCube_ : tex2d_)[activeUnit_];
  if (!id) return error(GL_INVALID_OPERATION);
  Tex& t = textures_[id];
  if (t.immutable) return error(GL_INVALID_OPERATION);
  if (bytes != want) return error(GL_INVALID_VALUE);   // the data is exactly the blocks of the image
  if (pbo >= 0) { if (!unpackBufferFits(pbo, bytes)) return error(GL_INVALID_OPERATION); data = reinterpret_cast<const void*>(static_cast<std::intptr_t>(pbo)); }
  else if (packOrUnpackBufferBound()) return error(GL_INVALID_OPERATION);   // a bound unpack buffer wants an offset
  // 4 x 4 blocks: a level is allowed when the base level it implies (the size shifted up by the level) is a multiple of 4; a WebGL 1 level above the base is also a power of two
  if (version_ != 2 && level > 0 && (((w & (w - 1)) != 0) || ((h & (h - 1)) != 0))) return error(GL_INVALID_VALUE);
  if (((static_cast<std::int64_t>(w) << level) % 4) != 0 || ((static_cast<std::int64_t>(h) << level) % 4) != 0) return error(GL_INVALID_OPERATION);
  glCompressedTexImage2D(target, level, ifmt, w, h, 0, static_cast<GLsizei>(bytes), pbo >= 0 || bytes ? data : nullptr);
  if (level == 0) { t.w = w; t.h = h; t.format = 0; t.type = 0; t.cfmt = ifmt; t.f32 = t.f16 = false; t.swz = 0; refreshSampling(id); }
}
void WebGL1::compressedTexSubImage2D(std::uint32_t target, int level, int xoff, int yoff, int w, int h, std::uint32_t fmt, const void* data, std::size_t bytes, std::int64_t pbo) {
  const bool face = target >= GL_TEXTURE_CUBE_MAP_POSITIVE_X && target <= GL_TEXTURE_CUBE_MAP_NEGATIVE_Z;
  if (target != GL_TEXTURE_2D && !face) return error(GL_INVALID_ENUM);
  std::size_t want = 0;
  if (!compressedBytes(fmt, w < 0 ? 0 : w, h < 0 ? 0 : h, want)) return error(GL_INVALID_ENUM);
  if (level < 0 || level > 30 || w < 0 || h < 0 || xoff < 0 || yoff < 0) return error(GL_INVALID_VALUE);
  const Id id = (face ? texCube_ : tex2d_)[activeUnit_];
  if (!id) return error(GL_INVALID_OPERATION);
  const Tex& t = textures_[id];
  GLint lw = 0, lh = 0, lf = 0;
  glGetTexLevelParameteriv(target, level, GL_TEXTURE_WIDTH, &lw);
  glGetTexLevelParameteriv(target, level, GL_TEXTURE_HEIGHT, &lh);
  glGetTexLevelParameteriv(target, level, GL_TEXTURE_INTERNAL_FORMAT, &lf);
  while (glGetError() != GL_NO_ERROR) {}
  if (t.cfmt != fmt || lw == 0) return error(GL_INVALID_OPERATION);   // another format, or no such level
  if (bytes != want) return error(GL_INVALID_VALUE);
  if (xoff + w > lw || yoff + h > lh) return error(GL_INVALID_VALUE);
  if (xoff % 4 || yoff % 4 || (w % 4 && xoff + w != lw) || (h % 4 && yoff + h != lh)) return error(GL_INVALID_OPERATION);   // whole blocks, or up to the edge of the level
  if (pbo >= 0) { if (!unpackBufferFits(pbo, bytes)) return error(GL_INVALID_OPERATION); data = reinterpret_cast<const void*>(static_cast<std::intptr_t>(pbo)); }
  else if (packOrUnpackBufferBound()) return error(GL_INVALID_OPERATION);
  if (w == 0 || h == 0) return;
  glCompressedTexSubImage2D(target, level, xoff, yoff, w, h, fmt, static_cast<GLsizei>(bytes), data);
}

// 2D array textures of the block formats (WebGL 2); 3D textures take none of them
void WebGL1::compressedTexImage3D(std::uint32_t target, int level, std::uint32_t ifmt, int w, int h, int d, int border, const void* data, std::size_t bytes, std::int64_t pbo) {
  ++fbGen_;
  if (version_ != 2) return error(GL_INVALID_OPERATION);
  if (target != GL_TEXTURE_2D_ARRAY && target != GL_TEXTURE_3D) return error(GL_INVALID_ENUM);
  std::size_t want = 0;
  if (!compressedBytes(ifmt, w < 0 ? 0 : w, h < 0 ? 0 : h, want)) return error(GL_INVALID_ENUM);
  if (target == GL_TEXTURE_3D) return error(GL_INVALID_OPERATION);
  if (level < 0 || level > 30 || w < 0 || h < 0 || d < 0 || border != 0 || w > (maxTexSize_ >> level) || h > (maxTexSize_ >> level) || d > 2048) return error(GL_INVALID_VALUE);
  const Id id = texArr_[activeUnit_];
  if (!id) return error(GL_INVALID_OPERATION);
  Tex& t = textures_[id];
  if (t.immutable) return error(GL_INVALID_OPERATION);
  if (bytes != want * static_cast<std::size_t>(d)) return error(GL_INVALID_VALUE);
  if (((static_cast<std::int64_t>(w) << level) % 4) != 0 || ((static_cast<std::int64_t>(h) << level) % 4) != 0) return error(GL_INVALID_OPERATION);
  if (pbo >= 0) { if (!unpackBufferFits(pbo, bytes)) return error(GL_INVALID_OPERATION); data = reinterpret_cast<const void*>(static_cast<std::intptr_t>(pbo)); }
  else if (packOrUnpackBufferBound()) return error(GL_INVALID_OPERATION);
  glCompressedTexImage3D(target, level, ifmt, w, h, d, 0, static_cast<GLsizei>(bytes), pbo >= 0 || bytes ? data : nullptr);
  if (level == 0) { t.w = w; t.h = h; t.d = d; t.format = 0; t.cfmt = ifmt; t.f32 = t.f16 = false; t.swz = 0; }
}
void WebGL1::compressedTexSubImage3D(std::uint32_t target, int level, int xoff, int yoff, int zoff, int w, int h, int d, std::uint32_t fmt, const void* data, std::size_t bytes, std::int64_t pbo) {
  if (version_ != 2) return error(GL_INVALID_OPERATION);
  if (target != GL_TEXTURE_2D_ARRAY && target != GL_TEXTURE_3D) return error(GL_INVALID_ENUM);
  std::size_t want = 0;
  if (!compressedBytes(fmt, w < 0 ? 0 : w, h < 0 ? 0 : h, want)) return error(GL_INVALID_ENUM);
  if (target == GL_TEXTURE_3D) return error(GL_INVALID_OPERATION);
  if (level < 0 || level > 30 || w < 0 || h < 0 || d < 0 || xoff < 0 || yoff < 0 || zoff < 0) return error(GL_INVALID_VALUE);
  const Id id = texArr_[activeUnit_];
  if (!id) return error(GL_INVALID_OPERATION);
  GLint lw = 0, lh = 0, ld = 0;
  glGetTexLevelParameteriv(target, level, GL_TEXTURE_WIDTH, &lw);
  glGetTexLevelParameteriv(target, level, GL_TEXTURE_HEIGHT, &lh);
  glGetTexLevelParameteriv(target, level, GL_TEXTURE_DEPTH, &ld);
  while (glGetError() != GL_NO_ERROR) {}
  if (textures_[id].cfmt != fmt || lw == 0) return error(GL_INVALID_OPERATION);
  if (bytes != want * static_cast<std::size_t>(d)) return error(GL_INVALID_VALUE);
  if (xoff + w > lw || yoff + h > lh || zoff + d > ld) return error(GL_INVALID_VALUE);
  if (xoff % 4 || yoff % 4 || (w % 4 && xoff + w != lw) || (h % 4 && yoff + h != lh)) return error(GL_INVALID_OPERATION);
  if (pbo >= 0) { if (!unpackBufferFits(pbo, bytes)) return error(GL_INVALID_OPERATION); data = reinterpret_cast<const void*>(static_cast<std::intptr_t>(pbo)); }
  else if (packOrUnpackBufferBound()) return error(GL_INVALID_OPERATION);
  if (w == 0 || h == 0 || d == 0) return;
  glCompressedTexSubImage3D(target, level, xoff, yoff, zoff, w, h, d, fmt, static_cast<GLsizei>(bytes), data);
}

}  // namespace zn::gl
