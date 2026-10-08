#include "gl/webgl1.h"

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <regex>
#include <set>

#include "glad/gl.h"

namespace zn::gl {
namespace {

constexpr int kMaxAttribs = 16;
constexpr int kMaxUnits = 32;   // the units reported by MAX_COMBINED_TEXTURE_IMAGE_UNITS (three.js binds TEXTURE0 + that - 1)

int typeSize(std::uint32_t t) {
  switch (t) {
    case GL_BYTE: case GL_UNSIGNED_BYTE: return 1;
    case GL_SHORT: case GL_UNSIGNED_SHORT: return 2;
    case GL_FLOAT: return 4;
  }
  return 0;
}

// every whole-word occurrence of an identifier (names like gl_FragColor cannot be #defined in GLSL: some drivers refuse a macro named after a built-in)
void replaceIdent(std::string& body, const std::string& from, const std::string& to) {
  const auto word = [](char c) { return std::isalnum(static_cast<unsigned char>(c)) || c == '_'; };
  for (std::size_t p = body.find(from); p != std::string::npos; p = body.find(from, p + to.size())) {
    const std::size_t e = p + from.size();
    if ((p > 0 && word(body[p - 1])) || (e < body.size() && word(body[e]))) continue;
    body.replace(p, from.size(), to);
  }
}
// the source with its comments blanked (newlines kept)
std::string withoutComments(const std::string& src) {
  std::string t;
  for (std::size_t i = 0; i < src.size(); ++i) {
    if (src.compare(i, 2, "//") == 0) { while (i < src.size() && src[i] != '\n') ++i; t += '\n'; }
    else if (src.compare(i, 2, "/*") == 0) { std::size_t e = src.find("*/", i + 2); const std::size_t stop = e == std::string::npos ? src.size() : e + 2; for (std::size_t k = i; k < stop; ++k) if (src[k] == '\n') t += '\n'; t += ' '; i = stop - 1; }
    else t += src[i];
  }
  return t;
}
// The rules of GLSL ES 1.00 and WebGL (Appendix A, the reserved words, the character set, the webgl_ prefix) that a desktop GLSL compiler does not enforce. Empty: fine, else the compile error.
std::string essl1Violation(const std::string& src, int webgl, std::uint32_t type) {
  static const char* const reserved[] = {"asm", "class", "union", "enum", "typedef", "template", "this", "packed", "goto", "switch", "default", "inline", "noinline", "volatile", "public", "static", "extern", "external", "interface", "flat", "long", "short", "double", "half", "fixed", "unsigned", "superp", "input", "output", "hvec2", "hvec3", "hvec4", "dvec2", "dvec3", "dvec4", "fvec2", "fvec3", "fvec4", "sampler1D", "sampler3D", "sampler1DShadow", "sampler2DShadow", "sampler2DRect", "sampler3DRect", "sampler2DRectShadow", "sizeof", "cast", "namespace", "using"};
  const std::string t = withoutComments(src);
  {   // the character set, outside conditional blocks (an excluded block is skipped by the preprocessor, which is not ours)
    int depth = 0;
    std::size_t ls = 0;
    while (ls <= t.size()) {
      std::size_t le = t.find('\n', ls);
      if (le == std::string::npos) le = t.size();
      const std::size_t k = t.find_first_not_of(" \t", ls);
      const bool dir = k != std::string::npos && k < le && t[k] == '#';
      std::string name;
      if (dir) { std::size_t w = t.find_first_not_of(" \t", k + 1); while (w != std::string::npos && w < le && std::isalpha(static_cast<unsigned char>(t[w]))) name += t[w++]; }
      if (dir && (name == "endif")) --depth;
      if (depth <= 0) for (std::size_t i = ls; i < le; ++i) { const unsigned char ch = static_cast<unsigned char>(t[i]); if (ch >= 0x80 || ch == '$' || ch == '@' || ch == '`' || (ch < 0x20 && ch != '\r' && ch != '\t')) return "ERROR: 0:1: '' : unexpected character in the shader source (outside the GLSL ES character set)"; }
      if (dir && (name == "if" || name == "ifdef" || name == "ifndef")) ++depth;
      ls = le + 1;
    }
  }
  std::size_t at = t.find_first_not_of(" \t\r\n");
  for (std::size_t p = t.find("#version"); p != std::string::npos; p = t.find("#version", p + 1)) {
    (void)at;
    static const std::regex ver(R"(#\s*version\s+(\w+))");
    std::smatch m; const std::string rest = t.substr(p, 40);
    if (std::regex_search(rest, m, ver) && m[1] != "100") return "ERROR: 0:1: '#version' : version number not supported by WebGL 1 / ESSL 1.00 (" + m[1].str() + ")";
  }
  const auto word = [](char c) { return std::isalnum(static_cast<unsigned char>(c)) || c == '_'; };
  for (std::size_t i = 0; i < t.size();) {
    if (!word(t[i]) || std::isdigit(static_cast<unsigned char>(t[i]))) { ++i; continue; }
    std::size_t j = i;
    while (j < t.size() && word(t[j])) ++j;
    const std::string id = t.substr(i, j - i);
    if (id.size() > (webgl == 2 ? 1024u : 256u)) return "ERROR: 0:1: '" + id.substr(0, 20) + "...' : identifier is too long (more than 256 characters)";
    if (id.compare(0, 6, "webgl_") == 0 || id.compare(0, 7, "_webgl_") == 0) return "ERROR: 0:1: '" + id + "' : identifiers starting with \"webgl_\" or \"_webgl_\" are reserved";
    if (id.find("__") != std::string::npos && id != "__VERSION__" && id != "__LINE__" && id != "__FILE__") return "ERROR: 0:1: '" + id + "' : identifiers containing \"__\" are reserved";   // (the suite is of two minds: shader-with-double-underscore wants one accepted)
    if (id == "attribute" && type == GL_FRAGMENT_SHADER) return "ERROR: 0:1: 'attribute' : attributes are for vertex shaders";
    if (id == "while" || id == "do") return "ERROR: 0:1: '" + id + "' : loops other than for are not supported (GLSL ES 1.00 Appendix A)";
    for (const char* r : reserved) if (id == r) return "ERROR: 0:1: '" + id + "' : reserved keyword";
    i = j;
  }
  static const std::regex attrArray(R"(\battribute\s+(?:lowp\s+|mediump\s+|highp\s+)?\w+\s+\w+\s*\[)");
  if (std::regex_search(t, attrArray)) return "ERROR: 0:1: 'attribute' : arrays of attributes are not allowed";
  return "";
}
// words that desktop GLSL 330 keeps for itself but ESSL 1.00 lets a shader use as names: renamed by macro when the shader uses them
bool desktopOnlyWord(const std::string& id) {
  static const std::set<std::string> fixed = {"case", "layout", "centroid", "smooth", "noperspective", "patch", "sample", "subroutine", "uint", "coherent", "restrict", "readonly", "writeonly", "common", "partition", "active", "resource", "filter", "shared", "atomic_uint", "row_major", "column_major"};
  if (fixed.count(id)) return true;
  static const std::regex sampler(R"(^[iu]?(sampler|image)(1D|2D|3D|Cube|2DRect|Buffer|2DMS)(Array)?(Shadow)?$)");
  static const std::regex vec(R"(^(uvec[234]|d?mat[234]x[234]|dmat[234])$)");
  if (id == "sampler2D" || id == "samplerCube") return false;
  return std::regex_match(id, sampler) || std::regex_match(id, vec);
}
// The GLSL ES 1.00 source of WebGL on a desktop core context: the prelude renames the old keywords. ES contexts take the source as it is.
std::string translate(const std::string& src, std::uint32_t type, bool es, std::uint32_t extOn, int webgl, std::string& err) {
  if (es) return src;
  {   // GLSL ES 3.00 is close enough to GLSL 330 core to run as it is with the version line replaced
    std::size_t at = src.find("#version");
    const bool es3 = at != std::string::npos && src.compare(at, 15, "#version 300 es") == 0;
    if (es3) {
      std::string body = src.substr(at + 15 + (at + 15 < src.size() && src[at + 15] == '\n' ? 1 : 0));
      // three.js and others `#define gl_FragColor pc_fragColor`: a macro named after a compatibility built-in is refused by some drivers, and ES 3.00 has no such built-in, so the name is free to rename
      for (const char* name : {"gl_FragColor", "gl_FragData", "gl_MaxDrawBuffers"}) {   // the last: MAX_DRAW_BUFFERS is reported as 4, not what the driver has
        const std::string from = name;
        replaceIdent(body, from, from == "gl_MaxDrawBuffers" ? "4" : std::string("zn_") + (name + 3));
      }
      if (type == GL_VERTEX_SHADER && body.find("#if") == std::string::npos) {   // (a declaration under #if may not exist: left alone) an output the shader leaves unwritten is zero in WebGL 2 (transform feedback shows it); a driver leaves it undefined
        static const std::regex outDecl(R"(\bout\s+(?:lowp\s+|mediump\s+|highp\s+)?((?:u?int|float|[ui]?vec[234]|mat[234](?:x[234])?))\s+(\w+)\s*;)");
        static const std::regex mainOpen(R"(\bvoid\s+main\s*\(\s*(?:void)?\s*\)\s*\{)");
        std::smatch mm;
        if (std::regex_search(body, mm, mainOpen)) {
          std::string init;
          for (std::sregex_iterator it(body.begin(), body.end(), outDecl), end; it != end; ++it) {
            const std::string t = (*it)[1];
            init += (*it)[2].str() + " = " + t + (t[0] == 'u' && t[1] == 'i' ? "(0u)" : t[0] == 'i' || t == "int" ? "(0)" : "(0.0)") + ";";
          }
          body.insert(static_cast<std::size_t>(mm.position(0) + mm.length(0)), init);
        }
      }
      return "#version 330 core\n" + body;
    }
  }
  if (webgl == 1 && src.find("#version 300 es") != std::string::npos) { err = "ERROR: 0:1: '#version' : WebGL 1 shaders are written in GLSL ES 1.00"; return ""; }
  if (const std::string bad = essl1Violation(src, webgl, type); !bad.empty()) { err = bad; return ""; }
  std::string body;
  std::string pre = "#version 330 core\n";
  std::string tail;
  std::uint32_t active = 0;   // the extensions this shader enabled with #extension (a built-in of an extension needs both the pragma and getExtension)
  std::size_t pos = 0;
  while (pos < src.size()) {   // drop #version 100; #extension lines become blank lines after their check
    std::size_t nl = src.find('\n', pos);
    std::string line = src.substr(pos, nl == std::string::npos ? std::string::npos : nl - pos);
    std::size_t k = line.find_first_not_of(" \t");
    bool directive = k != std::string::npos && line[k] == '#';
    std::size_t w = directive ? line.find_first_not_of(" \t", k + 1) : std::string::npos;
    if (directive && line.compare(k + 1, 7, "version") == 0 && w == k + 1) body += "\n";
    else if (w != std::string::npos && line.compare(w, 9, "extension") == 0) {   // #extension NAME : BEHAVIOR
      static const std::regex ext(R"(extension\s+(\w+)\s*:\s*(\w+))");
      std::smatch m;
      const std::string rest = line.substr(w);
      if (!std::regex_search(rest, m, ext)) { err = "ERROR: 0:1: '#extension' : invalid extension directive"; return ""; }
      const std::string name = m[1], how = m[2];
      if (how != "enable" && how != "require" && how != "warn" && how != "disable") { err = "ERROR: 0:1: '#extension' : invalid behavior '" + how + "'"; return ""; }
      const ExtDef* def = nullptr;
      for (const ExtDef& e : kExtensions) if (e.glsl && name == e.glsl && (e.webgl & (1u << (webgl - 1))) && ((extOn >> static_cast<int>(e.id)) & 1)) def = &e;
      if (name == "all" && (how == "enable" || how == "require")) { err = "ERROR: 0:1: '#extension' : 'all' extension cannot be enabled or required"; return ""; }
      if (def && how != "disable") active |= 1u << static_cast<int>(def->id);
      else if (!def && how == "require") { err = "ERROR: 0:1: '#extension' : extension '" + name + "' is not supported"; return ""; }
      body += "\n";
    }
    else {
      if (w != std::string::npos && (line.compare(w, 2, "if") == 0 || line.compare(w, 4, "elif") == 0)) {   // GL_xxx macros are reserved in GLSL: the conditions of the page read ZN_GL_xxx, defined below
        static const std::regex macro(R"(\bGL_\w+)");
        std::string out;
        auto last = line.cbegin();
        for (std::sregex_iterator it(line.begin(), line.end(), macro), end; it != end; ++it) { out.append(last, line.cbegin() + it->position()); out += "ZN_" + it->str(); last = line.cbegin() + it->position() + it->length(); }
        out.append(last, line.cend());
        body += out + "\n";
      } else body += line + "\n";
    }
    if (nl == std::string::npos) break;
    pos = nl + 1;
  }
  const bool drawBuf = webgl == 1 && ((extOn >> static_cast<int>(Ext::DrawBuffers)) & 1);   // (WEBGL_draw_buffers: gl_FragData[1..3] and gl_MaxDrawBuffers come with getExtension, no pragma needed)
  auto has = [&](Ext e) { return (active >> static_cast<int>(e)) & 1; };
  pre += "#define texture2D texture\n#define textureCube texture\n#define texture2DProj textureProj\n";
  replaceIdent(body, "__VERSION__", "100");
  {
    const std::string t = withoutComments(body);
    std::set<std::string> seen;
    for (std::size_t i = 0; i < t.size();) {
      if (!(std::isalpha(static_cast<unsigned char>(t[i])) || t[i] == '_')) { ++i; continue; }
      std::size_t j = i;
      while (j < t.size() && (std::isalnum(static_cast<unsigned char>(t[j])) || t[j] == '_')) ++j;
      const std::string id = t.substr(i, j - i);
      i = j;
      if (desktopOnlyWord(id) && seen.insert(id).second) pre += "#define " + id + " zn_" + id + "\n";
    }
  }
  for (const ExtDef& e : kExtensions) if (e.glsl && (e.webgl & (1u << (webgl - 1))) && ((extOn >> static_cast<int>(e.id)) & 1)) pre += std::string("#define ZN_") + e.glsl + " 1\n";   // enabled by getExtension: the macro exists
  pre += type == GL_VERTEX_SHADER ? "#define ZN_GL_ES 1\n" : "#define ZN_GL_ES 1\n#define ZN_GL_FRAGMENT_PRECISION_HIGH 1\n";
  if (type != GL_FRAGMENT_SHADER || !has(Ext::StdDerivatives)) pre += "#define dFdx zn_no_OES_standard_derivatives\n#define dFdy zn_no_OES_standard_derivatives\n#define fwidth zn_no_OES_standard_derivatives\n";   // desktop GLSL has them: hide what ESSL 1.00 needs the extension (and a fragment shader) for
  if (type == GL_VERTEX_SHADER) pre += "#define attribute in\n#define varying out\n#define texture2DLod textureLod\n#define textureCubeLod textureLod\n#define texture2DProjLod textureProjLod\n";
  else {
    if (has(Ext::ShaderTexLod)) pre += "#define texture2DLodEXT textureLod\n#define texture2DProjLodEXT textureProjLod\n#define textureCubeLodEXT textureLod\n#define texture2DGradEXT textureGrad\n#define texture2DProjGradEXT textureProjGrad\n#define textureCubeGradEXT textureGrad\n";
    pre += "#define varying in\n";
    replaceIdent(body, "gl_FragDepth", "zn_no_gl_FragDepth");   // not in ESSL 1.00; gl_FragDepthEXT is, with the extension
    if (has(Ext::FragDepth)) replaceIdent(body, "gl_FragDepthEXT", "gl_FragDepth");
    replaceIdent(body, "gl_MaxDrawBuffers", drawBuf ? "4" : "1");   // (1 without the extension; fixed when the shader is compiled)
    replaceIdent(body, "gl_MaxDrawBuffersEXT", drawBuf ? "4" : "zn_no_gl_MaxDrawBuffersEXT");
    const bool usesColor = body.find("gl_FragColor") != std::string::npos;
    if (drawBuf) {
      pre += "layout(location = 0) out vec4 zn_FragData[4];\n";
      replaceIdent(body, "gl_FragData", "zn_FragData");
      if (usesColor && !has(Ext::DrawBuffers)) replaceIdent(body, "gl_FragColor", "zn_FragData[0]");   // without the shader's own #extension gl_FragColor stays the first buffer
      else if (usesColor) {   // gl_FragColor writes every draw buffer
        pre += "vec4 zn_FragColor;\n";
        replaceIdent(body, "gl_FragColor", "zn_FragColor");
        replaceIdent(body, "main", "zn_user_main");
        tail = "\nvoid main() { zn_user_main(); zn_FragData[0] = zn_FragColor; zn_FragData[1] = zn_FragColor; zn_FragData[2] = zn_FragColor; zn_FragData[3] = zn_FragColor; }\n";
      }
    } else if (body.find("gl_FragData") != std::string::npos) { pre += "out vec4 zn_FragData[1];\n"; replaceIdent(body, "gl_FragData", "zn_FragData"); }   // gl_FragData[0] without the draw-buffers extension
    else { pre += "out vec4 zn_FragColor;\n"; replaceIdent(body, "gl_FragColor", "zn_FragColor"); }
  }
  return pre + body + tail;
}


// the colour numbers a fragment shader writes, as the class of each ('f', 'i', 'u'; 0: not written): from its `out` declarations (ES 3.00) or gl_FragColor / gl_FragData (ES 1.00)
void fragOutputs(const std::string& src, char out[4]) {
  std::fill(out, out + 4, 0);
  std::string t;   // comments out
  for (std::size_t i = 0; i < src.size(); ++i) {
    if (src.compare(i, 2, "//") == 0) { while (i < src.size() && src[i] != '\n') ++i; t += '\n'; }
    else if (src.compare(i, 2, "/*") == 0) { std::size_t e = src.find("*/", i + 2); i = e == std::string::npos ? src.size() : e + 1; t += ' '; }
    else t += src[i];
  }
  if (t.find("#version 300 es") == std::string::npos) {   // ESSL 1.00: gl_FragColor writes every draw buffer, gl_FragData[n] the one it names (a computed index: all)
    static const std::regex data(R"(gl_FragData\s*\[\s*(\w+)\s*\])");
    static const std::regex pragma(R"(#\s*extension\s+GL_EXT_draw_buffers\s*:\s*(enable|require))");
    const bool usesColor = t.find("gl_FragColor") != std::string::npos;
    if (usesColor) { if (std::regex_search(t, pragma)) std::fill(out, out + 4, 'f'); else out[0] = 'f'; }   // (the pragma makes gl_FragColor broadcast)
    if (t.find("gl_FragData") == std::string::npos) return;
    for (std::sregex_iterator it(t.begin(), t.end(), data), end; it != end; ++it) {
      const std::string idx = (*it)[1];
      if (idx.size() == 1 && idx[0] >= '0' && idx[0] <= '3') out[idx[0] - '0'] = 'f';
      else std::fill(out, out + 4, 'f');
    }
    return;
  }
  static const std::regex decl(R"((layout\s*\(([^)]*)\)\s*)?(?:flat\s+|smooth\s+|centroid\s+)?\bout\s+(?:lowp\s+|mediump\s+|highp\s+)?(\w+)\s+(\w+)\s*(?:\[\s*([^\]]*)\])?\s*;)");
  static const std::regex loc(R"(location\s*=\s*(\d+))");
  for (std::sregex_iterator it(t.begin(), t.end(), decl), end; it != end; ++it) {
    const std::smatch& m = *it;
    const std::string type = m[3];
    const char kind = type[0] == 'i' ? 'i' : type[0] == 'u' ? 'u' : 'f';
    int first = 0, count = 1;
    std::smatch lm; const std::string lay = m[2];
    if (std::regex_search(lay, lm, loc)) first = std::stoi(lm[1]);
    if (m[5].matched) { try { count = std::stoi(m[5]); } catch (...) { count = 4; } }
    for (int k = first; k < first + count && k < 4; ++k) out[k] = kind;
  }
}

// true when every float-typed declaration has a precision (default or qualifier)
bool fragmentPrecisionOk(const std::string& src) {
  std::string t;   // comments out
  for (std::size_t i = 0; i < src.size(); ++i) {
    if (src.compare(i, 2, "//") == 0) { while (i < src.size() && src[i] != '\n') ++i; t += '\n'; }
    else if (src.compare(i, 2, "/*") == 0) { std::size_t e = src.find("*/", i + 2); i = e == std::string::npos ? src.size() : e + 1; t += ' '; }
    else t += src[i];
  }
  auto isId = [](char c) { return std::isalnum(static_cast<unsigned char>(c)) || c == '_'; };
  std::string prev;
  bool defaultFloat = false;
  for (std::size_t i = 0; i < t.size();) {
    if (!isId(t[i]) || std::isdigit(static_cast<unsigned char>(t[i]))) { ++i; continue; }
    std::size_t j = i;
    while (j < t.size() && isId(t[j])) ++j;
    std::string id = t.substr(i, j - i);
    if (id == "precision") {   // precision <q> <type>;
      std::size_t e = t.find(';', j);
      std::string rest = t.substr(j, e == std::string::npos ? std::string::npos : e - j);
      if (rest.find("float") != std::string::npos) defaultFloat = true;
      i = e == std::string::npos ? t.size() : e;
      prev.clear();
      continue;
    }
    const bool floatType = id == "float" || id == "vec2" || id == "vec3" || id == "vec4" || id == "mat2" || id == "mat3" || id == "mat4";
    if (floatType && !defaultFloat) {
      std::size_t k = j;
      while (k < t.size() && std::isspace(static_cast<unsigned char>(t[k]))) ++k;
      const bool ctor = k < t.size() && t[k] == '(';
      if (!ctor && prev != "lowp" && prev != "mediump" && prev != "highp") return false;
    }
    prev = id;
    i = j;
  }
  return true;
}

// WebGL format/type table (spec 5.14.8): which (format, type) pairs texImage2D accepts, and the bytes per pixel.
}  // namespace
bool formatType(std::uint32_t format, std::uint32_t type, int& bpp) {   // shared with webgl1_more.cpp
  int ch = format == GL_ALPHA || format == GL_LUMINANCE ? 1 : format == GL_LUMINANCE_ALPHA ? 2 : format == GL_RGB ? 3 : format == GL_RGBA ? 4 : 0;
  if (!ch) return false;
  if (type == GL_UNSIGNED_BYTE) { bpp = ch; return true; }
  if (type == GL_UNSIGNED_SHORT_5_6_5 && format == GL_RGB) { bpp = 2; return true; }
  if ((type == GL_UNSIGNED_SHORT_4_4_4_4 || type == GL_UNSIGNED_SHORT_5_5_5_1) && format == GL_RGBA) { bpp = 2; return true; }
  return false;
}

bool pot(int v) { return (v & (v - 1)) == 0; }   // (a zero-sized level counts)
// ---- the pixel formats the WebGL 1 extensions add (OES_texture_float / _half_float, WEBGL_depth_texture, EXT_sRGB) and what the driver gets for them
GlFmt glFormat(std::uint32_t format, std::uint32_t type, bool es) {
  if (es) return {format, format, type, 0};   // OpenGL ES 2.0 takes the WebGL pair as it is (with the OES extensions)
  const bool fl = type == GL_FLOAT, hf = type == kHalfFloatOes, ub = type == GL_UNSIGNED_BYTE;
  GlFmt r{0, format, hf ? GL_HALF_FLOAT : type, 0};
  switch (format) {
    case GL_ALPHA: case GL_LUMINANCE: r.format = GL_RED; r.internal = fl ? GL_R32F : hf ? GL_R16F : GL_R8; r.swizzle = format == GL_ALPHA ? 1 : 2; break;
    case GL_LUMINANCE_ALPHA: r.format = GL_RG; r.internal = fl ? GL_RG32F : hf ? GL_RG16F : GL_RG8; r.swizzle = 3; break;
    case GL_RGB: r.internal = fl ? GL_RGB32F : hf ? GL_RGB16F : ub ? GL_RGB8 : GL_RGB; break;
    case GL_RGBA: r.internal = fl ? GL_RGBA32F : hf ? GL_RGBA16F : ub ? GL_RGBA8 : GL_RGBA; break;
    case kSrgbExt: r.format = GL_RGB; r.internal = GL_SRGB8; break;
    case kSrgbAlphaExt: r.format = GL_RGBA; r.internal = GL_SRGB8_ALPHA8; break;
    case GL_DEPTH_COMPONENT: r.internal = type == GL_UNSIGNED_SHORT ? GL_DEPTH_COMPONENT16 : GL_DEPTH_COMPONENT24; break;
    case kDepthStencilFmt: r.internal = GL_DEPTH24_STENCIL8; break;
  }
  return r;
}

// (format, type) pairs of WebGL 1 with the extensions the page enabled; bpp: bytes of a pixel
bool WebGL1::v1FormatType(std::uint32_t format, std::uint32_t type, int& bpp) const {
  if (formatType(format, type, bpp)) return true;
  const int ch = format == GL_ALPHA || format == GL_LUMINANCE ? 1 : format == GL_LUMINANCE_ALPHA ? 2 : format == GL_RGB ? 3 : format == GL_RGBA ? 4 : 0;
  if (ch && type == GL_FLOAT && extOn(Ext::TexFloat)) { bpp = 4 * ch; return true; }
  if (ch && type == kHalfFloatOes && extOn(Ext::TexHalf)) { bpp = 2 * ch; return true; }
  if (extOn(Ext::DepthTexture)) {
    if (format == GL_DEPTH_COMPONENT && (type == GL_UNSIGNED_SHORT || type == GL_UNSIGNED_INT)) { bpp = type == GL_UNSIGNED_SHORT ? 2 : 4; return true; }
    if (format == kDepthStencilFmt && type == kUnsignedInt248) { bpp = 4; return true; }
  }
  if (extOn(Ext::Srgb) && type == GL_UNSIGNED_BYTE && (format == kSrgbExt || format == kSrgbAlphaExt)) { bpp = format == kSrgbExt ? 3 : 4; return true; }
  return false;
}
bool WebGL1::v1Format(std::uint32_t format) const {
  return format == GL_ALPHA || format == GL_RGB || format == GL_RGBA || format == GL_LUMINANCE || format == GL_LUMINANCE_ALPHA ||
         (extOn(Ext::DepthTexture) && (format == GL_DEPTH_COMPONENT || format == kDepthStencilFmt)) || (extOn(Ext::Srgb) && (format == kSrgbExt || format == kSrgbAlphaExt));
}
bool WebGL1::v1Type(std::uint32_t type) const {
  return type == GL_UNSIGNED_BYTE || type == GL_UNSIGNED_SHORT_5_6_5 || type == GL_UNSIGNED_SHORT_4_4_4_4 || type == GL_UNSIGNED_SHORT_5_5_5_1 || (type == GL_FLOAT && extOn(Ext::TexFloat)) ||
         (type == kHalfFloatOes && extOn(Ext::TexHalf)) || (extOn(Ext::DepthTexture) && (type == GL_UNSIGNED_SHORT || type == GL_UNSIGNED_INT || type == kUnsignedInt248));
}

unsigned WebGL1::bit(std::uint32_t code) { return 1u << (code - GL_INVALID_ENUM); }

bool WebGL1::enableExt(Ext e) {
  if (!extSupported(e)) return false;
  const bool was = extOn(e);
  extOn_ |= 1u << static_cast<int>(e);
  ++fbGen_;
  if (version_ == 1 && !was && e == Ext::TexFloat) enableExt(Ext::ColorBufFloatWebgl);   // the texture extensions bring their rendering extension along, as in browsers
  if (version_ == 1 && !was && e == Ext::TexHalf) enableExt(Ext::ColorBufHalf);
  if (!was && (e == Ext::TexFloatLinear || e == Ext::TexHalfLinear)) for (auto& t : textures_) if (t.second.f32 || t.second.f16) refreshSampling(t.first);
  return true;
}
// a float texture with a linear filter is incomplete (samples black) until OES_texture_float_linear / OES_texture_half_float_linear is enabled; core GL would just filter, so the swizzle does the blacking
void WebGL1::refreshSampling(Id id) {
  auto it = textures_.find(id);
  if (it == textures_.end() || gl_.info().es || !it->second.target || it->second.target == GL_TEXTURE_3D || it->second.target == GL_TEXTURE_2D_ARRAY) return;
  Tex& t = it->second;
  const bool filtered = t.magF == GL_LINEAR || (t.minF != GL_NEAREST && t.minF != GL_NEAREST_MIPMAP_NEAREST);
  const auto pow2 = [](int v) { return (v & (v - 1)) == 0; };
  const bool npotIncomplete = version_ != 2 && (t.target == GL_TEXTURE_2D || t.target == GL_TEXTURE_CUBE_MAP) && t.w > 0 && (!pow2(t.w) || !pow2(t.h)) && (t.wrapS != GL_CLAMP_TO_EDGE || t.wrapT != GL_CLAMP_TO_EDGE || (t.minF != GL_NEAREST && t.minF != GL_LINEAR));   // WebGL 1: a non-power-of-two texture needs CLAMP_TO_EDGE and no mipmaps
  const bool black = npotIncomplete || (filtered && ((t.f32 && !extOn(Ext::TexFloatLinear)) || (t.f16 && !extOn(Ext::TexHalfLinear))));
  static const GLint sw[7][4] = {{GL_RED, GL_GREEN, GL_BLUE, GL_ALPHA}, {GL_ZERO, GL_ZERO, GL_ZERO, GL_RED}, {GL_RED, GL_RED, GL_RED, GL_ONE}, {GL_RED, GL_RED, GL_RED, GL_GREEN}, {GL_ZERO, GL_ZERO, GL_ZERO, GL_ONE}, {GL_ZERO, GL_ZERO, GL_ZERO, GL_ALPHA}, {GL_RED, GL_RED, GL_RED, GL_ALPHA}};   // 4: black; 5, 6: ALPHA and LUMINANCE_ALPHA backed by RGBA (copyTexImage2D)
  const GLenum bt = t.target;
  const Id cur = boundTex(bt);
  glBindTexture(bt, t.name);
  glTexParameteriv(bt, GL_TEXTURE_SWIZZLE_RGBA, sw[black ? 4 : t.swz]);
  glBindTexture(bt, cur ? textures_[cur].name : 0);
  t.black = black;
}

// the spec strings of webgl_ext.h against this driver
bool WebGL1::probe(const char* spec) const {
  const std::string all = spec;
  for (std::size_t from = 0; from <= all.size();) {
    std::size_t bar = all.find('|', from);
    if (bar == std::string::npos) bar = all.size();
    bool ok = true;
    for (std::size_t i = from; i < bar;) {
      std::size_t sp = all.find(' ', i);
      if (sp == std::string::npos || sp > bar) sp = bar;
      const std::string tok = all.substr(i, sp - i);
      i = sp + 1;
      if (tok.empty()) continue;
      if (tok == "-") ok = false;
      else if (tok == "core") {}
      else if (tok == "try_s3tc_srgb") {   // one 4 x 4 block of COMPRESSED_SRGB_S3TC_DXT1_EXT
        GLuint t = 0;
        while (glGetError() != GL_NO_ERROR) {}
        glGenTextures(1, &t);
        glBindTexture(GL_TEXTURE_2D, t);
        const std::uint8_t block[8] = {};
        glCompressedTexImage2D(GL_TEXTURE_2D, 0, 0x8C4C, 4, 4, 0, 8, block);
        ok = ok && glGetError() == GL_NO_ERROR;
        glBindTexture(GL_TEXTURE_2D, 0);
        glDeleteTextures(1, &t);
      } else if ((tok[0] == 'V' || tok[0] == 'E') && std::isdigit(static_cast<unsigned char>(tok[1]))) {
        const int major = tok[1] - '0', minor = tok[3] - '0';
        ok = ok && gl_.info().es == (tok[0] == 'E') && (gl_.info().major > major || (gl_.info().major == major && gl_.info().minor >= minor));
      } else ok = ok && gl_.hasExtension(tok.c_str());
    }
    if (ok) return true;
    from = bar + 1;
  }
  return false;
}

bool WebGL1::create(Api api, int width, int height, std::string& err, int version) {
  version_ = version;
  if (version == 2 && api == Api::Gles2) { err = "WebGL 2 needs GL 3.3 core or GLES 3"; return false; }
  if (!gl_.create(api, width, height, false, err)) return false;
  GLint m = 0;
  glGetIntegerv(GL_MAX_TEXTURE_SIZE, &m);
  maxTexSize_ = m;
  glGetIntegerv(GL_MAX_3D_TEXTURE_SIZE, &m);
  max3dSize_ = m > 0 ? m : 256;
  for (const ExtDef& e : kExtensions) {
    const char* spec = gl_.info().es ? (version == 2 ? e.es3 : e.es2) : e.gl;
    if ((e.webgl & (1u << (version - 1))) && probe(spec)) extSup_ |= 1u << static_cast<int>(e.id);
  }
  if (!gl_.info().es) { glGenVertexArrays(1, &vao_); glBindVertexArray(vao_); glEnable(GL_PROGRAM_POINT_SIZE); glEnable(GL_FRAMEBUFFER_SRGB); }   // sRGB attachments always convert in WebGL 2   // core profiles need the switch for gl_PointSize, WebGL always honours it   // core contexts have no default VAO; the WebGL1 attribute state lives in this one
  while (glGetError() != GL_NO_ERROR) {}
  return true;
}

// canvas.width / canvas.height was set: a new drawing buffer, transparent black, depth 1, stencil 0, whatever state the context is in
void WebGL1::resizeDrawingBuffer(int w, int h) {
  gl_.resize(w, h);
  compositeClear();
}
// the drawing buffer after a composite (no preserveDrawingBuffer): transparent black, depth 1, stencil 0, whatever state the context is in
void WebGL1::compositeClear() {
  dirty_ = false;
  GLint draw = 0, read = 0;
  glGetIntegerv(GL_DRAW_FRAMEBUFFER_BINDING, &draw);
  glGetIntegerv(GL_READ_FRAMEBUFFER_BINDING, &read);
  GLboolean cm[4], dm, cmi[4][4] = {};
  GLint sm, cs;
  GLfloat cc[4], cd;
  const GLboolean sc = glIsEnabled(GL_SCISSOR_TEST);
  glGetBooleanv(GL_COLOR_WRITEMASK, cm);
  glGetBooleanv(GL_DEPTH_WRITEMASK, &dm); glGetIntegerv(GL_STENCIL_WRITEMASK, &sm);
  if (extOn(Ext::DrawBuffersIndexed)) for (GLuint i = 0; i < 4; ++i) glGetBooleani_v(GL_COLOR_WRITEMASK, i, cmi[i]);   // one mask per draw buffer
  glGetFloatv(GL_COLOR_CLEAR_VALUE, cc); glGetFloatv(GL_DEPTH_CLEAR_VALUE, &cd); glGetIntegerv(GL_STENCIL_CLEAR_VALUE, &cs);
  glBindFramebuffer(GL_FRAMEBUFFER, gl_.framebuffer());
  glDisable(GL_SCISSOR_TEST);
  glColorMask(GL_TRUE, GL_TRUE, GL_TRUE, GL_TRUE); glDepthMask(GL_TRUE); glStencilMask(~0u);
  glClearColor(0, 0, 0, 0); glClearDepth(1); glClearStencil(0);
  const GLenum all = GL_COLOR_ATTACHMENT0, kept = defaultDraw_[0] == GL_BACK ? GL_COLOR_ATTACHMENT0 : GL_NONE;   // the canvas is cleared whatever its draw buffer says
  glDrawBuffers(1, &all);
  glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT | GL_STENCIL_BUFFER_BIT);
  glDrawBuffers(1, &kept);
  glColorMask(cm[0], cm[1], cm[2], cm[3]); glDepthMask(dm); glStencilMask(static_cast<GLuint>(sm));
  if (extOn(Ext::DrawBuffersIndexed)) for (GLuint i = 0; i < 4; ++i) glColorMaski(i, cmi[i][0], cmi[i][1], cmi[i][2], cmi[i][3]);
  glClearColor(cc[0], cc[1], cc[2], cc[3]); glClearDepth(cd); glClearStencil(cs);
  if (sc) glEnable(GL_SCISSOR_TEST);
  glBindFramebuffer(GL_DRAW_FRAMEBUFFER, static_cast<GLuint>(draw));
  glBindFramebuffer(GL_READ_FRAMEBUFFER, static_cast<GLuint>(read));
}

