// Unit test of the ZBC verifier and binary format: valid modules pass, each kind of malformed bytecode is rejected with a
// message naming the problem, encode/decode round-trips real emitter output and rejects corrupted bytes.
// Prints one line per failure; exit 1 if any.
#include <cstdio>
#include <cstring>
#include <functional>
#include <string>

#include "frontend/check.h"
#include "frontend/parser.h"
#include "zbc/zbc.h"

using namespace zn;
using namespace zn::zbc;

namespace {

int failures = 0;

void expect(const char* name, const Module& m, const char* want) {
  std::string got = verify(m);
  bool ok = want[0] == 0 ? got.empty() : got.find(want) != std::string::npos;
  if (!ok) { std::printf("FAIL %s: want '%s', got '%s'\n", name, want, got.c_str()); ++failures; }
}

Function fn(const char* name, std::vector<std::uint32_t> code, std::uint32_t nregs, std::vector<Cls> params = {}, Cls ret = Cls::None) {
  Function f;
  f.name = name; f.code = std::move(code); f.nregs = nregs; f.params = std::move(params); f.ret = ret;
  return f;
}

Module mod(Function mainFn) {
  Module m;
  m.functions.push_back(std::move(mainFn));
  return m;
}

void bad(const char* name, const char* want, const std::function<void(Module&)>& build) {
  Module m = mod(fn("main", {encABC(Op::RetV, 0)}, 4));
  build(m);
  expect(name, m, want);
}

Module compile(const char* src) {
  auto res = frontend::parse(src);
  auto checked = frontend::check(res.ast);
  auto low = ir::lower(res.ast, checked, src);
  return emit(low.module).module;
}

}  // namespace

