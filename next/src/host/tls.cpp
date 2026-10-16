#include "tls.h"

#ifdef ZN_NO_TLS   // a build without mbedTLS (cmake -DZN_TLS=OFF): https, TLS brokers and crypto.subtle report that they are missing
namespace zn::tls {
Conn* openClient(const std::string&, std::string& err, bool) { err = "this build has no TLS (ZN_TLS=OFF)"; return nullptr; }
bool isTls13(Conn*) { return false; }
Conn* openServer(const std::string&, const std::string&, std::string& err) { err = "this build has no TLS (ZN_TLS=OFF)"; return nullptr; }
Conn* openPskClient(const std::string&, const std::string&, std::string& err) { err = "this build has no TLS (ZN_TLS=OFF)"; return nullptr; }
Conn* openPskServer(std::function<std::string(const std::string&)>, std::string& err) { err = "this build has no TLS (ZN_TLS=OFF)"; return nullptr; }
const std::string& pskIdentity(Conn*) { static const std::string e; return e; }
Conn* openPake(bool, const std::string&, std::string& err) { err = "this build has no TLS (ZN_TLS=OFF)"; return nullptr; }
std::string randomBytes(size_t) { return std::string(); }
void destroy(Conn*) {}
void feed(Conn*, const char*, size_t) {}
std::string takeOutput(Conn*) { return std::string(); }
State step(Conn*) { return State::Failed; }
bool write(Conn*, const std::string&) { return false; }
State read(Conn*, std::string&) { return State::Failed; }
void close(Conn*) {}
const std::string& error(Conn*) { static const std::string e = "this build has no TLS (ZN_TLS=OFF)"; return e; }
}  // namespace zn::tls
#else

#include <mbedtls/error.h>
#include <mbedtls/pk.h>
#include <mbedtls/ssl.h>
#include <mbedtls/x509_crt.h>
#include <psa/crypto.h>

#include <cstdio>
#include <string>
#ifdef __linux__
#include <unistd.h>
#endif
#include <cstdlib>
#include <cstring>
#include <memory>

