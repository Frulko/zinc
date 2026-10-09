// IR optimisation, run before insertRc: devirtualisation (a virtual call with one possible target becomes a direct call) and
// inlining of small functions. The IR is in SSA form with block parameters, so inlining splits the call's block, clones the
// callee's blocks with fresh values and turns each Ret into a branch to the continuation block.
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <functional>
#include <map>
#include <optional>
#include <tuple>
#include <set>

#include "ir/ir.h"

namespace zn::ir {
namespace {

constexpr std::size_t kInlineMaxInsts = 40;   // callee size limit
constexpr std::size_t kCallerMaxInsts = 4000;  // stop growing a caller beyond this

std::size_t size(const Function& f) {
  std::size_t n = 0;
  for (const Block& b : f.blocks) n += b.insts.size();
  return n;
}

bool returns(const Function& f) {  // a callee that never returns would leave the continuation unreachable
  for (const Block& b : f.blocks) if (b.insts.back().op == IrOp::Ret) return true;
  return false;
}

bool callsItself(const Function& f, std::uint32_t self) {
  for (const Block& b : f.blocks)
    for (const Inst& i : b.insts) if (i.op == IrOp::Call && i.sym == self) return true;
  return false;
}

void devirtualize(Module& m) {
  for (Function& f : m.functions)
    for (Block& b : f.blocks)
      for (std::size_t k = 0; k < b.insts.size(); ++k) {
        Inst& i = b.insts[k];
        if (i.op != IrOp::CallVirt) continue;
        const Type& rt = m.types[f.valueTypes[i.args[0]]];
        if (rt.k != Type::K::Ref) continue;
        std::uint32_t target = kNoClass;
        bool one = true;
        for (std::uint32_t c = 0; c < m.classes.size() && one; ++c) {
          const Class& cl = m.classes[c];
          if (cl.isInterface || cl.isAbstract || !m.isSubtype(c, rt.aux)) continue;
          std::uint32_t fn = i.sym < cl.vtable.size() ? cl.vtable[i.sym] : kNoClass;
          if (fn == kNoClass) continue;
          if (target == kNoClass) target = fn;
          else if (target != fn) one = false;
        }
        if (!one || target == kNoClass) continue;
        // the implementation takes its own class as receiver: cast the receiver when the static type is wider
        TypeId want = m.functions[target].valueTypes[m.functions[target].params[0]];
        if (f.valueTypes[i.args[0]] != want) {
          f.valueTypes.push_back(want);
          Inst cast; cast.op = IrOp::RefCast; cast.ty = want; cast.res = static_cast<ValueId>(f.valueTypes.size() - 1); cast.args = {i.args[0]};
          b.insts.insert(b.insts.begin() + k, std::move(cast));
          Inst& c2 = b.insts[k + 1];
          c2.args[0] = b.insts[k].res;
          c2.op = IrOp::Call; c2.sym = target;
          ++k;
        } else { i.op = IrOp::Call; i.sym = target; }
      }
}

// Inlines the call at blocks[bi].insts[k] of `f`. The call carries no unwind edge.
void inlineAt(Function& f, std::size_t bi, std::size_t k, const Function& g, TypeId voidT) {
  const Inst call = f.blocks[bi].insts[k];
  const BlockId base = static_cast<BlockId>(f.blocks.size());
  const BlockId tail = base + static_cast<BlockId>(g.blocks.size());
  std::vector<ValueId> map(g.valueTypes.size(), kNoValue);
  auto fresh = [&](ValueId old) { f.valueTypes.push_back(g.valueTypes[old]); return map[old] = static_cast<ValueId>(f.valueTypes.size() - 1); };
  for (std::size_t p = 0; p < g.params.size(); ++p) map[g.params[p]] = call.args[p];
  std::vector<Block> clones(g.blocks.size());
  for (const Block& b : g.blocks)  // every result first: a block may use values defined in a block that comes later in the list
    for (const Inst& src : b.insts) if (src.res != kNoValue) fresh(src.res);
  for (std::size_t b = 1; b < g.blocks.size(); ++b)  // the entry block's parameters are the function's, bound to the call's arguments
    for (ValueId p : g.blocks[b].params) clones[b].params.push_back(fresh(p));
  for (std::size_t b = 0; b < g.blocks.size(); ++b)
    for (const Inst& src : g.blocks[b].insts) {
      Inst n = src;
      for (ValueId& a : n.args) a = map[a];
      if (src.res != kNoValue) n.res = map[src.res];
      for (Edge& e : n.edges) { for (ValueId& a : e.args) a = map[a]; e.to += base; }
      if (src.op == IrOp::Ret) {
        n.op = IrOp::Br; n.res = kNoValue; n.args.clear();
        n.edges = {Edge{tail, {}}};
        if (!src.args.empty()) n.edges[0].args = {map[src.args[0]]};
      }
      clones[b].insts.push_back(std::move(n));
    }
  Block cont;
  if (call.res != kNoValue) cont.params = {call.res};
  Block& head = f.blocks[bi];
  cont.insts.assign(std::make_move_iterator(head.insts.begin() + k + 1), std::make_move_iterator(head.insts.end()));
  head.insts.resize(k);
  Inst br; br.op = IrOp::Br; br.ty = voidT;
  br.edges = {Edge{base, {}}};
  head.insts.push_back(std::move(br));
  for (Block& c : clones) f.blocks.push_back(std::move(c));
  f.blocks.push_back(std::move(cont));
}

bool inlineRound(Module& m) {
  std::vector<Function> snap = m.functions;  // callees as they were at the start of the round
  std::vector<bool> ok(snap.size());
  for (std::size_t g = 1; g < snap.size(); ++g) ok[g] = size(snap[g]) <= kInlineMaxInsts && returns(snap[g]) && !callsItself(snap[g], static_cast<std::uint32_t>(g));
  bool changed = false;
  const TypeId voidT = m.voidT();
  for (std::size_t fi = 0; fi < m.functions.size(); ++fi) {
    Function& f = m.functions[fi];
    for (std::size_t bi = 0; bi < f.blocks.size(); ++bi)
      for (std::size_t k = 0; k < f.blocks[bi].insts.size(); ++k) {
        const Inst& i = f.blocks[bi].insts[k];
        if (i.op != IrOp::Call || !i.edges.empty() || i.sym == fi || !ok[i.sym] || size(f) > kCallerMaxInsts) continue;
        inlineAt(f, bi, k, snap[i.sym], voidT);
        changed = true;
        break;  // the rest of this block moved to a new block, which the loop reaches later
      }
  }
  return changed;
}

// Float constants used inside a loop are loaded once in the entry block (one LoadK per iteration saved per use). Only constants of blocks that are in
// a cycle, and at most kHoistMax of them: each hoisted value keeps a register for the whole function.
constexpr std::size_t kHoistMax = 24;

std::vector<bool> loopBlocks(const Function& f) {
  std::size_t nb = f.blocks.size();
  std::vector<std::vector<std::size_t>> succ(nb), pred(nb);
  for (std::size_t b = 0; b < nb; ++b)
    for (const Edge& e : f.blocks[b].insts.back().edges) { succ[b].push_back(e.to); pred[e.to].push_back(b); }
  // Kosaraju: a block is in a loop when its strongly connected component has more than one block or it branches to itself
  std::vector<std::size_t> order, comp(nb, SIZE_MAX);
  std::vector<bool> seen(nb, false);
  std::vector<std::pair<std::size_t, std::size_t>> stack;
  for (std::size_t r = 0; r < nb; ++r) {
    if (seen[r]) continue;
    stack.push_back({r, 0}); seen[r] = true;
    while (!stack.empty()) {
      auto& [v, i] = stack.back();
      if (i < succ[v].size()) { std::size_t w = succ[v][i++]; if (!seen[w]) { seen[w] = true; stack.push_back({w, 0}); } }
      else { order.push_back(v); stack.pop_back(); }
    }
  }
  std::vector<std::size_t> size;
  for (std::size_t k = order.size(); k-- > 0;) {
    std::size_t r = order[k];
    if (comp[r] != SIZE_MAX) continue;
    std::size_t id = size.size(), count = 0;
    std::vector<std::size_t> work{r};
    comp[r] = id;
    while (!work.empty()) { std::size_t v = work.back(); work.pop_back(); ++count; for (std::size_t w : pred[v]) if (comp[w] == SIZE_MAX) { comp[w] = id; work.push_back(w); } }
    size.push_back(count);
  }
  std::vector<bool> in(nb, false);
  for (std::size_t b = 0; b < nb; ++b) {
    in[b] = size[comp[b]] > 1;
    for (std::size_t w : succ[b]) if (w == b) in[b] = true;
  }
  return in;
}

// A module-level `const G = 240` lowers to a global written once by @main; every read elsewhere is a GetGlobal (two dependent loads in the
// AOT output, and nothing to fold). A global with exactly one SetGlobal, in @main's entry block, of a numeric or boolean constant becomes that
// constant at each GetGlobal the store precedes: in every other function, in @main's other blocks (reached only after the entry block) and
// after the store in the entry block (ZN-404). An f64 value computed from constants with + - * / in the entry block counts as a constant: the
// same IEEE operations at compile time give the same bits. A read in another function that runs before @main's store would have seen zero;
// JavaScript throws there (TDZ), so no correct program observes it. The store stays: the global keeps its value for the inspector.
void foldConstGlobals(Module& m) {
  if (m.functions.empty() || m.functions[0].blocks.empty()) return;
  std::vector<int> stores(m.globals.size(), 0);
  for (const Function& f : m.functions)
    for (const Block& b : f.blocks)
      for (const Inst& i : b.insts)
        if (i.op == IrOp::SetGlobal && i.sym < stores.size()) ++stores[i.sym];
  struct Known { TypeId ty; std::int64_t imm; double fimm; };
  std::map<ValueId, Known> known;   // entry-block values whose constant is known
  std::vector<std::optional<Known>> value(m.globals.size());
  std::vector<std::size_t> storedAt(m.globals.size(), 0);   // index of the store in the entry block
  const Block& entry = m.functions[0].blocks[0];
  for (std::size_t k = 0; k < entry.insts.size(); ++k) {
    const Inst& i = entry.insts[k];
    const Type& t = m.types[i.ty];
    if (i.op == IrOp::Const && i.res != kNoValue && (t.k == Type::K::Num || t.k == Type::K::Bool)) known[i.res] = {i.ty, i.imm, i.fimm};
    else if ((i.op == IrOp::Add || i.op == IrOp::Sub || i.op == IrOp::Mul || i.op == IrOp::Div) && i.res != kNoValue && i.args.size() == 2 &&
             t.k == Type::K::Num && t.num == frontend::Num::f64) {
      auto a = known.find(i.args[0]), b = known.find(i.args[1]);
      if (a == known.end() || b == known.end() || a->second.ty != i.ty || b->second.ty != i.ty) continue;
      const double x = a->second.fimm, y = b->second.fimm;
      known[i.res] = {i.ty, 0, i.op == IrOp::Add ? x + y : i.op == IrOp::Sub ? x - y : i.op == IrOp::Mul ? x * y : x / y};
    } else if (i.op == IrOp::SetGlobal && i.sym < stores.size() && stores[i.sym] == 1 && !i.args.empty()) {
      auto it = known.find(i.args[0]);
      if (it != known.end() && it->second.ty == m.globals[i.sym].type) { value[i.sym] = it->second; storedAt[i.sym] = k; }
    }
  }
  for (std::size_t fi = 0; fi < m.functions.size(); ++fi)
    for (std::size_t bi = 0; bi < m.functions[fi].blocks.size(); ++bi) {
      std::vector<Inst>& insts = m.functions[fi].blocks[bi].insts;
      for (std::size_t k = 0; k < insts.size(); ++k) {
        Inst& i = insts[k];
        if (i.op != IrOp::GetGlobal || i.sym >= value.size() || !value[i.sym] || i.ty != value[i.sym]->ty) continue;
        if (fi == 0 && bi == 0 && k < storedAt[i.sym]) continue;   // before the store: still zero
        const Known c = *value[i.sym];
        i.op = IrOp::Const; i.imm = c.imm; i.fimm = c.fimm; i.sym = 0; i.args.clear();
      }
    }
}

void hoistConsts(Module& m) {
  for (Function& f : m.functions) {
    std::vector<bool> inLoop = loopBlocks(f);
    std::map<std::pair<TypeId, std::uint64_t>, std::size_t> uses;  // distinct float constants in loop blocks and how often they appear
    auto isFloatConst = [&](const Inst& i) {
      const Type& t = m.types[i.ty];
      return i.op == IrOp::Const && t.k == Type::K::Num && (t.num == frontend::Num::f64 || t.num == frontend::Num::f32);
    };
    auto key = [&](const Inst& i) { std::uint64_t bits; std::memcpy(&bits, &i.fimm, sizeof bits); return std::make_pair(i.ty, bits); };
    bool any = false;
    for (std::size_t b = 0; b < f.blocks.size(); ++b)
      if (inLoop[b]) for (const Inst& i : f.blocks[b].insts) if (isFloatConst(i)) { ++uses[key(i)]; any = true; }
    if (!any) continue;
    std::vector<std::pair<std::size_t, std::pair<TypeId, std::uint64_t>>> ranked;
    for (auto& [k, n] : uses) ranked.push_back({n, k});
    std::stable_sort(ranked.begin(), ranked.end(), [](const auto& a, const auto& b) { return a.first > b.first; });
    std::set<std::pair<TypeId, std::uint64_t>> chosen;
    for (std::size_t k = 0; k < ranked.size() && k < kHoistMax; ++k) chosen.insert(ranked[k].second);
    std::map<std::pair<TypeId, std::uint64_t>, ValueId> seenVal;
    std::vector<Inst> hoisted;
    std::vector<ValueId> rename(f.valueTypes.size(), kNoValue);
    for (std::size_t b = 0; b < f.blocks.size(); ++b) {
      if (!inLoop[b]) continue;
      std::vector<Inst> keep;
      for (Inst& i : f.blocks[b].insts) {
        if (isFloatConst(i) && chosen.count(key(i))) {
          auto [it, fresh] = seenVal.try_emplace(key(i), i.res);
          if (fresh) hoisted.push_back(i);
          rename[i.res] = it->second;
        } else keep.push_back(std::move(i));
      }
      f.blocks[b].insts = std::move(keep);
    }
    if (hoisted.empty()) continue;
    for (Block& b : f.blocks)
      for (Inst& i : b.insts) {
        for (ValueId& a : i.args) if (rename[a] != kNoValue) a = rename[a];
        for (Edge& e : i.edges) for (ValueId& a : e.args) if (rename[a] != kNoValue) a = rename[a];
      }
    auto& entry = f.blocks[0].insts;
    entry.insert(entry.begin(), hoisted.begin(), hoisted.end());
  }
}

// Branches on a block parameter that a predecessor already decides. `a && b` and `a || b` lower to a diamond that joins in a block holding only
// `condbr %p`; an edge into it that passes a known boolean (a constant, or the value tested by the branch the edge leaves) goes straight to the
// answer, and an edge of an unconditional `br` into it takes the test with it. The loop test of `while (x < 4 && i < n)` is then two fused
// compare-and-jumps instead of a boolean that is materialised, merged and tested again.
bool threadOnce(Module& m, Function& f) {
  std::vector<int> constBool(f.valueTypes.size(), -1);
  for (const Block& b : f.blocks)
    for (const Inst& i : b.insts)
      if (i.op == IrOp::Const && m.types[i.ty].k == Type::K::Bool) constBool[i.res] = i.imm ? 1 : 0;
  std::vector<int> uses(f.valueTypes.size(), 0);  // the parameters of a block bypassed by the thread must be used nowhere but in that block's own branch
  for (const Block& b : f.blocks)
    for (const Inst& i : b.insts) {
      for (ValueId a : i.args) uses[a]++;
      for (const Edge& e : i.edges) for (ValueId a : e.args) uses[a]++;
    }
  bool changed = false;
  for (std::size_t bi = 0; bi < f.blocks.size(); ++bi) {
    Inst& term = f.blocks[bi].insts.back();
    for (std::size_t ei = 0; ei < term.edges.size(); ++ei) {
      Edge e = term.edges[ei];
      if (e.to == bi || e.to >= f.blocks.size()) continue;
      const Block& tb = f.blocks[e.to];
      if (tb.insts.size() != 1 || tb.insts[0].op != IrOp::CondBr) continue;
      const Inst& cb = tb.insts[0];
      std::size_t k = 0;
      while (k < tb.params.size() && tb.params[k] != cb.args[0]) ++k;
      if (k == tb.params.size() || k >= e.args.size()) continue;
      bool local = true;  // every use of each parameter is in T's condbr (its test or its edge arguments)
      for (ValueId p : tb.params) {
        int inT = p == cb.args[0] ? 1 : 0;
        for (const Edge& x : cb.edges) for (ValueId v : x.args) if (v == p) inT++;
        if (uses[p] != inT) local = false;
      }
      if (!local) continue;
      ValueId a = e.args[k];
      int known = constBool[a];
      if (known < 0 && term.op == IrOp::CondBr && term.args[0] == a) known = ei == 0 ? 1 : 0;
      auto sub = [&](const Edge& x) {  // the edge of T's branch as seen from here: T's parameters are this edge's arguments
        Edge r;
        r.to = x.to;
        for (ValueId v : x.args) {
          std::size_t p = 0;
          while (p < tb.params.size() && tb.params[p] != v) ++p;
          r.args.push_back(p < tb.params.size() && p < e.args.size() ? e.args[p] : v);
        }
        return r;
      };
      if (known >= 0) { term.edges[ei] = sub(cb.edges[known ? 0 : 1]); changed = true; }
      else if (term.op == IrOp::Br) {
        Inst c = cb;
        c.args = {a};
        c.edges = {sub(cb.edges[0]), sub(cb.edges[1])};
        term = std::move(c);
        changed = true;
        break;
      }
    }
  }
  return changed;
}

// Drops the blocks no edge reaches and renumbers the rest.
void removeUnreachable(Function& f) {
  std::size_t nb = f.blocks.size();
  std::vector<bool> reach(nb, false);
  std::vector<std::size_t> stack{0};
  reach[0] = true;
  while (!stack.empty()) {
    std::size_t b = stack.back(); stack.pop_back();
    for (const Inst& i : f.blocks[b].insts) for (const Edge& e : i.edges) if (!reach[e.to]) { reach[e.to] = true; stack.push_back(e.to); }
  }
  std::vector<std::size_t> idx(nb, SIZE_MAX);
  std::vector<Block> kept;
  for (std::size_t b = 0; b < nb; ++b) if (reach[b]) { idx[b] = kept.size(); kept.push_back(std::move(f.blocks[b])); }
  if (kept.size() == nb) { f.blocks = std::move(kept); return; }
  for (Block& b : kept) for (Inst& i : b.insts) for (Edge& e : i.edges) e.to = static_cast<BlockId>(idx[e.to]);
  f.blocks = std::move(kept);
}

void threadBranches(Module& m) {
  for (Function& f : m.functions) {
    bool any = false;
    for (int round = 0; round < 4 && threadOnce(m, f); ++round) any = true;
    if (any) removeUnreachable(f);
  }
}

// Common subexpressions of pure operations along a chain of blocks where each has one predecessor (so the earlier value dominates the later use):
// `x * x + y * y <= 4` in a loop test and `x * x - y * y` in its body compute x * x and y * y once.
bool pureOp(const Module& m, const Inst& i) {
  switch (i.op) {
    case IrOp::Add: case IrOp::Sub: case IrOp::Mul: case IrOp::Neg: case IrOp::And: case IrOp::Or: case IrOp::Xor: case IrOp::Shl: case IrOp::Shr:
    case IrOp::UShr: case IrOp::Not: case IrOp::BitNot: case IrOp::Eq: case IrOp::Ne: case IrOp::Lt: case IrOp::Le: case IrOp::Gt: case IrOp::Ge: case IrOp::Conv:
      return i.res != kNoValue;
    case IrOp::Div: case IrOp::Rem: case IrOp::Pow: {  // an integer division can throw; floats cannot
      const Type& t = m.types[i.ty];
      return i.res != kNoValue && t.k == Type::K::Num && (t.num == frontend::Num::f64 || t.num == frontend::Num::f32);
    }
    default: return false;
  }
}

void cseFunction(Module& m, Function& f) {
  std::size_t nb = f.blocks.size();
  std::vector<int> preds(nb, 0);
  for (const Block& b : f.blocks) for (const Inst& i : b.insts) for (const Edge& e : i.edges) preds[e.to]++;
  using Key = std::tuple<int, TypeId, std::vector<ValueId>, TypeId>;  // op, result type, operands, first operand type (a Conv's source)
  std::vector<ValueId> rename(f.valueTypes.size(), kNoValue);
  std::vector<bool> visited(nb, false);
  std::vector<bool> drop;  // per block: nothing; instructions are filtered at the end
  std::vector<std::vector<bool>> dead(nb);
  for (std::size_t b = 0; b < nb; ++b) dead[b].assign(f.blocks[b].insts.size(), false);
  std::function<void(std::size_t, std::map<Key, ValueId>)> walk = [&](std::size_t b, std::map<Key, ValueId> table) {
    visited[b] = true;
    Block& blk = f.blocks[b];
    for (std::size_t k = 0; k < blk.insts.size(); ++k) {
      Inst& i = blk.insts[k];
      for (ValueId& a : i.args) if (rename[a] != kNoValue) a = rename[a];
      for (Edge& e : i.edges) for (ValueId& a : e.args) if (rename[a] != kNoValue) a = rename[a];
      if (!pureOp(m, i)) continue;
      Key key{static_cast<int>(i.op), i.ty, i.args, i.args.empty() ? 0 : f.valueTypes[i.args[0]]};
      auto [it, fresh] = table.try_emplace(key, i.res);
      if (!fresh) { rename[i.res] = it->second; dead[b][k] = true; }
    }
    for (const Edge& e : blk.insts.back().edges) if (preds[e.to] == 1 && !visited[e.to] && e.to != 0) walk(e.to, table);
  };
  for (std::size_t b = 0; b < nb; ++b) if (!visited[b] && (b == 0 || preds[b] != 1)) walk(b, {});
  for (std::size_t b = 0; b < nb; ++b) if (!visited[b]) walk(b, {});  // a block of a cycle of single-predecessor blocks
  bool any = false;
  for (std::size_t b = 0; b < nb; ++b) {
    std::vector<Inst> keep;
    for (std::size_t k = 0; k < f.blocks[b].insts.size(); ++k) { if (dead[b][k]) any = true; else keep.push_back(std::move(f.blocks[b].insts[k])); }
    f.blocks[b].insts = std::move(keep);
  }
  if (!any) return;
  for (Block& b : f.blocks)  // uses in blocks the walk met before the replaced value's block was renamed
    for (Inst& i : b.insts) {
      for (ValueId& a : i.args) while (rename[a] != kNoValue) a = rename[a];
      for (Edge& e : i.edges) for (ValueId& a : e.args) while (rename[a] != kNoValue) a = rename[a];
    }
}

void cse(Module& m) { for (Function& f : m.functions) cseFunction(m, f); }

// A small self-recursive function is inlined into itself once: fib(n) runs the bodies of fib(n - 1) and fib(n - 2) in place, so a call and a return are paid
// for every second level of the recursion. The copies keep their own recursive calls (they are not unrolled again).
constexpr std::size_t kUnrollMaxInsts = 24;

void unrollRecursion(Module& m) {
  const TypeId voidT = m.voidT();
  for (std::size_t fi = 1; fi < m.functions.size(); ++fi) {
    Function& f = m.functions[fi];
    if (size(f) > kUnrollMaxInsts || !returns(f) || !callsItself(f, static_cast<std::uint32_t>(fi))) continue;
    const Function snap = f;
    for (Block& b : f.blocks) for (Inst& i : b.insts) if (i.op == IrOp::Call && i.sym == fi && i.edges.empty()) i.imm = 1;  // the sites to inline: the copies' own calls stay calls
    for (bool again = true; again;) {
      again = false;
      for (std::size_t bi = 0; bi < f.blocks.size() && !again; ++bi)
        for (std::size_t k = 0; k < f.blocks[bi].insts.size(); ++k) {
          const Inst& i = f.blocks[bi].insts[k];
          if (i.op != IrOp::Call || i.sym != fi || i.imm != 1) continue;
          inlineAt(f, bi, k, snap, voidT);
          again = true;
          break;
        }
    }
  }
}

// `arr.sort((a, b) => a - b)` on an f64[] (and `b - a`): the comparator is a closure that was just made and does only the subtraction, so the runtime sorts with the
// comparison in place of a call per comparison (the same stable merge, the same results, NaN included).
void specializeSort(Module& m) {
  std::uint32_t callSel = UINT32_MAX;
  for (std::uint32_t k = 0; k < m.selectors.size(); ++k) {
    const Selector& s = m.selectors[k];
    if (s.name == "call" && s.params.size() == 2 && m.types[s.ret].k == Type::K::Num && m.types[s.ret].num == frontend::Num::f64 && s.params[0] == s.params[1] && m.types[s.params[0]].k == Type::K::Num && m.types[s.params[0]].num == frontend::Num::f64) { callSel = k; break; }
  }
  if (callSel == UINT32_MAX) return;
  // 1: ascending (a - b), -1: descending (b - a), 0: another body
  auto direction = [&](std::uint32_t cls) {
    const Class& c = m.classes[cls];
    if (callSel >= c.vtable.size() || c.vtable[callSel] == kNoClass) return 0;
    const Function& f = m.functions[c.vtable[callSel]];
    if (f.blocks.size() != 1 || f.blocks[0].insts.size() != 2 || f.params.size() != 3) return 0;
    const Inst& sub = f.blocks[0].insts[0];
    const Inst& ret = f.blocks[0].insts[1];
    if (sub.op != IrOp::Sub || ret.op != IrOp::Ret || ret.args.size() != 1 || ret.args[0] != sub.res) return 0;
    if (sub.args[0] == f.params[1] && sub.args[1] == f.params[2]) return 1;
    if (sub.args[0] == f.params[2] && sub.args[1] == f.params[1]) return -1;
    return 0;
  };
  for (Function& f : m.functions) {
    std::vector<int> closure(f.valueTypes.size(), -1);  // per value: the class of a `new` closure
    std::vector<ValueId> castOf(f.valueTypes.size(), kNoValue);
    for (const Block& b : f.blocks)
      for (const Inst& i : b.insts) {
        if (i.op == IrOp::New && i.res != kNoValue) closure[i.res] = static_cast<int>(i.sym);
        if (i.op == IrOp::RefCast && i.res != kNoValue) castOf[i.res] = i.args[0];
      }
    for (Block& b : f.blocks)
      for (Inst& i : b.insts) {
        if (i.op != IrOp::Rt || i.sym != static_cast<std::uint32_t>(zn::Rt::ArrSort) || i.args.size() != 2) continue;
        const Type& at = m.types[f.valueTypes[i.args[0]]];
        if (at.k != Type::K::Array || m.types[at.aux].k != Type::K::Num || m.types[at.aux].num != frontend::Num::f64) continue;
        ValueId c = i.args[1];
        if (castOf[c] != kNoValue) c = castOf[c];
        if (closure[c] < 0) continue;
        int d = direction(static_cast<std::uint32_t>(closure[c]));
        if (d == 0) continue;
        i.sym = static_cast<std::uint32_t>(d > 0 ? zn::Rt::ArrSortAsc : zn::Rt::ArrSortDesc);
        i.args.resize(1);
      }
  }
}

// x / c for a constant power of two c is x * (1 / c) exactly (no rounding differs: scaling by a power of two only changes the exponent), and a multiply
// is several times cheaper than a divide.
void divByPowerOfTwo(Module& m) {
  for (Function& f : m.functions) {
    std::vector<int> isConst(f.valueTypes.size(), 0);
    std::vector<double> value(f.valueTypes.size(), 0);
    for (const Block& b : f.blocks)
      for (const Inst& i : b.insts)
        if (i.op == IrOp::Const && m.types[i.ty].k == Type::K::Num && m.types[i.ty].num == frontend::Num::f64) { isConst[i.res] = 1; value[i.res] = i.fimm; }
    for (Block& b : f.blocks) {
      for (std::size_t k = 0; k < b.insts.size(); ++k) {
        Inst& i = b.insts[k];
        if (i.op != IrOp::Div || i.args.size() != 2 || !isConst[i.args[1]]) continue;
        double c = value[i.args[1]];
        int e = 0;
        if (!(c != 0 && std::isfinite(c)) || std::frexp(std::fabs(c), &e) != 0.5 || e < -1000 || e > 1000) continue;  // a power of two with a normal reciprocal
        Inst k1;
        k1.op = IrOp::Const;
        k1.ty = i.ty;
        k1.res = static_cast<ValueId>(f.valueTypes.size());
        k1.fimm = 1.0 / c;
        f.valueTypes.push_back(i.ty);
        i.op = IrOp::Mul;
        i.args[1] = k1.res;
        b.insts.insert(b.insts.begin() + static_cast<std::ptrdiff_t>(k), k1);
        ++k;
      }
    }
  }
}

// Functions no reachable code can call are dropped (ZN-431): from @main, through direct calls and through the vtables of the classes reachable
// code constructs (closures, callbacks, promise jobs and onFrame handlers are such objects, so they stay). A class nothing constructs keeps its
// layout and becomes abstract when its vtable loses methods: nothing can call them. Function indices are renumbered in calls and vtables.
void removeUnreachable(Module& m) {
  const std::size_t nf = m.functions.size();
  if (nf <= 1) return;
  std::vector<char> live(nf, 0), built(m.classes.size(), 0);
  std::vector<std::uint32_t> work{0};
  live[0] = 1;
  auto reach = [&](std::uint32_t fn) { if (fn < nf && !live[fn]) { live[fn] = 1; work.push_back(fn); } };
  auto build = [&](std::uint32_t c) {
    if (c >= built.size() || built[c]) return;
    built[c] = 1;
    for (std::uint32_t fn : m.classes[c].vtable) if (fn != kNoClass) reach(fn);
  };
  // the classes the runtime itself instantiates (src/rt/machine.cpp: JSON.parse, any values) are built even when no code says `new`
  for (std::uint32_t c = 0; c < m.classes.size(); ++c) {
    const std::string& n = m.classes[c].name;
    if (n == "DynNum" || n == "DynStr" || n == "DynBool" || n == "DynArr" || n == "DynObj" || n == "DynUndef" || n == "DynNull") build(c);
  }
  while (!work.empty()) {
    const Function& f = m.functions[work.back()];
    work.pop_back();
    for (const Block& b : f.blocks)
      for (const Inst& i : b.insts) {
        if (i.op == IrOp::Call) reach(i.sym);
        else if (i.op == IrOp::New) build(i.sym);
      }
  }
  std::vector<std::uint32_t> to(nf, kNoClass);
  std::uint32_t next = 0;
  for (std::size_t k = 0; k < nf; ++k) if (live[k]) to[k] = next++;
  if (next == nf) return;
  for (std::size_t c = 0; c < m.classes.size(); ++c) {
    Class& cl = m.classes[c];
    bool lost = false;
    for (std::uint32_t& fn : cl.vtable) {
      if (fn == kNoClass) continue;
      if (fn < nf && to[fn] != kNoClass) fn = to[fn];
      else { fn = kNoClass; lost = true; }
    }
    if (lost && !built[c] && !cl.isInterface) cl.isAbstract = true;
  }
  std::vector<Function> kept;
  kept.reserve(next);
  for (std::size_t k = 0; k < nf; ++k) if (live[k]) kept.push_back(std::move(m.functions[k]));
  m.functions = std::move(kept);
  for (Function& f : m.functions)
    for (Block& b : f.blocks)
      for (Inst& i : b.insts) if (i.op == IrOp::Call) i.sym = to[i.sym];
}

}  // namespace

void optimize(Module& m, bool deviceCore) {
  foldConstGlobals(m);   // first: inlining, CSE and hoisting then see the constants
  if (!deviceCore) specializeSort(m);
  devirtualize(m);
  for (int round = 0; round < 3 && inlineRound(m); ++round) devirtualize(m);
  if (!std::getenv("ZN_NO_UNROLL")) unrollRecursion(m);
  divByPowerOfTwo(m);
  threadBranches(m);  // after inlining: an inlined `a && b` joins like a written one
  cse(m);
  hoistConsts(m);     // the constants the inlined bodies brought are loaded once too
  if (!std::getenv("ZN_KEEP_UNREACHABLE")) removeUnreachable(m);   // last: inlining leaves more functions without callers
}

}  // namespace zn::ir
