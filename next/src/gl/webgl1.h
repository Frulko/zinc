// WebGL 1.0 semantics on the loader of ZN-203.01 (ZN-203.02): objects as ids that are never GL names, the error flags of the WebGL spec, and the restrictions WebGL puts on top of
// GLES2 / desktop GL 3.3 core (no client-side arrays, attribute ranges checked before a draw, format/type tables, framebuffer completeness, one error per call).
// The JS binding (ZN-203.03) is a thin layer over this class; validation lives here, once.
#pragma once
#include <cstdint>
#include <map>
#include <string>
#include <vector>

#include "gl/offscreen.h"

namespace zn::gl {
/** Every sampler type of GLSL ES 3.00 (WebGL 2 adds 3D, array, shadow and integer samplers): such a uniform takes a texture unit through uniform1i / uniform1iv. */
inline bool isSamplerType(std::uint32_t t) {
  return t == 0x8B5E || t == 0x8B5F || t == 0x8B60 || t == 0x8B62 || t == 0x8DC1 || t == 0x8DC4 || t == 0x8DC5 || (t >= 0x8DCA && t <= 0x8DCC) || t == 0x8DCF || (t >= 0x8DD2 && t <= 0x8DD4) || t == 0x8DD7;
}


using Id = std::uint32_t;   // 0: null object
bool formatType(std::uint32_t format, std::uint32_t type, int& bpp);   // texImage2D's (format, type) table
constexpr int kMaxVertexAttribs = 16;
struct UniformLoc { Id program = 0; int location = -1; std::uint32_t type = 0; int size = 0; bool valid() const { return program && location >= 0; } };

class WebGL1 {
 public:
  struct Param;     // defined with the queries further down
  struct Active;
  bool create(Api api, int width, int height, std::string& error, int version = 1);   // version 2: WebGL 2.0 (needs GL 3.3 core or GLES3)
  int version() const { return version_; }
  const Offscreen& target() const { return gl_; }

