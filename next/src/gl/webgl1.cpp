#include "gl/webgl1.h"

#include <algorithm>
#include <cctype>
#include <cstring>

#include "glad/gl.h"

namespace zn::gl {
namespace {

constexpr int kMaxAttribs = 16;
constexpr int kMaxUnits = 32;   // the units reported by MAX_COMBINED_TEXTURE_IMAGE_UNITS (three.js binds TEXTURE0 + that - 1)

int typeSize(std::uint32_t t) {
  switch (t) {
    case GL_BYTE: case GL_UNSIGNED_BYTE: return 1;
    case GL_SHORT: case GL_UNSIGNED_SHORT: return 2;
    case GL_FLOAT: return 4;
  }
  return 0;
}

// The GLSL ES 1.00 source of WebGL on a desktop core context: the prelude renames the old keywords. ES contexts take the source as it is.
std::string translate(const std::string& src, std::uint32_t type, bool es) {
  if (es) return src;
  {   // GLSL ES 3.00 is close enough to GLSL 330 core to run as it is with the version line replaced
    std::size_t at = src.find("#version");
    const bool es3 = at != std::string::npos && src.compare(at, 15, "#version 300 es") == 0;
    if (es3) {
      std::string body = src.substr(at + 15 + (at + 15 < src.size() && src[at + 15] == '\n' ? 1 : 0));
      // three.js and others `#define gl_FragColor pc_fragColor`: a macro named after a compatibility built-in is refused by some drivers, and ES 3.00 has no such built-in, so the name is free to rename
      for (const char* name : {"gl_FragColor", "gl_FragData"}) {
        const std::string from = name, to = std::string("zn_") + (name + 3);
        for (std::size_t p = body.find(from); p != std::string::npos; p = body.find(from, p + to.size())) {
          const bool left = p > 0 && (std::isalnum(static_cast<unsigned char>(body[p - 1])) || body[p - 1] == '_');
          const std::size_t e = p + from.size();
          const bool right = e < body.size() && (std::isalnum(static_cast<unsigned char>(body[e])) || body[e] == '_');
          if (!left && !right) body.replace(p, from.size(), to);
        }
      }
      return "#version 330 core\n" + body;
    }
  }
  std::string body;
  std::string pre = "#version 330 core\n";
  std::size_t pos = 0;
  while (pos < src.size()) {   // drop #version 100 and the ES-only #extension lines (their features are core here)
    std::size_t nl = src.find('\n', pos);
    std::string line = src.substr(pos, nl == std::string::npos ? std::string::npos : nl - pos);
    std::size_t k = line.find_first_not_of(" \t");
    bool directive = k != std::string::npos && line[k] == '#';
    if (directive && (line.find("version", k) == k + 1)) body += "\n";
    else if (directive && line.find("extension", k) == k + 1 && (line.find("OES_standard_derivatives") != std::string::npos || line.find("EXT_frag_depth") != std::string::npos || line.find("EXT_shader_texture_lod") != std::string::npos || line.find("EXT_draw_buffers") != std::string::npos)) body += "\n";
    else body += line + "\n";
    if (nl == std::string::npos) break;
    pos = nl + 1;
  }
  pre += "#define texture2D texture\n#define textureCube texture\n#define texture2DLodEXT textureLod\n#define texture2DProj textureProj\n";
  if (type == GL_VERTEX_SHADER) pre += "#define attribute in\n#define varying out\n";
  else if (body.find("gl_FragData") != std::string::npos) pre += "#define varying in\nout vec4 zn_FragData[1];\n#define gl_FragData zn_FragData\n";   // gl_FragData[0] without the draw-buffers extension
  else pre += "#define varying in\nout vec4 zn_FragColor;\n#define gl_FragColor zn_FragColor\n";
  return pre + body;
}


// true when every float-typed declaration has a precision (default or qualifier)
bool fragmentPrecisionOk(const std::string& src) {
  std::string t;   // comments out
  for (std::size_t i = 0; i < src.size(); ++i) {
    if (src.compare(i, 2, "//") == 0) { while (i < src.size() && src[i] != '\n') ++i; t += '\n'; }
    else if (src.compare(i, 2, "/*") == 0) { std::size_t e = src.find("*/", i + 2); i = e == std::string::npos ? src.size() : e + 1; t += ' '; }
    else t += src[i];
  }
  auto isId = [](char c) { return std::isalnum(static_cast<unsigned char>(c)) || c == '_'; };
  std::string prev;
  bool defaultFloat = false;
  for (std::size_t i = 0; i < t.size();) {
    if (!isId(t[i]) || std::isdigit(static_cast<unsigned char>(t[i]))) { ++i; continue; }
    std::size_t j = i;
    while (j < t.size() && isId(t[j])) ++j;
    std::string id = t.substr(i, j - i);
    if (id == "precision") {   // precision <q> <type>;
      std::size_t e = t.find(';', j);
      std::string rest = t.substr(j, e == std::string::npos ? std::string::npos : e - j);
      if (rest.find("float") != std::string::npos) defaultFloat = true;
      i = e == std::string::npos ? t.size() : e;
      prev.clear();
      continue;
    }
    const bool floatType = id == "float" || id == "vec2" || id == "vec3" || id == "vec4" || id == "mat2" || id == "mat3" || id == "mat4";
    if (floatType && !defaultFloat) {
      std::size_t k = j;
      while (k < t.size() && std::isspace(static_cast<unsigned char>(t[k]))) ++k;
      const bool ctor = k < t.size() && t[k] == '(';
      if (!ctor && prev != "lowp" && prev != "mediump" && prev != "highp") return false;
    }
    prev = id;
    i = j;
  }
  return true;
}

// WebGL format/type table (spec 5.14.8): which (format, type) pairs texImage2D accepts, and the bytes per pixel.
}  // namespace
bool formatType(std::uint32_t format, std::uint32_t type, int& bpp) {   // shared with webgl1_more.cpp
  int ch = format == GL_ALPHA || format == GL_LUMINANCE ? 1 : format == GL_LUMINANCE_ALPHA ? 2 : format == GL_RGB ? 3 : format == GL_RGBA ? 4 : 0;
  if (!ch) return false;
  if (type == GL_UNSIGNED_BYTE) { bpp = ch; return true; }
  if (type == GL_UNSIGNED_SHORT_5_6_5 && format == GL_RGB) { bpp = 2; return true; }
  if ((type == GL_UNSIGNED_SHORT_4_4_4_4 || type == GL_UNSIGNED_SHORT_5_5_5_1) && format == GL_RGBA) { bpp = 2; return true; }
  return false;
}
namespace {

}  // namespace

unsigned WebGL1::bit(std::uint32_t code) { return 1u << (code - GL_INVALID_ENUM); }

bool WebGL1::create(Api api, int width, int height, std::string& err, int version) {
  version_ = version;
  if (version == 2 && api == Api::Gles2) { err = "WebGL 2 needs GL 3.3 core or GLES 3"; return false; }
  if (!gl_.create(api, width, height, false, err)) return false;
  GLint m = 0;
  glGetIntegerv(GL_MAX_TEXTURE_SIZE, &m);
  maxTexSize_ = m;
  if (!gl_.info().es) { glGenVertexArrays(1, &vao_); glBindVertexArray(vao_); glEnable(GL_PROGRAM_POINT_SIZE); }   // core profiles need the switch for gl_PointSize, WebGL always honours it   // core contexts have no default VAO; the WebGL1 attribute state lives in this one
  while (glGetError() != GL_NO_ERROR) {}
  return true;
}

// canvas.width / canvas.height was set: a new drawing buffer, transparent black, depth 1, stencil 0, whatever state the context is in
void WebGL1::resizeDrawingBuffer(int w, int h) {
  GLint draw = 0, read = 0;
  glGetIntegerv(GL_DRAW_FRAMEBUFFER_BINDING, &draw);
  glGetIntegerv(GL_READ_FRAMEBUFFER_BINDING, &read);
  gl_.resize(w, h);
  GLboolean cm[4], dm;
  GLint sm, cs;
  GLfloat cc[4], cd;
  const GLboolean sc = glIsEnabled(GL_SCISSOR_TEST);
  glGetBooleanv(GL_COLOR_WRITEMASK, cm); glGetBooleanv(GL_DEPTH_WRITEMASK, &dm); glGetIntegerv(GL_STENCIL_WRITEMASK, &sm);
  glGetFloatv(GL_COLOR_CLEAR_VALUE, cc); glGetFloatv(GL_DEPTH_CLEAR_VALUE, &cd); glGetIntegerv(GL_STENCIL_CLEAR_VALUE, &cs);
  glBindFramebuffer(GL_FRAMEBUFFER, gl_.framebuffer());
  glDisable(GL_SCISSOR_TEST);
  glColorMask(GL_TRUE, GL_TRUE, GL_TRUE, GL_TRUE); glDepthMask(GL_TRUE); glStencilMask(~0u);
  glClearColor(0, 0, 0, 0); glClearDepth(1); glClearStencil(0);
  glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT | GL_STENCIL_BUFFER_BIT);
  glColorMask(cm[0], cm[1], cm[2], cm[3]); glDepthMask(dm); glStencilMask(static_cast<GLuint>(sm));
  glClearColor(cc[0], cc[1], cc[2], cc[3]); glClearDepth(cd); glClearStencil(cs);
  if (sc) glEnable(GL_SCISSOR_TEST);
  glBindFramebuffer(GL_DRAW_FRAMEBUFFER, static_cast<GLuint>(draw));
  glBindFramebuffer(GL_READ_FRAMEBUFFER, static_cast<GLuint>(read));
}

