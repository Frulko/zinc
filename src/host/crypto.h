#pragma once
// The crypto behind crypto.subtle (ZN-089), on the PSA API of TF-PSA-Crypto (third_party/mbedtls). One entry point: an operation name and byte arguments in, the result
// bytes out (a failure sets `err`). Names: digest:<alg>, hmac:<alg>, pbkdf2:<alg>, hkdf:<alg>, aes-gcm-encrypt/decrypt, aes-cbc-encrypt/decrypt, aes-ctr,
// ec-generate, ec-public, ecdsa-sign:<alg>, ecdsa-verify:<alg>, ecdh, random,
// rsa-generate (n = bits; PKCS#1 private DER), rsa-public (PKCS#1 public DER), rsa-spki and rsa-spki-import (PKCS#1 <-> SubjectPublicKeyInfo), rsa-oaep-encrypt/decrypt:<alg>,
// ec-csr (a P-256 key and "name,name": a CSR DER), ec-key-pem (a P-256 key as PEM), x509-not-after (a PEM certificate's expiry, seconds),
// and without PSA ed25519-public, ed25519-sign, ed25519-verify (Monocypher, ed25519.cpp; a private key is its 32-byte seed). <alg> is sha-1, sha-256, sha-384 or sha-512.
#include <cstddef>
#include <string>

namespace zn::crypto {

std::string run(const std::string& op, const std::string& a, const std::string& b, const std::string& c, const std::string& d, int n, int m, std::string& err);
// The digest (<alg> as above, or md5) of what `read` gives, block by block until it returns 0: a file of any size without loading it whole.
// `read` fills at most `cap` bytes of `buf` and returns how many; a failure sets `err` and returns "".
std::string digestStream(const std::string& alg, std::size_t (*read)(void* ctx, unsigned char* buf, std::size_t cap), void* ctx, std::string& err);

}  // namespace zn::crypto