int main() {
  expect("minimal valid", mod(fn("main", {encAD(Op::LoadI, 0, 1), encABC(Op::RetV, 0)}, 1)), "");
  bad("class mismatch", "holds f64", [](Module& m) {
    auto& f = m.functions[0];
    f.consts.push_back({Cls::D, 0});
    f.code = {encAD(Op::LoadK, 0, 0), encAD(Op::LoadI, 1, 1), encABC(Op::AddI32, 2, 0, 1), encABC(Op::RetV, 0)};
  });
  bad("read before write", "before it holds a value", [](Module& m) { m.functions[0].code = {encABC(Op::Move, 1, 2), encABC(Op::RetV, 0)}; });
  bad("register out of frame", "outside the frame", [](Module& m) { m.functions[0].code = {encAD(Op::LoadI, 9, 1), encABC(Op::RetV, 0)}; });
  bad("jump out of range", "jump target", [](Module& m) { m.functions[0].code = {encAX(Op::Jmp, 77)}; });
  bad("conditional jump out of range", "jump target", [](Module& m) { m.functions[0].code = {encAD(Op::LoadI, 0, 1), encAD(Op::JmpIf, 0, 99), encABC(Op::RetV, 0)}; });
  bad("falls off the end", "fall off", [](Module& m) { m.functions[0].code = {encAD(Op::LoadI, 0, 1)}; });
  bad("unknown opcode", "unknown opcode", [](Module& m) { m.functions[0].code = {0xFFu, encABC(Op::RetV, 0)}; });
  bad("constant out of range", "constant index", [](Module& m) { m.functions[0].code = {encAD(Op::LoadK, 0, 3), encABC(Op::RetV, 0)}; });
  bad("call to a missing function", "missing function", [](Module& m) { m.functions[0].code = {encAD(Op::Call, 0, 5), encABC(Op::RetV, 0)}; });
  bad("missing global", "missing global", [](Module& m) { m.functions[0].code = {encAD(Op::GetGlobal, 0, 0), encABC(Op::RetV, 0)}; });
  bad("unused operand not zero", "not zero", [](Module& m) { m.functions[0].code = {encAD(Op::LoadI, 0, 1), encABC(Op::NegI32, 1, 0, 5), encABC(Op::RetV, 0)}; });
  bad("operands on a bare instruction", "operand-less", [](Module& m) { m.functions[0].code = {encABC(Op::RetV, 3)}; });
  bad("ret value in a void function", "void function", [](Module& m) { m.functions[0].code = {encAD(Op::LoadI, 0, 1), encABC(Op::Ret, 0)}; });
  bad("ret class mismatch", "expected", [](Module& m) {
    auto& f = m.functions[0];
    f.ret = Cls::D;
    f.code = {encAD(Op::LoadI, 0, 1), encABC(Op::Ret, 0)};
  });
  bad("call argument class", "argument", [](Module& m) {
    Function callee = fn("g", {encABC(Op::RetV, 0)}, 1, {Cls::D});
    m.functions.push_back(callee);
    m.functions[0].code = {encAD(Op::LoadI, 0, 1), encAD(Op::Call, 0, 1), encABC(Op::RetV, 0)};
  });
  bad("call window outside the frame", "window", [](Module& m) {
    Function callee = fn("g", {encABC(Op::RetV, 0)}, 3, {Cls::I, Cls::I, Cls::I});
    m.functions.push_back(callee);
    m.functions[0].nregs = 2;
    m.functions[0].code = {encAD(Op::LoadI, 0, 1), encAD(Op::Call, 1, 1), encABC(Op::RetV, 0)};
  });
  bad("read of a register clobbered by a call", "before it holds a value", [](Module& m) {
    Function callee = fn("g", {encABC(Op::RetV, 0)}, 2, {Cls::I});
    m.functions.push_back(callee);
    // r1 is above the window base r0, so the callee overwrites it
    m.functions[0].code = {encAD(Op::LoadI, 0, 1), encAD(Op::LoadI, 1, 2), encAD(Op::Call, 0, 1), encABC(Op::Move, 2, 1), encABC(Op::RetV, 0)};
  });
  bad("conflicting types at a join", "r0", [](Module& m) {
    auto& f = m.functions[0];
    f.consts.push_back({Cls::D, 0});
    f.code = {encAD(Op::LoadI, 1, 1),          // 0: r1 = cond
              encAD(Op::JmpIf, 1, 4),          // 1
              encAD(Op::LoadK, 0, 0),          // 2: r0 = f64
              encAX(Op::Jmp, 5),               // 3
              encAD(Op::LoadI, 0, 1),          // 4: r0 = int
              encABC(Op::NegI32, 2, 0),        // 5: join: r0 is f64 on one path and int on the other
              encABC(Op::RetV, 0)};
  });
  {  // valid: a diamond that agrees on classes, and a call whose result is read
    Module m;
    m.functions.push_back(fn("main", {encAD(Op::LoadI, 0, 4), encAD(Op::Call, 0, 1), encABC(Op::LogI, 0), encABC(Op::LogEnd, 0), encABC(Op::RetV, 0)}, 2));
    m.functions.push_back(fn("g", {encAD(Op::LoadI, 1, 1), encABC(Op::AddI32, 0, 0, 1), encABC(Op::Ret, 0)}, 2, {Cls::I}, Cls::I));
    expect("valid call", m, "");
  }
  {  // binary format
    Module m = compile("function fib(n: i32): i32 { if (n < 2) return n; return fib(n - 1) + fib(n - 2); }\nconsole.log(fib(10));\n");
    expect("emitted fib verifies", m, "");
    auto bytes = encode(m);
    Module back; std::string err;
    if (!decode(bytes, back, err)) { std::printf("FAIL decode of valid bytes: %s\n", err.c_str()); ++failures; }
    else if (disassemble(back) != disassemble(m)) { std::printf("FAIL round trip changed the module\n"); ++failures; }
    else expect("decoded fib verifies", back, "");
    auto corrupt = [&](const char* name, std::vector<std::uint8_t> b, const char* want) {
      Module x; std::string e;
      bool ok = decode(b, x, e);
      std::string got = ok ? verify(x) : e;
      if (got.find(want) == std::string::npos) { std::printf("FAIL %s: want '%s', got '%s'\n", name, want, got.c_str()); ++failures; }
    };
    auto badMagic = bytes; badMagic[0] = 'X';
    corrupt("bad magic", badMagic, "magic");
    corrupt("truncated", std::vector<std::uint8_t>(bytes.begin(), bytes.begin() + static_cast<std::ptrdiff_t>(bytes.size() / 2)), "truncated");
    auto trailing = bytes; trailing.push_back(0);
    corrupt("trailing bytes", trailing, "trailing");
    corrupt("empty", {}, "magic");
    for (std::size_t k = 0; k < bytes.size(); k += 7) {  // flipping any byte must never crash and is rejected or still verifies
      auto flipped = bytes; flipped[k] ^= 0xFF;
      Module x; std::string e;
      if (decode(flipped, x, e)) (void)verify(x);
    }
  }
  if (failures == 0) return 0;
  std::printf("%d failure(s)\n", failures);
  return 1;
}
