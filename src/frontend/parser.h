#pragma once
#include <string>
#include <string_view>
#include <vector>

#include "frontend/ast.h"

namespace zn::frontend {

struct ParseResult {
  Ast ast;
  std::vector<Diag> diags;  // at most one for now: parsing stops at the first error
};

// Parses a program of the numeric and function subset (see ZN-005): variables, functions, classes with fields and
// methods, control flow, expressions, type annotations. `jsx` is not handled yet.
ParseResult parse(std::string_view src);

// Empty if every node's children lie inside the node's span and every kid index is valid; else a description.
std::string validate(const Ast& ast);

// Indented tree, one node per line: `Kind text`, absent children as `_`.
std::string dump(const Ast& ast);

}  // namespace zn::frontend
