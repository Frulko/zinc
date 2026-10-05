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

struct FnEmitter {
  const ir::Module& im;
  const ir::Function& f;
  Function& zf;
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

  FnEmitter(const ir::Module& mod, const ir::Function& fn, Function& out) : im(mod), f(fn), zf(out), nb(fn.blocks.size()), nv(fn.valueTypes.size()) {}

  bool fail(const std::string& msg) { if (error.empty()) error = msg; return false; }

  const ir::Type& ty(ir::TypeId t) const { return im.types[t]; }
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
        case ir::Type::K::Void: break;
        default: return fail("strings, objects and arrays have no bytecode yet (ZN-012, ZN-015)");
      }
    }
    zf.params.clear();
    for (ValueId p : f.params) zf.params.push_back(cls[p]);
    const ir::Type& rt = ty(f.ret);
    if (rt.k == ir::Type::K::Void) zf.ret = Cls::None;
    else if (rt.k == ir::Type::K::Bool) zf.ret = Cls::I;
    else if (rt.k == ir::Type::K::Num && !isFxK(rt.num)) zf.ret = isFloatK(rt.num) ? (rt.num == NumK::f64 ? Cls::D : Cls::S) : Cls::I;
    else return fail("unsupported return type");
    for (const ir::Block& b : f.blocks)
      for (const ir::Inst& i : b.insts) {
        if (i.op == IrOp::Call && !i.edges.empty()) return fail("exceptional edges have no bytecode yet (ZN-019)");
        switch (i.op) {
          case IrOp::New: case IrOp::GetField: case IrOp::SetField: case IrOp::ArrNew: case IrOp::ArrGet: case IrOp::ArrSet:
          case IrOp::ArrLen: case IrOp::ArrPush: case IrOp::ArrPop: case IrOp::StrConcat: case IrOp::ToStr: case IrOp::StrLen:
            return fail("heap operations have no bytecode yet (ZN-012, ZN-015)");
          default: break;
        }
      }
    return true;
  }

  // ---- layout and liveness
  void layout() {
    std::vector<char> seen(nb, 0);
    std::vector<BlockId> post;
    std::function<void(BlockId)> visit = [&](BlockId b) {
      seen[b] = 1;
      const auto& es = f.blocks[b].insts.back().edges;
      for (std::size_t k = es.size(); k-- > 0;) if (!seen[es[k].to]) visit(es[k].to);
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
        for (const ir::Edge& e : f.blocks[b].insts.back().edges)
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
        if (i.op == IrOp::Call) {
          std::uint32_t base = 0;
          for (ValueId a : active) base = std::max(base, reg[a] + 1);
          std::uint32_t nargs = static_cast<std::uint32_t>(i.args.size());
          if (base + std::max<std::uint32_t>(nargs, 1) > kMaxRegisters) return fail("function needs more than 256 registers");
          callBase[pos] = base;
          frame = std::max(frame, base + std::max<std::uint32_t>(nargs, 1));
          if (i.res != ir::kNoValue) { take(i.res, base); setHints(i.res); }
          continue;
        }
        if (i.res != ir::kNoValue) {
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
  struct Fixup { std::size_t at; BlockId target; bool ad; };
  struct Stub { std::size_t jmpAt; std::vector<std::pair<std::uint32_t, std::uint32_t>> moves; BlockId target; };
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

  bool emitInst(BlockId b, std::size_t k) {
    const ir::Inst& i = f.blocks[b].insts[k];
    std::uint32_t pos = ipos[b][k];
    auto R = [&](ValueId v) { return reg[v]; };
    std::uint32_t d = i.res != ir::kNoValue ? reg[i.res] : 0;
    switch (i.op) {
      case IrOp::Const: loadConst(d, i); return true;
      case IrOp::Add: case IrOp::Sub: case IrOp::Mul: case IrOp::Div: case IrOp::Rem: {
        NumK n = numOf(i.res);
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
        ValueId x = i.args[0], y = i.args[1];
        const ir::Type& t = ty(f.valueTypes[x]);
        if (t.k == ir::Type::K::Str) return fail("string comparison has no bytecode yet");
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
        put(encAD(Op::Call, base, i.sym));
        return true;
      }
      case IrOp::Builtin: {
        auto bi = static_cast<ir::Builtin>(i.sym);
        if (bi == ir::Builtin::ConsoleLog) {
          for (std::size_t a = 0; a < i.args.size(); ++a) {
            if (a) put(encABC(Op::LogSep, 0));
            const ir::Type& t = ty(f.valueTypes[i.args[a]]);
            Op op = t.k == ir::Type::K::Bool ? Op::LogBool : t.num == NumK::f64 ? Op::LogF64 : t.num == NumK::f32 ? Op::LogF32 : isSigned(t.num) ? Op::LogI : Op::LogU;
            put(encABC(op, R(i.args[a])));
          }
          put(encABC(Op::LogEnd, 0));
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
          default: return fail(std::string("builtin ") + ir::builtinName(bi) + " has no bytecode yet");
        }
        put(i.args.size() == 2 ? encABC(op, d, R(i.args[0]), R(i.args[1])) : encABC(op, d, R(i.args[0])));
        return true;
      }
      case IrOp::GetGlobal: put(encAD(Op::GetGlobal, d, i.sym)); return true;
      case IrOp::SetGlobal: put(encAD(Op::SetGlobal, R(i.args[0]), i.sym)); return true;
      case IrOp::Br: {
        parallelMoves(edgeMoves(i.edges[0]));
        if (lay[i.edges[0].to] != lay[b] + 1) { fixups.push_back({zf.code.size(), i.edges[0].to, false}); put(encAX(Op::Jmp, 0)); }
        return true;
      }
      case IrOp::CondBr: {
        auto mt = edgeMoves(i.edges[0]), me = edgeMoves(i.edges[1]);
        for (auto* v : {&mt, &me}) v->erase(std::remove_if(v->begin(), v->end(), [](auto& m) { return m.first == m.second; }), v->end());
        bool thenNext = lay[i.edges[0].to] == lay[b] + 1;
        if (thenNext && mt.empty()) {  // fall into the then block, jump away when the condition is false
          std::size_t at = zf.code.size();
          put(encAD(Op::JmpIfNot, R(i.args[0]), 0));
          if (me.empty()) fixups.push_back({at, i.edges[1].to, true});
          else stubs.push_back({at, me, i.edges[1].to});
          return true;
        }
        std::size_t at = zf.code.size();
        put(encAD(Op::JmpIf, R(i.args[0]), 0));
        if (mt.empty()) fixups.push_back({at, i.edges[0].to, true});
        else stubs.push_back({at, mt, i.edges[0].to});
        parallelMoves(me);
        if (lay[i.edges[1].to] != lay[b] + 1) { fixups.push_back({zf.code.size(), i.edges[1].to, false}); put(encAX(Op::Jmp, 0)); }
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
    layout();
    intervals();
    if (!allocate()) return false;
    blockStart.assign(nb, 0);
    for (BlockId b : order) {
      blockStart[b] = zf.code.size();
      for (std::size_t k = 0; k < f.blocks[b].insts.size(); ++k) if (!emitInst(b, k)) return false;
    }
    for (Stub& s : stubs) {
      zf.code[s.jmpAt] = (zf.code[s.jmpAt] & 0xFFFFu) | (static_cast<std::uint32_t>(zf.code.size()) << 16);
      parallelMoves(s.moves);
      fixups.push_back({zf.code.size(), s.target, false});
      put(encAX(Op::Jmp, 0));
    }
    for (const Fixup& x : fixups) {
      std::uint32_t t = static_cast<std::uint32_t>(blockStart[x.target]);
      if (x.ad) zf.code[x.at] = (zf.code[x.at] & 0xFFFFu) | (t << 16);
      else zf.code[x.at] = encAX(Op::Jmp, t);
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
  for (const ir::Global& g : m.globals) {
    const ir::Type& t = m.types[g.type];
    r.module.globals.push_back(t.k == ir::Type::K::Num ? (t.num == NumK::f64 ? Cls::D : t.num == NumK::f32 ? Cls::S : Cls::I) : Cls::I);
  }
  r.module.functions.resize(m.functions.size());
  for (std::size_t i = 0; i < m.functions.size(); ++i) {
    Function& zf = r.module.functions[i];
    zf.name = m.functions[i].name;
    FnEmitter e(m, m.functions[i], zf);
    if (!e.run()) {
      r.errors.push_back("@" + zf.name + ": " + e.error);
      zf.code.clear();
    }
  }
  return r;
}

}  // namespace zn::zbc
