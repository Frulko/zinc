// Unit test of the IR verifier: well-formed IR (including an exceptional edge and a throw) passes, every kind of
// malformed IR is rejected with a message naming the problem. Prints one line per failure; exit 1 if any.
#include <cstdio>
#include <functional>
#include <string>

#include "ir/ir.h"

using namespace zn::ir;
using zn::frontend::Num;

namespace {

int failures = 0;

struct B {
  Module m;
  TypeId i32, f64, boolT, voidT;
  B() {
    m.functions.reserve(8);  // tests keep a reference to function 0 while adding callees
    i32 = m.numT(Num::i32); f64 = m.numT(Num::f64); boolT = m.boolT(); voidT = m.voidT();
    m.functions.push_back(mkFn("main", {}, voidT));
  }
  Function mkFn(const std::string& name, const std::vector<TypeId>& ps, TypeId ret) {
    Function f;
    f.name = name; f.ret = ret;
    for (TypeId t : ps) { f.valueTypes.push_back(t); f.params.push_back(static_cast<ValueId>(f.valueTypes.size() - 1)); }
    f.blocks.emplace_back();
    f.blocks[0].params = f.params;
    return f;
  }
  static ValueId val(Function& f, TypeId t) { f.valueTypes.push_back(t); return static_cast<ValueId>(f.valueTypes.size() - 1); }
  static void add(Function& f, std::size_t blk, IrOp op, TypeId ty, std::vector<ValueId> args, ValueId res, std::int64_t imm = 0, std::uint32_t sym = 0, std::vector<Edge> edges = {}) {
    Inst i; i.op = op; i.ty = ty; i.args = std::move(args); i.res = res; i.imm = imm; i.sym = sym; i.edges = std::move(edges);
    f.blocks[blk].insts.push_back(std::move(i));
  }
  ValueId cst(Function& f, std::size_t blk, TypeId t, std::int64_t v = 1) { ValueId r = val(f, t); add(f, blk, IrOp::Const, t, {}, r, v); return r; }
  void ret(Function& f, std::size_t blk) { add(f, blk, IrOp::Ret, voidT, {}, kNoValue); }
};

void expect(const char* name, const Module& m, const char* wantSubstr) {
  std::string got = verify(m);
  bool ok = wantSubstr[0] == 0 ? got.empty() : got.find(wantSubstr) != std::string::npos;
  if (!ok) { std::printf("FAIL %s: want '%s', got '%s'\n", name, wantSubstr, got.c_str()); ++failures; }
}

void malformed(const char* name, const char* want, const std::function<void(B&, Function&)>& build) {
  B b;
  Function& f = b.m.functions[0];
  build(b, f);
  expect(name, b.m, want);
}

}  // namespace

