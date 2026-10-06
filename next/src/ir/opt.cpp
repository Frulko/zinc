// IR optimisation, run before insertRc: devirtualisation (a virtual call with one possible target becomes a direct call) and
// inlining of small functions. The IR is in SSA form with block parameters, so inlining splits the call's block, clones the
// callee's blocks with fresh values and turns each Ret into a branch to the continuation block.
#include <algorithm>
#include <map>

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

}  // namespace

void optimize(Module& m) {
  devirtualize(m);
  for (int round = 0; round < 3 && inlineRound(m); ++round) devirtualize(m);
}

}  // namespace zn::ir
