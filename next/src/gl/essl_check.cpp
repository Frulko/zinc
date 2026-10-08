#include "gl/essl_check.h"

#include <algorithm>
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <regex>
#include <set>

#include "glslang/Public/ResourceLimits.h"
#include "glslang/Public/ShaderLang.h"
#include "glslang/MachineIndependent/localintermediate.h"

namespace zn::gl {
namespace {

// A parsed shader: glslang keeps pointers into the source and the preamble, and into the resource table
struct Parsed {
  std::string source, preamble;
  TBuiltInResource res;
  std::unique_ptr<glslang::TShader> shader;
  std::string log;   // empty: it parsed
  bool deepMacros = false;   // the parse left a macro name unexpanded (the zinc patch of glslang's preprocessor, see third_party/glslang/PIN)
  std::string* expanded = nullptr;   // set: only preprocess, into it
};

void parseOne(Parsed& p, bool fragment) {
  static std::once_flag once;
  std::call_once(once, [] { glslang::InitializeProcess(); });
  const EShLanguage stage = fragment ? EShLangFragment : EShLangVertex;
  const bool es3 = p.source.find("#version 300 es") != std::string::npos;
  const int version = es3 ? 300 : 100;
  if (es3) {   // WebGL 2 makes std140 the default layout of uniform blocks (glslang's is shared); said after the version line, the line numbers kept by #line
    const std::size_t at = p.source.find("#version 300 es"), eol = p.source.find('\n', at);
    if (eol != std::string::npos) p.source.insert(eol + 1, "layout(std140) uniform;\n#line " + std::to_string(std::count(p.source.begin(), p.source.begin() + eol, '\n') + 2) + "\n");
    // and on each block without a layout of its own: glslang gives member offsets only to a block that names its layout, and refuses to link it with one that does not
    static const std::regex block(R"((\)\s*)?\buniform\s+\w+\s*\{)");   // (a `)` before it: the end of a layout qualifier)
    std::string out;
    std::size_t last = 0;
    for (std::sregex_iterator it(p.source.begin(), p.source.end(), block), end; it != end; ++it) {
      if ((*it)[1].matched) continue;
      out.append(p.source, last, it->position() - last).append("layout(std140) ");
      last = it->position();
    }
    p.source = out + p.source.substr(last);
  }
  p.shader = std::make_unique<glslang::TShader>(stage);
  const char* text = p.source.c_str();
  p.shader->setStrings(&text, 1);
  p.shader->setPreamble(p.preamble.c_str());
  p.shader->setEnvInput(glslang::EShSourceGlsl, stage, glslang::EShClientNone, version);   // (only the front end's rules: no SPIR-V target, so no layout(location) demands)
  p.res = *GetDefaultResources();
  // WebGL's limits (the numbers the context reports) and, for GLSL ES 1.00, the restrictions of its Appendix A: loops other than for, non-constant loop bounds, indexing by uniforms or attributes
  p.res.maxDrawBuffers = 4;
  p.res.maxVertexAttribs = 16;
  p.res.maxVaryingVectors = 15;
  p.res.maxVertexUniformVectors = p.res.maxFragmentUniformVectors = 65536;
  if (!es3) {
    p.res.limits.nonInductiveForLoops = false;
    p.res.limits.whileLoops = false;
    p.res.limits.doWhileLoops = false;
    p.res.limits.generalUniformIndexing = false;
    p.res.limits.generalAttributeMatrixVectorIndexing = false;
    p.res.limits.generalVaryingIndexing = false;
    p.res.limits.generalSamplerIndexing = false;
    p.res.limits.generalVariableIndexing = false;
    p.res.limits.generalConstantMatrixVectorIndexing = false;
  }
  if (p.expanded) {
    glslang::TShader::ForbidIncluder none;
    p.shader->preprocess(&p.res, version, EEsProfile, false, false, EShMsgDefault, p.expanded, none);
    return;
  }
  if (p.shader->parse(&p.res, version, false, EShMsgDefault)) {
    p.deepMacros = std::string(p.shader->getInfoLog()).find("macro expansion nested too deeply") != std::string::npos;
    p.log.clear();
    return;
  }
  p.log = p.shader->getInfoLog();
  if (p.log.empty()) p.log = "ERROR: 0:1: '' : the shader is not valid GLSL ES";
}

// The deepest chain of user function calls from main, counted up to kMaxCallDepth + 1
constexpr int kMaxCallDepth = 256;   // ANGLE's limit: deeper shaders are refused when compiled (the desktop drivers take gigabytes to link 10000 nested calls)
int callDepth(glslang::TIntermediate* in) {
  struct Calls : glslang::TIntermTraverser {
    std::map<std::string, std::vector<std::string>> of;
    std::string cur;
    bool visitAggregate(glslang::TVisit, glslang::TIntermAggregate* n) override {
      if (n->getOp() == glslang::EOpFunction) cur = n->getName().c_str();
      else if (n->getOp() == glslang::EOpFunctionCall) of[cur].push_back(n->getName().c_str());
      return true;
    }
  } calls;
  if (!in || !in->getTreeRoot()) return 0;
  in->getTreeRoot()->traverse(&calls);
  std::map<std::string, int> height;   // (a height cut at the limit is wrong, but then the shader is refused anyway)
  std::function<int(const std::string&, int)> walk = [&](const std::string& f, int level) -> int {
    if (level > kMaxCallDepth) return kMaxCallDepth + 1;
    if (auto h = height.find(f); h != height.end()) return h->second;
    height[f] = 0;   // (recursion: glslang refuses it at link)
    int h = 0;
    if (auto c = calls.of.find(f); c != calls.of.end())
      for (const std::string& callee : c->second) h = std::max(h, walk(callee, level + 1));
    return height[f] = std::min(h + 1, kMaxCallDepth + 1);
  };
  return walk("main(", 1);
}

}  // namespace

// glslang knows the functions of extensions a WebGL page never enabled (INTEL's `average` ...) and refuses a user function of the same name, an overload of a built-in as well; such a name is renamed and the parse repeated.
// (A redeclaration of a real built-in with its own signature is then left to the desktop compiler, which refuses it too.)
std::string esslValidate(const std::string& source, std::string& preamble, bool fragment, std::string& expanded) {
  std::set<std::string> renamed;
  for (int attempt = 0; attempt < 8; ++attempt) {
    Parsed p;
    p.source = source;
    p.preamble = preamble;
    parseOne(p, fragment);
    if (p.log.empty()) {
      if (callDepth(p.shader->getIntermediate()) > kMaxCallDepth) return "ERROR: 0:1: 'main' : call stack too deep (more than 256 nested calls)";
      if (p.deepMacros) {   // a desktop preprocessor loops on such macros too (Apple's overflows its stack): the driver gets the source glslang expanded
        Parsed e;
        e.source = source;
        e.preamble = preamble;
        e.expanded = &expanded;
        parseOne(e, fragment);
      }
      return "";
    }
    static const std::regex clash(R"('(\w+)' : function name is redeclaration of existing name)");
    bool again = false;
    for (std::sregex_iterator it(p.log.begin(), p.log.end(), clash), end; it != end; ++it) {
      const std::string name = (*it)[1];
      if (!renamed.insert(name).second) continue;
      preamble += "#define " + name + " zn_" + name + "\n";
      again = true;
    }
    if (!again) return p.log;
  }
  return "ERROR: 0:1: '' : the shader redeclares too many built-in names";
}

std::string esslLink(const std::string& vsSource, const std::string& vsPreamble, const std::string& fsSource, const std::string& fsPreamble) {
  const bool vs3 = vsSource.find("#version 300 es") != std::string::npos, fs3 = fsSource.find("#version 300 es") != std::string::npos;
  if (vs3 != fs3) return "ERROR: Versions of linked shaders have to match";
  Parsed vs, fs;
  vs.source = vsSource; vs.preamble = vsPreamble;
  fs.source = fsSource; fs.preamble = fsPreamble;
  parseOne(vs, false);
  parseOne(fs, true);
  if (!vs.log.empty() || !fs.log.empty()) return "";   // (they were accepted when compiled; a parse that differs is not a link question)
  glslang::TProgram program;
  program.addShader(vs.shader.get());
  program.addShader(fs.shader.get());
  if (program.link(EShMsgDefault)) return "";
  std::string log = program.getInfoLog();
  return log.empty() ? "ERROR: the shaders do not link as GLSL ES" : log;
}

}  // namespace zn::gl