std::uint32_t WebGL1::getError() {
  while (true) {   // errors of the driver that validation missed are kept visible rather than lost
    GLenum e = glGetError();
    if (e == GL_NO_ERROR) break;
    if (e >= GL_INVALID_ENUM && e <= GL_INVALID_FRAMEBUFFER_OPERATION && e != 0x0503 && e != 0x0504) error(e);
  }
  for (std::uint32_t code = GL_INVALID_ENUM; code <= GL_INVALID_FRAMEBUFFER_OPERATION; ++code)
    if (flags_ & bit(code)) { flags_ &= ~bit(code); return code; }
  return GL_NO_ERROR;
}

// ---- state
void WebGL1::enable(std::uint32_t cap) {
  if (version_ == 2 && cap == GL_RASTERIZER_DISCARD) { glEnable(cap); return; }
  switch (cap) { case GL_BLEND: case GL_CULL_FACE: case GL_DEPTH_TEST: case GL_DITHER: case GL_POLYGON_OFFSET_FILL: case GL_SAMPLE_ALPHA_TO_COVERAGE: case GL_SAMPLE_COVERAGE: case GL_SCISSOR_TEST: case GL_STENCIL_TEST: glEnable(cap); return; }
  error(GL_INVALID_ENUM);
}
void WebGL1::disable(std::uint32_t cap) {
  if (version_ == 2 && cap == GL_RASTERIZER_DISCARD) { glDisable(cap); return; }
  switch (cap) { case GL_BLEND: case GL_CULL_FACE: case GL_DEPTH_TEST: case GL_DITHER: case GL_POLYGON_OFFSET_FILL: case GL_SAMPLE_ALPHA_TO_COVERAGE: case GL_SAMPLE_COVERAGE: case GL_SCISSOR_TEST: case GL_STENCIL_TEST: glDisable(cap); return; }
  error(GL_INVALID_ENUM);
}
void WebGL1::viewport(int x, int y, int w, int h) { if (w < 0 || h < 0) return error(GL_INVALID_VALUE); glViewport(x, y, w, h); }
void WebGL1::scissor(int x, int y, int w, int h) { if (w < 0 || h < 0) return error(GL_INVALID_VALUE); glScissor(x, y, w, h); }
void WebGL1::clearColor(float r, float g, float b, float a) { glClearColor(r, g, b, a); }
void WebGL1::clear(std::uint32_t mask) {
  if (mask & ~static_cast<std::uint32_t>(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT | GL_STENCIL_BUFFER_BIT)) return error(GL_INVALID_VALUE);
  if (!framebufferReady()) return error(GL_INVALID_FRAMEBUFFER_OPERATION);
  glClear(mask);
}
void WebGL1::pixelStorei(std::uint32_t pname, int value) {
  if (pname == GL_UNPACK_ALIGNMENT || pname == GL_PACK_ALIGNMENT) {
    if (value != 1 && value != 2 && value != 4 && value != 8) return error(GL_INVALID_VALUE);
    if (pname == GL_UNPACK_ALIGNMENT) unpackAlignment_ = value;
    glPixelStorei(pname, value);
    return;
  }
  if (pname == 0x9240) { unpackFlipY_ = value != 0; return; }          // UNPACK_FLIP_Y_WEBGL, PREMULTIPLY_ALPHA, COLORSPACE_CONVERSION: kept here, applied by the binding on image sources
  if (pname == 0x9241) { unpackPremultiply_ = value != 0; return; }
  if (pname == 0x9243) { if (value != 0 && value != 0x9244) return error(GL_INVALID_VALUE); unpackColorspace_ = value; return; }
  error(GL_INVALID_ENUM);
}

