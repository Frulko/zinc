#include "frontend/snippet.h"

#include <cstdlib>

#include "frontend/parser.h"

namespace zn::frontend {

namespace {
// The hole number of an identifier or type node named __H<n>, or -1.
int holeOf(const Ast& a, std::uint32_t id) {
  const Node& x = a.nodes[id];
  if ((x.kind != N::Ident && x.kind != N::TypeRef) || x.text.size() < 4 || x.text.substr(0, 3) != "__H") return -1;
  return std::atoi(std::string(x.text.substr(3)).c_str());
}
}  // namespace

std::vector<std::uint32_t> snippet(Ast& a, const std::string& text, const std::vector<std::vector<std::uint32_t>>& holes, std::uint32_t anchor) {
  a.generated.push_back("function __w() {\n" + text + "\n}\n");
  ParseResult pr = parse(a.generated.back());
  if (pr.ast.root == kNone || !pr.diags.empty()) return {};
  const Node an = a.nodes[anchor];
  auto off = static_cast<std::uint32_t>(a.nodes.size());
  for (Node& nd : pr.ast.nodes) {
    for (std::uint32_t& k : nd.kids) if (k != kNone) k += off;
    nd.start = an.start; nd.end = an.end; nd.file = an.file;
    a.nodes.push_back(std::move(nd));
  }
  for (auto& [k, v] : pr.ast.tparams) { auto& d = a.tparams[k + off]; for (std::uint32_t x : v) d.push_back(x + off); }
  for (auto& [k, v] : pr.ast.targs) { auto& d = a.targs[k + off]; for (std::uint32_t x : v) d.push_back(x + off); }
  auto end = static_cast<std::uint32_t>(a.nodes.size());
  auto substitute = [&](std::vector<std::uint32_t>& kids, bool stmtList) {
    std::vector<std::uint32_t> r;
    for (std::uint32_t k : kids) {
      if (k == kNone) { r.push_back(k); continue; }
      const Node& x = a.nodes[k];
      if (stmtList && x.kind == N::ExprStmt && holeOf(a, x.kids[0]) >= 0) {
        for (std::uint32_t h : holes[holeOf(a, x.kids[0])]) r.push_back(h);
      } else if (int h = holeOf(a, k); h >= 0) r.push_back(holes[h][0]);
      else r.push_back(k);
    }
    kids = std::move(r);
  };
  auto isList = [&](std::uint32_t i) { return a.nodes[i].kind == N::Block || a.nodes[i].kind == N::Program || a.nodes[i].kind == N::Case; };
  for (std::uint32_t i = off; i < end; ++i) if (isList(i)) substitute(a.nodes[i].kids, true);  // statement holes first: their ExprStmt is dropped
  for (std::uint32_t i = off; i < end; ++i) {
    const Node& x = a.nodes[i];
    if (!isList(i) && !(x.kind == N::ExprStmt && holeOf(a, x.kids[0]) >= 0)) substitute(a.nodes[i].kids, false);
  }
  for (auto* m : {&a.tparams, &a.targs})
    for (auto& [k, v] : *m) if (k >= off && k < end) substitute(v, false);
  std::uint32_t fn = a.nodes[pr.ast.root + off].kids[0];
  return a.nodes[a.nodes[fn].kids[1]].kids;
}

}  // namespace zn::frontend