std::uint32_t WebGL1::getError() {
  while (true) {   // errors of the driver that validation missed are kept visible rather than lost
    GLenum e = glGetError();
    if (e == GL_NO_ERROR) break;
    if (e >= GL_INVALID_ENUM && e <= GL_INVALID_FRAMEBUFFER_OPERATION && e != 0x0503 && e != 0x0504) error(e);
  }
  for (std::uint32_t code = GL_INVALID_ENUM; code <= GL_INVALID_FRAMEBUFFER_OPERATION; ++code)
    if (flags_ & bit(code)) { flags_ &= ~bit(code); return code; }
  return GL_NO_ERROR;
}

// ---- state
void WebGL1::enable(std::uint32_t cap) {
  if (version_ == 2 && cap == GL_RASTERIZER_DISCARD) { glEnable(cap); return; }
  switch (cap) { case GL_BLEND: case GL_CULL_FACE: case GL_DEPTH_TEST: case GL_DITHER: case GL_POLYGON_OFFSET_FILL: case GL_SAMPLE_ALPHA_TO_COVERAGE: case GL_SAMPLE_COVERAGE: case GL_SCISSOR_TEST: case GL_STENCIL_TEST: glEnable(cap); return; }
  error(GL_INVALID_ENUM);
}
void WebGL1::disable(std::uint32_t cap) {
  if (version_ == 2 && cap == GL_RASTERIZER_DISCARD) { glDisable(cap); return; }
  switch (cap) { case GL_BLEND: case GL_CULL_FACE: case GL_DEPTH_TEST: case GL_DITHER: case GL_POLYGON_OFFSET_FILL: case GL_SAMPLE_ALPHA_TO_COVERAGE: case GL_SAMPLE_COVERAGE: case GL_SCISSOR_TEST: case GL_STENCIL_TEST: glDisable(cap); return; }
  error(GL_INVALID_ENUM);
}
void WebGL1::viewport(int x, int y, int w, int h) { if (w < 0 || h < 0) return error(GL_INVALID_VALUE); glViewport(x, y, w, h); }
void WebGL1::scissor(int x, int y, int w, int h) { if (w < 0 || h < 0) return error(GL_INVALID_VALUE); glScissor(x, y, w, h); }
void WebGL1::clearColor(float r, float g, float b, float a) { glClearColor(r, g, b, a); }
void WebGL1::clear(std::uint32_t mask) {
  if (mask & ~static_cast<std::uint32_t>(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT | GL_STENCIL_BUFFER_BIT)) return error(GL_INVALID_VALUE);
  if (!framebufferReady()) return error(GL_INVALID_FRAMEBUFFER_OPERATION);
  if ((mask & GL_COLOR_BUFFER_BIT) && !clearClassOk(-1, 'f')) return error(GL_INVALID_OPERATION);   // an integer attachment cannot take clear()
  if (!fbo_) dirty_ = true;
  glClear(mask);
}
void WebGL1::domUnpack(bool on) {
  if (version_ != 2) return;
  glPixelStorei(GL_UNPACK_ROW_LENGTH, on ? 0 : unpackRowLength_); glPixelStorei(GL_UNPACK_IMAGE_HEIGHT, on ? 0 : unpackImageHeight_);
  glPixelStorei(GL_UNPACK_SKIP_PIXELS, on ? 0 : unpackSkipPixels_); glPixelStorei(GL_UNPACK_SKIP_ROWS, on ? 0 : unpackSkipRows_); glPixelStorei(GL_UNPACK_SKIP_IMAGES, on ? 0 : unpackSkipImages_);
}
void WebGL1::pixelStorei(std::uint32_t pname, int value) {
  if (pname == GL_UNPACK_ALIGNMENT || pname == GL_PACK_ALIGNMENT) {
    if (value != 1 && value != 2 && value != 4 && value != 8) return error(GL_INVALID_VALUE);
    if (pname == GL_UNPACK_ALIGNMENT) unpackAlignment_ = value; else packAlignment_ = value;
    glPixelStorei(pname, value);
    return;
  }
  if (version_ == 2) {   // row length and skips
    int* slot = nullptr;
    switch (pname) {
      case GL_PACK_ROW_LENGTH: slot = &packRowLength_; break;
      case GL_PACK_SKIP_PIXELS: slot = &packSkipPixels_; break;
      case GL_PACK_SKIP_ROWS: slot = &packSkipRows_; break;
      case GL_UNPACK_ROW_LENGTH: slot = &unpackRowLength_; break;
      case GL_UNPACK_IMAGE_HEIGHT: slot = &unpackImageHeight_; break;
      case GL_UNPACK_SKIP_PIXELS: slot = &unpackSkipPixels_; break;
      case GL_UNPACK_SKIP_ROWS: slot = &unpackSkipRows_; break;
      case GL_UNPACK_SKIP_IMAGES: slot = &unpackSkipImages_; break;
    }
    if (slot) { if (value < 0) return error(GL_INVALID_VALUE); *slot = value; glPixelStorei(pname, value); return; }
  }
  if (pname == 0x9240) { unpackFlipY_ = value != 0; return; }          // UNPACK_FLIP_Y_WEBGL, PREMULTIPLY_ALPHA, COLORSPACE_CONVERSION: kept here, applied by the binding on image sources
  if (pname == 0x9241) { unpackPremultiply_ = value != 0; return; }
  if (pname == 0x9243) { if (value != 0 && value != 0x9244) return error(GL_INVALID_VALUE); unpackColorspace_ = value; return; }
  error(GL_INVALID_ENUM);
}

