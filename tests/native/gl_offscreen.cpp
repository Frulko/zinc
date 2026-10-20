// ZN-203.01: an offscreen context of every API this machine offers, a shader with the D29 prelude, a triangle, and the pixels read back.
#include <cstdio>
#include <cstring>
#include <string>

#include "gl/offscreen.h"
#include "glad/gl.h"

static const char* kBody =
    "#if defined(ZN_ES2)\n#define IN attribute\n#define OUT varying\n#define FRAG_OUT\n#define FRAG_COLOR gl_FragColor\n"
    "#else\n#define IN in\n#define OUT out\n#endif\n";

static GLuint shader(GLenum type, const std::string& header, const char* src) {
  GLuint s = glCreateShader(type);
  std::string full = header + kBody + src;
  const char* p = full.c_str();
  glShaderSource(s, 1, &p, nullptr);
  glCompileShader(s);
  GLint ok = 0;
  glGetShaderiv(s, GL_COMPILE_STATUS, &ok);
  if (!ok) { char log[512]; glGetShaderInfoLog(s, sizeof log, nullptr, log); std::fprintf(stderr, "shader: %s\n", log); return 0; }
  return s;
}

static int g_created = 0;   // contexts this machine could create: at least one is required

static bool run(zn::gl::Api api, const char* name) {
  zn::gl::Offscreen gl;
  std::string err;
  if (!gl.create(api, 64, 64, false, err)) { std::printf("%-6s not available here: %s\n", name, err.c_str()); return true; }
  ++g_created;
  std::printf("%-6s %s | %s | %s\n", name, gl.info().version.c_str(), gl.info().renderer.c_str(), gl.info().vendor.c_str());
  const bool es2 = api == zn::gl::Api::Gles2;
  std::string head = api == zn::gl::Api::Gl33 ? "#version 330 core\n" : api == zn::gl::Api::Gles3 ? "#version 300 es\nprecision mediump float;\n" : "#version 100\nprecision mediump float;\n#define ZN_ES2 1\n";
  const char* vs = es2 ? "IN vec2 pos;\nvoid main() { gl_Position = vec4(pos, 0.0, 1.0); }\n" : "IN vec2 pos;\nvoid main() { gl_Position = vec4(pos, 0.0, 1.0); }\n";
  const char* fs = es2 ? "void main() { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }\n" : "out vec4 c;\nvoid main() { c = vec4(1.0, 0.0, 0.0, 1.0); }\n";
  GLuint v = shader(GL_VERTEX_SHADER, head, vs), f = shader(GL_FRAGMENT_SHADER, head, fs);
  if (!v || !f) return false;
  GLuint prog = glCreateProgram();
  glAttachShader(prog, v);
  glAttachShader(prog, f);
  glBindAttribLocation(prog, 0, "pos");
  glLinkProgram(prog);
  GLint ok = 0;
  glGetProgramiv(prog, GL_LINK_STATUS, &ok);
  if (!ok) { std::fprintf(stderr, "%s: link failed\n", name); return false; }
  if (api != zn::gl::Api::Gles2) { GLuint vao; glGenVertexArrays(1, &vao); glBindVertexArray(vao); }
  const float tri[] = {-1, -1, 3, -1, -1, 3};   // covers the whole 64x64 target
  GLuint vbo;
  glGenBuffers(1, &vbo);
  glBindBuffer(GL_ARRAY_BUFFER, vbo);
  glBufferData(GL_ARRAY_BUFFER, sizeof tri, tri, GL_STATIC_DRAW);
  glEnableVertexAttribArray(0);
  glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 0, nullptr);
  glClearColor(0, 0, 1, 1);
  glClear(GL_COLOR_BUFFER_BIT);
  glUseProgram(prog);
  glDrawArrays(GL_TRIANGLES, 0, 3);
  if (glGetError() != GL_NO_ERROR) { std::fprintf(stderr, "%s: GL error\n", name); return false; }
  std::vector<std::uint8_t> px = gl.read();
  const std::uint8_t* c = &px[(32 * 64 + 32) * 4];
  if (c[0] != 255 || c[1] != 0 || c[2] != 0 || c[3] != 255) { std::fprintf(stderr, "%s: centre pixel %d %d %d %d, want red\n", name, c[0], c[1], c[2], c[3]); return false; }
  if (!gl.hasExtension("GL_ARB_vertex_array_object") && api == zn::gl::Api::Gl33) std::printf("%-6s (no GL_ARB_vertex_array_object listed: core profile has it built in)\n", name);
  std::printf("%-6s triangle ok\n", name);
  return true;
}

int main() {
  bool ok = run(zn::gl::Api::Gl33, "gl33");
  ok = run(zn::gl::Api::Gles3, "gles3") && ok;
  ok = run(zn::gl::Api::Gles2, "gles2") && ok;
  if (!g_created) { std::puts("gl_offscreen: no OpenGL context could be created (needs a display session)"); ok = false; }
  std::puts(ok ? "gl_offscreen: ok" : "gl_offscreen: FAILED");
  return ok ? 0 : 1;
}
