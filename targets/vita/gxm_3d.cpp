// GXM 3D path, first milestone (ZN-493): one draw entrypoint over the 2D replay's GXM state.
// Compiled only with -DZN_VITA_GXP_3D=1 (targets/console/vita.cmake) and only when the
// colour pair is compiled: "zn_gxp_3d.h" below is generated from the real .gxp blobs
// (targets/vita/shaders/README.md); its absence fails the build naming the shader. The 2D
// replay (gxm_vita.cpp) is unchanged: without the macro this file is not compiled at all.
//
// Nothing calls these entrypoints yet: the zinc:3d pipeline (ZN-495, ZN-477) is a later
// milestone. The caller runs them inside a scene begun by zn_gxm_present's flow, with the
// context's own viewport (SDL's NDC viewport, sceGxmSetViewport(W/2, W/2, H/2, -H/2, 0.5, 0.5),
// already set): the MVP is clip space and maps through it unchanged.
#include <psp2/gxm.h>
#include <psp2/kernel/clib.h>
#include <stdio.h>

extern "C" void zn_vita_log(const char* line);   // gxm_vita.cpp: the console's log (hal_vita.cpp)
extern "C" SceGxmContext* zn_gxm_3d_context(SceGxmRenderTarget** target, SceGxmShaderPatcher** patcher, SceGxmDepthStencilSurface* depth);

#include "zn_gxp_3d.h"   // generated from color3d_v.gxp and color3d_f.gxp (shaders/README.md)

using zn::vita::gxp3d::colorVertexProgramGxp;
using zn::vita::gxp3d::colorFragmentProgramGxp;

namespace {
struct V3 { float x, y, z, r, g, b, a; };   // the interleaved vertex: 7 floats, 28 bytes

SceGxmContext* ctx3;
SceGxmVertexProgram* prog3;
SceGxmFragmentProgram* frag3;
const SceGxmProgramParameter* wvp3;
bool ready3;

void say(const char* what, int err) { char b[160]; snprintf(b, sizeof b, "vita gxm 3d: %s failed (0x%08X)\n", what, (unsigned)err); zn_vita_log(b); }
}  // namespace