// ---- buffers
Id WebGL1::createBuffer() { Buf b; glGenBuffers(1, &b.name); Id id = nextId_++; buffers_[id] = b; return id; }
void WebGL1::deleteBuffer(Id id) {
  auto it = buffers_.find(id);
  if (it == buffers_.end() || it->second.deleted) return;   // null and already deleted: nothing happens
  if (arrayBuffer_ == id) { arrayBuffer_ = 0; glBindBuffer(GL_ARRAY_BUFFER, 0); }
  if (elementBuffer_ == id) { elementBuffer_ = 0; glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, 0); }
  for (Attrib& a : attribs_) if (a.buffer == id) a.buffer = 0;
  for (auto& o : otherBuffers_) if (o.second == id) { o.second = 0; glBindBuffer(o.first, 0); }
  for (auto& o : indexed_) if (o.second.buffer == id && idxCurrent(o.first)) { o.second.buffer = 0; glBindBufferBase(static_cast<std::uint32_t>(o.first >> 32), static_cast<std::uint32_t>(o.first & 0xFF), 0); }
  it->second.deleted = true;   // a buffer that another vertex array still uses lives on until it lets go
  releaseBuffers();
}
// the deleted buffers that no vertex array holds any more
void WebGL1::releaseBuffers() {
  for (auto it = buffers_.begin(); it != buffers_.end();) {
    bool used = false;
    if (it->second.deleted) {
      auto uses = [&](const Vao& v) { for (const Attrib& a : v.attribs) if (a.buffer == it->first) return true; return v.element == it->first; };
      for (auto& v : vaos_) if (v.first != curVao_ && uses(v.second)) used = true;
      if (curVao_ && uses(defaultVao_)) used = true;
      for (const Attrib& a : attribs_) if (a.buffer == it->first) used = true;   // the bound vertex array's own state is live, not in its Vao
      if (elementBuffer_ == it->first) used = true;
      for (auto& x : indexed_) if (x.second.buffer == it->first) used = true;   // a transform feedback object other than the bound one still has it
    }
    if (it->second.deleted && !used) { glDeleteBuffers(1, &it->second.name); it = buffers_.erase(it); }
    else ++it;
  }
}
bool WebGL1::isBuffer(Id id) const { auto it = buffers_.find(id); return it != buffers_.end() && it->second.bound && !it->second.deleted; }   // a buffer is an object once it has been bound
bool WebGL1::bufferTargetOk(std::uint32_t t) const {
  if (t == GL_ARRAY_BUFFER || t == GL_ELEMENT_ARRAY_BUFFER) return true;
  return version_ == 2 && (t == GL_UNIFORM_BUFFER || t == GL_COPY_READ_BUFFER || t == GL_COPY_WRITE_BUFFER || t == GL_PIXEL_PACK_BUFFER || t == GL_PIXEL_UNPACK_BUFFER || t == GL_TRANSFORM_FEEDBACK_BUFFER);
}
Id& WebGL1::bufferSlot(std::uint32_t t) { return t == GL_ARRAY_BUFFER ? arrayBuffer_ : t == GL_ELEMENT_ARRAY_BUFFER ? elementBuffer_ : otherBuffers_[t]; }
void WebGL1::bindBuffer(std::uint32_t target, Id id) {
  if (!bufferTargetOk(target)) return error(GL_INVALID_ENUM);
  std::uint32_t name = 0;
  if (id) {
    auto it = buffers_.find(id);
    if (it == buffers_.end() || it->second.deleted) return error(GL_INVALID_OPERATION);
    // WebGL 1: a buffer keeps the first target it was bound to. WebGL 2: only the element-array / other split is kept.
    const std::uint32_t pin = version_ == 2 ? (target == GL_ELEMENT_ARRAY_BUFFER ? GL_ELEMENT_ARRAY_BUFFER : GL_ARRAY_BUFFER) : target;
    const bool copy = target == GL_COPY_READ_BUFFER || target == GL_COPY_WRITE_BUFFER;   // copy targets may hold either kind of buffer
    if (!copy && it->second.target && it->second.target != pin) return error(GL_INVALID_OPERATION);
    if (!it->second.target) it->second.target = pin;
    it->second.bound = true;
    name = it->second.name;
  }
  bufferSlot(target) = id;
  glBindBuffer(target, name);
}
void WebGL1::bufferData(std::uint32_t target, std::int64_t size, const void* data, std::uint32_t usage) {
  if (!bufferTargetOk(target)) return error(GL_INVALID_ENUM);
  const bool v2 = version_ == 2;
  if (usage != GL_STREAM_DRAW && usage != GL_STATIC_DRAW && usage != GL_DYNAMIC_DRAW && !(v2 && (usage == GL_STREAM_READ || usage == GL_STREAM_COPY || usage == GL_STATIC_READ || usage == GL_STATIC_COPY || usage == GL_DYNAMIC_READ || usage == GL_DYNAMIC_COPY))) return error(GL_INVALID_ENUM);
  if (size < 0) return error(GL_INVALID_VALUE);
  Id id = bufferSlot(target);
  if (!id) return error(GL_INVALID_OPERATION);
  Buf& b = buffers_[id];
  b.size = size;
  b.shadow.assign(static_cast<std::size_t>(size), 0);
  if (data && size) std::memcpy(b.shadow.data(), data, static_cast<std::size_t>(size));
  glBufferData(target, static_cast<GLsizeiptr>(size), b.shadow.empty() ? nullptr : b.shadow.data(), usage);
  for (auto& x : indexed_) if (x.second.buffer == id && idxCurrent(x.first)) applyIndexed(static_cast<std::uint32_t>(x.first >> 32), static_cast<std::uint32_t>(x.first & 0xFF));
}
void WebGL1::bufferSubData(std::uint32_t target, std::int64_t offset, std::int64_t size, const void* data) {
  if (!bufferTargetOk(target)) return error(GL_INVALID_ENUM);
  Id id = bufferSlot(target);
  if (!id) return error(GL_INVALID_OPERATION);
  Buf& b = buffers_[id];
  if (offset < 0 || size < 0 || offset + size > b.size) return error(GL_INVALID_VALUE);
  if (size) std::memcpy(b.shadow.data() + offset, data, static_cast<std::size_t>(size));
  glBufferSubData(target, static_cast<GLintptr>(offset), static_cast<GLsizeiptr>(size), data);
}

