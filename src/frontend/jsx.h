#pragma once
// JSX lowering (ZN-028): rewrites the JSX of a .tsx source into calls on the zinc:ui helper functions (Solid or React model).
#include <cstdint>
#include <map>
#include <string>
#include <set>
#include <string_view>
#include <vector>

#include "frontend/ast.h"
#include "frontend/lexer.h"

namespace zn::frontend {

// The source with every JSX element replaced by plain code, preceded by the import of the helpers; the source unchanged when it has no JSX.
// Each copy of the source and each element's code starts on the line it comes from (line breaks added where the code is shorter), and `map`
// (when given) says where every piece comes from, for columns and generated code (ZN-371.03). Problems (unsupported attributes, malformed
// tags) are added to `diags` as Z0005.
// `hot` (zinc dev's hot mode, a file of the project): a Solid call to a component of the project (declared here or imported with a relative path)
// becomes `_hotC('@hot:<Tag>', () => Tag(...))`, its Fast Refresh proxy; the loader replaces the marker with the path of the file that declares it.
// `devFile` (a dev run, a file of the project: its path as shown): each component call is followed by `_cn(node, 'Tag', 'file:line', 'props as written')`,
// what the inspector's component tree shows. Empty: nothing is recorded, the program has no trace of it.
// `projectReact`: the project's entry uses the React model, so a file that imports neither model (a component file of a React app, which
// React's automatic JSX runtime lets go without `import React`) is lowered in it too, as tsconfig's jsxImportSource does for tsc.
std::string lowerJsx(std::string_view src, std::vector<Diag>& diags, std::uint32_t file, const std::set<std::string>* classTags = nullptr, std::vector<SrcPiece>* map = nullptr,
                     bool hot = false, const std::string& devFile = "", bool projectReact = false);
// Whether a file's imports choose the React model (zinc:ui/react, react, inferno).
bool importsReact(std::string_view src);   // classTags: components declared as classes (this file or a relative import), lowered to _cc in the React model

// The lowercase tags Z0007 names a component for ("view" -> "View", "div" -> "View"...): what `zinc migrate jsx-capitalised-tags` rewrites.
const std::map<std::string, std::string>& jsxLowercaseTags();

// The names a source imports, to their module ("Button" -> "zinc:ui/kit"); `react` (when given) is set when it imports the React model.
std::map<std::string, std::string> jsxImports(std::string_view src, const std::vector<Token>& tokens, bool* react = nullptr);
// Whether <tag> is a host element of zinc:ui (View, Text, Button...) rather than a component, given the source's imports: a kit's Button is a component.
bool jsxHostTag(const std::string& tag, const std::map<std::string, std::string>& imported);

// StyleSheet.create({...}) of a .ts or .tsx source (StyleSheet imported from zinc:ui): the CSS-like objects become style operations. The source unchanged when there is none.
std::string lowerStyleSheets(std::string_view src, std::vector<Diag>& diags, std::uint32_t file, bool tsx);
// Under the react-native preset: imports of 'react' and 'react-native' rewritten to zinc:ui/react, zinc:react-native, zinc:ui/animated and
// zinc:react-native/linking (ZN-367.05).
std::string rewriteReactNativeImports(std::string_view src, bool tsx);

}  // namespace zn::frontend
