#include <cassert>
#include <string>

extern "C" unsigned long zn_essl_check(const char*, const char*, int, char*, unsigned long);

int main() {
  for (const std::string nl : {"\n", "\r", "\r\n", "\n\r"}) {
    const std::string head = "#version 300 es" + nl;
    const auto check = [](const std::string& source, const std::string& error) {
      char log[4096];
      const auto size = zn_essl_check(source.c_str(), "", 0, log, sizeof log);
      assert(error.empty() ? size == 0 : size > 0 && std::string(log).find(error) != std::string::npos);
    };
    for (const std::string& comment : {"/* comment *\\" + nl + "/", "/\\" + nl + "*" + nl + "#version 100" + nl + "*/", "/\\" + nl + "/ #version 100" + nl})
      check(head + comment + nl + "void main(){gl_Position=vec4(0.0);}", "");
    check(head + nl + nl + "void main(){gl_Position=missing;}", "0:4:");
    check(head + "#line 73" + nl + "void main(){gl_Position=missing;}", "0:73:");
    check("#version 300\\" + nl + " es" + nl + "void main(){}", "version");
    check(head + "/* unclosed", "unterminated");
  }
}
