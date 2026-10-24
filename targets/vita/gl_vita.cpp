// PS Vita GPU path through vitaGL (third_party/vitagl, LGPL-3.0; built with -DZN_VITA_GL=ON instead of gxm_vita.cpp): the zinc:gfx command
// lists replayed by the GLES 2 replay the other GLES 2 devices use (runtime/gl_replay.cpp), so rounded boxes, borders, gradients, shadows,
// paths and turned commands are drawn by the GPU too, where the GXM replay falls back to the software raster. vitaGL compiles the replay's
// GLSL at run time with the console's SceShaccCg: the user extracts ur0:data/libshacccg.suprx once (docs/targets/handhelds.md); without it
// zn_gxm_init answers false and the HAL keeps the software raster. Same entry points as gxm_vita.cpp, so hal_vita.cpp does not change.
#include <vitaGL.h>
#include <psp2/kernel/processmgr.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "hal.h"
#include "zrt_raster.h"

extern "C" void zn_vita_log(const char* line);                       // hal_vita.cpp
extern "C" GLboolean start_shader_compiler(void);                     // vitaGL (custom_shaders.c): loads SceShaccCg, false without it
extern "C" void zrt_prof_band(int32_t band, uint64_t t0, uint64_t t1);  // runtime/gfx.cpp

extern "C" GLuint zgl_program(const char* defines, const char* vs, const char* fs) {
  static const char* pre_vs = "#version 100\n";
  static const char* pre_fs = "#version 100\nprecision highp float;\n";
  GLuint p = glCreateProgram();
  const char* src[2][3] = {{pre_vs, defines, vs}, {pre_fs, defines, fs}};
  for (int i = 0; i < 2; i++) {
    GLuint s = glCreateShader(i ? GL_FRAGMENT_SHADER : GL_VERTEX_SHADER);
    glShaderSource(s, 3, src[i], nullptr);
    glCompileShader(s);
    GLint ok = 0;
    glGetShaderiv(s, GL_COMPILE_STATUS, &ok);
    if (!ok) {
      char log[1024], line[1100];
      glGetShaderInfoLog(s, sizeof log, nullptr, log);
      snprintf(line, sizeof line, "vita gl: shader: %s\n", log);
      zn_vita_log(line);
      glDeleteShader(s); glDeleteProgram(p);
      return 0;
    }
    glAttachShader(p, s);
    glDeleteShader(s);
  }
  static const char* const attrs[] = {"a_pos", "a_uv", "a_box", "a_par", "a_c1", "a_c2", "a_z"};   // gl_replay.cpp's one vertex layout
  for (GLuint i = 0; i < 7; i++) glBindAttribLocation(p, i, attrs[i]);
  glLinkProgram(p);
  GLint ok = 0;
  glGetProgramiv(p, GL_LINK_STATUS, &ok);
  if (!ok) { zn_vita_log("vita gl: a program does not link\n"); glDeleteProgram(p); return 0; }
  return p;
}

#define GLR_CORE 0
#include "gl_replay.cpp"

namespace {
constexpr int32_t kW = 960, kH = 544;
uint32_t shown, next_stats = 600;   // frames presented (replayed or not): the stats line goes with the HAL's, every 600
bool ready, scaled;   // scaled: the surface is not the screen's (480x272 doubled), drawn into the replay's texture, then shown by one quad
GLuint blitProg, blitVbo;
GLint blitUv;
const char* BLIT_VS = "attribute vec2 a_pos; varying vec2 v_uv; uniform vec2 u_uv;\n"
  "void main() { v_uv = a_pos * u_uv; gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0); }\n";
const char* BLIT_FS = "varying vec2 v_uv; uniform sampler2D u_tex; void main() { gl_FragColor = texture2D(u_tex, v_uv); }\n";

void blit(int32_t w, int32_t h) {
  int32_t tw, th;
  glr::texture_size(&tw, &th);
  const int32_t k = kW / w < kH / h ? kW / w : kH / h;
  glBindFramebuffer(GL_FRAMEBUFFER, 0);
  glViewport((kW - w * k) / 2, (kH - h * k) / 2, w * k, h * k);
  glClearColor(0, 0, 0, 1);
  glClear(GL_COLOR_BUFFER_BIT);
  glDisable(GL_BLEND);
  glUseProgram(blitProg);
  glUniform2f(blitUv, (float)w / tw, (float)h / th);
  glBindTexture(GL_TEXTURE_2D, glr::texture());
  glBindBuffer(GL_ARRAY_BUFFER, blitVbo);
  glEnableVertexAttribArray(0);
  glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 0, nullptr);
  glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
  glDisableVertexAttribArray(0);
  glViewport(0, 0, kW, kH);
}
}  // namespace