  // errors: the first error since the last call is kept (WebGL: one flag per error code, getError returns and clears one)
  std::uint32_t getError();
  void raise(std::uint32_t code) { error(code); }   // for the binding layer: wrong-context objects and the like
  void setAttributes(bool depth, bool stencil) { depthAttr_ = depth; stencilAttr_ = stencil; }
  Param getFramebufferAttachmentParameter(std::uint32_t target, std::uint32_t attachment, std::uint32_t pname);
  Param getIndexedParameter(std::uint32_t target, std::uint32_t index);
  std::vector<std::uint32_t> getUniformIndices(Id p, const std::vector<std::string>& names);
  Param getActiveUniforms(Id p, const std::vector<std::uint32_t>& indices, std::uint32_t pname, bool& ok);
  void uniformMatrixRC(const UniformLoc& l, int cols, int rows, bool transpose, const float* v, std::size_t count);
  void vertexAttribINi(std::uint32_t index, const int* v);
  void vertexAttribINui(std::uint32_t index, const std::uint32_t* v);
  std::int64_t attribOffset(std::uint32_t index) const { return index < 16 ? attribs_[index].offset : 0; }
  bool shaderQueryOk(Id s, std::uint32_t pname);   // getShaderParameter's pname check (INVALID_ENUM)
  // state
  void enable(std::uint32_t cap);
  void disable(std::uint32_t cap);
  void viewport(int x, int y, int w, int h);
  void scissor(int x, int y, int w, int h);
  void clearColor(float r, float g, float b, float a);
  void clear(std::uint32_t mask);
  void pixelStorei(std::uint32_t pname, int value);
  // buffers
  Id createBuffer();
  void deleteBuffer(Id b);
  bool isBuffer(Id b) const;
  bool isDeletedShader(Id s) const { auto it = shaders_.find(s); return it != shaders_.end() && it->second.deleted; }
  bool isDeletedProgram(Id p) const { auto it = programs_.find(p); return it != programs_.end() && it->second.deleted; }
  void bindBuffer(std::uint32_t target, Id b);
  void bufferData(std::uint32_t target, std::int64_t size, const void* data, std::uint32_t usage);   // data null: allocate size zeroed bytes
  void bufferSubData(std::uint32_t target, std::int64_t offset, std::int64_t size, const void* data);
  // shaders and programs
  Id createShader(std::uint32_t type);
  void shaderSource(Id s, const std::string& src);
  void compileShader(Id s);
  bool shaderCompiled(Id s) const;
  std::string shaderInfoLog(Id s) const;
  Id createProgram();
  void attachShader(Id p, Id s);
  void bindAttribLocation(Id p, std::uint32_t index, const std::string& name);
  void linkProgram(Id p);
  bool programLinked(Id p) const;
  std::string programInfoLog(Id p) const;
  void useProgram(Id p);
  int getAttribLocation(Id p, const std::string& name);
  UniformLoc getUniformLocation(Id p, const std::string& name);
  void uniform1f(const UniformLoc& l, float x);
  void uniform2f(const UniformLoc& l, float x, float y);
  void uniform4f(const UniformLoc& l, float x, float y, float z, float w);
  void uniform1i(const UniformLoc& l, int x);
  void uniformMatrix4fv(const UniformLoc& l, bool transpose, const float* v, std::size_t n);
  // vertex arrays
  void enableVertexAttribArray(std::uint32_t index);
  void disableVertexAttribArray(std::uint32_t index);
  void vertexAttribPointer(std::uint32_t index, int size, std::uint32_t type, bool normalized, int stride, std::int64_t offset);
  void drawArrays(std::uint32_t mode, int first, int count);
  void drawElements(std::uint32_t mode, int count, std::uint32_t type, std::int64_t offset);
  // ---- WebGL 2.0 (webgl2.cpp)
  Id createVertexArray();
  void deleteVertexArray(Id v);
  void bindVertexArray(Id v);
  bool isVertexArray(Id v) const { return vaos_.count(v) != 0 && vaos_.at(v).bound; }
  void vertexAttribDivisor(std::uint32_t index, std::uint32_t divisor);
  void drawArraysInstanced(std::uint32_t mode, int first, int count, int instances);
  void drawElementsInstanced(std::uint32_t mode, int count, std::uint32_t type, std::int64_t offset, int instances);
  void drawRangeElements(std::uint32_t mode, std::uint32_t start, std::uint32_t end, int count, std::uint32_t type, std::int64_t offset);
  void drawBuffers(const std::uint32_t* bufs, int n);
  void readBuffer(std::uint32_t src);
  void bindBufferBase(std::uint32_t target, std::uint32_t index, Id b);
  void bindBufferRange(std::uint32_t target, std::uint32_t index, Id b, std::int64_t offset, std::int64_t size);
  std::uint32_t getUniformBlockIndex(Id p, const std::string& name);   // 0xFFFFFFFF: INVALID_INDEX
  void uniformBlockBinding(Id p, std::uint32_t block, std::uint32_t binding);
  Param getActiveUniformBlockParameter(Id p, std::uint32_t block, std::uint32_t pname);
  std::string getActiveUniformBlockName(Id p, std::uint32_t block);
  void copyBufferSubData(std::uint32_t readTarget, std::uint32_t writeTarget, std::int64_t readOffset, std::int64_t writeOffset, std::int64_t size);
  void getBufferSubData(std::uint32_t target, std::int64_t srcOffset, void* dst, std::size_t dstBytes);
  void uniformNui(const UniformLoc& l, int n, const std::uint32_t* v, std::size_t count);
  void vertexAttribIPointer(std::uint32_t index, int size, std::uint32_t type, int stride, std::int64_t offset);
  // ---- WebGL 2.0 textures, samplers, queries, sync, transform feedback, blits (webgl2_tex.cpp)
  void texImage3D(std::uint32_t target, int level, std::uint32_t internalformat, int width, int height, int depth, int border, std::uint32_t format, std::uint32_t type, const void* data, std::size_t dataBytes);
  void texSubImage3D(std::uint32_t target, int level, int xoff, int yoff, int zoff, int width, int height, int depth, std::uint32_t format, std::uint32_t type, const void* data, std::size_t dataBytes);
  void texStorage2D(std::uint32_t target, int levels, std::uint32_t internalformat, int width, int height);
  void texStorage3D(std::uint32_t target, int levels, std::uint32_t internalformat, int width, int height, int depth);
  void copyTexSubImage3D(std::uint32_t target, int level, int xoff, int yoff, int zoff, int x, int y, int width, int height);
  Id createSampler();
  void deleteSampler(Id s);
  bool isSampler(Id s) const { auto it = samplers_.find(s); return it != samplers_.end() && it->second.bound; }
  void bindSampler(std::uint32_t unit, Id s);
  void samplerParameteri(Id s, std::uint32_t pname, int v);
  void samplerParameterf(Id s, std::uint32_t pname, float v);
  Param getSamplerParameter(Id s, std::uint32_t pname);
  Id createQuery();
  void deleteQuery(Id q);
  bool isQuery(Id q) const { auto it = queries_.find(q); return it != queries_.end() && it->second.used; }
  void beginQuery(std::uint32_t target, Id q);
  void endQuery(std::uint32_t target);
  Param getQuery(std::uint32_t target, std::uint32_t pname);
  Param getQueryParameter(Id q, std::uint32_t pname);
  Id fenceSync(std::uint32_t condition, std::uint32_t flags);
  bool isSync(Id s) const { return syncs_.count(s) != 0; }
  void deleteSync(Id s);
  std::uint32_t clientWaitSync(Id s, std::uint32_t flags, double timeoutNs);
  void waitSync(Id s, std::uint32_t flags, std::int64_t timeout);
  Param getSyncParameter(Id s, std::uint32_t pname);
  Id createTransformFeedback();
  void deleteTransformFeedback(Id t);
  bool isTransformFeedback(Id t) const { auto it = tfs_.find(t); return it != tfs_.end() && it->second.bound; }
  void bindTransformFeedback(std::uint32_t target, Id t);
  void beginTransformFeedback(std::uint32_t primitiveMode);
  void endTransformFeedback();
  void pauseTransformFeedback();
  void resumeTransformFeedback();
  void transformFeedbackVaryings(Id p, const std::vector<std::string>& names, std::uint32_t bufferMode);
  Active getTransformFeedbackVarying(Id p, std::uint32_t index);
  void blitFramebuffer(int sx0, int sy0, int sx1, int sy1, int dx0, int dy0, int dx1, int dy1, std::uint32_t mask, std::uint32_t filter);
  void renderbufferStorageMultisample(std::uint32_t target, int samples, std::uint32_t internalformat, int width, int height);
  void clearBufferfv(std::uint32_t buffer, int drawbuffer, const float* v, std::size_t n);
  void clearBufferiv(std::uint32_t buffer, int drawbuffer, const int* v, std::size_t n);
  void clearBufferuiv(std::uint32_t buffer, int drawbuffer, const std::uint32_t* v, std::size_t n);
  void clearBufferfi(std::uint32_t buffer, int drawbuffer, float depth, int stencil);
  void invalidateFramebuffer(std::uint32_t target, const std::uint32_t* attachments, int n);
  void framebufferTextureLayer(std::uint32_t target, std::uint32_t attachment, Id tex, int level, int layer);
  int getFragDataLocation(Id p, const std::string& name);
  std::vector<int> getInternalformatParameter(std::uint32_t target, std::uint32_t internalformat, std::uint32_t pname);
  // textures
  Id createTexture();
  void deleteTexture(Id t);
  void bindTexture(std::uint32_t target, Id t);
  void activeTexture(std::uint32_t unit);
  void texImage2D(std::uint32_t target, int level, std::uint32_t internalformat, int width, int height, int border, std::uint32_t format, std::uint32_t type, const void* data, std::size_t dataBytes);
  void texParameteri(std::uint32_t target, std::uint32_t pname, int value);
  // framebuffers and renderbuffers
  Id createFramebuffer();
  void bindFramebuffer(std::uint32_t target, Id f);
  void framebufferTexture2D(std::uint32_t target, std::uint32_t attachment, std::uint32_t textarget, Id tex, int level);
  std::uint32_t checkFramebufferStatus(std::uint32_t target);
  void readPixels(int x, int y, int w, int h, std::uint32_t format, std::uint32_t type, void* out, std::size_t outBytes);
  Id createRenderbuffer();
  void deleteRenderbuffer(Id r);
  void bindRenderbuffer(std::uint32_t target, Id r);
  void renderbufferStorage(std::uint32_t target, std::uint32_t internalformat, int width, int height);
  void framebufferRenderbuffer(std::uint32_t target, std::uint32_t attachment, std::uint32_t rbtarget, Id rb);
  void deleteFramebuffer(Id f);
  // more state (pass-through with the spec's enum and range checks)
  void blendColor(float r, float g, float b, float a);
  void blendEquation(std::uint32_t mode);
  void blendEquationSeparate(std::uint32_t rgb, std::uint32_t a);
  void blendFunc(std::uint32_t s, std::uint32_t d);
  void blendFuncSeparate(std::uint32_t srgb, std::uint32_t drgb, std::uint32_t sa, std::uint32_t da);
  void clearDepth(float d);
  void clearStencil(int s);
  void colorMask(bool r, bool g, bool b, bool a);
  void cullFace(std::uint32_t mode);
  void depthFunc(std::uint32_t f);
  void depthMask(bool m);
  void depthRange(float n, float f);
  void frontFace(std::uint32_t mode);
  void hint(std::uint32_t target, std::uint32_t mode);
  void lineWidth(float w);
  void polygonOffset(float factor, float units);
  void sampleCoverage(float v, bool invert);
  void stencilFunc(std::uint32_t f, int ref, std::uint32_t mask);
  void stencilFuncSeparate(std::uint32_t face, std::uint32_t f, int ref, std::uint32_t mask);
  void stencilMask(std::uint32_t mask);
  void stencilMaskSeparate(std::uint32_t face, std::uint32_t mask);
  void stencilOp(std::uint32_t fail, std::uint32_t zfail, std::uint32_t zpass);
  void stencilOpSeparate(std::uint32_t face, std::uint32_t fail, std::uint32_t zfail, std::uint32_t zpass);
  void flush();
  void finish();
  // queries
  bool isEnabled(std::uint32_t cap);
  std::vector<Id> attachedShaders(Id p) const { std::vector<Id> r; auto it = programs_.find(p); if (it != programs_.end()) { if (it->second.vs) r.push_back(it->second.vs); if (it->second.fs) r.push_back(it->second.fs); } return r; }
  bool isShader(Id id) const { return shaders_.count(id) != 0; }
  bool isProgram(Id id) const { return programs_.count(id) != 0; }
  bool isTexture(Id id) const { return textures_.count(id) != 0 && textures_.at(id).bound; }
  bool isFramebuffer(Id id) const { auto it = fbos_.find(id); return it != fbos_.end() && it->second.bound; }
  bool isRenderbuffer(Id id) const { auto it = rbos_.find(id); return it != rbos_.end() && it->second.bound; }
  std::string shaderSourceOf(Id s) const;
  std::uint32_t shaderTypeOf(Id s) const;
  void deleteShader(Id s);
  void deleteProgram(Id p);
  void detachShader(Id p, Id s);
  void validateProgram(Id p);
  struct Active { std::string name; int size = 0; std::uint32_t type = 0; bool ok = false; };
  Active getActiveUniform(Id p, std::uint32_t index);
  Active getActiveAttrib(Id p, std::uint32_t index);
  int programParameter(Id p, std::uint32_t pname, bool& ok);   // ACTIVE_UNIFORMS, ACTIVE_ATTRIBUTES, ATTACHED_SHADERS, DELETE/LINK/VALIDATE_STATUS
  /** getParameter for the pnames WebGL1 defines that have a plain number / numbers / string value; ok false: INVALID_ENUM was set (or the value is an object: kind 'o'). */
  struct Param { char kind = 0; std::vector<double> v; std::string s; Id object = 0; int objKind = 0; bool ok = false; };   // kind: b bool, i int, f float, a array (v), s string, o object, n null
  Param getParameter(std::uint32_t pname);
  Param getVertexAttrib(std::uint32_t index, std::uint32_t pname);
  Param getBufferParameter(std::uint32_t target, std::uint32_t pname);
  Param getTexParameter(std::uint32_t target, std::uint32_t pname);
  Param getUniform(Id p, const UniformLoc& l);
  void getShaderPrecisionFormat(std::uint32_t shadertype, std::uint32_t precisiontype, int out[3]);
  // more uniforms, attributes, textures
  void uniform3f(const UniformLoc& l, float x, float y, float z);
  void uniform2i(const UniformLoc& l, int x, int y);
  void uniform3i(const UniformLoc& l, int x, int y, int z);
  void uniform4i(const UniformLoc& l, int x, int y, int z, int w);
  void uniformNfv(const UniformLoc& l, int n, const float* v, std::size_t count);   // uniform1fv..4fv
  void uniformNiv(const UniformLoc& l, int n, const int* v, std::size_t count);     // uniform1iv..4iv
  void uniformMatrixNfv(const UniformLoc& l, int n, bool transpose, const float* v, std::size_t count);   // 2, 3, 4
  void vertexAttribNf(std::uint32_t index, int n, const float* v);
  void texSubImage2D(std::uint32_t target, int level, int xoff, int yoff, int width, int height, std::uint32_t format, std::uint32_t type, const void* data, std::size_t dataBytes);
  void copyTexImage2D(std::uint32_t target, int level, std::uint32_t internalformat, int x, int y, int width, int height, int border);
  void copyTexSubImage2D(std::uint32_t target, int level, int xoff, int yoff, int x, int y, int width, int height);
  void generateMipmap(std::uint32_t target);

