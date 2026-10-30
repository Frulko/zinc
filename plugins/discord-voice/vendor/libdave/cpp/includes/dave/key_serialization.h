#pragma once

#include <memory>
#include <string>

#include <dave/version.h>

namespace mlspp {
struct SignaturePrivateKey;
} // namespace mlspp

namespace discord {
namespace dave {
namespace mls {

std::string SigningKeyToJwk(const ::mlspp::SignaturePrivateKey& key,
                            ProtocolVersion version) noexcept;
std::shared_ptr<::mlspp::SignaturePrivateKey> SigningKeyFromJwk(const std::string& jwk,
                                                                ProtocolVersion version) noexcept;

} // namespace mls
} // namespace dave
} // namespace discord
