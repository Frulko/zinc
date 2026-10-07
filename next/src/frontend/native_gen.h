#pragma once
// `zinc native-gen <x.spec.ts>` (ZN-098): the C++ interface of a native module, written from its Spec exactly as the prototype's compiler/src/native.ts did,
// so the plugins' x.host.cpp compile unchanged; and a C variant (the export table of include/zn/native.h) for new code.
#include <string>

#include "frontend/ast.h"

namespace zn::frontend {

// The letter of the native ABI for a type of a spec (include/zn/native_sig.h): "i" "u" "b" "d" "s" "B" "I" "D" "S", "n" for void or none, "c(<params>>r)" for a function type
// (scalars, strings and arrays in, a scalar or string result), "P<l>" for Promise<T> when `result`; "" when the type is not expressible.
std::string nativeLetter(const Ast& a, const std::string& text, std::uint32_t ty, bool result);

struct NativeGen {
  std::string name;        // 'Sensor' in requireNative<Spec>('Sensor')
  std::string cppHeader;   // zinc_native_<name lower>.h
  std::string cHeader;     // zinc_native_<name lower>_abi.h, empty when a member is not expressible in the C ABI
  std::string cNote;       // why cHeader is empty
  std::string thunk;       // zinc_native_<name lower>_thunk.cpp: a ZnModule over the NativeX of the header (src/native/zrt_compat.h), for the plugins' x.host.cpp
  std::string thunkNote;   // why thunk is empty
};

// `specFile` is only used in the comment of the header. False with `err` when the text is not a native spec or uses a type the generator cannot write.
bool generateNative(const std::string& specFile, const std::string& text, NativeGen& out, std::string& err);

}  // namespace zn::frontend
