// The GL replay's shaders on the GLES 2 floor (D29: GLSL ES 1.00, the Pi 3), checked without a device (ZN-581): each program of
// runtime/gl_replay_shaders.h, under the prelude display-gl gives them on GLES 2 (plugins/display-gl/src/display_gl.cpp zgl_program),
// compiles and links as GLSL ES 1.00 by glslang with the WebGL 1 rules (Appendix A: loop and index limits). On GLES 2 the commands are
// drawn by one program per mode, with and without the gradient paint block (ZN-725, gl_replay.cpp use_prog): every one of them is
// checked, and the program of desktop GL that holds every mode too.
#include <cstdio>
#include <string>
#include <vector>

#include "gl/essl_check.h"

namespace glr {
#include "gl_replay_shaders.h"
}

int main() {
  // display_gl.cpp, zgl_program, not __APPLE__ (keep the two in step)
  const std::string pre_vs = "#version 100\n";
  const std::string pre_fs = "#version 100\n#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n";
  struct Program { std::string name, vs, fs; };
  // GLES 2 has no instancing: the occlusion pass compiles without INSTANCED there (gl_replay.cpp init)
  std::vector<Program> programs = {{"occlusion", glr::SVS, glr::SFS}, {"stencil", glr::FVS, glr::FFS}};
  static char fs[8192];   // the size gl_replay.cpp gives fs_source
  int bad = 0;
  for (int mode = -1; mode < glr::MODES; mode++)
    for (int paint = 0; paint < 2; paint++) {
      const std::string name = (mode < 0 ? "every mode" : "mode " + std::to_string(mode)) + (paint ? " with paint" : "");
      if (glr::fs_source(mode < 0 ? ~0u : 1u << mode, paint, fs, sizeof fs)) programs.push_back({name, glr::VS, fs});
      else { std::printf("%s: the source does not fit the replay's buffer\n", name.c_str()); bad++; }
    }
  for (const Program& p : programs) {
    const std::string vs = pre_vs + p.vs, fs = pre_fs + p.fs;
    std::string vpre, fpre, expanded;
    std::string log = zn::gl::esslValidate(vs, vpre, false, expanded);
    if (log.empty()) log = zn::gl::esslValidate(fs, fpre, true, expanded);
    if (log.empty()) log = zn::gl::esslLink(vs, vpre, fs, fpre);
    if (!log.empty()) { std::printf("%s: %s\n", p.name.c_str(), log.c_str()); bad++; }
  }
  if (!bad) std::printf("%zu programs: GLSL ES 1.00 ok\n", programs.size());
  return bad ? 1 : 0;
}
