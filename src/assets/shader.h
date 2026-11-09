// Shaders (ZN-444, docs/reports/games/toolchain-assets-loading.md 4.7), private to src/assets: a GLSL ES file of the assets directory
// is checked at build with glslang in each variant D29 gives it, and stored as written (dev) or without its comments and spaces (release).
#pragma once
#include <functional>
#include <map>
#include <string>

namespace zn::assets {

/** The GLSL ES front end (glslang, in libzn_webgl): `log` empty when `source` with `preamble` before it is a valid shader of that stage.
 *  False: no front end here (the build then stores the shader unchecked). */
using GlslCheck = std::function<bool(const std::string& source, const std::string& preamble, bool fragment, std::string& log)>;

/** A shader source to what its pack holds. The stage comes from the option `stage` ("vertex", "fragment") or the extension (.vert, .vs,
 *  .frag, .fs). A source that says `#version 300 es` is checked as GLSL ES 3.00 (WebGL 2) only; one without a version is D29's single
 *  source and is checked both as GLSL ES 1.00 (`ZN_ES2`, the floor) and as 3.00 (`ZN_ES3`, its keywords renamed by the prelude). An error
 *  is `line N: message (GLSL ES 1.00)`, N a line of the file. `minify` "true": comments and spaces stripped. */
bool importShader(const GlslCheck& check, const std::string& name, const std::string& in, const std::map<std::string, std::string>& opts,
                  std::string& out, std::string& err);
/** `src` without comments, blank lines and the spaces the grammar does not need; preprocessor lines stay lines of their own. */
std::string minifyGlsl(const std::string& src);

}  // namespace zn::assets
