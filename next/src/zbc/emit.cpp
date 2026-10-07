// IR -> ZBC: reverse-postorder layout, liveness, linear-scan register allocation with block-parameter coalescing and
// call windows (a call's arguments sit in consecutive registers from a base above every live register; the callee's frame
// starts there and its result lands in the base register), then typed instruction selection and parallel moves on edges.
#include <algorithm>
#include <cstring>
#include <functional>

#include "zbc/zbc.h"

namespace zn::zbc {
namespace {

using ir::BlockId;
using ir::IrOp;
using ir::ValueId;
using NumK = frontend::Num;
constexpr std::uint32_t kNoReg = 0xFFFFFFFFu;

bool isSigned(NumK n) { return n == NumK::i8 || n == NumK::i16 || n == NumK::i32 || n == NumK::i64 || n == NumK::isize; }
bool isFloatK(NumK n) { return n == NumK::f64 || n == NumK::f32; }
bool isFxK(NumK n) { return n == NumK::fx12 || n == NumK::fx16; }

std::int64_t canon(NumK n, std::int64_t v) {
  switch (n) {
    case NumK::i8: return static_cast<std::int8_t>(v);
    case NumK::i16: return static_cast<std::int16_t>(v);
    case NumK::i32: return static_cast<std::int32_t>(v);
    case NumK::u8: return static_cast<std::uint8_t>(v);
    case NumK::u16: return static_cast<std::uint16_t>(v);
    case NumK::u32: return static_cast<std::uint32_t>(v);
    default: return v;
  }
}

// Operation families of one width/signedness; narrower kinds compute in a 32-bit family and narrow the result.
enum class Fam { I32, U32, I64, U64, F32, F64 };
Fam famOf(NumK n) {
  switch (n) {
    case NumK::f64: return Fam::F64;
    case NumK::f32: return Fam::F32;
    case NumK::u32: return Fam::U32;
    case NumK::i64: case NumK::isize: return Fam::I64;
    case NumK::u64: case NumK::usize: return Fam::U64;
    default: return Fam::I32;  // i8 i16 i32 u8 u16
  }
}
bool narrowOp(NumK n, Op& op) {
  switch (n) {
    case NumK::i8: op = Op::NarrowI8; return true;
    case NumK::i16: op = Op::NarrowI16; return true;
    case NumK::u8: op = Op::NarrowU8; return true;
    case NumK::u16: op = Op::NarrowU16; return true;
    default: return false;
  }
}

constexpr Op kArith[6][5] = {
    {Op::AddI32, Op::SubI32, Op::MulI32, Op::DivI32, Op::RemI32},
    {Op::AddU32, Op::SubU32, Op::MulU32, Op::DivU32, Op::RemU32},
    {Op::AddI64, Op::SubI64, Op::MulI64, Op::DivI64, Op::RemI64},
    {Op::AddU64, Op::SubU64, Op::MulU64, Op::DivU64, Op::RemU64},
    {Op::AddF32, Op::SubF32, Op::MulF32, Op::DivF32, Op::RemF32},
    {Op::AddF64, Op::SubF64, Op::MulF64, Op::DivF64, Op::RemF64},
};

// IR types to ZBC value types. Strings, arrays, Map and Set map to builtin classes, appended to the module's class table on
// first use (after the IR's own classes, whose indices stay as they are).
struct TypeTable {
  const ir::Module& im;
  Module& zm;
  std::uint32_t strCls = ir::kNoClass;

  std::uint16_t coll(CKind k, VType elem, VType key, ir::TypeId t) {
    for (std::size_t c = 0; c < zm.classes.size(); ++c) {
      const ClassInfo& ci = zm.classes[c];
      if (ci.kind == k && (k == CKind::String || (ci.elem == elem && ci.key == key))) return static_cast<std::uint16_t>(c);
    }
    ClassInfo info;
    info.name = ir::typeName(im, t);
    info.kind = k;
    info.elem = elem;
    info.key = key;
    zm.classes.push_back(std::move(info));
    return static_cast<std::uint16_t>(zm.classes.size() - 1);
  }
  VType vt(ir::TypeId t) {
    const ir::Type& x = im.types[t];
    switch (x.k) {
      case ir::Type::K::Bool: return {Cls::I, 0};
      case ir::Type::K::Num: return {x.num == NumK::f64 ? Cls::D : x.num == NumK::f32 ? Cls::S : Cls::I, 0};
      case ir::Type::K::Ref: return {Cls::R, static_cast<std::uint16_t>(x.aux)};
      case ir::Type::K::Str: return {Cls::R, coll(CKind::String, {}, {}, t)};
      case ir::Type::K::Array: { VType e = vt(x.aux); return {Cls::R, coll(CKind::Array, e, {}, t)}; }
      case ir::Type::K::Set: { VType e = vt(x.aux); return {Cls::R, coll(CKind::Set, e, {}, t)}; }
      case ir::Type::K::Map: { VType e = vt(x.aux), k = vt(x.aux2); return {Cls::R, coll(CKind::Map, e, k, t)}; }
      default: return {Cls::None, 0};
    }
  }
};

struct FnEmitter {
  const ir::Module& im;
  const ir::Function& f;
  Function& zf;
  TypeTable& tt;
  std::vector<const ir::Inst*> defOf;  // the instruction defining each value, for peephole decisions
  std::string error;

  std::size_t nb, nv;
  std::vector<Cls> cls;
  std::vector<BlockId> order;
  std::vector<std::uint32_t> lay;
  std::vector<std::uint32_t> hdr, endPos;      // per block (IR id): header position, terminator position
  std::vector<std::vector<std::uint32_t>> ipos;  // per block: position of each instruction
  std::vector<std::uint32_t> start, end, reg;  // per value
  std::vector<std::uint32_t> callBase;         // per position
  std::uint32_t frame = 0;

  FnEmitter(const ir::Module& mod, const ir::Function& fn, Function& out, TypeTable& types) : im(mod), f(fn), zf(out), tt(types), nb(fn.blocks.size()), nv(fn.valueTypes.size()) {}

  bool fail(const std::string& msg) { if (error.empty()) error = msg; return false; }

  const ir::Type& ty(ir::TypeId t) const { return im.types[t]; }
  VType vtOf(ir::TypeId t) const { return tt.vt(t); }
  NumK numOf(ValueId v) const { return ty(f.valueTypes[v]).num; }
  bool isNumV(ValueId v) const { return ty(f.valueTypes[v]).k == ir::Type::K::Num; }