// ---- buffers
Id WebGL1::createBuffer() { Buf b; glGenBuffers(1, &b.name); Id id = nextId_++; buffers_[id] = b; return id; }
void WebGL1::deleteBuffer(Id id) {
  auto it = buffers_.find(id);
  if (it == buffers_.end() || it->second.deleted) return;   // null and already deleted: nothing happens
  if (arrayBuffer_ == id) { arrayBuffer_ = 0; glBindBuffer(GL_ARRAY_BUFFER, 0); }
  if (elementBuffer_ == id) { elementBuffer_ = 0; glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, 0); }
  for (Attrib& a : attribs_) if (a.buffer == id) a.buffer = 0;
  for (auto& o : otherBuffers_) if (o.second == id) { o.second = 0; glBindBuffer(o.first, 0); }
  for (auto& o : indexed_) if (o.second.buffer == id) { o.second.buffer = 0; glBindBufferBase(static_cast<std::uint32_t>(o.first >> 32), static_cast<std::uint32_t>(o.first), 0); }
  it->second.deleted = true;   // a buffer that another vertex array still uses lives on until it lets go
  releaseBuffers();
}
// the deleted buffers that no vertex array holds any more
void WebGL1::releaseBuffers() {
  for (auto it = buffers_.begin(); it != buffers_.end();) {
    bool used = false;
    if (it->second.deleted) {
      auto uses = [&](const Vao& v) { for (const Attrib& a : v.attribs) if (a.buffer == it->first) return true; return v.element == it->first; };
      for (auto& v : vaos_) if (v.first != curVao_ && uses(v.second)) used = true;
      if (curVao_ && uses(defaultVao_)) used = true;
      for (const Attrib& a : attribs_) if (a.buffer == it->first) used = true;   // the bound vertex array's own state is live, not in its Vao
      if (elementBuffer_ == it->first) used = true;
    }
    if (it->second.deleted && !used) { glDeleteBuffers(1, &it->second.name); it = buffers_.erase(it); }
    else ++it;
  }
}
bool WebGL1::isBuffer(Id id) const { auto it = buffers_.find(id); return it != buffers_.end() && it->second.bound && !it->second.deleted; }   // a buffer is an object once it has been bound
bool WebGL1::bufferTargetOk(std::uint32_t t) const {
  if (t == GL_ARRAY_BUFFER || t == GL_ELEMENT_ARRAY_BUFFER) return true;
  return version_ == 2 && (t == GL_UNIFORM_BUFFER || t == GL_COPY_READ_BUFFER || t == GL_COPY_WRITE_BUFFER || t == GL_PIXEL_PACK_BUFFER || t == GL_PIXEL_UNPACK_BUFFER || t == GL_TRANSFORM_FEEDBACK_BUFFER);
}
Id& WebGL1::bufferSlot(std::uint32_t t) { return t == GL_ARRAY_BUFFER ? arrayBuffer_ : t == GL_ELEMENT_ARRAY_BUFFER ? elementBuffer_ : otherBuffers_[t]; }
void WebGL1::bindBuffer(std::uint32_t target, Id id) {
  if (!bufferTargetOk(target)) return error(GL_INVALID_ENUM);
  std::uint32_t name = 0;
  if (id) {
    auto it = buffers_.find(id);
    if (it == buffers_.end() || it->second.deleted) return error(GL_INVALID_OPERATION);
    // WebGL 1: a buffer keeps the first target it was bound to. WebGL 2: only the element-array / other split is kept.
    const std::uint32_t pin = version_ == 2 ? (target == GL_ELEMENT_ARRAY_BUFFER ? GL_ELEMENT_ARRAY_BUFFER : GL_ARRAY_BUFFER) : target;
    const bool copy = target == GL_COPY_READ_BUFFER || target == GL_COPY_WRITE_BUFFER;   // copy targets may hold either kind of buffer
    if (!copy && it->second.target && it->second.target != pin) return error(GL_INVALID_OPERATION);
    if (!it->second.target) it->second.target = pin;
    it->second.bound = true;
    name = it->second.name;
  }
  bufferSlot(target) = id;
  glBindBuffer(target, name);
}
void WebGL1::bufferData(std::uint32_t target, std::int64_t size, const void* data, std::uint32_t usage) {
  if (!bufferTargetOk(target)) return error(GL_INVALID_ENUM);
  const bool v2 = version_ == 2;
  if (usage != GL_STREAM_DRAW && usage != GL_STATIC_DRAW && usage != GL_DYNAMIC_DRAW && !(v2 && (usage == GL_STREAM_READ || usage == GL_STREAM_COPY || usage == GL_STATIC_READ || usage == GL_STATIC_COPY || usage == GL_DYNAMIC_READ || usage == GL_DYNAMIC_COPY))) return error(GL_INVALID_ENUM);
  if (size < 0) return error(GL_INVALID_VALUE);
  Id id = bufferSlot(target);
  if (!id) return error(GL_INVALID_OPERATION);
  Buf& b = buffers_[id];
  b.size = size;
  b.shadow.assign(static_cast<std::size_t>(size), 0);
  if (data && size) std::memcpy(b.shadow.data(), data, static_cast<std::size_t>(size));
  glBufferData(target, static_cast<GLsizeiptr>(size), b.shadow.empty() ? nullptr : b.shadow.data(), usage);
  for (auto& x : indexed_) if (x.second.buffer == id) applyIndexed(static_cast<std::uint32_t>(x.first >> 32), static_cast<std::uint32_t>(x.first));
}
void WebGL1::bufferSubData(std::uint32_t target, std::int64_t offset, std::int64_t size, const void* data) {
  if (!bufferTargetOk(target)) return error(GL_INVALID_ENUM);
  Id id = bufferSlot(target);
  if (!id) return error(GL_INVALID_OPERATION);
  Buf& b = buffers_[id];
  if (offset < 0 || size < 0 || offset + size > b.size) return error(GL_INVALID_VALUE);
  if (size) std::memcpy(b.shadow.data() + offset, data, static_cast<std::size_t>(size));
  glBufferSubData(target, static_cast<GLintptr>(offset), static_cast<GLsizeiptr>(size), data);
}