// ---- shaders and programs
Id WebGL1::createShader(std::uint32_t type) {
  if (type != GL_VERTEX_SHADER && type != GL_FRAGMENT_SHADER) { error(GL_INVALID_ENUM); return 0; }
  Shader s;
  s.type = type;
  s.name = glCreateShader(type);
  Id id = nextId_++;
  shaders_[id] = s;
  return id;
}
void WebGL1::shaderSource(Id id, const std::string& src) {
  auto it = shaders_.find(id);
  if (it == shaders_.end()) return error(id < nextId_ ? GL_INVALID_VALUE : GL_INVALID_OPERATION);   // a deleted shader is name 0 to GL
  it->second.source = src;
}
void WebGL1::compileShader(Id id) {
  auto it = shaders_.find(id);
  if (it == shaders_.end()) return error(id < nextId_ ? GL_INVALID_VALUE : GL_INVALID_OPERATION);
  Shader& s = it->second;
  // GLSL ES 1.00 requires a precision for every float declaration in a fragment shader: a default (`precision mediump float;`) or a qualifier on the declaration.
  // Desktop GLSL does not, so the rule is checked here on the source with its comments removed.
  if (s.type == GL_FRAGMENT_SHADER && !fragmentPrecisionOk(s.source)) {
    s.compiled = false;
    s.log = "ERROR: 0:1: 'float' : No precision specified (fragment shaders need a default float precision)";
    return;
  }
  std::string terr;
  std::string full = translate(s.source, s.type, gl_.info().es, extOn_, version_, terr);
  if (!terr.empty()) { s.compiled = false; s.log = terr; return; }
  if (std::getenv("ZN_GL_DEBUG_SHADER")) std::fprintf(stderr, "---- translated shader\n%s\n", full.c_str());
  const char* p = full.c_str();
  glShaderSource(s.name, 1, &p, nullptr);
  glCompileShader(s.name);
  GLint ok = 0, len = 0;
  glGetShaderiv(s.name, GL_COMPILE_STATUS, &ok);
  glGetShaderiv(s.name, GL_INFO_LOG_LENGTH, &len);
  s.log.assign(static_cast<std::size_t>(std::max(len, 1)), '\0');
  glGetShaderInfoLog(s.name, len, nullptr, s.log.data());
  s.log.resize(std::strlen(s.log.c_str()));
  s.compiled = ok != 0;
}
bool WebGL1::shaderCompiled(Id id) const { auto it = shaders_.find(id); return it != shaders_.end() && it->second.compiled; }
std::string WebGL1::shaderInfoLog(Id id) const { auto it = shaders_.find(id); return it == shaders_.end() ? "" : it->second.log; }
Id WebGL1::createProgram() { Program p; p.name = glCreateProgram(); Id id = nextId_++; programs_[id] = p; return id; }
void WebGL1::attachShader(Id pid, Id sid) {
  auto p = programs_.find(pid);
  auto s = shaders_.find(sid);
  if (p == programs_.end() || s == shaders_.end()) return error(GL_INVALID_OPERATION);
  Id& slot = s->second.type == GL_VERTEX_SHADER ? p->second.vs : p->second.fs;
  if (slot) return error(GL_INVALID_OPERATION);   // one shader of each type
  slot = sid;
  ++s->second.attached;
  glAttachShader(p->second.name, s->second.name);
}
// WebGL: names of attributes and uniforms use the GLSL ES source character set
static bool validName(const std::string& n) {
  for (unsigned char ch : n) if (ch < 0x20 || ch > 0x7E || std::strchr("\"$`@\\'", ch)) return false;
  return true;
}
void WebGL1::bindAttribLocation(Id pid, std::uint32_t index, const std::string& name) {
  auto p = programs_.find(pid);
  if (p == programs_.end()) return error(GL_INVALID_OPERATION);
  if (index >= kMaxAttribs || !validName(name) || name.size() > (version_ == 2 ? 1024u : 256u)) return error(GL_INVALID_VALUE);
  if (name.compare(0, 3, "gl_") == 0) return error(GL_INVALID_OPERATION);
  if (name.compare(0, 6, "webgl_") == 0 || name.compare(0, 6, "_webgl") == 0) return error(GL_INVALID_OPERATION);
  p->second.attribBindings[name] = static_cast<int>(index);
  glBindAttribLocation(p->second.name, index, name.c_str());
}
void WebGL1::linkProgram(Id pid) {
  auto it = programs_.find(pid);
  if (it == programs_.end()) return error(pid < nextId_ ? GL_INVALID_VALUE : GL_INVALID_OPERATION);
  Program& p = it->second;
  ++p.gen;
  if (!p.vs || !p.fs || !shaders_[p.vs].compiled || !shaders_[p.fs].compiled) {   // WebGL: both stages, compiled (a desktop driver would link an empty program)
    p.linked = false;
    p.log = "ERROR: a program needs a compiled vertex shader and a compiled fragment shader";
    return;
  }
  glLinkProgram(p.name);
  GLint ok = 0, len = 0;
  glGetProgramiv(p.name, GL_LINK_STATUS, &ok);
  glGetProgramiv(p.name, GL_INFO_LOG_LENGTH, &len);
  p.log.assign(static_cast<std::size_t>(std::max(len, 1)), '\0');
  glGetProgramInfoLog(p.name, len, nullptr, p.log.data());
  p.log.resize(std::strlen(p.log.c_str()));
  p.linked = ok != 0;
  if (p.linked) fragOutputs(shaders_[p.fs].source, p.fragOut);
}
bool WebGL1::programLinked(Id id) const { auto it = programs_.find(id); return it != programs_.end() && it->second.linked; }
std::string WebGL1::programInfoLog(Id id) const { auto it = programs_.find(id); return it == programs_.end() ? "" : it->second.log; }
// a program is gone: the shaders it held may now go too
void WebGL1::eraseProgram(Id id) {
  auto it = programs_.find(id);
  if (it == programs_.end()) return;
  for (Id sid : {it->second.vs, it->second.fs}) if (sid) { auto sh = shaders_.find(sid); if (sh != shaders_.end() && --sh->second.attached <= 0 && sh->second.deleted) shaders_.erase(sh); }
  programs_.erase(it);
}
void WebGL1::useProgram(Id id) {
  if (version_ == 2 && tfRunning()) return error(GL_INVALID_OPERATION);   // not while transform feedback records (paused is fine)
  if (!id) { const Id old = program_; program_ = 0; glUseProgram(0); if (old) { auto o = programs_.find(old); if (o != programs_.end() && o->second.deleted) eraseProgram(old); } return; }
  auto it = programs_.find(id);
  if (it == programs_.end() || !it->second.linked || it->second.deleted) return error(GL_INVALID_OPERATION);
  const Id old = program_;
  program_ = id;
  glUseProgram(it->second.name);
  if (old && old != id) { auto o = programs_.find(old); if (o != programs_.end() && o->second.deleted) eraseProgram(old); }
}
int WebGL1::getAttribLocation(Id pid, const std::string& name) {
  auto it = programs_.find(pid);
  if (it == programs_.end() || !it->second.linked) { error(GL_INVALID_OPERATION); return -1; }
  if (!validName(name) || name.size() > (version_ == 2 ? 1024u : 256u)) { error(GL_INVALID_VALUE); return -1; }
  if (name.compare(0, 3, "gl_") == 0) return -1;
  return glGetAttribLocation(it->second.name, name.c_str());
}
UniformLoc WebGL1::getUniformLocation(Id pid, const std::string& name) {
  UniformLoc l;
  auto it = programs_.find(pid);
  if (it == programs_.end() || !it->second.linked) { error(GL_INVALID_OPERATION); return l; }
  if (!validName(name) || name.size() > (version_ == 2 ? 1024u : 256u)) { error(GL_INVALID_VALUE); return l; }
  if (name.compare(0, 3, "gl_") == 0 || name.compare(0, 6, "webgl_") == 0) return l;
  for (std::size_t br = name.find('['); br != std::string::npos; br = name.find('[', br + 1)) {   // "u[3]", "lights[2].color": digits only, an index that fits an int, a closing bracket that ends the name or is followed by `.` or `[`
    std::size_t close = name.find(']', br);
    if (close == std::string::npos || close == br + 1) return l;
    if (close != name.size() - 1 && name[close + 1] != '.' && name[close + 1] != '[') return l;
    std::uint64_t idx = 0;
    for (std::size_t i = br + 1; i < close; ++i) { if (name[i] < '0' || name[i] > '9') return l; idx = idx * 10 + static_cast<std::uint64_t>(name[i] - '0'); if (idx > 0x7fffffffu) return l; }
  }
  int loc = glGetUniformLocation(it->second.name, name.c_str());
  if (loc < 0) return l;
  std::string base = name.substr(0, name.find('['));
  GLint n = 0;
  glGetProgramiv(it->second.name, GL_ACTIVE_UNIFORMS, &n);
  for (GLint i = 0; i < n; ++i) {
    char buf[256];
    GLsizei len = 0;
    GLint size = 0;
    GLenum type = 0;
    glGetActiveUniform(it->second.name, static_cast<GLuint>(i), sizeof buf, &len, &size, &type, buf);
    std::string an(buf, static_cast<std::size_t>(len));
    // a member of a struct (array) is found by its whole name; a plain array by its base (u[3] is the active uniform u[0])
    if (name.find('.') != std::string::npos ? an == name : an.substr(0, an.find('[')) == base) { l.type = type; l.size = size; break; }
  }
  l.program = pid;
  l.gen = it->second.gen;
  l.location = loc;
  return l;
}