  bool classify() {
    cls.assign(nv, Cls::None);
    for (std::size_t v = 0; v < nv; ++v) {
      const ir::Type& t = ty(f.valueTypes[v]);
      switch (t.k) {
        case ir::Type::K::Bool: cls[v] = Cls::I; break;
        case ir::Type::K::Num:
          if (isFxK(t.num)) return fail("fixed-point kinds are not supported yet");
          cls[v] = t.num == NumK::f64 ? Cls::D : t.num == NumK::f32 ? Cls::S : Cls::I;
          break;
        case ir::Type::K::Ref: case ir::Type::K::Str: case ir::Type::K::Array: case ir::Type::K::Map: case ir::Type::K::Set: cls[v] = Cls::R; (void)vtOf(f.valueTypes[v]); break;  // also adds the builtin class
        case ir::Type::K::Void: break;
      }
    }
    zf.params.clear();
    for (ValueId p : f.params) zf.params.push_back(vtOf(f.valueTypes[p]));
    const ir::Type& rt = ty(f.ret);
    if (rt.k == ir::Type::K::Num && isFxK(rt.num)) return fail("unsupported return type");
    zf.ret = vtOf(f.ret);
    for (const ir::Block& b : f.blocks)
      for (const ir::Inst& i : b.insts) {
        if (i.op == IrOp::ToStr && isFxK(ty(f.valueTypes[i.args[0]]).num)) return fail("fixed-point kinds are not supported yet");
      }
    return true;
  }

  // Instructions that take their operands in a call window (consecutive registers above every live one) and leave the
  // result in its first register: calls and everything that runs in the runtime.
  bool isWindow(const ir::Inst& i) const {
    switch (i.op) {
      case IrOp::Builtin: return i.sym == static_cast<std::uint32_t>(ir::Builtin::NumToFixed);
      case IrOp::Call: case IrOp::CallVirt: case IrOp::CallNative: case IrOp::Rt: case IrOp::StrConcat: case IrOp::ToStr: case IrOp::StrLen: case IrOp::ArrPop: return true;
      case IrOp::Eq: case IrOp::Ne: case IrOp::Lt: case IrOp::Le: case IrOp::Gt: case IrOp::Ge: return ty(f.valueTypes[i.args[0]]).k == ir::Type::K::Str;
      default: return false;
    }
  }

  // ---- instruction selection plan: immediate operands and fused compare-and-jump
  struct KForm { bool on = false; ValueId other = 0; int imm = 0; };
  struct Fuse { bool on = false; std::size_t at = 0; IrOp cop = IrOp::Eq; ValueId x = 0, y = 0; bool yImm = false; int imm = 0; bool uns = false; bool flt = false; };
  std::vector<std::uint32_t> uses;
  std::vector<char> noReg;       // values that never occupy a register: folded constants and fused compare results
  std::vector<KForm> kform;      // per result value: add/sub with an immediate
  std::vector<Fuse> fuse;        // per block: compare fused into the block's CondBr

  static IrOp mirror(IrOp o) { return o == IrOp::Lt ? IrOp::Gt : o == IrOp::Gt ? IrOp::Lt : o == IrOp::Le ? IrOp::Ge : o == IrOp::Ge ? IrOp::Le : o; }
  static IrOp negate(IrOp o) { return o == IrOp::Eq ? IrOp::Ne : o == IrOp::Ne ? IrOp::Eq : o == IrOp::Lt ? IrOp::Ge : o == IrOp::Ge ? IrOp::Lt : o == IrOp::Le ? IrOp::Gt : IrOp::Le; }

  void plan() {
    uses.assign(nv, 0);
    noReg.assign(nv, 0);
    kform.assign(nv, KForm{});
    fuse.assign(nb, Fuse{});
    defOf.assign(nv, nullptr);
    for (const ir::Block& b : f.blocks)
      for (const ir::Inst& i : b.insts) {
        for (ValueId a : i.args) ++uses[a];
        for (const ir::Edge& e : i.edges) for (ValueId a : e.args) ++uses[a];
        if (i.res != ir::kNoValue) defOf[i.res] = &i;
      }
    // a single-use integer constant that fits a signed byte
    auto smallConst = [&](ValueId v, int& out) {
      const ir::Inst* d = defOf[v];
      if (!d || d->op != IrOp::Const || uses[v] != 1) return false;
      const ir::Type& t = ty(d->ty);
      if (t.k != ir::Type::K::Num || isFloatK(t.num)) return false;
      std::int64_t c = canon(t.num, d->imm);
      if (c < -128 || c > 127) return false;
      out = static_cast<int>(c);
      return true;
    };
    for (std::size_t bi = 0; bi < nb; ++bi) {
      const ir::Block& b = f.blocks[bi];
      for (const ir::Inst& i : b.insts) {
        if ((i.op != IrOp::Add && i.op != IrOp::Sub) || i.res == ir::kNoValue) continue;
        const ir::Type& t = ty(i.ty);
        if (t.k != ir::Type::K::Num || famOf(t.num) != Fam::I32) continue;
        int c;
        if (smallConst(i.args[1], c) && (i.op == IrOp::Add || (-c >= -128 && -c <= 127))) {
          kform[i.res] = {true, i.args[0], i.op == IrOp::Add ? c : -c};
          noReg[i.args[1]] = 1;
        } else if (i.op == IrOp::Add && smallConst(i.args[0], c)) {
          kform[i.res] = {true, i.args[1], c};
          noReg[i.args[0]] = 1;
        }
      }
      if (b.insts.size() < 2) continue;
      const ir::Inst& term = b.insts.back();
      const ir::Inst& c = b.insts[b.insts.size() - 2];
      bool isCmp = c.op == IrOp::Eq || c.op == IrOp::Ne || c.op == IrOp::Lt || c.op == IrOp::Le || c.op == IrOp::Gt || c.op == IrOp::Ge;
      if (term.op != IrOp::CondBr || !isCmp || term.args[0] != c.res || uses[c.res] != 1) continue;
      const ir::Type& ot = ty(f.valueTypes[c.args[0]]);
      bool numInt = ot.k == ir::Type::K::Num && !isFloatK(ot.num);
      bool boolEq = ot.k == ir::Type::K::Bool && (c.op == IrOp::Eq || c.op == IrOp::Ne);
      bool f64 = ot.k == ir::Type::K::Num && ot.num == NumK::f64;
      if (!numInt && !boolEq && !f64) continue;
      Fuse fz;
      fz.on = true; fz.at = b.insts.size() - 2; fz.cop = c.op; fz.x = c.args[0]; fz.y = c.args[1];
      fz.uns = numInt && !isSigned(ot.num);
      fz.flt = f64;
      bool orderCmp = c.op != IrOp::Eq && c.op != IrOp::Ne;
      if (numInt && !(fz.uns && orderCmp)) {  // immediate forms are signed (or equality)
        int k;
        if (smallConst(fz.y, k)) { fz.yImm = true; fz.imm = k; noReg[fz.y] = 1; }
        else if (smallConst(fz.x, k)) { std::swap(fz.x, fz.y); fz.cop = mirror(fz.cop); fz.yImm = true; fz.imm = k; noReg[fz.y] = 1; }
      }
      noReg[c.res] = 1;
      fuse[bi] = fz;
    }
  }