// ---- shaders and programs
Id WebGL1::createShader(std::uint32_t type) {
  if (type != GL_VERTEX_SHADER && type != GL_FRAGMENT_SHADER) { error(GL_INVALID_ENUM); return 0; }
  Shader s;
  s.type = type;
  s.name = glCreateShader(type);
  Id id = nextId_++;
  shaders_[id] = s;
  return id;
}
void WebGL1::shaderSource(Id id, const std::string& src) {
  auto it = shaders_.find(id);
  if (it == shaders_.end()) return error(id < nextId_ ? GL_INVALID_VALUE : GL_INVALID_OPERATION);   // a deleted shader is name 0 to GL
  it->second.source = src;
}
void WebGL1::compileShader(Id id) {
  auto it = shaders_.find(id);
  if (it == shaders_.end()) return error(id < nextId_ ? GL_INVALID_VALUE : GL_INVALID_OPERATION);
  Shader& s = it->second;
  // GLSL ES 1.00 requires a precision for every float declaration in a fragment shader: a default (`precision mediump float;`) or a qualifier on the declaration.
  // Desktop GLSL does not, so the rule is checked here on the source with its comments removed.
  if (s.type == GL_FRAGMENT_SHADER && !fragmentPrecisionOk(s.source)) {
    s.compiled = false;
    s.log = "ERROR: 0:1: 'float' : No precision specified (fragment shaders need a default float precision)";
    return;
  }
  std::string full = translate(s.source, s.type, gl_.info().es);
  const char* p = full.c_str();
  glShaderSource(s.name, 1, &p, nullptr);
  glCompileShader(s.name);
  GLint ok = 0, len = 0;
  glGetShaderiv(s.name, GL_COMPILE_STATUS, &ok);
  glGetShaderiv(s.name, GL_INFO_LOG_LENGTH, &len);
  s.log.assign(static_cast<std::size_t>(std::max(len, 1)), '\0');
  glGetShaderInfoLog(s.name, len, nullptr, s.log.data());
  s.log.resize(std::strlen(s.log.c_str()));
  s.compiled = ok != 0;
}
bool WebGL1::shaderCompiled(Id id) const { auto it = shaders_.find(id); return it != shaders_.end() && it->second.compiled; }
std::string WebGL1::shaderInfoLog(Id id) const { auto it = shaders_.find(id); return it == shaders_.end() ? "" : it->second.log; }
Id WebGL1::createProgram() { Program p; p.name = glCreateProgram(); Id id = nextId_++; programs_[id] = p; return id; }
void WebGL1::attachShader(Id pid, Id sid) {
  auto p = programs_.find(pid);
  auto s = shaders_.find(sid);
  if (p == programs_.end() || s == shaders_.end()) return error(GL_INVALID_OPERATION);
  Id& slot = s->second.type == GL_VERTEX_SHADER ? p->second.vs : p->second.fs;
  if (slot) return error(GL_INVALID_OPERATION);   // one shader of each type
  slot = sid;
  ++s->second.attached;
  glAttachShader(p->second.name, s->second.name);
}
// WebGL: names of attributes and uniforms use the GLSL ES source character set
static bool validName(const std::string& n) {
  for (unsigned char ch : n) if (ch < 0x20 || ch > 0x7E || std::strchr("\"$`@\\'", ch)) return false;
  return true;
}
void WebGL1::bindAttribLocation(Id pid, std::uint32_t index, const std::string& name) {
  auto p = programs_.find(pid);
  if (p == programs_.end()) return error(GL_INVALID_OPERATION);
  if (index >= kMaxAttribs || !validName(name)) return error(GL_INVALID_VALUE);
  if (name.compare(0, 3, "gl_") == 0) return error(GL_INVALID_OPERATION);
  if (name.compare(0, 6, "webgl_") == 0 || name.compare(0, 6, "_webgl") == 0) return error(GL_INVALID_OPERATION);
  p->second.attribBindings[name] = static_cast<int>(index);
  glBindAttribLocation(p->second.name, index, name.c_str());
}
void WebGL1::linkProgram(Id pid) {
  auto it = programs_.find(pid);
  if (it == programs_.end()) return error(pid < nextId_ ? GL_INVALID_VALUE : GL_INVALID_OPERATION);
  Program& p = it->second;
  ++p.gen;
  if (!p.vs || !p.fs || !shaders_[p.vs].compiled || !shaders_[p.fs].compiled) {   // WebGL: both stages, compiled (a desktop driver would link an empty program)
    p.linked = false;
    p.log = "ERROR: a program needs a compiled vertex shader and a compiled fragment shader";
    return;
  }
  glLinkProgram(p.name);
  GLint ok = 0, len = 0;
  glGetProgramiv(p.name, GL_LINK_STATUS, &ok);
  glGetProgramiv(p.name, GL_INFO_LOG_LENGTH, &len);
  p.log.assign(static_cast<std::size_t>(std::max(len, 1)), '\0');
  glGetProgramInfoLog(p.name, len, nullptr, p.log.data());
  p.log.resize(std::strlen(p.log.c_str()));
  p.linked = ok != 0;
}
bool WebGL1::programLinked(Id id) const { auto it = programs_.find(id); return it != programs_.end() && it->second.linked; }
std::string WebGL1::programInfoLog(Id id) const { auto it = programs_.find(id); return it == programs_.end() ? "" : it->second.log; }
// a program is gone: the shaders it held may now go too
void WebGL1::eraseProgram(Id id) {
  auto it = programs_.find(id);
  if (it == programs_.end()) return;
  for (Id sid : {it->second.vs, it->second.fs}) if (sid) { auto sh = shaders_.find(sid); if (sh != shaders_.end() && --sh->second.attached <= 0 && sh->second.deleted) shaders_.erase(sh); }
  programs_.erase(it);
}
void WebGL1::useProgram(Id id) {
  if (!id) { const Id old = program_; program_ = 0; glUseProgram(0); if (old) { auto o = programs_.find(old); if (o != programs_.end() && o->second.deleted) eraseProgram(old); } return; }
  auto it = programs_.find(id);
  if (it == programs_.end() || !it->second.linked || it->second.deleted) return error(GL_INVALID_OPERATION);
  const Id old = program_;
  program_ = id;
  glUseProgram(it->second.name);
  if (old && old != id) { auto o = programs_.find(old); if (o != programs_.end() && o->second.deleted) eraseProgram(old); }
}
int WebGL1::getAttribLocation(Id pid, const std::string& name) {
  auto it = programs_.find(pid);
  if (it == programs_.end() || !it->second.linked) { error(GL_INVALID_OPERATION); return -1; }
  if (!validName(name)) { error(GL_INVALID_VALUE); return -1; }
  if (name.compare(0, 3, "gl_") == 0) return -1;
  return glGetAttribLocation(it->second.name, name.c_str());
}
UniformLoc WebGL1::getUniformLocation(Id pid, const std::string& name) {
  UniformLoc l;
  auto it = programs_.find(pid);
  if (it == programs_.end() || !it->second.linked) { error(GL_INVALID_OPERATION); return l; }
  if (!validName(name)) { error(GL_INVALID_VALUE); return l; }
  if (name.compare(0, 3, "gl_") == 0 || name.compare(0, 6, "webgl_") == 0) return l;
  for (std::size_t br = name.find('['); br != std::string::npos; br = name.find('[', br + 1)) {   // "u[3]", "lights[2].color": digits only, an index that fits an int, a closing bracket that ends the name or is followed by `.` or `[`
    std::size_t close = name.find(']', br);
    if (close == std::string::npos || close == br + 1) return l;
    if (close != name.size() - 1 && name[close + 1] != '.' && name[close + 1] != '[') return l;
    std::uint64_t idx = 0;
    for (std::size_t i = br + 1; i < close; ++i) { if (name[i] < '0' || name[i] > '9') return l; idx = idx * 10 + static_cast<std::uint64_t>(name[i] - '0'); if (idx > 0x7fffffffu) return l; }
  }
  int loc = glGetUniformLocation(it->second.name, name.c_str());
  if (loc < 0) return l;
  std::string base = name.substr(0, name.find('['));
  GLint n = 0;
  glGetProgramiv(it->second.name, GL_ACTIVE_UNIFORMS, &n);
  for (GLint i = 0; i < n; ++i) {
    char buf[256];
    GLsizei len = 0;
    GLint size = 0;
    GLenum type = 0;
    glGetActiveUniform(it->second.name, static_cast<GLuint>(i), sizeof buf, &len, &size, &type, buf);
    std::string an(buf, static_cast<std::size_t>(len));
    // a member of a struct (array) is found by its whole name; a plain array by its base (u[3] is the active uniform u[0])
    if (name.find('.') != std::string::npos ? an == name : an.substr(0, an.find('[')) == base) { l.type = type; l.size = size; break; }
  }
  l.program = pid;
  l.gen = it->second.gen;
  l.location = loc;
  return l;
}

