#pragma once
// Runtime calls: the string, array, Map and Set operations the compiler lowers to `Rt` and the VM implements. One table
// shared by the checker (user-visible members and their types), the IR lowering, the verifier and the interpreter, so
// they cannot disagree on names or signatures.
//
// X(Id, "owner.member", "params>ret", flags). The receiver is the first parameter. Type letters, with E/K/V the
// element, key and value type of the receiver:
//   s string   i i32   u u32   b boolean   d f64   n none (result only)
//   j i32 that may be omitted (defaults to INT32_MAX)   z i32 that may be omitted (defaults to 0)   w string that may be omitted (" ")   y string that may be omitted (",")
//   B u8[] / i32[] (a borrowed array of integers; as a parameter only)
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
  X(SetClear, "Set.clear", "t>n", 0) X(SetValues, "Set.values", "t>A", 0) X(SetSize, "Set.size", "t>i", 1)                  \
  /* host: functions of the program's host (zinc:gfx); the checker declares them as __host_<member>, the wrappers of the host modules call them. D: f64[] */ \
  X(HostGfxFrames, "host.gfxFrames", ">i", 2) X(HostGfxBegin, "host.gfxBegin", ">n", 2) X(HostGfxEnd, "host.gfxEnd", ">n", 2)                          \
  X(HostGfxClear, "host.gfxClear", "u>n", 2) X(HostGfxRect, "host.gfxRect", "ddddu>n", 2) X(HostGfxRRect, "host.gfxRRect", "dddddui>n", 2)        \
  X(HostGfxFont, "host.gfxFont", "si>i", 2) X(HostGfxDrawText, "host.gfxDrawText", "iddsuid>n", 2)                                               \
  X(HostGfxLine, "host.gfxLine", "ddddu>n", 2) X(HostGfxText, "host.gfxText", "ddsui>n", 2)                                                      \
  X(HostGfxGradient, "host.gfxGradient", "ddddduubi>n", 2) X(HostGfxBorder, "host.gfxBorder", "ddddddui>n", 2) X(HostGfxShadow, "host.gfxShadow", "ddddddui>n", 2) \
  X(HostGfxPolygon, "host.gfxPolygon", "Dui>n", 2) X(HostGfxPath, "host.gfxPath", "Dui>n", 2) X(HostGfxStroke, "host.gfxStroke", "Dduib>n", 2)  \
  X(HostGfxFontAscent, "host.gfxFontAscent", "i>i", 2) X(HostGfxLineHeight, "host.gfxLineHeight", "i>i", 2) X(HostGfxTextWidth, "host.gfxTextWidth", "isd>d", 2) \
  X(HostGfxImage, "host.gfxImage", "s>i", 2) X(HostGfxImageWidth, "host.gfxImageWidth", "i>i", 2) X(HostGfxImageHeight, "host.gfxImageHeight", "i>i", 2)       \
  X(HostGfxDrawImage, "host.gfxDrawImage", "iddddid>n", 2) X(HostGfxClip, "host.gfxClip", "ddddd>n", 2) X(HostGfxUnclip, "host.gfxUnclip", ">n", 2)       \
  X(HostGfxTranslate, "host.gfxTranslate", "dd>n", 2) X(HostGfxKeep, "host.gfxKeep", ">n", 2) X(HostGfxWidth, "host.gfxWidth", ">i", 2)                \
  X(HostGfxHeight, "host.gfxHeight", ">i", 2) X(HostGfxPixelScale, "host.gfxPixelScale", ">i", 2)                      \
  X(HostGfxProfiling, "host.gfxProfiling", ">b", 2) X(HostGfxProfMark, "host.gfxProfMark", "i>n", 2) X(HostGfxFinish, "host.gfxFinish", ">n", 2) \
  X(HostGfxPoll, "host.gfxPoll", ">d", 2) \
  X(HostGfxShouldQuit, "host.gfxShouldQuit", ">b", 2) \
  X(HostGfxQuit, "host.gfxQuit", ">n", 2) \
  X(HostGfxWheel, "host.gfxWheel", ">d", 2) \
  X(HostGfxWheelX, "host.gfxWheelX", ">d", 2) \
  X(HostGfxPinch, "host.gfxPinch", ">d", 2) \
  X(HostGfxScrollDX, "host.gfxScrollDX", ">d", 2) \
  X(HostGfxScrollDY, "host.gfxScrollDY", ">d", 2) \
  X(HostGfxScrollPhase, "host.gfxScrollPhase", ">i", 2) \
  X(HostGfxTouchCount, "host.gfxTouchCount", ">i", 2) \
  X(HostGfxTouchX, "host.gfxTouchX", "i>d", 2) \
  X(HostGfxTouchY, "host.gfxTouchY", "i>d", 2) \
  X(HostGfxTouchId, "host.gfxTouchId", "i>i", 2) \
  X(HostGfxPenCount, "host.gfxPenCount", ">i", 2) \
  X(HostGfxPenX, "host.gfxPenX", "i>d", 2) \
  X(HostGfxPenY, "host.gfxPenY", "i>d", 2) \
  X(HostGfxPenPressure, "host.gfxPenPressure", "i>d", 2) \
  X(HostGfxPenTiltX, "host.gfxPenTiltX", "i>d", 2) \
  X(HostGfxPenTiltY, "host.gfxPenTiltY", "i>d", 2) \
  X(HostGfxPenFlags, "host.gfxPenFlags", "i>i", 2) \
  X(HostGfxIsDown, "host.gfxIsDown", "i>b", 2) \
  X(HostGfxWasPressed, "host.gfxWasPressed", "i>b", 2) \
  X(HostGfxPointerX, "host.gfxPointerX", ">d", 2) \
  X(HostGfxPointerY, "host.gfxPointerY", ">d", 2) \
  X(HostGfxPointerDown, "host.gfxPointerDown", ">b", 2) \
  X(HostGfxPointerButtons, "host.gfxPointerButtons", ">i", 2) \
  X(HostGfxModifiers, "host.gfxModifiers", ">i", 2) \
  X(HostGfxKeyCount, "host.gfxKeyCount", ">i", 2) \
  X(HostGfxKeyKind, "host.gfxKeyKind", "i>i", 2) \
  X(HostGfxKeyMods, "host.gfxKeyMods", "i>i", 2) \
  X(HostGfxKeyName, "host.gfxKeyName", "i>s", 2) \
  X(HostGfxButtonEventCount, "host.gfxButtonEventCount", ">i", 2) \
  X(HostGfxButtonEventX, "host.gfxButtonEventX", "i>d", 2) \
  X(HostGfxButtonEventY, "host.gfxButtonEventY", "i>d", 2) \
  X(HostGfxButtonEventButton, "host.gfxButtonEventButton", "i>i", 2) \
  X(HostGfxButtonEventDown, "host.gfxButtonEventDown", "i>b", 2) \
  X(HostGfxStartTextInput, "host.gfxStartTextInput", "dddd>n", 2) \
  X(HostGfxStopTextInput, "host.gfxStopTextInput", ">n", 2) \
  X(HostGfxClipboardText, "host.gfxClipboardText", ">s", 2) \
  X(HostGfxSetClipboardText, "host.gfxSetClipboardText", "s>n", 2) \
  X(HostGfxSetCursor, "host.gfxSetCursor", "i>n", 2) \
  X(HostGfxEscapeByApp, "host.gfxEscapeByApp", "b>n", 2) \
  X(HostGfxEscapeDefault, "host.gfxEscapeDefault", ">n", 2) \
  X(HostGfxCapture, "host.gfxCapture", "s>b", 2) \
  X(HostSysFirst, "host.sysFirst", ">n", 2) \
  X(HostSysArgsCount, "host.sysArgsCount", ">i", 2) \
  X(HostSysArg, "host.sysArg", "i>s", 2) \
  X(HostSysEnv, "host.sysEnv", "s>s", 2) \
  X(HostSysExit, "host.sysExit", "i>n", 2) \
  X(HostSysPlatform, "host.sysPlatform", ">s", 2) \
  X(HostSysPid, "host.sysPid", ">i", 2) \
  X(HostSysCwd, "host.sysCwd", ">s", 2) \
  X(HostSysChdir, "host.sysChdir", "s>b", 2) \
  X(HostSysSetEnv, "host.sysSetEnv", "ss>n", 2) \
  X(HostSysUnsetEnv, "host.sysUnsetEnv", "s>n", 2) \
  X(HostSysEnvKeysCount, "host.sysEnvKeysCount", ">i", 2) \
  X(HostSysEnvKey, "host.sysEnvKey", "i>s", 2) \
  X(HostSysIsatty, "host.sysIsatty", "i>b", 2) \
  X(HostSysWrite, "host.sysWrite", "s>n", 2) \
  X(HostSysWriteErr, "host.sysWriteErr", "s>n", 2) \
  X(HostSysRandomByte, "host.sysRandomByte", ">i", 2) \
  X(HostSysUtf8Len, "host.sysUtf8Len", "s>i", 2) \
  X(HostSysUtf8Byte, "host.sysUtf8Byte", "si>i", 2) \
  X(HostSysUtf8Decode, "host.sysUtf8Decode", "B>s", 2) \
  X(HostFsFailed, "host.fsFailed", ">b", 2) \
  X(HostFsError, "host.fsError", ">s", 2) \
  X(HostFsReadText, "host.fsReadText", "s>s", 2) \
  X(HostFsWriteText, "host.fsWriteText", "ss>n", 2) \
  X(HostFsAppendText, "host.fsAppendText", "ss>n", 2) \
  X(HostFsExists, "host.fsExists", "s>b", 2) \
  X(HostFsListCount, "host.fsListCount", "s>i", 2) \
  X(HostFsListName, "host.fsListName", "i>s", 2) \
  X(HostFsListKind, "host.fsListKind", "i>i", 2) \
  X(HostFsRemove, "host.fsRemove", "sb>b", 2) \
  X(HostFsMkdir, "host.fsMkdir", "sb>b", 2) \
  X(HostFsLoad, "host.fsLoad", "s>i", 2) \
  X(HostFsByte, "host.fsByte", "i>i", 2) \
  X(HostFsWriteBytes, "host.fsWriteBytes", "sB>n", 2) \
  X(HostFsStat, "host.fsStat", "sb>b", 2) \
  X(HostFsStatD, "host.fsStatD", "i>d", 2) \
  X(HostFsStatI, "host.fsStatI", "i>i", 2) \
  X(HostFsRename, "host.fsRename", "ss>n", 2) \
  X(HostFsCopyFile, "host.fsCopyFile", "ss>n", 2) \
  X(HostFsRealpath, "host.fsRealpath", "s>s", 2) \
  X(HostFsTmpdir, "host.fsTmpdir", ">s", 2) \
  X(HostFsMkdtemp, "host.fsMkdtemp", "s>s", 2) \
  X(HostStorageGet, "host.storageGet", "s>s", 2) \
  X(HostStorageSet, "host.storageSet", "ss>n", 2) \
  X(HostStorageRemove, "host.storageRemove", "s>n", 2) \
  X(HostStorageKeysCount, "host.storageKeysCount", ">i", 2) \
  X(HostStorageKey, "host.storageKey", "i>s", 2) \
  X(HostAssetsExists, "host.assetsExists", "s>b", 2) \
  X(HostAssetsReadText, "host.assetsReadText", "s>s", 2) \
  X(HostAssetsLoad, "host.assetsLoad", "s>i", 2) \
  X(HostAssetsCount, "host.assetsCount", ">i", 2) \
  X(HostAssetsName, "host.assetsName", "i>s", 2) \
  X(HostOsHostname, "host.osHostname", ">s", 2) \
  X(HostOsHomedir, "host.osHomedir", ">s", 2) \
  X(HostOsArch, "host.osArch", ">s", 2) \
  X(HostOsType, "host.osType", ">s", 2) \
  X(HostOsRelease, "host.osRelease", ">s", 2) \
  X(HostOsUptime, "host.osUptime", ">d", 2) \
  X(HostOsTotalmem, "host.osTotalmem", ">d", 2) \
  X(HostOsFreemem, "host.osFreemem", ">d", 2) \
  X(HostOsCpus, "host.osCpus", ">i", 2) \
  X(HostOsUser, "host.osUser", ">s", 2) \
  X(HostOsLoad, "host.osLoad", "i>d", 2) \
  X(HostGfxCreateImage, "host.gfxCreateImage", "ii>i", 2) X(HostGfxDestroyImage, "host.gfxDestroyImage", "i>n", 2) \
  X(HostGfxBeginImage, "host.gfxBeginImage", "i>n", 2) X(HostGfxEndImage, "host.gfxEndImage", ">n", 2) \
  X(HostProcSpawn, "host.procSpawn", "s>i", 2) \
  X(HostProcRead, "host.procRead", "i>s", 2) \
  X(HostProcStatus, "host.procStatus", "i>i", 2) \
  X(HostProcKill, "host.procKill", "i>n", 2) \
  X(HostHostLast, "host.hostLast", ">n", 2) \
  /* internal rows after the host ones, so no id that a ZBC file or a firmware knows moves: what the optimizer rewrites a call into (not members of any type): a stable sort of an f64[] whose comparator was (a, b) => a - b or (a, b) => b - a, without callbacks */ \
  X(ArrSortAsc, "internal.arrSortAsc", "a>a", 0) X(ArrSortDesc, "internal.arrSortDesc", "a>a", 0) \
  /* appended rows (after the host ones, so no known id moves) */ \
  X(StrAt, "string.at", "si>s", 0) X(ArrSetLength, "Array.__setLength", "ai>n", 0) /* `arr.length = n`: the checker rewrites the assignment into this call */ \
  /* the event loop (ZN-082): wait for the next event for ms milliseconds (a real sleep), and whether the program runs in real time (ZINC_REALTIME) */ \
  X(HostLoopWait, "host.loopWait", "d>n", 2) X(HostLoopReal, "host.loopReal", ">i", 2) \
  X(HostLoopNow, "host.loopNow", ">d", 2) X(HostLoopEpoch, "host.loopEpoch", ">d", 2)  /* milliseconds since the program started, and since 1970 */

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

// The host rows are served by two host tables: the graphics host (the rows before HostSysFirst and the image rows) and the system host (zinc:sys, fs, storage, assets, os, process).
inline constexpr bool isSysRow(Rt r) { return (r >= Rt::HostSysFirst && r <= Rt::HostHostLast && !(r >= Rt::HostGfxCreateImage && r <= Rt::HostGfxEndImage)) || r >= Rt::HostLoopWait; }
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
