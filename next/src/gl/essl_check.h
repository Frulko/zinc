// GLSL ES validation for WebGL (ZN-203.10): the shaders of a page are parsed by glslang (third_party/glslang, the Khronos reference front end) with the rules of GLSL ES 1.00 (Appendix A included) or
// 3.00, because the desktop GLSL compiler that runs them afterwards accepts much more (implicit int to float conversions, while loops, reserved words ...) and WebGL must refuse those shaders.
#pragma once
#include <string>

namespace zn::gl {
/** "" when the source is a valid ESSL shader of that stage (100, or 300 es when it says `#version 300 es`), else the compiler's error log. The preamble holds the macros of the context (ZN_GL_ES ...). */
std::string esslValidate(const std::string& source, const std::string& preamble, bool fragment);
}  // namespace zn::gl
