#pragma once
// tsconfig.json: the `compilerOptions.paths` and `baseUrl` that map a bare import specifier (`inferno`, `@pocketjs/framework/solid`, `three`) to a source file,
// read with yyjson (comments and trailing commas allowed, as TypeScript allows them).
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace zn::frontend {

struct TsConfig {
  std::string baseUrl;  // as written ("" when absent); the targets of `paths` are relative to it, else to the directory of the tsconfig
  std::vector<std::pair<std::string, std::vector<std::string>>> paths;  // pattern (exact, or with one `*`) -> targets, in file order
};

// False with `err` set when the text is not JSON. A tsconfig without `paths` is fine (empty).
bool parseTsConfig(std::string_view text, TsConfig& out, std::string& err);

// The targets (as written, with `*` filled in) of the longest-prefix pattern that matches `spec`; `matched` is that pattern. Empty when none matches.
std::vector<std::string> mapSpecifier(const TsConfig& c, std::string_view spec, std::string& matched);

}  // namespace zn::frontend
