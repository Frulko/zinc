#pragma once
// Async functions and generators, rewritten before checking into continuation-passing code over ordinary closures: every
// `await` or `yield` ends the running piece, and the rest of the function becomes a lambda handed to the promise (or kept in
// the generator). The checker, IR and VM therefore need nothing for coroutines; the Promise, event loop and Generator are
// Zinc source (the async prelude in modules.cpp). Also maps `Promise<void>` to `PromiseV` and `Promise.resolve/all` to the
// prelude's helpers.
//
// Supported: `await` and `yield` as a statement, a variable initialiser, an assignment (`=`) or a returned value, inside
// blocks, if, while, for, for-of over arrays and try/catch (no finally). Anything else is Z0005.
#include <vector>

#include "frontend/ast.h"

namespace zn::frontend {

void desugarAsync(Ast& a, std::vector<Diag>& diags);

}  // namespace zn::frontend
