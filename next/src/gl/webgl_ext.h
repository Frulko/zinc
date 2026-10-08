// The WebGL extension registry (ZN-203.10): which extensions exist, in which WebGL version, and what the underlying GL must provide for each. One table, read by
// the context (getSupportedExtensions / getExtension, the checks of the format and state tables) and by the shader translation (#extension).
#pragma once
#include <cstdint>
#include <cstring>

namespace zn::gl {

enum class Ext : int {
  StdDerivatives, Vao, InstancedArrays, IndexUint, TexFloat, TexFloatLinear, TexHalf, TexHalfLinear, DepthTexture, Aniso, LoseContext, DebugRenderer, BlendMinmax, FragDepth,
  ShaderTexLod, DrawBuffers, FboRenderMipmap, Srgb, ColorBufHalf, ColorBufFloatWebgl, FloatBlend, ColorBufFloat, S3tc, DrawBuffersIndexed, Count
};

/** What the driver must offer, per API, as a string: "core" (always there), "-" (never), else alternatives separated by '|', each a list of tokens separated by spaces that must all hold:
 *  "GL_xxx" an extension string, "V4.0" a desktop GL version or "E3.0" an OpenGL ES version (at least). The WebGL version bits: 1 = WebGL 1, 2 = WebGL 2. */
struct ExtDef {
  Ext id;
  const char* name;      // the WebGL name: getExtension("OES_vertex_array_object")
  unsigned webgl;        // the WebGL versions that expose it
  const char* gl;        // desktop GL 3.3 / 4.x core
  const char* es2;       // OpenGL ES 2.0 (WebGL 1 on a Raspberry Pi 3)
  const char* es3;       // OpenGL ES 3.0 (WebGL 2)
  const char* glsl;      // the #extension name in a shader, or null
};

inline constexpr ExtDef kExtensions[] = {
  {Ext::StdDerivatives, "OES_standard_derivatives", 1, "core", "GL_OES_standard_derivatives", "core", "GL_OES_standard_derivatives"},
  {Ext::Vao, "OES_vertex_array_object", 1, "core", "GL_OES_vertex_array_object", "core", nullptr},
  {Ext::InstancedArrays, "ANGLE_instanced_arrays", 1, "core", "GL_ANGLE_instanced_arrays|GL_EXT_instanced_arrays", "core", nullptr},
  {Ext::IndexUint, "OES_element_index_uint", 1, "core", "GL_OES_element_index_uint", "core", nullptr},
  {Ext::TexFloat, "OES_texture_float", 1, "core", "GL_OES_texture_float", "core", nullptr},
  {Ext::TexFloatLinear, "OES_texture_float_linear", 3, "core", "GL_OES_texture_float GL_OES_texture_float_linear", "GL_OES_texture_float_linear", nullptr},
  {Ext::TexHalf, "OES_texture_half_float", 1, "core", "GL_OES_texture_half_float", "core", nullptr},
  {Ext::TexHalfLinear, "OES_texture_half_float_linear", 1, "core", "GL_OES_texture_half_float GL_OES_texture_half_float_linear", "core", nullptr},
  {Ext::DepthTexture, "WEBGL_depth_texture", 1, "core", "GL_OES_depth_texture GL_OES_packed_depth_stencil|GL_ANGLE_depth_texture", "core", nullptr},
  {Ext::Aniso, "EXT_texture_filter_anisotropic", 3, "GL_EXT_texture_filter_anisotropic|GL_ARB_texture_filter_anisotropic", "GL_EXT_texture_filter_anisotropic", "GL_EXT_texture_filter_anisotropic", nullptr},
  {Ext::LoseContext, "WEBGL_lose_context", 3, "core", "core", "core", nullptr},
  {Ext::DebugRenderer, "WEBGL_debug_renderer_info", 3, "core", "core", "core", nullptr},
  {Ext::BlendMinmax, "EXT_blend_minmax", 1, "core", "GL_EXT_blend_minmax", "core", nullptr},
  {Ext::FragDepth, "EXT_frag_depth", 1, "core", "GL_EXT_frag_depth", "core", "GL_EXT_frag_depth"},
  {Ext::ShaderTexLod, "EXT_shader_texture_lod", 1, "core", "GL_EXT_shader_texture_lod", "core", "GL_EXT_shader_texture_lod"},
  {Ext::DrawBuffers, "WEBGL_draw_buffers", 1, "core", "GL_EXT_draw_buffers|GL_NV_draw_buffers", "core", "GL_EXT_draw_buffers"},
  {Ext::FboRenderMipmap, "OES_fbo_render_mipmap", 1, "core", "GL_OES_fbo_render_mipmap", "core", nullptr},
  {Ext::Srgb, "EXT_sRGB", 1, "core", "GL_EXT_sRGB", "core", nullptr},
  {Ext::ColorBufHalf, "EXT_color_buffer_half_float", 3, "core", "GL_EXT_color_buffer_half_float", "GL_EXT_color_buffer_half_float|GL_EXT_color_buffer_float", nullptr},
  {Ext::ColorBufFloatWebgl, "WEBGL_color_buffer_float", 1, "core", "GL_EXT_color_buffer_float|GL_CHROMIUM_color_buffer_float_rgba", "core", nullptr},
  {Ext::FloatBlend, "EXT_float_blend", 3, "core", "GL_EXT_float_blend", "GL_EXT_float_blend", nullptr},
  {Ext::ColorBufFloat, "EXT_color_buffer_float", 2, "core", "-", "GL_EXT_color_buffer_float", nullptr},
  {Ext::S3tc, "WEBGL_compressed_texture_s3tc", 3, "-", "-", "-", nullptr},   // "GL_EXT_texture_compression_s3tc" on all three once compressedTexImage2D exists
  {Ext::DrawBuffersIndexed, "OES_draw_buffers_indexed", 2, "V4.0", "-", "GL_OES_draw_buffers_indexed|GL_EXT_draw_buffers_indexed", nullptr},
};
inline constexpr int kExtCount = static_cast<int>(Ext::Count);
static_assert(sizeof(kExtensions) / sizeof(kExtensions[0]) == static_cast<std::size_t>(Ext::Count), "one row per extension, in enum order");

inline const ExtDef* findExt(const char* name, unsigned webglVersion) {
  for (const ExtDef& e : kExtensions) if (!std::strcmp(e.name, name) && (e.webgl & (1u << (webglVersion - 1)))) return &e;
  return nullptr;
}
}  // namespace zn::gl