  // ---- layout and liveness
  void layout() {
    std::vector<char> seen(nb, 0);
    std::vector<BlockId> post;
    std::function<void(BlockId)> visit = [&](BlockId b) {
      seen[b] = 1;
      for (std::size_t ii = f.blocks[b].insts.size(); ii-- > 0;) {  // the targets of a terminator, and the handlers of the calls before it
        const auto& es = f.blocks[b].insts[ii].edges;
        for (std::size_t k = es.size(); k-- > 0;) if (!seen[es[k].to]) visit(es[k].to);
      }
      post.push_back(b);
    };
    visit(0);
    order.assign(post.rbegin(), post.rend());
    lay.assign(nb, kNoReg);
    for (std::size_t k = 0; k < order.size(); ++k) lay[order[k]] = static_cast<std::uint32_t>(k);
  }

  void intervals() {
    hdr.assign(nb, 0); endPos.assign(nb, 0); ipos.assign(nb, {});
    std::uint32_t pos = 0;
    for (BlockId b : order) {
      hdr[b] = pos++;
      for (std::size_t k = 0; k < f.blocks[b].insts.size(); ++k) ipos[b].push_back(pos++);
      endPos[b] = ipos[b].back();
    }
    callBase.assign(pos, kNoReg);
    start.assign(nv, 0); end.assign(nv, 0);
    std::vector<char> defined(nv, 0);
    auto def = [&](ValueId v, std::uint32_t p) { start[v] = end[v] = p; defined[v] = 1; };
    for (BlockId b : order) {
      for (ValueId p : f.blocks[b].params) def(p, hdr[b]);
      for (std::size_t k = 0; k < f.blocks[b].insts.size(); ++k) if (f.blocks[b].insts[k].res != ir::kNoValue) def(f.blocks[b].insts[k].res, ipos[b][k]);
    }
    std::vector<std::vector<char>> use(nb, std::vector<char>(nv, 0)), kill(nb, std::vector<char>(nv, 0));
    std::vector<std::vector<char>> in(nb, std::vector<char>(nv, 0)), out(nb, std::vector<char>(nv, 0));
    for (BlockId b : order) {
      for (ValueId p : f.blocks[b].params) kill[b][p] = 1;
      for (std::size_t k = 0; k < f.blocks[b].insts.size(); ++k) {
        const ir::Inst& i = f.blocks[b].insts[k];
        auto usev = [&](ValueId v) { if (!kill[b][v]) use[b][v] = 1; end[v] = std::max(end[v], ipos[b][k]); };
        for (ValueId a : i.args) usev(a);
        for (const ir::Edge& e : i.edges) for (ValueId a : e.args) usev(a);
        if (i.res != ir::kNoValue) kill[b][i.res] = 1;
      }
    }
    for (bool changed = true; changed;) {
      changed = false;
      for (std::size_t k = order.size(); k-- > 0;) {
        BlockId b = order[k];
        for (const ir::Inst& si : f.blocks[b].insts)
          for (const ir::Edge& e : si.edges)
            for (std::size_t v = 0; v < nv; ++v) if (in[e.to][v] && !out[b][v]) { out[b][v] = 1; changed = true; }
        for (std::size_t v = 0; v < nv; ++v) if (!in[b][v] && (use[b][v] || (out[b][v] && !kill[b][v]))) { in[b][v] = 1; changed = true; }
      }
    }
    for (BlockId b : order)
      for (std::size_t v = 0; v < nv; ++v) {
        if (in[b][v]) { start[v] = std::min(start[v], hdr[b]); end[v] = std::max(end[v], hdr[b]); }
        if (out[b][v]) end[v] = std::max(end[v], endPos[b]);
      }
  }

  // ---- register allocation
  std::vector<std::uint32_t> hint;
  std::vector<std::vector<ValueId>> feeds, fedBy;  // arg -> params it feeds; param -> args feeding it

