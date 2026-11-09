// Shaders at build (ZN-444): see shader.h.
#include "assets/shader.h"

#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <regex>
#include <string_view>

namespace zn::assets {
namespace {

bool word(char c) { return std::isalnum(static_cast<unsigned char>(c)) || c == '_' || c == '.'; }
bool op(char c) { return c && std::string_view("+-*/%<>=!&|^").find(c) != std::string_view::npos; }

// One line of code with its runs of spaces cut to what keeps two tokens apart: two words (`vec4 c`), two operators (`a - -b`, `x + +y`)
void compact(const std::string& code, std::string& out) {
  std::size_t i = 0;
  while (i < code.size()) {
    if (!std::isspace(static_cast<unsigned char>(code[i]))) { out += code[i++]; continue; }
    while (i < code.size() && std::isspace(static_cast<unsigned char>(code[i]))) i++;
    const char a = out.empty() ? 0 : out.back(), b = i < code.size() ? code[i] : 0;
    if ((word(a) && word(b)) || (op(a) && op(b))) out += ' ';
  }
}

// The D29 preludes (display-gl's zgl_program): the macro of the variant and the default precision of a fragment shader; GLSL ES 3.00 renames the
// 1.00 keywords of a single source
const char* kPrecision = "#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n";
std::string prelude(bool es3, bool fragment, bool rename) {
  std::string p = fragment ? kPrecision : "";
  p += es3 ? "#define ZN_ES3\n" : "#define ZN_ES2\n";
  if (rename && !fragment) p += "#define attribute in\n#define varying out\n";
  if (rename && fragment) p += "#define varying in\n#define texture2D texture\n#define textureCube texture\nout vec4 zn_FragColor;\n#define gl_FragColor zn_FragColor\n";
  return p;
}

// glslang's first error as `line N: message (GLSL ES v)`, N counted in the file (`shift`: the lines the check put before it)
std::string firstError(const std::string& log, int shift, const char* version) {
  static const std::regex e(R"(ERROR: -?\d+:(\d+): ([^\n]*))");
  std::smatch m;
  std::string msg = log.substr(0, log.find('\n')), line;
  if (std::regex_search(log, m, e)) { msg = m[2]; line = "line " + std::to_string(std::max(1, std::atoi(m[1].str().c_str()) - shift)) + ": "; }
  while (!msg.empty() && std::isspace(static_cast<unsigned char>(msg.back()))) msg.pop_back();
  return line + msg + " (GLSL ES " + version + ")";
}

}  // namespace

std::string minifyGlsl(const std::string& src) {
  // comments out (a comment is one space), a line ended by a backslash joined to the next (GLSL ES 3.00; an error in 1.00, found by the check)
  std::string s;
  for (std::size_t i = 0; i < src.size(); i++) {
    if (src.compare(i, 2, "//") == 0) { while (i < src.size() && src[i] != '\n') i++; if (i < src.size()) s += '\n'; continue; }
    if (src.compare(i, 2, "/*") == 0) { const std::size_t end = src.find("*/", i + 2); i = end == std::string::npos ? src.size() : end + 1; s += ' '; continue; }
    if (src[i] == '\\' && (src.compare(i + 1, 1, "\n") == 0 || src.compare(i + 1, 2, "\r\n") == 0)) { i += src[i + 1] == '\r' ? 2 : 1; continue; }
    s += src[i];
  }
  // lines: a preprocessor line stays a line of its own, its spaces cut to one (`#define F(x)` and `#define F (x)` differ); the code between
  // them is one line
  std::string out, code;
  auto flush = [&] { if (code.empty()) return; compact(code, out); out += '\n'; code.clear(); };
  std::size_t at = 0;
  while (at <= s.size()) {
    std::size_t eol = s.find('\n', at);
    if (eol == std::string::npos) eol = s.size();
    std::string line = s.substr(at, eol - at);
    at = eol + 1;
    const std::size_t b = line.find_first_not_of(" \t\r\f\v");
    if (b == std::string::npos) continue;
    line = line.substr(b, line.find_last_not_of(" \t\r\f\v") + 1 - b);
    if (line[0] != '#') { code += code.empty() ? "" : " "; code += line; continue; }
    flush();
    bool space = false;
    for (char c : line) {
      if (std::isspace(static_cast<unsigned char>(c))) { space = true; continue; }
      if (space && out.back() != '\n') out += ' ';
      out += c; space = false;
    }
    out += '\n';
  }
  flush();
  return out;
}

bool importShader(const GlslCheck& check, const std::string& name, const std::string& in, const std::map<std::string, std::string>& opts,
                  std::string& out, std::string& err) {
  const std::size_t dot = name.rfind('.');
  const std::string ext = dot == std::string::npos ? "" : name.substr(dot);
  const auto st = opts.find("stage");
  const std::string stage = st != opts.end() ? st->second : ext == ".vert" || ext == ".vs" ? "vertex" : ext == ".frag" || ext == ".fs" ? "fragment" : "";
  if (stage != "vertex" && stage != "fragment") { err = "a shader's stage is \"vertex\" or \"fragment\": name it .vert or .frag, or give its rule the option \"stage\""; return false; }
  const bool fragment = stage == "fragment";
  const std::string bare = minifyGlsl(in);
  const bool es3 = bare.rfind("#version 300 es", 0) == 0, versioned = bare.rfind("#version", 0) == 0;
  if (versioned && !es3 && bare.rfind("#version 100\n", 0) != 0) { err = "line 1: GLSL ES 1.00 (no #version, or #version 100) or 3.00 (#version 300 es) only"; return false; }
  // the variants: as written (GLSL ES 1.00, or 3.00 when it says so); a source without a version as GLSL ES 3.00 too, its line 1 after the
  // `#version 300 es` the check adds
  std::string log;
  bool checked = check && check(in, prelude(es3, fragment, false), fragment, log);
  if (checked && !log.empty()) { err = firstError(log, 0, es3 ? "3.00" : "1.00"); return false; }
  if (checked && !versioned && check("#version 300 es\n" + in, prelude(true, fragment, true), fragment, log) && !log.empty()) { err = firstError(log, 1, "3.00"); return false; }
  out = in;
  if (const auto m = opts.find("minify"); m != opts.end() && m->second == "true") {
    out = bare;
    // ponytail: a minified source the front end refuses ships as written (a defect of minifyGlsl, not of the shader)
    if (checked && check(out, prelude(es3, fragment, false), fragment, log) && !log.empty()) out = in;
  }
  return true;
}

}  // namespace zn::assets
