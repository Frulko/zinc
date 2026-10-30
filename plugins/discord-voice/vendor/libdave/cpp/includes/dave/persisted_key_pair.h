#pragma once

#include <string>
#include <vector>

#include <dave/dave_interfaces.h>

namespace discord {
namespace dave {
namespace mls {

struct KeyAndSelfSignature {
    std::vector<uint8_t> key;
    std::vector<uint8_t> signature;
};

KeyAndSelfSignature GetPersistedPublicKey(KeyPairContextType ctx,
                                          const std::string& sessionID,
                                          SignatureVersion version) noexcept;

} // namespace mls
} // namespace dave
} // namespace discord
