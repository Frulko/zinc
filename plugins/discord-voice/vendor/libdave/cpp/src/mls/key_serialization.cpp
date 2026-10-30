#include <dave/key_serialization.h>

#include <mls/crypto.h>

#include "mls/parameters.h"

namespace discord {
namespace dave {
namespace mls {

std::string SigningKeyToJwk(const ::mlspp::SignaturePrivateKey& key,
                            ProtocolVersion version) noexcept
try {
    auto suite = CiphersuiteForProtocolVersion(version);

    return key.to_jwk(suite);
}
catch (std::exception&) {
    return {};
}

std::shared_ptr<::mlspp::SignaturePrivateKey> SigningKeyFromJwk(const std::string& jwk,
                                                                ProtocolVersion version) noexcept
try {
    auto suite = CiphersuiteForProtocolVersion(version);

    return std::make_shared<::mlspp::SignaturePrivateKey>(
      ::mlspp::SignaturePrivateKey::from_jwk(suite, jwk));
}
catch (std::exception&) {
    return {};
}

} // namespace mls
} // namespace dave
} // namespace discord
