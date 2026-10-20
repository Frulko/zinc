#include "crypto.h"

#ifdef ZN_NO_TLS
namespace zn::crypto {
std::string run(const std::string&, const std::string&, const std::string&, const std::string&, const std::string&, int, int, std::string& err) { err = "this build has no crypto (ZN_TLS=OFF)"; return std::string(); }
}  // namespace zn::crypto
#else

#include <psa/crypto.h>

#include <cstring>
#include <vector>

namespace zn::crypto {
namespace {

bool ready() {
  static bool ok = psa_crypto_init() == PSA_SUCCESS;
  return ok;
}
const uint8_t* bytes(const std::string& s) { return reinterpret_cast<const uint8_t*>(s.data()); }
std::string fail(std::string& err, const char* what, psa_status_t st) { err = std::string(what) + " (" + std::to_string(static_cast<int>(st)) + ")"; return std::string(); }

psa_algorithm_t hashOf(const std::string& name) {
  if (name == "sha-1") return PSA_ALG_SHA_1;
  if (name == "sha-256") return PSA_ALG_SHA_256;
  if (name == "sha-384") return PSA_ALG_SHA_384;
  if (name == "sha-512") return PSA_ALG_SHA_512;
  return PSA_ALG_NONE;
}

// A key imported for one operation; destroyed with the scope.
struct Key {
  mbedtls_svc_key_id_t id = MBEDTLS_SVC_KEY_ID_INIT;
  psa_status_t st = PSA_ERROR_GENERIC_ERROR;
  Key(psa_key_type_t type, psa_key_usage_t usage, psa_algorithm_t alg, const std::string& data) {
    psa_key_attributes_t at = PSA_KEY_ATTRIBUTES_INIT;
    psa_set_key_type(&at, type);
    psa_set_key_usage_flags(&at, usage);
    psa_set_key_algorithm(&at, alg);
    st = psa_import_key(&at, bytes(data), data.size(), &id);
    psa_reset_key_attributes(&at);
  }
  ~Key() { if (st == PSA_SUCCESS) psa_destroy_key(id); }
};

std::string split(const std::string& op, std::string& head) {   // "hmac:sha-256" into "hmac" and "sha-256"
  size_t c = op.find(':');
  head = c == std::string::npos ? op : op.substr(0, c);
  return c == std::string::npos ? std::string() : op.substr(c + 1);
}

std::string derive(psa_algorithm_t alg, std::vector<std::pair<psa_key_derivation_step_t, const std::string*>> inputs, psa_key_derivation_step_t secretStep, const std::string& secret, psa_key_type_t secretType,
                   uint32_t cost, size_t length, std::string& err) {
  Key k(secretType, PSA_KEY_USAGE_DERIVE, alg, secret);
  if (k.st != PSA_SUCCESS) return fail(err, "derive: key", k.st);
  psa_key_derivation_operation_t op = PSA_KEY_DERIVATION_OPERATION_INIT;
  psa_status_t st = psa_key_derivation_setup(&op, alg);
  if (st == PSA_SUCCESS) st = psa_key_derivation_set_capacity(&op, length);
  if (st == PSA_SUCCESS && cost) st = psa_key_derivation_input_integer(&op, PSA_KEY_DERIVATION_INPUT_COST, cost);
  for (auto& [step, data] : inputs) if (st == PSA_SUCCESS) st = psa_key_derivation_input_bytes(&op, step, bytes(*data), data->size());
  if (st == PSA_SUCCESS) st = psa_key_derivation_input_key(&op, secretStep, k.id);
  std::string out(length, '\0');
  if (st == PSA_SUCCESS) st = psa_key_derivation_output_bytes(&op, reinterpret_cast<uint8_t*>(out.data()), length);
  psa_key_derivation_abort(&op);
  if (st != PSA_SUCCESS) return fail(err, "derive", st);
  return out;
}

std::string cipher(psa_algorithm_t alg, bool encrypt, const std::string& key, const std::string& iv, const std::string& data, std::string& err) {
  Key k(PSA_KEY_TYPE_AES, encrypt ? PSA_KEY_USAGE_ENCRYPT : PSA_KEY_USAGE_DECRYPT, alg, key);
  if (k.st != PSA_SUCCESS) return fail(err, "cipher: key", k.st);
  psa_cipher_operation_t op = PSA_CIPHER_OPERATION_INIT;
  psa_status_t st = encrypt ? psa_cipher_encrypt_setup(&op, k.id, alg) : psa_cipher_decrypt_setup(&op, k.id, alg);
  if (st == PSA_SUCCESS) st = psa_cipher_set_iv(&op, bytes(iv), iv.size());
  std::string out(data.size() + 32, '\0');
  size_t n1 = 0, n2 = 0;
  if (st == PSA_SUCCESS) st = psa_cipher_update(&op, bytes(data), data.size(), reinterpret_cast<uint8_t*>(out.data()), out.size(), &n1);
  if (st == PSA_SUCCESS) st = psa_cipher_finish(&op, reinterpret_cast<uint8_t*>(out.data()) + n1, out.size() - n1, &n2);
  psa_cipher_abort(&op);
  if (st != PSA_SUCCESS) return fail(err, "cipher", st);
  out.resize(n1 + n2);
  return out;
}

}  // namespace

std::string run(const std::string& op, const std::string& a, const std::string& b, const std::string& c, const std::string& d, int n, int m, std::string& err) {
  err.clear();
  if (!ready()) return fail(err, "crypto: PSA did not start", PSA_ERROR_BAD_STATE);
  std::string head;
  std::string arg = split(op, head);
  psa_status_t st = PSA_SUCCESS;
  if (head == "digest") {
    psa_algorithm_t h = hashOf(arg);
    if (h == PSA_ALG_NONE) { err = "unsupported hash"; return std::string(); }
    std::string out(PSA_HASH_MAX_SIZE, '\0');
    size_t len = 0;
    st = psa_hash_compute(h, bytes(a), a.size(), reinterpret_cast<uint8_t*>(out.data()), out.size(), &len);
    if (st != PSA_SUCCESS) return fail(err, "digest", st);
    out.resize(len);
    return out;
  }
  if (head == "hmac") {
    psa_algorithm_t h = hashOf(arg);
    if (h == PSA_ALG_NONE) { err = "unsupported hash"; return std::string(); }
    Key k(PSA_KEY_TYPE_HMAC, PSA_KEY_USAGE_SIGN_MESSAGE, PSA_ALG_HMAC(h), a);
    if (k.st != PSA_SUCCESS) return fail(err, "hmac: key", k.st);
    std::string out(PSA_MAC_MAX_SIZE, '\0');
    size_t len = 0;
    st = psa_mac_compute(k.id, PSA_ALG_HMAC(h), bytes(b), b.size(), reinterpret_cast<uint8_t*>(out.data()), out.size(), &len);
    if (st != PSA_SUCCESS) return fail(err, "hmac", st);
    out.resize(len);
    return out;
  }
  if (head == "pbkdf2") {   // a = password, b = salt, n = iterations, m = bytes
    psa_algorithm_t h = hashOf(arg);
    if (h == PSA_ALG_NONE) { err = "unsupported hash"; return std::string(); }
    return derive(PSA_ALG_PBKDF2_HMAC(h), {{PSA_KEY_DERIVATION_INPUT_SALT, &b}}, PSA_KEY_DERIVATION_INPUT_PASSWORD, a, PSA_KEY_TYPE_PASSWORD, static_cast<uint32_t>(n), static_cast<size_t>(m), err);
  }
  if (head == "hkdf") {   // a = input key material, b = salt, c = info, m = bytes
    psa_algorithm_t h = hashOf(arg);
    if (h == PSA_ALG_NONE) { err = "unsupported hash"; return std::string(); }
    return derive(PSA_ALG_HKDF(h), {{PSA_KEY_DERIVATION_INPUT_SALT, &b}, {PSA_KEY_DERIVATION_INPUT_INFO, &c}}, PSA_KEY_DERIVATION_INPUT_SECRET, a, PSA_KEY_TYPE_DERIVE, 0, static_cast<size_t>(m), err);
  }
  if (head == "aes-gcm-encrypt" || head == "aes-gcm-decrypt") {   // a = key, b = iv, c = data (the ciphertext ends with the tag), d = additional data, n = tag bytes
    bool enc = head == "aes-gcm-encrypt";
    psa_algorithm_t alg = PSA_ALG_AEAD_WITH_SHORTENED_TAG(PSA_ALG_GCM, static_cast<size_t>(n));
    Key k(PSA_KEY_TYPE_AES, enc ? PSA_KEY_USAGE_ENCRYPT : PSA_KEY_USAGE_DECRYPT, alg, a);
    if (k.st != PSA_SUCCESS) return fail(err, "aes-gcm: key", k.st);
    std::string out(c.size() + 32, '\0');
    size_t len = 0;
    st = enc ? psa_aead_encrypt(k.id, alg, bytes(b), b.size(), bytes(d), d.size(), bytes(c), c.size(), reinterpret_cast<uint8_t*>(out.data()), out.size(), &len)
             : psa_aead_decrypt(k.id, alg, bytes(b), b.size(), bytes(d), d.size(), bytes(c), c.size(), reinterpret_cast<uint8_t*>(out.data()), out.size(), &len);
    if (st != PSA_SUCCESS) return fail(err, "aes-gcm", st);
    out.resize(len);
    return out;
  }
  if (head == "aes-cbc-encrypt" || head == "aes-cbc-decrypt") return cipher(PSA_ALG_CBC_PKCS7, head == "aes-cbc-encrypt", a, b, c, err);   // a = key, b = iv, c = data
  if (head == "aes-ctr") return cipher(PSA_ALG_CTR, true, a, b, c, err);                                                                        // a = key, b = counter block, c = data
  if (head == "ec-generate") {   // the private scalar (32 bytes) then the public point (65 bytes, uncompressed)
    psa_key_attributes_t at = PSA_KEY_ATTRIBUTES_INIT;
    psa_set_key_type(&at, PSA_KEY_TYPE_ECC_KEY_PAIR(PSA_ECC_FAMILY_SECP_R1));
    psa_set_key_bits(&at, 256);
    psa_set_key_usage_flags(&at, PSA_KEY_USAGE_EXPORT);
    psa_set_key_algorithm(&at, PSA_ALG_ECDSA(PSA_ALG_SHA_256));
    mbedtls_svc_key_id_t id = MBEDTLS_SVC_KEY_ID_INIT;
    st = psa_generate_key(&at, &id);
    psa_reset_key_attributes(&at);
    if (st != PSA_SUCCESS) return fail(err, "ec-generate", st);
    std::string out(32 + 65, '\0');
    size_t l1 = 0, l2 = 0;
    st = psa_export_key(id, reinterpret_cast<uint8_t*>(out.data()), 32, &l1);
    if (st == PSA_SUCCESS) st = psa_export_public_key(id, reinterpret_cast<uint8_t*>(out.data()) + 32, 65, &l2);
    psa_destroy_key(id);
    if (st != PSA_SUCCESS || l1 != 32 || l2 != 65) return fail(err, "ec-generate: export", st);
    return out;
  }
  if (head == "ec-public") {   // a = private scalar
    Key k(PSA_KEY_TYPE_ECC_KEY_PAIR(PSA_ECC_FAMILY_SECP_R1), PSA_KEY_USAGE_EXPORT, PSA_ALG_ECDSA(PSA_ALG_SHA_256), a);
    if (k.st != PSA_SUCCESS) return fail(err, "ec-public: key", k.st);
    std::string out(65, '\0');
    size_t len = 0;
    st = psa_export_public_key(k.id, reinterpret_cast<uint8_t*>(out.data()), out.size(), &len);
    if (st != PSA_SUCCESS) return fail(err, "ec-public", st);
    return out;
  }
  if (head == "ecdsa-sign") {   // a = private scalar, b = message; the signature is r || s
    psa_algorithm_t h = hashOf(arg);
    if (h == PSA_ALG_NONE) { err = "unsupported hash"; return std::string(); }
    Key k(PSA_KEY_TYPE_ECC_KEY_PAIR(PSA_ECC_FAMILY_SECP_R1), PSA_KEY_USAGE_SIGN_MESSAGE, PSA_ALG_ECDSA(h), a);
    if (k.st != PSA_SUCCESS) return fail(err, "ecdsa: key", k.st);
    std::string out(PSA_SIGNATURE_MAX_SIZE, '\0');
    size_t len = 0;
    st = psa_sign_message(k.id, PSA_ALG_ECDSA(h), bytes(b), b.size(), reinterpret_cast<uint8_t*>(out.data()), out.size(), &len);
    if (st != PSA_SUCCESS) return fail(err, "ecdsa-sign", st);
    out.resize(len);
    return out;
  }
  if (head == "ecdsa-verify") {   // a = public point, b = message, c = signature; "1" or "0"
    psa_algorithm_t h = hashOf(arg);
    if (h == PSA_ALG_NONE) { err = "unsupported hash"; return std::string(); }
    Key k(PSA_KEY_TYPE_ECC_PUBLIC_KEY(PSA_ECC_FAMILY_SECP_R1), PSA_KEY_USAGE_VERIFY_MESSAGE, PSA_ALG_ECDSA(h), a);
    if (k.st != PSA_SUCCESS) return fail(err, "ecdsa: key", k.st);
    st = psa_verify_message(k.id, PSA_ALG_ECDSA(h), bytes(b), b.size(), bytes(c), c.size());
    return st == PSA_SUCCESS ? "1" : "0";
  }
  if (head == "ecdh") {   // a = private scalar, b = the peer's public point; the shared x coordinate
    Key k(PSA_KEY_TYPE_ECC_KEY_PAIR(PSA_ECC_FAMILY_SECP_R1), PSA_KEY_USAGE_DERIVE, PSA_ALG_ECDH, a);
    if (k.st != PSA_SUCCESS) return fail(err, "ecdh: key", k.st);
    std::string out(32, '\0');
    size_t len = 0;
    st = psa_raw_key_agreement(PSA_ALG_ECDH, k.id, bytes(b), b.size(), reinterpret_cast<uint8_t*>(out.data()), out.size(), &len);
    if (st != PSA_SUCCESS) return fail(err, "ecdh", st);
    out.resize(len);
    return out;
  }
  if (head == "random") {
    std::string out(static_cast<size_t>(n), '\0');
    st = psa_generate_random(reinterpret_cast<uint8_t*>(out.data()), out.size());
    if (st != PSA_SUCCESS) return fail(err, "random", st);
    return out;
  }
  err = "unknown operation " + op;
  return std::string();
}

}  // namespace zn::crypto

#endif  // ZN_NO_TLS
