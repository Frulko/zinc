// A TLS 1.3 server's session tickets cut by the network, the server's reply behind them (tests/t0/tls_ticket.sh): the client must hand out the
// reply from the bytes it has, without waiting for more. mbedTLS answers WANT_READ when it ends a ticket it holds without taking a byte, and
// tls::read stopped there with the reply unread while the server waited for us (Cloudflare's gateway.discord.gg about one connection in two).
// Both ends run in memory; every split point of the server's flight is tried. Usage: tls_ticket_test cert.pem key.pem (ZINC_CA_FILE: its CA).
#include "host/tls.h"
#include <mbedtls/ssl.h>
#include <mbedtls/ssl_ticket.h>
#include <mbedtls/x509_crt.h>
#include <mbedtls/pk.h>
#include <psa/crypto.h>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <sstream>
#include <string>

using namespace zn;

static std::string slurp(const char* path) { std::ifstream f(path); std::stringstream s; s << f.rdbuf(); return s.str(); }

// The server: mbedTLS with session tickets, which tls::openServer does not issue; memory buffers as tls.cpp's.
struct Server {
  mbedtls_ssl_context ssl;
  mbedtls_ssl_config conf;
  mbedtls_x509_crt crt;
  mbedtls_pk_context key;
  mbedtls_ssl_ticket_context tickets;
  std::string in, out;
};
static int srvSend(void* p, const unsigned char* b, size_t n) { static_cast<Server*>(p)->out.append(reinterpret_cast<const char*>(b), n); return static_cast<int>(n); }
static int srvRecv(void* p, unsigned char* b, size_t n) {
  auto* s = static_cast<Server*>(p);
  if (s->in.empty()) return MBEDTLS_ERR_SSL_WANT_READ;
  size_t k = n < s->in.size() ? n : s->in.size();
  std::memcpy(b, s->in.data(), k);
  s->in.erase(0, k);
  return static_cast<int>(k);
}
static Server* openTicketServer(const std::string& certPem, const std::string& keyPem) {
  auto* s = new Server;
  mbedtls_ssl_init(&s->ssl); mbedtls_ssl_config_init(&s->conf); mbedtls_x509_crt_init(&s->crt); mbedtls_pk_init(&s->key); mbedtls_ssl_ticket_init(&s->tickets);
  std::string c = certPem + '\0', k = keyPem + '\0';
  int rc = mbedtls_x509_crt_parse(&s->crt, reinterpret_cast<const unsigned char*>(c.data()), c.size());
  if (rc == 0) rc = mbedtls_pk_parse_key(&s->key, reinterpret_cast<const unsigned char*>(k.data()), k.size(), nullptr, 0);
  if (rc == 0) rc = mbedtls_ssl_config_defaults(&s->conf, MBEDTLS_SSL_IS_SERVER, MBEDTLS_SSL_TRANSPORT_STREAM, MBEDTLS_SSL_PRESET_DEFAULT);
  if (rc == 0) rc = mbedtls_ssl_conf_own_cert(&s->conf, &s->crt, &s->key);
  if (rc == 0) rc = mbedtls_ssl_ticket_setup(&s->tickets, PSA_ALG_GCM, PSA_KEY_TYPE_AES, 256, 86400);
  if (rc == 0) { mbedtls_ssl_conf_session_tickets_cb(&s->conf, mbedtls_ssl_ticket_write, mbedtls_ssl_ticket_parse, &s->tickets); mbedtls_ssl_conf_new_session_tickets(&s->conf, 2); }
  if (rc == 0) rc = mbedtls_ssl_setup(&s->ssl, &s->conf);
  if (rc != 0) { std::fprintf(stderr, "server setup: -0x%x\n", -rc); return nullptr; }
  mbedtls_ssl_set_bio(&s->ssl, s, srvSend, srvRecv, nullptr);
  return s;
}
static void closeServer(Server* s) {
  mbedtls_ssl_free(&s->ssl); mbedtls_ssl_config_free(&s->conf); mbedtls_x509_crt_free(&s->crt); mbedtls_pk_free(&s->key); mbedtls_ssl_ticket_free(&s->tickets);
  delete s;
}

int main(int argc, char** argv) {
  if (argc < 3) { std::fprintf(stderr, "usage: tls_ticket_test cert.pem key.pem\n"); return 2; }
  const std::string cert = slurp(argv[1]), key = slurp(argv[2]);
  psa_crypto_init();
  int failures = 0, tried = 0;
  for (size_t cut = 1;; ++cut) {
    std::string err;
    Server* srv = openTicketServer(cert, key);
    tls::Conn* cli = tls::openClient("localhost", err);
    if (!srv || !cli) { std::fprintf(stderr, "open: %s\n", err.c_str()); return 1; }
    // the handshake, until the client is done; what the server says after that is held back
    std::string held;
    tls::State cs = tls::State::Handshaking;
    bool srvDone = false;
    for (int i = 0; i < 40 && cs != tls::State::Ready; ++i) {
      cs = tls::step(cli);
      std::string o = tls::takeOutput(cli);
      srv->in += o;
      srvDone = mbedtls_ssl_handshake(&srv->ssl) == 0;
      o.swap(srv->out); srv->out.clear();
      if (cs == tls::State::Ready) held += o; else if (!o.empty()) tls::feed(cli, o.data(), o.size());
    }
    if (cs != tls::State::Ready) { std::fprintf(stderr, "handshake did not finish\n"); return 1; }
    // the client's request; the server reads it (its tickets go out with its handshake's end) and answers
    tls::write(cli, "ping");
    srv->in += tls::takeOutput(cli);
    for (int i = 0; i < 4 && !srvDone; ++i) srvDone = mbedtls_ssl_handshake(&srv->ssl) == 0;
    std::string got;
    unsigned char buf[256];
    for (int i = 0; i < 8 && got.empty(); ++i) { int n = mbedtls_ssl_read(&srv->ssl, buf, sizeof buf); if (n > 0) got.assign(reinterpret_cast<char*>(buf), static_cast<size_t>(n)); }
    mbedtls_ssl_write(&srv->ssl, reinterpret_cast<const unsigned char*>("pong"), 4);
    held += srv->out; srv->out.clear();
    if (cut >= held.size()) { closeServer(srv); tls::destroy(cli); break; }
    // the held flight in two reads, cut at `cut`
    std::string plain;
    tls::feed(cli, held.data(), cut);
    tls::read(cli, plain);
    tls::feed(cli, held.data() + cut, held.size() - cut);
    tls::read(cli, plain);
    ++tried;
    if (got != "ping" || plain != "pong") { if (failures < 5) std::printf("cut %zu of %zu: server got '%s', client got '%s'\n", cut, held.size(), got.c_str(), plain.c_str()); ++failures; }
    closeServer(srv); tls::destroy(cli);
  }
  std::printf("%d cuts tried, %d stalled (%s)\n", tried, failures, tried > 300 ? "tickets in the flight" : "no tickets?");
  return failures == 0 && tried > 0 ? 0 : 1;
}