int main() {
  {  // valid: loop with block parameters, a call with an unwind edge, and a throwing handler block
    B b;
    Function thrower = b.mkFn("thrower", {b.i32}, b.i32);
    b.ret(thrower, 0);
    thrower.blocks[0].insts.back() = Inst{IrOp::Ret, b.voidT, kNoValue, {thrower.params[0]}, 0, 0, 0, {}};
    b.m.functions.push_back(thrower);
    Function& f = b.m.functions[0];
    f.blocks.resize(4);
    ValueId zero = b.cst(f, 0, b.i32, 0);
    B::add(f, 0, IrOp::Br, b.voidT, {}, kNoValue, 0, 0, {Edge{1, {zero}}});
    ValueId p = B::val(f, b.i32);
    f.blocks[1].params = {p};
    ValueId lim = b.cst(f, 1, b.i32, 10);
    ValueId c = B::val(f, b.boolT);
    B::add(f, 1, IrOp::Lt, b.boolT, {p, lim}, c);
    B::add(f, 1, IrOp::CondBr, b.voidT, {c}, kNoValue, 0, 0, {Edge{2, {}}, Edge{3, {}}});
    ValueId r = B::val(f, b.i32);
    B::add(f, 2, IrOp::Call, b.i32, {p}, r, 0, 1, {Edge{3, {}}});  // unwind edge to bb3
    ValueId one = b.cst(f, 2, b.i32, 1);
    ValueId nx = B::val(f, b.i32);
    B::add(f, 2, IrOp::Add, b.i32, {r, one}, nx);
    B::add(f, 2, IrOp::Br, b.voidT, {}, kNoValue, 0, 0, {Edge{1, {nx}}});
    ValueId err = b.cst(f, 3, b.i32, 7);
    B::add(f, 3, IrOp::Throw, b.voidT, {err}, kNoValue);
    expect("valid loop with unwind and throw", b.m, "");
    Inst call;
    call.op = IrOp::Call;
    if (!(effects(b.m, f.blocks[2].insts[0]) & kThrows)) { std::printf("FAIL call effects lack kThrows\n"); ++failures; }
    if (effects(b.m, f.blocks[1].insts[1]) != kPure) { std::printf("FAIL lt is not pure\n"); ++failures; }
  }
  malformed("missing terminator", "terminator", [](B& b, Function& f) { b.cst(f, 0, b.i32); });
  malformed("terminator in the middle", "middle", [](B& b, Function& f) { b.ret(f, 0); b.ret(f, 0); });
  malformed("add type mismatch", "type", [](B& b, Function& f) {
    ValueId x = b.cst(f, 0, b.i32), y = b.cst(f, 0, b.f64);
    B::add(f, 0, IrOp::Add, b.i32, {x, y}, B::val(f, b.i32));
    b.ret(f, 0);
  });
  malformed("use before definition", "before it is defined", [](B& b, Function& f) {
    ValueId later = B::val(f, b.i32), r = B::val(f, b.i32);
    B::add(f, 0, IrOp::Neg, b.i32, {later}, r);
    B::add(f, 0, IrOp::Const, b.i32, {}, later, 1);
    b.ret(f, 0);
  });
  malformed("value defined twice", "twice", [](B& b, Function& f) {
    ValueId x = B::val(f, b.i32);
    B::add(f, 0, IrOp::Const, b.i32, {}, x, 1);
    B::add(f, 0, IrOp::Const, b.i32, {}, x, 2);
    b.ret(f, 0);
  });
  malformed("branch argument count", "arguments", [](B& b, Function& f) {
    f.blocks.resize(2);
    f.blocks[1].params = {B::val(f, b.i32)};
    B::add(f, 0, IrOp::Br, b.voidT, {}, kNoValue, 0, 0, {Edge{1, {}}});
    b.ret(f, 1);
  });
  malformed("branch argument type", "does not match parameter", [](B& b, Function& f) {
    f.blocks.resize(2);
    f.blocks[1].params = {B::val(f, b.i32)};
    ValueId x = b.cst(f, 0, b.f64);
    B::add(f, 0, IrOp::Br, b.voidT, {}, kNoValue, 0, 0, {Edge{1, {x}}});
    b.ret(f, 1);
  });
  malformed("branch to a missing block", "missing block", [](B& b, Function& f) { B::add(f, 0, IrOp::Br, b.voidT, {}, kNoValue, 0, 0, {Edge{9, {}}}); });
  malformed("condbr needs bool", "bool", [](B& b, Function& f) {
    f.blocks.resize(2);
    ValueId x = b.cst(f, 0, b.i32);
    B::add(f, 0, IrOp::CondBr, b.voidT, {x}, kNoValue, 0, 0, {Edge{1, {}}, Edge{1, {}}});
    b.ret(f, 1);
  });
  malformed("unwind edge to a missing block", "unwind", [](B& b, Function& f) {
    Function g = b.mkFn("g", {}, b.voidT);
    b.ret(g, 0);
    b.m.functions.push_back(g);
    B::add(f, 0, IrOp::Call, b.voidT, {}, kNoValue, 0, 1, {Edge{5, {}}});
    b.ret(f, 0);
  });
  malformed("call argument count", "arguments", [](B& b, Function& f) {
    Function g = b.mkFn("g", {b.i32}, b.voidT);
    b.ret(g, 0);
    b.m.functions.push_back(g);
    B::add(f, 0, IrOp::Call, b.voidT, {}, kNoValue, 0, 1);
    b.ret(f, 0);
  });
  malformed("ret type mismatch", "ret", [](B& b, Function& f) {
    f.ret = b.i32;
    ValueId x = b.cst(f, 0, b.f64);
    B::add(f, 0, IrOp::Ret, b.voidT, {x}, kNoValue);
  });
  malformed("use does not dominate", "dominate", [](B& b, Function& f) {
    f.blocks.resize(4);
    ValueId c = B::val(f, b.boolT);
    B::add(f, 0, IrOp::Const, b.boolT, {}, c, 1);
    B::add(f, 0, IrOp::CondBr, b.voidT, {c}, kNoValue, 0, 0, {Edge{1, {}}, Edge{2, {}}});
    ValueId x = b.cst(f, 1, b.i32);
    B::add(f, 1, IrOp::Br, b.voidT, {}, kNoValue, 0, 0, {Edge{3, {}}});
    B::add(f, 2, IrOp::Br, b.voidT, {}, kNoValue, 0, 0, {Edge{3, {}}});
    B::add(f, 3, IrOp::Neg, b.i32, {x}, B::val(f, b.i32));  // x is defined only on one path
    b.ret(f, 3);
  });
  if (failures == 0) return 0;
  std::printf("%d failure(s)\n", failures);
  return 1;
}