// A uniform call: null location is ignored, the location must belong to the program in use, and the call must match the uniform's type.
#define ZN_UNIFORM_CHECK(l, ...) \
  if (!(l).valid()) return; \
  if (!program_ || (l).program != program_ || stale(l)) return error(GL_INVALID_OPERATION); \
  { const std::uint32_t ok_[] = {__VA_ARGS__}; bool match_ = false; for (std::uint32_t t_ : ok_) match_ = match_ || t_ == (l).type; if (!match_) return error(GL_INVALID_OPERATION); }
void WebGL1::uniform1f(const UniformLoc& l, float x) { ZN_UNIFORM_CHECK(l, GL_FLOAT, GL_BOOL) glUniform1f(l.location, x); }
void WebGL1::uniform2f(const UniformLoc& l, float x, float y) { ZN_UNIFORM_CHECK(l, GL_FLOAT_VEC2, GL_BOOL_VEC2) glUniform2f(l.location, x, y); }
void WebGL1::uniform4f(const UniformLoc& l, float x, float y, float z, float w) { ZN_UNIFORM_CHECK(l, GL_FLOAT_VEC4, GL_BOOL_VEC4) glUniform4f(l.location, x, y, z, w); }
void WebGL1::uniform1i(const UniformLoc& l, int x) {
  if (isSamplerType(l.type)) { if (!l.valid()) return; if (!program_ || l.program != program_ || stale(l)) return error(GL_INVALID_OPERATION); }
  else { ZN_UNIFORM_CHECK(l, GL_INT, GL_BOOL) }
  if (isSamplerType(l.type) && (x < 0 || x >= 32)) return error(GL_INVALID_VALUE);   // a texture unit that does not exist (MAX_COMBINED_TEXTURE_IMAGE_UNITS is reported as 32)
  glUniform1i(l.location, x);
}
void WebGL1::uniformMatrix4fv(const UniformLoc& l, bool transpose, const float* v, std::size_t n) {
  ZN_UNIFORM_CHECK(l, GL_FLOAT_MAT4)
  if (transpose) return error(GL_INVALID_VALUE);   // WebGL1 forbids it
  if (n == 0 || n % 16 != 0) return error(GL_INVALID_VALUE);
  glUniformMatrix4fv(l.location, static_cast<GLsizei>(n / 16), GL_FALSE, v);
}

