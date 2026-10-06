#include "frontend/modules.h"

#include <map>

#include "frontend/diagnostics.h"
#include "frontend/parser.h"

namespace zn::frontend {
namespace {

std::string dirOf(const std::string& p) {
  std::size_t s = p.rfind('/');
  return s == std::string::npos ? "" : p.substr(0, s);
}

// "a/b/../c/./d" -> "a/c/d"
std::string normalize(const std::string& p) {
  std::vector<std::string> parts;
  std::size_t i = 0;
  bool abs = !p.empty() && p[0] == '/';
  while (i <= p.size()) {
    std::size_t j = p.find('/', i);
    if (j == std::string::npos) j = p.size();
    std::string seg = p.substr(i, j - i);
    if (seg == "..") { if (!parts.empty() && parts.back() != "..") parts.pop_back(); else if (!abs) parts.push_back(seg); }
    else if (!seg.empty() && seg != ".") parts.push_back(seg);
    i = j + 1;
  }
  std::string r = abs ? "/" : "";
  for (std::size_t k = 0; k < parts.size(); ++k) r += (k ? "/" : "") + parts[k];
  return r;
}

struct Loader {
  Program& prog;
  const ReadFile& read;
  std::map<std::string, std::uint32_t> done;   // path -> module index
  std::map<std::string, bool> visiting;
  std::vector<std::uint32_t> flat;             // the program's statements in module order

  Loader(Program& p, const ReadFile& r) : prog(p), read(r) {}

  void diag(const char* code, std::uint32_t file, std::uint32_t node, std::string detail) {
    prog.diags.push_back({code, node == kNone ? 0 : prog.ast.nodes[node].start, std::move(detail), file});
  }

  // The module index for an import of `spec` (with quotes) from file `fromFile`, loading it first; kNone on error.
  std::uint32_t resolve(std::uint32_t fromFile, std::uint32_t node, std::string_view quoted) {
    std::string spec(quoted.substr(1, quoted.size() - 2));
    if (spec.rfind("./", 0) != 0 && spec.rfind("../", 0) != 0) { diag(kZUnsupported, fromFile, node, "package imports ('" + spec + "')"); return kNone; }
    std::string base = normalize(dirOf(prog.files[fromFile].path) + (dirOf(prog.files[fromFile].path).empty() ? "" : "/") + spec);
    std::string text;
    for (const char* ext : {"", ".ts", ".tsx", "/index.ts"}) {
      std::string cand = base + ext;
      if (done.count(cand)) return done[cand];
      if (visiting.count(cand)) { diag(kZUnsupported, fromFile, node, "circular imports ('" + spec + "')"); return kNone; }
      if (read(cand, text)) return load(cand, std::move(text));
    }
    diag(kZModuleNotFound, fromFile, node, "'" + spec + "'");
    return kNone;
  }

