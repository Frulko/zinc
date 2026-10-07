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

using Id = std::uint32_t;   // 0: null object
struct UniformLoc { Id program = 0; int location = -1; std::uint32_t type = 0; int size = 0; bool valid() const { return program && location >= 0; } };

class WebGL1 {
 public:
  bool create(Api api, int width, int height, std::string& error);
  const Offscreen& target() const { return gl_; }

  // errors: the first error since the last call is kept (WebGL: one flag per error code, getError returns and clears one)
  std::uint32_t getError();
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

 private:
  struct Buf { std::uint32_t name = 0; std::int64_t size = 0; std::uint32_t target = 0; std::vector<std::uint8_t> shadow; };
  struct Shader { std::uint32_t name = 0, type = 0; std::string source, log; bool compiled = false; };
  struct Program { std::uint32_t name = 0; Id vs = 0, fs = 0; bool linked = false; std::string log; std::map<std::string, int> attribBindings; };
  struct Tex { std::uint32_t name = 0; int w = 0, h = 0; std::uint32_t format = 0; bool bound = false; };
  struct Fbo { std::uint32_t name = 0; Id color = 0; };
  struct Attrib { bool enabled = false; Id buffer = 0; int size = 4, stride = 0; std::uint32_t type = 0x1406; bool normalized = false; std::int64_t offset = 0; };

  void error(std::uint32_t code) { flags_ |= bit(code); }
  static unsigned bit(std::uint32_t code);
  bool checkDrawState(std::int64_t firstIndex, std::int64_t indexCount);   // program, attributes in range, framebuffer complete

  Offscreen gl_;
  std::uint32_t flags_ = 0;
  std::map<Id, Buf> buffers_;
  std::map<Id, Shader> shaders_;
  std::map<Id, Program> programs_;
  std::map<Id, Tex> textures_;
  std::map<Id, Fbo> fbos_;
  Id nextId_ = 1, arrayBuffer_ = 0, elementBuffer_ = 0, program_ = 0, tex2d_[8] = {}, fbo_ = 0;
  std::uint32_t activeUnit_ = 0;
  Attrib attribs_[16];
  int unpackAlignment_ = 4, maxTexSize_ = 0;
  std::uint32_t vao_ = 0;
};

}  // namespace zn::gl
