// zinc:gl (ZN-562): the host rows of WebGL for compiled Zinc code (include/zn/runtime.h, isGlRow) served by the WebGL1 class, with no JS engine.
// zinc loads this from libzn_webgl on the first call (src/main.cpp); an AOT program links it from zn_gl. A context is a small integer, WebGL objects
// are their ids, a uniform location is an index into its context's table (plus one: 0 is null). Arrays arrive as the program's slots (8 bytes each):
// the bits of an f64 for D, an integer for B.
#include <cstdio>
#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "gl/webgl1.h"
#include "gl/webgl_js.h"
#include "zn/host.h"
#include "zn/runtime.h"

namespace {

using zn::Rt;
using zn::host::HostArg;
using namespace zn::gl;

struct Ctx {
  WebGL1 gl;
  std::vector<UniformLoc> locs;
};
std::vector<std::unique_ptr<Ctx>> gCtx;   // context id - 1
Ctx* gCur = nullptr;
const PresentHooks* gHooks = nullptr;
std::string gStr;   // a string result lives here until the next call
std::vector<float> gF;
std::vector<std::uint16_t> gU16;
std::vector<std::uint8_t> gU8;

Ctx* ctxOf(std::int64_t id) {
  if (id < 1 || id > static_cast<std::int64_t>(gCtx.size()) || !gCtx[id - 1]) return nullptr;
  Ctx* c = gCtx[id - 1].get();
  if (gCur != c) { c->gl.makeCurrent(); gCur = c; }   // several contexts live side by side: each call makes its own current
  return c;
}
const UniformLoc& loc(const Ctx& c, std::int64_t h) {
  static const UniformLoc none;
  return h >= 1 && h <= static_cast<std::int64_t>(c.locs.size()) ? c.locs[h - 1] : none;
}
const float* floats(const HostArg& a) {
  gF.resize(a.n);
  for (std::uint32_t i = 0; i < a.n; ++i) { double d; std::memcpy(&d, static_cast<const std::uint64_t*>(a.p) + i, 8); gF[i] = static_cast<float>(d); }
  return gF.data();
}
std::uint32_t U(const HostArg& a) { return static_cast<std::uint32_t>(a.i); }
int I(const HostArg& a) { return static_cast<int>(a.i); }
float F(const HostArg& a) { return static_cast<float>(a.d); }
void retStr(HostArg* r, std::string s) { gStr = std::move(s); r->p = gStr.data(); r->n = static_cast<std::uint32_t>(gStr.size()); }

/** gl.present(image): the drawing buffer, rows flipped and without alpha, into the zinc:gfx image (resized to the canvas). */
void present(Ctx& c, int image) {
  if (!gHooks) return;
  const int w = c.gl.target().width(), h = c.gl.target().height();
  unsigned* dst = gHooks->pixels(image, w, h);
  if (!dst) return;
  const std::vector<std::uint8_t> px = c.gl.target().read();   // the driver call itself: the program's pack state and error flags stay as they are
  for (int y = 0; y < h; ++y) {
    const std::uint8_t* src = px.data() + static_cast<std::size_t>(h - 1 - y) * w * 4;
    for (int x = 0; x < w; ++x, src += 4) dst[static_cast<std::size_t>(y) * w + x] = (static_cast<unsigned>(src[0]) << 16) | (static_cast<unsigned>(src[1]) << 8) | src[2];
  }
  gHooks->done(image);
}

}  // namespace

extern "C" __attribute__((visibility("default"))) void zn_webgl_host_hooks(const PresentHooks* hooks) { gHooks = hooks; }

