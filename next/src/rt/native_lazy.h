#pragma once
// Native modules whose library loads at its first call (ZN-615): engine-internal, beside the frozen registry of include/zn/native.h.
#include <functional>
#include <string>
#include <utility>
#include <vector>

namespace zn::rt {

// Registers `name` with its exports (name, signature) known but no code: the checker and Machine::load see them as for a loaded module, and the
// first zn_native_call to the module runs `load`, which must register the real module (zn_register_module replaces this one). False when the
// name is already registered.
bool registerDeferredModule(const std::string& name, const std::vector<std::pair<std::string, std::string>>& exports,
                            std::function<bool(std::string& err)> load, std::string& err);

}  // namespace zn::rt
