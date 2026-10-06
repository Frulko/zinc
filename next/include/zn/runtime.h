#pragma once
// Runtime calls: the string, array, Map and Set operations the compiler lowers to `Rt` and the VM implements. One table
// shared by the checker (user-visible members and their types), the IR lowering, the verifier and the interpreter, so
// they cannot disagree on names or signatures.
//
// X(Id, "owner.member", "params>ret", flags). The receiver is the first parameter. Type letters, with E/K/V the
// element, key and value type of the receiver:
//   s string   i i32   b boolean   d f64   n none (result only)
//   j i32 that may be omitted (defaults to INT32_MAX)   z i32 that may be omitted (defaults to 0)   w string that may be omitted (" ")   y string that may be omitted (",")
//   x any reference (an object, string, array, Map or Set)
//   a, m, t    the receiver array, Map, Set (as a result: the receiver again)
//   e element of the receiver's array or Set   k key of the Map   v value of the Map
//   r the class of the second argument (JSON parsing: the Dyn the null singleton belongs to)
//   A E[]   K K[]   V V[]   S string[]   c a function value (E, E) => f64: an object whose class has a `call` selector (the comparator of sort)
// flags: 0 method, 1 property (a getter, no call syntax), 2 internal (operators and conversions, no member syntax).
#include <cstdint>
#include <cstring>

#define ZN_RUNTIME(X)                                                                                              \
  X(StrConcat, "string.#concat", "ss>s", 2) X(StrEq, "string.#eq", "ss>b", 2) X(StrLt, "string.#lt", "ss>b", 2)   \
  X(StrLe, "string.#le", "ss>b", 2)                                                                                 \
  X(NumToStrI, "string.#i2s", "i>s", 2) X(NumToStrU, "string.#u2s", "i>s", 2) X(NumToStrD, "string.#d2s", "d>s", 2) \
  X(BoolToStr, "string.#b2s", "b>s", 2) X(ObjId, "string.#objid", "x>i", 2) X(ClassName, "string.#classname", "x>s", 2) X(NumToFixed, "string.#tofixed", "di>s", 2)                                                                          \
  X(StrLength, "string.length", "s>i", 1) X(StrCharCodeAt, "string.charCodeAt", "si>i", 0)                          \
  X(StrSlice, "string.slice", "szj>s", 0) X(StrSubstring, "string.substring", "szj>s", 0)                          \
  X(StrToUpperCase, "string.toUpperCase", "s>s", 0) X(StrToLowerCase, "string.toLowerCase", "s>s", 0)             \
  X(StrSplit, "string.split", "ss>S", 0) X(StrIndexOf, "string.indexOf", "ssz>i", 0) X(StrLastIndexOf, "string.lastIndexOf", "ssj>i", 0)                                \
  X(StrIncludes, "string.includes", "ssz>b", 0) X(StrStartsWith, "string.startsWith", "ssz>b", 0)                    \
  X(StrEndsWith, "string.endsWith", "ssj>b", 0) X(StrTrim, "string.trim", "s>s", 0)         \
  X(StrTrimStart, "string.trimStart", "s>s", 0) X(StrTrimEnd, "string.trimEnd", "s>s", 0) X(StrConcatM, "string.concat", "ss>s", 0)                                 \
  X(StrCharAt, "string.charAt", "si>s", 0) X(StrRepeat, "string.repeat", "si>s", 0)   \
  X(StrPadStart, "string.padStart", "siw>s", 0) X(StrPadEnd, "string.padEnd", "siw>s", 0)                          \
  X(StrReplace, "string.replace", "sss>s", 0) X(StrReplaceAll, "string.replaceAll", "sss>s", 0)                  \
  X(ParseInt, "string.#parseInt", "sz>d", 2) X(ParseFloat, "string.#parseFloat", "s>d", 2) X(ToNumber, "string.#toNumber", "s>d", 2) X(JsonParse, "string.#jsonParse", "sx>r", 2)  \
  X(DynGetFast, "string.#dynGetFast", "xxs>r", 2) X(DynAddFast, "string.#dynAddFast", "xx>r", 2)                          \
  X(FromCharCode, "string.#fromCharCode", "i>s", 2)                                \
  X(ArrJoin, "Array.join", "ay>s", 0) X(ArrSort, "Array.sort", "ac>a", 0) X(ArrSlice, "Array.slice", "azj>a", 0)   \
  X(ArrReverse, "Array.reverse", "a>a", 0) X(ArrIndexOf, "Array.indexOf", "ae>i", 0)                               \
  X(ArrIncludes, "Array.includes", "ae>b", 0) X(ArrPop, "Array.#pop", "a>e", 2)                                    \
  X(MapGet, "Map.get", "mk>v", 0) X(MapSet, "Map.set", "mkv>m", 0) X(MapHas, "Map.has", "mk>b", 0)                 \
  X(MapDelete, "Map.delete", "mk>b", 0) X(MapClear, "Map.clear", "m>n", 0) X(MapKeys, "Map.keys", "m>K", 0)        \
  X(MapValues, "Map.values", "m>V", 0) X(MapSize, "Map.size", "m>i", 1)                                            \
  X(SetAdd, "Set.add", "te>t", 0) X(SetHas, "Set.has", "te>b", 0) X(SetDelete, "Set.delete", "te>b", 0)           \
  X(SetClear, "Set.clear", "t>n", 0) X(SetValues, "Set.values", "t>A", 0) X(SetSize, "Set.size", "t>i", 1)