  bool allocate() {
    reg.assign(nv, kNoReg);
    hint.assign(nv, kNoReg);
    feeds.assign(nv, {}); fedBy.assign(nv, {});
    for (BlockId b : order)
      for (const ir::Edge& e : f.blocks[b].insts.back().edges)
        for (std::size_t k = 0; k < e.args.size(); ++k) {
          ValueId p = f.blocks[e.to].params[k];
          feeds[e.args[k]].push_back(p);
          fedBy[p].push_back(e.args[k]);
        }
    // An argument whose last use is a call can be computed straight into its window slot: remember the call and slot.
    std::vector<std::uint32_t> callPosOf(nv, kNoReg), slotOf(nv, 0);
    for (BlockId b : order)
      for (std::size_t k = 0; k < f.blocks[b].insts.size(); ++k) {
        const ir::Inst& ci = f.blocks[b].insts[k];
        if (!isWindow(ci)) continue;
        for (std::size_t a = 0; a < ci.args.size(); ++a)
          if (end[ci.args[a]] == ipos[b][k] && callPosOf[ci.args[a]] == kNoReg) { callPosOf[ci.args[a]] = ipos[b][k]; slotOf[ci.args[a]] = static_cast<std::uint32_t>(a); }
      }
    std::vector<ValueId> owner(kMaxRegisters, ir::kNoValue);
    std::vector<ValueId> active;
    std::uint32_t top = 0;  // one past the highest register used
    auto expire = [&](std::uint32_t pos) {
      for (std::size_t k = 0; k < active.size();) {
        if (end[active[k]] <= pos) { owner[reg[active[k]]] = ir::kNoValue; active[k] = active.back(); active.pop_back(); }
        else ++k;
      }
    };
    auto take = [&](ValueId v, std::uint32_t r) {
      reg[v] = r; owner[r] = v; active.push_back(v); top = std::max(top, r + 1);
      for (ValueId p : feeds[v]) if (reg[p] != kNoReg && hint[v] == kNoReg) hint[v] = reg[p];
      for (ValueId p : feeds[v]) (void)p;
    };
    auto pick = [&](ValueId v) -> std::uint32_t {
      std::uint32_t h = hint[v];
      if (h == kNoReg) for (ValueId a : fedBy[v]) if (reg[a] != kNoReg && owner[reg[a]] == ir::kNoValue) { h = reg[a]; break; }
      if (h == kNoReg) for (ValueId p : feeds[v]) if (reg[p] != kNoReg && owner[reg[p]] == ir::kNoValue) { h = reg[p]; break; }
      if (h == kNoReg && callPosOf[v] != kNoReg) {  // estimate the window base from the values already live across the call
        std::uint32_t base = 0;
        for (ValueId a : active) if (end[a] > callPosOf[v]) base = std::max(base, reg[a] + 1);
        h = base + slotOf[v];
      }
      if (h != kNoReg && h < kMaxRegisters && owner[h] == ir::kNoValue) return h;
      for (std::uint32_t r = 0; r < kMaxRegisters; ++r) if (owner[r] == ir::kNoValue) return r;
      return kNoReg;
    };
    auto setHints = [&](ValueId v) {
      for (ValueId p : feeds[v]) if (reg[p] == kNoReg) hint[p] = hint[p] == kNoReg ? reg[v] : hint[p];
      for (ValueId a : fedBy[v]) if (reg[a] == kNoReg) hint[a] = hint[a] == kNoReg ? reg[v] : hint[a];
    };
    for (BlockId b : order) {
      expire(hdr[b]);
      for (std::size_t k = 0; k < f.blocks[b].params.size(); ++k) {
        ValueId p = f.blocks[b].params[k];
        std::uint32_t r = b == 0 ? static_cast<std::uint32_t>(k) : pick(p);
        if (r == kNoReg) return fail("function needs more than 256 registers");
        take(p, r);
        setHints(p);
      }
      for (std::size_t k = 0; k < f.blocks[b].insts.size(); ++k) {
        const ir::Inst& i = f.blocks[b].insts[k];
        std::uint32_t pos = ipos[b][k];
        expire(pos);
        if (isWindow(i)) {
          std::uint32_t base = 0;
          for (ValueId a : active) base = std::max(base, reg[a] + 1);
          std::uint32_t nargs = static_cast<std::uint32_t>(i.args.size());
          if (base + std::max<std::uint32_t>(nargs, 1) > kMaxRegisters) return fail("function needs more than 256 registers");
          callBase[pos] = base;
          frame = std::max(frame, base + std::max<std::uint32_t>(nargs, 1));
          if (i.res != ir::kNoValue) { take(i.res, base); setHints(i.res); }
          continue;
        }
        if (i.res != ir::kNoValue && !noReg[i.res]) {
          // Update in place: the last instruction before a branch computes a block argument from its own parameter (i = i + 1):
          // the result may overwrite the parameter's register, because the edge overwrites it anyway (the register is
          // not tracked as owned by the result; the parameter keeps it).
          if (k + 2 == f.blocks[b].insts.size() && f.blocks[b].insts.back().op == IrOp::Br && f.blocks[b].insts.back().edges.size() == 1) {
            const ir::Edge& e = f.blocks[b].insts.back().edges[0];
            std::size_t uses = 0, at = 0;
            for (std::size_t q = 0; q < e.args.size(); ++q) if (e.args[q] == i.res) { ++uses; at = q; }
            if (uses == 1 && end[i.res] == ipos[b][k + 1]) {
              ValueId p = f.blocks[e.to].params[at];
              std::uint32_t pr = reg[p];
              bool ok = pr != kNoReg && owner[pr] == p && reg[p] != kNoReg && f.valueTypes[p] == f.valueTypes[i.res];
              for (std::size_t q = 0; ok && q < e.args.size(); ++q) if (q != at && reg[e.args[q]] == pr) ok = false;
              if (ok) { reg[i.res] = pr; continue; }
            }
          }
          std::uint32_t r = pick(i.res);
          if (r == kNoReg) return fail("function needs more than 256 registers");
          take(i.res, r);
          setHints(i.res);
        }
      }
    }
    frame = std::max(frame, top);
    return true;
  }

  // ---- emission
  enum class Patch { Ax, Ad, Word };  // where a jump target lives: 24-bit, high 16 bits, or the instruction's second word
  struct Fixup { std::size_t at; BlockId target; Patch kind; };
  struct Stub { std::size_t at; Patch kind; std::vector<std::pair<std::uint32_t, std::uint32_t>> moves; BlockId target; };
  std::vector<std::pair<std::uint32_t, BlockId>> unwinds;  // (pc of a call that can unwind, its handler block)
  std::vector<Fixup> fixups;
  std::vector<Stub> stubs;
  std::vector<std::size_t> blockStart;
  bool usedScratch = false;

  void put(std::uint32_t w) { zf.code.push_back(w); }
  void mv(std::uint32_t d, std::uint32_t s) { if (d != s) put(encABC(Op::Move, d, s)); }

  void parallelMoves(std::vector<std::pair<std::uint32_t, std::uint32_t>> moves) {  // (dst, src)
    moves.erase(std::remove_if(moves.begin(), moves.end(), [](auto& m) { return m.first == m.second; }), moves.end());
    while (!moves.empty()) {
      bool progressed = false;
      for (std::size_t k = 0; k < moves.size(); ++k) {
        bool blocked = false;
        for (std::size_t j = 0; j < moves.size(); ++j) if (j != k && moves[j].second == moves[k].first) blocked = true;
        if (blocked) continue;
        mv(moves[k].first, moves[k].second);
        moves.erase(moves.begin() + static_cast<std::ptrdiff_t>(k));
        progressed = true;
        break;
      }
      if (progressed) continue;
      usedScratch = true;  // a cycle: park one destination's current value in the scratch register
      std::uint32_t d = moves[0].first;
      mv(frame, d);
      for (auto& m : moves) if (m.second == d) m.second = frame;
    }
  }

  std::vector<std::pair<std::uint32_t, std::uint32_t>> edgeMoves(const ir::Edge& e) {
    std::vector<std::pair<std::uint32_t, std::uint32_t>> mvs;
    for (std::size_t k = 0; k < e.args.size(); ++k) mvs.push_back({reg[f.blocks[e.to].params[k]], reg[e.args[k]]});
    return mvs;
  }

  std::uint32_t addConst(Cls c, std::uint64_t bits) {
    for (std::uint32_t k = 0; k < zf.consts.size(); ++k) if (zf.consts[k].cls == c && zf.consts[k].bits == bits) return k;
    zf.consts.push_back({c, bits});
    return static_cast<std::uint32_t>(zf.consts.size() - 1);
  }

  void loadConst(std::uint32_t r, const ir::Inst& i) {
    const ir::Type& t = ty(i.ty);
    if (t.k == ir::Type::K::Bool || (t.k == ir::Type::K::Num && !isFloatK(t.num))) {
      std::int64_t v = t.k == ir::Type::K::Bool ? (i.imm ? 1 : 0) : canon(t.num, i.imm);
      if (v >= -32768 && v <= 32767) { put(encAD(Op::LoadI, r, static_cast<unsigned>(v) & 0xFFFFu)); return; }
      put(encAD(Op::LoadK, r, addConst(Cls::I, static_cast<std::uint64_t>(v))));
      return;
    }
    if (t.num == NumK::f64) { std::uint64_t bits; std::memcpy(&bits, &i.fimm, 8); put(encAD(Op::LoadK, r, addConst(Cls::D, bits))); return; }
    float fl = static_cast<float>(i.fimm);
    std::uint32_t lo; std::memcpy(&lo, &fl, 4);
    put(encAD(Op::LoadK, r, addConst(Cls::S, lo)));
  }

