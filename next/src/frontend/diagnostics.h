#pragma once
#include <cstdint>
#include <string>
#include <string_view>

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

}  // namespace zn::frontend
