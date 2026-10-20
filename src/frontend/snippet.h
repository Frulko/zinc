#pragma once
// Source snippets spliced into a tree: the desugaring of async functions and generators and a few checker rewrites write
// the code they need as text and splice the user's own nodes into it.
#include <string>
#include <vector>

#include "frontend/ast.h"

namespace zn::frontend {

// Parses `text` (statements; `return` is allowed) and appends its nodes to `a`, positioned at `anchor` for diagnostics.
// An identifier or type named `__H<n>` is a hole: in an expression or type position it becomes holes[n][0] (the node is
// shared, so use each expression hole once); as a statement of its own (`__H<n>;`) it becomes every node of holes[n].
// Returns the snippet's statements, empty (and the snippet unusable) if the text does not parse.
std::vector<std::uint32_t> snippet(Ast& a, const std::string& text, const std::vector<std::vector<std::uint32_t>>& holes, std::uint32_t anchor);

}  // namespace zn::frontend
