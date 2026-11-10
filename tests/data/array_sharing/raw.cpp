#include <cassert>
#include <fstream>
#include <string>
#include "aot/aot.h"
#include "zn/bytecode.h"
#include "zn/runtime.h"

int main(int argc, char** argv) {
  assert(argc == 3);
  using namespace zn; using namespace zn::zbc;
  Module m;
  ClassInfo animal; animal.name = "Animal";
  ClassInfo dog; dog.name = "Dog"; dog.parent = 0; dog.supers = {0};
  ClassInfo dogs; dogs.name = "Dog[]"; dogs.kind = CKind::Array; dogs.elem = {Cls::R, 1};
  ClassInfo animals = dogs; animals.name = "Animal[]"; animals.elem = {Cls::R, 0};
  ClassInfo numbers = dogs; numbers.name = "i32[]"; numbers.elem = {Cls::I, 0};
  m.classes = {animal, dog, dogs, animals, numbers};
  Function f; f.name = "main"; f.nregs = 8;
  f.code = {encAD(Op::New, 0, 2), encAD(Op::New, 1, 1), encABC(Op::ArrPush, 2, 0, 1), encAD(Op::Downcast, 0, 3)};
  const std::string kind = argv[1];
  assert(relatedReferenceArrays(m, 2, 3));
  assert(!relatedReferenceArrays(m, 2, 4));
  if (kind == "plain") {
    m.classes.resize(3);  // a subtype exists, but no array of its wider element type exists in this module
    f.code = {encAD(Op::New, 0, 2), encAD(Op::New, 1, 1), encABC(Op::ArrPush, 2, 0, 1),
        encABC(Op::ArrLen, 2, 0), encABC(Op::LogI, 2), encABC(Op::LogEnd, 0)};
  } else if (kind == "exact") {
    f.code = {encAD(Op::New, 0, 2), encABC(Op::Move, 1, 0), encAD(Op::InstanceOf, 1, 3),
        encABC(Op::LogBool, 1), encABC(Op::LogEnd, 0), encAD(Op::Downcast, 0, 3),
        encAD(Op::InstanceOf, 0, 2), encABC(Op::LogBool, 0), encABC(Op::LogEnd, 0)};
  } else if (kind == "badCast") {
    f.code = {encAD(Op::New, 0, 2), encAD(Op::Downcast, 0, 4)};
  } else if (kind == "setRange") {
    f.code.insert(f.code.end(), {encAD(Op::New, 1, 3), encAD(Op::New, 2, 0), encABC(Op::ArrPush, 3, 1, 2),
        encAD(Op::LoadI, 2, 0), encAD(Op::LoadI, 3, 0), encAD(Op::LoadI, 4, 1), encAD(Op::Rt, 0, static_cast<unsigned>(Rt::ArrSet))});
  } else {
    f.code.push_back(encAD(Op::New, 1, 0));
    if (kind == "push") f.code.push_back(encABC(Op::ArrPush, 2, 0, 1));
    else if (kind == "set") f.code.insert(f.code.end(), {encAD(Op::LoadI, 2, 0), encABC(Op::ArrSet, 0, 2, 1)});
    else { assert(kind == "fill"); f.code.insert(f.code.end(), {encAD(Op::LoadI, 2, 0), encAD(Op::LoadI, 3, 1), encAD(Op::Rt, 0, static_cast<unsigned>(Rt::ArrFillRange))}); }
  }
  f.code.push_back(encABC(Op::RetV, 0)); m.functions.push_back(f);
  assert(verify(m).empty());
  auto bytes = encode(m);
  std::ofstream(std::string(argv[2]) + ".zbc", std::ios::binary).write(reinterpret_cast<const char*>(bytes.data()), bytes.size());
  auto cpp = zn::aot::emitCpp(m);
  if (kind == "plain") assert(cpp.find("op::arrPush(t,") != std::string::npos);
  else if (kind != "exact" && kind != "badCast") assert(cpp.find("op::arrPush(m,") != std::string::npos);
  std::ofstream(std::string(argv[2]) + ".cpp") << cpp;
}
