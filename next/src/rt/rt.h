#pragma once
// The runtime both engines share, the interpreter (src/vm) and the compiled programs (src/aot output): loaded functions and
// classes, the heap objects (plain objects, strings, arrays, Map and Set) with reference counting, the call stack, and the
// runtime calls (rtCall). `Machine::exec` runs one function and is provided by the engine that links this library.
#include <bit>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#ifndef ZN_NO_MIMALLOC
#include <mimalloc.h>
#endif

#include "zbc/zbc.h"
#include "zn/limits.h"
#include "zn/alloc_stats.h"
#include "zn/runtime.h"
#include "zn/value.h"

namespace zn::rt {
/** Caps what the program may allocate from now on (a target profile's heap, ZN-120): an excess stops the program with "out of memory (heap budget N bytes)". */
void setHeapBudget(std::size_t bytes);

using zn::Slot;

extern bool gHeapBudgetOn;   // set by setHeapBudget: the live bytes of the program are counted against the budget
void heapAccount(void* p, bool add);

// Object memory: mimalloc, except in sanitizer builds (ZN_NO_MIMALLOC), where the plain allocator keeps ASan's checks.
#ifdef ZN_NO_MIMALLOC
inline void* allocRaw(std::size_t n) { ++gAllocs; return std::malloc(n); }
inline void* allocZero(std::size_t n) { ++gAllocs; return std::calloc(1, n); }
inline void freeRaw(void* p) { if (p) ++gFrees; std::free(p); }
#else
inline void* allocRaw(std::size_t n) { ++gAllocs; void* p = mi_malloc(n); if (gHeapBudgetOn) heapAccount(p, true); return p; }
inline void* allocZero(std::size_t n) { ++gAllocs; void* p = mi_zalloc(n); if (gHeapBudgetOn) heapAccount(p, true); return p; }
inline void freeRaw(void* p) { if (p) ++gFrees; if (gHeapBudgetOn) heapAccount(p, false); mi_free(p); }
#endif

// An allocator over allocRaw for the containers of the runtime's objects (arrays, Maps, Sets): the objects stay on mimalloc without replacing the global operator new,
// which would make dyld bind the replacement across libc++ at every launch (3 ms and 8 MB for a program that prints one line, ZN-146).
template <class T> struct ObjAlloc {
  using value_type = T;
  ObjAlloc() noexcept = default;
  template <class U> ObjAlloc(const ObjAlloc<U>&) noexcept {}
#if defined(__cpp_exceptions)
  T* allocate(std::size_t n) { void* p = allocRaw(n * sizeof(T)); if (!p) throw std::bad_alloc(); return static_cast<T*>(p); }
#else   // built without exceptions (the ESP32 firmware): out of memory ends the program
  T* allocate(std::size_t n) { void* p = allocRaw(n * sizeof(T)); if (!p) std::abort(); return static_cast<T*>(p); }
#endif
  void deallocate(T* p, std::size_t) noexcept { freeRaw(p); }
  template <class U> bool operator==(const ObjAlloc<U>&) const noexcept { return true; }
  template <class U> bool operator!=(const ObjAlloc<U>&) const noexcept { return false; }
};
template <class T> using ObjVec = std::vector<T, ObjAlloc<T>>;

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

// The Slot payload follows this header on every host, including ARM32 where pointer alignment is smaller.
struct alignas(Slot) Obj {
  const ClassRT* cls;
  std::uint32_t rc;   // references held; new objects start at 1
  std::uint32_t pad;  // index in Machine::allocated (when the machine keeps the registry)
  Slot* fields() { return reinterpret_cast<Slot*>(this + 1); }
};
static_assert(sizeof(Obj) % alignof(Slot) == 0, "object payload must align its Slot fields");

struct StrObj : Obj {
  std::uint32_t len;     // bytes (UTF-8)
  std::uint32_t u16len;  // UTF-16 code units, the JavaScript length
  bool ascii;
  const char* data() const { return reinterpret_cast<const char*>(this + 1); }
};

struct ArrObj : Obj {
  ObjVec<Slot> v;
  static void* operator new(std::size_t n) { return allocRaw(n); }
  static void operator delete(void* p) { freeRaw(p); }
};

// Insertion-ordered hash table; deleted entries stay as tombstones until the next rehash.
inline std::uint64_t mix(std::uint64_t x) { x ^= x >> 33; x *= 0xff51afd7ed558ccdULL; x ^= x >> 33; x *= 0xc4ceb9fe1a85ec53ULL; x ^= x >> 33; return x; }

struct Table {
  KeyKind kk = KeyKind::Int;
  bool hasVals = false;
  ObjVec<Slot> keys, vals;
  ObjVec<std::uint8_t> dead;
  ObjVec<std::int32_t> index;  // entry numbers, -1 empty; a power-of-two size
  std::uint32_t live = 0;

