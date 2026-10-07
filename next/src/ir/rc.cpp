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
  const std::vector<char>& mayThrow;  // per function
  std::size_t nb, nv;
  std::vector<char> tracked;
  std::vector<std::vector<char>> liveIn, liveOut, reach;

  Rc(Module& mod, Function& fn, const std::vector<char>& thr) : m(mod), f(fn), mayThrow(thr), nb(fn.blocks.size()), nv(fn.valueTypes.size()) {}

  // Every block a block can continue in: its terminator's targets and the handlers of its calls.
  template <class F> void successors(BlockId b, F&& fn) const {
    for (const Inst& i : f.blocks[b].insts) for (const Edge& e : i.edges) fn(e.to);
  }
  bool throws(const Inst& i) const {
    if (i.op == IrOp::Call) return mayThrow[i.sym];
    if (i.op != IrOp::CallVirt) return false;
    for (const Class& c : m.classes) if (!c.isInterface && !c.isAbstract && i.sym < c.vtable.size() && c.vtable[i.sym] < m.functions.size() && mayThrow[c.vtable[i.sym]]) return true;
    return false;
  }

  bool isTracked(ValueId v) const { return v < nv && tracked[v]; }

  Inst op(IrOp o, ValueId v) {
    Inst i;
    i.op = o;
    i.ty = m.voidT();
    i.args = {v};
    return i;
  }

  // Whether nothing in the function can release a reference or pass one on: no calls, no stores of references, no references in block
  // parameters or the result. Then what a load lends stays alive as long as the function runs, and needs no retain and release.
  bool lendsForever() const {
    if (refLike(m, f.ret)) return false;
    for (const Block& b : f.blocks) {
      for (ValueId p : b.params) if (refLike(m, f.valueTypes[p])) return false;
      for (const Inst& i : b.insts) {
        switch (i.op) {
          case IrOp::Call: case IrOp::CallVirt: case IrOp::CallNative: case IrOp::Rt: case IrOp::SetGlobal: case IrOp::Throw: case IrOp::ArrPop: return false;
          case IrOp::SetField: if (refLike(m, f.valueTypes[i.args[1]])) return false; break;
          case IrOp::ArrSet: case IrOp::ArrPush: if (refLike(m, f.valueTypes[i.args[i.op == IrOp::ArrSet ? 2 : 1]])) return false; break;
          default: break;
        }
      }
    }
    return true;
  }

  void classify() {
    tracked.assign(nv, 0);
    bool lent = lendsForever();
    for (const Block& b : f.blocks) {
      for (ValueId p : b.params) tracked[p] = refLike(m, f.valueTypes[p]);
      for (const Inst& i : b.insts)
        if (i.res != kNoValue && i.op != IrOp::Const) tracked[i.res] = refLike(m, f.valueTypes[i.res]) && !(lent && resultBorrowed(i));
    }
  }

  void liveness() {
    reach.assign(1, std::vector<char>(nb, 0));
    std::vector<BlockId> work{0};
    reach[0][0] = 1;
    while (!work.empty()) {
      BlockId b = work.back();
      work.pop_back();
      successors(b, [&](BlockId s) { if (!reach[0][s]) { reach[0][s] = 1; work.push_back(s); } });
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
        successors(b, [&](BlockId s) {
          for (std::size_t v = 0; v < nv; ++v) if (liveIn[s][v] && !liveOut[b][v]) { liveOut[b][v] = 1; changed = true; }
        });
        for (std::size_t v = 0; v < nv; ++v)
          if (!liveIn[b][v] && (use[b][v] || (liveOut[b][v] && !def[b][v]))) { liveIn[b][v] = 1; changed = true; }
      }
    }
  }

  static constexpr BlockId kNoBlockRc = 0xFFFFFFFFu;

  TypeId errorRefType() const {
    for (std::size_t c = 0; c < m.classes.size(); ++c) if (m.classes[c].name == "Error") return m.refT(static_cast<std::uint32_t>(c));
    return m.voidT();
  }

  void block(BlockId b) {
    const std::vector<Inst> src = f.blocks[b].insts;
    const std::vector<ValueId> params = f.blocks[b].params;
    const std::size_t n = src.size();
    std::vector<long> lastIdx(nv, -1);  // the last instruction (the terminator counts its edge arguments) using each value
    for (std::size_t p = 0; p < n; ++p) {
      for (ValueId a : src[p].args) if (isTracked(a)) lastIdx[a] = static_cast<long>(p);
      for (const Edge& e : src[p].edges) for (ValueId a : e.args) if (isTracked(a)) lastIdx[a] = static_cast<long>(p);
    }
    auto usedAfter = [&](ValueId v, std::size_t p) { return liveOut[b][v] || lastIdx[v] > static_cast<long>(p); };
    std::vector<Inst> out;
    std::vector<char> avail(nv, 0);  // tracked values this block has by now: live in, parameters, results so far
    for (std::size_t v = 0; v < nv; ++v) avail[v] = liveIn[b][v];
    for (ValueId p : params) if (isTracked(p)) avail[p] = 1;
    for (ValueId p : params) if (isTracked(p) && !liveOut[b][p] && lastIdx[p] < 0) out.push_back(op(IrOp::Release, p));
    for (std::size_t p = 0; p + 1 < n; ++p) {
      Inst inst = src[p];
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
      if (throws(inst) || !inst.edges.empty()) {
        // What this frame still owns when the call unwinds and the handler has no use for is released first, on a path of its own.
        BlockId handler = inst.edges.empty() ? kNoBlockRc : inst.edges[0].to;
        std::vector<ValueId> rel;
        for (std::size_t v = 0; v < nv; ++v) {
          if (!isTracked(static_cast<ValueId>(v)) || !avail[v] || static_cast<ValueId>(v) == res) continue;
          if (handler != kNoBlockRc && liveIn[handler][v]) continue;
          auto cb = counts.find(static_cast<ValueId>(v));
          bool diesHere = cb != counts.end() && !liveOut[b][v] && lastIdx[v] == static_cast<long>(p);
          bool consumedHere = diesHere && cb->second.first > 0;
          bool owned = usedAfter(static_cast<ValueId>(v), p) || (diesHere && cb->second.first == 0);
          if (owned && !consumedHere) rel.push_back(static_cast<ValueId>(v));
        }
        if (!rel.empty()) {
          Block pad;
          TypeId et = handler != kNoBlockRc ? f.valueTypes[f.blocks[handler].params[0]] : errorRefType();
          f.valueTypes.push_back(et);
          ValueId x = static_cast<ValueId>(f.valueTypes.size() - 1);  // not tracked: a pad only passes it on
          pad.params.push_back(x);
          for (ValueId v : rel) pad.insts.push_back(op(IrOp::Release, v));
          Inst last;
          last.ty = m.voidT();
          if (handler != kNoBlockRc) { last.op = IrOp::Br; last.edges = {Edge{handler, {x}}}; }
          else { last.op = IrOp::Throw; last.args = {x}; }
          pad.insts.push_back(std::move(last));
          f.blocks.push_back(std::move(pad));
          inst.edges = {Edge{static_cast<BlockId>(f.blocks.size() - 1), {}}};
        }
      }
      out.push_back(std::move(inst));
      if (res != kNoValue && isTracked(res)) {
        avail[res] = 1;
        bool used = usedAfter(res, p);
        if (resultBorrowed(src[p])) { if (used) out.push_back(op(IrOp::Retain, res)); }  // before the lender can be released
        else if (!used) out.push_back(op(IrOp::Release, res));
      }
      for (ValueId v : releaseAfter) out.push_back(op(IrOp::Release, v));
    }
    Inst term = src[n - 1];
    if (term.op == IrOp::Br || term.op == IrOp::CondBr) {
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
        for (std::size_t v = 0; v < nv && v < here.size(); ++v) if (here[v] && !needed[v] && !passed[v]) fix.push_back(op(IrOp::Release, static_cast<ValueId>(v)));
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

namespace {
// Functions that can raise an exception: they throw, or call (or may dispatch to) one that can.
std::vector<char> throwingFunctions(const Module& m) {
  std::vector<char> thr(m.functions.size(), 0);
  for (bool changed = true; changed;) {
    changed = false;
    for (std::size_t fi = 0; fi < m.functions.size(); ++fi) {
      if (thr[fi]) continue;
      for (const Block& b : m.functions[fi].blocks)
        for (const Inst& i : b.insts) {
          bool t = i.op == IrOp::Throw || (i.op == IrOp::Call && thr[i.sym]);
          if (i.op == IrOp::CallVirt)
            for (const Class& c : m.classes) if (!c.isInterface && !c.isAbstract && i.sym < c.vtable.size() && c.vtable[i.sym] < m.functions.size() && thr[c.vtable[i.sym]]) t = true;
          if (t) { thr[fi] = 1; changed = true; break; }
        }
    }
  }
  return thr;
}
}  // namespace

void insertRc(Module& m) {
  std::vector<char> thr = throwingFunctions(m);
  for (Function& f : m.functions) {
    Rc rc(m, f, thr);
    rc.run();
  }
}

}  // namespace zn::ir