  bool emitConv(std::uint32_t d, std::uint32_t s, NumK from, NumK to) {
    bool fi = !isFloatK(from), ti = !isFloatK(to);
    if (fi && ti) {
      Op op;
      bool lossless = frontend::widens(from, to);
      if (!lossless) {
        switch (to) {
          case NumK::i8: op = Op::NarrowI8; break;
          case NumK::i16: op = Op::NarrowI16; break;
          case NumK::i32: op = Op::NarrowI32; break;
          case NumK::u8: op = Op::NarrowU8; break;
          case NumK::u16: op = Op::NarrowU16; break;
          case NumK::u32: op = Op::NarrowU32; break;
          default: mv(d, s); return true;
        }
        put(encABC(op, d, s));
      } else mv(d, s);
      return true;
    }
    if (fi && !ti) { put(encABC(isSigned(from) ? (to == NumK::f64 ? Op::I64ToF64 : Op::I64ToF32) : (to == NumK::f64 ? Op::U64ToF64 : Op::U64ToF32), d, s)); return true; }
    if (!fi && ti) {
      put(encABC(isSigned(to) ? (from == NumK::f64 ? Op::F64ToI64 : Op::F32ToI64) : (from == NumK::f64 ? Op::F64ToU64 : Op::F32ToU64), d, s));
      Op nop;
      switch (to) {
        case NumK::i8: nop = Op::NarrowI8; break;
        case NumK::i16: nop = Op::NarrowI16; break;
        case NumK::i32: nop = Op::NarrowI32; break;
        case NumK::u8: nop = Op::NarrowU8; break;
        case NumK::u16: nop = Op::NarrowU16; break;
        case NumK::u32: nop = Op::NarrowU32; break;
        default: return true;
      }
      put(encABC(nop, d, d));
      return true;
    }
    if (from == to) mv(d, s);
    else put(encABC(from == NumK::f32 ? Op::F32ToF64 : Op::F64ToF32, d, s));
    return true;
  }

  // A runtime call: the operands go to the call window, the result comes back in its first register.
  bool rtOp(const ir::Inst& i, std::uint32_t pos, zn::Rt id) {
    std::uint32_t base = callBase[pos];
    std::vector<std::pair<std::uint32_t, std::uint32_t>> mvs;
    for (std::size_t a = 0; a < i.args.size(); ++a) mvs.push_back({base + static_cast<std::uint32_t>(a), reg[i.args[a]]});
    parallelMoves(mvs);
    put(encAD(Op::Rt, base, static_cast<std::uint32_t>(id)));
    return true;
  }

