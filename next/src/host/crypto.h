#pragma once
// The crypto behind crypto.subtle (ZN-089), on the PSA API of TF-PSA-Crypto (third_party/mbedtls). One entry point: an operation name and byte arguments in, the result
// bytes out (a failure sets `err`). Names: digest:<alg>, hmac:<alg>, pbkdf2:<alg>, hkdf:<alg>, aes-gcm-encrypt/decrypt, aes-cbc-encrypt/decrypt, aes-ctr,
// ec-generate, ec-public, ecdsa-sign:<alg>, ecdsa-verify:<alg>, ecdh, random. <alg> is sha-1, sha-256, sha-384 or sha-512.
#include <string>

namespace zn::crypto {

std::string run(const std::string& op, const std::string& a, const std::string& b, const std::string& c, const std::string& d, int n, int m, std::string& err);

}  // namespace zn::crypto
