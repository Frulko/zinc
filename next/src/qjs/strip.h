#pragma once
// Type stripping for the QuickJS engine (ZN-051): TypeScript source in, JavaScript out, by blanking the type syntax in place (annotations, type
// parameters and arguments, `as`, interfaces, type aliases, modifiers, `implements`) and rewriting enums, so columns and lines are unchanged.
// The source is parsed by the Zinc parser, which accepts the Zinc subset of TypeScript; what is outside it (JSX, parameter properties) is reported.
#include <string>
#include <string_view>

namespace zn::qjs {

// False with `err` set ("file:line:col: message") when the source does not parse or uses a feature that needs more than blanking.
bool stripTypes(std::string_view src, const std::string& file, std::string& out, std::string& err);

}  // namespace zn::qjs
