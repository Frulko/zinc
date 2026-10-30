#include "tls.h"

#ifdef ZN_NO_TLS   // a build without mbedTLS (cmake -DZN_TLS=OFF): https, TLS brokers and crypto.subtle report that they are missing
namespace zn::TLS_NS {
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
}  // namespace zn::TLS_NS
#else

#include <mbedtls/error.h>
#include <mbedtls/pk.h>
#include <mbedtls/ssl.h>
#include <psa/crypto.h>
// The console player (targets/console/mbedtls_console.h) builds mbedTLS without X.509: only the agent's sessions (PSK, EC J-PAKE) then,
// and the clients and servers with certificates say they are missing.
#ifdef MBEDTLS_X509_CRT_PARSE_C
#include <mbedtls/x509_crt.h>
#define TLS_CERTS 1
#endif

#include <cstdio>
#include <string>
#if defined(__linux__) || defined(_WIN32)
#include <unistd.h>
#endif
#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <wincrypt.h>   // the system's certificate store below; crypt32 is linked in CMakeLists.txt
#endif
#include <cstdlib>
#include <cstring>
#include <memory>
#ifdef __APPLE__
#include <TargetConditionals.h>
#if TARGET_OS_IPHONE && defined(TLS_CERTS)
#include <Security/Security.h>
#define TLS_OS_TRUST 1
#endif
#endif

namespace zn::TLS_NS {

struct Conn {
  mbedtls_ssl_context ssl;
  mbedtls_ssl_config conf;
#ifdef TLS_CERTS
  mbedtls_x509_crt own;
#endif
  mbedtls_pk_context key;
  std::string in, out, err;
  size_t inAt = 0;   // what mbedTLS has taken of `in`: read from there, compacted now and then, never one copy of the rest per record
  std::function<std::string(const std::string&)> pskLookup;
  std::string pskId;
  std::string host;   // a client's server name, for the system's verifier (TLS_OS_TRUST)
  bool server = false, done = false, failed = false, closed = false;
};

namespace {

bool psaReady() {
  static bool ok = psa_crypto_init() == PSA_SUCCESS;
  return ok;
}

#ifdef TLS_CERTS
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
#ifdef _WIN32
    {  // the system's store: "Root" and "CA" (HKLM and HKCU together at that call), each DER certificate parsed and chained
      for (LPCSTR storeName : {"Root", "CA"}) {
        if (HCERTSTORE h = CertOpenSystemStoreA(0, storeName)) {
          mbedtls_x509_crt* head = nullptr;
          for (PCCERT_CONTEXT ctx = nullptr; (ctx = CertEnumCertificatesInStore(h, ctx));) {
            auto* node = new mbedtls_x509_crt;
            mbedtls_x509_crt_init(node);
            if (mbedtls_x509_crt_parse_der(node, ctx->pbCertEncoded, ctx->cbCertEncoded) == 0) { node->next = head; head = node; }
            else { mbedtls_x509_crt_free(node); delete node; }
          }
          if (head) {   // append the chain to the store's own list (c's free takes them)
            mbedtls_x509_crt* tail = c;
            while (tail->next) tail = tail->next;
            tail->next = head;
          }
          CertCloseStore(h, 0);
        }
      }
    }
#endif
    for (const char* f : {"/etc/ssl/cert.pem", "/etc/ssl/certs/ca-certificates.crt", "/etc/pki/tls/certs/ca-bundle.crt", "/etc/ssl/ca-bundle.pem", "/etc/ssl/certs/ca-bundle.crt"})
      if (mbedtls_x509_crt_parse_file(c, f) >= 0) break;
    return c;
  }();
  return store;
}