// ---- vertex arrays and draws
void WebGL1::enableVertexAttribArray(std::uint32_t i) { if (i >= kMaxAttribs) return error(GL_INVALID_VALUE); attribs_[i].enabled = true; glEnableVertexAttribArray(i); }
void WebGL1::disableVertexAttribArray(std::uint32_t i) { if (i >= kMaxAttribs) return error(GL_INVALID_VALUE); attribs_[i].enabled = false; glDisableVertexAttribArray(i); }
void WebGL1::vertexAttribPointer(std::uint32_t i, int size, std::uint32_t type, bool normalized, int stride, std::int64_t offset) {
  if (i >= kMaxAttribs || size < 1 || size > 4 || stride < 0 || stride > 255 || offset < 0) return error(size < 1 || size > 4 || i >= kMaxAttribs || stride < 0 || stride > 255 || offset < 0 ? GL_INVALID_VALUE : GL_INVALID_ENUM);
  int ts = typeSize(type);
  if (!ts) return error(GL_INVALID_ENUM);
  if (offset % ts || stride % ts) return error(GL_INVALID_OPERATION);
  if (!arrayBuffer_ && offset != 0) return error(GL_INVALID_OPERATION);
  Attrib& a = attribs_[i];
  a.buffer = arrayBuffer_;
  releaseBuffers();
  a.size = size; a.type = type; a.normalized = normalized; a.stride = stride; a.offset = offset;
  glVertexAttribPointer(i, size, type, normalized, stride, reinterpret_cast<const void*>(static_cast<std::intptr_t>(offset)));
}
bool WebGL1::checkDrawState(std::int64_t firstIndex, std::int64_t lastIndex, std::int64_t instances) {
  if (!program_) { error(GL_INVALID_OPERATION); return false; }
  if (!framebufferReady()) { error(GL_INVALID_FRAMEBUFFER_OPERATION); return false; }
  const Program& pr = programs_[program_];
  if (!pr.linked) { error(GL_INVALID_OPERATION); return false; }   // a failed link invalidates the program even while it is in use
  GLint n = 0;
  glGetProgramiv(pr.name, GL_ACTIVE_ATTRIBUTES, &n);
  for (GLint k = 0; k < n; ++k) {   // only the attributes the program reads, as WebGL does
    char buf[256];
    GLsizei len = 0; GLint size = 0; GLenum type = 0;
    glGetActiveAttrib(pr.name, static_cast<GLuint>(k), sizeof buf, &len, &size, &type, buf);
    int loc = glGetAttribLocation(pr.name, buf);
    if (loc < 0 || loc >= kMaxAttribs || !attribs_[loc].enabled) continue;
    const Attrib& a = attribs_[loc];
    auto b = buffers_.find(a.buffer);
    if (b == buffers_.end()) { error(GL_INVALID_OPERATION); return false; }   // no client-side arrays in WebGL
    int ts = typeSize(a.type), stride = a.stride ? a.stride : a.size * ts;
    std::int64_t last = a.divisor ? (instances + a.divisor - 1) / a.divisor - 1 : lastIndex;   // per-instance attributes advance once per `divisor` instances
    if (a.divisor ? instances <= 0 : lastIndex < firstIndex) continue;
    std::int64_t need = a.offset + stride * last + static_cast<std::int64_t>(a.size) * ts;
    if (need > b->second.size) { error(GL_INVALID_OPERATION); return false; }
  }
  if (version_ == 2) {   // every uniform block needs a buffer range big enough for it
    GLint blocks = 0;
    glGetProgramiv(pr.name, GL_ACTIVE_UNIFORM_BLOCKS, &blocks);
    for (GLint i = 0; i < blocks; ++i) {
      GLint binding = 0, size = 0;
      glGetActiveUniformBlockiv(pr.name, static_cast<GLuint>(i), GL_UNIFORM_BLOCK_BINDING, &binding);
      glGetActiveUniformBlockiv(pr.name, static_cast<GLuint>(i), GL_UNIFORM_BLOCK_DATA_SIZE, &size);
      auto x = indexed_.find((static_cast<std::uint64_t>(GL_UNIFORM_BUFFER) << 32) | static_cast<std::uint32_t>(binding));
      auto b = x == indexed_.end() ? buffers_.end() : buffers_.find(x->second.buffer);
      const std::int64_t avail = b == buffers_.end() ? -1 : x->second.whole ? b->second.size - x->second.offset : x->second.size;
      if (avail < size) { error(GL_INVALID_OPERATION); return false; }
    }
  }
  return true;
}
void WebGL1::drawArrays(std::uint32_t mode, int first, int count) {
  if (mode > GL_TRIANGLE_FAN) return error(GL_INVALID_ENUM);
  if (first < 0 || count < 0) return error(GL_INVALID_VALUE);
  if (!checkDrawState(first, static_cast<std::int64_t>(first) + count - 1)) return;
  if (count == 0) return;
  glDrawArrays(mode, first, count);
}
void WebGL1::drawElements(std::uint32_t mode, int count, std::uint32_t type, std::int64_t offset) {
  if (version_ == 2) return drawElementsInstanced(mode, count, type, offset, 1);   // WebGL 2 also takes UNSIGNED_INT
  if (mode > GL_TRIANGLE_FAN) return error(GL_INVALID_ENUM);
  if (type != GL_UNSIGNED_BYTE && type != GL_UNSIGNED_SHORT) return error(GL_INVALID_ENUM);   // UNSIGNED_INT needs OES_element_index_uint
  if (count < 0 || offset < 0) return error(GL_INVALID_VALUE);
  int ts = type == GL_UNSIGNED_BYTE ? 1 : 2;
  if (offset % ts) return error(GL_INVALID_OPERATION);
  auto e = buffers_.find(elementBuffer_);
  if (e == buffers_.end()) return error(GL_INVALID_OPERATION);
  if (count > 0 && offset + static_cast<std::int64_t>(count) * ts > e->second.size) return error(GL_INVALID_OPERATION);
  std::int64_t maxIndex = -1;
  for (int i = 0; i < count; ++i) {
    const std::uint8_t* p = e->second.shadow.data() + offset + static_cast<std::int64_t>(i) * ts;
    std::int64_t v = ts == 1 ? *p : static_cast<std::int64_t>(p[0] | (p[1] << 8));
    maxIndex = std::max(maxIndex, v);
  }
  if (!checkDrawState(0, maxIndex)) return;
  if (count == 0) return;
  glDrawElements(mode, count, type, reinterpret_cast<const void*>(static_cast<std::intptr_t>(offset)));
}

