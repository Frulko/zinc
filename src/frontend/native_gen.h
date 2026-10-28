#pragma once
// `zinc native-gen <x.spec.ts>` (ZN-098): the C++ interface of a native module, written from its Spec exactly as the prototype's compiler/src/native.ts did,
// so the plugins' x.host.cpp compile unchanged; and a C variant (the export table of include/zn/native.h) for new code.
#include <string>

#include "frontend/ast.h"

namespace zn::frontend {

// The letter of the native ABI for a type of a spec (include/zn/native_sig.h): "i" "u" "b" "d" "s" "B" "I" "D" "S", "n" for void or none, "c(<params>>r)" for a function type
// (scalars, strings and arrays in, a scalar or string result), "P<l>" for Promise<T> when `result`; "" when the type is not expressible.
std::string nativeLetter(const Ast& a, const std::string& text, std::uint32_t ty, bool result, bool dyn = false);
// With `dyn` (the spec lowering of the program, not the thunk generator) `unknown` and `unknown[]` are carried as JSON text (letter "s") and DynFunction as c(s>s): the generated
// wrapper converts with __nativeJson, __nativeValue and __nativeArgs of the Dyn prelude.

// Records (ZN-850, include/zn/rec.h): the schema text of a spec type that holds an interface of the file (`Track`, `Track[]`, `Track | null`), which then
// crosses as bytes on the "B" letter; "" when the type holds no record. "" with `err` when a record holds a type the wire has no form for.
std::string recordSchema(const Ast& a, const std::string& text, std::uint32_t ty, std::string& err);
// The JavaScript engines (src/qjs): `requireNative<Spec>('X')` of a spec file with records becomes `requireNative<Spec>('X', { member: ['<schema of each
// parameter>', ..., '<schema of the result>'] })` ('' for a value that is not a record), so 'zinc:native' encodes and decodes those members.
std::string recordSchemasForJs(const std::string& text);

struct NativeGen {
  std::string name;        // 'Sensor' in requireNative<Spec>('Sensor')
  std::string cppHeader;   // zinc_native_<name lower>.h
  std::string cHeader;     // zinc_native_<name lower>_abi.h, empty when a member is not expressible in the C ABI
  std::string cNote;       // why cHeader is empty
  std::string thunk;       // zinc_native_<name lower>_thunk.cpp: a ZnModule over the NativeX of the header (src/native/zrt_compat.h), for the plugins' x.host.cpp
  std::string thunkNote;   // why thunk is empty
  // zinc native-gen --android / --ios (ZN-628, docs/plugins.md "Phones"): the spec as a Java interface and an Objective-C protocol (and the same protocol
  // in Swift), and the C++ NativeX over them (JNI; Objective-C++), so a plugin's phone code is Java or Kotlin and Objective-C or Swift. The class that
  // implements them is named by plugin.json targets.<android|ios>.class, compiled in as ZN_NATIVE_CLASS. Empty with mobileNote when a member uses a
  // type they do not carry (scalars, strings, callbacks returning void).
  std::string javaPackage, javaName, java, jniBridge;   // dev.zinc.plugins.<lower>, <Name>Spec, <Name>Spec.java, zinc_native_<lower>_android.cpp
  std::string objcName, objcHeader, swiftProtocol, objcBridge;   // Zinc<Name>Spec, its .h and .swift, zinc_native_<lower>_ios.mm
  std::string mobileNote;
};

// `specFile` is only used in the comment of the header. False with `err` when the text is not a native spec or uses a type the generator cannot write.
bool generateNative(const std::string& specFile, const std::string& text, NativeGen& out, std::string& err);

}  // namespace zn::frontend
