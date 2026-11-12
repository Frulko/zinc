#include "gl/shader_directives.h"
#include <cassert>

int main() {
  for (const std::string nl : {"\n", "\r", "\r\n", "\n\r"}) {
    const auto splice = "\\" + nl;
    for (const std::string& comment : {"/* comment *" + splice + "/", "/" + splice + "*" + nl + "#version 100" + nl + "*/", "/" + splice + "/ #version 100" + nl, "/" + splice + splice + "* #extension GL_FAKE : require *" + splice + "/"}) {
      const std::string head = "#version 300 es" + nl;
      const auto source = head + comment + nl + "void main(){}";
      bool closed;
      const auto mask = zn::gl::shaderCommentMask(source, closed);
      assert(closed && mask.size() == source.size());
      for (std::size_t i = 0; i < source.size(); ++i) {
        if (source[i] == '\r' || source[i] == '\n' || i < head.size() || i >= head.size() + comment.size()) assert(mask[i] == source[i]);
        else assert(mask[i] == ' ');
      }
      const auto directives = zn::gl::shaderDirectives(source);
      assert(directives.error.empty() && directives.version == 300 && directives.versionBegin == 0 && directives.versionEnd == head.size() - nl.size());
    }
    for (const std::string& comment : {"/" + splice + "* unclosed", "/* comment *" + splice + " /"}) {
      bool closed;
      zn::gl::shaderCommentMask(comment, closed);
      assert(!closed);
    }
    assert(!zn::gl::shaderDirectives("#version 300" + splice + " es" + nl).error.empty());
  }
}