// A uniform call: null location is ignored, the location must belong to the program in use, and the call must match the uniform's type.
#define ZN_UNIFORM_CHECK(l, ...) \
  if (!(l).valid()) return; \
  if (!program_ || (l).program != program_ || stale(l)) return error(GL_INVALID_OPERATION); \
  { const std::uint32_t ok_[] = {__VA_ARGS__}; bool match_ = false; for (std::uint32_t t_ : ok_) match_ = match_ || t_ == (l).type; if (!match_) return error(GL_INVALID_OPERATION); }
void WebGL1::uniform1f(const UniformLoc& l, float x) { ZN_UNIFORM_CHECK(l, GL_FLOAT, GL_BOOL) glUniform1f(l.location, x); }
void WebGL1::uniform2f(const UniformLoc& l, float x, float y) { ZN_UNIFORM_CHECK(l, GL_FLOAT_VEC2, GL_BOOL_VEC2) glUniform2f(l.location, x, y); }
void WebGL1::uniform4f(const UniformLoc& l, float x, float y, float z, float w) { ZN_UNIFORM_CHECK(l, GL_FLOAT_VEC4, GL_BOOL_VEC4) glUniform4f(l.location, x, y, z, w); }
void WebGL1::uniform1i(const UniformLoc& l, int x) {
  if (isSamplerType(l.type)) { if (!l.valid()) return; if (!program_ || l.program != program_ || stale(l)) return error(GL_INVALID_OPERATION); }
  else { ZN_UNIFORM_CHECK(l, GL_INT, GL_BOOL) }
  if (isSamplerType(l.type) && (x < 0 || x >= 32)) return error(GL_INVALID_VALUE);   // a texture unit that does not exist (MAX_COMBINED_TEXTURE_IMAGE_UNITS is reported as 32)
  glUniform1i(l.location, x);
}
void WebGL1::uniformMatrix4fv(const UniformLoc& l, bool transpose, const float* v, std::size_t n) {
  ZN_UNIFORM_CHECK(l, GL_FLOAT_MAT4)
  if (transpose) return error(GL_INVALID_VALUE);   // WebGL1 forbids it
  if (n == 0 || n % 16 != 0) return error(GL_INVALID_VALUE);
  glUniformMatrix4fv(l.location, static_cast<GLsizei>(n / 16), GL_FALSE, v);
}

