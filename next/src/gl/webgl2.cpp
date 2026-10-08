// WebGL 2.0 additions on the shared core (ZN-203.05): vertex array objects, instancing, multiple render targets, uniform buffers, buffer copies, integer attributes.
// Textures 3D / arrays, samplers, queries, sync and transform feedback follow in ZN-203.07.
#include <algorithm>
#include <cstring>

#include "gl/webgl1.h"
#include "glad/gl.h"

namespace zn::gl {

// ---- vertex array objects: the attribute state and the ELEMENT_ARRAY_BUFFER binding move with the VAO
Id WebGL1::createVertexArray() {
  Vao v;
  glGenVertexArrays(1, &v.name);
  Id id = nextId_++;
  vaos_[id] = v;
  return id;
}
void WebGL1::deleteVertexArray(Id id) {
  auto it = vaos_.find(id);
  if (it == vaos_.end()) return;
  if (curVao_ == id) bindVertexArray(0);
  glDeleteVertexArrays(1, &it->second.name);
  vaos_.erase(it);
  releaseBuffers();
}
void WebGL1::bindVertexArray(Id id) {
  if (id && vaos_.find(id) == vaos_.end()) return error(GL_INVALID_OPERATION);
  if (id == curVao_) { if (id) vaos_[id].bound = true; return; }
  Vao& cur = curVao_ ? vaos_[curVao_] : defaultVao_;   // save what the bound VAO holds
  std::memcpy(cur.attribs, attribs_, sizeof attribs_);
  cur.element = elementBuffer_;
  Vao& next = id ? vaos_[id] : defaultVao_;
  std::memcpy(attribs_, next.attribs, sizeof attribs_);
  elementBuffer_ = next.element;
  curVao_ = id;
  if (id) next.bound = true;
  glBindVertexArray(id ? next.name : vao_);
  releaseBuffers();
}

// ---- instancing
void WebGL1::vertexAttribDivisor(std::uint32_t index, std::uint32_t divisor) {
  if (index >= kMaxVertexAttribs) return error(GL_INVALID_VALUE);
  attribs_[index].divisor = divisor;
  glVertexAttribDivisor(index, divisor);
}
void WebGL1::drawArraysInstanced(std::uint32_t mode, int first, int count, int instances) {
  if (mode > GL_TRIANGLE_FAN) return error(GL_INVALID_ENUM);
  if (first < 0 || count < 0 || instances < 0) return error(GL_INVALID_VALUE);
  if (!checkDrawState(first, static_cast<std::int64_t>(first) + count - 1, instances, true)) return;
  if (count == 0 || instances == 0) return;
  glDrawArraysInstanced(mode, first, count, instances);
}
void WebGL1::drawElementsInstanced(std::uint32_t mode, int count, std::uint32_t type, std::int64_t offset, int instances) {
  if (mode > GL_TRIANGLE_FAN) return error(GL_INVALID_ENUM);
  if (type != GL_UNSIGNED_BYTE && type != GL_UNSIGNED_SHORT && type != GL_UNSIGNED_INT) return error(GL_INVALID_ENUM);
  if (type == GL_UNSIGNED_INT && version_ != 2 && !extOn(Ext::IndexUint)) return error(GL_INVALID_ENUM);
  if (count < 0 || offset < 0 || instances < 0) return error(GL_INVALID_VALUE);
  const int ts = type == GL_UNSIGNED_BYTE ? 1 : type == GL_UNSIGNED_SHORT ? 2 : 4;
  if (offset % ts) return error(GL_INVALID_OPERATION);
  auto e = buffers_.find(elementBuffer_);
  if (e == buffers_.end()) return error(GL_INVALID_OPERATION);
  if (instances == 0 && version_ != 2) return;   // ANGLE_instanced_arrays: nothing is drawn, nothing is checked against the buffer
  if (count > 0 && offset + static_cast<std::int64_t>(count) * ts > e->second.size) return error(GL_INVALID_OPERATION);
  std::int64_t maxIndex = -1;
  for (int i = 0; i < count; ++i) {
    const std::uint8_t* p = e->second.shadow.data() + offset + static_cast<std::int64_t>(i) * ts;
    std::int64_t v = ts == 1 ? p[0] : ts == 2 ? (p[0] | (p[1] << 8)) : static_cast<std::int64_t>(p[0] | (p[1] << 8) | (p[2] << 16) | (static_cast<std::uint32_t>(p[3]) << 24));
    maxIndex = std::max(maxIndex, v);
  }
  if (!checkDrawState(0, maxIndex, instances, true)) return;
  if (count == 0 || instances == 0) return;
  glDrawElementsInstanced(mode, count, type, reinterpret_cast<const void*>(static_cast<std::intptr_t>(offset)), instances);
}
void WebGL1::drawRangeElements(std::uint32_t mode, std::uint32_t start, std::uint32_t end, int count, std::uint32_t type, std::int64_t offset) {
  if (end < start) return error(GL_INVALID_VALUE);
  drawElementsInstanced(mode, count, type, offset, 1);   // the range is a hint on a driver; the buffer was already scanned for its maximum index
}

// ---- multiple render targets
void WebGL1::drawBuffers(const std::uint32_t* bufs, int n) {
  if (n < 0 || n > 4) return error(GL_INVALID_VALUE);   // MAX_DRAW_BUFFERS is at least 4; reported as 4
  std::uint32_t mapped[4];
  if (!fbo_ && n != 1) return error(GL_INVALID_OPERATION);   // the canvas: exactly one buffer
  for (int i = 0; i < n; ++i) {
    if (!fbo_) {   // the canvas: exactly one buffer, BACK or NONE
      if (n != 1 || (bufs[i] != GL_BACK && bufs[i] != GL_NONE)) return error(GL_INVALID_OPERATION);
      mapped[i] = bufs[i] == GL_BACK ? GL_COLOR_ATTACHMENT0 : GL_NONE;
    } else {
      if (bufs[i] != GL_NONE && bufs[i] != GL_COLOR_ATTACHMENT0 + static_cast<std::uint32_t>(i)) return error(GL_INVALID_OPERATION);
      mapped[i] = bufs[i];
    }
  }
  std::uint32_t* dst = fbo_ ? fbos_[fbo_].draw : defaultDraw_;
  for (int i = 0; i < 4; ++i) dst[i] = i < n ? bufs[i] : GL_NONE;
  glDrawBuffers(n, mapped);
}
void WebGL1::readBuffer(std::uint32_t src) {
  if (!fboRead_) { if (src != GL_BACK && src != GL_NONE) return error(GL_INVALID_OPERATION); defaultRead_ = src; glReadBuffer(src == GL_BACK ? GL_COLOR_ATTACHMENT0 : GL_NONE); return; }
  if (src != GL_NONE && src != GL_BACK && (src < GL_COLOR_ATTACHMENT0 || src >= GL_COLOR_ATTACHMENT0 + 16)) return error(GL_INVALID_ENUM);
  if (src != GL_NONE && (src < GL_COLOR_ATTACHMENT0 || src >= GL_COLOR_ATTACHMENT0 + 4)) return error(GL_INVALID_OPERATION);
  fbos_[fboRead_].readBuffer = src;
  glReadBuffer(src);
}

// ---- uniform buffers and the other indexed targets
void WebGL1::bindBufferBase(std::uint32_t target, std::uint32_t index, Id id) {
  auto it = buffers_.find(id);
  if (id && (it == buffers_.end() || it->second.deleted)) return error(GL_INVALID_OPERATION);
  if (target == GL_TRANSFORM_FEEDBACK_BUFFER && tfActive()) return error(GL_INVALID_OPERATION);
  bindBufferRange(target, index, id, 0, id ? it->second.size : 0);
  auto x = indexed_.find(idxKey(target, index));
  if (x != indexed_.end() && x->second.buffer == id) { x->second.whole = true; applyIndexed(target, index); }
}   // size 0 for a buffer with no storage yet
void WebGL1::bindBufferRange(std::uint32_t target, std::uint32_t index, Id id, std::int64_t offset, std::int64_t size) {
  if (version_ != 2 || (target != GL_UNIFORM_BUFFER && target != GL_TRANSFORM_FEEDBACK_BUFFER)) return error(GL_INVALID_ENUM);
  if (index >= 24) return error(GL_INVALID_VALUE);
  if (offset < 0 || size < 0) return error(GL_INVALID_VALUE);
  if (target == GL_TRANSFORM_FEEDBACK_BUFFER && tfActive()) return error(GL_INVALID_OPERATION);   // the bindings are fixed while recording
  if (id) {
    auto it = buffers_.find(id);
    if (it == buffers_.end() || it->second.deleted) return error(GL_INVALID_OPERATION);
    if (it->second.target == GL_ELEMENT_ARRAY_BUFFER) return error(GL_INVALID_OPERATION);
    if (target == GL_UNIFORM_BUFFER) { GLint a = 0; glGetIntegerv(GL_UNIFORM_BUFFER_OFFSET_ALIGNMENT, &a); if (a > 0 && offset % a) return error(GL_INVALID_VALUE); }   // sizes are checked at draw time: an unallocated buffer can be bound
    it->second.target = GL_ARRAY_BUFFER;
  }
  indexed_[idxKey(target, index)] = Indexed{id, offset, size};
  otherBuffers_[target] = id;
  applyIndexed(target, index);
}
// glBindBufferRange rejects a range beyond the storage (or size 0); WebGL allows it, so bind the whole buffer then and re-apply after bufferData
void WebGL1::applyIndexed(std::uint32_t target, std::uint32_t index) {
  const Indexed& x = indexed_[idxKey(target, index)];
  auto it = buffers_.find(x.buffer);
  const std::uint32_t name = x.buffer && it != buffers_.end() ? it->second.name : 0;
  if (!name || x.whole || x.size == 0 || x.offset + x.size > it->second.size) glBindBufferBase(target, index, name);
  else glBindBufferRange(target, index, name, static_cast<GLintptr>(x.offset), static_cast<GLsizeiptr>(x.size));
}
std::uint32_t WebGL1::getUniformBlockIndex(Id pid, const std::string& name) {
  auto p = programs_.find(pid);
  if (p == programs_.end() || !p->second.linked) { error(GL_INVALID_OPERATION); return 0xFFFFFFFFu; }
  return glGetUniformBlockIndex(p->second.name, name.c_str());
}
void WebGL1::uniformBlockBinding(Id pid, std::uint32_t block, std::uint32_t binding) {
  auto p = programs_.find(pid);
  if (p == programs_.end()) return error(GL_INVALID_OPERATION);
  GLint n = 0;
  glGetProgramiv(p->second.name, GL_ACTIVE_UNIFORM_BLOCKS, &n);
  if (block >= static_cast<std::uint32_t>(n) || binding >= 24) return error(GL_INVALID_VALUE);
  glUniformBlockBinding(p->second.name, block, binding);
}
WebGL1::Param WebGL1::getActiveUniformBlockParameter(Id pid, std::uint32_t block, std::uint32_t pname) {
  Param r;
  auto p = programs_.find(pid);
  if (p == programs_.end()) { error(GL_INVALID_OPERATION); return r; }
  GLint n = 0;
  glGetProgramiv(p->second.name, GL_ACTIVE_UNIFORM_BLOCKS, &n);
  if (block >= static_cast<std::uint32_t>(n)) { error(GL_INVALID_VALUE); return r; }
  switch (pname) {
    case GL_UNIFORM_BLOCK_BINDING: case GL_UNIFORM_BLOCK_DATA_SIZE: case GL_UNIFORM_BLOCK_ACTIVE_UNIFORMS: case GL_UNIFORM_BLOCK_REFERENCED_BY_VERTEX_SHADER: case GL_UNIFORM_BLOCK_REFERENCED_BY_FRAGMENT_SHADER: {
      GLint v = 0;
      glGetActiveUniformBlockiv(p->second.name, block, pname, &v);
      r.ok = true;
      r.kind = pname == GL_UNIFORM_BLOCK_REFERENCED_BY_VERTEX_SHADER || pname == GL_UNIFORM_BLOCK_REFERENCED_BY_FRAGMENT_SHADER ? 'b' : 'i';
      r.v.push_back(v);
      return r;
    }
  }
  if (pname == GL_UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES) {
    GLint count = 0;
    glGetActiveUniformBlockiv(p->second.name, block, GL_UNIFORM_BLOCK_ACTIVE_UNIFORMS, &count);
    std::vector<GLint> idx(static_cast<std::size_t>(count));
    if (count) glGetActiveUniformBlockiv(p->second.name, block, pname, idx.data());
    r.ok = true; r.kind = 'U';
    for (GLint i : idx) r.v.push_back(i);
    return r;
  }
  error(GL_INVALID_ENUM);
  return r;
}
std::string WebGL1::getActiveUniformBlockName(Id pid, std::uint32_t block, bool& ok) {
  ok = false;
  auto p = programs_.find(pid);
  if (p == programs_.end() || !p->second.linked) { error(GL_INVALID_OPERATION); return ""; }
  GLint n = 0;
  glGetProgramiv(p->second.name, GL_ACTIVE_UNIFORM_BLOCKS, &n);
  if (block >= static_cast<std::uint32_t>(n)) { error(GL_INVALID_VALUE); return ""; }
  char buf[256];
  GLsizei len = 0;
  glGetActiveUniformBlockName(p->second.name, block, sizeof buf, &len, buf);
  ok = true;
  return std::string(buf, static_cast<std::size_t>(len));
}

// ---- buffer copies
void WebGL1::copyBufferSubData(std::uint32_t rt, std::uint32_t wt, std::int64_t ro, std::int64_t wo, std::int64_t size) {
  if (version_ != 2 || !bufferTargetOk(rt) || !bufferTargetOk(wt)) return error(GL_INVALID_ENUM);
  Id r = bufferSlot(rt), w = bufferSlot(wt);
  if (!r || !w) return error(GL_INVALID_OPERATION);
  Buf &rb = buffers_[r], &wb = buffers_[w];
  if (ro < 0 || wo < 0 || size < 0 || ro + size > rb.size || wo + size > wb.size) return error(GL_INVALID_VALUE);
  if (r == w && ro < wo + size && wo < ro + size) return error(GL_INVALID_VALUE);   // overlapping ranges of one buffer
  if ((rb.target == GL_ELEMENT_ARRAY_BUFFER) != (wb.target == GL_ELEMENT_ARRAY_BUFFER)) return error(GL_INVALID_OPERATION);
  std::memcpy(wb.shadow.data() + wo, rb.shadow.data() + ro, static_cast<std::size_t>(size));
  glCopyBufferSubData(rt, wt, static_cast<GLintptr>(ro), static_cast<GLintptr>(wo), static_cast<GLsizeiptr>(size));
}
void WebGL1::getBufferSubData(std::uint32_t target, std::int64_t src, void* dst, std::size_t dstBytes) {
  if (version_ != 2 || !bufferTargetOk(target)) return error(GL_INVALID_ENUM);
  Id id = bufferSlot(target);
  if (!id) return error(GL_INVALID_OPERATION);
  Buf& b = buffers_[id];
  if (tfActive()) for (auto& x : indexed_) if (static_cast<std::uint32_t>(x.first >> 32) == GL_TRANSFORM_FEEDBACK_BUFFER && idxCurrent(x.first) && x.second.buffer == id) return error(GL_INVALID_OPERATION);   // being written
  if (src < 0 || src + static_cast<std::int64_t>(dstBytes) > b.size) return error(GL_INVALID_VALUE);
  glGetBufferSubData(target, static_cast<GLintptr>(src), static_cast<GLsizeiptr>(dstBytes), dst);
}

// ---- unsigned and integer attributes
void WebGL1::uniformNui(const UniformLoc& l, int n, const std::uint32_t* v, std::size_t count) {
  if (!l.valid()) return;
  if (!program_ || l.program != program_ || stale(l)) return error(GL_INVALID_OPERATION);
  const std::uint32_t want = n == 1 ? GL_UNSIGNED_INT : n == 2 ? GL_UNSIGNED_INT_VEC2 : n == 3 ? GL_UNSIGNED_INT_VEC3 : GL_UNSIGNED_INT_VEC4;
  if (l.type != want) return error(GL_INVALID_OPERATION);
  if (count == 0 || count % n) return error(GL_INVALID_VALUE);
  const GLsizei k = static_cast<GLsizei>(count / n);
  if (n == 1) glUniform1uiv(l.location, k, v); else if (n == 2) glUniform2uiv(l.location, k, v); else if (n == 3) glUniform3uiv(l.location, k, v); else glUniform4uiv(l.location, k, v);
}
void WebGL1::vertexAttribIPointer(std::uint32_t index, int size, std::uint32_t type, int stride, std::int64_t offset) {
  if (version_ != 2) return error(GL_INVALID_OPERATION);
  if (index >= kMaxVertexAttribs || size < 1 || size > 4 || stride < 0 || stride > 255 || offset < 0) return error(GL_INVALID_VALUE);
  int ts = 0;
  switch (type) { case GL_BYTE: case GL_UNSIGNED_BYTE: ts = 1; break; case GL_SHORT: case GL_UNSIGNED_SHORT: ts = 2; break; case GL_INT: case GL_UNSIGNED_INT: ts = 4; break; default: return error(GL_INVALID_ENUM); }
  if (offset % ts || stride % ts) return error(GL_INVALID_OPERATION);
  if (!arrayBuffer_ && offset != 0) return error(GL_INVALID_OPERATION);
  Attrib& a = attribs_[index];
  a.buffer = arrayBuffer_; a.size = size; a.type = type; a.normalized = false; a.integer = true; a.stride = stride; a.offset = offset;
  glVertexAttribIPointer(index, size, type, stride, reinterpret_cast<const void*>(static_cast<std::intptr_t>(offset)));
}

}  // namespace zn::gl
