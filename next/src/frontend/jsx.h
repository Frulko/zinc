#pragma once
// JSX lowering (ZN-028): rewrites the JSX of a .tsx source into calls on the zinc:ui helper functions (Solid or React model).
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

#include "frontend/ast.h"

namespace zn::frontend {

// The source with every JSX element replaced by plain code (line breaks kept), preceded by the import of the helpers; the
// source unchanged when it has no JSX. Problems (unsupported attributes, malformed tags) are added to `diags` as Z0005.
std::string lowerJsx(std::string_view src, std::vector<Diag>& diags, std::uint32_t file);

}  // namespace zn::frontend
