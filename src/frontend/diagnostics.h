#pragma once
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

#include "frontend/ast.h"

namespace zn::frontend {

// `file:line:col: error Zxxxx: title: detail`
std::string format(const Diag& d, std::string_view src, std::string_view file);

// Full entry for `zinc explain <code>`; empty if the code is unknown.
std::string explain(std::string_view code);

// Whole registry as markdown (docs/diagnostics.md is this output).
std::string markdown();

// One code per line.
std::string codes();

// The candidate closest to `name` (edit distance at most 2, or a third of its length), or "": the "did you mean" of a message.
std::string nearest(std::string_view name, const std::vector<std::string>& candidates);

// The line a command prints after its diagnostics: how many, the registry's fix of the first one and where to read more.
std::string hint(const std::vector<Diag>& diags);

}  // namespace zn::frontend