extern "C" __attribute__((visibility("default"))) void zn_webgl_host(int row, const HostArg* a, HostArg* r) {
  const Rt id = static_cast<Rt>(row);
  r->i = 0;
  if (id == Rt::HostGlCreate) {   // (width, height, version): 0 when no context of that version can be made
    auto c = std::make_unique<Ctx>();
    std::string err;
    const int w = I(a[0]), h = I(a[1]);
    const bool ok = I(a[2]) == 2 ? (c->gl.create(Api::Gl33, w, h, err, 2) || c->gl.create(Api::Gles3, w, h, err, 2))
                                 : (c->gl.create(Api::Gl33, w, h, err) || c->gl.create(Api::Gles2, w, h, err));
    if (!ok) { std::fprintf(stderr, "zinc:gl: %s\n", err.c_str()); return; }
    gCtx.push_back(std::move(c));
    gCur = gCtx.back().get();
    r->i = static_cast<std::int64_t>(gCtx.size());
    return;
  }
  Ctx* c = ctxOf(a[0].i);
  if (!c) { if (id == Rt::HostGlGetShaderInfoLog || id == Rt::HostGlGetProgramInfoLog) retStr(r, ""); return; }   // a destroyed or unknown context does nothing
  WebGL1& gl = c->gl;
  switch (id) {
    case Rt::HostGlDestroy: gCtx[a[0].i - 1].reset(); gCur = nullptr; break;
    case Rt::HostGlGetError: r->i = gl.getError(); break;
    case Rt::HostGlEnable: gl.enable(U(a[1])); break;
    case Rt::HostGlDisable: gl.disable(U(a[1])); break;
    case Rt::HostGlViewport: gl.viewport(I(a[1]), I(a[2]), I(a[3]), I(a[4])); break;
    case Rt::HostGlClearColor: gl.clearColor(F(a[1]), F(a[2]), F(a[3]), F(a[4])); break;
    case Rt::HostGlClear: gl.clear(U(a[1])); break;
    case Rt::HostGlDepthFunc: gl.depthFunc(U(a[1])); break;
    case Rt::HostGlCullFace: gl.cullFace(U(a[1])); break;
    case Rt::HostGlCreateBuffer: r->i = gl.createBuffer(); break;
    case Rt::HostGlBindBuffer: gl.bindBuffer(U(a[1]), U(a[2])); break;
    case Rt::HostGlBufferDataF32: gl.bufferData(U(a[1]), static_cast<std::int64_t>(a[2].n) * 4, floats(a[2]), U(a[3])); break;
    case Rt::HostGlBufferDataU16: {
      gU16.resize(a[2].n);
      for (std::uint32_t i = 0; i < a[2].n; ++i) { double d; std::memcpy(&d, static_cast<const std::uint64_t*>(a[2].p) + i, 8); gU16[i] = static_cast<std::uint16_t>(d); }
      gl.bufferData(U(a[1]), static_cast<std::int64_t>(a[2].n) * 2, gU16.data(), U(a[3]));
      break;
    }
    case Rt::HostGlCreateShader: r->i = gl.createShader(U(a[1])); break;
    case Rt::HostGlShaderSource: gl.shaderSource(U(a[1]), std::string(static_cast<const char*>(a[2].p), a[2].n)); break;
    case Rt::HostGlCompileShader: gl.compileShader(U(a[1])); break;
    case Rt::HostGlGetShaderParameter:   // COMPILE_STATUS, DELETE_STATUS (as 0 / 1), SHADER_TYPE
      if (!gl.shaderQueryOk(U(a[1]), U(a[2]))) break;
      r->i = U(a[2]) == 0x8B81 ? gl.shaderCompiled(U(a[1])) : U(a[2]) == 0x8B80 ? gl.isDeletedShader(U(a[1])) : gl.shaderTypeOf(U(a[1]));
      break;
    case Rt::HostGlGetShaderInfoLog: retStr(r, gl.shaderInfoLog(U(a[1]))); break;
    case Rt::HostGlCreateProgram: r->i = gl.createProgram(); break;
    case Rt::HostGlAttachShader: gl.attachShader(U(a[1]), U(a[2])); break;
    case Rt::HostGlLinkProgram: gl.linkProgram(U(a[1])); break;
    case Rt::HostGlGetProgramParameter: { bool ok = false; r->i = gl.programParameter(U(a[1]), U(a[2]), ok); break; }
    case Rt::HostGlGetProgramInfoLog: retStr(r, gl.programInfoLog(U(a[1]))); break;
    case Rt::HostGlUseProgram: gl.useProgram(U(a[1])); break;
    case Rt::HostGlGetAttribLocation: r->i = gl.getAttribLocation(U(a[1]), std::string(static_cast<const char*>(a[2].p), a[2].n)); break;
    case Rt::HostGlEnableVertexAttribArray: gl.enableVertexAttribArray(U(a[1])); break;
    case Rt::HostGlVertexAttribPointer: gl.vertexAttribPointer(U(a[1]), I(a[2]), U(a[3]), a[4].i != 0, I(a[5]), a[6].i); break;
    case Rt::HostGlGetUniformLocation: {
      const UniformLoc l = gl.getUniformLocation(U(a[1]), std::string(static_cast<const char*>(a[2].p), a[2].n));
      if (!l.valid()) break;
      c->locs.push_back(l);
      r->i = static_cast<std::int64_t>(c->locs.size());
      break;
    }
    case Rt::HostGlUniform1i: gl.uniform1i(loc(*c, a[1].i), I(a[2])); break;
    case Rt::HostGlUniform1f: gl.uniform1f(loc(*c, a[1].i), F(a[2])); break;
    case Rt::HostGlUniform3f: gl.uniform3f(loc(*c, a[1].i), F(a[2]), F(a[3]), F(a[4])); break;
    case Rt::HostGlUniform4f: gl.uniform4f(loc(*c, a[1].i), F(a[2]), F(a[3]), F(a[4]), F(a[5])); break;
    case Rt::HostGlUniformMatrix3fv: gl.uniformMatrixNfv(loc(*c, a[1].i), 3, a[2].i != 0, floats(a[3]), a[3].n); break;
    case Rt::HostGlUniformMatrix4fv: gl.uniformMatrix4fv(loc(*c, a[1].i), a[2].i != 0, floats(a[3]), a[3].n); break;
    case Rt::HostGlCreateTexture: r->i = gl.createTexture(); break;
    case Rt::HostGlBindTexture: gl.bindTexture(U(a[1]), U(a[2])); break;
    case Rt::HostGlActiveTexture: gl.activeTexture(U(a[1])); break;
    case Rt::HostGlTexParameteri: gl.texParameteri(U(a[1]), U(a[2]), I(a[3])); break;
    case Rt::HostGlTexImage2D: {   // (target, level, internalformat, width, height, border, format, type, pixels: u8[]; empty: none)
      gU8.resize(a[9].n);
      for (std::uint32_t i = 0; i < a[9].n; ++i) gU8[i] = static_cast<std::uint8_t>(static_cast<const std::uint64_t*>(a[9].p)[i]);
      gl.texImage2D(U(a[1]), I(a[2]), U(a[3]), I(a[4]), I(a[5]), I(a[6]), U(a[7]), U(a[8]), a[9].n ? gU8.data() : nullptr, gU8.size());
      break;
    }
    case Rt::HostGlGenerateMipmap: gl.generateMipmap(U(a[1])); break;
    case Rt::HostGlDrawArrays: gl.drawArrays(U(a[1]), I(a[2]), I(a[3])); break;
    case Rt::HostGlDrawElements: gl.drawElements(U(a[1]), I(a[2]), U(a[3]), a[4].i); break;
    case Rt::HostGlPresent: present(*c, I(a[1])); break;
    default: break;
  }
}
