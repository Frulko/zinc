#pragma once
// The runtime both engines share, the interpreter (src/vm) and the compiled programs (src/aot output): loaded functions and
// classes, the heap objects (plain objects, strings, arrays, Map and Set) with reference counting, the call stack, and the
// runtime calls (rtCall). `Machine::exec` runs one function and is provided by the engine that links this library.
#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

#include "zbc/zbc.h"
#include "zn/limits.h"
#include "zn/runtime.h"
#include "zn/value.h"

namespace zn::rt {

using zn::Slot;

// ECMAScript Number::toString for a double (shortest round-trip digits, JS exponent thresholds).
std::string numberToString(double v);

struct Machine;

// A function of the loaded module. The interpreter runs `code`; a compiled program also sets `native`, which runs the function
// on the register window `base` and returns 0 (done), 1 (an exception is in flight in Machine::thrown) or 2 (a trap, Machine::error).
struct Func {
  const std::uint32_t* code;
  const zbc::Const* consts;
  std::uint32_t nregs;
  const zbc::Handler* handlers;
  std::uint32_t nhandlers;
  int (*native)(Machine&, Slot*) = nullptr;
};

// How a key (or an element compared by indexOf/includes) is hashed and compared.
enum class KeyKind : std::uint8_t { Int, F32, F64, Str, Ref };

struct StrObj;

struct ClassRT {
  std::uint32_t id = 0;
  std::string name;
  StrObj* nameStr = nullptr;  // the name as a string object, made on first use
  zbc::CKind kind = zbc::CKind::Object;
  std::uint32_t nfields = 0;
  std::vector<std::uint32_t> supers;
  std::vector<const Func*> vtable;  // by selector id; empty for interfaces, abstract classes and builtin classes
  KeyKind elemKind = KeyKind::Int;  // array and Set elements, Map values
  KeyKind keyKind = KeyKind::Int;   // Map keys, Set elements
  std::vector<std::uint8_t> fieldRef;    // per field: holds a reference (released when the object dies, and when overwritten)
  bool elemRef = false, keyRef = false;  // array and Set elements / Map values, and Map keys, are references
  const ClassRT* valuesArray = nullptr;  // the array class of the elements (Map.values, Set.values)
  const ClassRT* keysArray = nullptr;    // the array class of a Map's keys
};

inline constexpr std::uint32_t kImmortal = 0xFFFFFFFFu;  // a reference count that never changes (string constants)

struct Obj {
  const ClassRT* cls;
  std::uint32_t rc;   // references held; new objects start at 1
  std::uint32_t pad;  // index in Machine::allocated
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

inline bool isSubclassRT(const ClassRT* c, std::uint32_t target) {
  if (c->id == target) return true;
  for (std::uint32_t s : c->supers) if (s == target) return true;
  return false;
}

struct Frame {
  const std::uint32_t* ret;  // instruction to resume in the caller; null marks the entry of one exec()
  const Func* fn;
  Slot* base;
};

struct Machine {
  const zbc::Module* mod = nullptr;
  std::string exceptionText(Obj* exc);
  std::vector<Func> funcs;
  std::vector<ClassRT> classes;
  std::vector<Slot> globals;
  std::vector<StrObj*> strConsts;
  const ClassRT* strClass = nullptr;
  const ClassRT* strArray = nullptr;  // string[]
  std::vector<Obj*> allocated;      // every live object, so the leftovers can be counted and freed at exit
  bool traceFree = false;           // print the class of each object as it is destroyed (debugging, destruction order tests)
  std::string* out = nullptr;
  std::string error;
  std::string trace;
  Obj* thrown = nullptr;  // a compiled program: the exception being unwound (the interpreter keeps it in a register)
  std::uint32_t depth = 0;  // a compiled program: the call depth
  std::vector<std::uint8_t> globalRef;  // per global: holds a reference
  Slot* stack = nullptr;
  std::vector<Frame> frames;
  Frame* fp = nullptr;
  Frame* framesEnd = nullptr;

  ~Machine();
  bool load(const zbc::Module& m, std::string& err);

  std::unordered_map<const Obj*, std::uint32_t> serials;  // with traceFree: the allocation number of each live object
  std::uint32_t nextSerial = 0;
  void track(Obj* o) {
    o->pad = static_cast<std::uint32_t>(allocated.size());
    allocated.push_back(o);
    if (traceFree) serials[o] = nextSerial++;
  }
  void retain(Obj* o) { if (o && o->rc != kImmortal) ++o->rc; }
  bool release(Obj* o) {  // false: the count was already zero (a bug in the bytecode)
    if (!o || o->rc == kImmortal) return true;
    if (o->rc == 0) return false;
    if (--o->rc == 0) destroy(o);
    return true;
  }
  void destroy(Obj* o);
  void releaseSlot(Slot s) { release(reinterpret_cast<Obj*>(s)); }
  StrObj* newStr(const char* p, std::size_t n);
  ArrObj* newArr(const ClassRT* cls);
  // Runs `callee` with its frame at `base` (arguments already in base[0..]) until it returns; the result is in base[0].
  bool exec(const Func* callee, Slot* base);  // defined by the engine: the interpreter, or the compiled program
  // The `call(elem, elem): f64` method of a function object (a comparator), or null. The verifier proved the static class has one.
  const Func* findComparator(const Obj* fn, zbc::VType elem) const;
  bool callComparator(const Func* cmp, Obj* fn, Slot a, Slot b, bool refs, Slot* scratch, double& result);
};

// Runs one runtime call: arguments in a[0..], result in a[0]; `scratch` is free stack for callbacks. Returns null, or the
// error message.
const char* rtCall(Machine& m, Rt id, Slot* a, Slot* scratch);

}  // namespace zn::rt