  bool emitInst(BlockId b, std::size_t k) {
    const ir::Inst& i = f.blocks[b].insts[k];
    std::uint32_t pos = ipos[b][k];
    auto R = [&](ValueId v) { return reg[v]; };
    std::uint32_t d = i.res != ir::kNoValue ? reg[i.res] : 0;
    switch (i.op) {
      case IrOp::Const:
        if (noReg[i.res]) return true;
        if (i.imm == ir::kNullConst && ty(i.ty).builtinRef()) { put(encAD(Op::LoadNull, d, tt.vt(i.ty).ref)); return true; }
        if (ty(i.ty).k == ir::Type::K::Str) {
          if (static_cast<std::uint64_t>(i.imm) >= kMaxStrings) return fail("too many string constants");
          put(encAD(Op::LoadStr, d, static_cast<std::uint32_t>(i.imm)));
          return true;
        }
        if (ty(i.ty).k == ir::Type::K::Ref) { put(encAD(Op::LoadNull, d, ty(i.ty).aux)); return true; }
        loadConst(d, i);
        return true;
      case IrOp::InstOf: mv(d, R(i.args[0])); put(encAD(Op::InstanceOf, d, i.sym)); return true;
      case IrOp::Add: case IrOp::Sub: case IrOp::Mul: case IrOp::Div: case IrOp::Rem: {
        NumK n = numOf(i.res);
        if (kform[i.res].on) {
          put(encABC(Op::AddI32K, d, R(kform[i.res].other), static_cast<unsigned>(kform[i.res].imm) & 0xFFu));
          Op nop; if (narrowOp(n, nop)) put(encABC(nop, d, d));
          return true;
        }
        int idx = i.op == IrOp::Add ? 0 : i.op == IrOp::Sub ? 1 : i.op == IrOp::Mul ? 2 : i.op == IrOp::Div ? 3 : 4;
        put(encABC(kArith[static_cast<int>(famOf(n))][idx], d, R(i.args[0]), R(i.args[1])));
        Op nop; if (narrowOp(n, nop)) put(encABC(nop, d, d));
        return true;
      }
      case IrOp::Pow:
        if (numOf(i.res) != NumK::f64) return fail("pow is only supported on f64");
        put(encABC(Op::PowF64, d, R(i.args[0]), R(i.args[1])));
        return true;
      case IrOp::And: put(encABC(Op::And, d, R(i.args[0]), R(i.args[1]))); return true;
      case IrOp::Or: put(encABC(Op::Or, d, R(i.args[0]), R(i.args[1]))); return true;
      case IrOp::Xor: put(encABC(Op::Xor, d, R(i.args[0]), R(i.args[1]))); return true;
      case IrOp::Shl: case IrOp::Shr: case IrOp::UShr: {
        NumK n = numOf(i.res);
        bool left = i.op == IrOp::Shl;
        Fam fam = famOf(n);
        if (i.op == IrOp::UShr && isSigned(n)) return fail("ushr needs an unsigned type");
        Op op = fam == Fam::I32 ? (isSigned(n) ? (left ? Op::ShlI32 : Op::ShrI32) : (left ? Op::ShlU32 : Op::ShrU32))
              : fam == Fam::U32 ? (left ? Op::ShlU32 : Op::ShrU32)
              : fam == Fam::I64 ? (left ? Op::ShlI64 : Op::ShrI64)
                                : (left ? Op::ShlU64 : Op::ShrU64);
        put(encABC(op, d, R(i.args[0]), R(i.args[1])));
        Op nop; if (narrowOp(n, nop)) put(encABC(nop, d, d));
        return true;
      }
      case IrOp::Neg: {
        NumK n = numOf(i.res);
        Fam fam = famOf(n);
        Op op = fam == Fam::F64 ? Op::NegF64 : fam == Fam::F32 ? Op::NegF32 : fam == Fam::U32 ? Op::NegU32 : (fam == Fam::I64 || fam == Fam::U64) ? Op::NegI64 : Op::NegI32;
        put(encABC(op, d, R(i.args[0])));
        Op nop; if (narrowOp(n, nop)) put(encABC(nop, d, d));
        return true;
      }
      case IrOp::Not: put(encABC(Op::NotB, d, R(i.args[0]))); return true;
      case IrOp::BitNot: {
        NumK n = numOf(i.res);
        put(encABC(Op::Not64, d, R(i.args[0])));
        Op nop; if (narrowOp(n, nop)) put(encABC(nop, d, d)); else if (n == NumK::u32) put(encABC(Op::NarrowU32, d, d));
        return true;
      }
      case IrOp::Eq: case IrOp::Ne: case IrOp::Lt: case IrOp::Le: case IrOp::Gt: case IrOp::Ge: {
        if (fuse[b].on && fuse[b].at == k) return true;  // emitted as part of the block's CondBr
        ValueId x = i.args[0], y = i.args[1];
        const ir::Type& t = ty(f.valueTypes[x]);
        auto isNullConst = [&](ValueId v) { return defOf[v] && defOf[v]->op == IrOp::Const && defOf[v]->imm == ir::kNullConst && ty(defOf[v]->ty).builtinRef(); };
        bool nullTest = (i.op == IrOp::Eq || i.op == IrOp::Ne) && (isNullConst(x) || isNullConst(y));  // `s === null`: identity, not content
        if (t.k == ir::Type::K::Str && nullTest) { put(encABC(i.op == IrOp::Eq ? Op::EqR : Op::NeR, d, R(x), R(y))); return true; }
        if (t.k == ir::Type::K::Str) {  // content comparison in the runtime: > and >= swap the operands
          bool swapped = i.op == IrOp::Gt || i.op == IrOp::Ge;
          Rt id = (i.op == IrOp::Eq || i.op == IrOp::Ne) ? Rt::StrEq : (i.op == IrOp::Lt || i.op == IrOp::Gt) ? Rt::StrLt : Rt::StrLe;
          std::uint32_t base = callBase[pos];
          parallelMoves({{base, R(swapped ? y : x)}, {base + 1, R(swapped ? x : y)}});
          put(encAD(Op::Rt, base, static_cast<std::uint32_t>(id)));
          if (i.op == IrOp::Ne) put(encABC(Op::NotB, base, base));
          return true;
        }
        if (t.k == ir::Type::K::Ref || t.k == ir::Type::K::Array || t.k == ir::Type::K::Map || t.k == ir::Type::K::Set) { put(encABC(i.op == IrOp::Eq ? Op::EqR : Op::NeR, d, R(x), R(y))); return true; }
        bool fl = t.k == ir::Type::K::Num && isFloatK(t.num);
        bool f32 = fl && t.num == NumK::f32;
        bool uns = t.k == ir::Type::K::Num && !isSigned(t.num) && !fl;
        Op op;
        bool swap = i.op == IrOp::Gt || i.op == IrOp::Ge;
        if (i.op == IrOp::Eq) op = fl ? (f32 ? Op::EqF32 : Op::EqF64) : Op::EqI;
        else if (i.op == IrOp::Ne) op = fl ? (f32 ? Op::NeF32 : Op::NeF64) : Op::NeI;
        else if (i.op == IrOp::Lt || i.op == IrOp::Gt) op = fl ? (f32 ? Op::LtF32 : Op::LtF64) : (uns ? Op::LtU : Op::LtI);
        else op = fl ? (f32 ? Op::LeF32 : Op::LeF64) : (uns ? Op::LeU : Op::LeI);
        put(encABC(op, d, swap ? R(y) : R(x), swap ? R(x) : R(y)));
        return true;
      }
      case IrOp::Conv: return emitConv(d, R(i.args[0]), numOf(i.args[0]), numOf(i.res));
      case IrOp::Call: {
        std::uint32_t base = callBase[pos];
        std::vector<std::pair<std::uint32_t, std::uint32_t>> mvs;
        for (std::size_t a = 0; a < i.args.size(); ++a) mvs.push_back({base + static_cast<std::uint32_t>(a), R(i.args[a])});
        parallelMoves(mvs);
        if (!i.edges.empty()) unwinds.push_back({static_cast<std::uint32_t>(zf.code.size()), i.edges[0].to});
        put(encAD(Op::Call, base, i.sym));
        return true;
      }
      case IrOp::CallVirt: {
        std::uint32_t base = callBase[pos];
        std::vector<std::pair<std::uint32_t, std::uint32_t>> mvs;
        for (std::size_t a = 0; a < i.args.size(); ++a) mvs.push_back({base + static_cast<std::uint32_t>(a), R(i.args[a])});
        parallelMoves(mvs);
        if (!i.edges.empty()) unwinds.push_back({static_cast<std::uint32_t>(zf.code.size()), i.edges[0].to});
        put(encAD(Op::CallVirt, base, i.sym));
        return true;
      }
      case IrOp::CallNative: {
        std::uint32_t base = callBase[pos];
        std::vector<std::pair<std::uint32_t, std::uint32_t>> mvs;
        for (std::size_t a = 0; a < i.args.size(); ++a) mvs.push_back({base + static_cast<std::uint32_t>(a), reg[i.args[a]]});
        parallelMoves(mvs);
        put(encAD(Op::CallNative, base, i.sym));
        return true;
      }
      case IrOp::Rt: return rtOp(i, pos, static_cast<zn::Rt>(i.sym));
      case IrOp::StrConcat: return rtOp(i, pos, zn::Rt::StrConcat);
      case IrOp::StrLen: return rtOp(i, pos, zn::Rt::StrLength);
      case IrOp::ArrPop: return rtOp(i, pos, zn::Rt::ArrPop);
      case IrOp::ToStr: {
        const ir::Type& at = ty(f.valueTypes[i.args[0]]);
        std::uint32_t base = callBase[pos];
        parallelMoves({{base, R(i.args[0])}});
        zn::Rt id = at.k == ir::Type::K::Bool ? zn::Rt::BoolToStr : at.num == NumK::f64 || at.num == NumK::f32 ? zn::Rt::NumToStrD : isSigned(at.num) ? zn::Rt::NumToStrI : zn::Rt::NumToStrU;
        if (at.k == ir::Type::K::Num && at.num == NumK::f32) put(encABC(Op::F32ToF64, base, base));
        put(encAD(Op::Rt, base, static_cast<std::uint32_t>(id)));
        return true;
      }
      case IrOp::Retain: put(encABC(Op::Retain, R(i.args[0]))); return true;
      case IrOp::Release: put(encABC(Op::Release, R(i.args[0]))); return true;
      case IrOp::ArrNew: put(encAD(Op::New, d, vtOf(i.ty).ref)); return true;
      case IrOp::ArrGet: put(encABC(Op::ArrGet, d, R(i.args[0]), R(i.args[1]))); return true;
      case IrOp::ArrSet: put(encABC(Op::ArrSet, R(i.args[0]), R(i.args[1]), R(i.args[2]))); return true;
      case IrOp::ArrLen: put(encABC(Op::ArrLen, d, R(i.args[0]))); return true;
      case IrOp::ArrPush: put(encABC(Op::ArrPush, d, R(i.args[0]), R(i.args[1]))); return true;
      case IrOp::New: put(encAD(Op::New, d, i.sym)); return true;
      case IrOp::GetField: put(encABC(Op::GetField, d, R(i.args[0]), i.sym)); return true;
      case IrOp::SetField: put(encABC(Op::SetField, R(i.args[0]), R(i.args[1]), i.sym)); return true;
      case IrOp::RefCast: {
        std::uint32_t from = ty(f.valueTypes[i.args[0]]).aux, to = ty(i.ty).aux;
        mv(d, R(i.args[0]));
        if (!im.isSubtype(from, to)) put(encAD(Op::Downcast, d, to));  // checked at run time; upcasts need nothing
        return true;
      }
      case IrOp::Builtin: {
        auto bi = static_cast<ir::Builtin>(i.sym);
        if (bi == ir::Builtin::NumToFixed) return rtOp(i, pos, zn::Rt::NumToFixed);
        if (bi == ir::Builtin::ConsoleLog || bi == ir::Builtin::ConsoleError) {
          bool err = bi == ir::Builtin::ConsoleError;
          if (err) put(encABC(Op::LogBegErr, 0));
          for (std::size_t a = 0; a < i.args.size(); ++a) {
            if (a) put(encABC(Op::LogSep, 0));
            const ir::Type& t = ty(f.valueTypes[i.args[a]]);
            if (t.k != ir::Type::K::Bool && t.k != ir::Type::K::Num && t.k != ir::Type::K::Str) return fail("console.log of this type has no bytecode yet");
            if (t.k == ir::Type::K::Str) { put(encABC(Op::LogStr, R(i.args[a]))); continue; }
            Op op = t.k == ir::Type::K::Bool ? Op::LogBool : t.num == NumK::f64 ? Op::LogF64 : t.num == NumK::f32 ? Op::LogF32 : isSigned(t.num) ? Op::LogI : Op::LogU;
            put(encABC(op, R(i.args[a])));
          }
          put(encABC(err ? Op::LogEndErr : Op::LogEnd, 0));
          return true;
        }
        Op op;
        switch (bi) {
          case ir::Builtin::MathSqrt: op = Op::SqrtF64; break;
          case ir::Builtin::MathAbs: op = Op::AbsF64; break;
          case ir::Builtin::MathFloor: op = Op::FloorF64; break;
          case ir::Builtin::MathCeil: op = Op::CeilF64; break;
          case ir::Builtin::MathRound: op = Op::RoundF64; break;
          case ir::Builtin::MathTrunc: op = Op::TruncF64; break;
          case ir::Builtin::MathSin: op = Op::SinF64; break;
          case ir::Builtin::MathCos: op = Op::CosF64; break;
          case ir::Builtin::MathTan: op = Op::TanF64; break;
          case ir::Builtin::MathAtan: op = Op::AtanF64; break;
          case ir::Builtin::MathExp: op = Op::ExpF64; break;
          case ir::Builtin::MathLog: op = Op::LnF64; break;
          case ir::Builtin::MathPow: op = Op::PowF64; break;
          case ir::Builtin::MathAtan2: op = Op::Atan2F64; break;
          case ir::Builtin::MathMin: op = Op::MinF64; break;
          case ir::Builtin::MathMax: op = Op::MaxF64; break;
          case ir::Builtin::MathCbrt: op = Op::CbrtF64; break;
          case ir::Builtin::MathLog2: op = Op::Log2F64; break;
          case ir::Builtin::MathLog10: op = Op::Log10F64; break;
          case ir::Builtin::MathLog1p: op = Op::Log1pF64; break;
          case ir::Builtin::MathExpm1: op = Op::Expm1F64; break;
          case ir::Builtin::MathAsin: op = Op::AsinF64; break;
          case ir::Builtin::MathAcos: op = Op::AcosF64; break;
          case ir::Builtin::MathSinh: op = Op::SinhF64; break;
          case ir::Builtin::MathCosh: op = Op::CoshF64; break;
          case ir::Builtin::MathTanh: op = Op::TanhF64; break;
          case ir::Builtin::MathHypot: op = Op::HypotF64; break;
          case ir::Builtin::MathSign: op = Op::SignF64; break;
          case ir::Builtin::MathFround: op = Op::FroundF64; break;
          case ir::Builtin::MathClz32: op = Op::Clz32F64; break;
          default: return fail(std::string("builtin ") + ir::builtinName(bi) + " has no bytecode yet");
        }
        put(i.args.size() == 2 ? encABC(op, d, R(i.args[0]), R(i.args[1])) : encABC(op, d, R(i.args[0])));
        return true;
      }
      case IrOp::GetGlobal: put(encAD(Op::GetGlobal, d, i.sym)); return true;
      case IrOp::SetGlobal: put(encAD(Op::SetGlobal, R(i.args[0]), i.sym)); return true;
      case IrOp::Br: {
        parallelMoves(edgeMoves(i.edges[0]));
        if (lay[i.edges[0].to] != lay[b] + 1) { fixups.push_back({zf.code.size(), i.edges[0].to, Patch::Ax}); put(encAX(Op::Jmp, 0)); }
        return true;
      }
      case IrOp::CondBr: {
        auto mt = edgeMoves(i.edges[0]), me = edgeMoves(i.edges[1]);
        for (auto* v : {&mt, &me}) v->erase(std::remove_if(v->begin(), v->end(), [](auto& m) { return m.first == m.second; }), v->end());
        const Fuse& fz = fuse[b];
        // Emit a conditional jump taken when the condition equals `jumpIfTrue`, to `target` (through a stub when the edge has moves).
        auto condJump = [&](bool jumpIfTrue, const std::vector<std::pair<std::uint32_t, std::uint32_t>>& moves, BlockId target) {
          std::size_t at = zf.code.size();
          Patch kind = Patch::Ad;
          std::size_t patchAt = at;
          if (fz.on) {
            IrOp op = jumpIfTrue ? fz.cop : negate(fz.cop);
            if (fz.flt) {  // f64: the negation of < and <= is a form of its own (NaN)
              ValueId x = fz.x, y = fz.y;
              IrOp base = fz.cop;
              if (base == IrOp::Gt || base == IrOp::Ge) { std::swap(x, y); base = mirror(base); }
              Op o = base == IrOp::Eq ? (jumpIfTrue ? Op::JEqF : Op::JNeF) : base == IrOp::Ne ? (jumpIfTrue ? Op::JNeF : Op::JEqF)
                   : base == IrOp::Lt ? (jumpIfTrue ? Op::JLtF : Op::JNLtF) : (jumpIfTrue ? Op::JLeF : Op::JNLeF);
              put(encABC(o, R(x), R(y)));
            } else if (fz.yImm) {
              Op o = op == IrOp::Eq ? Op::JEqIK : op == IrOp::Ne ? Op::JNeIK : op == IrOp::Lt ? Op::JLtIK : op == IrOp::Le ? Op::JLeIK : op == IrOp::Gt ? Op::JGtIK : Op::JGeIK;
              put(encABC(o, R(fz.x), 0, static_cast<unsigned>(fz.imm) & 0xFFu));
            } else {
              ValueId x = fz.x, y = fz.y;
              if (op == IrOp::Gt || op == IrOp::Ge) { std::swap(x, y); op = mirror(op); }
              Op o = op == IrOp::Eq ? Op::JEqI : op == IrOp::Ne ? Op::JNeI : op == IrOp::Lt ? (fz.uns ? Op::JLtU : Op::JLtI) : (fz.uns ? Op::JLeU : Op::JLeI);
              put(encABC(o, R(x), R(y)));
            }
            put(0);
            kind = Patch::Word;
            patchAt = at + 1;
          } else put(encAD(jumpIfTrue ? Op::JmpIf : Op::JmpIfNot, R(i.args[0]), 0));
          if (moves.empty()) fixups.push_back({patchAt, target, kind});
          else stubs.push_back({patchAt, kind, moves, target});
        };
        if (lay[i.edges[0].to] == lay[b] + 1 && mt.empty()) {  // fall into the then block, jump away when the condition is false
          condJump(false, me, i.edges[1].to);
          return true;
        }
        condJump(true, mt, i.edges[0].to);
        parallelMoves(me);
        if (lay[i.edges[1].to] != lay[b] + 1) { fixups.push_back({zf.code.size(), i.edges[1].to, Patch::Ax}); put(encAX(Op::Jmp, 0)); }
        return true;
      }
      case IrOp::Ret: if (i.args.empty()) put(encABC(Op::RetV, 0)); else put(encABC(Op::Ret, R(i.args[0]))); return true;
      case IrOp::Throw: put(encABC(Op::Throw, R(i.args[0]))); return true;
      case IrOp::Unreachable: put(encABC(Op::Trap, 0)); return true;
      default: return fail(std::string("no bytecode for ") + ir::opName(i.op));
    }
  }

