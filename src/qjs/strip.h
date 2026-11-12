#pragma once
// Type stripping for the QuickJS engine (ZN-051): TypeScript source in, JavaScript out, by blanking the type syntax in place (annotations, type
// parameters and arguments, `as`, interfaces, type aliases, modifiers, `implements`) and rewriting enums, so columns and lines are unchanged.
// The source is parsed by the Zinc parser, which accepts the Zinc subset of TypeScript; what is outside it (JSX, parameter properties) is reported.
#include <string>
#include <functional>
#include <string_view>

namespace zn::qjs {

extern const char* const kCollectionResultsModule;   // private leaf module: native function identities and array materialization

// Read-only physical sources and the engine's existing import mapping for checked type graphs.
struct CheckedTypeSources {
  std::string file, stdRoot;
  std::function<bool(const std::string&, std::string&)> read;
  std::function<std::string(const std::string&, const std::string&)> resolve;
};

// False with `err` set ("file:line:col: message") when the source does not parse or uses a feature that needs more than blanking.
bool stripTypes(std::string_view src, const std::string& file, std::string& out, std::string& err);

// The transform stage of the QuickJS pipeline (docs/reports/zinc-quickjs-bundler.md): a .ts or .tsx module of the program or of lib/std as plain
// JavaScript, through the same source passes the typed engines run first (React Native imports, StyleSheet.create, the JSX lowering with its
// diagnostics Z0005 to Z0007) and then stripTypes. Lines are kept, so a stack trace names the line the user wrote. A .js or .mjs file is returned
// as it is. zincCollections=false keeps a resolved package's native iterator conventions. False with `err` set to the formatted diagnostics.
bool toJavaScript(std::string_view src, const std::string& file, std::string& out, std::string& err, bool zincCollections = true, const CheckedTypeSources* types = nullptr);

}  // namespace zn::qjs