  std::uint64_t hash(Slot k) const;
  bool same(Slot a, Slot b) const;
  /** The live entry of `k`, or -1. Keys equal by their bits (integers, references) probe inline, the key compared before the dead flag
   *  (ZN-602); floats and strings go through hash() and same(). */
  std::int32_t find(Slot k) const {
    if (kk != KeyKind::Int && kk != KeyKind::Ref) return findSlow(k);
    if (index.empty()) return -1;
    const std::size_t mask = index.size() - 1;
    const bool anyDead = live != keys.size();   // without erased entries the dead flags are not read: one cache miss less per hit
    for (std::size_t h = mix(k) & mask;; h = (h + 1) & mask) {
      const std::int32_t e = index[h];
      if (e < 0) return -1;
      if (keys[static_cast<std::size_t>(e)] == k && (!anyDead || !dead[static_cast<std::size_t>(e)])) return e;
    }
  }
  std::int32_t findSlow(Slot k) const;
  void put(Slot k, Slot v);
  void putNew(Slot k, Slot v);   // a key find() did not find: inserted without a second search
  bool erase(Slot k);
  void clear();
  void rehash();
};

struct MapObj : Obj {
  Table t;
  static void* operator new(std::size_t n) { return allocRaw(n); }
  static void operator delete(void* p) { freeRaw(p); }
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

// Memory and reference-counting statistics (zinc mem): counted only when a Machine has them (Machine::enableMem).
struct ClassMem {
  std::uint64_t allocs = 0, frees = 0, live = 0, peakLive = 0;
  std::uint64_t headerBytes = 0;   // bytes of the object itself (header, fields, string bytes), cumulative
  std::uint64_t payloadBytes = 0;  // arrays and Maps: the capacity of their storage when they die (or at exit), cumulative
};
struct MemStats {
  std::uint64_t retains = 0, releases = 0, allocs = 0, frees = 0, live = 0, peakLive = 0, liveBytes = 0, peakBytes = 0;
  std::vector<ClassMem> perClass;  // by class id
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
  std::vector<Obj*> allocated;      // every live object, so the leftovers can be freed at exit and listed (zinc mem); empty when `registry` is off
  // ZN-422: an AOT program (one machine, its process ends with it) only counts its live objects: no registry, which cost a push per allocation and a
  // write into another object's header per free (5-7% of allocation-heavy programs). Every other host keeps it: the device core runs program after
  // program and frees the leftovers, zinc mem lists them. The leak count comes from the counters either way.
  bool registry = true;
  std::uint64_t live = 0;           // objects allocated and not freed yet
  std::uint64_t immortals = 0;      // of those, the ones made immortal (string constants, class names): never freed, never a leak
  bool traceFree = false;           // print the class of each object as it is destroyed (debugging, destruction order tests)
  std::string* out = nullptr;
  std::size_t errMark = 0;   // where the line of a console.error began in `out`
  void flushErrLine();       // ends it: what `out` held before goes to the standard output, the line to the standard error
  bool outLive = false;      // `out` is the standard output of the process (runModule), not text its host keeps (profilers, device core): each event-loop turn writes it (ZN-638)
  std::size_t lineMark = 0;  // where the console.log line being written begins in `out` (stamped runs, zn/stamp.h)
  void flushOut();           // writes what `out` holds to the standard output now and empties it
  std::string error;
  std::string trace;
  // The classes of the Dyn prelude, found by name on first use (JSON.parse and the Dyn fast paths build and read them natively).
  const ClassRT *dynUndef = nullptr, *dynNull = nullptr, *dynNum = nullptr, *dynStr = nullptr, *dynBool = nullptr, *dynArr = nullptr, *dynObj = nullptr, *dynItems = nullptr, *dynMap = nullptr;
  bool resolveDyn();
  std::vector<Obj*> destroyStack;
  Obj* thrown = nullptr;  // a compiled program: the exception being unwound (the interpreter keeps it in a register)
  std::uint32_t depth = 0;  // (the interpreter and virtual calls of earlier builds; compiled code checks the stack pointer, see stackLow)
  char* cLimit = nullptr;   // a compiled program: the lowest address its C++ frames may reach (the stack of the thread that loaded it, less a margin)
  bool failed = false;      // a compiled program: a typed function trapped (the error is in `error`); checked after typed calls
  std::vector<std::uint8_t> globalRef;  // per global: holds a reference
  Slot* stack = nullptr;
  std::size_t stackMapped = 0;   // bytes of `stack` when it came from mmap (0: calloc)
  std::unique_ptr<Frame, void (*)(void*)> frames{nullptr, free};   // calloc: its zero pages are touched as the stack grows (ZN-592.06)
  Frame* fp = nullptr;
  Frame* framesEnd = nullptr;
  // Sizes of the interpreter stacks: 0 means the default of limits.h (20 MB of register slots, 10000 frames); small devices set them before load().
  std::size_t stackSlots = 0, maxDepth = 0;
  Slot* stackEnd = nullptr;
  const Func* volatile curFn = nullptr;  // the interpreter: the function being run, for the sampling profiler (zinc profile)
  // zinc debug (ZN-371.01): one byte per line of a debug module (zbc::Module::lines); the interpreter calls debugHook at a Line instruction whose
  // byte is set (a breakpoint, stepping, a pause request), with the frame it runs (the callers are in frames up to fp). False stops the program.
  std::vector<std::uint8_t> lineHot;
  bool (*debugHook)(Machine& m, const Func* fn, const std::uint32_t* pc, Slot* base, std::uint32_t line) = nullptr;
  bool (*throwHook)(Machine& m, const Func* fn, const std::uint32_t* pc, Slot* base, Slot exc) = nullptr;   // the debugger's loop: before a Throw unwinds
  void* debugCtx = nullptr;

