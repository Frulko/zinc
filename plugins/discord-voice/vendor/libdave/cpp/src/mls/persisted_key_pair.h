#pragma once

#include <memory>
#include <string>
#include <vector>

#ifdef __ANDROID__
#include <jni.h>
#endif

#include <dave/dave_interfaces.h>
#include <dave/persisted_key_pair.h>
#include <dave/version.h>

namespace mlspp {
struct SignaturePrivateKey;
};

namespace discord {
namespace dave {
namespace mls {

std::shared_ptr<::mlspp::SignaturePrivateKey> GetPersistedKeyPair(KeyPairContextType ctx,
                                                                  const std::string& sessionID,
                                                                  ProtocolVersion version);

bool DeletePersistedKeyPair(KeyPairContextType ctx,
                            const std::string& sessionID,
                            SignatureVersion version);

constexpr unsigned KeyVersion = 1;

} // namespace mls
} // namespace dave
} // namespace discord