  std::uint32_t load(const std::string& path, std::string text) {
    auto fi = static_cast<std::uint32_t>(prog.files.size());
    prog.files.push_back({path, std::move(text)});
    visiting[path] = true;
    ParseResult pr = parse(prog.files[fi].text);
    for (Diag& d : pr.diags) { d.file = fi; prog.diags.push_back(d); }
    std::uint32_t result = kNone;
    if (pr.ast.root != kNone && pr.diags.empty()) {
      Ast& A = prog.ast;
      auto off = static_cast<std::uint32_t>(A.nodes.size());
      for (Node& n : pr.ast.nodes) {
        n.file = fi;
        for (std::uint32_t& k : n.kids) if (k != kNone) k += off;
        A.nodes.push_back(std::move(n));
      }
      for (auto& [k, v] : pr.ast.tparams) { auto& d = A.tparams[k + off]; for (std::uint32_t x : v) d.push_back(x + off); }
      for (auto& [k, v] : pr.ast.targs) { auto& d = A.targs[k + off]; for (std::uint32_t x : v) d.push_back(x + off); }
      ModuleInfo mod;
      mod.path = path;
      mod.file = fi;
      for (std::uint32_t st : std::vector<std::uint32_t>(A.nodes[pr.ast.root + off].kids)) {
        const Node& x = A.nodes[st];
        switch (x.kind) {
          case N::Import: {
            std::uint32_t from = resolve(fi, st, x.text);
            if (from == kNone) break;
            for (std::uint32_t sp : std::vector<std::uint32_t>(x.kids)) mod.imports.push_back({from, A.nodes[sp].text, A.nodes[A.nodes[sp].kids[0]].text, sp});
            break;
          }
          case N::ExportAll: {
            std::uint32_t from = resolve(fi, st, x.text);
            if (from != kNone) mod.exports.push_back({{}, {}, from, true, st});
            break;
          }
          case N::ExportList: {
            std::uint32_t from = kNone;
            if (!x.text.empty()) { from = resolve(fi, st, x.text); if (from == kNone) break; }
            for (std::uint32_t sp : std::vector<std::uint32_t>(x.kids)) mod.exports.push_back({A.nodes[A.nodes[sp].kids[0]].text, A.nodes[sp].text, from, false, sp});
            break;
          }
          case N::Export: {
            std::uint32_t d = x.kids[0];
            const Node& dn = A.nodes[d];
            if (dn.kind == N::VarDecl) {
              for (std::uint32_t dc : std::vector<std::uint32_t>(dn.kids)) {
                if (A.nodes[dc].text.empty()) { diag(kZUnsupported, fi, dc, "export of a destructuring declaration"); continue; }
                mod.exports.push_back({A.nodes[dc].text, A.nodes[dc].text, kNone, false, dc});
              }
            } else mod.exports.push_back({dn.text, dn.text, kNone, false, d});
            mod.stmts.push_back(d);
            break;
          }
          default: mod.stmts.push_back(st);
        }
      }
      result = static_cast<std::uint32_t>(A.modules.size());
      for (std::uint32_t st : mod.stmts) flat.push_back(st);
      A.modules.push_back(std::move(mod));
    }
    visiting.erase(path);
    done[path] = result;
    return result;
  }
};

// The built-in classes of exceptions, written in Zinc and added when a program throws, catches or mentions them.
const char* kErrorPrelude = R"ZN(
class Error {
  message: string;
  name: string = 'Error';
  constructor(message: string) { this.message = message; }
  __errorString(): string { return this.message === '' ? this.name : this.name + ': ' + this.message; }
}
class TypeError extends Error { constructor(message: string) { super(message); this.name = 'TypeError'; } }
class RangeError extends Error { constructor(message: string) { super(message); this.name = 'RangeError'; } }
)ZN";

bool needsErrors(const Ast& A) {
  for (const Node& x : A.nodes) {
    if (x.kind == N::Try || x.kind == N::Throw || (x.kind == N::VarDecl && x.text == "using")) return true;
    if ((x.kind == N::Ident || x.kind == N::TypeRef) && (x.text == "Error" || x.text == "TypeError" || x.text == "RangeError")) return true;
  }
  return false;
}

}  // namespace

Program loadProgram(const std::string& entry, const ReadFile& read) {
  Program p;
  std::string text;
  if (!read(entry, text)) { p.files.push_back({entry, ""}); p.diags.push_back({kZUnexpectedToken, 0, "cannot read " + entry, 0}); return p; }
  Loader L(p, read);
  L.load(entry, std::move(text));
  if (p.diags.empty() && needsErrors(p.ast)) {
    auto fi = static_cast<std::uint32_t>(p.files.size());
    p.files.push_back({"<prelude>", kErrorPrelude});
    ParseResult pr = parse(p.files[fi].text);
    if (pr.ast.root != kNone && pr.diags.empty()) {
      auto off = static_cast<std::uint32_t>(p.ast.nodes.size());
      for (Node& nd : pr.ast.nodes) {
        for (std::uint32_t& k : nd.kids) if (k != kNone) k += off;
        nd.file = fi;
        p.ast.nodes.push_back(std::move(nd));
      }
      for (auto& [k, v] : pr.ast.tparams) { auto& d = p.ast.tparams[k + off]; for (std::uint32_t x : v) d.push_back(x + off); }
      for (auto& [k, v] : pr.ast.targs) { auto& d = p.ast.targs[k + off]; for (std::uint32_t x : v) d.push_back(x + off); }
      p.ast.prelude = p.ast.nodes[pr.ast.root + off].kids;
      L.flat.insert(L.flat.begin(), p.ast.prelude.begin(), p.ast.prelude.end());
    }
  }
  Node root{N::Program, 0, 0, {}, L.flat, 0, 0};
  p.ast.nodes.push_back(std::move(root));
  p.ast.root = static_cast<std::uint32_t>(p.ast.nodes.size() - 1);
  return p;
}

std::string formatDiag(const Program& p, const Diag& d) {
  const SourceFile& f = p.files[d.file < p.files.size() ? d.file : 0];
  return format(d, f.text, f.path);
}

}  // namespace zn::frontend
