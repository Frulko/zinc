#pragma once
#include "gpu_sdl.h"
#include <stdio.h>
#include <string.h>
#ifdef __APPLE__
#include <OpenGL/gl3.h>
static bool gpuLoadApi() { return true; }
#else
#define GLAD_API_CALL static __attribute__((unused))
#include <glad/gl.h>
#define ZN_3D_GL_FUNCTIONS(X) X(AttachShader) \
  X(BindAttribLocation) \
  X(BindBuffer) \
  X(BindFramebuffer) \
  X(BindRenderbuffer) \
  X(BindTexture) \
  X(BindVertexArray) \
  X(BlendFunc) \
  X(BlitFramebuffer) \
  X(BufferData) \
  X(CheckFramebufferStatus) \
  X(Clear) \
  X(ClearColor) \
  X(ColorMask) \
  X(CompileShader) \
  X(CreateProgram) \
  X(CreateShader) \
  X(CullFace) \
  X(DeleteBuffers) \
  X(DeleteFramebuffers) \
  X(DeleteProgram) \
  X(DeleteRenderbuffers) \
  X(DeleteShader) \
  X(DeleteTextures) \
  X(DeleteVertexArrays) \
  X(DepthFunc) \
  X(DepthMask) \
  X(Disable) \
  X(DrawElements) \
  X(Enable) \
  X(EnableVertexAttribArray) \
  X(Flush) \
  X(FramebufferRenderbuffer) \
  X(FramebufferTexture2D) \
  X(FrontFace) \
  X(GenBuffers) \
  X(GenFramebuffers) \
  X(GenRenderbuffers) \
  X(GenTextures) \
  X(GenVertexArrays) \
  X(GenerateMipmap) \
  X(GetIntegerv) \
  X(GetProgramInfoLog) \
  X(GetProgramiv) \
  X(GetShaderInfoLog) \
  X(GetShaderiv) \
  X(GetString) \
  X(GetUniformLocation) \
  X(LinkProgram) \
  X(MapBufferRange) \
  X(PixelStorei) \
  X(ReadPixels) \
  X(RenderbufferStorage) \
  X(RenderbufferStorageMultisample) \
  X(ShaderSource) \
  X(TexImage2D) \
  X(TexParameteri) \
  X(Uniform1f) \
  X(Uniform1i) \
  X(Uniform2f) \
  X(Uniform3f) \
  X(Uniform3fv) \
  X(UniformMatrix4fv) \
  X(UnmapBuffer) \
  X(UseProgram) \
  X(VertexAttribPointer) \
  X(Viewport)
static bool gpuLoadApi() {
  const auto getString = (PFNGLGETSTRINGPROC)sdl.GL_GetProcAddress("glGetString");
  const char* version = getString ? (const char*)getString(GL_VERSION) : nullptr;
  int major = 0, minor = 0;
  if (!version || sscanf(version, "OpenGL ES %d.%d", &major, &minor) != 2 || major < 3) return false;
  bool ok = true;
#define ZN_3D_LOAD(name) ok = (glad_gl##name = (decltype(glad_gl##name))sdl.GL_GetProcAddress("gl" #name)) != nullptr && ok;
  ZN_3D_GL_FUNCTIONS(ZN_3D_LOAD)
#undef ZN_3D_LOAD
  if (!ok) {
#define ZN_3D_CLEAR(name) glad_gl##name = nullptr;
    ZN_3D_GL_FUNCTIONS(ZN_3D_CLEAR)
#undef ZN_3D_CLEAR
  }
  return ok;
}
#endif