// ---- vertex arrays and draws
void WebGL1::enableVertexAttribArray(std::uint32_t i) { if (i >= kMaxAttribs) return error(GL_INVALID_VALUE); attribs_[i].enabled = true; glEnableVertexAttribArray(i); }
void WebGL1::disableVertexAttribArray(std::uint32_t i) { if (i >= kMaxAttribs) return error(GL_INVALID_VALUE); attribs_[i].enabled = false; glDisableVertexAttribArray(i); }
void WebGL1::vertexAttribPointer(std::uint32_t i, int size, std::uint32_t type, bool normalized, int stride, std::int64_t offset) {
  if (i >= kMaxAttribs || size < 1 || size > 4 || stride < 0 || stride > 255 || offset < 0) return error(size < 1 || size > 4 || i >= kMaxAttribs || stride < 0 || stride > 255 || offset < 0 ? GL_INVALID_VALUE : GL_INVALID_ENUM);
  int ts = typeSize(type);
  if (!ts) return error(GL_INVALID_ENUM);
  if (offset % ts || stride % ts) return error(GL_INVALID_OPERATION);
  if (!arrayBuffer_ && offset != 0) return error(GL_INVALID_OPERATION);
  Attrib& a = attribs_[i];
  a.buffer = arrayBuffer_;
  releaseBuffers();
  a.size = size; a.type = type; a.normalized = normalized; a.stride = stride; a.offset = offset; a.integer = false;
  glVertexAttribPointer(i, size, type, normalized, stride, reinterpret_cast<const void*>(static_cast<std::intptr_t>(offset)));
}
char WebGL1::attachmentKind(int i) {
  if (!fbo_) return i == 0 ? 'f' : 0;
  GLint type = GL_NONE, comp = 0;
  glGetFramebufferAttachmentParameteriv(GL_DRAW_FRAMEBUFFER, GL_COLOR_ATTACHMENT0 + i, GL_FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE, &type);
  if (type != GL_NONE) glGetFramebufferAttachmentParameteriv(GL_DRAW_FRAMEBUFFER, GL_COLOR_ATTACHMENT0 + i, GL_FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE, &comp);
  while (glGetError() != GL_NO_ERROR) {}
  return type == GL_NONE ? 0 : comp == GL_INT ? 'i' : comp == GL_UNSIGNED_INT ? 'u' : 'f';
}
bool WebGL1::clearClassOk(int drawbuffer, char want) {
  if (version_ != 2) return true;
  for (int i = drawbuffer < 0 ? 0 : drawbuffer; i < (drawbuffer < 0 ? 4 : drawbuffer + 1); ++i) {
    if (!drawBufferOn(i)) continue;
    const char k = attachmentKind(i);
    if (k && k != want) return false;
  }
  return true;
}
bool WebGL1::checkDrawState(std::int64_t firstIndex, std::int64_t lastIndex, std::int64_t instances, bool instancedDraw) {
  if (!program_) { error(GL_INVALID_OPERATION); return false; }
  if (!framebufferReady()) { error(GL_INVALID_FRAMEBUFFER_OPERATION); return false; }
  const Program& pr = programs_[program_];
  if (!pr.linked) { error(GL_INVALID_OPERATION); return false; }   // a failed link invalidates the program even while it is in use
  GLint n = 0;
  bool zeroDivisor = false, anyUsed = false;
  glGetProgramiv(pr.name, GL_ACTIVE_ATTRIBUTES, &n);
  for (GLint k = 0; k < n; ++k) {   // only the attributes the program reads, as WebGL does
    char buf[256];
    GLsizei len = 0; GLint size = 0; GLenum type = 0;
    glGetActiveAttrib(pr.name, static_cast<GLuint>(k), sizeof buf, &len, &size, &type, buf);
    int loc = glGetAttribLocation(pr.name, buf);
    if (loc < 0 || loc >= kMaxAttribs || std::strncmp(buf, "gl_", 3) == 0) continue;   // gl_InstanceID and friends are built-ins, whatever location a driver gives them
    if (version_ == 2) {   // the class of the data (array or constant) must be the class the shader declares
      const char want = type == GL_INT || (type >= GL_INT_VEC2 && type <= GL_INT_VEC4) ? 'i' : type == GL_UNSIGNED_INT || (type >= GL_UNSIGNED_INT_VEC2 && type <= GL_UNSIGNED_INT_VEC4) ? 'u' : 'f';
      const Attrib& d = attribs_[loc];
      const char have = d.enabled ? (d.integer ? (d.type == GL_UNSIGNED_BYTE || d.type == GL_UNSIGNED_SHORT || d.type == GL_UNSIGNED_INT ? 'u' : 'i') : 'f') : genericType_[loc] == GL_INT ? 'i' : genericType_[loc] == GL_UNSIGNED_INT ? 'u' : 'f';
      if (want != have) { error(GL_INVALID_OPERATION); return false; }
    }
    if (!attribs_[loc].enabled) continue;
    const Attrib& a = attribs_[loc];
    anyUsed = true;
    if (!a.divisor) zeroDivisor = true;
    auto b = buffers_.find(a.buffer);
    if (b == buffers_.end()) { error(GL_INVALID_OPERATION); return false; }   // no client-side arrays in WebGL
    int ts = typeSize(a.type), stride = a.stride ? a.stride : a.size * ts;
    std::int64_t last = a.divisor ? (instances + a.divisor - 1) / a.divisor - 1 : lastIndex;   // per-instance attributes advance once per `divisor` instances
    if (a.divisor ? instances <= 0 : lastIndex < firstIndex || (instancedDraw && instances == 0)) continue;
    std::int64_t need = a.offset + stride * last + static_cast<std::int64_t>(a.size) * ts;
    if (need > b->second.size) { error(GL_INVALID_OPERATION); return false; }
  }
  if (!fbo_) dirty_ = true;
  if (instancedDraw && version_ != 2 && anyUsed && !zeroDivisor) { error(GL_INVALID_OPERATION); return false; }   // ANGLE_instanced_arrays: one attribute must advance per vertex
  if (!extSupported(Ext::FloatBlend) && fbo_ && glIsEnabled(GL_BLEND)) {   // blending into a 32-bit float colour attachment needs EXT_float_blend
    for (int i = 0; i < 4; ++i) {
      if (!drawBufferOn(i)) continue;
      GLint type = GL_NONE, comp = 0, red = 0;
      glGetFramebufferAttachmentParameteriv(GL_DRAW_FRAMEBUFFER, GL_COLOR_ATTACHMENT0 + i, GL_FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE, &type);
      if (type == GL_NONE) continue;
      glGetFramebufferAttachmentParameteriv(GL_DRAW_FRAMEBUFFER, GL_COLOR_ATTACHMENT0 + i, GL_FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE, &comp);
      glGetFramebufferAttachmentParameteriv(GL_DRAW_FRAMEBUFFER, GL_COLOR_ATTACHMENT0 + i, GL_FRAMEBUFFER_ATTACHMENT_RED_SIZE, &red);
      if (comp == GL_FLOAT && red == 32) { while (glGetError() != GL_NO_ERROR) {} error(GL_INVALID_OPERATION); return false; }
    }
    while (glGetError() != GL_NO_ERROR) {}
  }
  if ((version_ == 2 || extOn(Ext::DrawBuffers)) && !glIsEnabled(GL_RASTERIZER_DISCARD)) {   // every enabled draw buffer needs an output of its class, unless nothing can be written
    GLboolean cm[4] = {};
    glGetBooleanv(GL_COLOR_WRITEMASK, cm);
    for (int i = 0; i < 4; ++i) {
      if (extOn(Ext::DrawBuffersIndexed)) glGetBooleani_v(GL_COLOR_WRITEMASK, static_cast<GLuint>(i), cm);   // each draw buffer has its own mask
      if (!(cm[0] || cm[1] || cm[2] || cm[3])) continue;
      if (!drawBufferOn(i)) continue;
      const char k = attachmentKind(i);
      if (k && pr.fragOut[i] != k) { error(GL_INVALID_OPERATION); return false; }
    }
  }
  if (version_ == 2) {   // every uniform block needs a buffer range big enough for it
    GLint blocks = 0;
    glGetProgramiv(pr.name, GL_ACTIVE_UNIFORM_BLOCKS, &blocks);
    for (GLint i = 0; i < blocks; ++i) {
      GLint binding = 0, size = 0;
      glGetActiveUniformBlockiv(pr.name, static_cast<GLuint>(i), GL_UNIFORM_BLOCK_BINDING, &binding);
      glGetActiveUniformBlockiv(pr.name, static_cast<GLuint>(i), GL_UNIFORM_BLOCK_DATA_SIZE, &size);
      auto x = indexed_.find((static_cast<std::uint64_t>(GL_UNIFORM_BUFFER) << 32) | static_cast<std::uint32_t>(binding));
      auto b = x == indexed_.end() ? buffers_.end() : buffers_.find(x->second.buffer);
      const std::int64_t avail = b == buffers_.end() ? -1 : x->second.whole ? b->second.size - x->second.offset : x->second.size;
      if (avail < size) { error(GL_INVALID_OPERATION); return false; }
    }
  }
  return true;
}
void WebGL1::drawArrays(std::uint32_t mode, int first, int count) {
  if (mode > GL_TRIANGLE_FAN) return error(GL_INVALID_ENUM);
  if (first < 0 || count < 0) return error(GL_INVALID_VALUE);
  if (!checkDrawState(first, static_cast<std::int64_t>(first) + count - 1)) return;
  if (count == 0) return;
  glDrawArrays(mode, first, count);
}
void WebGL1::drawElements(std::uint32_t mode, int count, std::uint32_t type, std::int64_t offset) {
  if (version_ == 2 || (type == GL_UNSIGNED_INT && extOn(Ext::IndexUint))) return drawElementsInstanced(mode, count, type, offset, 1);   // WebGL 2 also takes UNSIGNED_INT, WebGL 1 with OES_element_index_uint
  if (mode > GL_TRIANGLE_FAN) return error(GL_INVALID_ENUM);
  if (type != GL_UNSIGNED_BYTE && type != GL_UNSIGNED_SHORT) return error(GL_INVALID_ENUM);   // UNSIGNED_INT needs OES_element_index_uint
  if (count < 0 || offset < 0) return error(GL_INVALID_VALUE);
  int ts = type == GL_UNSIGNED_BYTE ? 1 : 2;
  if (offset % ts) return error(GL_INVALID_OPERATION);
  auto e = buffers_.find(elementBuffer_);
  if (e == buffers_.end()) return error(GL_INVALID_OPERATION);
  if (count > 0 && offset + static_cast<std::int64_t>(count) * ts > e->second.size) return error(GL_INVALID_OPERATION);
  std::int64_t maxIndex = -1;
  for (int i = 0; i < count; ++i) {
    const std::uint8_t* p = e->second.shadow.data() + offset + static_cast<std::int64_t>(i) * ts;
    std::int64_t v = ts == 1 ? *p : static_cast<std::int64_t>(p[0] | (p[1] << 8));
    maxIndex = std::max(maxIndex, v);
  }
  if (!checkDrawState(0, maxIndex)) return;
  if (count == 0) return;
  glDrawElements(mode, count, type, reinterpret_cast<const void*>(static_cast<std::intptr_t>(offset)));
}