extern "C" {

// Registers the pair and creates the programs: call once after zn_gxm_init. False (with the
// reason on the log) when the pair or the patcher refuses something; the 2D path is untouched.
bool zn_gxm_3d_init(void) {
  SceGxmRenderTarget* target;
  SceGxmShaderPatcher* patcher;
  SceGxmDepthStencilSurface depth;
  ctx3 = zn_gxm_3d_context(&target, &patcher, &depth);
  if (!ctx3) return false;
  const SceGxmProgram* vp = reinterpret_cast<const SceGxmProgram*>(zn::vita::gxp3d::colorVertexProgramGxp);
  const SceGxmProgram* fp = reinterpret_cast<const SceGxmProgram*>(zn::vita::gxp3d::colorFragmentProgramGxp);
  if (sceGxmProgramCheck(vp) < 0 || sceGxmProgramCheck(fp) < 0) { say("sceGxmProgramCheck", 0); return false; }
  SceGxmShaderPatcherId idv, idf;
  if (sceGxmShaderPatcherRegisterProgram(patcher, vp, &idv) < 0 || sceGxmShaderPatcherRegisterProgram(patcher, fp, &idf) < 0) { say("the 3d program registration", 0); return false; }
  // the layout of V3: aPosition 3 floats at 0, aColor 4 floats at 12, one stream, u16 indices
  auto attr = [&vp](SceGxmVertexAttribute& a, const char* name, unsigned offset, unsigned n) {
    a.streamIndex = 0; a.offset = (uint16_t)offset; a.format = SCE_GXM_ATTRIBUTE_FORMAT_F32; a.componentCount = (uint8_t)n;
    a.regIndex = (uint16_t)sceGxmProgramParameterGetResourceIndex(sceGxmProgramFindParameterByName(vp, name));
  };
  SceGxmVertexAttribute attrs[2];
  attr(attrs[0], "aPosition", 0, 3);
  attr(attrs[1], "aColor", 12, 4);
  SceGxmVertexStream stream;
  stream.stride = sizeof(V3); stream.indexSource = SCE_GXM_INDEX_SOURCE_INDEX_16BIT;
  int err = sceGxmShaderPatcherCreateVertexProgram(patcher, idv, attrs, 2, &stream, 1, &prog3);
  if (err < 0) { say("3d vertex program", err); return false; }
  static const SceGxmBlendInfo blend = {SCE_GXM_COLOR_MASK_ALL, SCE_GXM_BLEND_FUNC_ADD, SCE_GXM_BLEND_FUNC_ADD, SCE_GXM_BLEND_FACTOR_SRC_ALPHA,
    SCE_GXM_BLEND_FACTOR_ONE_MINUS_SRC_ALPHA, SCE_GXM_BLEND_FACTOR_ONE, SCE_GXM_BLEND_FACTOR_ONE_MINUS_SRC_ALPHA};
  err = sceGxmShaderPatcherCreateFragmentProgram(patcher, idf, SCE_GXM_OUTPUT_REGISTER_FORMAT_UCHAR4, SCE_GXM_MULTISAMPLE_NONE, &blend, vp, &frag3);
  if (err < 0) { say("3d fragment program", err); return false; }
  wvp3 = sceGxmProgramFindParameterByName(vp, "Wvp");   // psp2spvc names the wvp block's parameter by its block name
  ready3 = wvp3 != nullptr;
  if (!ready3) say("the wvp uniform", 0);
  return ready3;
}

// One indexed triangle batch: mvp (16 floats, column major: clipPos = mvp * vec4(x,y,z,1)),
// vbo vcount vertices of 7 floats (x, y, z, r, g, b, a), ibo icount u16 triangle indices into vbo.
// The depth state is set here and restored after: the 2D replay draws with the context's
// default depth state and must keep it. Depth buffers exist (gxm_vita.cpp's tiled S8D24 surface).
void zn_gxm_3d_draw(const float* mvp, const float* vbo, uint32_t vcount, const uint16_t* ibo, uint32_t icount) {
  if (!ready3 || !mvp || !vbo || !ibo || !icount || vcount > 65536) return;
  void* uniforms;
  sceGxmSetVertexProgram(ctx3, prog3);
  sceGxmSetFragmentProgram(ctx3, frag3);
  sceGxmReserveVertexDefaultUniformBuffer(ctx3, &uniforms);
  sceGxmSetUniformDataF(uniforms, wvp3, 0, 16, mvp);
  sceGxmSetFrontDepthFunc(ctx3, SCE_GXM_DEPTH_FUNC_LESS_EQUAL);
  sceGxmSetBackDepthFunc(ctx3, SCE_GXM_DEPTH_FUNC_LESS_EQUAL);
  sceGxmSetFrontDepthWriteEnable(ctx3, SCE_GXM_DEPTH_WRITE_ENABLED);
  sceGxmSetBackDepthWriteEnable(ctx3, SCE_GXM_DEPTH_WRITE_ENABLED);
  sceGxmSetVertexStream(ctx3, 0, vbo);
  sceGxmDraw(ctx3, SCE_GXM_PRIMITIVE_TRIANGLES, SCE_GXM_INDEX_FORMAT_U16, ibo, icount);
  sceGxmSetFrontDepthWriteEnable(ctx3, SCE_GXM_DEPTH_WRITE_DISABLED);
  sceGxmSetBackDepthWriteEnable(ctx3, SCE_GXM_DEPTH_WRITE_DISABLED);
  sceGxmSetFrontDepthFunc(ctx3, SCE_GXM_DEPTH_FUNC_ALWAYS);
  sceGxmSetBackDepthFunc(ctx3, SCE_GXM_DEPTH_FUNC_ALWAYS);
}

}  // extern "C"
