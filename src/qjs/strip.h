#pragma once
// Type stripping for the QuickJS engine (ZN-051): TypeScript source in, JavaScript out, by blanking the type syntax in place (annotations, type
// parameters and arguments, `as`, interfaces, type aliases, modifiers, `implements`) and rewriting enums, so columns and lines are unchanged.
// The source is parsed by the Zinc parser, which accepts the Zinc subset of TypeScript; what is outside it (JSX, parameter properties) is reported.
#include <string>
#include <string_view>

namespace zn::qjs {

// False with `err` set ("file:line:col: message") when the source does not parse or uses a feature that needs more than blanking.
bool stripTypes(std::string_view src, const std::string& file, std::string& out, std::string& err);

// The transform stage of the QuickJS pipeline (docs/reports/zinc-quickjs-bundler.md): a .ts or .tsx module of the program or of lib/std as plain
// JavaScript, through the same source passes the typed engines run first (React Native imports, StyleSheet.create, the JSX lowering with its
// diagnostics Z0005 to Z0007) and then stripTypes. Lines are kept, so a stack trace names the line the user wrote. A .js or .mjs file is returned
// as it is. False with `err` set to the formatted diagnostics.
bool toJavaScript(std::string_view src, const std::string& file, std::string& out, std::string& err);

}  // namespace zn::qjs
