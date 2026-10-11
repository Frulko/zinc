// The GL replay's shaders on the GLES 2 floor (D29: GLSL ES 1.00, the Pi 3), checked without a device (ZN-581): each of the three programs of
// runtime/gl_replay_shaders.h, under the prelude display-gl gives them on GLES 2 (plugins/display-gl/src/display_gl.cpp zgl_program) and the
// defines the replay passes there, compiles and links as GLSL ES 1.00 by glslang with the WebGL 1 rules (Appendix A: loop and index limits).
#include <cstdio>
#include <string>

#include "gl/essl_check.h"

namespace glr {
#include "gl_replay_shaders.h"
}

int main() {
  // display_gl.cpp, zgl_program, not __APPLE__ (keep the two in step)
  const std::string pre_vs = "#version 100\n";
  const std::string pre_fs = "#version 100\n#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n";
  struct Program { const char *name, *vs, *fs; } programs[] = {{"commands", glr::VS, glr::FS}, {"occlusion", glr::SVS, glr::SFS}, {"stencil", glr::FVS, glr::FFS}};
  int bad = 0;
  for (const Program& p : programs) {   // GLES 2 has no instancing: the occlusion pass compiles without INSTANCED there (gl_replay.cpp init)
    const std::string vs = pre_vs + p.vs, fs = pre_fs + p.fs;
    std::string vpre, fpre, expanded;
    std::string log = zn::gl::esslValidate(vs, vpre, false, expanded);
    if (log.empty()) log = zn::gl::esslValidate(fs, fpre, true, expanded);
    if (log.empty()) log = zn::gl::esslLink(vs, vpre, fs, fpre);
    if (!log.empty()) { std::printf("%s: %s\n", p.name, log.c_str()); bad++; }
    else std::printf("%s: GLSL ES 1.00 ok\n", p.name);
  }
  return bad ? 1 : 0;
}
