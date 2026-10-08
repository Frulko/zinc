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
  if (target != GL_GENERATE_MIPMAP_HINT) return error(GL_INVALID_ENUM);   // FRAGMENT_SHADER_DERIVATIVE_HINT needs OES_standard_derivatives
  if (mode != GL_DONT_CARE && mode != GL_FASTEST && mode != GL_NICEST) return error(GL_INVALID_ENUM);
  mipmapHint_ = mode;
  glHint(target, mode);
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
Id WebGL1::createRenderbuffer() { Rbo r; glGenRenderbuffers(1, &r.name); Id id = nextId_++; rbos_[id] = r; return id; }
void WebGL1::deleteRenderbuffer(Id id) {
  auto it = rbos_.find(id);
  if (it == rbos_.end()) return;
  glDeleteRenderbuffers(1, &it->second.name);
  if (rbo_ == id) rbo_ = 0;
  rbos_.erase(it);
}
void WebGL1::bindRenderbuffer(std::uint32_t target, Id id) {
  if (target != GL_RENDERBUFFER) return error(GL_INVALID_ENUM);
  std::uint32_t name = 0;
  if (id) {
    auto it = rbos_.find(id);
    if (it == rbos_.end()) return error(GL_INVALID_OPERATION);
    name = it->second.name;
    it->second.bound = true;
  }
  rbo_ = id;
  glBindRenderbuffer(GL_RENDERBUFFER, name);
}
void WebGL1::renderbufferStorage(std::uint32_t target, std::uint32_t fmt, int w, int h) {
  if (target != GL_RENDERBUFFER) return error(GL_INVALID_ENUM);
  switch (fmt) { case GL_RGBA4: case GL_RGB565: case GL_RGB5_A1: case GL_DEPTH_COMPONENT16: case GL_STENCIL_INDEX8: case GL_DEPTH_STENCIL: break; default: return error(GL_INVALID_ENUM); }
  if (w < 0 || h < 0 || w > maxTexSize_ || h > maxTexSize_) return error(GL_INVALID_VALUE);
  if (!rbo_) return error(GL_INVALID_OPERATION);
  Rbo& r = rbos_[rbo_];
  r.w = w; r.h = h; r.format = fmt;
  glRenderbufferStorage(GL_RENDERBUFFER, fmt == GL_DEPTH_STENCIL ? GL_DEPTH24_STENCIL8 : fmt, w, h);
}
void WebGL1::framebufferRenderbuffer(std::uint32_t target, std::uint32_t attachment, std::uint32_t rbtarget, Id rb) {
  if (target != GL_FRAMEBUFFER || rbtarget != GL_RENDERBUFFER) return error(GL_INVALID_ENUM);
  if (attachment != GL_COLOR_ATTACHMENT0 && attachment != GL_DEPTH_ATTACHMENT && attachment != GL_STENCIL_ATTACHMENT && attachment != GL_DEPTH_STENCIL_ATTACHMENT) return error(GL_INVALID_ENUM);
  if (!fbo_) return error(GL_INVALID_OPERATION);
  std::uint32_t name = 0;
  if (rb) {
    auto it = rbos_.find(rb);
    if (it == rbos_.end()) return error(GL_INVALID_OPERATION);
    name = it->second.name;
  }
  glFramebufferRenderbuffer(GL_FRAMEBUFFER, attachment, GL_RENDERBUFFER, name);
}
void WebGL1::deleteFramebuffer(Id id) {
  auto it = fbos_.find(id);
  if (it == fbos_.end()) return;
  glDeleteFramebuffers(1, &it->second.name);
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
  for (Id sid : {it->second.vs, it->second.fs}) if (sid) { auto sh = shaders_.find(sid); if (sh != shaders_.end() && --sh->second.attached <= 0 && sh->second.deleted) shaders_.erase(sh); }
  programs_.erase(it);
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
  if (p == programs_.end()) { error(GL_INVALID_OPERATION); return a; }
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
  if (p == programs_.end()) { error(GL_INVALID_OPERATION); return a; }
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
    case GL_STENCIL_REF: case GL_STENCIL_BACK_REF: case GL_STENCIL_CLEAR_VALUE: case GL_STENCIL_VALUE_MASK: case GL_STENCIL_BACK_VALUE_MASK: case GL_STENCIL_WRITEMASK: case GL_STENCIL_BACK_WRITEMASK:
    case GL_GENERATE_MIPMAP_HINT: fixed(mipmapHint_); break;
    case GL_PACK_ALIGNMENT: case GL_UNPACK_ALIGNMENT: case GL_SUBPIXEL_BITS: case GL_SAMPLE_BUFFERS: case GL_SAMPLES: ints(1); break;
    case GL_RED_BITS: case GL_GREEN_BITS: case GL_BLUE_BITS: case GL_ALPHA_BITS: case GL_DEPTH_BITS: case GL_STENCIL_BITS: {
      GLint v = 0;
      glGetFramebufferAttachmentParameteriv(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_FRAMEBUFFER_ATTACHMENT_RED_SIZE, &v);   // clears any error a default framebuffer query leaves
      while (glGetError() != GL_NO_ERROR) {}
      fixed(pname == GL_DEPTH_BITS ? 24 : pname == GL_STENCIL_BITS ? 8 : 8);
      break;
    }
    case GL_MAX_TEXTURE_SIZE: fixed(maxTexSize_); break;
    case GL_MAX_CUBE_MAP_TEXTURE_SIZE: case GL_MAX_RENDERBUFFER_SIZE: ints(1); break;
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
    case GL_FRAMEBUFFER_BINDING: object(fbo_, 5); break;
    case GL_RENDERBUFFER_BINDING: object(rbo_, 7); break;
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
    case GL_CURRENT_VERTEX_ATTRIB: { r.kind = 'a'; GLfloat v[4] = {}; glGetVertexAttribfv(index, pname, v); for (float x : v) r.v.push_back(x); break; }
    default: r.ok = false; error(GL_INVALID_ENUM);
  }
  return r;
}
WebGL1::Param WebGL1::getBufferParameter(std::uint32_t target, std::uint32_t pname) {
  Param r;
  if (target != GL_ARRAY_BUFFER && target != GL_ELEMENT_ARRAY_BUFFER) { error(GL_INVALID_ENUM); return r; }
  if (pname != GL_BUFFER_SIZE && pname != GL_BUFFER_USAGE) { error(GL_INVALID_ENUM); return r; }
  Id id = target == GL_ARRAY_BUFFER ? arrayBuffer_ : elementBuffer_;
  if (!id) { error(GL_INVALID_OPERATION); return r; }
  GLint v = 0;
  glGetBufferParameteriv(target, pname, &v);
  r.ok = true; r.kind = 'i'; r.v.push_back(v);
  return r;
}
WebGL1::Param WebGL1::getTexParameter(std::uint32_t target, std::uint32_t pname) {
  Param r;
  if (target != GL_TEXTURE_2D && target != GL_TEXTURE_CUBE_MAP) { error(GL_INVALID_ENUM); return r; }
  if (pname != GL_TEXTURE_MIN_FILTER && pname != GL_TEXTURE_MAG_FILTER && pname != GL_TEXTURE_WRAP_S && pname != GL_TEXTURE_WRAP_T) { error(GL_INVALID_ENUM); return r; }
  if (!(target == GL_TEXTURE_2D ? tex2d_ : texCube_)[activeUnit_]) { error(GL_INVALID_OPERATION); return r; }
  GLint v = 0;
  glGetTexParameteriv(target, pname, &v);
  r.ok = true; r.kind = 'i'; r.v.push_back(v);
  return r;
}
WebGL1::Param WebGL1::getUniform(Id pid, const UniformLoc& l) {
  Param r;
  auto p = programs_.find(pid);
  if (p == programs_.end() || !p->second.linked || !l.valid() || l.program != pid) { error(GL_INVALID_OPERATION); return r; }
  r.ok = true;
  const bool isInt = l.type == GL_INT || l.type == GL_BOOL || l.type == GL_SAMPLER_2D || l.type == GL_SAMPLER_CUBE;
  int n = l.type == GL_FLOAT_VEC2 || l.type == GL_INT_VEC2 || l.type == GL_BOOL_VEC2 ? 2 : l.type == GL_FLOAT_VEC3 || l.type == GL_INT_VEC3 || l.type == GL_BOOL_VEC3 ? 3 : l.type == GL_FLOAT_VEC4 || l.type == GL_INT_VEC4 || l.type == GL_BOOL_VEC4 || l.type == GL_FLOAT_MAT2 ? 4 : l.type == GL_FLOAT_MAT3 ? 9 : l.type == GL_FLOAT_MAT4 ? 16 : 1;
  GLfloat f[16] = {};
  if (isInt || l.type == GL_INT_VEC2 || l.type == GL_INT_VEC3 || l.type == GL_INT_VEC4 || l.type == GL_BOOL_VEC2 || l.type == GL_BOOL_VEC3 || l.type == GL_BOOL_VEC4) { GLint iv[16] = {}; glGetUniformiv(p->second.name, l.location, iv); for (int i = 0; i < n; ++i) f[i] = static_cast<float>(iv[i]); }
  else glGetUniformfv(p->second.name, l.location, f);
  r.kind = n == 1 ? (l.type == GL_BOOL ? 'b' : isInt ? 'i' : 'f') : 'a';
  for (int i = 0; i < n; ++i) r.v.push_back(f[i]);
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
  if (!program_ || (l).program != program_) return error(GL_INVALID_OPERATION); \
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
  if (n == 1) { ZN_UNIFORM_OK(l, GL_INT, GL_BOOL, GL_SAMPLER_2D, GL_SAMPLER_CUBE) }
  else if (n == 2) { ZN_UNIFORM_OK(l, GL_INT_VEC2, GL_BOOL_VEC2) } else if (n == 3) { ZN_UNIFORM_OK(l, GL_INT_VEC3, GL_BOOL_VEC3) } else { ZN_UNIFORM_OK(l, GL_INT_VEC4, GL_BOOL_VEC4) }
  if (count == 0 || count % n) return error(GL_INVALID_VALUE);
  if (l.type == GL_SAMPLER_2D || l.type == GL_SAMPLER_CUBE) for (std::size_t i = 0; i < count; ++i) if (v[i] < 0 || v[i] >= 32) return error(GL_INVALID_VALUE);
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
  if (checkFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE) return error(GL_INVALID_FRAMEBUFFER_OPERATION);
  glCopyTexImage2D(target, level, fmt == GL_ALPHA || fmt == GL_LUMINANCE || fmt == GL_LUMINANCE_ALPHA ? GL_RGBA : fmt, x, y, w, h, 0);
  Tex& t = textures_[(face ? texCube_ : tex2d_)[activeUnit_]];
  if (level == 0) { t.w = w; t.h = h; t.format = fmt; }
}
void WebGL1::copyTexSubImage2D(std::uint32_t target, int level, int xoff, int yoff, int x, int y, int w, int h) {
  const bool face = target >= GL_TEXTURE_CUBE_MAP_POSITIVE_X && target <= GL_TEXTURE_CUBE_MAP_NEGATIVE_Z;
  if (target != GL_TEXTURE_2D && !face) return error(GL_INVALID_ENUM);
  if (level < 0 || xoff < 0 || yoff < 0 || w < 0 || h < 0) return error(GL_INVALID_VALUE);
  if (!(face ? texCube_ : tex2d_)[activeUnit_]) return error(GL_INVALID_OPERATION);
  if (checkFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE) return error(GL_INVALID_FRAMEBUFFER_OPERATION);
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

}  // namespace zn::gl
