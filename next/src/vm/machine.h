#pragma once
// Interpreter state shared by the dispatch loop (vm.cpp) and the runtime calls (rt.cpp): loaded functions and classes,
// the heap objects (plain objects, strings, arrays, Map and Set) and the call stack. Memory is released at exit;
// reference counting is ZN-018.
#include <cstdint>
#include <string>
#include <vector>

#include "vm/vm.h"
#include "zn/runtime.h"

namespace zn::vm {

using Slot = std::uint64_t;

struct Func {
  const std::uint32_t* code;
  const zbc::Const* consts;
  std::uint32_t nregs;
};

// How a key (or an element compared by indexOf/includes) is hashed and compared.
enum class KeyKind : std::uint8_t { Int, F32, F64, Str, Ref };

struct ClassRT {
  std::uint32_t id = 0;
  zbc::CKind kind = zbc::CKind::Object;
  std::uint32_t nfields = 0;
  std::vector<std::uint32_t> supers;
  std::vector<const Func*> vtable;  // by selector id; empty for interfaces, abstract classes and builtin classes
  KeyKind elemKind = KeyKind::Int;  // array and Set elements, Map values
  KeyKind keyKind = KeyKind::Int;   // Map keys, Set elements
  const ClassRT* valuesArray = nullptr;  // the array class of the elements (Map.values, Set.values)
  const ClassRT* keysArray = nullptr;    // the array class of a Map's keys
};

struct Obj {
  const ClassRT* cls;
  std::uint32_t rc;
  std::uint32_t pad;
  Slot* fields() { return reinterpret_cast<Slot*>(this + 1); }
};

struct StrObj : Obj {
  std::uint32_t len;     // bytes (UTF-8)
  std::uint32_t u16len;  // UTF-16 code units, the JavaScript length
  bool ascii;
  const char* data() const { return reinterpret_cast<const char*>(this + 1); }
};

struct ArrObj : Obj {
  std::vector<Slot> v;
};

// Insertion-ordered hash table; deleted entries stay as tombstones until the next rehash.
struct Table {
  KeyKind kk = KeyKind::Int;
  bool hasVals = false;
  std::vector<Slot> keys, vals;
  std::vector<std::uint8_t> dead;
  std::vector<std::int32_t> index;  // entry numbers, -1 empty; a power-of-two size
  std::uint32_t live = 0;

  std::uint64_t hash(Slot k) const;
  bool same(Slot a, Slot b) const;
  std::int32_t find(Slot k) const;
  void put(Slot k, Slot v);
  bool erase(Slot k);
  void clear();
  void rehash();
};

struct MapObj : Obj {
  Table t;
};

struct Frame {
  const std::uint32_t* ret;  // instruction to resume in the caller; null marks the entry of one exec()
  const Func* fn;
  Slot* base;
};

struct Machine {
  const zbc::Module* mod = nullptr;
  std::vector<Func> funcs;
  std::vector<ClassRT> classes;
  std::vector<Slot> globals;
  std::vector<StrObj*> strConsts;
  const ClassRT* strClass = nullptr;
  const ClassRT* strArray = nullptr;  // string[]
  std::vector<Obj*> allocated;
  std::string* out = nullptr;
  std::string error;
  Slot* stack = nullptr;
  std::vector<Frame> frames;
  Frame* fp = nullptr;
  Frame* framesEnd = nullptr;

  ~Machine();
  bool load(const zbc::Module& m, std::string& err);

  StrObj* newStr(const char* p, std::size_t n);
  ArrObj* newArr(const ClassRT* cls);
  // Runs `callee` with its frame at `base` (arguments already in base[0..]) until it returns; the result is in base[0].
  bool exec(const Func* callee, Slot* base);
  // The `call(elem, elem): f64` method of a function object (a comparator), or null. The verifier proved the static class has one.
  const Func* findComparator(const Obj* fn, zbc::VType elem) const;
  bool callComparator(const Func* cmp, Obj* fn, Slot a, Slot b, Slot* scratch, double& result);
};

// Runs one runtime call: arguments in a[0..], result in a[0]; `scratch` is free stack for callbacks. Returns null, or the
// error message.
const char* rtCall(Machine& m, Rt id, Slot* a, Slot* scratch);

}  // namespace zn::vm