#ifdef TLS_OS_TRUST
// iOS gives an app no file of its roots: a chain mbedTLS could not verify goes to the system's own verifier (its roots, the profiles the
// user installed, the host name). ponytail: synchronous, so a chain missing an intermediate may wait on the network here
bool osTrusted(Conn* c) {
  CFMutableArrayRef certs = CFArrayCreateMutable(nullptr, 0, &kCFTypeArrayCallBacks);
  for (const mbedtls_x509_crt* crt = mbedtls_ssl_get_peer_cert(&c->ssl); crt; crt = crt->next) {
    CFDataRef der = CFDataCreate(nullptr, crt->raw.p, static_cast<CFIndex>(crt->raw.len));
    if (SecCertificateRef sc = SecCertificateCreateWithData(nullptr, der)) { CFArrayAppendValue(certs, sc); CFRelease(sc); }
    CFRelease(der);
  }
  CFStringRef host = CFStringCreateWithCString(nullptr, c->host.c_str(), kCFStringEncodingUTF8);
  SecPolicyRef policy = SecPolicyCreateSSL(true, host);
  SecTrustRef trust = nullptr;
  const bool ok = CFArrayGetCount(certs) > 0 && SecTrustCreateWithCertificates(certs, policy, &trust) == errSecSuccess && SecTrustEvaluateWithError(trust, nullptr);
  if (trust) CFRelease(trust);
  CFRelease(policy);
  CFRelease(host);
  CFRelease(certs);
  return ok;
}
#endif

#endif  // TLS_CERTS

int sendCb(void* ctx, const unsigned char* buf, size_t n) { static_cast<Conn*>(ctx)->out.append(reinterpret_cast<const char*>(buf), n); return static_cast<int>(n); }
int recvCb(void* ctx, unsigned char* buf, size_t n) {
  auto* c = static_cast<Conn*>(ctx);
  const size_t left = c->in.size() - c->inAt;
  if (!left) return MBEDTLS_ERR_SSL_WANT_READ;
  const size_t k = n < left ? n : left;
  std::memcpy(buf, c->in.data() + c->inAt, k);
  c->inAt += k;
  // all taken: empty again (`in` is empty exactly when nothing waits); half taken: the rest moved down once. Erasing the record taken each time
  // moved the whole buffer per record: megabytes per 16 KB on a slow device behind a fast sender (1 MB/s on a Pi 3, zinc device install)
  if (c->inAt == c->in.size()) { c->in.clear(); c->inAt = 0; }
  else if (c->inAt >= 65536 && c->inAt * 2 >= c->in.size()) { c->in.erase(0, c->inAt); c->inAt = 0; }
  return static_cast<int>(k);
}

std::string describe(Conn* c, int rc) {
#ifdef TLS_CERTS
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
#else
  (void)c;
#endif
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
#ifdef TLS_CERTS
  mbedtls_x509_crt_init(&c->own);
#endif
  mbedtls_pk_init(&c->key);
  int rc = mbedtls_ssl_config_defaults(&c->conf, server ? MBEDTLS_SSL_IS_SERVER : MBEDTLS_SSL_IS_CLIENT, MBEDTLS_SSL_TRANSPORT_STREAM, MBEDTLS_SSL_PRESET_DEFAULT);
  if (rc != 0) { err = describe(c, rc); destroy(c); return nullptr; }
  return c;
}

}  // namespace

#ifndef TLS_CERTS
Conn* openClient(const std::string&, std::string& err, bool) { err = "this build has no certificates (the console player's TLS)"; return nullptr; }
Conn* openServer(const std::string&, const std::string&, std::string& err) { err = "this build has no certificates (the console player's TLS)"; return nullptr; }
#else
Conn* openClient(const std::string& serverName, std::string& err, bool tls12) {
  Conn* c = make(false, err);
  if (!c) return nullptr;
#ifdef TLS_OS_TRUST
  mbedtls_ssl_conf_authmode(&c->conf, MBEDTLS_SSL_VERIFY_OPTIONAL);   // step() hands a chain mbedTLS rejects to the system's verifier
  c->host = serverName;
#else
  mbedtls_ssl_conf_authmode(&c->conf, MBEDTLS_SSL_VERIFY_REQUIRED);
#endif
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
#endif  // TLS_CERTS

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
#ifdef TLS_CERTS
  mbedtls_x509_crt_free(&c->own);
#endif
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
#ifdef TLS_OS_TRUST
  if (rc == 0 && !c->host.empty() && mbedtls_ssl_get_verify_result(&c->ssl) != 0 && !osTrusted(c)) rc = MBEDTLS_ERR_X509_CERT_VERIFY_FAILED;
#endif
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
    // a TLS 1.3 NewSessionTicket that read() left pending is processed by this write's handshake step, which reports it like an error
    if (rc == MBEDTLS_ERR_SSL_WANT_READ || rc == MBEDTLS_ERR_SSL_WANT_WRITE || rc == MBEDTLS_ERR_SSL_RECEIVED_NEW_SESSION_TICKET) continue;
    c->failed = true;
    c->err = describe(c, rc);
    return false;
  }
  return true;
}