namespace zn::tls {

struct Conn {
  mbedtls_ssl_context ssl;
  mbedtls_ssl_config conf;
  mbedtls_x509_crt own;
  mbedtls_pk_context key;
  std::string in, out, err;
  std::function<std::string(const std::string&)> pskLookup;
  std::string pskId;
  bool server = false, done = false, failed = false, closed = false;
};

namespace {

bool psaReady() {
  static bool ok = psa_crypto_init() == PSA_SUCCESS;
  return ok;
}

// The system root store, parsed once. ZINC_CA_FILE names a PEM bundle instead (tests, private CAs).
mbedtls_x509_crt* roots() {
  static mbedtls_x509_crt* store = [] {
    auto* c = new mbedtls_x509_crt;
    mbedtls_x509_crt_init(c);
    if (const char* f = std::getenv("ZINC_CA_FILE")) { mbedtls_x509_crt_parse_file(c, f); return c; }
#ifdef __ANDROID__
    // an app has no /etc/ssl and its executable is app_process: the system's store is a directory of PEM files, one per root, and the
    // roots the user added are beside it (unreadable to apps on some versions: then only the system's)
    if (mbedtls_x509_crt_parse_path(c, "/system/etc/security/cacerts") >= 0) { mbedtls_x509_crt_parse_path(c, "/data/misc/user/0/cacerts-added"); return c; }
#endif
#ifdef __linux__
    {  // a cacert.pem shipped beside the program replaces the store of a device that no longer updates its own (webOS 3 has one root, of 2011)
      char exe[4096];
      const ssize_t n = readlink("/proc/self/exe", exe, sizeof exe - 1);
      std::string dir(exe, n > 0 ? static_cast<size_t>(n) : 0);
      dir.erase(dir.find_last_of('/') == std::string::npos ? 0 : dir.find_last_of('/'));
      if (!dir.empty() && mbedtls_x509_crt_parse_file(c, (dir + "/cacert.pem").c_str()) >= 0) return c;
    }
#endif
    for (const char* f : {"/etc/ssl/cert.pem", "/etc/ssl/certs/ca-certificates.crt", "/etc/pki/tls/certs/ca-bundle.crt", "/etc/ssl/ca-bundle.pem", "/etc/ssl/certs/ca-bundle.crt"})
      if (mbedtls_x509_crt_parse_file(c, f) >= 0) break;
    return c;
  }();
  return store;
}

int sendCb(void* ctx, const unsigned char* buf, size_t n) { static_cast<Conn*>(ctx)->out.append(reinterpret_cast<const char*>(buf), n); return static_cast<int>(n); }
int recvCb(void* ctx, unsigned char* buf, size_t n) {
  auto* c = static_cast<Conn*>(ctx);
  if (c->in.empty()) return MBEDTLS_ERR_SSL_WANT_READ;
  size_t k = n < c->in.size() ? n : c->in.size();
  std::memcpy(buf, c->in.data(), k);
  c->in.erase(0, k);
  return static_cast<int>(k);
}

std::string describe(Conn* c, int rc) {
  if (!c->server) {
    uint32_t flags = mbedtls_ssl_get_verify_result(&c->ssl);
    if (flags != 0 && flags != 0xFFFFFFFFu) {
      if (flags & MBEDTLS_X509_BADCERT_EXPIRED) return "CERT_HAS_EXPIRED";
      if (flags & MBEDTLS_X509_BADCERT_CN_MISMATCH) return "ERR_TLS_CERT_ALTNAME_INVALID";
      if (flags & MBEDTLS_X509_BADCERT_NOT_TRUSTED) return "UNABLE_TO_VERIFY_LEAF_SIGNATURE";
      if (flags & MBEDTLS_X509_BADCERT_REVOKED) return "CERT_REVOKED";
      return "CERT_REJECTED";
    }
  }
  char buf[160];
  mbedtls_strerror(rc, buf, sizeof buf);
  return buf;
}

Conn* make(bool server, std::string& err) {
  if (!psaReady()) { err = "TLS: crypto did not start"; return nullptr; }
  auto* c = new Conn();
  c->server = server;
  mbedtls_ssl_init(&c->ssl);
  mbedtls_ssl_config_init(&c->conf);
  mbedtls_x509_crt_init(&c->own);
  mbedtls_pk_init(&c->key);
  int rc = mbedtls_ssl_config_defaults(&c->conf, server ? MBEDTLS_SSL_IS_SERVER : MBEDTLS_SSL_IS_CLIENT, MBEDTLS_SSL_TRANSPORT_STREAM, MBEDTLS_SSL_PRESET_DEFAULT);
  if (rc != 0) { err = describe(c, rc); destroy(c); return nullptr; }
  return c;
}

}  // namespace

Conn* openClient(const std::string& serverName, std::string& err, bool tls12) {
  Conn* c = make(false, err);
  if (!c) return nullptr;
  mbedtls_ssl_conf_authmode(&c->conf, MBEDTLS_SSL_VERIFY_REQUIRED);
  mbedtls_ssl_conf_ca_chain(&c->conf, roots(), nullptr);
  if (tls12) mbedtls_ssl_conf_max_tls_version(&c->conf, MBEDTLS_SSL_VERSION_TLS1_2);
  int rc = mbedtls_ssl_setup(&c->ssl, &c->conf);
  if (rc == 0) rc = mbedtls_ssl_set_hostname(&c->ssl, serverName.c_str());
  if (rc != 0) { err = describe(c, rc); destroy(c); return nullptr; }
  mbedtls_ssl_set_bio(&c->ssl, c, sendCb, recvCb, nullptr);
  return c;
}

Conn* openServer(const std::string& certPem, const std::string& keyPem, std::string& err) {
  Conn* c = make(true, err);
  if (!c) return nullptr;
  std::string cert = certPem + '\0', key = keyPem + '\0';   // PEM input counts its terminator
  int rc = mbedtls_x509_crt_parse(&c->own, reinterpret_cast<const unsigned char*>(cert.data()), cert.size());
  if (rc == 0) rc = mbedtls_pk_parse_key(&c->key, reinterpret_cast<const unsigned char*>(key.data()), key.size(), nullptr, 0);
  if (rc == 0) rc = mbedtls_ssl_conf_own_cert(&c->conf, &c->own, &c->key);
  if (rc == 0) rc = mbedtls_ssl_setup(&c->ssl, &c->conf);
  if (rc != 0) { err = "TLS: bad certificate or key (" + describe(c, rc) + ")"; destroy(c); return nullptr; }
  mbedtls_ssl_set_bio(&c->ssl, c, sendCb, recvCb, nullptr);
  return c;
}

namespace {

// The key of the identity the client presents; refusing it fails the handshake.
int pskCb(void* ctx, mbedtls_ssl_context* ssl, const unsigned char* id, size_t n) {
  auto* c = static_cast<Conn*>(ctx);
  const std::string identity(reinterpret_cast<const char*>(id), n);
  const std::string key = c->pskLookup(identity);
  if (key.empty()) return MBEDTLS_ERR_SSL_UNKNOWN_IDENTITY;
  c->pskId = identity;
  return mbedtls_ssl_set_hs_psk(ssl, reinterpret_cast<const unsigned char*>(key.data()), key.size());
}

Conn* finish(Conn* c, int rc, std::string& err) {
  if (rc == 0) rc = mbedtls_ssl_setup(&c->ssl, &c->conf);
  if (rc != 0) { err = describe(c, rc); destroy(c); return nullptr; }
  mbedtls_ssl_set_bio(&c->ssl, c, sendCb, recvCb, nullptr);
  return c;
}

void pskOnly(Conn* c) {
  mbedtls_ssl_conf_min_tls_version(&c->conf, MBEDTLS_SSL_VERSION_TLS1_3);
  mbedtls_ssl_conf_max_tls_version(&c->conf, MBEDTLS_SSL_VERSION_TLS1_3);
  mbedtls_ssl_conf_tls13_key_exchange_modes(&c->conf, MBEDTLS_SSL_TLS1_3_KEY_EXCHANGE_MODE_PSK_EPHEMERAL);
}

}  // namespace

Conn* openPskClient(const std::string& identity, const std::string& key, std::string& err) {
  Conn* c = make(false, err);
  if (!c) return nullptr;
  pskOnly(c);
  return finish(c, mbedtls_ssl_conf_psk(&c->conf, reinterpret_cast<const unsigned char*>(key.data()), key.size(),
                                        reinterpret_cast<const unsigned char*>(identity.data()), identity.size()), err);
}

Conn* openPskServer(std::function<std::string(const std::string&)> lookup, std::string& err) {
  Conn* c = make(true, err);
  if (!c) return nullptr;
  pskOnly(c);
  c->pskLookup = std::move(lookup);
  mbedtls_ssl_conf_psk_cb(&c->conf, pskCb, c);
  return finish(c, 0, err);
}

const std::string& pskIdentity(Conn* c) { return c->pskId; }

Conn* openPake(bool server, const std::string& password, std::string& err) {
  static const int suites[] = {MBEDTLS_TLS_ECJPAKE_WITH_AES_128_CCM_8, 0};
  Conn* c = make(server, err);
  if (!c) return nullptr;
  mbedtls_ssl_conf_min_tls_version(&c->conf, MBEDTLS_SSL_VERSION_TLS1_2);
  mbedtls_ssl_conf_max_tls_version(&c->conf, MBEDTLS_SSL_VERSION_TLS1_2);
  mbedtls_ssl_conf_ciphersuites(&c->conf, suites);
  c = finish(c, 0, err);
  if (!c) return nullptr;
  int rc = mbedtls_ssl_set_hs_ecjpake_password(&c->ssl, reinterpret_cast<const unsigned char*>(password.data()), password.size());
  if (rc != 0) { err = describe(c, rc); destroy(c); return nullptr; }
  return c;
}

std::string randomBytes(size_t n) {
  std::string s(n, '\0');
  if (!psaReady() || psa_generate_random(reinterpret_cast<unsigned char*>(s.data()), n) != PSA_SUCCESS) return std::string();
  return s;
}

void destroy(Conn* c) {
  if (!c) return;
  mbedtls_ssl_free(&c->ssl);
  mbedtls_ssl_config_free(&c->conf);
  mbedtls_x509_crt_free(&c->own);
  mbedtls_pk_free(&c->key);
  delete c;
}

void feed(Conn* c, const char* data, size_t n) { c->in.append(data, n); }
std::string takeOutput(Conn* c) { std::string s; s.swap(c->out); return s; }
const std::string& error(Conn* c) { return c->err; }

State step(Conn* c) {
  if (c->failed) return State::Failed;
  if (c->done) return State::Ready;
  int rc = mbedtls_ssl_handshake(&c->ssl);
  if (rc == 0) { c->done = true; return State::Ready; }
  if (rc == MBEDTLS_ERR_SSL_WANT_READ || rc == MBEDTLS_ERR_SSL_WANT_WRITE) return State::Handshaking;
  c->failed = true;
  c->err = describe(c, rc);
  return State::Failed;
}

bool write(Conn* c, const std::string& plain) {
  if (!c->done || c->failed) return false;
  size_t off = 0;
  while (off < plain.size()) {
    int rc = mbedtls_ssl_write(&c->ssl, reinterpret_cast<const unsigned char*>(plain.data()) + off, plain.size() - off);
    if (rc > 0) { off += static_cast<size_t>(rc); continue; }
    if (rc == MBEDTLS_ERR_SSL_WANT_READ || rc == MBEDTLS_ERR_SSL_WANT_WRITE) continue;
    c->failed = true;
    c->err = describe(c, rc);
    return false;
  }
  return true;
}

State read(Conn* c, std::string& out) {
  if (c->failed) return State::Failed;
  unsigned char buf[16384];
  for (;;) {
    int rc = mbedtls_ssl_read(&c->ssl, buf, sizeof buf);
    if (rc > 0) { out.append(reinterpret_cast<char*>(buf), static_cast<size_t>(rc)); continue; }
    if (rc == 0 || rc == MBEDTLS_ERR_SSL_PEER_CLOSE_NOTIFY) { c->closed = true; return State::Closed; }
    if (rc == MBEDTLS_ERR_SSL_RECEIVED_NEW_SESSION_TICKET) continue;   // a TLS 1.3 message of its own: the bytes fed after it are still to read
    if (rc == MBEDTLS_ERR_SSL_WANT_READ || rc == MBEDTLS_ERR_SSL_WANT_WRITE) return State::Ready;
    c->failed = true;
    c->err = describe(c, rc);
    return State::Failed;
  }
}

bool isTls13(Conn* c) { return c->done && mbedtls_ssl_get_version_number(&c->ssl) == MBEDTLS_SSL_VERSION_TLS1_3; }

void close(Conn* c) { if (c->done && !c->failed && !c->closed) mbedtls_ssl_close_notify(&c->ssl); }

}  // namespace zn::tls

#endif  // ZN_NO_TLS
