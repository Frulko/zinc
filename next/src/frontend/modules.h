#pragma once
// Multi-file programs: starting from an entry file, follows relative imports, parses every file once and merges them into
// one Ast. Modules are ordered so each comes after the modules it imports (initialisation order); `Ast::root`'s kids are
// every module's statements in that order, with imports and exports unwrapped, and `Ast::modules` keeps the structure.
#include <deque>
#include <functional>
#include <string>
#include <vector>

#include "frontend/ast.h"

namespace zn::frontend {

struct SourceFile {
  std::string path;
  std::string text;  // nodes view this text, so files never move (a deque)
};

struct Program {
  Ast ast;
  std::deque<SourceFile> files;  // files[0] is the entry
  std::vector<Diag> diags;       // syntax and module resolution errors; Diag::file indexes `files`
};

// Reads a file into `out`; false if it cannot be read.
using ReadFile = std::function<bool(const std::string& path, std::string& out)>;

Program loadProgram(const std::string& entry, const ReadFile& read);

// `file:line:col: error Zxxxx: title: detail` for a diagnostic of the program.
std::string formatDiag(const Program& p, const Diag& d);

}  // namespace zn::frontend
