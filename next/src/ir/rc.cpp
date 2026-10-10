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
#include <cstdint>
#include <cstdlib>
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
  const std::vector<char>& mayThrow;     // per function
  const std::vector<char>& slotThrows;   // per vtable slot: some class's method there may throw
  std::size_t nb, nv;
  std::vector<char> tracked;
  std::vector<ValueId> anchor;   // per lent value: the tracked value it was read from (or the root of that chain), kept alive to its last use
  std::vector<char> reach;
  std::vector<std::vector<BlockId>> succ;   // every block a block can continue in: its terminator's targets and the handlers of its calls
  // Liveness is kept for the tracked values only, as bit sets (ZN-415): a tracked value's bit is its rank among them, so walking a set walks the values in
  // ascending order. A function of hero's has 1,109 blocks and 6,522 values; dense per-block byte vectors made this pass the slowest of the compiler.
  static constexpr std::uint32_t kNoBit = 0xFFFFFFFFu;
  std::vector<std::uint32_t> bit;   // per value: its bit, kNoBit when not tracked
  std::vector<ValueId> valueOf;     // per bit: the value
  std::size_t words = 0;
  std::vector<std::uint64_t> liveIn, liveOut;   // nb * words

  Rc(Module& mod, Function& fn, const std::vector<char>& thr, const std::vector<char>& slots)
      : m(mod), f(fn), mayThrow(thr), slotThrows(slots), nb(fn.blocks.size()), nv(fn.valueTypes.size()) {
    succ.resize(nb);
    for (BlockId b = 0; b < nb; ++b) for (const Inst& i : f.blocks[b].insts) for (const Edge& e : i.edges) succ[b].push_back(e.to);
  }

  bool throws(const Inst& i) const {
    if (i.op == IrOp::Call) return mayThrow[i.sym];
    return i.op == IrOp::CallVirt && i.sym < slotThrows.size() && slotThrows[i.sym];
  }

  bool isTracked(ValueId v) const { return v < nv && tracked[v]; }
  static bool test(const std::uint64_t* set, std::uint32_t k) { return (set[k >> 6] >> (k & 63)) & 1; }
  bool liveInAt(BlockId b, ValueId v) const { return v < nv && bit[v] != kNoBit && test(liveIn.data() + b * words, bit[v]); }
  bool liveOutAt(BlockId b, ValueId v) const { return v < nv && bit[v] != kNoBit && test(liveOut.data() + b * words, bit[v]); }
  template <class F> void eachBit(const std::uint64_t* set, F&& fn) const {   // in ascending value order
    for (std::size_t w = 0; w < words; ++w)
      for (std::uint64_t x = set[w]; x; x &= x - 1) fn(valueOf[w * 64 + static_cast<std::size_t>(__builtin_ctzll(x))]);
  }

  Inst op(IrOp o, ValueId v) {
    Inst i;
    i.op = o;
    i.ty = m.voidT();
    i.args = {v};
    return i;
  }

  // Whether an instruction may drop a reference the function was lent, or run code that could: calls, stores of references, the runtime
  // rows that release or call back (rtMayRelease), console output (an object's toString).
  bool mayRelease(const Inst& i) const {
    switch (i.op) {
      case IrOp::Call: case IrOp::CallVirt: case IrOp::CallNative: case IrOp::SetGlobal: case IrOp::Throw: case IrOp::ArrPop: return true;
      case IrOp::Builtin: return i.sym == static_cast<std::uint32_t>(Builtin::ConsoleLog) || i.sym == static_cast<std::uint32_t>(Builtin::ConsoleError);
      case IrOp::Rt: return rtMayRelease(static_cast<zn::Rt>(i.sym));
      case IrOp::ToStr: return !i.args.empty() && refLike(m, f.valueTypes[i.args[0]]);
      case IrOp::SetField: return refLike(m, f.valueTypes[i.args[1]]);
      case IrOp::ArrSet: case IrOp::ArrPush: return refLike(m, f.valueTypes[i.args[i.op == IrOp::ArrSet ? 2 : 1]]);
      default: return false;
    }
  }

  // A load lends its value: no retain and no release when no use consumes it (a call argument, a store, a return, an edge) and nothing in
  // its live range may release (ZN-413). What it was read from stays alive meanwhile: a global (nothing in the range stores), or the tracked
  // value at the root of the chain of loads, its anchor, whose last use becomes the lent value's last use.
  void classify() {
    tracked.assign(nv, 0);
    anchor.assign(nv, kNoValue);
    std::vector<const Inst*> defOf(nv, nullptr);
    std::vector<BlockId> defBlock(nv, 0);
    std::vector<std::size_t> defIdx(nv, 0);
    for (BlockId b = 0; b < nb; ++b) {
      for (ValueId p : f.blocks[b].params) tracked[p] = refLike(m, f.valueTypes[p]);
      for (std::size_t k = 0; k < f.blocks[b].insts.size(); ++k) {
        const Inst& i = f.blocks[b].insts[k];
        if (i.res == kNoValue || i.op == IrOp::Const) continue;
        tracked[i.res] = refLike(m, f.valueTypes[i.res]);
        defOf[i.res] = &i; defBlock[i.res] = b; defIdx[i.res] = k;
      }
    }
    liveness();
    std::vector<char> lent(nv, 0), consumed(nv, 0);
    for (BlockId b = 0; b < nb; ++b)
      for (const Inst& i : f.blocks[b].insts) {
        for (std::size_t k = 0; k < i.args.size(); ++k) if (i.args[k] < nv && consumes(i, k)) consumed[i.args[k]] = 1;
        for (const Edge& e : i.edges) for (ValueId a : e.args) if (a < nv) consumed[a] = 1;
      }
    static const bool off = std::getenv("ZN_NO_LEND") != nullptr;   // every load retained, to measure what lending saves
    for (std::size_t v = 0; v < nv && !off; ++v) {
      const Inst* d = defOf[v];
      if (!d || !tracked[v] || consumed[v] || !resultBorrowed(*d) || d->op == IrOp::RefCast) continue;   // a cast may lend an owned local that is released at its last use
      bool ok = true;
      for (BlockId b = 0; b < nb && ok; ++b) {
        if (!reach[b] || (defBlock[v] != b && !liveInAt(b, static_cast<ValueId>(v)))) continue;
        const std::vector<Inst>& ins = f.blocks[b].insts;
        long start = defBlock[v] == b ? static_cast<long>(defIdx[v]) + 1 : 0, end = -1;
        if (liveOutAt(b, static_cast<ValueId>(v))) end = static_cast<long>(ins.size()) - 1;
        else for (std::size_t p = 0; p < ins.size(); ++p) {
          bool uses = std::find(ins[p].args.begin(), ins[p].args.end(), static_cast<ValueId>(v)) != ins[p].args.end();
          if (uses) end = static_cast<long>(p);
        }
        for (long p = start; p <= end && ok; ++p) ok = !mayRelease(ins[static_cast<std::size_t>(p)]);
      }
      lent[v] = ok;
    }
    for (std::size_t v = 0; v < nv; ++v) {
      if (!lent[v]) continue;
      ValueId l = defOf[v]->op == IrOp::GetGlobal ? kNoValue : defOf[v]->args[0];
      while (l != kNoValue && l < nv && lent[l]) l = defOf[l]->op == IrOp::GetGlobal ? kNoValue : defOf[l]->args[0];
      anchor[v] = l < nv && tracked[l] ? l : kNoValue;   // an untracked root (an immortal constant) needs no keeping
    }
    for (std::size_t v = 0; v < nv; ++v) if (lent[v]) tracked[v] = 0;
  }
  ValueId anchorOf(ValueId v) const { return v < nv ? anchor[v] : kNoValue; }

  void liveness() {
    reach.assign(nb, 0);
    std::vector<BlockId> work{0};
    reach[0] = 1;
    while (!work.empty()) {
      BlockId b = work.back();
      work.pop_back();
      for (BlockId t : succ[b]) if (!reach[t]) { reach[t] = 1; work.push_back(t); }
    }
    bit.assign(nv, kNoBit);
    valueOf.clear();
    for (std::size_t v = 0; v < nv; ++v) if (tracked[v]) { bit[v] = static_cast<std::uint32_t>(valueOf.size()); valueOf.push_back(static_cast<ValueId>(v)); }
    words = (valueOf.size() + 63) / 64;
    std::vector<std::uint64_t> use(nb * words, 0), def(nb * words, 0);
    auto set = [&](std::vector<std::uint64_t>& s, BlockId b, ValueId v) { std::uint32_t k = bit[v]; s[b * words + (k >> 6)] |= std::uint64_t{1} << (k & 63); };
    for (BlockId b = 0; b < nb; ++b) {
      if (!reach[b]) continue;
      for (ValueId p : f.blocks[b].params) if (isTracked(p)) set(def, b, p);
      auto usev = [&](ValueId v) { if (isTracked(v) && !test(def.data() + b * words, bit[v])) set(use, b, v); };
      for (const Inst& i : f.blocks[b].insts) {
        for (ValueId a : i.args) { usev(a); if (anchorOf(a) != kNoValue) usev(anchorOf(a)); }
        for (const Edge& e : i.edges) for (ValueId a : e.args) usev(a);
        if (i.res != kNoValue && isTracked(i.res)) set(def, b, i.res);
      }
    }
    liveIn.assign(nb * words, 0);
    liveOut.assign(nb * words, 0);
    for (bool changed = true; changed;) {
      changed = false;
      for (BlockId b = nb; b-- > 0;) {
        if (!reach[b]) continue;
        std::uint64_t* out = liveOut.data() + b * words;
        std::uint64_t* in = liveIn.data() + b * words;
        for (BlockId t : succ[b])
          for (std::size_t w = 0; w < words; ++w) { std::uint64_t x = out[w] | liveIn[t * words + w]; changed |= x != out[w]; out[w] = x; }
        for (std::size_t w = 0; w < words; ++w) { std::uint64_t x = in[w] | use[b * words + w] | (out[w] & ~def[b * words + w]); changed |= x != in[w]; in[w] = x; }
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
    // per tracked value, by its bit: the last instruction using it (the terminator counts its edge arguments), and whether this block has it by now
    // (live in, parameters, results so far)
    std::vector<long> lastIdx(valueOf.size(), -1);
    std::vector<char> avail(valueOf.size(), 0);
    auto last = [&](ValueId v) -> long& { return lastIdx[bit[v]]; };
    for (std::size_t p = 0; p < n; ++p) {
      for (ValueId a : src[p].args) { if (isTracked(a)) last(a) = static_cast<long>(p); if (anchorOf(a) != kNoValue) last(anchorOf(a)) = static_cast<long>(p); }
      for (const Edge& e : src[p].edges) for (ValueId a : e.args) if (isTracked(a)) last(a) = static_cast<long>(p);
    }
    auto usedAfter = [&](ValueId v, std::size_t p) { return liveOutAt(b, v) || last(v) > static_cast<long>(p); };
    std::vector<Inst> out;
    eachBit(liveIn.data() + b * words, [&](ValueId v) { avail[bit[v]] = 1; });
    for (ValueId p : params) if (isTracked(p)) avail[bit[p]] = 1;
    for (ValueId p : params) if (isTracked(p) && !liveOutAt(b, p) && last(p) < 0) out.push_back(op(IrOp::Release, p));
    for (std::size_t p = 0; p + 1 < n; ++p) {
      Inst inst = src[p];
      std::map<ValueId, std::pair<int, int>> counts;  // consuming, borrowing occurrences in this instruction
      for (std::size_t k = 0; k < inst.args.size(); ++k) {
        if (isTracked(inst.args[k])) (consumes(inst, k) ? counts[inst.args[k]].first : counts[inst.args[k]].second)++;
        else if (anchorOf(inst.args[k]) != kNoValue) counts[anchorOf(inst.args[k])].second++;   // a lent value's use keeps its anchor
      }
      std::vector<ValueId> releaseAfter;
      for (auto& [v, cb] : counts) {
        bool dies = !liveOutAt(b, v) && last(v) == static_cast<long>(p);
        int retains = dies ? (cb.first > 0 ? cb.first - 1 : 0) : cb.first;
        for (int r = 0; r < retains; ++r) out.push_back(op(IrOp::Retain, v));
        if (dies && cb.first == 0) releaseAfter.push_back(v);
      }
      ValueId res = inst.res;
      if (throws(inst) || !inst.edges.empty()) {
        // What this frame still owns when the call unwinds and the handler has no use for is released first, on a path of its own.
        BlockId handler = inst.edges.empty() ? kNoBlockRc : inst.edges[0].to;
        std::vector<ValueId> rel;
        for (ValueId v : valueOf) {
          if (!avail[bit[v]] || v == res) continue;
          if (handler != kNoBlockRc && liveInAt(handler, v)) continue;
          auto cb = counts.find(v);
          bool diesHere = cb != counts.end() && !liveOutAt(b, v) && last(v) == static_cast<long>(p);
          bool consumedHere = diesHere && cb->second.first > 0;
          bool owned = usedAfter(v, p) || (diesHere && cb->second.first == 0);
          if (owned && !consumedHere) rel.push_back(v);
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
        avail[bit[res]] = 1;
        bool used = usedAfter(res, p);
        if (resultBorrowed(src[p])) { if (used) out.push_back(op(IrOp::Retain, res)); }  // before the lender can be released
        else if (!used) out.push_back(op(IrOp::Release, res));
      }
      for (ValueId v : releaseAfter) out.push_back(op(IrOp::Release, v));
    }
    Inst term = src[n - 1];
    if (term.op == IrOp::Br || term.op == IrOp::CondBr) {
      std::vector<std::uint64_t> here(liveOut.begin() + static_cast<long>(b * words), liveOut.begin() + static_cast<long>((b + 1) * words));   // owned at the terminator: live out, or passed along some edge (and so unused on the others)
      for (const Edge& e : term.edges) for (ValueId a : e.args) if (isTracked(a)) here[bit[a] >> 6] |= std::uint64_t{1} << (bit[a] & 63);
      for (std::size_t ei = 0; ei < term.edges.size(); ++ei) {
        Edge& e = term.edges[ei];
        const std::uint64_t* needed = liveIn.data() + e.to * words;
        std::vector<Inst> fix;
        std::vector<ValueId> passed, transferred;   // a few edge arguments
        auto has = [](const std::vector<ValueId>& xs, ValueId v) { return std::find(xs.begin(), xs.end(), v) != xs.end(); };
        for (ValueId a : e.args) {
          if (!isTracked(a)) continue;
          passed.push_back(a);
          if (test(needed, bit[a]) || has(transferred, a)) fix.push_back(op(IrOp::Retain, a));
          else transferred.push_back(a);
        }
        std::vector<std::uint64_t> gone(words);
        for (std::size_t w = 0; w < words; ++w) gone[w] = here[w] & ~needed[w];
        eachBit(gone.data(), [&](ValueId v) { if (!has(passed, v)) fix.push_back(op(IrOp::Release, v)); });
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
    for (BlockId b = 0; b < nb; ++b) if (reach[b]) block(b);
  }
};

}  // namespace

namespace {
// Per vtable slot: whether a concrete class's method in it can raise an exception.
std::vector<char> throwingSlots(const Module& m, const std::vector<char>& thr) {
  std::vector<char> slots;
  for (const Class& c : m.classes) {
    if (c.isInterface || c.isAbstract) continue;
    if (slots.size() < c.vtable.size()) slots.resize(c.vtable.size(), 0);
    for (std::size_t k = 0; k < c.vtable.size(); ++k) if (c.vtable[k] < m.functions.size() && thr[c.vtable[k]]) slots[k] = 1;
  }
  return slots;
}

// Functions that can raise an exception: they throw, or call (or may dispatch to) one that can.
std::vector<char> throwingFunctions(const Module& m) {
  std::vector<char> thr(m.functions.size(), 0);
  for (bool changed = true; changed;) {
    changed = false;
    std::vector<char> slots = throwingSlots(m, thr);
    for (std::size_t fi = 0; fi < m.functions.size(); ++fi) {
      if (thr[fi]) continue;
      for (const Block& b : m.functions[fi].blocks)
        for (const Inst& i : b.insts) {
          bool t = i.op == IrOp::Throw || (i.op == IrOp::Call && thr[i.sym]) || (i.op == IrOp::CallVirt && i.sym < slots.size() && slots[i.sym]);
          if (t) { thr[fi] = 1; changed = true; break; }
        }
    }
  }
  return thr;
}
}  // namespace

void insertRc(Module& m) {
  std::vector<char> thr = throwingFunctions(m);
  std::vector<char> slots = throwingSlots(m, thr);
  for (Function& f : m.functions) {
    Rc rc(m, f, thr, slots);
    rc.run();
  }
}

}  // namespace zn::ir