// ---- textures
Id WebGL1::createTexture() { Tex t; glGenTextures(1, &t.name); Id id = nextId_++; textures_[id] = t; return id; }
void WebGL1::deleteTexture(Id id) {
  auto it = textures_.find(id);
  if (it == textures_.end()) return;
  glDeleteTextures(1, &it->second.name);
  for (Id& b : tex2d_) if (b == id) b = 0;
  for (Id& b : texCube_) if (b == id) b = 0;
  for (auto& f : fbos_) if (f.second.color == id) f.second.color = 0;
  textures_.erase(it);
}
void WebGL1::activeTexture(std::uint32_t unit) {
  if (unit < GL_TEXTURE0 || unit >= GL_TEXTURE0 + kMaxUnits) return error(GL_INVALID_ENUM);
  activeUnit_ = unit - GL_TEXTURE0;
  glActiveTexture(unit);
}
void WebGL1::bindTexture(std::uint32_t target, Id id) {
  if (target != GL_TEXTURE_2D && target != GL_TEXTURE_CUBE_MAP && !(version_ == 2 && (target == GL_TEXTURE_3D || target == GL_TEXTURE_2D_ARRAY))) return error(GL_INVALID_ENUM);
  std::uint32_t name = 0;
  if (id) {
    auto it = textures_.find(id);
    if (it == textures_.end()) return error(GL_INVALID_OPERATION);
    if (it->second.target && it->second.target != target) return error(GL_INVALID_OPERATION);   // a texture keeps the target of its first bind
    it->second.target = target;
    name = it->second.name;
    it->second.bound = true;
  }
  boundTex(target) = id;
  glBindTexture(target, name);
}
void WebGL1::texImage2D(std::uint32_t target, int level, std::uint32_t internalformat, int width, int height, int border, std::uint32_t format, std::uint32_t type, const void* data, std::size_t dataBytes) {
  const bool face = target >= GL_TEXTURE_CUBE_MAP_POSITIVE_X && target <= GL_TEXTURE_CUBE_MAP_NEGATIVE_Z;
  if (target != GL_TEXTURE_2D && !face) return error(GL_INVALID_ENUM);
  if (version_ == 2 && border != 0) return error(GL_INVALID_VALUE);
  if (version_ == 2 && internalformat != format) {   // sized internal formats (ES 3.0 table 3.2)
    if (face && width != height) return error(GL_INVALID_VALUE);
    uploadTexture(false, target, level, internalformat, width, height, 1, format, type, data, dataBytes, 0, 0, 0, false);
    return;
  }
  int bpp = 0;
  const bool validFormat = format == GL_ALPHA || format == GL_RGB || format == GL_RGBA || format == GL_LUMINANCE || format == GL_LUMINANCE_ALPHA;
  const bool validType = type == GL_UNSIGNED_BYTE || type == GL_UNSIGNED_SHORT_5_6_5 || type == GL_UNSIGNED_SHORT_4_4_4_4 || type == GL_UNSIGNED_SHORT_5_5_5_1;
  if (!validFormat || !validType) return error(GL_INVALID_ENUM);   // FLOAT / HALF_FLOAT_OES need their extensions
  if (level < 0 || width < 0 || height < 0 || width > maxTexSize_ || height > maxTexSize_ || border != 0) return error(GL_INVALID_VALUE);
  if (internalformat != format) return error(GL_INVALID_OPERATION);
  if (!formatType(format, type, bpp)) return error(GL_INVALID_OPERATION);
  Id id = (face ? texCube_ : tex2d_)[activeUnit_];
  if (!id) return error(GL_INVALID_OPERATION);
  if (textures_[id].immutable) return error(GL_INVALID_OPERATION);   // texStorage fixed the format and sizes
  if (face && width != height) return error(GL_INVALID_VALUE);   // cube faces are square
  if (data) {
    std::size_t row = static_cast<std::size_t>(width) * bpp;
    row = (row + unpackAlignment_ - 1) / unpackAlignment_ * unpackAlignment_;
    std::size_t need = height ? row * (height - 1) + static_cast<std::size_t>(width) * bpp : 0;
    if (dataBytes < need) return error(GL_INVALID_OPERATION);
  }
  GLenum gf = format, gi = format;
  if (!gl_.info().es) {   // the legacy formats do not exist in core: one or two channels plus a swizzle give the same sampling
    if (format == GL_ALPHA || format == GL_LUMINANCE) { gf = GL_RED; gi = GL_R8; }
    else if (format == GL_LUMINANCE_ALPHA) { gf = GL_RG; gi = GL_RG8; }
    else if (format == GL_RGB) gi = type == GL_UNSIGNED_BYTE ? GL_RGB8 : GL_RGB;
    else gi = type == GL_UNSIGNED_BYTE ? GL_RGBA8 : GL_RGBA;
    const GLint sw[3][4] = {{GL_ZERO, GL_ZERO, GL_ZERO, GL_RED}, {GL_RED, GL_RED, GL_RED, GL_ONE}, {GL_RED, GL_RED, GL_RED, GL_GREEN}};
    const GLenum bt = face ? GL_TEXTURE_CUBE_MAP : GL_TEXTURE_2D;
    if (format == GL_ALPHA) glTexParameteriv(bt, GL_TEXTURE_SWIZZLE_RGBA, sw[0]);
    else if (format == GL_LUMINANCE) glTexParameteriv(bt, GL_TEXTURE_SWIZZLE_RGBA, sw[1]);
    else if (format == GL_LUMINANCE_ALPHA) glTexParameteriv(bt, GL_TEXTURE_SWIZZLE_RGBA, sw[2]);
  }
  glTexImage2D(target, level, static_cast<GLint>(gi), width, height, 0, gf, type, data);
  Tex& t = textures_[id];
  if (level == 0) { t.w = width; t.h = height; t.format = format; }
}
void WebGL1::texParameteri(std::uint32_t target, std::uint32_t pname, int v) {
  if (target != GL_TEXTURE_2D && target != GL_TEXTURE_CUBE_MAP && !(version_ == 2 && (target == GL_TEXTURE_3D || target == GL_TEXTURE_2D_ARRAY))) return error(GL_INVALID_ENUM);
  bool ok = false;
  switch (pname) {
    case GL_TEXTURE_WRAP_R: if (version_ != 2) return error(GL_INVALID_ENUM); ok = v == GL_REPEAT || v == GL_CLAMP_TO_EDGE || v == GL_MIRRORED_REPEAT; break;
    case GL_TEXTURE_COMPARE_MODE: if (version_ != 2) return error(GL_INVALID_ENUM); ok = v == GL_NONE || v == GL_COMPARE_REF_TO_TEXTURE; break;
    case GL_TEXTURE_COMPARE_FUNC: if (version_ != 2) return error(GL_INVALID_ENUM); ok = v >= GL_NEVER && v <= GL_ALWAYS; break;
    case GL_TEXTURE_BASE_LEVEL: case GL_TEXTURE_MAX_LEVEL: if (version_ != 2) return error(GL_INVALID_ENUM); if (v < 0) return error(GL_INVALID_VALUE); ok = true; break;
    case GL_TEXTURE_MIN_LOD: case GL_TEXTURE_MAX_LOD: if (version_ != 2) return error(GL_INVALID_ENUM); ok = true; break;
    case GL_TEXTURE_MIN_FILTER: ok = v == GL_NEAREST || v == GL_LINEAR || v == GL_NEAREST_MIPMAP_NEAREST || v == GL_LINEAR_MIPMAP_NEAREST || v == GL_NEAREST_MIPMAP_LINEAR || v == GL_LINEAR_MIPMAP_LINEAR; break;
    case GL_TEXTURE_MAG_FILTER: ok = v == GL_NEAREST || v == GL_LINEAR; break;
    case GL_TEXTURE_WRAP_S: case GL_TEXTURE_WRAP_T: ok = v == GL_REPEAT || v == GL_CLAMP_TO_EDGE || v == GL_MIRRORED_REPEAT; break;
    default: return error(GL_INVALID_ENUM);
  }
  if (!ok) return error(GL_INVALID_ENUM);
  if (!boundTex(target)) return error(GL_INVALID_OPERATION);
  glTexParameteri(target, pname, v);
}