namespace zn {

enum class Rt : std::uint16_t {
#define X(id, name, sig, flags) id,
  ZN_RUNTIME(X)
#undef X
  Count
};

struct RtInfo {
  Rt id;
  const char* name;  // "owner.member"
  const char* sig;
  unsigned flags;
};

inline constexpr RtInfo kRtInfo[] = {
#define X(id, name, sig, flags) {Rt::id, name, sig, flags},
    ZN_RUNTIME(X)
#undef X
};

inline const RtInfo& rtInfo(Rt r) { return kRtInfo[static_cast<unsigned>(r)]; }
inline unsigned rtParamCount(const RtInfo& r) { return static_cast<unsigned>(std::strchr(r.sig, '>') - r.sig); }
inline char rtParam(const RtInfo& r, unsigned k) { return r.sig[k]; }
inline char rtRet(const RtInfo& r) { return std::strchr(r.sig, '>')[1]; }
// Parameters the user writes: without the receiver.
inline unsigned rtUserParams(const RtInfo& r) { return rtParamCount(r) - 1; }
// Parameters that must be given: those before the first optional one (j, z, w).
inline unsigned rtMinUserParams(const RtInfo& r) {
  unsigned n = 0;
  for (unsigned k = 1; k < rtParamCount(r); ++k) { char l = r.sig[k]; if (l == 'j' || l == 'z' || l == 'w' || l == 'y') break; ++n; }
  return n;
}
// The member name after the owner prefix ("slice" in "string.slice").
inline const char* rtMember(const RtInfo& r) { return std::strchr(r.name, '.') + 1; }
// Whether the row belongs to the owner ("string", "Array", "Map", "Set").
inline bool rtOwnedBy(const RtInfo& r, const char* owner) { std::size_t n = std::strlen(owner); return std::strncmp(r.name, owner, n) == 0 && r.name[n] == '.'; }

// Ownership (reference counting, ZN-018). A runtime call borrows its arguments except the ones it stores, which it consumes
// (the caller gives up its reference): the key and value of Map.set, the element of Set.add. A result is a new reference
// except Map.get, which lends the stored value (the caller retains it if it keeps it).
inline bool rtConsumes(Rt id, unsigned paramIndex) {
  switch (id) {
    case Rt::MapSet: return paramIndex == 1 || paramIndex == 2;
    case Rt::SetAdd: return paramIndex == 1;
    default: return false;
  }
}
inline bool rtResultBorrowed(Rt id) { return id == Rt::MapGet; }

}  // namespace zn
