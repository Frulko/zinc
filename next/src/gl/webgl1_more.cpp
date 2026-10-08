// The rest of the WebGL 1.0 surface (ZN-203.04): state setters, queries, renderbuffers, uniform/attribute variants, texture sub-updates. Same rules as webgl1.cpp: one error per call, objects as ids.
#include <algorithm>
#include <cstring>

#include "gl/webgl1.h"
#include "glad/gl.h"

namespace zn::gl {
namespace {

bool blendFactor(std::uint32_t f) {
  switch (f) { case GL_ZERO: case GL_ONE: case GL_SRC_COLOR: case GL_ONE_MINUS_SRC_COLOR: case GL_DST_COLOR: case GL_ONE_MINUS_DST_COLOR: case GL_SRC_ALPHA: case GL_ONE_MINUS_SRC_ALPHA: case GL_DST_ALPHA: case GL_ONE_MINUS_DST_ALPHA: case GL_CONSTANT_COLOR: case GL_ONE_MINUS_CONSTANT_COLOR: case GL_CONSTANT_ALPHA: case GL_ONE_MINUS_CONSTANT_ALPHA: case GL_SRC_ALPHA_SATURATE: return true; }
  return false;
}
bool blendMode(std::uint32_t m) { return m == GL_FUNC_ADD || m == GL_FUNC_SUBTRACT || m == GL_FUNC_REVERSE_SUBTRACT; }
bool compareFunc(std::uint32_t f) { return f >= GL_NEVER && f <= GL_ALWAYS; }
bool stencilOpOk(std::uint32_t o) { switch (o) { case GL_KEEP: case GL_ZERO: case GL_REPLACE: case GL_INCR: case GL_DECR: case GL_INVERT: case GL_INCR_WRAP: case GL_DECR_WRAP: return true; } return false; }
bool faceOk(std::uint32_t f) { return f == GL_FRONT || f == GL_BACK || f == GL_FRONT_AND_BACK; }
bool constColor(std::uint32_t f) { return f == GL_CONSTANT_COLOR || f == GL_ONE_MINUS_CONSTANT_COLOR; }
bool constAlpha(std::uint32_t f) { return f == GL_CONSTANT_ALPHA || f == GL_ONE_MINUS_CONSTANT_ALPHA; }

bool renderbufferFormatOk(std::uint32_t f, bool v2) {
  switch (f) { case GL_RGBA4: case GL_RGB565: case GL_RGB5_A1: case GL_DEPTH_COMPONENT16: case GL_STENCIL_INDEX8: case GL_DEPTH_STENCIL: return true; }
  if (!v2) return false;
  switch (f) {
    case GL_R8: case GL_RG8: case GL_RGB8: case GL_RGBA8: case GL_SRGB8_ALPHA8: case GL_RGB10_A2: case GL_RGB10_A2UI:
    case GL_R8UI: case GL_R8I: case GL_R16UI: case GL_R16I: case GL_R32UI: case GL_R32I: case GL_RG8UI: case GL_RG8I: case GL_RG16UI: case GL_RG16I: case GL_RG32UI: case GL_RG32I:
    case GL_RGBA8UI: case GL_RGBA8I: case GL_RGBA16UI: case GL_RGBA16I: case GL_RGBA32UI: case GL_RGBA32I:
    case GL_DEPTH_COMPONENT24: case GL_DEPTH_COMPONENT32F: case GL_DEPTH24_STENCIL8: case GL_DEPTH32F_STENCIL8: return true;
  }
  return false;
}

}  // namespace

// ---- state
void WebGL1::blendColor(float r, float g, float b, float a) { glBlendColor(r, g, b, a); }
void WebGL1::blendEquation(std::uint32_t m) { if (!blendMode(m)) return error(GL_INVALID_ENUM); glBlendEquation(m); }
void WebGL1::blendEquationSeparate(std::uint32_t rgb, std::uint32_t a) { if (!blendMode(rgb) || !blendMode(a)) return error(GL_INVALID_ENUM); glBlendEquationSeparate(rgb, a); }
void WebGL1::blendFunc(std::uint32_t s, std::uint32_t d) { blendFuncSeparate(s, d, s, d); }
void WebGL1::blendFuncSeparate(std::uint32_t sr, std::uint32_t dr, std::uint32_t sa, std::uint32_t da) {
  if (!blendFactor(sr) || !blendFactor(dr) || !blendFactor(sa) || !blendFactor(da)) return error(GL_INVALID_ENUM);
  if ((constColor(sr) && constAlpha(dr)) || (constAlpha(sr) && constColor(dr)) || (constColor(sa) && constAlpha(da)) || (constAlpha(sa) && constColor(da))) return error(GL_INVALID_OPERATION);   // WebGL: both kinds of constant at once
  glBlendFuncSeparate(sr, dr, sa, da);
}
void WebGL1::clearDepth(float d) { glClearDepth(d); }
void WebGL1::clearStencil(int s) { glClearStencil(s); }
void WebGL1::colorMask(bool r, bool g, bool b, bool a) { glColorMask(r, g, b, a); }
void WebGL1::cullFace(std::uint32_t m) { if (!faceOk(m)) return error(GL_INVALID_ENUM); glCullFace(m); }
void WebGL1::depthFunc(std::uint32_t f) { if (!compareFunc(f)) return error(GL_INVALID_ENUM); glDepthFunc(f); }
void WebGL1::depthMask(bool m) { glDepthMask(m); }
void WebGL1::depthRange(float n, float f) { if (n > f) return error(GL_INVALID_OPERATION); glDepthRange(n, f); }
void WebGL1::frontFace(std::uint32_t m) { if (m != GL_CW && m != GL_CCW) return error(GL_INVALID_ENUM); glFrontFace(m); }
void WebGL1::hint(std::uint32_t target, std::uint32_t mode) {
  if (target != GL_GENERATE_MIPMAP_HINT && !(version_ == 2 && target == 0x8B8B)) return error(GL_INVALID_ENUM);   // 0x8B8B: FRAGMENT_SHADER_DERIVATIVE_HINT (WebGL 2, or OES_standard_derivatives)
  if (mode != GL_DONT_CARE && mode != GL_FASTEST && mode != GL_NICEST) return error(GL_INVALID_ENUM);
  (target == GL_GENERATE_MIPMAP_HINT ? mipmapHint_ : derivativeHint_) = mode;
  if (target == GL_GENERATE_MIPMAP_HINT) glHint(target, mode);
}
void WebGL1::lineWidth(float w) { if (!(w > 0)) return error(GL_INVALID_VALUE); glLineWidth(std::min(w, 1.0f)); }   // core profiles accept only 1.0
void WebGL1::polygonOffset(float f, float u) { glPolygonOffset(f, u); }
void WebGL1::sampleCoverage(float v, bool inv) { glSampleCoverage(v, inv); }
void WebGL1::stencilFunc(std::uint32_t f, int ref, std::uint32_t mask) { stencilFuncSeparate(GL_FRONT_AND_BACK, f, ref, mask); }
void WebGL1::stencilFuncSeparate(std::uint32_t face, std::uint32_t f, int ref, std::uint32_t mask) {
  if (!faceOk(face) || !compareFunc(f)) return error(GL_INVALID_ENUM);
  glStencilFuncSeparate(face, f, ref, mask);
}
void WebGL1::stencilMask(std::uint32_t m) { glStencilMask(m); }
void WebGL1::stencilMaskSeparate(std::uint32_t face, std::uint32_t m) { if (!faceOk(face)) return error(GL_INVALID_ENUM); glStencilMaskSeparate(face, m); }
void WebGL1::stencilOp(std::uint32_t a, std::uint32_t b, std::uint32_t c) { stencilOpSeparate(GL_FRONT_AND_BACK, a, b, c); }
void WebGL1::stencilOpSeparate(std::uint32_t face, std::uint32_t a, std::uint32_t b, std::uint32_t c) {
  if (!faceOk(face) || !stencilOpOk(a) || !stencilOpOk(b) || !stencilOpOk(c)) return error(GL_INVALID_ENUM);
  glStencilOpSeparate(face, a, b, c);
}
void WebGL1::flush() { glFlush(); }
void WebGL1::finish() { glFinish(); }

// ---- renderbuffers
void WebGL1::attachRb(Id fbo, std::uint32_t attachment, Id rb, std::uint32_t tex) {
  Fbo& f = fbos_[fbo];
  Id old[2] = {0, 0}; std::uint32_t oldTex[2] = {0, 0};
  auto set = [&](int slot) { old[slot == 5] = f.rb[slot]; oldTex[slot == 5] = f.tx[slot]; f.rb[slot] = rb; f.tx[slot] = tex; };
  if (attachment == GL_DEPTH_STENCIL_ATTACHMENT) { set(4); set(5); } else if (attachment == GL_DEPTH_ATTACHMENT) set(4); else if (attachment == GL_STENCIL_ATTACHMENT) set(5); else set(static_cast<int>(attachment - GL_COLOR_ATTACHMENT0));
  for (Id o : old) {
    auto it = o ? rbos_.find(o) : rbos_.end();
    if (it == rbos_.end() || !it->second.deleted) continue;
    bool held = false;
    for (auto& e : fbos_) for (Id r : e.second.rb) if (r == o) held = true;
    if (!held) { glDeleteRenderbuffers(1, &it->second.name); rbos_.erase(it); }
  }
  for (std::uint32_t t : oldTex) {
    auto z = t ? zombieTex_.find(t) : zombieTex_.end();
    if (z == zombieTex_.end()) continue;
    bool held = false;
    for (auto& e : fbos_) for (std::uint32_t n : e.second.tx) if (n == t) held = true;
    if (!held) { glDeleteTextures(1, &t); zombieTex_.erase(z); }
  }
}
Id WebGL1::createRenderbuffer() {
  Rbo r; glGenRenderbuffers(1, &r.name);
  for (auto it = rbos_.begin(); it != rbos_.end();) it = it->second.deleted && it->second.name == r.name ? rbos_.erase(it) : std::next(it);   // the driver reused the name of a detached, deleted one
  Id id = nextId_++; rbos_[id] = r; return id;
}
void WebGL1::deleteRenderbuffer(Id id) {
  auto it = rbos_.find(id);
  if (it == rbos_.end()) return;
  if (it->second.deleted) return;
  if (rbo_ == id) { rbo_ = 0; glBindRenderbuffer(GL_RENDERBUFFER, 0); }
  // deleting an image attached to the bound framebuffer detaches it there (as GL does); other framebuffers keep it
  for (int side = 0; side < 2; ++side) {
    const Id fb = side ? fboRead_ : fbo_;
    if (!fb || (side && fboRead_ == fbo_)) continue;
    for (int slot = 0; slot < 6; ++slot) if (fbos_[fb].rb[slot] == id) {
      static const GLenum atts[6] = {GL_COLOR_ATTACHMENT0, GL_COLOR_ATTACHMENT0 + 1, GL_COLOR_ATTACHMENT0 + 2, GL_COLOR_ATTACHMENT0 + 3, GL_DEPTH_ATTACHMENT, GL_STENCIL_ATTACHMENT};
      glFramebufferRenderbuffer(side ? GL_READ_FRAMEBUFFER : GL_DRAW_FRAMEBUFFER, atts[slot], GL_RENDERBUFFER, 0);
      if (slot == 0) fbos_[fb].colorRb = 0;
      attachRb(fb, atts[slot], 0);
    }
  }
  bool held = false;
  for (auto& e : fbos_) for (Id r : e.second.rb) if (r == id) held = true;
  if (held) { it->second.deleted = true; return; }   // WebGL keeps an attached image alive (GL would detach it from the bound framebuffer): freed when the last attachment goes
  glDeleteRenderbuffers(1, &it->second.name);
  rbos_.erase(it);
}
void WebGL1::bindRenderbuffer(std::uint32_t target, Id id) {
  if (target != GL_RENDERBUFFER) return error(GL_INVALID_ENUM);
  std::uint32_t name = 0;
  if (id) {
    auto it = rbos_.find(id);
    if (it == rbos_.end() || it->second.deleted) return error(GL_INVALID_OPERATION);
    name = it->second.name;
    it->second.bound = true;
  }
  rbo_ = id;
  glBindRenderbuffer(GL_RENDERBUFFER, name);
}
void WebGL1::renderbufferStorage(std::uint32_t target, std::uint32_t fmt, int w, int h) {
  if (target != GL_RENDERBUFFER) return error(GL_INVALID_ENUM);
  if (!renderbufferFormatOk(fmt, version_ == 2)) return error(GL_INVALID_ENUM);
  if (w < 0 || h < 0 || w > maxTexSize_ || h > maxTexSize_) return error(GL_INVALID_VALUE);
  if (!rbo_) return error(GL_INVALID_OPERATION);
  Rbo& r = rbos_[rbo_];
  r.w = w; r.h = h; r.format = fmt; r.samples = 0;
  glRenderbufferStorage(GL_RENDERBUFFER, fmt == GL_DEPTH_STENCIL ? GL_DEPTH24_STENCIL8 : fmt, w, h);
}
WebGL1::Param WebGL1::getRenderbufferParameter(std::uint32_t target, std::uint32_t pname) {
  Param r;
  if (target != GL_RENDERBUFFER) { error(GL_INVALID_ENUM); return r; }
  const bool sizes = pname >= GL_RENDERBUFFER_RED_SIZE && pname <= GL_RENDERBUFFER_STENCIL_SIZE;
  if (pname != GL_RENDERBUFFER_WIDTH && pname != GL_RENDERBUFFER_HEIGHT && pname != GL_RENDERBUFFER_INTERNAL_FORMAT && !sizes && !(version_ == 2 && pname == GL_RENDERBUFFER_SAMPLES)) { error(GL_INVALID_ENUM); return r; }
  if (!rbo_) { error(GL_INVALID_OPERATION); return r; }
  GLint v = 0;
  glGetRenderbufferParameteriv(GL_RENDERBUFFER, pname, &v);
  if (pname == GL_RENDERBUFFER_INTERNAL_FORMAT && rbos_[rbo_].format) v = static_cast<GLint>(rbos_[rbo_].format);   // DEPTH_STENCIL is DEPTH24_STENCIL8 underneath
  r.ok = true; r.kind = 'i'; r.v.push_back(v);
  return r;
}
void WebGL1::framebufferRenderbuffer(std::uint32_t target, std::uint32_t attachment, std::uint32_t rbtarget, Id rb) {
  if ((target != GL_FRAMEBUFFER && !(version_ == 2 && (target == GL_READ_FRAMEBUFFER || target == GL_DRAW_FRAMEBUFFER))) || rbtarget != GL_RENDERBUFFER) return error(GL_INVALID_ENUM);
  if (attachment != GL_COLOR_ATTACHMENT0 && attachment != GL_DEPTH_ATTACHMENT && attachment != GL_STENCIL_ATTACHMENT && attachment != GL_DEPTH_STENCIL_ATTACHMENT && !(version_ == 2 && attachment > GL_COLOR_ATTACHMENT0 && attachment < GL_COLOR_ATTACHMENT0 + 4)) return error(GL_INVALID_ENUM);
  if (!(target == GL_READ_FRAMEBUFFER ? fboRead_ : fbo_)) return error(GL_INVALID_OPERATION);
  std::uint32_t name = 0;
  if (rb) {
    auto it = rbos_.find(rb);
    if (it == rbos_.end() || it->second.deleted) return error(GL_INVALID_OPERATION);
    name = it->second.name;
  }
  const Id fb = target == GL_READ_FRAMEBUFFER ? fboRead_ : fbo_;
  if (attachment == GL_COLOR_ATTACHMENT0) { Fbo& f = fbos_[fb]; f.colorRb = rb; f.color = 0; }
  attachRb(fb, attachment, rb);
  glFramebufferRenderbuffer(target, attachment, GL_RENDERBUFFER, name);
}
void WebGL1::deleteFramebuffer(Id id) {
  auto it = fbos_.find(id);
  if (it == fbos_.end()) return;
  glDeleteFramebuffers(1, &it->second.name);
  for (std::uint32_t att : {0x8CE0u, 0x8CE1u, 0x8CE2u, 0x8CE3u, 0x821Au}) attachRb(id, att, 0);
  if (fbo_ == id) { fbo_ = 0; glBindFramebuffer(GL_FRAMEBUFFER, gl_.framebuffer()); }
  fbos_.erase(it);
}

// ---- queries
bool WebGL1::isEnabled(std::uint32_t cap) {
  if (version_ == 2 && cap == GL_RASTERIZER_DISCARD) return glIsEnabled(cap) != 0;
  switch (cap) { case GL_BLEND: case GL_CULL_FACE: case GL_DEPTH_TEST: case GL_DITHER: case GL_POLYGON_OFFSET_FILL: case GL_SAMPLE_ALPHA_TO_COVERAGE: case GL_SAMPLE_COVERAGE: case GL_SCISSOR_TEST: case GL_STENCIL_TEST: return glIsEnabled(cap) != 0; }
  error(GL_INVALID_ENUM);
  return false;
}
std::string WebGL1::shaderSourceOf(Id s) const { auto it = shaders_.find(s); return it == shaders_.end() ? "" : it->second.source; }
std::uint32_t WebGL1::shaderTypeOf(Id s) const { auto it = shaders_.find(s); return it == shaders_.end() ? 0 : it->second.type; }
bool WebGL1::shaderQueryOk(Id s, std::uint32_t pname) {
  if (!shaders_.count(s)) { error(GL_INVALID_OPERATION); return false; }
  if (pname != GL_DELETE_STATUS && pname != GL_COMPILE_STATUS && pname != GL_SHADER_TYPE) { error(GL_INVALID_ENUM); return false; }
  return true;
}
// a shader attached to a program stays an object (DELETE_STATUS true) until it is detached
void WebGL1::deleteShader(Id id) {
  auto it = shaders_.find(id);
  if (it == shaders_.end()) return;
  glDeleteShader(it->second.name);
  it->second.deleted = true;
  if (it->second.attached <= 0) shaders_.erase(it);
}
void WebGL1::deleteProgram(Id id) {
  auto it = programs_.find(id);
  if (it == programs_.end()) return;
  glDeleteProgram(it->second.name);
  if (program_ == id) { it->second.deleted = true; return; }   // in use: deleted when another program replaces it (useProgram)
  eraseProgram(id);
}
void WebGL1::detachShader(Id pid, Id sid) {
  auto p = programs_.find(pid);
  auto s = shaders_.find(sid);
  if (p == programs_.end() || s == shaders_.end()) return error(GL_INVALID_OPERATION);
  Id& slot = s->second.type == GL_VERTEX_SHADER ? p->second.vs : p->second.fs;
  if (slot != sid) return error(GL_INVALID_OPERATION);
  slot = 0;
  glDetachShader(p->second.name, s->second.name);
  if (--s->second.attached <= 0 && s->second.deleted) shaders_.erase(s);
}
void WebGL1::validateProgram(Id pid) { auto p = programs_.find(pid); if (p == programs_.end()) return error(GL_INVALID_OPERATION); glValidateProgram(p->second.name); }
WebGL1::Active WebGL1::getActiveUniform(Id pid, std::uint32_t index) {
  Active a;
  auto p = programs_.find(pid);
  if (p == programs_.end()) { error(GL_INVALID_VALUE); return a; }
  GLint n = 0;
  glGetProgramiv(p->second.name, GL_ACTIVE_UNIFORMS, &n);
  if (index >= static_cast<std::uint32_t>(n)) { error(GL_INVALID_VALUE); return a; }
  char buf[256]; GLsizei len = 0; GLint size = 0; GLenum type = 0;
  glGetActiveUniform(p->second.name, index, sizeof buf, &len, &size, &type, buf);
  a.name.assign(buf, static_cast<std::size_t>(len)); a.size = size; a.type = type; a.ok = true;
  return a;
}
WebGL1::Active WebGL1::getActiveAttrib(Id pid, std::uint32_t index) {
  Active a;
  auto p = programs_.find(pid);
  if (p == programs_.end()) { error(GL_INVALID_VALUE); return a; }
  GLint n = 0;
  glGetProgramiv(p->second.name, GL_ACTIVE_ATTRIBUTES, &n);
  if (index >= static_cast<std::uint32_t>(n)) { error(GL_INVALID_VALUE); return a; }
  char buf[256]; GLsizei len = 0; GLint size = 0; GLenum type = 0;
  glGetActiveAttrib(p->second.name, index, sizeof buf, &len, &size, &type, buf);
  a.name.assign(buf, static_cast<std::size_t>(len)); a.size = size; a.type = type; a.ok = true;
  return a;
}
int WebGL1::programParameter(Id pid, std::uint32_t pname, bool& ok) {
  ok = true;
  auto p = programs_.find(pid);
  if (p == programs_.end()) { ok = false; error(GL_INVALID_OPERATION); return 0; }
  GLint v = 0;
  switch (pname) {
    case GL_DELETE_STATUS: return p->second.deleted ? 1 : 0;
    case GL_LINK_STATUS: return p->second.linked ? 1 : 0;
    case GL_VALIDATE_STATUS: glGetProgramiv(p->second.name, GL_VALIDATE_STATUS, &v); return v;
    case GL_ATTACHED_SHADERS: return (p->second.vs ? 1 : 0) + (p->second.fs ? 1 : 0);
    case GL_ACTIVE_UNIFORMS: case GL_ACTIVE_ATTRIBUTES: glGetProgramiv(p->second.name, pname, &v); return v;
    case GL_ACTIVE_UNIFORM_BLOCKS: case GL_TRANSFORM_FEEDBACK_VARYINGS: case GL_TRANSFORM_FEEDBACK_BUFFER_MODE: if (version_ != 2) break; glGetProgramiv(p->second.name, pname, &v); return v;
  }
  ok = false;
  error(GL_INVALID_ENUM);
  return 0;
}

WebGL1::Param WebGL1::getParameter(std::uint32_t pname) {
  Param r;
  r.ok = true;
  auto ints = [&](int n) { GLint v[4] = {}; glGetIntegerv(pname, v); r.kind = n == 1 ? 'i' : 'a'; for (int i = 0; i < n; ++i) r.v.push_back(v[i]); };
  auto floats = [&](int n) { GLfloat v[4] = {}; glGetFloatv(pname, v); r.kind = n == 1 ? 'f' : 'a'; for (int i = 0; i < n; ++i) r.v.push_back(v[i]); };
  auto bools = [&](int n) { GLboolean v[4] = {}; glGetBooleanv(pname, v); r.kind = n == 1 ? 'b' : 'a'; for (int i = 0; i < n; ++i) r.v.push_back(v[i] ? 1 : 0); };
  auto object = [&](Id id, int kind) { r.kind = id ? 'o' : 'n'; r.object = id; r.objKind = kind; };
  auto fixed = [&](double x) { r.kind = 'i'; r.v.push_back(x); };
  switch (pname) {
    case GL_ACTIVE_TEXTURE: fixed(GL_TEXTURE0 + activeUnit_); break;
    case GL_VIEWPORT: case GL_SCISSOR_BOX: ints(4); break;
    case GL_ALIASED_LINE_WIDTH_RANGE: r.kind = 'a'; r.v = {1, 1}; break;
    case GL_ALIASED_POINT_SIZE_RANGE: { GLfloat v[2] = {1, 1}; glGetFloatv(GL_POINT_SIZE_RANGE, v); r.kind = 'a'; r.v = {1, std::max<double>(1, v[1])}; break; }   // core GL names it POINT_SIZE_RANGE; WebGL wants a minimum of at most 1
    case GL_DEPTH_RANGE: floats(2); break;
    case GL_COLOR_CLEAR_VALUE: case GL_BLEND_COLOR: floats(4); break;
    case GL_COLOR_WRITEMASK: bools(4); break;
    case GL_DEPTH_WRITEMASK: case GL_SAMPLE_COVERAGE_INVERT: bools(1); break;
    case GL_BLEND: case GL_CULL_FACE: case GL_DEPTH_TEST: case GL_DITHER: case GL_POLYGON_OFFSET_FILL: case GL_SAMPLE_ALPHA_TO_COVERAGE: case GL_SAMPLE_COVERAGE: case GL_SCISSOR_TEST: case GL_STENCIL_TEST: bools(1); break;
    case GL_LINE_WIDTH: fixed(1); r.kind = 'f'; break;
    case GL_DEPTH_CLEAR_VALUE: case GL_POLYGON_OFFSET_FACTOR: case GL_POLYGON_OFFSET_UNITS: case GL_SAMPLE_COVERAGE_VALUE: floats(1); break;
    case GL_BLEND_DST_ALPHA: case GL_BLEND_DST_RGB: case GL_BLEND_SRC_ALPHA: case GL_BLEND_SRC_RGB: case GL_BLEND_EQUATION_RGB: case GL_BLEND_EQUATION_ALPHA:
    case GL_CULL_FACE_MODE: case GL_FRONT_FACE: case GL_DEPTH_FUNC:
    case GL_STENCIL_FUNC: case GL_STENCIL_FAIL: case GL_STENCIL_PASS_DEPTH_FAIL: case GL_STENCIL_PASS_DEPTH_PASS: case GL_STENCIL_BACK_FUNC: case GL_STENCIL_BACK_FAIL: case GL_STENCIL_BACK_PASS_DEPTH_FAIL: case GL_STENCIL_BACK_PASS_DEPTH_PASS:
    case GL_STENCIL_REF: case GL_STENCIL_BACK_REF: case GL_STENCIL_CLEAR_VALUE: case GL_STENCIL_VALUE_MASK: case GL_STENCIL_BACK_VALUE_MASK: case GL_STENCIL_WRITEMASK: case GL_STENCIL_BACK_WRITEMASK: ints(1); break;
    case GL_GENERATE_MIPMAP_HINT: fixed(mipmapHint_); break;
    case 0x8B8B: if (version_ != 2) { r.ok = false; error(GL_INVALID_ENUM); } else fixed(derivativeHint_); break;   // FRAGMENT_SHADER_DERIVATIVE_HINT
    case GL_PACK_ALIGNMENT: case GL_UNPACK_ALIGNMENT: case GL_SUBPIXEL_BITS: case GL_SAMPLE_BUFFERS: case GL_SAMPLES: ints(1); break;
    case GL_DEPTH_BITS: case GL_STENCIL_BITS: {
      const bool depth = pname == GL_DEPTH_BITS;
      GLint v = 0;
      if (!fbo_) v = (depth ? depthAttr_ : stencilAttr_) ? (depth ? 24 : 8) : 0;
      else {   // a framebuffer object: the bits of what is attached
        glGetFramebufferAttachmentParameteriv(GL_DRAW_FRAMEBUFFER, depth ? GL_DEPTH_ATTACHMENT : GL_STENCIL_ATTACHMENT, depth ? GL_FRAMEBUFFER_ATTACHMENT_DEPTH_SIZE : GL_FRAMEBUFFER_ATTACHMENT_STENCIL_SIZE, &v);
        while (glGetError() != GL_NO_ERROR) {}   // an empty attachment point is an error in GL and 0 bits here
      }
      fixed(v);
      break;
    }
    case GL_RED_BITS: case GL_GREEN_BITS: case GL_BLUE_BITS: case GL_ALPHA_BITS: {
      GLint v = 0;
      glGetFramebufferAttachmentParameteriv(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_FRAMEBUFFER_ATTACHMENT_RED_SIZE, &v);   // clears any error a default framebuffer query leaves
      while (glGetError() != GL_NO_ERROR) {}
      fixed(pname == GL_DEPTH_BITS ? 24 : pname == GL_STENCIL_BITS ? 8 : 8);
      break;
    }
    case GL_MAX_TEXTURE_SIZE: fixed(maxTexSize_); break;
    case GL_MAX_CUBE_MAP_TEXTURE_SIZE: case GL_MAX_RENDERBUFFER_SIZE: ints(1); break;
    case 0x8B9B: case 0x8B9A: { std::uint32_t f, t; implementationReadFormat(f, t); fixed(pname == 0x8B9B ? f : t); break; }   // IMPLEMENTATION_COLOR_READ_FORMAT, _TYPE
    case GL_MAX_VERTEX_ATTRIBS: fixed(kMaxVertexAttribs); break;
    case GL_MAX_VERTEX_UNIFORM_VECTORS: { GLint v = 0; glGetIntegerv(GL_MAX_VERTEX_UNIFORM_COMPONENTS, &v); fixed(v / 4); break; }
    case GL_MAX_FRAGMENT_UNIFORM_VECTORS: { GLint v = 0; glGetIntegerv(GL_MAX_FRAGMENT_UNIFORM_COMPONENTS, &v); fixed(v / 4); break; }
    case GL_MAX_VARYING_VECTORS: fixed(15); break;
    case GL_MAX_COMBINED_TEXTURE_IMAGE_UNITS: case GL_MAX_VERTEX_TEXTURE_IMAGE_UNITS: case GL_MAX_TEXTURE_IMAGE_UNITS: { GLint v = 0; glGetIntegerv(pname, &v); fixed(std::min<GLint>(v, 32)); break; }
    case GL_MAX_VIEWPORT_DIMS: ints(2); break;
    case GL_COMPRESSED_TEXTURE_FORMATS: r.kind = 'a'; break;
    case GL_VERSION: r.kind = 's'; r.s = version_ == 2 ? "WebGL 2.0 (Zinc)" : "WebGL 1.0 (Zinc)"; break;
    case GL_SHADING_LANGUAGE_VERSION: r.kind = 's'; r.s = version_ == 2 ? "WebGL GLSL ES 3.00 (Zinc)" : "WebGL GLSL ES 1.0 (Zinc)"; break;
    case GL_VENDOR: r.kind = 's'; r.s = "WebKit"; break;
    case GL_RENDERER: r.kind = 's'; r.s = "WebKit WebGL"; break;
    case GL_ARRAY_BUFFER_BINDING: object(arrayBuffer_, 1); break;
    case GL_ELEMENT_ARRAY_BUFFER_BINDING: object(elementBuffer_, 1); break;
    case GL_CURRENT_PROGRAM: object(program_, 3); break;
    case GL_TEXTURE_BINDING_2D: object(tex2d_[activeUnit_], 4); break;
    case GL_TEXTURE_BINDING_CUBE_MAP: object(texCube_[activeUnit_], 4); break;
    case 0x806A: case 0x8C1D: if (version_ != 2) { r.ok = false; error(GL_INVALID_ENUM); } else object(pname == 0x806A ? tex3d_[activeUnit_] : texArr_[activeUnit_], 4); break;   // TEXTURE_BINDING_3D, TEXTURE_BINDING_2D_ARRAY
    case GL_FRAMEBUFFER_BINDING: object(fbo_, 5); break;   // (the DRAW and READ bindings are WebGL 2 pnames below)
    case GL_RENDERBUFFER_BINDING: object(rbo_, 7); break;
    case GL_READ_BUFFER: case GL_SAMPLER_BINDING: case GL_TRANSFORM_FEEDBACK_BINDING: case GL_MAX_ELEMENT_INDEX: case GL_MAX_ARRAY_TEXTURE_LAYERS: case GL_MAX_3D_TEXTURE_SIZE: case GL_MAX_SAMPLES: case GL_MAX_COMBINED_UNIFORM_BLOCKS: case GL_MAX_VERTEX_UNIFORM_BLOCKS: case GL_MAX_FRAGMENT_UNIFORM_BLOCKS: case GL_MAX_UNIFORM_BLOCK_SIZE: case GL_MIN_PROGRAM_TEXEL_OFFSET: case GL_MAX_PROGRAM_TEXEL_OFFSET: case GL_MAX_TEXTURE_LOD_BIAS: case GL_PACK_ROW_LENGTH: case GL_PACK_SKIP_PIXELS: case GL_PACK_SKIP_ROWS: case GL_UNPACK_ROW_LENGTH: case GL_UNPACK_IMAGE_HEIGHT: case GL_UNPACK_SKIP_PIXELS: case GL_UNPACK_SKIP_ROWS: case GL_UNPACK_SKIP_IMAGES: case GL_PIXEL_PACK_BUFFER_BINDING: case GL_PIXEL_UNPACK_BUFFER_BINDING: case GL_TRANSFORM_FEEDBACK_BUFFER_BINDING: case GL_TRANSFORM_FEEDBACK_ACTIVE: case GL_TRANSFORM_FEEDBACK_PAUSED: case GL_READ_FRAMEBUFFER_BINDING:
      if (version_ != 2) { r.ok = false; error(GL_INVALID_ENUM); break; }
      switch (pname) {
        case GL_READ_BUFFER: fixed(fboRead_ ? fbos_[fboRead_].readBuffer : defaultRead_); break;
        case GL_SAMPLER_BINDING: object(samplerUnit_[activeUnit_], 9); break;
        case GL_TRANSFORM_FEEDBACK_BINDING: object(tf_, 12); break;
        case GL_MAX_ELEMENT_INDEX: fixed(4294967295.0); break;
        case GL_PIXEL_PACK_BUFFER_BINDING: object(otherBuffers_[GL_PIXEL_PACK_BUFFER], 1); break;
        case GL_PIXEL_UNPACK_BUFFER_BINDING: object(otherBuffers_[GL_PIXEL_UNPACK_BUFFER], 1); break;
        case GL_TRANSFORM_FEEDBACK_BUFFER_BINDING: object(otherBuffers_[GL_TRANSFORM_FEEDBACK_BUFFER], 1); break;
        case GL_TRANSFORM_FEEDBACK_ACTIVE: case GL_TRANSFORM_FEEDBACK_PAUSED: { auto it = tfs_.find(tf_); r.kind = 'b'; r.v.push_back(it != tfs_.end() && (pname == GL_TRANSFORM_FEEDBACK_ACTIVE ? it->second.active : it->second.paused)); break; }
        case GL_READ_FRAMEBUFFER_BINDING: object(fboRead_, 5); break;
        case GL_MAX_TEXTURE_LOD_BIAS: floats(1); break;
        default: ints(1);
      }
      break;
    case GL_RASTERIZER_DISCARD: case 0x9247: case 0x9111: case 0x80E8: case 0x80E9: case 0x9125: case 0x8B49: case 0x8B4A: case 0x8B4B: case 0x9122: case 0x8A31: case 0x8A33:
    case 0x8C8A: case 0x8C8B: case 0x8C80: {   // WebGL 2 limits: the context reports what the WebGL 2 minimums and the GL 3.3 core query allow
      if (version_ != 2) { r.ok = false; error(GL_INVALID_ENUM); break; }
      GLint64 v = 0;
      switch (pname) {
        case GL_RASTERIZER_DISCARD: bools(1); break;
        case 0x9247: fixed(1000000000); break;                                // MAX_CLIENT_WAIT_TIMEOUT_WEBGL
        case 0x9111: fixed(0x7FFFFFFF); break;                         // MAX_SERVER_WAIT_TIMEOUT
        case 0x80E8: case 0x80E9: fixed(1 << 20); break;               // MAX_ELEMENTS_VERTICES / INDICES (not in a core profile)
        case 0x9125: case 0x8B4B: fixed(60); break;                    // MAX_FRAGMENT_INPUT_COMPONENTS, MAX_VARYING_COMPONENTS: the 15 varying vectors reported
        case 0x9122: fixed(64); break;                                  // MAX_VERTEX_OUTPUT_COMPONENTS
        case 0x8B49: case 0x8B4A: glGetInteger64v(pname, &v); fixed(static_cast<double>(v)); break;   // MAX_FRAGMENT / VERTEX_UNIFORM_COMPONENTS
        case 0x8A31: case 0x8A33: {   // MAX_COMBINED_VERTEX / FRAGMENT_UNIFORM_COMPONENTS = blocks * block size / 4 + default-block components
          GLint64 size = 0, blocks = 0, comps = 0;
          glGetInteger64v(GL_MAX_UNIFORM_BLOCK_SIZE, &size);
          glGetInteger64v(pname == 0x8A31 ? GL_MAX_VERTEX_UNIFORM_BLOCKS : GL_MAX_FRAGMENT_UNIFORM_BLOCKS, &blocks);
          glGetInteger64v(pname == 0x8A31 ? GL_MAX_VERTEX_UNIFORM_COMPONENTS : GL_MAX_FRAGMENT_UNIFORM_COMPONENTS, &comps);
          fixed(static_cast<double>(size / 4 * blocks + comps));
          break;
        }
        default: glGetInteger64v(pname, &v); fixed(static_cast<double>(v));   // the transform feedback limits
      }
      break;
    }
    case GL_DRAW_BUFFER0: case GL_DRAW_BUFFER0 + 1: case GL_DRAW_BUFFER0 + 2: case GL_DRAW_BUFFER0 + 3:
      if (version_ != 2) { r.ok = false; error(GL_INVALID_ENUM); break; }
      fixed(fbo_ ? fbos_[fbo_].draw[pname - GL_DRAW_BUFFER0] : defaultDraw_[pname - GL_DRAW_BUFFER0]);
      break;
    case GL_VERTEX_ARRAY_BINDING: if (version_ != 2) { r.ok = false; error(GL_INVALID_ENUM); } else object(curVao_, 8); break;
    case GL_MAX_DRAW_BUFFERS: case GL_MAX_COLOR_ATTACHMENTS: if (version_ != 2) { r.ok = false; error(GL_INVALID_ENUM); } else fixed(4); break;
    case GL_MAX_UNIFORM_BUFFER_BINDINGS: if (version_ != 2) { r.ok = false; error(GL_INVALID_ENUM); } else fixed(24); break;
    case GL_UNIFORM_BUFFER_OFFSET_ALIGNMENT: if (version_ != 2) { r.ok = false; error(GL_INVALID_ENUM); } else ints(1); break;
    case GL_UNIFORM_BUFFER_BINDING: case GL_COPY_READ_BUFFER_BINDING: case GL_COPY_WRITE_BUFFER_BINDING: if (version_ != 2) { r.ok = false; error(GL_INVALID_ENUM); } else object(otherBuffers_[pname == GL_UNIFORM_BUFFER_BINDING ? GL_UNIFORM_BUFFER : pname == GL_COPY_READ_BUFFER_BINDING ? GL_COPY_READ_BUFFER : GL_COPY_WRITE_BUFFER], 1); break;
    case 0x9240: r.kind = 'b'; r.v.push_back(unpackFlipY_); break;           // UNPACK_FLIP_Y_WEBGL
    case 0x9241: r.kind = 'b'; r.v.push_back(unpackPremultiply_); break;     // UNPACK_PREMULTIPLY_ALPHA_WEBGL
    case 0x9243: fixed(unpackColorspace_); break;                             // UNPACK_COLORSPACE_CONVERSION_WEBGL
    default: r.ok = false; error(GL_INVALID_ENUM);
  }
  return r;
}
WebGL1::Param WebGL1::getVertexAttrib(std::uint32_t index, std::uint32_t pname) {
  Param r;
  if (index >= kMaxVertexAttribs) { error(GL_INVALID_VALUE); return r; }
  const Attrib& a = attribs_[index];
  r.ok = true;
  switch (pname) {
    case GL_VERTEX_ATTRIB_ARRAY_ENABLED: r.kind = 'b'; r.v.push_back(a.enabled); break;
    case GL_VERTEX_ATTRIB_ARRAY_SIZE: r.kind = 'i'; r.v.push_back(a.size); break;
    case GL_VERTEX_ATTRIB_ARRAY_STRIDE: r.kind = 'i'; r.v.push_back(a.stride); break;
    case GL_VERTEX_ATTRIB_ARRAY_TYPE: r.kind = 'i'; r.v.push_back(a.type); break;
    case GL_VERTEX_ATTRIB_ARRAY_NORMALIZED: r.kind = 'b'; r.v.push_back(a.normalized); break;
    case 0x88FE: if (version_ != 2) { r.ok = false; error(GL_INVALID_ENUM); } else { r.kind = 'i'; r.v.push_back(a.divisor); } break;   // VERTEX_ATTRIB_ARRAY_DIVISOR
    case 0x88FD: if (version_ != 2) { r.ok = false; error(GL_INVALID_ENUM); } else { r.kind = 'b'; r.v.push_back(a.integer ? 1 : 0); } break;   // VERTEX_ATTRIB_ARRAY_INTEGER
    case GL_VERTEX_ATTRIB_ARRAY_BUFFER_BINDING: r.kind = a.buffer ? 'o' : 'n'; r.object = a.buffer; r.objKind = 1; break;
    case GL_CURRENT_VERTEX_ATTRIB:
      if (genericType_[index] != GL_FLOAT) {   // set with vertexAttribI4*: integers
        r.kind = genericType_[index] == GL_INT ? 'I' : 'U';
        if (r.kind == 'I') { GLint v[4] = {}; glGetVertexAttribIiv(index, pname, v); for (int x : v) r.v.push_back(x); }
        else { GLuint v[4] = {}; glGetVertexAttribIuiv(index, pname, v); for (unsigned x : v) r.v.push_back(x); }
        break;
      }
      { r.kind = 'a'; GLfloat v[4] = {}; glGetVertexAttribfv(index, pname, v); for (float x : v) r.v.push_back(x); break; }
    default: r.ok = false; error(GL_INVALID_ENUM);
  }
  return r;
}
WebGL1::Param WebGL1::getBufferParameter(std::uint32_t target, std::uint32_t pname) {
  Param r;
  if (!bufferTargetOk(target)) { error(GL_INVALID_ENUM); return r; }
  if (pname != GL_BUFFER_SIZE && pname != GL_BUFFER_USAGE) { error(GL_INVALID_ENUM); return r; }
  Id id = bufferSlot(target);
  if (!id) { error(GL_INVALID_OPERATION); return r; }
  GLint v = 0;
  glGetBufferParameteriv(target, pname, &v);
  r.ok = true; r.kind = 'i'; r.v.push_back(v);
  return r;
}
#ifndef GL_TEXTURE_IMMUTABLE_FORMAT
#define GL_TEXTURE_IMMUTABLE_FORMAT 0x912F
#define GL_TEXTURE_IMMUTABLE_LEVELS 0x82DF
#endif
WebGL1::Param WebGL1::getTexParameter(std::uint32_t target, std::uint32_t pname) {
  Param r;
  if (target != GL_TEXTURE_2D && target != GL_TEXTURE_CUBE_MAP && !(version_ == 2 && (target == GL_TEXTURE_3D || target == GL_TEXTURE_2D_ARRAY))) { error(GL_INVALID_ENUM); return r; }
  const bool v2 = version_ == 2;
  switch (pname) {
    case GL_TEXTURE_MIN_FILTER: case GL_TEXTURE_MAG_FILTER: case GL_TEXTURE_WRAP_S: case GL_TEXTURE_WRAP_T: break;
    case GL_TEXTURE_BASE_LEVEL: case GL_TEXTURE_COMPARE_FUNC: case GL_TEXTURE_COMPARE_MODE: case GL_TEXTURE_MAX_LEVEL: case GL_TEXTURE_MAX_LOD: case GL_TEXTURE_MIN_LOD: case GL_TEXTURE_WRAP_R:
    case GL_TEXTURE_IMMUTABLE_FORMAT: case GL_TEXTURE_IMMUTABLE_LEVELS: if (v2) break; [[fallthrough]];
    default: error(GL_INVALID_ENUM); return r;
  }
  const Id id = boundTex(target);
  if (!id) { error(GL_INVALID_OPERATION); return r; }
  r.ok = true;
  if (pname == GL_TEXTURE_IMMUTABLE_FORMAT) { r.kind = 'b'; r.v.push_back(textures_[id].immutable ? 1 : 0); return r; }   // GL 3.3 has no immutable storage: the wrapper keeps the flag
  if (pname == GL_TEXTURE_IMMUTABLE_LEVELS) { r.kind = 'i'; r.v.push_back(textures_[id].immutable ? textures_[id].levels : 0); return r; }
  if (pname == GL_TEXTURE_MIN_LOD || pname == GL_TEXTURE_MAX_LOD) { GLfloat f = 0; glGetTexParameterfv(target, pname, &f); r.kind = 'f'; r.v.push_back(f); return r; }
  GLint v = 0;
  glGetTexParameteriv(target, pname, &v);
  r.kind = 'i'; r.v.push_back(v);
  return r;
}
WebGL1::Param WebGL1::getUniform(Id pid, const UniformLoc& l) {
  Param r;
  auto p = programs_.find(pid);
  if (p == programs_.end() || !p->second.linked || !l.valid() || l.program != pid || stale(l)) { error(GL_INVALID_OPERATION); return r; }
  r.ok = true;
  int n = 1; char kind = 'f';   // n values; kind: f float, i int, b bool, u unsigned (scalars unwrapped, vectors and matrices arrays)
  switch (l.type) {
    case GL_INT: kind = 'i'; break;
    case GL_BOOL: kind = 'b'; break;
    case GL_UNSIGNED_INT: kind = 'u'; break;
    case GL_FLOAT_VEC2: n = 2; break;
    case GL_FLOAT_VEC3: n = 3; break;
    case GL_FLOAT_VEC4: case GL_FLOAT_MAT2: n = 4; break;
    case GL_INT_VEC2: n = 2; kind = 'i'; break;
    case GL_INT_VEC3: n = 3; kind = 'i'; break;
    case GL_INT_VEC4: n = 4; kind = 'i'; break;
    case GL_BOOL_VEC2: n = 2; kind = 'b'; break;
    case GL_BOOL_VEC3: n = 3; kind = 'b'; break;
    case GL_BOOL_VEC4: n = 4; kind = 'b'; break;
    case GL_UNSIGNED_INT_VEC2: n = 2; kind = 'u'; break;
    case GL_UNSIGNED_INT_VEC3: n = 3; kind = 'u'; break;
    case GL_UNSIGNED_INT_VEC4: n = 4; kind = 'u'; break;
    case GL_FLOAT_MAT3: n = 9; break;
    case GL_FLOAT_MAT4: n = 16; break;
    case GL_FLOAT_MAT2x3: case GL_FLOAT_MAT3x2: n = 6; break;
    case GL_FLOAT_MAT2x4: case GL_FLOAT_MAT4x2: n = 8; break;
    case GL_FLOAT_MAT3x4: case GL_FLOAT_MAT4x3: n = 12; break;
    default: if (isSamplerType(l.type)) kind = 'i';
  }
  GLfloat f[16] = {}; GLint iv[16] = {}; GLuint uv[16] = {};
  if (kind == 'f') glGetUniformfv(p->second.name, l.location, f);
  else if (kind == 'u') glGetUniformuiv(p->second.name, l.location, uv);
  else glGetUniformiv(p->second.name, l.location, iv);
  for (int i = 0; i < n; ++i) r.v.push_back(kind == 'f' ? f[i] : kind == 'u' ? static_cast<double>(uv[i]) : iv[i]);
  r.kind = n == 1 ? kind == 'u' ? 'i' : kind : kind == 'b' ? 'B' : kind == 'u' ? 'U' : 'a';
  return r;
}
void WebGL1::getShaderPrecisionFormat(std::uint32_t shadertype, std::uint32_t precisiontype, int out[3]) {
  out[0] = out[1] = out[2] = 0;
  if (shadertype != GL_VERTEX_SHADER && shadertype != GL_FRAGMENT_SHADER) return error(GL_INVALID_ENUM);
  switch (precisiontype) {
    case GL_LOW_FLOAT: case GL_MEDIUM_FLOAT: case GL_HIGH_FLOAT: out[0] = 127; out[1] = 127; out[2] = 23; return;
    case GL_LOW_INT: case GL_MEDIUM_INT: case GL_HIGH_INT: out[0] = 31; out[1] = 30; out[2] = 0; return;
  }
  error(GL_INVALID_ENUM);
}

// ---- uniforms and attributes
#define ZN_UNIFORM_OK(l, ...) \
  if (!(l).valid()) return; \
  if (!program_ || (l).program != program_ || stale(l)) return error(GL_INVALID_OPERATION); \
  { const std::uint32_t ok_[] = {__VA_ARGS__}; bool match_ = false; for (std::uint32_t t_ : ok_) match_ = match_ || t_ == (l).type; if (!match_) return error(GL_INVALID_OPERATION); }
void WebGL1::uniform3f(const UniformLoc& l, float x, float y, float z) { ZN_UNIFORM_OK(l, GL_FLOAT_VEC3) glUniform3f(l.location, x, y, z); }
void WebGL1::uniform2i(const UniformLoc& l, int x, int y) { ZN_UNIFORM_OK(l, GL_INT_VEC2, GL_BOOL_VEC2) glUniform2i(l.location, x, y); }
void WebGL1::uniform3i(const UniformLoc& l, int x, int y, int z) { ZN_UNIFORM_OK(l, GL_INT_VEC3, GL_BOOL_VEC3) glUniform3i(l.location, x, y, z); }
void WebGL1::uniform4i(const UniformLoc& l, int x, int y, int z, int w) { ZN_UNIFORM_OK(l, GL_INT_VEC4, GL_BOOL_VEC4) glUniform4i(l.location, x, y, z, w); }
void WebGL1::uniformNfv(const UniformLoc& l, int n, const float* v, std::size_t count) {
  if (n == 1) { ZN_UNIFORM_OK(l, GL_FLOAT, GL_BOOL) } else if (n == 2) { ZN_UNIFORM_OK(l, GL_FLOAT_VEC2, GL_BOOL_VEC2) } else if (n == 3) { ZN_UNIFORM_OK(l, GL_FLOAT_VEC3, GL_BOOL_VEC3) } else { ZN_UNIFORM_OK(l, GL_FLOAT_VEC4, GL_BOOL_VEC4) }
  if (count == 0 || count % n) return error(GL_INVALID_VALUE);
  const GLsizei k = static_cast<GLsizei>(std::min<std::size_t>(count / n, static_cast<std::size_t>(l.size)));   // more values than the array holds: the excess is ignored
  if (n == 1) glUniform1fv(l.location, k, v); else if (n == 2) glUniform2fv(l.location, k, v); else if (n == 3) glUniform3fv(l.location, k, v); else glUniform4fv(l.location, k, v);
}
void WebGL1::uniformNiv(const UniformLoc& l, int n, const int* v, std::size_t count) {
  if (n == 1) { if (isSamplerType(l.type)) { if (!l.valid()) return; if (!program_ || l.program != program_ || stale(l)) return error(GL_INVALID_OPERATION); } else { ZN_UNIFORM_OK(l, GL_INT, GL_BOOL) } }
  else if (n == 2) { ZN_UNIFORM_OK(l, GL_INT_VEC2, GL_BOOL_VEC2) } else if (n == 3) { ZN_UNIFORM_OK(l, GL_INT_VEC3, GL_BOOL_VEC3) } else { ZN_UNIFORM_OK(l, GL_INT_VEC4, GL_BOOL_VEC4) }
  if (count == 0 || count % n) return error(GL_INVALID_VALUE);
  if (isSamplerType(l.type)) for (std::size_t i = 0; i < count; ++i) if (v[i] < 0 || v[i] >= 32) return error(GL_INVALID_VALUE);
  const GLsizei k = static_cast<GLsizei>(std::min<std::size_t>(count / n, static_cast<std::size_t>(l.size)));
  if (n == 1) glUniform1iv(l.location, k, v); else if (n == 2) glUniform2iv(l.location, k, v); else if (n == 3) glUniform3iv(l.location, k, v); else glUniform4iv(l.location, k, v);
}
void WebGL1::uniformMatrixNfv(const UniformLoc& l, int n, bool transpose, const float* v, std::size_t count) {
  if (n == 2) { ZN_UNIFORM_OK(l, GL_FLOAT_MAT2) } else if (n == 3) { ZN_UNIFORM_OK(l, GL_FLOAT_MAT3) } else { ZN_UNIFORM_OK(l, GL_FLOAT_MAT4) }
  if (transpose) return error(GL_INVALID_VALUE);
  const std::size_t per = static_cast<std::size_t>(n) * n;
  if (count == 0 || count % per) return error(GL_INVALID_VALUE);
  const GLsizei k = static_cast<GLsizei>(std::min<std::size_t>(count / per, static_cast<std::size_t>(l.size)));
  if (n == 2) glUniformMatrix2fv(l.location, k, GL_FALSE, v); else if (n == 3) glUniformMatrix3fv(l.location, k, GL_FALSE, v); else glUniformMatrix4fv(l.location, k, GL_FALSE, v);
}
void WebGL1::vertexAttribNf(std::uint32_t i, int n, const float* v) {
  if (i >= kMaxVertexAttribs) return error(GL_INVALID_VALUE);
  genericType_[i] = GL_FLOAT;
  if (n == 1) glVertexAttrib1fv(i, v); else if (n == 2) glVertexAttrib2fv(i, v); else if (n == 3) glVertexAttrib3fv(i, v); else glVertexAttrib4fv(i, v);
}

// ---- textures
void WebGL1::texSubImage2D(std::uint32_t target, int level, int xoff, int yoff, int width, int height, std::uint32_t format, std::uint32_t type, const void* data, std::size_t dataBytes) {
  if (version_ == 2) {   // sized formats: the pair (format, type) is checked against the ES 3.0 table
    if (!data) return error(GL_INVALID_VALUE);
    uploadTexture(false, target, level, 0, width, height, 1, format, type, data, dataBytes, xoff, yoff, 0, true);
    return;
  }
  const bool face = target >= GL_TEXTURE_CUBE_MAP_POSITIVE_X && target <= GL_TEXTURE_CUBE_MAP_NEGATIVE_Z;
  if (target != GL_TEXTURE_2D && !face) return error(GL_INVALID_ENUM);
  const bool validFormat = format == GL_ALPHA || format == GL_RGB || format == GL_RGBA || format == GL_LUMINANCE || format == GL_LUMINANCE_ALPHA;
  const bool validType = type == GL_UNSIGNED_BYTE || type == GL_UNSIGNED_SHORT_5_6_5 || type == GL_UNSIGNED_SHORT_4_4_4_4 || type == GL_UNSIGNED_SHORT_5_5_5_1;
  if (!validFormat || !validType) return error(GL_INVALID_ENUM);
  if (level < 0 || xoff < 0 || yoff < 0 || width < 0 || height < 0) return error(GL_INVALID_VALUE);
  int bpp = 0;
  if (!formatType(format, type, bpp)) return error(GL_INVALID_OPERATION);
  Id id = (face ? texCube_ : tex2d_)[activeUnit_];
  if (!id) return error(GL_INVALID_OPERATION);
  if (!data) return error(GL_INVALID_VALUE);
  const Tex& t = textures_[id];
  if (level == 0 && (xoff + width > t.w || yoff + height > t.h)) return error(GL_INVALID_VALUE);
  if (t.format && t.format != format) return error(GL_INVALID_OPERATION);   // the format of the level must match
  std::size_t row = (static_cast<std::size_t>(width) * bpp + unpackAlignment_ - 1) / unpackAlignment_ * unpackAlignment_;
  std::size_t need = height ? row * (height - 1) + static_cast<std::size_t>(width) * bpp : 0;
  if (dataBytes < need) return error(GL_INVALID_OPERATION);
  GLenum gf = format;
  if (!gl_.info().es) { if (format == GL_ALPHA || format == GL_LUMINANCE) gf = GL_RED; else if (format == GL_LUMINANCE_ALPHA) gf = GL_RG; }
  glTexSubImage2D(target, level, xoff, yoff, width, height, gf, type, data);
}
void WebGL1::copyTexImage2D(std::uint32_t target, int level, std::uint32_t fmt, int x, int y, int w, int h, int border) {
  const bool face = target >= GL_TEXTURE_CUBE_MAP_POSITIVE_X && target <= GL_TEXTURE_CUBE_MAP_NEGATIVE_Z;
  if (target != GL_TEXTURE_2D && !face) return error(GL_INVALID_ENUM);
  if (fmt != GL_ALPHA && fmt != GL_RGB && fmt != GL_RGBA && fmt != GL_LUMINANCE && fmt != GL_LUMINANCE_ALPHA) return error(GL_INVALID_ENUM);
  if (level < 0 || w < 0 || h < 0 || w > maxTexSize_ || h > maxTexSize_ || border != 0) return error(GL_INVALID_VALUE);
  if (!(face ? texCube_ : tex2d_)[activeUnit_]) return error(GL_INVALID_OPERATION);
  if (!framebufferReady()) return error(GL_INVALID_FRAMEBUFFER_OPERATION);
  glCopyTexImage2D(target, level, fmt == GL_ALPHA || fmt == GL_LUMINANCE || fmt == GL_LUMINANCE_ALPHA ? GL_RGBA : fmt, x, y, w, h, 0);
  Tex& t = textures_[(face ? texCube_ : tex2d_)[activeUnit_]];
  if (level == 0) { t.w = w; t.h = h; t.format = fmt; }
}
void WebGL1::copyTexSubImage2D(std::uint32_t target, int level, int xoff, int yoff, int x, int y, int w, int h) {
  const bool face = target >= GL_TEXTURE_CUBE_MAP_POSITIVE_X && target <= GL_TEXTURE_CUBE_MAP_NEGATIVE_Z;
  if (target != GL_TEXTURE_2D && !face) return error(GL_INVALID_ENUM);
  if (level < 0 || xoff < 0 || yoff < 0 || w < 0 || h < 0) return error(GL_INVALID_VALUE);
  if (!(face ? texCube_ : tex2d_)[activeUnit_]) return error(GL_INVALID_OPERATION);
  if (!framebufferReady()) return error(GL_INVALID_FRAMEBUFFER_OPERATION);
  glCopyTexSubImage2D(target, level, xoff, yoff, x, y, w, h);
}
void WebGL1::generateMipmap(std::uint32_t target) {
  if (target != GL_TEXTURE_2D && target != GL_TEXTURE_CUBE_MAP && !(version_ == 2 && (target == GL_TEXTURE_3D || target == GL_TEXTURE_2D_ARRAY))) return error(GL_INVALID_ENUM);
  Id id = boundTex(target);
  if (!id) return error(GL_INVALID_OPERATION);
  const Tex& t = textures_[id];
  if (target == GL_TEXTURE_2D && (t.w == 0 || t.h == 0)) return error(GL_INVALID_OPERATION);   // level 0 must be defined
  glGenerateMipmap(target);
}


// ---- WebGL 2 queries (ZN-203.09)
WebGL1::Param WebGL1::getFramebufferAttachmentParameter(std::uint32_t target, std::uint32_t attachment, std::uint32_t pname) {
  Param r;
  if (target != GL_FRAMEBUFFER && !(version_ == 2 && (target == GL_READ_FRAMEBUFFER || target == GL_DRAW_FRAMEBUFFER))) { error(GL_INVALID_ENUM); return r; }
  const Id bound = target == GL_READ_FRAMEBUFFER ? fboRead_ : fbo_;
  if (!bound) {   // the canvas: BACK, DEPTH, STENCIL (WebGL 2); attachment points of a user framebuffer are errors
    if (version_ != 2 || (attachment != GL_BACK && attachment != GL_DEPTH && attachment != GL_STENCIL)) { error(GL_INVALID_ENUM); return r; }
    if ((attachment == GL_DEPTH && !depthAttr_) || (attachment == GL_STENCIL && !stencilAttr_)) { if (pname == GL_FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE) { r.ok = true; r.kind = 'i'; r.v.push_back(GL_NONE); return r; } error(GL_INVALID_OPERATION); return r; }
    r.ok = true; r.kind = 'i';
    switch (pname) {
      case GL_FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE: r.v.push_back(GL_FRAMEBUFFER_DEFAULT); return r;
      case GL_FRAMEBUFFER_ATTACHMENT_RED_SIZE: case GL_FRAMEBUFFER_ATTACHMENT_GREEN_SIZE: case GL_FRAMEBUFFER_ATTACHMENT_BLUE_SIZE: r.v.push_back(attachment == GL_BACK ? 8 : 0); return r;
      case GL_FRAMEBUFFER_ATTACHMENT_ALPHA_SIZE: r.v.push_back(attachment == GL_BACK ? 8 : 0); return r;
      case GL_FRAMEBUFFER_ATTACHMENT_DEPTH_SIZE: r.v.push_back(attachment == GL_DEPTH ? 24 : 0); return r;
      case GL_FRAMEBUFFER_ATTACHMENT_STENCIL_SIZE: r.v.push_back(attachment == GL_STENCIL ? 8 : 0); return r;
      case GL_FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE: r.v.push_back(GL_UNSIGNED_NORMALIZED); return r;
      case GL_FRAMEBUFFER_ATTACHMENT_COLOR_ENCODING: r.v.push_back(GL_LINEAR); return r;
    }
    r.ok = false; error(GL_INVALID_ENUM);
    return r;
  }
  if (attachment != GL_DEPTH_ATTACHMENT && attachment != GL_STENCIL_ATTACHMENT && attachment != GL_DEPTH_STENCIL_ATTACHMENT && !(attachment >= GL_COLOR_ATTACHMENT0 && attachment < GL_COLOR_ATTACHMENT0 + (version_ == 2 ? 4u : 1u))) { error(GL_INVALID_ENUM); return r; }
  if (attachment == GL_DEPTH_STENCIL_ATTACHMENT) {   // answered when depth and stencil hold the same image, or both nothing
    GLint t[2] = {}, n[2] = {};
    const GLenum pts[2] = {GL_DEPTH_ATTACHMENT, GL_STENCIL_ATTACHMENT};
    for (int i = 0; i < 2; ++i) {
      glGetFramebufferAttachmentParameteriv(target, pts[i], GL_FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE, &t[i]);
      if (t[i] != GL_NONE) glGetFramebufferAttachmentParameteriv(target, pts[i], GL_FRAMEBUFFER_ATTACHMENT_OBJECT_NAME, &n[i]);
    }
    while (glGetError() != GL_NO_ERROR) {}
    if (t[0] != t[1] || n[0] != n[1]) { error(GL_INVALID_OPERATION); return r; }
  }
  GLint type = 0;
  glGetFramebufferAttachmentParameteriv(target == GL_FRAMEBUFFER ? GL_FRAMEBUFFER : target, attachment == GL_DEPTH_STENCIL_ATTACHMENT ? GL_DEPTH_ATTACHMENT : attachment, GL_FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE, &type);
  while (glGetError() != GL_NO_ERROR) {}
  if (pname == GL_FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE) { r.ok = true; r.kind = 'i'; r.v.push_back(type); return r; }
  if (type == GL_NONE) {
    if (version_ != 2) { error(GL_INVALID_ENUM); return r; }
    if (pname == GL_FRAMEBUFFER_ATTACHMENT_OBJECT_NAME) { r.ok = true; r.kind = 'n'; return r; }
    error(GL_INVALID_OPERATION);
    return r;
  }
  GLint v = 0;
  const GLenum att = attachment == GL_DEPTH_STENCIL_ATTACHMENT ? GL_DEPTH_ATTACHMENT : attachment;
  if (pname == GL_FRAMEBUFFER_ATTACHMENT_OBJECT_NAME) {
    glGetFramebufferAttachmentParameteriv(target, att, GL_FRAMEBUFFER_ATTACHMENT_OBJECT_NAME, &v);
    r.ok = true; r.kind = 'n';
    if (type == GL_TEXTURE) {
      for (auto& t : textures_) if (t.second.name == static_cast<std::uint32_t>(v)) { r.kind = 'o'; r.object = t.first; r.objKind = 4; }
      auto z = zombieTex_.find(static_cast<std::uint32_t>(v));   // deleted, but another framebuffer still holds it
      if (z != zombieTex_.end()) { r.kind = 'o'; r.object = z->second; r.objKind = 4; }
    }
    else for (auto& b : rbos_) if (b.second.name == static_cast<std::uint32_t>(v)) { r.kind = 'o'; r.object = b.first; r.objKind = 7; }
    return r;
  }
  switch (pname) {
    case GL_FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL: case GL_FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE: if (type != GL_TEXTURE) { error(GL_INVALID_ENUM); return r; } break;
    case GL_FRAMEBUFFER_ATTACHMENT_TEXTURE_LAYER: if (version_ != 2 || type != GL_TEXTURE) { error(GL_INVALID_ENUM); return r; } break;
    case GL_FRAMEBUFFER_ATTACHMENT_RED_SIZE: case GL_FRAMEBUFFER_ATTACHMENT_GREEN_SIZE: case GL_FRAMEBUFFER_ATTACHMENT_BLUE_SIZE: case GL_FRAMEBUFFER_ATTACHMENT_ALPHA_SIZE: case GL_FRAMEBUFFER_ATTACHMENT_DEPTH_SIZE: case GL_FRAMEBUFFER_ATTACHMENT_STENCIL_SIZE: case GL_FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE: case GL_FRAMEBUFFER_ATTACHMENT_COLOR_ENCODING:
      if (version_ != 2) { error(GL_INVALID_ENUM); return r; }
      if (attachment == GL_DEPTH_STENCIL_ATTACHMENT && pname == GL_FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE) { error(GL_INVALID_OPERATION); return r; }   // depth and stencil differ
      break;
    default: error(GL_INVALID_ENUM); return r;
  }
  glGetFramebufferAttachmentParameteriv(target, att, pname, &v);
  r.ok = true; r.kind = 'i'; r.v.push_back(v);
  return r;
}
WebGL1::Param WebGL1::getIndexedParameter(std::uint32_t target, std::uint32_t index) {
  Param r;
  if (version_ != 2 || (target != GL_UNIFORM_BUFFER_BINDING && target != GL_UNIFORM_BUFFER_START && target != GL_UNIFORM_BUFFER_SIZE && target != GL_TRANSFORM_FEEDBACK_BUFFER_BINDING && target != GL_TRANSFORM_FEEDBACK_BUFFER_START && target != GL_TRANSFORM_FEEDBACK_BUFFER_SIZE)) { error(GL_INVALID_ENUM); return r; }
  if (index >= 24) { error(GL_INVALID_VALUE); return r; }
  const bool uniform = target == GL_UNIFORM_BUFFER_BINDING || target == GL_UNIFORM_BUFFER_START || target == GL_UNIFORM_BUFFER_SIZE;
  auto it = indexed_.find(idxKey(uniform ? GL_UNIFORM_BUFFER : GL_TRANSFORM_FEEDBACK_BUFFER, index));
  Indexed b = it == indexed_.end() ? Indexed{} : it->second;
  r.ok = true;
  if (target == GL_UNIFORM_BUFFER_BINDING || target == GL_TRANSFORM_FEEDBACK_BUFFER_BINDING) { r.kind = b.buffer ? 'o' : 'n'; r.object = b.buffer; r.objKind = 1; }
  else { r.kind = 'i'; r.v.push_back(static_cast<double>(target == GL_UNIFORM_BUFFER_START || target == GL_TRANSFORM_FEEDBACK_BUFFER_START ? b.offset : b.size)); }
  return r;
}
std::vector<std::uint32_t> WebGL1::getUniformIndices(Id pid, const std::vector<std::string>& names) {
  std::vector<std::uint32_t> out;
  auto p = programs_.find(pid);
  if (p == programs_.end() || !p->second.linked) { error(GL_INVALID_OPERATION); return out; }
  std::vector<const char*> v;
  for (const std::string& n : names) v.push_back(n.c_str());
  out.resize(names.size());
  if (!names.empty()) glGetUniformIndices(p->second.name, static_cast<GLsizei>(names.size()), v.data(), out.data());
  return out;
}
WebGL1::Param WebGL1::getActiveUniforms(Id pid, const std::vector<std::uint32_t>& indices, std::uint32_t pname, bool& ok) {
  Param r;
  ok = false;
  auto p = programs_.find(pid);
  if (p == programs_.end() || !p->second.linked) { error(GL_INVALID_OPERATION); return r; }
  switch (pname) { case GL_UNIFORM_TYPE: case GL_UNIFORM_SIZE: case GL_UNIFORM_BLOCK_INDEX: case GL_UNIFORM_OFFSET: case GL_UNIFORM_ARRAY_STRIDE: case GL_UNIFORM_MATRIX_STRIDE: case GL_UNIFORM_IS_ROW_MAJOR: break; default: error(GL_INVALID_ENUM); return r; }
  GLint n = 0;
  glGetProgramiv(p->second.name, GL_ACTIVE_UNIFORMS, &n);
  for (std::uint32_t i : indices) if (i >= static_cast<std::uint32_t>(n)) { error(GL_INVALID_VALUE); return r; }
  std::vector<GLint> v(indices.size());
  if (!indices.empty()) glGetActiveUniformsiv(p->second.name, static_cast<GLsizei>(indices.size()), indices.data(), pname, v.data());
  r.ok = true; r.kind = pname == GL_UNIFORM_IS_ROW_MAJOR ? 'B' : 'a';
  for (GLint x : v) r.v.push_back(pname == GL_UNIFORM_IS_ROW_MAJOR ? (x != 0) : x);
  ok = true;
  return r;
}
void WebGL1::uniformMatrixRC(const UniformLoc& l, int cols, int rows, bool transpose, const float* v, std::size_t count) {
  if (version_ != 2) return error(GL_INVALID_OPERATION);
  if (!l.valid()) return;
  if (!program_ || l.program != program_ || stale(l)) return error(GL_INVALID_OPERATION);
  static const std::uint32_t types[3][3] = {{GL_FLOAT_MAT2, GL_FLOAT_MAT2x3, GL_FLOAT_MAT2x4}, {GL_FLOAT_MAT3x2, GL_FLOAT_MAT3, GL_FLOAT_MAT3x4}, {GL_FLOAT_MAT4x2, GL_FLOAT_MAT4x3, GL_FLOAT_MAT4}};
  if (l.type != types[cols - 2][rows - 2]) return error(GL_INVALID_OPERATION);
  const std::size_t per = static_cast<std::size_t>(cols) * rows;
  if (count == 0 || count % per) return error(GL_INVALID_VALUE);
  const GLsizei k = static_cast<GLsizei>(std::min<std::size_t>(count / per, static_cast<std::size_t>(l.size)));
  const GLboolean t = transpose ? GL_TRUE : GL_FALSE;
  switch (cols * 10 + rows) {
    case 22: glUniformMatrix2fv(l.location, k, t, v); break;
    case 23: glUniformMatrix2x3fv(l.location, k, t, v); break;
    case 24: glUniformMatrix2x4fv(l.location, k, t, v); break;
    case 32: glUniformMatrix3x2fv(l.location, k, t, v); break;
    case 33: glUniformMatrix3fv(l.location, k, t, v); break;
    case 34: glUniformMatrix3x4fv(l.location, k, t, v); break;
    case 42: glUniformMatrix4x2fv(l.location, k, t, v); break;
    case 43: glUniformMatrix4x3fv(l.location, k, t, v); break;
    default: glUniformMatrix4fv(l.location, k, t, v);
  }
}
void WebGL1::vertexAttribINi(std::uint32_t i, const int* v) { if (version_ != 2) return error(GL_INVALID_OPERATION); if (i >= kMaxVertexAttribs) return error(GL_INVALID_VALUE); genericType_[i] = GL_INT; glVertexAttribI4iv(i, v); }
void WebGL1::vertexAttribINui(std::uint32_t i, const std::uint32_t* v) { if (version_ != 2) return error(GL_INVALID_OPERATION); if (i >= kMaxVertexAttribs) return error(GL_INVALID_VALUE); genericType_[i] = GL_UNSIGNED_INT; glVertexAttribI4uiv(i, v); }

}  // namespace zn::gl
