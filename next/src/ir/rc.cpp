// Reference counting as explicit IR operations (ZN-018). Conventions, the same on every back end:
//   - Every string, array, Map, Set and object value is a reference the holder owns once ("owned"): parameters, block
//     parameters and the results of New, ArrNew, calls, string operations and runtime calls are new references.
//     Loads (GetField, GetGlobal, ArrGet, Map.get) and RefCast lend a reference: the pass retains it into an owned one.
//   - Storing a value (SetField, SetGlobal, ArrSet, ArrPush, Map.set, Set.add), passing it to a call, returning it and
//     passing it along an edge consume the reference. Everything else borrows.
//   - A value that is used again after a consuming use is retained first; a value is released after its last use (or
//     at the edge where it stops being live) unless that use consumed it. String constants and null are immortal: never
//     retained or released.
// So the last use of a value costs nothing, and the destruction points are a property of the IR, not of an engine.
#include <algorithm>
#include <map>

#include "ir/ir.h"

namespace zn::ir {
namespace {

bool refLike(const Module& m, TypeId t) {
  Type::K k = m.types[t].k;
  return k == Type::K::Ref || k == Type::K::Str || k == Type::K::Array || k == Type::K::Map || k == Type::K::Set;
}

bool consumes(const Inst& i, std::size_t k) {
  switch (i.op) {
    case IrOp::Call: case IrOp::CallVirt: case IrOp::Ret: case IrOp::Throw: return true;
    case IrOp::SetField: case IrOp::ArrPush: return k == 1;
    case IrOp::SetGlobal: return k == 0;
    case IrOp::ArrSet: return k == 2;
    case IrOp::Rt: return rtConsumes(static_cast<zn::Rt>(i.sym), static_cast<unsigned>(k));
    default: return false;
  }
}

bool resultBorrowed(const Inst& i) {
  switch (i.op) {
    case IrOp::GetField: case IrOp::GetGlobal: case IrOp::ArrGet: case IrOp::RefCast: return true;
    case IrOp::Rt: return rtResultBorrowed(static_cast<zn::Rt>(i.sym));
    default: return false;
  }
}

struct Rc {
  Module& m;
  Function& f;
  std::size_t nb, nv;
  std::vector<char> tracked;
  std::vector<std::vector<char>> liveIn, liveOut, reach;

  Rc(Module& mod, Function& fn) : m(mod), f(fn), nb(fn.blocks.size()), nv(fn.valueTypes.size()) {}

  bool isTracked(ValueId v) const { return v < nv && tracked[v]; }

  Inst op(IrOp o, ValueId v) {
    Inst i;
    i.op = o;
    i.ty = m.voidT();
    i.args = {v};
    return i;
  }

  void classify() {
    tracked.assign(nv, 0);
    for (const Block& b : f.blocks) {
      for (ValueId p : b.params) tracked[p] = refLike(m, f.valueTypes[p]);
      for (const Inst& i : b.insts)
        if (i.res != kNoValue && i.op != IrOp::Const) tracked[i.res] = refLike(m, f.valueTypes[i.res]);
    }
  }

  void liveness() {
    reach.assign(1, std::vector<char>(nb, 0));
    std::vector<BlockId> work{0};
    reach[0][0] = 1;
    while (!work.empty()) {
      BlockId b = work.back();
      work.pop_back();
      for (const Edge& e : f.blocks[b].insts.back().edges) if (!reach[0][e.to]) { reach[0][e.to] = 1; work.push_back(e.to); }
    }
    std::vector<std::vector<char>> use(nb, std::vector<char>(nv, 0)), def(nb, std::vector<char>(nv, 0));
    for (BlockId b = 0; b < nb; ++b) {
      if (!reach[0][b]) continue;
      for (ValueId p : f.blocks[b].params) def[b][p] = 1;
      auto usev = [&](ValueId v) { if (isTracked(v) && !def[b][v]) use[b][v] = 1; };
      for (const Inst& i : f.blocks[b].insts) {
        for (ValueId a : i.args) usev(a);
        for (const Edge& e : i.edges) for (ValueId a : e.args) usev(a);
        if (i.res != kNoValue) def[b][i.res] = 1;
      }
    }
    liveIn.assign(nb, std::vector<char>(nv, 0));
    liveOut.assign(nb, std::vector<char>(nv, 0));
    for (bool changed = true; changed;) {
      changed = false;
      for (BlockId b = nb; b-- > 0;) {
        if (!reach[0][b]) continue;
        for (const Edge& e : f.blocks[b].insts.back().edges)
          for (std::size_t v = 0; v < nv; ++v) if (liveIn[e.to][v] && !liveOut[b][v]) { liveOut[b][v] = 1; changed = true; }
        for (std::size_t v = 0; v < nv; ++v)
          if (!liveIn[b][v] && (use[b][v] || (liveOut[b][v] && !def[b][v]))) { liveIn[b][v] = 1; changed = true; }
      }
    }
  }

