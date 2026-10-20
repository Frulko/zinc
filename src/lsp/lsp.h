#pragma once
// The language server (ZN-142): `zinc lsp` speaks JSON-RPC over stdio (LSP 3.17 subset) over the real parser and checker: publishDiagnostics with the Z codes (the same list as
// `zinc check --json`), hover with the checker's types, completion (members after a dot, names in scope, module specifiers), go to definition and document symbols.
#include <string>

namespace zn::lsp {

/** Reads requests from stdin and answers on stdout until `exit`; 0 after a clean shutdown, 1 otherwise. `stdRoot` is lib/std of the engine. */
int serve(const std::string& stdRoot);

}  // namespace zn::lsp
