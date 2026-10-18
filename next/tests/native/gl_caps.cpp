// The GL replay's capability record and tuning table (runtime/gl_caps.h, ZN-741) on the strings the drivers of the GLES 2 devices give:
// VideoCore IV (Pi 3, Mesa vc4), Adreno 220 (HP TouchPad), Tegra 3 (Nexus 7 2012, measured), Apple GL on Metal, llvmpipe. No GL: the
// record is filled from fake answers, and this program links nothing of the runtime (tests/t0/gl_caps.sh builds it alone).
#include "gl_caps.h"
#include <stdio.h>

static int fails = 0;
#define CHECK(c) do { if (!(c)) { fprintf(stderr, "gl_caps: %s:%d: %s\n", name, __LINE__, #c); fails++; } } while (0)

int main() {
  {
    const char* name = "Tegra 3";
    glcaps::Info in{"NVIDIA Corporation", "NVIDIA Tegra 3", "OpenGL ES 2.0 14.01003",
                    "GL_NV_platform_binary GL_OES_rgb8_rgba8 GL_OES_EGL_sync GL_OES_fbo_render_mipmap GL_NV_depth_nonlinear GL_NV_draw_path "
                    "GL_NV_texture_npot_2D_mipmap GL_OES_EGL_image GL_OES_EGL_image_external GL_OES_vertex_half_float GL_NV_framebuffer_vertex_attrib_array "
                    "GL_NV_coverage_sample GL_OES_mapbuffer GL_ARB_draw_buffers GL_EXT_Cg_shader GL_EXT_packed_float GL_OES_texture_half_float "
                    "GL_OES_texture_float GL_EXT_texture_array GL_OES_compressed_ETC1_RGB8_texture GL_EXT_texture_compression_latc "
                    "GL_EXT_texture_compression_dxt1 GL_EXT_texture_compression_s3tc GL_EXT_texture_filter_anisotropic GL_NV_get_tex_image "
                    "GL_NV_read_buffer GL_NV_shader_framebuffer_fetch GL_NV_fbo_color_attachments GL_EXT_bgra GL_EXT_texture_format_BGRA8888 "
                    "GL_EXT_unpack_subimage GL_NV_pack_subimage GL_NV_texture_compression_s3tc_update GL_NV_read_depth GL_NV_read_stencil "
                    "GL_NV_uniform_buffer_object GL_NV_event GL_OES_standard_derivatives",
                    "EGL_KHR_image EGL_KHR_image_base EGL_KHR_swap_buffers_with_damage EGL_ANDROID_image_native_buffer",
                    2048, 0, 13, 16, 8};
    glcaps::Caps c;
    glcaps::fill(c, in);
    CHECK(c.family == glcaps::TEGRA3); CHECK(c.es && c.major == 2 && c.minor == 0);
    CHECK(!c.frag_highp); CHECK(c.mediump_bits == 13); CHECK(c.max_texture == 2048); CHECK(c.depth_bits == 16);
    CHECK(!c.npot); CHECK(!c.vao); CHECK(!c.instancing); CHECK(!c.uint_index); CHECK(!c.packed_ds); CHECK(!c.depth24);
    CHECK(c.fb_fetch); CHECK(c.derivatives); CHECK(c.etc1); CHECK(c.s3tc); CHECK(c.half_float);
    CHECK(!c.buffer_age); CHECK(!c.partial_update); CHECK(c.swap_damage);
    CHECK(!c.tiler); CHECK(c.lean);
    char b[1024];
    CHECK(glcaps::print(c, b, sizeof b) > 0 && strstr(b, "family Tegra 3") && strstr(b, "fragment highp no, mediump 13 bits"));
  }
  {
    const char* name = "VideoCore IV";
    glcaps::Info in{"Broadcom", "VC4 V3D 2.1", "OpenGL ES 2.0 Mesa 22.3.6",
                    "GL_EXT_blend_minmax GL_EXT_multi_draw_arrays GL_OES_depth24 GL_OES_element_index_uint GL_OES_fbo_render_mipmap "
                    "GL_OES_mapbuffer GL_OES_rgb8_rgba8 GL_OES_standard_derivatives GL_OES_stencil8 GL_OES_texture_3D GL_OES_texture_npot "
                    "GL_OES_vertex_half_float GL_OES_EGL_image GL_OES_depth_texture GL_OES_packed_depth_stencil GL_OES_vertex_array_object "
                    "GL_OES_compressed_ETC1_RGB8_texture",
                    "EGL_EXT_buffer_age EGL_KHR_image_base EGL_MESA_platform_gbm", 2048, 0, 23, 24, 8};
    glcaps::Caps c;
    glcaps::fill(c, in);
    CHECK(c.family == glcaps::VC4); CHECK(c.npot); CHECK(c.vao); CHECK(c.uint_index); CHECK(c.packed_ds); CHECK(c.depth24);
    CHECK(c.buffer_age); CHECK(c.tiler); CHECK(c.lean); CHECK(!c.fb_fetch);
  }
  {
    const char* name = "Adreno 220";
    glcaps::Info in{"Qualcomm", "Adreno (TM) 220", "OpenGL ES 2.0 2093408",
                    "GL_AMD_compressed_ATC_texture GL_AMD_performance_monitor GL_AMD_program_binary_Z400 GL_EXT_texture_format_BGRA8888 "
                    "GL_OES_compressed_ETC1_RGB8_texture GL_OES_depth24 GL_OES_depth_texture GL_OES_element_index_uint GL_OES_packed_depth_stencil "
                    "GL_OES_texture_npot GL_OES_vertex_array_object GL_OES_standard_derivatives",
                    nullptr, 4096, 62, 10, 24, 8};
    glcaps::Caps c;
    glcaps::fill(c, in);
    CHECK(c.family == glcaps::ADRENO2); CHECK(c.frag_highp); CHECK(c.tiler); CHECK(c.lean); CHECK(!c.swap_damage);
    in.renderer = "Adreno (TM) 320";
    glcaps::fill(c, in);
    CHECK(c.family == glcaps::ADRENO); CHECK(!c.lean);
  }
  {
    const char* name = "desktop";
    glcaps::Info in{"Apple", "Apple M1 Pro", "4.1 Metal - 89.4", nullptr, nullptr, 16384, 0, 0, 24, 8};
    glcaps::Caps c;
    glcaps::fill(c, in);
    CHECK(c.family == glcaps::APPLE); CHECK(!c.es && c.major == 4 && c.minor == 1); CHECK(c.frag_highp); CHECK(c.npot && c.vao && c.instancing);
    CHECK(c.packed_ds); CHECK(c.tiler); CHECK(!c.lean);
    in.renderer = "llvmpipe (LLVM 15.0.7, 256 bits)"; in.version = "4.5 (Core Profile) Mesa 23.0.4";
    glcaps::fill(c, in);
    CHECK(c.family == glcaps::SOFTWARE); CHECK(!c.tiler);
    in.renderer = "Intel(R) Iris(TM) Plus Graphics 655";
    glcaps::fill(c, in);
    CHECK(c.family == glcaps::INTEL); CHECK(!c.tiler);
  }
  {
    const char* name = "whole words";
    CHECK(glcaps::has("GL_OES_depth24_stencil8 GL_X", "GL_X")); CHECK(!glcaps::has("GL_OES_depth24_stencil8", "GL_OES_depth24"));
    CHECK(!glcaps::has(nullptr, "GL_X"));
  }
  if (fails) return 1;
  printf("5 GPUs, record and tuning as expected\n");
  return 0;
}
