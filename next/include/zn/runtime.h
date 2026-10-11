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
  /* internal rows after the host ones, so no id that a ZBC file or a firmware knows moves: what the optimizer rewrites a call into (not members of any type): a stable sort of an f64[] or an i32[] (the element class tells them apart, ZN-420) whose comparator was (a, b) => a - b or (a, b) => b - a, without callbacks */ \
  X(ArrSortAsc, "internal.arrSortAsc", "a>a", 0) X(ArrSortDesc, "internal.arrSortDesc", "a>a", 0) \
  /* appended rows (after the host ones, so no known id moves) */ \
  X(StrCodePointAt, "string.codePointAt", "si>i", 0) X(StrNormalize, "string.normalize", "sw>s", 0) X(StrLocaleCompare, "string.localeCompare", "ssw>i", 0) \
  X(StrChars, "string.__chars", "s>S", 0) X(FromCodePoint, "string.#fromCodePoint", "i>s", 2) /* ZN-091 */ \
  X(StrAt, "string.at", "si>s", 0) X(JsonOut, "string.#jsonOut", "x>s", 2) /* JSON text of a Dyn tree; "" when it holds a typed object view (the prelude then walks it) */ X(ArrSetLength, "Array.__setLength", "ai>n", 0) /* `arr.length = n`: the checker rewrites the assignment into this call */ \
  /* the event loop (ZN-082): wait for the next event for ms milliseconds (a real sleep), and whether the program runs in real time (ZINC_REALTIME) */ \
  X(HostLoopWait, "host.loopWait", "d>n", 2) X(HostLoopReal, "host.loopReal", ">i", 2) \
  X(HostLoopNow, "host.loopNow", ">d", 2) X(HostLoopEpoch, "host.loopEpoch", ">d", 2) /* milliseconds since the program started, and since 1970 */ \
  /* zinc:process and the program's own signals and stdin (ZN-084): argv/cwd/env spawn, stdin, signals, and the queue of events of the loop */ \
  X(HostProcSpawnEx, "host.procSpawnEx", "ssss>i", 2) X(HostProcError, "host.procError", ">s", 2) X(HostProcPid, "host.procPid", "i>i", 2) \
  X(HostProcWrite, "host.procWrite", "is>i", 2) X(HostProcCloseStdin, "host.procCloseStdin", "i>n", 2) X(HostProcSignal, "host.procSignal", "ii>n", 2) \
  X(HostEvNext, "host.evNext", ">s", 2) X(HostEvActive, "host.evActive", ">i", 2) \
  X(HostSigWatch, "host.sigWatch", "s>i", 2) X(HostSigSend, "host.sigSend", "is>i", 2) X(HostStdinRead, "host.stdinRead", ">n", 2) \
  /* zinc:osc (ZN-085) */ \
  X(HostOscListen, "host.oscListen", "i>i", 2) X(HostOscClose, "host.oscClose", ">n", 2) X(HostOscSend, "host.oscSend", "sis>i", 2) \
  /* zinc:mqtt (ZN-086) */ \
  X(HostMqttOpen, "host.mqttOpen", "sis>i", 2) X(HostMqttPublish, "host.mqttPublish", "issii>n", 2) X(HostMqttSubscribe, "host.mqttSubscribe", "is>n", 2) X(HostMqttClose, "host.mqttClose", "i>n", 2) \
  /* zinc:net over llhttp (ZN-087) */ \
  X(HostHttpFetch, "host.httpFetch", "ssssii>i", 2) X(HostHttpStatus, "host.httpStatus", "i>i", 2) X(HostHttpHead, "host.httpHead", "i>s", 2) \
  X(HostHttpBody, "host.httpBody", "i>s", 2) X(HostHttpUrl, "host.httpUrl", "i>s", 2) X(HostHttpFree, "host.httpFree", "i>n", 2) \
  X(HostHttpServe, "host.httpServe", "i>i", 2) X(HostHttpStop, "host.httpStop", ">n", 2) X(HostHttpReply, "host.httpReply", "iiss>n", 2) X(HostHttpServeTls, "host.httpServeTls", "iss>i", 2) X(HostMqttOpenTls, "host.mqttOpenTls", "sisi>i", 2) \
  /* crypto.subtle on PSA (ZN-089): operation, four byte arrays, two numbers; the result as raw bytes */ \
  X(HostReCompile, "host.reCompile", "ss>i", 2) X(HostReError, "host.reError", ">s", 2) X(HostReExec, "host.reExec", "isi>i", 2) X(HostReCapture, "host.reCapture", "i>i", 2) X(HostReExecAll, "host.reExecAll", "isi>i", 2) X(HostReAll, "host.reAll", "i>i", 2) \
  X(HostReInfo, "host.reInfo", "ii>i", 2) X(HostReName, "host.reName", "ii>s", 2) /* regular expressions (ZN-090) */ \
  X(HostTzOffset, "host.tzOffset", "d>d", 2) X(HostTzName, "host.tzName", "d>s", 2) X(HostTzOffsetIn, "host.tzOffsetIn", "sd>d", 2) /* Date and time zones (ZN-093) */ \
  X(HostCrypto, "host.crypto", "sBBBBii>s", 2) X(HostCryptoError, "host.cryptoError", ">s", 2) X(HostHttpError, "host.httpError", ">s", 2) \
  /* zinc:socket (ZN-088): sockets as handles; bytes travel as arrays (writes) and raw strings (events) */ \
  X(HostSockConnect, "host.sockConnect", "si>i", 2) X(HostSockConnectUnix, "host.sockConnectUnix", "s>i", 2) X(HostSockListen, "host.sockListen", "si>i", 2) \
  X(HostSockListenUnix, "host.sockListenUnix", "s>i", 2) X(HostSockUdp, "host.sockUdp", "si>i", 2) X(HostSockWrite, "host.sockWrite", "iB>i", 2) \
  X(HostSockWriteText, "host.sockWriteText", "is>i", 2) X(HostSockSendTo, "host.sockSendTo", "isiB>i", 2) X(HostSockEnd, "host.sockEnd", "i>n", 2) \
  X(HostSockClose, "host.sockClose", "i>n", 2) X(HostSockLocalPort, "host.sockLocalPort", "i>i", 2) X(HostSockRemoteAddr, "host.sockRemoteAddr", "i>s", 2) \
  X(HostSockRemotePort, "host.sockRemotePort", "i>i", 2) X(HostSockLookup, "host.sockLookup", "s>i", 2) X(HostSockError, "host.sockError", ">s", 2) \
  X(HostEvPayload, "host.evPayload", ">s", 2) X(HostSysBytesToString, "host.sysBytesToString", "B>s", 2) /* raw bytes into a string, no UTF-8 repair */ \
  /* the loop's turn for the native modules (ZN-167): their pollers, queued callbacks and promise completions run; argument 1 polls, 0 only asks; 1 while native work is pending */ \
  X(HostNativePoll, "host.nativePoll", "i>i", 2) \
  X(HostFsSymlink, "host.fsSymlink", "ss>n", 2) X(HostFsReadlink, "host.fsReadlink", "s>s", 2) X(HostFsChmod, "host.fsChmod", "si>n", 2) \
  X(HostOsUid, "host.osUid", ">i", 2) X(HostOsGid, "host.osGid", ">i", 2) X(HostOsShell, "host.osShell", ">s", 2) X(HostOsCpuModel, "host.osCpuModel", ">s", 2) \
  X(HostOsNetList, "host.osNetList", ">i", 2) X(HostOsNetField, "host.osNetField", "ii>s", 2) \
  X(HostSysAllocations, "host.sysAllocations", ">d", 2) X(HostSysLiveBlocks, "host.sysLiveBlocks", ">d", 2) /* the runtime allocator's counters (ZN-192) */ \
  X(HostEvReady, "host.evReady", ">b", 2) \
  X(HostGfxCommands, "host.gfxCommands", ">i", 2) X(HostGfxCommandsFree, "host.gfxCommandsFree", ">i", 2) \
  /* a host layout engine (ZN-284.01, src/host/layout.h): served by `hostLayout`; appended so the ids of the rows above stay those of the device cores */ \
  X(HostLayoutNew, "host.layoutNew", "b>b", 2) X(HostLayoutCreate, "host.layoutCreate", "i>n", 2) X(HostLayoutDestroy, "host.layoutDestroy", "i>n", 2) \
  X(HostLayoutStyle, "host.layoutStyle", "iid>n", 2) X(HostLayoutInsert, "host.layoutInsert", "iii>n", 2) X(HostLayoutRemove, "host.layoutRemove", "ii>n", 2) \
  X(HostLayoutText, "host.layoutText", "isiiddiiiid>n", 2) X(HostLayoutImage, "host.layoutImage", "idd>n", 2) X(HostLayoutField, "host.layoutField", "iidb>n", 2) \
  X(HostLayoutClear, "host.layoutClear", "i>n", 2) X(HostLayoutDirty, "host.layoutDirty", "i>n", 2) X(HostLayoutCalc, "host.layoutCalc", "idd>n", 2) \
  X(HostLayoutBox, "host.layoutBox", "ii>d", 2) X(HostLayoutLines, "host.layoutLines", "i>i", 2) X(HostLayoutLine, "host.layoutLine", "ii>s", 2) \
  X(HostLayoutLineWidth, "host.layoutLineWidth", "ii>d", 2) X(HostLayoutCounter, "host.layoutCounter", "i>d", 2) \
  /* the surface follows the window (1) or stays fixed and scaled (0), unless zinc.json chose (ZN-608): zinc:gfx onResize asks for it; appended */ \
  X(HostGfxSetResize, "host.gfxSetResize", "i>n", 2) \
  /* zinc:gl (ZN-562): WebGL for compiled Zinc code, served by `hostGl` (libzn_webgl's WebGL1 class); the first argument is the context; appended */ \
  /* zinc:gl rows: generated by tools/gen-zinc-gl */ \
  X(HostGlCreate, "host.glCreate", "iiii>i", 2) X(HostGlGetError, "host.glGetError", "i>i", 2) X(HostGlEnable, "host.glEnable", "iu>n", 2) \
  X(HostGlDisable, "host.glDisable", "iu>n", 2) X(HostGlIsEnabled, "host.glIsEnabled", "iu>b", 2) X(HostGlViewport, "host.glViewport", "iiiii>n", 2) \
  X(HostGlScissor, "host.glScissor", "iiiii>n", 2) X(HostGlClearColor, "host.glClearColor", "idddd>n", 2) X(HostGlClear, "host.glClear", "iu>n", 2) \
  X(HostGlClearDepth, "host.glClearDepth", "id>n", 2) X(HostGlClearStencil, "host.glClearStencil", "ii>n", 2) X(HostGlColorMask, "host.glColorMask", "ibbbb>n", 2) \
  X(HostGlPixelStorei, "host.glPixelStorei", "iui>n", 2) X(HostGlBlendColor, "host.glBlendColor", "idddd>n", 2) X(HostGlBlendEquation, "host.glBlendEquation", "iu>n", 2) \
  X(HostGlBlendEquationSeparate, "host.glBlendEquationSeparate", "iuu>n", 2) X(HostGlBlendFunc, "host.glBlendFunc", "iuu>n", 2) X(HostGlBlendFuncSeparate, "host.glBlendFuncSeparate", "iuuuu>n", 2) \
  X(HostGlCullFace, "host.glCullFace", "iu>n", 2) X(HostGlFrontFace, "host.glFrontFace", "iu>n", 2) X(HostGlDepthFunc, "host.glDepthFunc", "iu>n", 2) \
  X(HostGlDepthMask, "host.glDepthMask", "ib>n", 2) X(HostGlDepthRange, "host.glDepthRange", "idd>n", 2) X(HostGlHint, "host.glHint", "iuu>n", 2) \
  X(HostGlLineWidth, "host.glLineWidth", "id>n", 2) X(HostGlPolygonOffset, "host.glPolygonOffset", "idd>n", 2) X(HostGlSampleCoverage, "host.glSampleCoverage", "idb>n", 2) \
  X(HostGlStencilFunc, "host.glStencilFunc", "iuiu>n", 2) X(HostGlStencilFuncSeparate, "host.glStencilFuncSeparate", "iuuiu>n", 2) X(HostGlStencilMask, "host.glStencilMask", "iu>n", 2) \
  X(HostGlStencilMaskSeparate, "host.glStencilMaskSeparate", "iuu>n", 2) X(HostGlStencilOp, "host.glStencilOp", "iuuu>n", 2) X(HostGlStencilOpSeparate, "host.glStencilOpSeparate", "iuuuu>n", 2) \
  X(HostGlFlush, "host.glFlush", "i>n", 2) X(HostGlFinish, "host.glFinish", "i>n", 2) X(HostGlGetParameter, "host.glGetParameter", "iu>n", 2) \
  X(HostGlGetContextAttributes, "host.glGetContextAttributes", "i>i", 2) X(HostGlIsContextLost, "host.glIsContextLost", "i>b", 2) X(HostGlGetExtension, "host.glGetExtension", "is>b", 2) \
  X(HostGlGetSupportedExtensions, "host.glGetSupportedExtensions", "i>s", 2) X(HostGlGetShaderPrecisionFormat, "host.glGetShaderPrecisionFormat", "iuu>n", 2) X(HostGlCreateBuffer, "host.glCreateBuffer", "i>i", 2) \
  X(HostGlDeleteBuffer, "host.glDeleteBuffer", "ii>n", 2) X(HostGlIsBuffer, "host.glIsBuffer", "ii>b", 2) X(HostGlBindBuffer, "host.glBindBuffer", "iui>n", 2) \
  X(HostGlBufferData, "host.glBufferData", "iuDiu>n", 2) X(HostGlBufferDataSize, "host.glBufferDataSize", "iuiu>n", 2) X(HostGlBufferSubData, "host.glBufferSubData", "iuiDi>n", 2) \
  X(HostGlGetBufferParameter, "host.glGetBufferParameter", "iuu>n", 2) X(HostGlCopyBufferSubData, "host.glCopyBufferSubData", "iuuiii>n", 2) X(HostGlGetBufferSubData, "host.glGetBufferSubData", "iuiDi>n", 2) \
  X(HostGlCreateShader, "host.glCreateShader", "iu>i", 2) X(HostGlDeleteShader, "host.glDeleteShader", "ii>n", 2) X(HostGlIsShader, "host.glIsShader", "ii>b", 2) \
  X(HostGlShaderSource, "host.glShaderSource", "iis>n", 2) X(HostGlCompileShader, "host.glCompileShader", "ii>n", 2) X(HostGlGetShaderSource, "host.glGetShaderSource", "ii>s", 2) \
  X(HostGlGetShaderParameter, "host.glGetShaderParameter", "iiu>n", 2) X(HostGlGetShaderInfoLog, "host.glGetShaderInfoLog", "ii>s", 2) X(HostGlCreateProgram, "host.glCreateProgram", "i>i", 2) \
  X(HostGlDeleteProgram, "host.glDeleteProgram", "ii>n", 2) X(HostGlIsProgram, "host.glIsProgram", "ii>b", 2) X(HostGlAttachShader, "host.glAttachShader", "iii>n", 2) \
  X(HostGlDetachShader, "host.glDetachShader", "iii>n", 2) X(HostGlGetAttachedShaders, "host.glGetAttachedShaders", "ii>s", 2) X(HostGlBindAttribLocation, "host.glBindAttribLocation", "iius>n", 2) \
  X(HostGlLinkProgram, "host.glLinkProgram", "ii>n", 2) X(HostGlValidateProgram, "host.glValidateProgram", "ii>n", 2) X(HostGlUseProgram, "host.glUseProgram", "ii>n", 2) \
  X(HostGlGetProgramParameter, "host.glGetProgramParameter", "iiu>n", 2) X(HostGlGetProgramInfoLog, "host.glGetProgramInfoLog", "ii>s", 2) X(HostGlGetActiveUniform, "host.glGetActiveUniform", "iiu>n", 2) \
  X(HostGlGetActiveAttrib, "host.glGetActiveAttrib", "iiu>n", 2) X(HostGlGetAttribLocation, "host.glGetAttribLocation", "iis>i", 2) X(HostGlGetUniformLocation, "host.glGetUniformLocation", "iis>i", 2) \
  X(HostGlGetUniform, "host.glGetUniform", "iii>n", 2) X(HostGlGetFragDataLocation, "host.glGetFragDataLocation", "iis>i", 2) X(HostGlUniform1f, "host.glUniform1f", "iid>n", 2) \
  X(HostGlUniform1i, "host.glUniform1i", "iii>n", 2) X(HostGlUniform1ui, "host.glUniform1ui", "iiu>n", 2) X(HostGlUniform1fv, "host.glUniform1fv", "iiD>n", 2) \
  X(HostGlUniform1iv, "host.glUniform1iv", "iiD>n", 2) X(HostGlUniform1uiv, "host.glUniform1uiv", "iiD>n", 2) X(HostGlUniform2f, "host.glUniform2f", "iidd>n", 2) \
  X(HostGlUniform2i, "host.glUniform2i", "iiii>n", 2) X(HostGlUniform2ui, "host.glUniform2ui", "iiuu>n", 2) X(HostGlUniform2fv, "host.glUniform2fv", "iiD>n", 2) \
  X(HostGlUniform2iv, "host.glUniform2iv", "iiD>n", 2) X(HostGlUniform2uiv, "host.glUniform2uiv", "iiD>n", 2) X(HostGlUniform3f, "host.glUniform3f", "iiddd>n", 2) \
  X(HostGlUniform3i, "host.glUniform3i", "iiiii>n", 2) X(HostGlUniform3ui, "host.glUniform3ui", "iiuuu>n", 2) X(HostGlUniform3fv, "host.glUniform3fv", "iiD>n", 2) \
  X(HostGlUniform3iv, "host.glUniform3iv", "iiD>n", 2) X(HostGlUniform3uiv, "host.glUniform3uiv", "iiD>n", 2) X(HostGlUniform4f, "host.glUniform4f", "iidddd>n", 2) \
  X(HostGlUniform4i, "host.glUniform4i", "iiiiii>n", 2) X(HostGlUniform4ui, "host.glUniform4ui", "iiuuuu>n", 2) X(HostGlUniform4fv, "host.glUniform4fv", "iiD>n", 2) \
  X(HostGlUniform4iv, "host.glUniform4iv", "iiD>n", 2) X(HostGlUniform4uiv, "host.glUniform4uiv", "iiD>n", 2) X(HostGlUniformMatrix2fv, "host.glUniformMatrix2fv", "iibD>n", 2) \
  X(HostGlUniformMatrix3fv, "host.glUniformMatrix3fv", "iibD>n", 2) X(HostGlUniformMatrix4fv, "host.glUniformMatrix4fv", "iibD>n", 2) X(HostGlUniformMatrix2x3fv, "host.glUniformMatrix2x3fv", "iibD>n", 2) \
  X(HostGlUniformMatrix2x4fv, "host.glUniformMatrix2x4fv", "iibD>n", 2) X(HostGlUniformMatrix3x2fv, "host.glUniformMatrix3x2fv", "iibD>n", 2) X(HostGlUniformMatrix3x4fv, "host.glUniformMatrix3x4fv", "iibD>n", 2) \
  X(HostGlUniformMatrix4x2fv, "host.glUniformMatrix4x2fv", "iibD>n", 2) X(HostGlUniformMatrix4x3fv, "host.glUniformMatrix4x3fv", "iibD>n", 2) X(HostGlGetUniformBlockIndex, "host.glGetUniformBlockIndex", "iis>i", 2) \
  X(HostGlUniformBlockBinding, "host.glUniformBlockBinding", "iiuu>n", 2) X(HostGlGetActiveUniformBlockParameter, "host.glGetActiveUniformBlockParameter", "iiuu>n", 2) X(HostGlGetActiveUniformBlockName, "host.glGetActiveUniformBlockName", "iiu>s", 2) \
  X(HostGlGetUniformIndices, "host.glGetUniformIndices", "iis>s", 2) X(HostGlGetActiveUniforms, "host.glGetActiveUniforms", "iiDu>n", 2) X(HostGlEnableVertexAttribArray, "host.glEnableVertexAttribArray", "iu>n", 2) \
  X(HostGlDisableVertexAttribArray, "host.glDisableVertexAttribArray", "iu>n", 2) X(HostGlVertexAttribPointer, "host.glVertexAttribPointer", "iuiubii>n", 2) X(HostGlVertexAttribIPointer, "host.glVertexAttribIPointer", "iuiuii>n", 2) \
  X(HostGlVertexAttrib1f, "host.glVertexAttrib1f", "iud>n", 2) X(HostGlVertexAttrib1fv, "host.glVertexAttrib1fv", "iuD>n", 2) X(HostGlVertexAttrib2f, "host.glVertexAttrib2f", "iudd>n", 2) \
  X(HostGlVertexAttrib2fv, "host.glVertexAttrib2fv", "iuD>n", 2) X(HostGlVertexAttrib3f, "host.glVertexAttrib3f", "iuddd>n", 2) X(HostGlVertexAttrib3fv, "host.glVertexAttrib3fv", "iuD>n", 2) \
  X(HostGlVertexAttrib4f, "host.glVertexAttrib4f", "iudddd>n", 2) X(HostGlVertexAttrib4fv, "host.glVertexAttrib4fv", "iuD>n", 2) X(HostGlVertexAttribI4i, "host.glVertexAttribI4i", "iuiiii>n", 2) \
  X(HostGlVertexAttribI4ui, "host.glVertexAttribI4ui", "iuuuuu>n", 2) X(HostGlVertexAttribI4iv, "host.glVertexAttribI4iv", "iuD>n", 2) X(HostGlVertexAttribI4uiv, "host.glVertexAttribI4uiv", "iuD>n", 2) \
  X(HostGlGetVertexAttrib, "host.glGetVertexAttrib", "iuu>n", 2) X(HostGlGetVertexAttribOffset, "host.glGetVertexAttribOffset", "iuu>i", 2) X(HostGlVertexAttribDivisor, "host.glVertexAttribDivisor", "iuu>n", 2) \
  X(HostGlDrawArrays, "host.glDrawArrays", "iuii>n", 2) X(HostGlDrawElements, "host.glDrawElements", "iuiui>n", 2) X(HostGlDrawArraysInstanced, "host.glDrawArraysInstanced", "iuiii>n", 2) \
  X(HostGlDrawElementsInstanced, "host.glDrawElementsInstanced", "iuiuii>n", 2) X(HostGlDrawRangeElements, "host.glDrawRangeElements", "iuuuiui>n", 2) X(HostGlDrawBuffers, "host.glDrawBuffers", "iD>n", 2) \
  X(HostGlReadBuffer, "host.glReadBuffer", "iu>n", 2) X(HostGlCreateVertexArray, "host.glCreateVertexArray", "i>i", 2) X(HostGlDeleteVertexArray, "host.glDeleteVertexArray", "ii>n", 2) \
  X(HostGlIsVertexArray, "host.glIsVertexArray", "ii>b", 2) X(HostGlBindVertexArray, "host.glBindVertexArray", "ii>n", 2) X(HostGlBindBufferBase, "host.glBindBufferBase", "iuui>n", 2) \
  X(HostGlBindBufferRange, "host.glBindBufferRange", "iuuiii>n", 2) X(HostGlGetIndexedParameter, "host.glGetIndexedParameter", "iuu>n", 2) X(HostGlCreateTexture, "host.glCreateTexture", "i>i", 2) \
  X(HostGlDeleteTexture, "host.glDeleteTexture", "ii>n", 2) X(HostGlIsTexture, "host.glIsTexture", "ii>b", 2) X(HostGlBindTexture, "host.glBindTexture", "iui>n", 2) \
  X(HostGlActiveTexture, "host.glActiveTexture", "iu>n", 2) X(HostGlTexParameteri, "host.glTexParameteri", "iuui>n", 2) X(HostGlTexParameterf, "host.glTexParameterf", "iuud>n", 2) \
  X(HostGlGetTexParameter, "host.glGetTexParameter", "iuu>n", 2) X(HostGlTexImage2D, "host.glTexImage2D", "iuiuiiiuuDi>n", 2) X(HostGlTexSubImage2D, "host.glTexSubImage2D", "iuiiiiiuuDi>n", 2) \
  X(HostGlTexImage3D, "host.glTexImage3D", "iuiuiiiiuuDi>n", 2) X(HostGlTexSubImage3D, "host.glTexSubImage3D", "iuiiiiiiiuuDi>n", 2) X(HostGlTexStorage2D, "host.glTexStorage2D", "iuiuii>n", 2) \
  X(HostGlTexStorage3D, "host.glTexStorage3D", "iuiuiii>n", 2) X(HostGlCopyTexImage2D, "host.glCopyTexImage2D", "iuiuiiiii>n", 2) X(HostGlCopyTexSubImage2D, "host.glCopyTexSubImage2D", "iuiiiiiii>n", 2) \
  X(HostGlCopyTexSubImage3D, "host.glCopyTexSubImage3D", "iuiiiiiiii>n", 2) X(HostGlCompressedTexImage2D, "host.glCompressedTexImage2D", "iuiuiiiDi>n", 2) X(HostGlCompressedTexSubImage2D, "host.glCompressedTexSubImage2D", "iuiiiiiuDi>n", 2) \
  X(HostGlCompressedTexImage3D, "host.glCompressedTexImage3D", "iuiuiiiiDi>n", 2) X(HostGlCompressedTexSubImage3D, "host.glCompressedTexSubImage3D", "iuiiiiiiiuDi>n", 2) X(HostGlGenerateMipmap, "host.glGenerateMipmap", "iu>n", 2) \
  X(HostGlCreateSampler, "host.glCreateSampler", "i>i", 2) X(HostGlDeleteSampler, "host.glDeleteSampler", "ii>n", 2) X(HostGlIsSampler, "host.glIsSampler", "ii>b", 2) \
  X(HostGlBindSampler, "host.glBindSampler", "iui>n", 2) X(HostGlSamplerParameteri, "host.glSamplerParameteri", "iiui>n", 2) X(HostGlSamplerParameterf, "host.glSamplerParameterf", "iiud>n", 2) \
  X(HostGlGetSamplerParameter, "host.glGetSamplerParameter", "iiu>n", 2) X(HostGlCreateFramebuffer, "host.glCreateFramebuffer", "i>i", 2) X(HostGlDeleteFramebuffer, "host.glDeleteFramebuffer", "ii>n", 2) \
  X(HostGlIsFramebuffer, "host.glIsFramebuffer", "ii>b", 2) X(HostGlBindFramebuffer, "host.glBindFramebuffer", "iui>n", 2) X(HostGlFramebufferTexture2D, "host.glFramebufferTexture2D", "iuuuii>n", 2) \
  X(HostGlFramebufferTextureLayer, "host.glFramebufferTextureLayer", "iuuiii>n", 2) X(HostGlFramebufferRenderbuffer, "host.glFramebufferRenderbuffer", "iuuui>n", 2) X(HostGlCheckFramebufferStatus, "host.glCheckFramebufferStatus", "iu>i", 2) \
  X(HostGlGetFramebufferAttachmentParameter, "host.glGetFramebufferAttachmentParameter", "iuuu>n", 2) X(HostGlCreateRenderbuffer, "host.glCreateRenderbuffer", "i>i", 2) X(HostGlDeleteRenderbuffer, "host.glDeleteRenderbuffer", "ii>n", 2) \
  X(HostGlIsRenderbuffer, "host.glIsRenderbuffer", "ii>b", 2) X(HostGlBindRenderbuffer, "host.glBindRenderbuffer", "iui>n", 2) X(HostGlRenderbufferStorage, "host.glRenderbufferStorage", "iuuii>n", 2) \
  X(HostGlRenderbufferStorageMultisample, "host.glRenderbufferStorageMultisample", "iuiuii>n", 2) X(HostGlGetRenderbufferParameter, "host.glGetRenderbufferParameter", "iuu>n", 2) X(HostGlBlitFramebuffer, "host.glBlitFramebuffer", "iiiiiiiiiuu>n", 2) \
  X(HostGlInvalidateFramebuffer, "host.glInvalidateFramebuffer", "iuD>n", 2) X(HostGlInvalidateSubFramebuffer, "host.glInvalidateSubFramebuffer", "iuDiiii>n", 2) X(HostGlClearBufferfv, "host.glClearBufferfv", "iuiD>n", 2) \
  X(HostGlClearBufferiv, "host.glClearBufferiv", "iuiD>n", 2) X(HostGlClearBufferuiv, "host.glClearBufferuiv", "iuiD>n", 2) X(HostGlClearBufferfi, "host.glClearBufferfi", "iuidi>n", 2) \
  X(HostGlGetInternalformatParameter, "host.glGetInternalformatParameter", "iuuu>n", 2) X(HostGlReadPixels, "host.glReadPixels", "iiiiiuuDi>n", 2) X(HostGlCreateQuery, "host.glCreateQuery", "i>i", 2) \
  X(HostGlDeleteQuery, "host.glDeleteQuery", "ii>n", 2) X(HostGlIsQuery, "host.glIsQuery", "ii>b", 2) X(HostGlBeginQuery, "host.glBeginQuery", "iui>n", 2) \
  X(HostGlEndQuery, "host.glEndQuery", "iu>n", 2) X(HostGlGetQuery, "host.glGetQuery", "iuu>n", 2) X(HostGlGetQueryParameter, "host.glGetQueryParameter", "iiu>n", 2) \
  X(HostGlFenceSync, "host.glFenceSync", "iuu>i", 2) X(HostGlIsSync, "host.glIsSync", "ii>b", 2) X(HostGlDeleteSync, "host.glDeleteSync", "ii>n", 2) \
  X(HostGlClientWaitSync, "host.glClientWaitSync", "iiud>i", 2) X(HostGlWaitSync, "host.glWaitSync", "iiud>n", 2) X(HostGlGetSyncParameter, "host.glGetSyncParameter", "iiu>n", 2) \
  X(HostGlCreateTransformFeedback, "host.glCreateTransformFeedback", "i>i", 2) X(HostGlDeleteTransformFeedback, "host.glDeleteTransformFeedback", "ii>n", 2) X(HostGlIsTransformFeedback, "host.glIsTransformFeedback", "ii>b", 2) \
  X(HostGlBindTransformFeedback, "host.glBindTransformFeedback", "iui>n", 2) X(HostGlBeginTransformFeedback, "host.glBeginTransformFeedback", "iu>n", 2) X(HostGlEndTransformFeedback, "host.glEndTransformFeedback", "i>n", 2) \
  X(HostGlPauseTransformFeedback, "host.glPauseTransformFeedback", "i>n", 2) X(HostGlResumeTransformFeedback, "host.glResumeTransformFeedback", "i>n", 2) X(HostGlTransformFeedbackVaryings, "host.glTransformFeedbackVaryings", "iisu>n", 2) \
  X(HostGlGetTransformFeedbackVarying, "host.glGetTransformFeedbackVarying", "iiu>n", 2) X(HostGlEnableiOES, "host.glEnableiOES", "iuu>n", 2) X(HostGlDisableiOES, "host.glDisableiOES", "iuu>n", 2) \
  X(HostGlIsEnablediOES, "host.glIsEnablediOES", "iuu>b", 2) X(HostGlBlendEquationiOES, "host.glBlendEquationiOES", "iuu>n", 2) X(HostGlBlendEquationSeparateiOES, "host.glBlendEquationSeparateiOES", "iuuu>n", 2) \
  X(HostGlBlendFunciOES, "host.glBlendFunciOES", "iuuu>n", 2) X(HostGlBlendFuncSeparateiOES, "host.glBlendFuncSeparateiOES", "iuuuuu>n", 2) X(HostGlColorMaskiOES, "host.glColorMaskiOES", "iubbbb>n", 2) \
  X(HostGlLoseContext, "host.glLoseContext", "i>n", 2) X(HostGlRestoreContext, "host.glRestoreContext", "i>n", 2) X(HostGlPresent, "host.glPresent", "ii>n", 2) \
  X(HostGlDestroy, "host.glDestroy", "i>n", 2) X(HostGlParamKind, "host.glParamKind", "i>i", 2) X(HostGlParamCount, "host.glParamCount", "i>i", 2) \
  X(HostGlParamNumber, "host.glParamNumber", "ii>d", 2) X(HostGlParamText, "host.glParamText", "i>s", 2) X(HostGlParamObject, "host.glParamObject", "i>i", 2) \
  X(HostGlParamObjectKind, "host.glParamObjectKind", "i>i", 2) X(HostGlActiveInfo, "host.glActiveInfo", "i>s", 2) \
  /* end of the zinc:gl rows */ \
  /* the network log (ZN-370, src/host/netlog.h) for zinc:devtools: op 0 start (arg = the inspector's port), 1 the queued Network events, 2 a response body, 3 a request body (arg = the id); appended */ \
  X(HostNetLog, "host.netLog", "is>s", 2) \
  /* zinc:gfx setTransform / resetTransform (ZN-263.01): a 2D matrix for the commands that follow; graphics rows, appended */ \
  X(HostGfxSetTransform, "host.gfxSetTransform", "dddddd>n", 2) X(HostGfxResetTransform, "host.gfxResetTransform", ">n", 2) \
  /* zinc:gfx sprites (ZN-432): a source rectangle of an image on a destination rectangle (alpha; flags 1 mirror x, 2 mirror y, 4 nearest), and a runtime image decoded from the bytes of a PNG or JPEG file (-1: not an image); graphics rows, appended */ \
  X(HostGfxDrawImageRect, "host.gfxDrawImageRect", "iddddddddii>n", 2) X(HostGfxImageFromBytes, "host.gfxImageFromBytes", "B>i", 2) \
  /* zinc:gfx windows beside the main one (ZN-663): open (title, logical size; the id, -1 when it cannot), close, whether one is open (0: the main window), */ \
  /* and the frame of a window between begin and end; graphics rows, appended */ \
  X(HostGfxOpenWindow, "host.gfxOpenWindow", "sii>i", 2) X(HostGfxCloseWindow, "host.gfxCloseWindow", "i>n", 2) X(HostGfxWindowOpen, "host.gfxWindowOpen", "i>i", 2) \
  X(HostGfxBeginWindow, "host.gfxBeginWindow", "i>n", 2) X(HostGfxEndWindow, "host.gfxEndWindow", ">n", 2) \
  /* zinc:gfx loadFont (ZN-669): a TrueType file named at run time (a baked family or a file of the assets) at exactly px pixels; graphics row, appended */ \
  X(HostGfxLoadFont, "host.gfxLoadFont", "sd>i", 2) \
  /* zinc:sys launchDir and locale (ZN-687): the directory the user ran the program from (zinc run starts it in the project), and the system's */ \
  /* preferred language as a BCP 47 tag (LC_ALL, LC_MESSAGES, LANG first); system rows, appended */ \
  X(HostSysLaunchDir, "host.sysLaunchDir", ">s", 2) X(HostSysLocale, "host.sysLocale", ">s", 2)

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
inline constexpr bool isLayoutRow(Rt r) { return r >= Rt::HostLayoutNew && r <= Rt::HostLayoutCounter; }
inline constexpr bool isGlRow(Rt r) { return r >= Rt::HostGlCreate && r <= Rt::HostGlActiveInfo; }   // zinc:gl (ZN-562): served by `hostGl`
// The zinc:gfx rows appended after the host block (the block's ids are the device cores'): served by `hostGfx` like the block's own. One list for isSysRow and for the engines that install the host rows.
inline constexpr bool isGfxTailRow(Rt r) {
  return r == Rt::HostGfxCommands || r == Rt::HostGfxCommandsFree || r == Rt::HostGfxSetResize || r == Rt::HostGfxSetTransform || r == Rt::HostGfxResetTransform || r == Rt::HostGfxDrawImageRect || r == Rt::HostGfxImageFromBytes ||
         (r >= Rt::HostGfxOpenWindow && r <= Rt::HostGfxEndWindow) || r == Rt::HostGfxLoadFont;
}
// The system rows appended after the gfx ones: the engines that install the host rows (QuickJS) add them too.
inline constexpr bool isSysTailRow(Rt r) { return r == Rt::HostSysLaunchDir || r == Rt::HostSysLocale; }
inline constexpr bool isSysRow(Rt r) { return (r >= Rt::HostSysFirst && r <= Rt::HostHostLast && !(r >= Rt::HostGfxCreateImage && r <= Rt::HostGfxEndImage)) || (r >= Rt::HostLoopWait && !isGfxTailRow(r) && !isLayoutRow(r) && !isGlRow(r)); }
inline const RtInfo& rtInfo(Rt r) { return kRtInfo[static_cast<unsigned>(r)]; }
// The host calls decode a row's arguments into arrays of this size (src/rt/rtcalls.cpp hostRt, src/qjs/qjs.cpp hostFn): no row has more parameters.
inline constexpr unsigned kMaxHostParams = 16;
constexpr bool rowsFitHostCalls() {
  for (const RtInfo& r : kRtInfo) { unsigned n = 0; while (r.sig[n] && r.sig[n] != '>') ++n; if (n > kMaxHostParams) return false; }
  return true;
}
static_assert(rowsFitHostCalls(), "a row has more parameters than the host calls decode (kMaxHostParams)");
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
// Rows that may drop a reference the program holds or run its code (a comparator, a toString, the event loop): a value a load lends is
// retained across them (ZN-413). The others only read their arguments: the string rows, the read-only Array, Map and Set members, the
// graphics host (numbers, borrowed strings and arrays, no callbacks).
inline bool rtMayRelease(Rt id) {
  if ((id >= Rt::HostGfxFrames && id < Rt::HostSysFirst) || isGlRow(id) || id == Rt::HostGfxDrawImageRect || id == Rt::HostGfxImageFromBytes || (id >= Rt::HostGfxOpenWindow && id <= Rt::HostGfxEndWindow) || id == Rt::HostGfxLoadFont) return false;
  if (id >= Rt::StrConcat && id <= Rt::FromCharCode) return id == Rt::JsonParse || id == Rt::DynGetFast || id == Rt::DynAddFast;
  switch (id) {
    case Rt::ArrSlice: case Rt::ArrIndexOf: case Rt::ArrIncludes: case Rt::MapGet: case Rt::MapHas: case Rt::MapKeys: case Rt::MapValues: case Rt::MapSize:
    case Rt::SetHas: case Rt::SetValues: case Rt::SetSize: return false;
    default: return true;
  }
}

}  // namespace zn
