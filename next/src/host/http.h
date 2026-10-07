#pragma once
// HTTP/1.1 for zinc:net (ZN-087): a client (fetch) and a server on the libuv loop, parsed with llhttp (third_party/llhttp).
// Results arrive as loop events (include/zn/loop.h): 40 a fetch finished, 41 a fetch failed (data = the reason, Node's words), 42 a request
// reached the server (handle = the connection, data = method \x1e target \x1e "name: value\n" lines \x1e body).
#include <string>

namespace zn::http {

// Starts a request; `headers` holds "Name: value\n" lines. Redirects are followed (20 at most). Returns a handle (>= 1).
int fetchOpen(const std::string& url, const std::string& method, const std::string& headers, const std::string& body, int timeoutMs, int maxBytes);
int fetchStatus(int h);
std::string fetchHead(int h);   // the reason phrase, then "name: value\n" lines
std::string fetchBody(int h);
std::string fetchUrl(int h);    // after redirects
void fetchFree(int h);

// false when the port cannot be bound (or the certificate is bad: lastError()); a second call replaces the first listener. A PEM certificate chain and key make it an https server.
bool serve(int port, const std::string& certPem = std::string(), const std::string& keyPem = std::string());
const std::string& lastError();
void reply(int conn, int status, const std::string& headers, const std::string& body);
void stop();

}  // namespace zn::http