  void block(BlockId b) {
    Block& blk = f.blocks[b];
    const std::size_t n = blk.insts.size();
    std::vector<long> lastIdx(nv, -1);  // the last instruction (the terminator counts its edge arguments) using each value
    for (std::size_t p = 0; p < n; ++p) {
      for (ValueId a : blk.insts[p].args) if (isTracked(a)) lastIdx[a] = static_cast<long>(p);
      for (const Edge& e : blk.insts[p].edges) for (ValueId a : e.args) if (isTracked(a)) lastIdx[a] = static_cast<long>(p);
    }
    auto usedAfter = [&](ValueId v, std::size_t p) { return liveOut[b][v] || lastIdx[v] > static_cast<long>(p); };
    std::vector<Inst> out;
    for (ValueId p : blk.params) if (isTracked(p) && !liveOut[b][p] && lastIdx[p] < 0) out.push_back(op(IrOp::Release, p));
    for (std::size_t p = 0; p + 1 < n; ++p) {
      Inst inst = blk.insts[p];
      std::map<ValueId, std::pair<int, int>> counts;  // consuming, borrowing occurrences in this instruction
      for (std::size_t k = 0; k < inst.args.size(); ++k)
        if (isTracked(inst.args[k])) (consumes(inst, k) ? counts[inst.args[k]].first : counts[inst.args[k]].second)++;
      std::vector<ValueId> releaseAfter;
      for (auto& [v, cb] : counts) {
        bool dies = !liveOut[b][v] && lastIdx[v] == static_cast<long>(p);
        int retains = dies ? (cb.first > 0 ? cb.first - 1 : 0) : cb.first;
        for (int r = 0; r < retains; ++r) out.push_back(op(IrOp::Retain, v));
        if (dies && cb.first == 0) releaseAfter.push_back(v);
      }
      ValueId res = inst.res;
      out.push_back(std::move(inst));
      if (res != kNoValue && isTracked(res)) {
        bool used = usedAfter(res, p);
        if (resultBorrowed(blk.insts[p])) { if (used) out.push_back(op(IrOp::Retain, res)); }  // before the lender can be released
        else if (!used) out.push_back(op(IrOp::Release, res));
      }
      for (ValueId v : releaseAfter) out.push_back(op(IrOp::Release, v));
    }
    Inst term = blk.insts[n - 1];
    if (term.op == IrOp::Ret || term.op == IrOp::Throw) {  // the returned value is consumed; nothing else is live
      for (std::size_t k = 0; k < term.args.size(); ++k) (void)k;
    } else if (term.op == IrOp::Br || term.op == IrOp::CondBr) {
      std::vector<char> here = liveOut[b];  // owned at the terminator: live out, or passed along some edge (and so unused on the others)
      for (const Edge& e : term.edges) for (ValueId a : e.args) if (isTracked(a)) here[a] = 1;
      for (std::size_t ei = 0; ei < term.edges.size(); ++ei) {
        Edge& e = term.edges[ei];
        const std::vector<char>& needed = liveIn[e.to];
        std::vector<Inst> fix;
        std::vector<char> passed(nv, 0), transferred(nv, 0);
        for (ValueId a : e.args) {
          if (!isTracked(a)) continue;
          passed[a] = 1;
          if (needed[a] || transferred[a]) fix.push_back(op(IrOp::Retain, a));
          else transferred[a] = 1;
        }
        for (std::size_t v = 0; v < nv; ++v) if (here[v] && !needed[v] && !passed[v]) fix.push_back(op(IrOp::Release, static_cast<ValueId>(v)));
        if (fix.empty()) continue;
        if (term.op == IrOp::Br) { for (Inst& x : fix) out.push_back(std::move(x)); continue; }
        Block nbk;  // a split edge holds the fix-ups of one outgoing path
        nbk.insts = std::move(fix);
        Inst br;
        br.op = IrOp::Br;
        br.ty = m.voidT();
        br.edges = {Edge{e.to, e.args}};
        nbk.insts.push_back(std::move(br));
        f.blocks.push_back(std::move(nbk));
        e = Edge{static_cast<BlockId>(f.blocks.size() - 1), {}};
      }
    }
    out.push_back(std::move(term));
    f.blocks[b].insts = std::move(out);
  }

  void run() {
    classify();
    liveness();
    for (BlockId b = 0; b < nb; ++b) if (reach[0][b]) block(b);
  }
};

}  // namespace

void insertRc(Module& m) {
  for (Function& f : m.functions) {
    Rc rc(m, f);
    rc.run();
  }
}

}  // namespace zn::ir