State read(Conn* c, std::string& out) {
  if (c->failed) return State::Failed;
  unsigned char buf[16384];
  int stalls = 0;   // calls in a row that took no byte
  for (;;) {
    const size_t before = c->in.size() - c->inAt;
    int rc = mbedtls_ssl_read(&c->ssl, buf, sizeof buf);
    if (rc > 0) { out.append(reinterpret_cast<char*>(buf), static_cast<size_t>(rc)); stalls = 0; continue; }
    if (rc == 0 || rc == MBEDTLS_ERR_SSL_PEER_CLOSE_NOTIFY) { c->closed = true; return State::Closed; }
    if (rc == MBEDTLS_ERR_SSL_RECEIVED_NEW_SESSION_TICKET) { stalls = 0; continue; }   // a TLS 1.3 message of its own: the bytes fed after it are still to read
    if (rc == MBEDTLS_ERR_SSL_WANT_READ || rc == MBEDTLS_ERR_SSL_WANT_WRITE) {
      // WANT_READ does not always mean "no more bytes": on a TLS 1.3 NewSessionTicket mbedTLS keeps the message, answers WANT_READ and processes it on
      // the next call, without taking a byte, and the records fed behind it (often the server's first reply) would wait for bytes from the network
      // that never come, as the server waits for us (ZN-762; Cloudflare's gateway.discord.gg about one connection in two, the "TLS 1.3 session
      // dropped" of http.cpp). So read again while bytes are fed or mbedTLS holds some: a call either takes bytes or ends a pending message, and
      // a few calls in a row without a byte end the loop.
      stalls = c->in.size() - c->inAt < before ? 0 : stalls + 1;
      if ((!c->in.empty() || mbedtls_ssl_check_pending(&c->ssl)) && stalls < 4) continue;
      return State::Ready;
    }
    c->failed = true;
    c->err = describe(c, rc);
    return State::Failed;
  }
}

bool isTls13(Conn* c) { return c->done && mbedtls_ssl_get_version_number(&c->ssl) == MBEDTLS_SSL_VERSION_TLS1_3; }

void close(Conn* c) { if (c->done && !c->failed && !c->closed) mbedtls_ssl_close_notify(&c->ssl); }

}  // namespace zn::TLS_NS

// Plugins link against this binary's mbedTLS (zinc:webrtc's DTLS, plugins/webrtc): the certificate writer, which nothing here calls, would
// be left out of the link; these references keep it, exported like the rest of the library.
#if defined(TLS_ENGINE_COPY) && defined(TLS_CERTS)
extern "C" __attribute__((used, visibility("default"))) void* const zn_tls_plugin_symbols[] = {
    (void*)&mbedtls_x509write_crt_init, (void*)&mbedtls_x509write_crt_free, (void*)&mbedtls_x509write_crt_der,
    (void*)&mbedtls_x509write_crt_set_version, (void*)&mbedtls_x509write_crt_set_serial_raw, (void*)&mbedtls_x509write_crt_set_validity,
    (void*)&mbedtls_x509write_crt_set_issuer_name, (void*)&mbedtls_x509write_crt_set_subject_name, (void*)&mbedtls_x509write_crt_set_issuer_key,
    (void*)&mbedtls_x509write_crt_set_subject_key, (void*)&mbedtls_x509write_crt_set_md_alg};
#endif

#endif  // ZN_NO_TLS