// ---- textures
Id WebGL1::createTexture() { Tex t; glGenTextures(1, &t.name); Id id = nextId_++; textures_[id] = t; return id; }
void WebGL1::deleteTexture(Id id) { ++fbGen_;
  auto it = textures_.find(id);
  if (it == textures_.end()) return;
  // deleting an image attached to the bound framebuffer detaches it there (as GL does); other framebuffers keep it alive
  const std::uint32_t name = it->second.name;
  for (int side = 0; side < 2; ++side) {
    const Id fb = side ? fboRead_ : fbo_;
    if (!fb || (side && fboRead_ == fbo_)) continue;
    for (int slot = 0; slot < 6; ++slot) if (fbos_[fb].tx[slot] == name) {
      static const GLenum atts[6] = {GL_COLOR_ATTACHMENT0, GL_COLOR_ATTACHMENT0 + 1, GL_COLOR_ATTACHMENT0 + 2, GL_COLOR_ATTACHMENT0 + 3, GL_DEPTH_ATTACHMENT, GL_STENCIL_ATTACHMENT};
      glFramebufferTexture2D(side ? GL_READ_FRAMEBUFFER : GL_DRAW_FRAMEBUFFER, atts[slot], GL_TEXTURE_2D, 0, 0);
      attachRb(fb, atts[slot], 0, 0);
    }
  }
  bool held = false;
  for (auto& e : fbos_) for (std::uint32_t n : e.second.tx) if (n == name) held = true;
  if (held) zombieTex_[name] = id; else glDeleteTextures(1, &it->second.name);
  for (Id& b : tex2d_) if (b == id) b = 0;
  for (Id& b : texCube_) if (b == id) b = 0;
  for (auto& f : fbos_) if (f.second.color == id) f.second.color = 0;
  textures_.erase(it);
}
void WebGL1::activeTexture(std::uint32_t unit) {
  if (unit < GL_TEXTURE0 || unit >= GL_TEXTURE0 + kMaxUnits) return error(GL_INVALID_ENUM);
  activeUnit_ = unit - GL_TEXTURE0;
  glActiveTexture(unit);
}
void WebGL1::bindTexture(std::uint32_t target, Id id) {
  if (target != GL_TEXTURE_2D && target != GL_TEXTURE_CUBE_MAP && !(version_ == 2 && (target == GL_TEXTURE_3D || target == GL_TEXTURE_2D_ARRAY))) return error(GL_INVALID_ENUM);
  std::uint32_t name = 0;
  if (id) {
    auto it = textures_.find(id);
    if (it == textures_.end()) return error(GL_INVALID_OPERATION);
    if (it->second.target && it->second.target != target) return error(GL_INVALID_OPERATION);   // a texture keeps the target of its first bind
    it->second.target = target;
    name = it->second.name;
    it->second.bound = true;
  }
  boundTex(target) = id;
  glBindTexture(target, name);
}
void WebGL1::texImage2D(std::uint32_t target, int level, std::uint32_t internalformat, int width, int height, int border, std::uint32_t format, std::uint32_t type, const void* data, std::size_t dataBytes) { ++fbGen_;
  const bool face = target >= GL_TEXTURE_CUBE_MAP_POSITIVE_X && target <= GL_TEXTURE_CUBE_MAP_NEGATIVE_Z;
  if (target != GL_TEXTURE_2D && !face) return error(GL_INVALID_ENUM);
  if (version_ == 2 && border != 0) return error(GL_INVALID_VALUE);
  if (version_ == 2 && internalformat != format) {   // sized internal formats (ES 3.0 table 3.2)
    if (face && width != height) return error(GL_INVALID_VALUE);
    uploadTexture(false, target, level, internalformat, width, height, 1, format, type, data, dataBytes, 0, 0, 0, false);
    return;
  }
  int bpp = 0;
  if (!v1Format(format) || !v1Type(type)) return error(GL_INVALID_ENUM);   // FLOAT / HALF_FLOAT_OES, the depth and sRGB formats need their extensions
  if (level < 0 || width < 0 || height < 0 || level > 30 || width > (maxTexSize_ >> level) || height > (maxTexSize_ >> level) || border != 0) return error(GL_INVALID_VALUE);
  if (version_ != 2 && level > 0 && (!pot(width) || !pot(height))) return error(GL_INVALID_VALUE);   // WebGL 1: a level other than the base is a power of two
  if (internalformat != format) return error(GL_INVALID_OPERATION);
  if (!v1FormatType(format, type, bpp)) return error(GL_INVALID_OPERATION);
  const bool depth = format == GL_DEPTH_COMPONENT || format == kDepthStencilFmt;
  if (depth && (face || level != 0 || data)) return error(GL_INVALID_OPERATION);   // depth textures: 2D, level 0, no data
  Id id = (face ? texCube_ : tex2d_)[activeUnit_];
  if (!id) return error(GL_INVALID_OPERATION);
  if (textures_[id].immutable) return error(GL_INVALID_OPERATION);   // texStorage fixed the format and sizes
  if (face && width != height) return error(GL_INVALID_VALUE);   // cube faces are square
  if (data) {
    std::size_t row = static_cast<std::size_t>(width) * bpp;
    row = (row + unpackAlignment_ - 1) / unpackAlignment_ * unpackAlignment_;
    std::size_t need = height ? row * (height - 1) + static_cast<std::size_t>(width) * bpp : 0;
    if (dataBytes < need) return error(GL_INVALID_OPERATION);
  }
  const GlFmt f = glFormat(format, type, gl_.info().es);
  glTexImage2D(target, level, static_cast<GLint>(f.internal), width, height, 0, f.format, f.type, data);
  Tex& t = textures_[id];
  if (level == 0) {
    t.w = width; t.h = height; t.format = format; t.type = type;
    t.swz = f.swizzle; t.f32 = type == GL_FLOAT; t.f16 = type == kHalfFloatOes; t.cfmt = 0;
    refreshSampling(id);   // (the legacy formats do not exist in core: one or two channels plus a swizzle give the same sampling)
  }
}
void WebGL1::texParameterf(std::uint32_t target, std::uint32_t pname, float v) {
  const bool lod = version_ == 2 && (pname == GL_TEXTURE_MIN_LOD || pname == GL_TEXTURE_MAX_LOD);
  if (pname != 0x84FE && !lod) return texParameteri(target, pname, static_cast<int>(v));
  if (target != GL_TEXTURE_2D && target != GL_TEXTURE_CUBE_MAP && !(version_ == 2 && (target == GL_TEXTURE_3D || target == GL_TEXTURE_2D_ARRAY))) return error(GL_INVALID_ENUM);
  if (pname == 0x84FE) { if (!extOn(Ext::Aniso)) return error(GL_INVALID_ENUM); if (!(v >= 1)) return error(GL_INVALID_VALUE); }   // TEXTURE_MAX_ANISOTROPY_EXT
  if (!boundTex(target)) return error(GL_INVALID_OPERATION);
  glTexParameterf(target, pname, v);
}
void WebGL1::texParameteri(std::uint32_t target, std::uint32_t pname, int v) { ++fbGen_;
  if (pname == 0x84FE) return texParameterf(target, pname, static_cast<float>(v));
  if (target != GL_TEXTURE_2D && target != GL_TEXTURE_CUBE_MAP && !(version_ == 2 && (target == GL_TEXTURE_3D || target == GL_TEXTURE_2D_ARRAY))) return error(GL_INVALID_ENUM);
  bool ok = false;
  switch (pname) {
    case GL_TEXTURE_WRAP_R: if (version_ != 2) return error(GL_INVALID_ENUM); ok = v == GL_REPEAT || v == GL_CLAMP_TO_EDGE || v == GL_MIRRORED_REPEAT; break;
    case GL_TEXTURE_COMPARE_MODE: if (version_ != 2) return error(GL_INVALID_ENUM); ok = v == GL_NONE || v == GL_COMPARE_REF_TO_TEXTURE; break;
    case GL_TEXTURE_COMPARE_FUNC: if (version_ != 2) return error(GL_INVALID_ENUM); ok = v >= GL_NEVER && v <= GL_ALWAYS; break;
    case GL_TEXTURE_BASE_LEVEL: case GL_TEXTURE_MAX_LEVEL: if (version_ != 2) return error(GL_INVALID_ENUM); if (v < 0) return error(GL_INVALID_VALUE); ok = true; break;
    case GL_TEXTURE_MIN_LOD: case GL_TEXTURE_MAX_LOD: if (version_ != 2) return error(GL_INVALID_ENUM); ok = true; break;
    case GL_TEXTURE_MIN_FILTER: ok = v == GL_NEAREST || v == GL_LINEAR || v == GL_NEAREST_MIPMAP_NEAREST || v == GL_LINEAR_MIPMAP_NEAREST || v == GL_NEAREST_MIPMAP_LINEAR || v == GL_LINEAR_MIPMAP_LINEAR; break;
    case GL_TEXTURE_MAG_FILTER: ok = v == GL_NEAREST || v == GL_LINEAR; break;
    case GL_TEXTURE_WRAP_S: case GL_TEXTURE_WRAP_T: ok = v == GL_REPEAT || v == GL_CLAMP_TO_EDGE || v == GL_MIRRORED_REPEAT; break;
    default: return error(GL_INVALID_ENUM);
  }
  if (!ok) return error(GL_INVALID_ENUM);
  if (!boundTex(target)) return error(GL_INVALID_OPERATION);
  glTexParameteri(target, pname, v);
  if (pname == GL_TEXTURE_MIN_FILTER || pname == GL_TEXTURE_MAG_FILTER) {
    Tex& t = textures_[boundTex(target)];
    (pname == GL_TEXTURE_MIN_FILTER ? t.minF : t.magF) = static_cast<std::uint32_t>(v);
    if (t.f32 || t.f16 || t.black || version_ != 2) refreshSampling(boundTex(target));
  }
  if (pname == GL_TEXTURE_WRAP_S || pname == GL_TEXTURE_WRAP_T) {
    Tex& t = textures_[boundTex(target)];
    (pname == GL_TEXTURE_WRAP_S ? t.wrapS : t.wrapT) = static_cast<std::uint32_t>(v);
    if (version_ != 2) refreshSampling(boundTex(target));
  }
}