  ~Machine();
  bool load(const zbc::Module& m, std::string& err);

  std::unordered_map<const Obj*, std::uint32_t> serials;  // with traceFree: the allocation number of each live object
  std::uint32_t nextSerial = 0;
  void track(Obj* o) {
    ++live;
    if (registry) { o->pad = static_cast<std::uint32_t>(allocated.size()); allocated.push_back(o); }
    if (mem) memTrack(o);
    if (traceFree) serials[o] = nextSerial++;
  }
  std::unique_ptr<MemStats> memStats;
  MemStats* mem = nullptr;
  void enableMem() { memStats = std::make_unique<MemStats>(); memStats->perClass.resize(classes.size()); mem = memStats.get(); }
  std::size_t objBytes(const Obj* o) const;                 // the fixed size of an object
  std::size_t payloadBytes(const Obj* o) const;             // arrays and Maps: the capacity of their storage
  void memTrack(Obj* o);
  void memFree(Obj* o);
  void retain(Obj* o) { if (o && o->rc != kImmortal) { ++o->rc; if (mem) ++mem->retains; } }
  bool release(Obj* o) {  // false: the count was already zero (a bug in the bytecode)
    if (!o || o->rc == kImmortal) return true;
    if (mem) ++mem->releases;
    if (o->rc == 0) return false;
    if (--o->rc == 0) destroy(o);
    return true;
  }
  void destroy(Obj* o);
  const char* releaseLast(Obj* o);   // the count is 0 or 1 (op::releaseC): destroy, or the message of a release of a dead object
  void releaseSlot(Slot s) { release(reinterpret_cast<Obj*>(s)); }
  StrObj* newStr(const char* p, std::size_t n);
  StrObj* newStrCat(const StrObj* a, const StrObj* b);   // a + b, one allocation, ascii and UTF-16 length from the parts
  ArrObj* newArr(const ClassRT* cls);
  // Runs `callee` with its frame at `base` (arguments already in base[0..]) until it returns; the result is in base[0].
  bool fusedReady = false;                   // the interpreter has replaced pairs of instructions by its superinstructions in the copies below
  std::vector<std::vector<std::uint32_t>> fusedCode;
  std::vector<std::size_t> codeLen;          // per function, the words of code (set where the functions are made)
  bool trapTrace = std::getenv("ZN_TRAP_TRACE") != nullptr;  // debugging: a trap says which function and instruction
  bool trackFn = false;                      // the interpreter keeps curFn current (set by the profiler before the run)
  template <bool kTrack, bool kDebug> bool execT(const Func* callee, Slot* base);  // the interpreter's loop (src/vm): copies with the curFn stores, with the debugger's stops, with neither
  bool exec(const Func* callee, Slot* base);  // defined by the engine: the interpreter, or the compiled program
  // The `call(elem, elem): f64` method of a function object (a comparator), or null. The verifier proved the static class has one.
  const Func* findComparator(const Obj* fn, zbc::VType elem) const;
  bool callComparator(const Func* cmp, Obj* fn, Slot a, Slot b, bool refs, Slot* scratch, double& result);
};

// Runs one runtime call: arguments in a[0..], result in a[0]; `scratch` is free stack for callbacks. Returns null, or the
// error message.
const char* rtCall(Machine& m, Rt id, Slot* a, Slot* scratch);
// CallNative: export `idx` of the module's natives table, the arguments in a[0..] and the result in a[0]; an error message, or null.
const char* nativeCall(Machine& m, std::uint32_t idx, Slot* a, Slot* scratch);
// The loop's turn for the native modules (Rt::HostNativePoll): their pollers and the queued callbacks and completions; 1 while native work is pending.
std::int32_t nativePoll(Machine& m, Slot* scratch, bool run);
// The program ended: pending promises and the callbacks that modules still hold are released, so that nothing of the program outlives it.
void nativeEnd(Machine& m);

// The outcome of running a module.
struct Result {
  bool ok = true;
  std::string error;       // runtime error: division by zero, stack overflow, trap, uncaught throw (`panic: Uncaught ...`)
  std::string trace;       // with traceFree: one `free <class>` line per destroyed object, in destruction order
  std::size_t leaked = 0;  // objects still alive after main returned and the globals were released (cycles, or a bug)
};

// Loads `m`, lets `setup` bind engine-specific code to the functions, runs functions[0] (main) and releases the globals.
// Program output (console.log) is appended to `out`, also when execution fails midway. `out` is what report() prints: a program with an event loop
// writes it to the standard output at each turn (Machine::outLive), and `out` holds what is left.
Result runModule(const zbc::Module& m, std::string& out, bool traceFree, void (*setup)(Machine&, const void*), const void* setupData);
// The same with a `finish` that sees the machine after the run (globals released, leaks counted), for the profilers (src/prof). Here the host keeps
// the whole output in `out` unless it asks for `outLive`.
Result runModuleHooked(const zbc::Module& m, std::string& out, bool traceFree, void (*setup)(Machine&, const void*), const void* setupData,
                       void (*finish)(Machine&, const void*), const void* finishData, std::size_t stackSlots = 0, std::size_t maxDepth = 0, bool outLive = false);

// Prints the program's output and, if it failed, the error; returns the exit code: 0, 101 for an uncaught exception, 1 for
// another runtime error, 4 for leaked objects when ZN_LEAK_CHECK is set.
int report(const Result& res, const std::string& out, bool traceFree);

// The entry point of a compiled program: decodes and verifies the embedded module, binds `natives[i]` to function i and runs it.
int runProgram(const unsigned char* zbcBytes, std::size_t size, int (*const* natives)(Machine&, Slot*), std::size_t count);
int runProgramPacked(const unsigned char* packed, std::size_t size, int (*const* natives)(Machine&, Slot*), std::size_t count);   // the module packed by zbc::packRuns (AOT, ZN-603)

// ---- the object and heap instructions, one definition for the interpreter and the compiled programs. Each takes the register
// window and the operands of the instruction and returns null, or the message of the trap.
namespace op {

constexpr const char* kNullRef = "null reference";

inline const char* newObject(Machine& m, std::uint32_t cls, Slot& dst) {
  const ClassRT* cr = &m.classes[cls];
  if (cr->kind == zbc::CKind::Array) { dst = reinterpret_cast<Slot>(m.newArr(cr)); return nullptr; }
  if (cr->kind == zbc::CKind::Map || cr->kind == zbc::CKind::Set) {
    auto* o = new MapObj();
    o->cls = cr; o->rc = 1;
    o->t.kk = cr->keyKind;
    o->t.hasVals = cr->kind == zbc::CKind::Map;
    m.track(o);
    dst = reinterpret_cast<Slot>(o);
    return nullptr;
  }
  auto* o = static_cast<Obj*>(allocZero(sizeof(Obj) + cr->nfields * sizeof(Slot)));
  if (!o) return "out of memory";
  o->cls = cr; o->rc = 1;
  m.track(o);
  dst = reinterpret_cast<Slot>(o);
  return nullptr;
}
inline const char* getField(Slot* r, unsigned a, unsigned b, unsigned c) {
  auto* o = reinterpret_cast<Obj*>(r[b]);
  if (__builtin_expect(!o, 0)) return kNullRef;
  r[a] = o->fields()[c];
  return nullptr;
}
inline const char* setField(Machine& m, Slot* r, unsigned a, unsigned b, unsigned c) {
  auto* o = reinterpret_cast<Obj*>(r[a]);
  if (__builtin_expect(!o, 0)) return kNullRef;
  Slot old = o->fields()[c];
  o->fields()[c] = r[b];
  if (o->cls->fieldRef[c]) m.releaseSlot(old);
  return nullptr;
}
// The function a virtual call on r[a] with selector `sel` runs, or null with `err` set.
inline const Func* virtualTarget(const Slot* r, unsigned a, unsigned sel, const char*& err) {
  auto* o = reinterpret_cast<const Obj*>(r[a]);
  if (__builtin_expect(!o, 0)) { err = kNullRef; return nullptr; }
  return o->cls->vtable[sel];
}
// Whether the C++ stack of the running thread is nearly used up (the recursion of compiled functions; no store, one compare).
inline bool stackLow(const Machine& m) { return static_cast<char*>(__builtin_frame_address(0)) < m.cLimit; }
inline const char* downcast(const Slot* r, unsigned a, unsigned cls) {
  auto* o = reinterpret_cast<const Obj*>(r[a]);
  return o && !isSubclassRT(o->cls, cls) ? "invalid cast" : nullptr;
}
inline Slot instanceOf(Slot v, unsigned cls) {
  auto* o = reinterpret_cast<const Obj*>(v);
  return Slot{o && isSubclassRT(o->cls, cls)};
}
inline const char* release(Machine& m, Slot v) {
  return __builtin_expect(!m.release(reinterpret_cast<Obj*>(v)), 0) ? "release of an object that is already dead" : nullptr;
}
// Reference counting in compiled programs (ZN-604): they never count statistics (zinc mem runs the interpreter), so they skip Machine::mem, and
// the last reference, which destroys, leaves the line for Machine::releaseLast. Measured on hero and the M4 kernels: as written, clang inlines a
// third of the sites and calls one copy elsewhere (hero 8.2 MB, 34 s); moving the kImmortal test into releaseLast makes it inline all of them (9.0 MB,
// 47 s, no kernel faster); calling all of it out of line saves 0.6 MB more but costs binarytrees 9.6% and mapset 4.4%.
inline void retainC(Slot v) { auto* o = reinterpret_cast<Obj*>(v); if (o && o->rc != kImmortal) ++o->rc; }
inline const char* releaseC(Machine& m, Slot v) {
  auto* o = reinterpret_cast<Obj*>(v);
  if (!o) return nullptr;
  const std::uint32_t c = o->rc;
  if (__builtin_expect(c - 2u < kImmortal - 2u, 1)) { o->rc = c - 1; return nullptr; }   // 2 .. kImmortal - 1: other references remain
  return c == kImmortal ? nullptr : m.releaseLast(o);
}
inline void dropC(Machine& m, Slot v) { (void)releaseC(m, v); }
bool catches(const Obj* e, std::uint32_t cls);   // a handler of class `cls` takes the exception `e` (out of line: only a throw runs it, 2500 sites in hero)   // a replaced field's old value (Machine::releaseSlot)
inline const char* arrGet(Slot* r, unsigned a, unsigned b, unsigned c) {
  auto* o = static_cast<ArrObj*>(reinterpret_cast<Obj*>(r[b]));
  if (__builtin_expect(!o, 0)) return kNullRef;
  if (__builtin_expect(r[c] >= o->v.size(), 0)) return "array index out of bounds";
  r[a] = o->v[r[c]];
  return nullptr;
}
inline const char* arrSet(Machine& m, Slot* r, unsigned a, unsigned b, unsigned c) {
  auto* o = static_cast<ArrObj*>(reinterpret_cast<Obj*>(r[a]));
  if (__builtin_expect(!o, 0)) return kNullRef;
  Slot i = r[b];
  if (__builtin_expect(i >= o->v.size(), 0)) { if (i != o->v.size()) return "array index out of bounds"; o->v.push_back(r[c]); }  // writing at length appends, like the native runtime
  else { Slot old = o->v[i]; o->v[i] = r[c]; if (o->cls->elemRef) m.releaseSlot(old); }
  return nullptr;
}
inline const char* arrLen(Slot* r, unsigned a, unsigned b) {
  auto* o = static_cast<ArrObj*>(reinterpret_cast<Obj*>(r[b]));
  if (__builtin_expect(!o, 0)) return kNullRef;
  r[a] = o->v.size();
  return nullptr;
}
inline const char* arrPush(Slot* r, unsigned a, unsigned b, unsigned c) {
  auto* o = static_cast<ArrObj*>(reinterpret_cast<Obj*>(r[b]));
  if (__builtin_expect(!o, 0)) return kNullRef;
  if (__builtin_expect(o->v.size() >= 0x7fffffffu, 0)) return "RangeError: Invalid array length";
  o->v.push_back(r[c]);
  r[a] = o->v.size();
  return nullptr;
}
inline const char* logStr(Machine& m, Slot v) {
  auto* s = reinterpret_cast<StrObj*>(v);
  if (!s) return kNullRef;
  m.out->append(s->data(), s->len);
  return nullptr;
}
// The hot Map and Set rows (ZN-602): rtCall's cases, and compiled code's direct calls (no dispatch, no frame window).
inline const char* mapGet(Slot& map, Slot key) {
  const MapObj* o = reinterpret_cast<const MapObj*>(map);
  if (!o || (o->cls->keyKind == KeyKind::Str && !key)) return kNullRef;
  const std::int32_t e = o->t.find(key);
  map = e < 0 ? 0 : o->t.vals[static_cast<std::size_t>(e)];
  return nullptr;
}
inline const char* mapHas(Slot& map, Slot key) {   // Map.has and Set.has
  const MapObj* o = reinterpret_cast<const MapObj*>(map);
  if (!o || (o->cls->keyKind == KeyKind::Str && !key)) return kNullRef;
  map = o->t.find(key) >= 0 ? 1 : 0;
  return nullptr;
}
inline const char* mapSet(Machine& m, Slot map, Slot key, Slot val) {   // the key and the value are consumed: stored, or released when the key was there
  MapObj* o = reinterpret_cast<MapObj*>(map);
  if (!o || (o->cls->keyKind == KeyKind::Str && !key)) return kNullRef;
  const std::int32_t e = o->t.find(key);
  if (e >= 0) {
    const Slot old = o->t.vals[static_cast<std::size_t>(e)];
    o->t.vals[static_cast<std::size_t>(e)] = val;
    if (o->cls->elemRef) m.releaseSlot(old);
    if (o->cls->keyRef) m.releaseSlot(key);
  } else o->t.putNew(key, val);
  m.retain(o);   // the result is a new reference to the same Map
  return nullptr;
}
inline const char* setAdd(Machine& m, Slot set, Slot key) {
  MapObj* o = reinterpret_cast<MapObj*>(set);
  if (!o || (o->cls->keyKind == KeyKind::Str && !key)) return kNullRef;
  if (o->t.find(key) >= 0) { if (o->cls->keyRef) m.releaseSlot(key); } else o->t.putNew(key, 0);
  m.retain(o);
  return nullptr;
}

inline void logF64(Machine& m, Slot v) {
  double d = std::bit_cast<double>(v);
  *m.out += (d == 0 && std::signbit(d)) ? std::string("-0") : numberToString(d);  // console.log prints -0
}

}  // namespace op

}  // namespace zn::rt
