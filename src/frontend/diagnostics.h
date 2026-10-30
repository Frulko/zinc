#pragma once
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

#include "frontend/ast.h"

namespace zn::frontend {

// `file:line:col: error Zxxxx: title: detail`. The part up to the code stays English in every language (tools and Zinc Atelier read it);
// the title and the frequent details are printed in the person's language (D159), the rest of the details in English.
std::string format(const Diag& d, std::string_view src, std::string_view file);

// For a person (ZN-774.34): the source line of `at` and a caret line under its span (` 5 | code` / `   |   ^^^^`), "" on an empty line;
// a path relative to the working directory when it is under it; and diagnostics of one file as `zinc run` prints them: each line with
// its excerpt, then the closing line (what the QuickJS engine prints for a file it cannot strip, as the typed engines do).
std::string excerpt(std::string_view src, std::uint32_t at);
std::string personPath(std::string_view path);
std::string forPerson(const std::vector<Diag>& diags, std::string_view src, std::string_view file);

// Full entry for `zinc explain <code>`, in the person's language; empty if the code is unknown.
std::string explain(std::string_view code);

// Whole registry as markdown (docs/diagnostics.md is this output in English).
std::string markdown();

// One code per line.
std::string codes();

// Every code with its title, for `zinc explain` with no code.
std::string list();

// The registry's English title, why and fix as the JSON keys of i18n/en/diag.json (tests/t0/diagnostics.sh keeps them the same).
std::string catalog();

// A code as a person types it: z0103 and 103 are Z0103, w0601 is W0601.
std::string normalizeCode(std::string_view code);

// The candidate closest to `name` (edit distance at most 2, or a third of its length), or "": the "did you mean" of a message.
std::string nearest(std::string_view name, const std::vector<std::string>& candidates);

// The line a command prints after its diagnostics: how many, the registry's fix of the first one and where to read more; `file`, the
// first one's file as the person reads it, adds that plain JavaScript runs as a .js file when the first error is one JavaScript allows.
std::string hint(const std::vector<Diag>& diags, std::string_view file = "");

}  // namespace zn::frontend
