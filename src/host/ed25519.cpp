// Ed25519 (RFC 8032) for crypto.subtle (zinc:subtle, ZN-842): the operations ed25519-public, ed25519-sign and ed25519-verify of crypto.h. The library is
// Monocypher 4.0.2, the copy zn_tc signs the update manifests with (third_party/monocypher), compiled here inside its own C++ namespace: the host does
// not depend on the toolchain manager, and the two copies never meet at link time. Works in a build without TLS (PSA is not used).
#define MONOCYPHER_CPP_NAMESPACE zn_monocypher
#include "../../third_party/monocypher/monocypher.c"
#include "../../third_party/monocypher/monocypher-ed25519.c"

#include <algorithm>
#include <string>

namespace zn::crypto {

// a = the 32-byte seed (ed25519-public, ed25519-sign) or public key (ed25519-verify), b = the message, c = the signature. Sets `handled` for these names.
std::string ed25519(const std::string& op, const std::string& a, const std::string& b, const std::string& c, bool& handled, std::string& err) {
  using namespace zn_monocypher;
  handled = op == "ed25519-public" || op == "ed25519-sign" || op == "ed25519-verify";
  if (!handled) return std::string();
  const auto* m = reinterpret_cast<const uint8_t*>(b.data());
  if (op == "ed25519-verify") {
    if (a.size() != 32) { err = "an Ed25519 public key is 32 bytes"; return std::string(); }
    if (c.size() != 64) return "0";
    return crypto_ed25519_check(reinterpret_cast<const uint8_t*>(c.data()), reinterpret_cast<const uint8_t*>(a.data()), m, b.size()) == 0 ? "1" : "0";
  }
  if (a.size() != 32) { err = "an Ed25519 private key is its 32-byte seed"; return std::string(); }
  uint8_t seed[32], sk[64], pk[32], sig[64];
  std::copy(a.begin(), a.end(), seed);   // crypto_ed25519_key_pair wipes the seed it is given
  crypto_ed25519_key_pair(sk, pk, seed);
  if (op == "ed25519-public") { crypto_wipe(sk, 64); return std::string(reinterpret_cast<char*>(pk), 32); }
  crypto_ed25519_sign(sig, sk, m, b.size());
  crypto_wipe(sk, 64);
  return std::string(reinterpret_cast<char*>(sig), 64);
}

}  // namespace zn::crypto