 private:
  struct Buf { std::uint32_t name = 0; std::int64_t size = 0; std::uint32_t target = 0; bool bound = false; std::vector<std::uint8_t> shadow; };
  struct Shader { std::uint32_t name = 0, type = 0; std::string source, log; bool compiled = false, deleted = false; int attached = 0; };
  struct Program { std::uint32_t name = 0; Id vs = 0, fs = 0; bool linked = false, deleted = false; std::string log; std::map<std::string, int> attribBindings; };
  struct Tex { std::uint32_t name = 0; int w = 0, h = 0, d = 0; std::uint32_t format = 0, target = 0; bool bound = false, immutable = false; int levels = 0; };
  struct Sampler { std::uint32_t name = 0; bool bound = false; };
  struct Query { std::uint32_t name = 0; std::uint32_t target = 0; bool active = false, used = false; };
  struct TransformFeedback { std::uint32_t name = 0; bool bound = false; bool active = false, paused = false; };
  struct Fbo { std::uint32_t name = 0; Id color = 0; bool bound = false; std::uint32_t readBuffer = 0x8CE0, draw[4] = {0x8CE0, 0, 0, 0}; };   // 0x8CE0: COLOR_ATTACHMENT0
  struct Rbo { std::uint32_t name = 0; int w = 0, h = 0; std::uint32_t format = 0; bool bound = false; };
  struct Attrib { bool enabled = false; Id buffer = 0; int size = 4, stride = 0; std::uint32_t type = 0x1406; bool normalized = false, integer = false; std::int64_t offset = 0; std::uint32_t divisor = 0; };
  struct Vao { std::uint32_t name = 0; Attrib attribs[16]; Id element = 0; bool bound = false; };