// ---- framebuffers
Id WebGL1::createFramebuffer() { Fbo f; glGenFramebuffers(1, &f.name); Id id = nextId_++; fbos_[id] = f; return id; }
void WebGL1::bindFramebuffer(std::uint32_t target, Id id) {
  if (target != GL_FRAMEBUFFER && !(version_ == 2 && (target == GL_READ_FRAMEBUFFER || target == GL_DRAW_FRAMEBUFFER))) return error(GL_INVALID_ENUM);
  std::uint32_t name = gl_.framebuffer();   // null: the canvas
  if (id) {
    auto it = fbos_.find(id);
    if (it == fbos_.end()) return error(GL_INVALID_OPERATION);
    name = it->second.name;
    it->second.bound = true;
  }
  if (target != GL_READ_FRAMEBUFFER) fbo_ = id;
  if (target != GL_DRAW_FRAMEBUFFER) fboRead_ = id;
  glBindFramebuffer(target, name);
}
void WebGL1::framebufferTexture2D(std::uint32_t target, std::uint32_t attachment, std::uint32_t textarget, Id tex, int level) {
  if (target != GL_FRAMEBUFFER && !(version_ == 2 && (target == GL_READ_FRAMEBUFFER || target == GL_DRAW_FRAMEBUFFER))) return error(GL_INVALID_ENUM);
  if (attachment != GL_COLOR_ATTACHMENT0 && attachment != GL_DEPTH_ATTACHMENT && attachment != GL_STENCIL_ATTACHMENT && attachment != GL_DEPTH_STENCIL_ATTACHMENT && !(version_ == 2 && attachment > GL_COLOR_ATTACHMENT0 && attachment < GL_COLOR_ATTACHMENT0 + 4)) return error(GL_INVALID_ENUM);
  if (textarget != GL_TEXTURE_2D && !(textarget >= GL_TEXTURE_CUBE_MAP_POSITIVE_X && textarget <= GL_TEXTURE_CUBE_MAP_NEGATIVE_Z)) return error(GL_INVALID_ENUM);
  if (level != 0) return error(GL_INVALID_VALUE);
  if (!fbo_) return error(GL_INVALID_OPERATION);
  std::uint32_t name = 0;
  if (tex) {
    auto it = textures_.find(tex);
    if (it == textures_.end()) return error(GL_INVALID_OPERATION);
    name = it->second.name;
  }
  if (attachment == GL_COLOR_ATTACHMENT0) fbos_[fbo_].color = tex;
  glFramebufferTexture2D(GL_FRAMEBUFFER, attachment, textarget, name, 0);
}
// the per-draw test: the driver's own answer is enough unless it says no (then the full rules decide)
bool WebGL1::framebufferReady() { return !fbo_ || glCheckFramebufferStatus(GL_FRAMEBUFFER) == GL_FRAMEBUFFER_COMPLETE || checkFramebufferStatus(GL_FRAMEBUFFER) == GL_FRAMEBUFFER_COMPLETE; }
std::uint32_t WebGL1::checkFramebufferStatus(std::uint32_t target) {
  if (target != GL_FRAMEBUFFER && !(version_ == 2 && (target == GL_READ_FRAMEBUFFER || target == GL_DRAW_FRAMEBUFFER))) { error(GL_INVALID_ENUM); return 0; }
  const Id bound = target == GL_READ_FRAMEBUFFER ? fboRead_ : fbo_;
  if (!bound) return GL_FRAMEBUFFER_COMPLETE;
  if (version_ != 2) return glCheckFramebufferStatus(target);
  // what is attached: type, name and, for textures, level, face and layer
  struct Img { GLint type = GL_NONE, name = 0, level = 0, face = 0, layer = 0; bool operator==(const Img& o) const { return type == o.type && name == o.name && level == o.level && face == o.face && layer == o.layer; } };
  auto img = [&](GLenum att) {
    Img i;
    glGetFramebufferAttachmentParameteriv(target, att, GL_FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE, &i.type);
    if (i.type != GL_NONE) glGetFramebufferAttachmentParameteriv(target, att, GL_FRAMEBUFFER_ATTACHMENT_OBJECT_NAME, &i.name);
    if (i.type == GL_TEXTURE) {
      glGetFramebufferAttachmentParameteriv(target, att, GL_FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL, &i.level);
      glGetFramebufferAttachmentParameteriv(target, att, GL_FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE, &i.face);
      glGetFramebufferAttachmentParameteriv(target, att, GL_FRAMEBUFFER_ATTACHMENT_TEXTURE_LAYER, &i.layer);
    }
    return i;
  };
  Img color[4];
  GLenum bufs[4];
  GLenum firstColor = GL_NONE;
  for (int i = 0; i < 4; ++i) { color[i] = img(GL_COLOR_ATTACHMENT0 + i); bufs[i] = color[i].type != GL_NONE ? GL_COLOR_ATTACHMENT0 + i : GL_NONE; if (bufs[i] && !firstColor) firstColor = bufs[i]; }
  // some drivers call a framebuffer incomplete when the draw or read buffer names an empty attachment; WebGL says they never matter, so point them at what is attached while asking
  if (target != GL_READ_FRAMEBUFFER) glDrawBuffers(4, bufs);
  if (target != GL_DRAW_FRAMEBUFFER) glReadBuffer(firstColor);
  GLenum status = glCheckFramebufferStatus(target);
  if (target != GL_READ_FRAMEBUFFER) { GLenum d[4]; for (int i = 0; i < 4; ++i) d[i] = fbos_[fbo_].draw[i]; glDrawBuffers(4, d); }
  if (target != GL_DRAW_FRAMEBUFFER) glReadBuffer(fbos_[fboRead_ ? fboRead_ : fbo_].readBuffer);
  while (glGetError() != GL_NO_ERROR) {}
  if (status != GL_FRAMEBUFFER_COMPLETE) return status;
  for (int i = 0; i < 4; ++i) for (int j = i + 1; j < 4; ++j) if (color[i].type != GL_NONE && color[i] == color[j]) return GL_FRAMEBUFFER_UNSUPPORTED;   // one image on two attachment points
  const Img depth = img(GL_DEPTH_ATTACHMENT), stencil = img(GL_STENCIL_ATTACHMENT);
  while (glGetError() != GL_NO_ERROR) {}
  if (depth.type != GL_NONE && stencil.type != GL_NONE && !(depth == stencil)) return GL_FRAMEBUFFER_UNSUPPORTED;   // depth and stencil must be the same image
  return status;
}
void WebGL1::readPixels(int x, int y, int w, int h, std::uint32_t format, std::uint32_t type, void* out, std::size_t outBytes) {
  if (format != GL_ALPHA && format != GL_RGB && format != GL_RGBA && format != GL_LUMINANCE && format != GL_LUMINANCE_ALPHA) return error(GL_INVALID_ENUM);
  switch (type) { case GL_UNSIGNED_BYTE: case GL_BYTE: case GL_SHORT: case GL_UNSIGNED_SHORT: case GL_INT: case GL_UNSIGNED_INT: case GL_FLOAT: case GL_UNSIGNED_SHORT_5_6_5: case GL_UNSIGNED_SHORT_4_4_4_4: case GL_UNSIGNED_SHORT_5_5_5_1: case 0x8D61: break; default: return error(GL_INVALID_ENUM); }   // 0x8D61: HALF_FLOAT_OES
  if (format != GL_RGBA || type != GL_UNSIGNED_BYTE) return error(GL_INVALID_OPERATION);   // the one combination every implementation reads
  if (w < 0 || h < 0) return error(GL_INVALID_VALUE);
  if (!framebufferReady()) return error(GL_INVALID_FRAMEBUFFER_OPERATION);
  if (outBytes < static_cast<std::size_t>(w) * h * 4) return error(GL_INVALID_OPERATION);
  glReadPixels(x, y, w, h, GL_RGBA, GL_UNSIGNED_BYTE, out);
}

}  // namespace zn::gl