  bool run() {
    if (!classify()) return false;
    plan();
    layout();
    intervals();
    if (!allocate()) return false;
    blockStart.assign(nb, 0);
    for (BlockId b : order) {
      blockStart[b] = zf.code.size();
      for (std::size_t k = 0; k < f.blocks[b].insts.size(); ++k) if (!emitInst(b, k)) return false;
    }
    auto patch = [&](std::size_t at, Patch kind, std::uint32_t t) {
      if (kind == Patch::Ax) zf.code[at] = encAX(Op::Jmp, t);
      else if (kind == Patch::Ad) zf.code[at] = (zf.code[at] & 0xFFFFu) | (t << 16);
      else zf.code[at] = t;
    };
    for (Stub& s : stubs) {
      patch(s.at, s.kind, static_cast<std::uint32_t>(zf.code.size()));
      parallelMoves(s.moves);
      fixups.push_back({zf.code.size(), s.target, Patch::Ax});
      put(encAX(Op::Jmp, 0));
    }
    for (const Fixup& x : fixups) patch(x.at, x.kind, static_cast<std::uint32_t>(blockStart[x.target]));
    for (auto [at, target] : unwinds) {
      ValueId exc = f.blocks[target].params[0];
      zf.handlers.push_back({at, static_cast<std::uint32_t>(blockStart[target]), vtOf(f.valueTypes[exc]).ref, static_cast<std::uint8_t>(reg[exc])});
    }
    zf.nregs = frame + (usedScratch ? 1 : 0);
    if (zf.nregs > kMaxRegisters) return fail("function needs more than 256 registers");
    if (zf.code.size() > kMaxCodeWords) return fail("function is too large");
    return true;
  }
};

}  // namespace

EmitResult emit(const ir::Module& m) {
  EmitResult r;
  r.module.strings = m.strings;
  for (const ir::Native& n : m.natives) r.module.natives.push_back({n.module, n.name, n.sig});
  TypeTable tt{m, r.module};
  for (const ir::Class& c : m.classes) {  // the IR's classes first: their indices are the IR's
    ClassInfo info;
    info.name = c.name;
    r.module.classes.push_back(std::move(info));
  }
  for (const ir::Global& g : m.globals) r.module.globals.push_back(tt.vt(g.type));
  for (const ir::Selector& sel : m.selectors) {
    SelInfo si;
    si.name = sel.name;
    for (ir::TypeId t : sel.params) si.params.push_back(tt.vt(t));
    si.ret = tt.vt(sel.ret);
    r.module.selectors.push_back(std::move(si));
  }
  for (std::size_t ci = 0; ci < m.classes.size(); ++ci) {
    const ir::Class& c = m.classes[ci];
    ClassInfo info;
    info.name = c.name; info.parent = c.parent; info.isInterface = c.isInterface; info.isAbstract = c.isAbstract;
    for (const ir::Field& fl : c.fields) info.fields.push_back(tt.vt(fl.type));
    // supertypes: every ancestor and every interface satisfied by the class or an ancestor
    for (std::uint32_t o = c.parent, k = 0; o != ir::kNoClass && k < 1000; o = m.classes[o].parent, ++k) info.supers.push_back(o);
    for (std::uint32_t o = static_cast<std::uint32_t>(ci), k = 0; o != ir::kNoClass && k < 1000; o = m.classes[o].parent, ++k)
      for (std::uint32_t i : m.classes[o].implements) if (std::find(info.supers.begin(), info.supers.end(), i) == info.supers.end()) info.supers.push_back(i);
    info.selectors = c.selectors;
    info.vtable = c.vtable;
    r.module.classes[ci] = std::move(info);
  }
  r.module.functions.resize(m.functions.size());
  for (std::size_t i = 0; i < m.functions.size(); ++i) {
    Function& zf = r.module.functions[i];
    zf.name = m.functions[i].name;
    FnEmitter e(m, m.functions[i], zf, tt);
    if (!e.run()) {
      r.errors.push_back("@" + zf.name + ": " + e.error);
      zf.code.clear();
    }
  }
  return r;
}

}  // namespace zn::zbc