  void error(std::uint32_t code) { flags_ |= bit(code); }
  static unsigned bit(std::uint32_t code);
  Id& boundTex(std::uint32_t target);   // the texture bound to `target` on the active unit
  bool uploadTexture(bool isStorage, std::uint32_t target, int level, std::uint32_t internalformat, int w, int h, int d, std::uint32_t format, std::uint32_t type, const void* data, std::size_t dataBytes, int xoff, int yoff, int zoff, bool sub);
  bool checkDrawState(std::int64_t firstIndex, std::int64_t lastIndex, std::int64_t instances = 1);
  bool bufferTargetOk(std::uint32_t t) const;
  Id& bufferSlot(std::uint32_t t);   // program, attributes in range, framebuffer complete

  Offscreen gl_;
  std::uint32_t flags_ = 0;
  std::map<Id, Buf> buffers_;
  std::map<Id, Shader> shaders_;
  std::map<Id, Program> programs_;
  std::map<Id, Tex> textures_;
  std::map<Id, Fbo> fbos_;
  std::map<Id, Rbo> rbos_;
  std::map<Id, Vao> vaos_;
  std::map<Id, Sampler> samplers_;
  std::map<Id, Query> queries_;
  std::map<Id, TransformFeedback> tfs_;
  std::map<Id, void*> syncs_;   // GLsync objects
  std::map<std::uint32_t, Id> activeQuery_;   // target -> the query in flight
  Vao defaultVao_;                       // the state of the VAO 0 while another VAO is bound
  Id curVao_ = 0;
  std::map<std::uint32_t, Id> otherBuffers_;   // WebGL 2 targets other than ARRAY / ELEMENT_ARRAY
  struct Indexed { Id buffer = 0; std::int64_t offset = 0, size = 0; };
  std::map<std::uint64_t, Indexed> indexed_;   // (target, index) -> UNIFORM_BUFFER / TRANSFORM_FEEDBACK_BUFFER bindings
  int version_ = 1;
  bool depthAttr_ = true, stencilAttr_ = false;   // the context attributes: what DEPTH_BITS and STENCIL_BITS report
  std::uint32_t defaultRead_ = 0x0405, defaultDraw_[4] = {0x0405, 0, 0, 0};   // BACK; NONE for the others
  int uniformAlignment_ = 256;
  Id nextId_ = 1, arrayBuffer_ = 0, elementBuffer_ = 0, program_ = 0, tex2d_[32] = {}, texCube_[32] = {}, tex3d_[32] = {}, texArr_[32] = {}, samplerUnit_[32] = {}, fbo_ = 0, fboRead_ = 0, rbo_ = 0, tf_ = 0, tfUnbound_ = 0;
  std::uint32_t activeUnit_ = 0;
  Attrib attribs_[16];
  int unpackAlignment_ = 4, maxTexSize_ = 0;
  std::uint32_t mipmapHint_ = 0x1100;   // DONT_CARE
  int unpackFlipY_ = 0, unpackPremultiply_ = 0, unpackColorspace_ = 0x9244;   // the WEBGL pixel-store state, applied by the binding on image sources
  std::uint32_t vao_ = 0;
};

}  // namespace zn::gl