extern "C" {
uint64_t zn_gxm_cpu_us;

bool zn_gxm_init(int32_t w, int32_t h) {
  vglSetParamBufferSize(SCE_GXM_DEFAULT_PARAMETER_BUFFER_SIZE);
  // vitaGL takes what is free beyond these thresholds: 16 MiB of main memory and 4 MiB of CDRAM stay for the HAL's own framebuffer (the
  // software path). Its answer is true only when it fell back to another resolution, not a failure.
  vglInitWithCustomThreshold(0, kW, kH, 16 * 1024 * 1024, 4 * 1024 * 1024, 0, 0x8C6000 /* the whole common-dialog budget: no pool there, as vglInitExtended */, SCE_GXM_MULTISAMPLE_NONE);
  scaled = w != kW || h != kH;
  // asked first: vitaGL compiles GLSL when a program links and answers GL_COMPILE_STATUS true before that, compiler or not
  if (!start_shader_compiler()) {
    zn_vita_log("vita gl: no shader compiler (extract ur0:data/libshacccg.suprx with ShaRKBR33D), software raster\n");
    return false;   // vitaGL has no shutdown: its GXM stays up unused, the HAL shows its own buffer
  }
  if (!glr::init(w, h)) { zn_vita_log("vita gl: the replay's programs do not build, software raster\n"); return false; }
  zrt::gfx::gpu_strokes = true;   // strokes recorded as polylines, drawn by the replay (as display-gl does)
  zrt::gfx::shaders_drawn = true; glr::shader_source = zrt::gfx::shaderSource;
  if (scaled) {
    blitProg = zgl_program("", BLIT_VS, BLIT_FS);
    blitUv = glGetUniformLocation(blitProg, "u_uv");
    static const float quad[8] = {0, 0, 1, 0, 0, 1, 1, 1};
    glGenBuffers(1, &blitVbo);
    glBindBuffer(GL_ARRAY_BUFFER, blitVbo);
    glBufferData(GL_ARRAY_BUFFER, sizeof quad, quad, GL_STATIC_DRAW);
    if (!blitProg) return false;
  }
  char line[1024];
  snprintf(line, sizeof line, "vita gl: on (vitaGL), %dx%d%s\n", (int)w, (int)h, scaled ? " shown scaled" : "");
  zn_vita_log(line);
  glcaps::print(glr::caps, line, sizeof line);   // what ZINC_GL_INFO prints elsewhere: the stencil bits decide whether LINE/POLY stay on the GPU
  zn_vita_log(line);
  ready = true;
  return true;
}

bool zn_gxm_present(const HalFrame* f) {
  if (!ready) return false;
  ++shown;
  if (f->y1 <= f->y0 || f->x1 <= f->x0) {   // nothing changed: the screen keeps the last frame, and a program the next ones may need is built
    glr::idle();
    glr::warm();
    return false;
  }
  const uint64_t t0 = sceKernelGetProcessTimeWide();
  if (scaled) { glr::frame(f, false, glr::Rect{0, 0, f->w, f->h}); blit(f->w, f->h); }
  else glr::frame(f, true, glr::Rect{0, 0, f->w, f->h});
  const uint64_t t1 = sceKernelGetProcessTimeWide();
  zrt_prof_band(0, t0, t1);
  zn_gxm_cpu_us = t1 - t0;
  vglSwapBuffers(GL_FALSE);
  if (shown >= next_stats) {
    next_stats = shown + 600;   // with the HAL's frame times: what the replay did, and what it left to the CPU
    char b[240];
    const double n = glr::st.frames ? glr::st.frames : 1;
    snprintf(b, sizeof b, "vita gl: %u frames, %.0f quads and %.1f draw calls a frame, %.0f us of CPU to submit, %u LINE/POLY skipped, %.1f tiles a frame on the CPU, %u programs (%.0f ms)\n",
      glr::st.frames, glr::st.quads / n, glr::st.draws / n, glr::st.us / n, glr::unsupported, glr::st.ptiles / n, glr::st.progs, glr::st.prog_us / 1e3);
    zn_vita_log(b);
  }
  return true;
}
}
