#include "gl/essl_check.h"

#include <mutex>
#include <regex>
#include <set>

#include "glslang/Public/ResourceLimits.h"
#include "glslang/Public/ShaderLang.h"

namespace zn::gl {

static std::string esslParse(const std::string& source, const std::string& preamble, bool fragment) {
  static std::once_flag once;
  std::call_once(once, [] { glslang::InitializeProcess(); });
  const EShLanguage stage = fragment ? EShLangFragment : EShLangVertex;
  const bool es3 = source.find("#version 300 es") != std::string::npos;
  const int version = es3 ? 300 : 100;
  glslang::TShader shader(stage);
  const char* text = source.c_str();
  shader.setStrings(&text, 1);
  shader.setPreamble(preamble.c_str());
  shader.setEnvInput(glslang::EShSourceGlsl, stage, glslang::EShClientNone, version);   // (only the front end's rules: no SPIR-V target, so no layout(location) demands)
  TBuiltInResource res = *GetDefaultResources();
  // WebGL's limits (the numbers the context reports); the restrictions of GLSL ES 1.00 Appendix A are on, so loops other than for, non-constant loop bounds and indexing by uniforms or attributes are refused
  res.maxDrawBuffers = 4;
  res.maxVertexAttribs = 16;
  res.maxVaryingVectors = 15;
  res.maxVertexUniformVectors = res.maxFragmentUniformVectors = 65536;
  if (!es3) {   // Appendix A of GLSL ES 1.00 only
    res.limits.nonInductiveForLoops = false;
    res.limits.whileLoops = false;
    res.limits.doWhileLoops = false;
    res.limits.generalUniformIndexing = false;
    res.limits.generalAttributeMatrixVectorIndexing = false;
    res.limits.generalVaryingIndexing = false;
    res.limits.generalSamplerIndexing = false;
    res.limits.generalVariableIndexing = false;
    res.limits.generalConstantMatrixVectorIndexing = false;
  }
  if (shader.parse(&res, version, false, EShMsgDefault)) return "";
  std::string log = shader.getInfoLog();
  return log.empty() ? "ERROR: 0:1: '' : the shader is not valid GLSL ES" : log;
}

// glslang knows the functions of extensions a WebGL page never enabled (INTEL's `average` ...) and refuses a user function of the same name, an overload of a built-in as well; such a name is renamed and the parse repeated.
// (A redeclaration of a real built-in with its own signature is then left to the desktop compiler, which refuses it too.)
std::string esslValidate(const std::string& source, const std::string& preamble, bool fragment) {
  std::string pre = preamble;
  std::set<std::string> renamed;
  for (int attempt = 0; attempt < 8; ++attempt) {
    const std::string log = esslParse(source, pre, fragment);
    if (log.empty()) return "";
    static const std::regex clash(R"('(\w+)' : function name is redeclaration of existing name)");
    bool again = false;
    for (std::sregex_iterator it(log.begin(), log.end(), clash), end; it != end; ++it) {
      const std::string name = (*it)[1];
      if (!renamed.insert(name).second) continue;
      pre += "#define " + name + " zn_" + name + "\n";
      again = true;
    }
    if (!again) return log;
  }
  return "ERROR: 0:1: '' : the shader redeclares too many built-in names";
}

}  // namespace zn::gl
