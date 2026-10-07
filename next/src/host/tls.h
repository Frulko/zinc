#pragma once
// TLS 1.2 / 1.3 over memory buffers (mbedTLS 4, third_party/mbedtls) for zinc:net https and zinc:mqtt over TLS (ZN-089): the caller moves the encrypted bytes between
// the socket and the connection, the connection hands out and takes plain bytes. No I/O and no libuv in here.
#include <string>

namespace zn::tls {

struct Conn;
enum class State { Handshaking, Ready, Closed, Failed };

// A client that verifies the server's certificate for `serverName` against the system root store (or the file named by ZINC_CA_FILE). nullptr and `err` when it cannot start.
Conn* openClient(const std::string& serverName, std::string& err);
// A server with a PEM certificate chain and a PEM private key.
Conn* openServer(const std::string& certPem, const std::string& keyPem, std::string& err);
void destroy(Conn* c);

void feed(Conn* c, const char* data, size_t n);   // encrypted bytes that arrived
std::string takeOutput(Conn* c);                    // encrypted bytes to send (take them after every call below)
State step(Conn* c);                                // runs the handshake as far as the bytes fed allow
bool write(Conn* c, const std::string& plain);      // false before the handshake is done or after a failure
// Appends the plain bytes that can be read now to `out`. Closed after the peer's close_notify, Failed on an error.
State read(Conn* c, std::string& out);
void close(Conn* c);                                // queues close_notify
// The reason of a failure, in Node's words for certificate problems (CERT_HAS_EXPIRED, UNABLE_TO_VERIFY_LEAF_SIGNATURE, ERR_TLS_CERT_ALTNAME_INVALID, ...).
const std::string& error(Conn* c);

}  // namespace zn::tls
