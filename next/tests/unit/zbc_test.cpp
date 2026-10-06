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
using zn::ir::kNoClass;

namespace {

int failures = 0;

void expect(const char* name, const Module& m, const char* want) {
  std::string got = verify(m);
  bool ok = want[0] == 0 ? got.empty() : got.find(want) != std::string::npos;
  if (!ok) { std::printf("FAIL %s: want '%s', got '%s'\n", name, want, got.c_str()); ++failures; }
}

Function fn(const char* name, std::vector<std::uint32_t> code, std::uint32_t nregs, std::vector<Cls> params = {}, Cls ret = Cls::None) {
  Function f;
  f.name = name; f.code = std::move(code); f.nregs = nregs; f.ret = VType{ret, 0};
  for (Cls c : params) f.params.push_back(VType{c, 0});
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
    f.ret = VType{Cls::D, 0};
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
  bad("fused jump target inside an instruction", "start of an instruction", [](Module& m) {
    // word 1 of the fused jump (index 2) is data, not an instruction: jumping to it must be rejected
    m.functions[0].code = {encAD(Op::LoadI, 0, 1), encABC(Op::JEqIK, 0, 0, 1), 2, encABC(Op::RetV, 0)};
  });
  bad("fused jump cut off by the end", "cut off", [](Module& m) { m.functions[0].code = {encAD(Op::LoadI, 0, 1), encABC(Op::JEqIK, 0, 0, 1)}; });
  bad("fused jump target out of range", "jump target", [](Module& m) { m.functions[0].code = {encAD(Op::LoadI, 0, 1), encABC(Op::JLtI, 0, 0), 99, encABC(Op::RetV, 0)}; });
  bad("fused jump on a float", "holds f64", [](Module& m) {
    auto& f = m.functions[0];
    f.consts.push_back({Cls::D, 0});
    f.code = {encAD(Op::LoadK, 0, 0), encABC(Op::JEqIK, 0, 0, 1), 3, encABC(Op::RetV, 0)};
  });
  bad("immediate add on a float", "holds f64", [](Module& m) {
    auto& f = m.functions[0];
    f.consts.push_back({Cls::D, 0});
    f.code = {encAD(Op::LoadK, 0, 0), encABC(Op::AddI32K, 1, 0, 5), encABC(Op::RetV, 0)};
  });
  bad("fused jump with a stray operand", "not zero", [](Module& m) { m.functions[0].code = {encAD(Op::LoadI, 0, 1), encABC(Op::JEqIK, 0, 3, 1), 3, encABC(Op::RetV, 0)}; });
  {  // valid: fused jumps, both forms, a loop with an immediate add
    Module m = mod(fn("main", {encAD(Op::LoadI, 0, 0),            // 0: r0 = 0
                               encAD(Op::LoadI, 1, 5),            // 1: r1 = 5
                               encABC(Op::JLtI, 0, 1),            // 2: while r0 < r1 ...
                               6,                                 // 3: -> 6
                               encABC(Op::RetV, 0),               // 4
                               encABC(Op::Nop, 0),                // 5 (unreachable padding)
                               encABC(Op::AddI32K, 0, 0, 1),      // 6: r0 += 1
                               encABC(Op::JGeIK, 0, 0, 9),        // 7: if r0 >= 9 jump
                               4,                                 // 8: -> 4
                               encAX(Op::Jmp, 2)},                // 9: back to the test
                       2));
    expect("valid fused jumps and immediate add", m, "");
  }
  {  // valid: a diamond that agrees on classes, and a call whose result is read
    Module m;
    m.functions.push_back(fn("main", {encAD(Op::LoadI, 0, 4), encAD(Op::Call, 0, 1), encABC(Op::LogI, 0), encABC(Op::LogEnd, 0), encABC(Op::RetV, 0)}, 2));
    m.functions.push_back(fn("g", {encAD(Op::LoadI, 1, 1), encABC(Op::AddI32, 0, 0, 1), encABC(Op::Ret, 0)}, 2, {Cls::I}, Cls::I));
    expect("valid call", m, "");
  }
  // ---- object operations: A {i, f64}, B : A {i, f64, i}, interface I { .f() -> i }, a function implementing it
  auto objModule = [](std::vector<std::uint32_t> mainCode, std::uint32_t nregs) {
    Module m;
    ClassInfo a; a.name = "A"; a.fields = {VType{Cls::I, 0}, VType{Cls::D, 0}};
    ClassInfo b; b.name = "B"; b.parent = 0; b.supers = {0, 2}; b.fields = {VType{Cls::I, 0}, VType{Cls::D, 0}, VType{Cls::I, 0}};
    ClassInfo i; i.name = "I"; i.isInterface = true; i.selectors = {0};
    b.selectors = {0}; b.vtable = {1};
    a.vtable = {kNoClass};  // A exposes no selector; its vtable has one empty slot
    m.classes = {a, b, i};
    m.classes[0].supers = {};
    m.selectors.push_back(SelInfo{"f", {}, VType{Cls::I, 0}});
    m.functions.push_back(fn("main", std::move(mainCode), nregs));
    Function impl = fn("B.f", {encAD(Op::LoadI, 0, 7), encABC(Op::Ret, 0)}, 2);
    impl.params = {VType{Cls::R, 1}};
    impl.ret = VType{Cls::I, 0};
    m.functions.push_back(impl);
    return m;
  };
  {
    Module m = objModule({encAD(Op::New, 0, 1), encAD(Op::LoadI, 1, 5), encABC(Op::SetField, 0, 1, 2), encABC(Op::GetField, 2, 0, 2),
                          encABC(Op::GetField, 3, 0, 1), encAD(Op::Downcast, 0, 1), encAD(Op::CallVirt, 0, 0), encABC(Op::RetV, 0)}, 4);
    expect("valid object use and virtual call", m, "");
  }
  expect("field index outside the class", objModule({encAD(Op::New, 0, 1), encABC(Op::GetField, 1, 0, 9), encABC(Op::RetV, 0)}, 2), "does not exist");
  expect("stored value of the wrong class", objModule({encAD(Op::New, 0, 1), encAD(Op::LoadI, 1, 5), encABC(Op::SetField, 0, 1, 1), encABC(Op::RetV, 0)}, 2), "expected f64");
  expect("field access on an integer", objModule({encAD(Op::LoadI, 0, 1), encABC(Op::GetField, 1, 0, 0), encABC(Op::RetV, 0)}, 2), "expected a reference");
  expect("new of an interface", objModule({encAD(Op::New, 0, 2), encABC(Op::RetV, 0)}, 1), "interface");
  expect("virtual call of a selector the class lacks", objModule({encAD(Op::New, 0, 0), encAD(Op::CallVirt, 0, 0), encABC(Op::RetV, 0)}, 1), "is not a method");
  expect("field of a subclass read through the base", objModule({encAD(Op::New, 0, 1), encAD(Op::Downcast, 0, 0), encABC(Op::GetField, 1, 0, 2), encABC(Op::RetV, 0)}, 2), "does not exist");
  expect("references of unrelated classes joined", [&] {
    Module m = objModule({encAD(Op::LoadI, 2, 1), encAD(Op::JmpIf, 2, 4), encAD(Op::New, 0, 1), encAX(Op::Jmp, 5), encAD(Op::New, 0, 0), encABC(Op::GetField, 1, 0, 0), encABC(Op::RetV, 0)}, 3);
    return m;
  }(), "");  // B and A join to A, which has field 0: valid
  expect("join keeps a common base only", [&] {
    Module m = objModule({encAD(Op::LoadI, 2, 1), encAD(Op::JmpIf, 2, 4), encAD(Op::New, 0, 1), encAX(Op::Jmp, 5), encAD(Op::New, 0, 0), encABC(Op::GetField, 1, 0, 2), encABC(Op::RetV, 0)}, 3);
    return m;
  }(), "does not exist");  // the joined register is an A: field 2 is B's
  {  // a subtype passes where its base is expected, but not the other way around
    Module m = objModule({encAD(Op::New, 0, 1), encAD(Op::Call, 0, 2), encABC(Op::RetV, 0)}, 2);
    Function takesA = fn("takesA", {encABC(Op::RetV, 0)}, 1);
    takesA.params = {VType{Cls::R, 0}};
    m.functions.push_back(takesA);
    expect("subtype argument", m, "");
    Function takesB = fn("takesB", {encABC(Op::RetV, 0)}, 1);
    takesB.params = {VType{Cls::R, 1}};
    Module m2 = objModule({encAD(Op::New, 0, 0), encAD(Op::Call, 0, 2), encABC(Op::RetV, 0)}, 2);
    m2.functions.push_back(takesB);
    expect("base argument where a subtype is expected", m2, "expected ref B");
  }
  expect("null reference compared", objModule({encAD(Op::LoadNull, 0, 1), encAD(Op::New, 1, 1), encABC(Op::EqR, 2, 0, 1), encABC(Op::LogBool, 2), encABC(Op::RetV, 0)}, 3), "");
  expect("instanceof result is an integer", objModule({encAD(Op::New, 0, 1), encAD(Op::InstanceOf, 0, 0), encABC(Op::LogBool, 0), encABC(Op::RetV, 0)}, 1), "");
  expect("instanceof of an integer", objModule({encAD(Op::LoadI, 0, 1), encAD(Op::InstanceOf, 0, 0), encABC(Op::RetV, 0)}, 1), "expected a reference");
  expect("null of an unknown class", objModule({encAD(Op::LoadNull, 0, 9), encABC(Op::RetV, 0)}, 1), "unknown class");
  expect("field of a null reference verifies", objModule({encAD(Op::LoadNull, 0, 1), encABC(Op::GetField, 1, 0, 0), encABC(Op::RetV, 0)}, 2), "");  // the VM traps at run time
  {  // class tables
    Module m = objModule({encABC(Op::RetV, 0)}, 1);
    m.classes[1].vtable = {kNoClass};
    expect("concrete class without an implementation", m, "no implementation");
    Module m2 = objModule({encABC(Op::RetV, 0)}, 1);
    m2.classes[1].fields.pop_back(); m2.classes[1].fields.pop_back();
    expect("subclass drops its parent's fields", m2, "parent's fields");
    Module m3 = objModule({encABC(Op::RetV, 0)}, 1);
    m3.classes[1].fields[1] = VType{Cls::I, 0};
    expect("subclass changes a parent field", m3, "changes a field");
    Module m4 = objModule({encABC(Op::RetV, 0)}, 1);
    m4.functions[1].ret = VType{Cls::D, 0};
    m4.functions[1].code = {encAD(Op::LoadK, 0, 0), encABC(Op::Ret, 0)};
    m4.functions[1].consts.push_back({Cls::D, 0});
    expect("implementation returns another type", m4, "another type");
    Module m5 = objModule({encABC(Op::RetV, 0)}, 1);
    m5.classes[1].parent = 7;
    expect("unknown parent", m5, "invalid parent");
  }
  {  // strings, arrays, Map, Set and runtime calls
    auto rt = [](Rt id) { return static_cast<unsigned>(id); };
    auto coll = [](const char* name, CKind k, VType elem, VType key = {}) {
      ClassInfo c;
      c.name = name; c.kind = k; c.elem = elem; c.key = key;
      return c;
    };
    // 0 string, 1 i[], 2 string[], 3 Map<i, i>, 4 Set<i>, 5 interface fn { call(i, i): f64 }
    auto collModule = [&](std::vector<std::uint32_t> code, std::uint32_t nregs) {
      Module m;
      m.strings = {"hi", "x"};
      m.classes = {coll("string", CKind::String, {}), coll("i[]", CKind::Array, VType{Cls::I, 0}), coll("string[]", CKind::Array, VType{Cls::R, 0}),
                   coll("Map<i, i>", CKind::Map, VType{Cls::I, 0}, VType{Cls::I, 0}), coll("Set<i>", CKind::Set, VType{Cls::I, 0})};
      ClassInfo fnI;
      fnI.name = "fn"; fnI.isInterface = true; fnI.selectors = {0};
      m.classes.push_back(fnI);
      m.selectors.push_back(SelInfo{"call", {VType{Cls::I, 0}, VType{Cls::I, 0}}, VType{Cls::D, 0}});
      m.functions.push_back(fn("main", std::move(code), nregs));
      return m;
    };
    expect("string length", collModule({encAD(Op::LoadStr, 0, 0), encAD(Op::Rt, 0, rt(Rt::StrLength)), encABC(Op::LogI, 0), encABC(Op::RetV, 0)}, 2), "");
    expect("string log and concat", collModule({encAD(Op::LoadStr, 0, 0), encAD(Op::LoadStr, 1, 1), encAD(Op::Rt, 0, rt(Rt::StrConcat)), encABC(Op::LogStr, 0), encABC(Op::RetV, 0)}, 3), "");
    expect("array push, get, set, length", collModule({encAD(Op::New, 0, 1), encAD(Op::LoadI, 1, 5), encABC(Op::ArrPush, 2, 0, 1), encAD(Op::LoadI, 2, 0),
        encABC(Op::ArrGet, 3, 0, 2), encABC(Op::ArrSet, 0, 2, 3), encABC(Op::ArrLen, 3, 0), encABC(Op::LogI, 3), encABC(Op::RetV, 0)}, 4), "");
    expect("map and set", collModule({encAD(Op::New, 0, 3), encAD(Op::LoadI, 1, 1), encAD(Op::LoadI, 2, 2), encAD(Op::Rt, 0, rt(Rt::MapSet)), encAD(Op::New, 0, 3),
        encAD(Op::Rt, 0, rt(Rt::MapValues)), encAD(Op::New, 0, 4), encAD(Op::LoadI, 1, 1), encAD(Op::Rt, 0, rt(Rt::SetAdd)), encAD(Op::Rt, 0, rt(Rt::SetValues)), encABC(Op::RetV, 0)}, 4), "");
    expect("sort with a comparator", collModule({encAD(Op::New, 0, 1), encAD(Op::LoadNull, 1, 5), encAD(Op::Rt, 0, rt(Rt::ArrSort)), encABC(Op::RetV, 0)}, 3), "");
    expect("string constant without a string class", [&] { Module m; m.strings = {"hi"}; m.classes = {coll("i[]", CKind::Array, VType{Cls::I, 0})}; m.functions.push_back(fn("main", {encAD(Op::LoadStr, 0, 0), encABC(Op::RetV, 0)}, 1)); return m; }(), "string class");
    expect("string index out of range", collModule({encAD(Op::LoadStr, 0, 9), encABC(Op::RetV, 0)}, 1), "string index");
    expect("new of the string class", collModule({encAD(Op::New, 0, 0), encABC(Op::RetV, 0)}, 1), "string class");
    expect("pushed value of the wrong class", collModule({encAD(Op::New, 0, 2), encAD(Op::LoadI, 1, 5), encABC(Op::ArrPush, 2, 0, 1), encABC(Op::RetV, 0)}, 3), "expected ref string");
    expect("array operation on a map", collModule({encAD(Op::New, 0, 3), encABC(Op::ArrLen, 1, 0), encABC(Op::RetV, 0)}, 2), "expected an array");
    expect("array index is not an integer", collModule({encAD(Op::New, 0, 1), encAD(Op::LoadStr, 1, 0), encABC(Op::ArrGet, 2, 0, 1), encABC(Op::RetV, 0)}, 3), "expected i");
    expect("string call on an array", collModule({encAD(Op::New, 0, 1), encAD(Op::Rt, 0, rt(Rt::StrLength)), encABC(Op::RetV, 0)}, 2), "expected ref string");
    expect("array call on a set", collModule({encAD(Op::New, 0, 4), encAD(Op::Rt, 0, rt(Rt::ArrReverse)), encABC(Op::RetV, 0)}, 2), "on Set<i>");
    expect("join of an array that is not a string[]", collModule({encAD(Op::New, 0, 1), encAD(Op::LoadStr, 1, 0), encAD(Op::Rt, 0, rt(Rt::ArrJoin)), encABC(Op::RetV, 0)}, 3), "string[]");
    expect("map key of the wrong class", collModule({encAD(Op::New, 0, 3), encAD(Op::LoadStr, 1, 0), encAD(Op::Rt, 0, rt(Rt::MapHas)), encABC(Op::RetV, 0)}, 3), "expected i");
    expect("comparator that is not a function", collModule({encAD(Op::New, 0, 1), encAD(Op::New, 1, 1), encAD(Op::Rt, 0, rt(Rt::ArrSort)), encABC(Op::RetV, 0)}, 3), "comparator");
    expect("unknown runtime call", collModule({encAD(Op::Rt, 0, 999), encABC(Op::RetV, 0)}, 1), "unknown runtime call");
    expect("runtime call window outside the frame", collModule({encAD(Op::LoadStr, 1, 0), encAD(Op::Rt, 1, rt(Rt::StrConcat)), encABC(Op::RetV, 0)}, 2), "does not fit");
    expect("result array class missing", [&] { Module m; m.classes = {coll("Map<i, i>", CKind::Map, VType{Cls::I, 0}, VType{Cls::I, 0})}; m.functions.push_back(fn("main", {encAD(Op::New, 0, 0), encAD(Op::Rt, 0, static_cast<unsigned>(Rt::MapKeys)), encABC(Op::RetV, 0)}, 2)); return m; }(), "no array class");
    expect("duplicate array class", [&] { Module m = collModule({encABC(Op::RetV, 0)}, 1); m.classes.push_back(coll("again", CKind::Array, VType{Cls::I, 0})); return m; }(), "duplicates");
    expect("two string classes", [&] { Module m = collModule({encABC(Op::RetV, 0)}, 1); m.classes.push_back(coll("string2", CKind::String, {})); return m; }(), "more than one string class");
    expect("builtin class with a parent", [&] { Module m = collModule({encABC(Op::RetV, 0)}, 1); m.classes[1].parent = 0; return m; }(), "no members");
    expect("array of an unknown class", [&] { Module m = collModule({encABC(Op::RetV, 0)}, 1); m.classes[2].elem = VType{Cls::R, 99}; return m; }(), "unknown class");
    {  // the binary form keeps classes of builtin kinds and the string table
      Module m = compile("const xs: string[] = ['a', 'b'];\nconst m: Map<string, i32> = new Map<string, i32>();\nm.set(xs.join('-'), 1);\nconsole.log(xs.length, m.size, 'ok');\n");
      expect("emitted strings and collections verify", m, "");
      auto bytes = encode(m);
      Module back; std::string err;
      if (!decode(bytes, back, err)) { std::printf("FAIL decode with builtin classes: %s\n", err.c_str()); ++failures; }
      else if (disassemble(back) != disassemble(m) || back.strings != m.strings) { std::printf("FAIL builtin classes round trip\n"); ++failures; }
      else expect("decoded strings and collections verify", back, "");
      for (std::size_t k = 0; k < bytes.size(); k += 3) {  // corrupt bytes are rejected or still verify, never crash
        auto flipped = bytes; flipped[k] ^= 0x5A;
        Module x; std::string e;
        if (decode(flipped, x, e)) (void)verify(x);
      }
    }
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