// ---- framebuffers
Id WebGL1::createFramebuffer() { Fbo f; glGenFramebuffers(1, &f.name); Id id = nextId_++; fbos_[id] = f; return id; }
void WebGL1::bindFramebuffer(std::uint32_t target, Id id) {
  if (target != GL_FRAMEBUFFER && !(version_ == 2 && (target == GL_READ_FRAMEBUFFER || target == GL_DRAW_FRAMEBUFFER))) return error(GL_INVALID_ENUM);
  std::uint32_t name = gl_.framebuffer();   // null: the canvas
  if (id) {
    auto it = fbos_.find(id);
    if (it == fbos_.end()) return error(GL_INVALID_OPERATION);
    name = it->second.name;
    it->second.bound = true;
  }
  if (target != GL_READ_FRAMEBUFFER) fbo_ = id;
  if (target != GL_DRAW_FRAMEBUFFER) fboRead_ = id;
  glBindFramebuffer(target, name);
}
void WebGL1::framebufferTexture2D(std::uint32_t target, std::uint32_t attachment, std::uint32_t textarget, Id tex, int level) { ++fbGen_;
  if (target != GL_FRAMEBUFFER && !(version_ == 2 && (target == GL_READ_FRAMEBUFFER || target == GL_DRAW_FRAMEBUFFER))) return error(GL_INVALID_ENUM);
  if (attachment != GL_COLOR_ATTACHMENT0 && attachment != GL_DEPTH_ATTACHMENT && attachment != GL_STENCIL_ATTACHMENT && attachment != GL_DEPTH_STENCIL_ATTACHMENT && !((version_ == 2 || extOn(Ext::DrawBuffers)) && attachment > GL_COLOR_ATTACHMENT0 && attachment < GL_COLOR_ATTACHMENT0 + 4)) return error(GL_INVALID_ENUM);
  if (textarget != GL_TEXTURE_2D && !(textarget >= GL_TEXTURE_CUBE_MAP_POSITIVE_X && textarget <= GL_TEXTURE_CUBE_MAP_NEGATIVE_Z)) return error(GL_INVALID_ENUM);
  if (version_ == 2 ? (tex && (level < 0 || level > 14)) : (level != 0 && (!extOn(Ext::FboRenderMipmap) || level < 0 || level > 14))) return error(GL_INVALID_VALUE);   // OES_fbo_render_mipmap: any level
  const Id bound = target == GL_READ_FRAMEBUFFER ? fboRead_ : fbo_;
  if (!bound) return error(GL_INVALID_OPERATION);
  std::uint32_t name = 0;
  if (tex) {
    auto it = textures_.find(tex);
    if (it == textures_.end()) return error(GL_INVALID_OPERATION);
    name = it->second.name;
  }
  if (attachment == GL_COLOR_ATTACHMENT0) { Fbo& f = fbos_[bound]; f.color = tex; f.colorLevel = level; f.colorFace = textarget; f.colorRb = 0; }
  attachRb(bound, attachment, 0, name);
  glFramebufferTexture2D(target, attachment, textarget, name, level);
}
// the per-draw test: the driver's own answer is enough unless it says no (then the full rules decide)
bool WebGL1::framebufferReady() {
  if (!fbo_) return true;
  Fbo& f = fbos_[fbo_];
  if (f.okGen == fbGen_) return true;   // nothing that decides completeness changed since the last answer
  const bool ok = glCheckFramebufferStatus(GL_FRAMEBUFFER) == GL_FRAMEBUFFER_COMPLETE && checkFramebufferStatus(GL_FRAMEBUFFER) == GL_FRAMEBUFFER_COMPLETE;
  if (ok) f.okGen = fbGen_;
  return ok;
}
std::uint32_t WebGL1::checkFramebufferStatus(std::uint32_t target) {
  if (target != GL_FRAMEBUFFER && !(version_ == 2 && (target == GL_READ_FRAMEBUFFER || target == GL_DRAW_FRAMEBUFFER))) { error(GL_INVALID_ENUM); return 0; }
  const Id bound = target == GL_READ_FRAMEBUFFER ? fboRead_ : fbo_;
  if (!bound) return GL_FRAMEBUFFER_COMPLETE;
  {   // colour attachments that are not renderable without an extension: floating point (WEBGL_color_buffer_float, EXT_color_buffer_half_float, EXT_color_buffer_float) and WebGL 1's ALPHA / LUMINANCE
    for (int i = 0; i < 4; ++i) {
      GLint type = GL_NONE, comp = 0, bits[4] = {};
      const GLenum att = GL_COLOR_ATTACHMENT0 + i;
      glGetFramebufferAttachmentParameteriv(target, att, GL_FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE, &type);
      if (type == GL_NONE) continue;
      if (version_ != 2 && type == GL_TEXTURE) {
        GLint name = 0;
        glGetFramebufferAttachmentParameteriv(target, att, GL_FRAMEBUFFER_ATTACHMENT_OBJECT_NAME, &name);
        for (auto& t : textures_) if (t.second.name == static_cast<std::uint32_t>(name) && (t.second.format == GL_ALPHA || t.second.format == GL_LUMINANCE || t.second.format == GL_LUMINANCE_ALPHA || t.second.format == kSrgbExt)) { while (glGetError() != GL_NO_ERROR) {} return GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT; }
      }
      glGetFramebufferAttachmentParameteriv(target, att, GL_FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE, &comp);
      if (comp == GL_SIGNED_NORMALIZED && version_ == 2) { while (glGetError() != GL_NO_ERROR) {} return GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT; }   // snorm is not renderable without EXT_render_snorm
      if (comp != GL_FLOAT) continue;
      const GLenum sz[4] = {GL_FRAMEBUFFER_ATTACHMENT_RED_SIZE, GL_FRAMEBUFFER_ATTACHMENT_GREEN_SIZE, GL_FRAMEBUFFER_ATTACHMENT_BLUE_SIZE, GL_FRAMEBUFFER_ATTACHMENT_ALPHA_SIZE};
      for (int k = 0; k < 4; ++k) glGetFramebufferAttachmentParameteriv(target, att, sz[k], &bits[k]);
      const int channels = bits[3] ? 4 : bits[2] ? 3 : bits[1] ? 2 : 1;
      if (!floatRenderable(bits[0], channels)) { while (glGetError() != GL_NO_ERROR) {} return GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT; }
    }
    while (glGetError() != GL_NO_ERROR) {}
    if (version_ != 2) {   // WEBGL_depth_texture: DEPTH_COMPONENT goes to DEPTH_ATTACHMENT, DEPTH_STENCIL to DEPTH_STENCIL_ATTACHMENT, no texture to STENCIL_ATTACHMENT
      const Fbo& f = fbos_[bound];
      auto format = [&](std::uint32_t name) { for (auto& t : textures_) if (t.second.name == name) return t.second.format; return 0u; };
      if (f.tx[4] && f.tx[4] == f.tx[5]) { if (format(f.tx[4]) != kDepthStencilFmt) return GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT; }
      else if (f.tx[4] && format(f.tx[4]) != GL_DEPTH_COMPONENT) return GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT;
      else if (f.tx[5]) return GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT;
    }
  }
  // what is attached: type, name and, for textures, level, face and layer
  struct Img { GLint type = GL_NONE, name = 0, level = 0, face = 0, layer = 0; bool operator==(const Img& o) const { return type == o.type && name == o.name && level == o.level && face == o.face && layer == o.layer; } };
  auto img = [&](GLenum att) {
    Img i;
    glGetFramebufferAttachmentParameteriv(target, att, GL_FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE, &i.type);
    if (i.type != GL_NONE) glGetFramebufferAttachmentParameteriv(target, att, GL_FRAMEBUFFER_ATTACHMENT_OBJECT_NAME, &i.name);
    if (i.type == GL_TEXTURE) {
      glGetFramebufferAttachmentParameteriv(target, att, GL_FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL, &i.level);
      glGetFramebufferAttachmentParameteriv(target, att, GL_FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE, &i.face);
      glGetFramebufferAttachmentParameteriv(target, att, GL_FRAMEBUFFER_ATTACHMENT_TEXTURE_LAYER, &i.layer);
    }
    return i;
  };
  Img color[4];
  GLenum bufs[4];
  GLenum firstColor = GL_NONE;
  for (int i = 0; i < 4; ++i) { color[i] = img(GL_COLOR_ATTACHMENT0 + i); bufs[i] = color[i].type != GL_NONE ? GL_COLOR_ATTACHMENT0 + i : GL_NONE; if (bufs[i] && !firstColor) firstColor = bufs[i]; }
  // some drivers call a framebuffer incomplete when the draw or read buffer names an empty attachment; WebGL says they never matter, so point them at what is attached while asking
  if (target != GL_READ_FRAMEBUFFER) glDrawBuffers(4, bufs);
  if (target != GL_DRAW_FRAMEBUFFER) glReadBuffer(firstColor);
  GLenum status = glCheckFramebufferStatus(target);
  if (target != GL_READ_FRAMEBUFFER) { GLenum d[4]; for (int i = 0; i < 4; ++i) d[i] = fbos_[fbo_].draw[i]; glDrawBuffers(4, d); }
  if (target != GL_DRAW_FRAMEBUFFER) glReadBuffer(fbos_[fboRead_ ? fboRead_ : fbo_].readBuffer);
  while (glGetError() != GL_NO_ERROR) {}
  if (status != GL_FRAMEBUFFER_COMPLETE) return status;
  for (int i = 0; i < 4; ++i) for (int j = i + 1; j < 4; ++j) if (color[i].type != GL_NONE && color[i] == color[j]) return GL_FRAMEBUFFER_UNSUPPORTED;   // one image on two attachment points
  const Img depth = img(GL_DEPTH_ATTACHMENT), stencil = img(GL_STENCIL_ATTACHMENT);
  while (glGetError() != GL_NO_ERROR) {}
  if (depth.type != GL_NONE && stencil.type != GL_NONE && !(depth == stencil)) return GL_FRAMEBUFFER_UNSUPPORTED;   // depth and stencil must be the same image
  // WebGL 2 wants every attachment the same size (GL 3.3 does not care)
  int w = -1, h = -1;
  const Img* all[6] = {&color[0], &color[1], &color[2], &color[3], &depth, &stencil};
  for (const Img* a : all) {
    int iw = -1, ih = -1;
    if (a->type == GL_RENDERBUFFER) { for (auto& r : rbos_) if (r.second.name == static_cast<std::uint32_t>(a->name)) { iw = r.second.w; ih = r.second.h; } }
    else if (a->type == GL_TEXTURE) { for (auto& t : textures_) if (t.second.name == static_cast<std::uint32_t>(a->name)) { iw = std::max(1, t.second.w >> a->level); ih = std::max(1, t.second.h >> a->level); } }
    if (iw < 0) continue;
    if (w >= 0 && (iw != w || ih != h)) return GL_FRAMEBUFFER_INCOMPLETE_DIMENSIONS;
    w = iw; h = ih;
  }
  return status;
}
// is a floating-point colour format of this many bits per channel (11: R11F_G11F_B10F) and channels color-renderable with the extensions the page enabled
bool WebGL1::floatRenderable(int bits, int channels) const {
  const bool half = extOn(Ext::ColorBufHalf), full = extOn(Ext::ColorBufFloat), webgl = extOn(Ext::ColorBufFloatWebgl);
  if (version_ == 2) {
    if (bits == 11) return full;
    if (channels == 3) return false;   // RGB16F and RGB32F are never color-renderable in WebGL 2
    return bits == 16 ? (full || half) : full;
  }
  return bits == 16 ? half : webgl;
}
// the pair IMPLEMENTATION_COLOR_READ_* reports for the read buffer: what a framebuffer of that component class reads without conversion
void WebGL1::implementationReadFormat(std::uint32_t& format, std::uint32_t& type) {
  format = GL_RGBA; type = GL_UNSIGNED_BYTE;
  if (!fboRead_) return;
  const GLenum att = version_ == 2 ? fbos_[fboRead_].readBuffer : static_cast<GLenum>(GL_COLOR_ATTACHMENT0);
  GLint t = GL_NONE, comp = 0, red = 0, alpha = 0;
  glGetFramebufferAttachmentParameteriv(GL_READ_FRAMEBUFFER, att, GL_FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE, &t);
  if (t != GL_NONE) {
    glGetFramebufferAttachmentParameteriv(GL_READ_FRAMEBUFFER, att, GL_FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE, &comp);
    glGetFramebufferAttachmentParameteriv(GL_READ_FRAMEBUFFER, att, GL_FRAMEBUFFER_ATTACHMENT_RED_SIZE, &red);
    glGetFramebufferAttachmentParameteriv(GL_READ_FRAMEBUFFER, att, GL_FRAMEBUFFER_ATTACHMENT_ALPHA_SIZE, &alpha);
  }
  while (glGetError() != GL_NO_ERROR) {}
  if (comp == GL_FLOAT) type = GL_FLOAT;
  else if (version_ != 2) {}
  else if (comp == GL_INT) { format = GL_RGBA_INTEGER; type = GL_INT; }
  else if (comp == GL_UNSIGNED_INT) { format = GL_RGBA_INTEGER; type = GL_UNSIGNED_INT; }
  else if (red == 10 && alpha == 2) type = GL_UNSIGNED_INT_2_10_10_10_REV;
}
// WebGL 2: format and type must exist (INVALID_ENUM), the pair must be one the read buffer offers (INVALID_OPERATION), the pack state must be consistent, and the destination big enough
bool WebGL1::readCheck(int w, int h, std::uint32_t format, std::uint32_t type, std::size_t& needed) {
  int comps = 0;
  switch (format) {
    case GL_ALPHA: case GL_RED: case GL_RED_INTEGER: comps = 1; break;
    case GL_RG: case GL_RG_INTEGER: comps = 2; break;
    case GL_RGB: case GL_RGB_INTEGER: comps = 3; break;
    case GL_RGBA: case GL_RGBA_INTEGER: comps = 4; break;
    default: error(GL_INVALID_ENUM); return false;
  }
  int tsize = 0; bool packed = false;
  switch (type) {
    case GL_UNSIGNED_BYTE: case GL_BYTE: tsize = 1; break;
    case GL_UNSIGNED_SHORT: case GL_SHORT: case GL_HALF_FLOAT: tsize = 2; break;
    case GL_UNSIGNED_INT: case GL_INT: case GL_FLOAT: tsize = 4; break;
    case GL_UNSIGNED_SHORT_5_6_5: case GL_UNSIGNED_SHORT_4_4_4_4: case GL_UNSIGNED_SHORT_5_5_5_1: tsize = 2; packed = true; break;
    case GL_UNSIGNED_INT_2_10_10_10_REV: case GL_UNSIGNED_INT_10F_11F_11F_REV: case GL_UNSIGNED_INT_5_9_9_9_REV: tsize = 4; packed = true; break;
    default: error(GL_INVALID_ENUM); return false;
  }
  std::uint32_t implF, implT;
  implementationReadFormat(implF, implT);
  const bool fixedOk = format == GL_RGBA && (type == GL_UNSIGNED_BYTE || (type == GL_UNSIGNED_INT_2_10_10_10_REV && implT == GL_UNSIGNED_INT_2_10_10_10_REV)) && implT != GL_FLOAT && implT != GL_INT && implT != GL_UNSIGNED_INT;
  if (!(fixedOk || (format == implF && type == implT))) { error(GL_INVALID_OPERATION); return false; }
  if (w < 0 || h < 0) { error(GL_INVALID_VALUE); return false; }
  if (packSkipPixels_ + w > (packRowLength_ > 0 ? packRowLength_ : w)) { error(GL_INVALID_OPERATION); return false; }
  const std::int64_t bpp = packed ? tsize : static_cast<std::int64_t>(comps) * tsize;
  const std::int64_t rowPixels = packRowLength_ > 0 ? packRowLength_ : w;
  const std::int64_t rowBytes = (rowPixels * bpp + packAlignment_ - 1) / packAlignment_ * packAlignment_;
  needed = static_cast<std::size_t>(packSkipRows_ * rowBytes + packSkipPixels_ * bpp + (w > 0 && h > 0 ? rowBytes * (h - 1) + w * bpp : 0));
  return true;
}
void WebGL1::readPixels(int x, int y, int w, int h, std::uint32_t format, std::uint32_t type, void* out, std::size_t outBytes) {
  if (version_ == 2) {
    std::size_t need = 0;
    if (packBufferBound()) return error(GL_INVALID_OPERATION);   // a pack buffer wants an offset, not a view
    if (!readCheck(w, h, format, type, need)) return;
    if (!framebufferReady()) return error(GL_INVALID_FRAMEBUFFER_OPERATION);
    if (outBytes < need) return error(GL_INVALID_OPERATION);
    glReadPixels(x, y, w, h, format, type, out);
    return;
  }
  if (format != GL_ALPHA && format != GL_RGB && format != GL_RGBA && format != GL_LUMINANCE && format != GL_LUMINANCE_ALPHA) return error(GL_INVALID_ENUM);
  if (format == GL_RGBA && (type == GL_FLOAT || type == kHalfFloatOes) && fbo_ && (extOn(Ext::ColorBufHalf) || extOn(Ext::ColorBufFloatWebgl))) {   // a floating-point framebuffer reads back as floats
    GLint ctype = GL_NONE, comp = 0;
    glGetFramebufferAttachmentParameteriv(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE, &ctype);
    if (ctype != GL_NONE) glGetFramebufferAttachmentParameteriv(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE, &comp);
    while (glGetError() != GL_NO_ERROR) {}
    if (comp == GL_FLOAT) {
      if (w < 0 || h < 0) return error(GL_INVALID_VALUE);
      if (!framebufferReady()) return error(GL_INVALID_FRAMEBUFFER_OPERATION);
      if (outBytes < static_cast<std::size_t>(w) * h * (type == GL_FLOAT ? 16 : 8)) return error(GL_INVALID_OPERATION);
      glReadPixels(x, y, w, h, GL_RGBA, type == GL_FLOAT ? GL_FLOAT : GL_HALF_FLOAT, out);
      return;
    }
  }
  switch (type) { case GL_UNSIGNED_BYTE: case GL_BYTE: case GL_SHORT: case GL_UNSIGNED_SHORT: case GL_INT: case GL_UNSIGNED_INT: case GL_FLOAT: case GL_UNSIGNED_SHORT_5_6_5: case GL_UNSIGNED_SHORT_4_4_4_4: case GL_UNSIGNED_SHORT_5_5_5_1: case 0x8D61: break; default: return error(GL_INVALID_ENUM); }   // 0x8D61: HALF_FLOAT_OES
  if (format != GL_RGBA || type != GL_UNSIGNED_BYTE) return error(GL_INVALID_OPERATION);   // the one combination every implementation reads
  if (w < 0 || h < 0) return error(GL_INVALID_VALUE);
  if (!framebufferReady()) return error(GL_INVALID_FRAMEBUFFER_OPERATION);
  if (outBytes < static_cast<std::size_t>(w) * h * 4) return error(GL_INVALID_OPERATION);
  glReadPixels(x, y, w, h, GL_RGBA, GL_UNSIGNED_BYTE, out);
}
void WebGL1::readPixelsToBuffer(int x, int y, int w, int h, std::uint32_t format, std::uint32_t type, std::int64_t offset) {
  if (version_ != 2 || !packBufferBound()) return error(GL_INVALID_OPERATION);
  if (offset < 0) return error(GL_INVALID_VALUE);
  std::size_t need = 0;
  if (!readCheck(w, h, format, type, need)) return;
  if (!framebufferReady()) return error(GL_INVALID_FRAMEBUFFER_OPERATION);
  const Buf& b = buffers_[otherBuffers_[0x88EB]];
  if (offset > b.size || static_cast<std::int64_t>(need) > b.size - offset) return error(GL_INVALID_OPERATION);
  glReadPixels(x, y, w, h, format, type, reinterpret_cast<void*>(static_cast<std::intptr_t>(offset)));
}

}  // namespace zn::gl
