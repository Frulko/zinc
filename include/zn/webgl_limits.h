#pragma once
// The limits of the WebGL module (src/gl): what a context reports and enforces itself, the same in WebGL 1 and 2 and on every driver.
// The only place they are defined, as zn/limits.h is for the compiler and the VM (see ARCHITECTURE.md).

namespace zn::gl {

inline constexpr int kMaxVertexAttribs = 16;     // MAX_VERTEX_ATTRIBS: attribute indices 0 to 15
inline constexpr int kMaxTextureUnits = 32;      // the most MAX_COMBINED_TEXTURE_IMAGE_UNITS reports (three.js binds TEXTURE0 + that - 1)
inline constexpr int kMaxShaderCallDepth = 256;  // nested function calls in a shader, ANGLE's limit: deeper shaders are refused when compiled (the desktop drivers take gigabytes to link 10000 nested calls)

}  // namespace zn::gl
