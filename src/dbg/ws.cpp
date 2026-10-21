// The DevTools target's transport (ws.h): discovery over HTTP, the WebSocket handshake and its frames. Taken out of cdp.cpp (ZN-773.05) so the
// V8 engine module serves V8's inspector the same way.
#include "dbg/ws.h"

#include <cctype>
#include <csignal>
#include <cstdint>
#include <cstdio>
#include <mutex>
#include <thread>

#include "mbedtls/base64.h"
#include "platform/socket.h"
#include "psa/crypto.h"

namespace zn::dbg::ws {
namespace {

std::mutex gWrite;
int gClient = -1;   // the WebSocket client (one at a time)
int gPort = 0;
Target gTarget;
std::function<void(std::string)> gOnMessage;
std::function<void()> gOnClose;

bool writeAll(int fd, const char* p, std::size_t n) {
  while (n) {
    const long w = zn::plat::sockWrite(fd, p, n);
    if (w <= 0) return false;
    p += w; n -= static_cast<std::size_t>(w);
  }
  return true;
}

std::string acceptKey(const std::string& key) {   // Sec-WebSocket-Accept: base64(SHA-1(key + the RFC's GUID))
  static bool ok = psa_crypto_init() == PSA_SUCCESS;
  const std::string in = key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
  unsigned char h[20];
  std::size_t hl = 0;
  if (!ok || psa_hash_compute(PSA_ALG_SHA_1, reinterpret_cast<const unsigned char*>(in.data()), in.size(), h, sizeof h, &hl) != PSA_SUCCESS) return "";
  unsigned char b[64];
  std::size_t bl = 0;
  if (mbedtls_base64_encode(b, sizeof b, &bl, h, hl) != 0) return "";
  return std::string(reinterpret_cast<char*>(b), bl);
}

std::string header(const std::string& req, const char* name) {   // the value of a header (case-insensitive name)
  std::string lower = req;
  for (char& c : lower) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  std::string n = "\r\n" + std::string(name) + ":";
  for (char& c : n) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  const std::size_t at = lower.find(n);
  if (at == std::string::npos) return "";
  std::size_t b = at + n.size(), e = req.find("\r\n", b);
  while (b < e && req[b] == ' ') ++b;
  return req.substr(b, e - b);
}

void serveHttp(int fd, const std::string& req) {
  const std::string host = header(req, "Host");
  auto local = [&](const std::string& h) { for (const char* l : {"127.0.0.1", "localhost", "[::1]"}) if (h == l || h.rfind(std::string(l) + ":", 0) == 0) return true; return false; };
  std::string status = "200 OK", body;
  if (!local(host)) { status = "403 Forbidden"; body = "{}"; }   // DNS rebinding: only a client that names this machine
  else if (req.rfind("GET /json/version", 0) == 0) body = "{\"Browser\":\"Zinc/0.1\",\"Protocol-Version\":\"1.3\"}";
  else if (req.rfind("GET /json", 0) == 0) {
    const std::string ws = "127.0.0.1:" + std::to_string(gPort) + "/" + gTarget.id;
    body = "[{\"description\":\"zinc\",\"devtoolsFrontendUrl\":\"devtools://devtools/bundled/js_app.html?experiments=true&v8only=true&ws=" + ws + "\",\"id\":" + quote(gTarget.id) +
           ",\"title\":" + quote(gTarget.title) + ",\"type\":\"node\",\"url\":" + quote(gTarget.url) + ",\"webSocketDebuggerUrl\":\"ws://" + ws + "\"}]";
  } else { status = "404 Not Found"; body = "{}"; }
  const std::string resp = "HTTP/1.1 " + status + "\r\nContent-Type: application/json; charset=UTF-8\r\nContent-Length: " + std::to_string(body.size()) + "\r\nConnection: close\r\n\r\n" + body;
  writeAll(fd, resp.data(), resp.size());
}

// Reads the WebSocket's frames of a client until it goes; each text message to gOnMessage.
void serveSocket(int fd) {
  std::string buf, msg;
  char tmp[65536];
  for (;;) {
    const long n = zn::plat::sockRead(fd, tmp, sizeof tmp);
    if (n <= 0) break;
    buf.append(tmp, static_cast<std::size_t>(n));
    for (;;) {
      if (buf.size() < 2) break;
      const unsigned char b0 = static_cast<unsigned char>(buf[0]), b1 = static_cast<unsigned char>(buf[1]);
      std::uint64_t len = b1 & 127;
      std::size_t at = 2;
      if (len == 126) { if (buf.size() < 4) break; len = (static_cast<unsigned char>(buf[2]) << 8) | static_cast<unsigned char>(buf[3]); at = 4; }
      else if (len == 127) { if (buf.size() < 10) break; len = 0; for (int k = 0; k < 8; ++k) len = len << 8 | static_cast<unsigned char>(buf[2 + k]); at = 10; }
      const bool masked = b1 & 128;
      if (buf.size() < at + (masked ? 4 : 0) + len) break;
      const char* mask = buf.data() + at;
      if (masked) at += 4;
      std::string payload = buf.substr(at, len);
      if (masked) for (std::size_t k = 0; k < payload.size(); ++k) payload[k] = static_cast<char>(payload[k] ^ mask[k % 4]);
      buf.erase(0, at + len);
      const int op = b0 & 15;
      if (op == 8) goto closed;
      if (op == 9) { std::lock_guard<std::mutex> lock(gWrite); std::string pong = "\x8a"; pong += static_cast<char>(payload.size()); pong += payload; writeAll(fd, pong.data(), pong.size()); continue; }
      if (op == 1 || op == 0) {
        msg += payload;
        if (b0 & 128) { gOnMessage(std::move(msg)); msg.clear(); }
      }
    }
  }
closed:
  bool last;
  { std::lock_guard<std::mutex> lock(gWrite); last = gClient == fd; if (last) gClient = -1; }
  if (last && gOnClose) gOnClose();
}

void serve(int listener) {
  for (;;) {
    const int fd = static_cast<int>(::accept(listener, nullptr, nullptr));
    if (fd < 0) continue;
    std::string req;
    char tmp[4096];
    while (req.find("\r\n\r\n") == std::string::npos) {
      const long n = zn::plat::sockRead(fd, tmp, sizeof tmp);
      if (n <= 0) break;
      req.append(tmp, static_cast<std::size_t>(n));
    }
    const std::string key = header(req, "Sec-WebSocket-Key");
    if (key.empty() || req.rfind("GET /" + gTarget.id, 0) != 0) { serveHttp(fd, req); zn::plat::sockClose(fd); continue; }
    const std::string acc = acceptKey(key);
    const std::string resp = "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + acc + "\r\n\r\n";
    writeAll(fd, resp.data(), resp.size());
    { std::lock_guard<std::mutex> lock(gWrite); if (gClient >= 0) zn::plat::sockClose(gClient); gClient = fd; }
    std::thread(serveSocket, fd).detach();   // one reader per connection; the last connection is the client
  }
}

}  // namespace

std::string quote(const std::string& s) {
  std::string o = "\"";
  for (unsigned char c : s) {
    if (c == '"' || c == '\\') { o += '\\'; o += static_cast<char>(c); }
    else if (c == '\n') o += "\\n";
    else if (c == '\r') o += "\\r";
    else if (c == '\t') o += "\\t";
    else if (c < 0x20) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", c); o += b; }
    else o += static_cast<char>(c);
  }
  return o + "\"";
}

// One unmasked text frame to the client.
void send(const std::string& json) {
  std::lock_guard<std::mutex> lock(gWrite);
  if (gClient < 0) return;
  std::string f;
  f += static_cast<char>(0x81);
  if (json.size() < 126) f += static_cast<char>(json.size());
  else if (json.size() < 65536) { f += static_cast<char>(126); f += static_cast<char>(json.size() >> 8); f += static_cast<char>(json.size() & 255); }
  else { f += static_cast<char>(127); for (int k = 7; k >= 0; --k) f += static_cast<char>((static_cast<std::uint64_t>(json.size()) >> (8 * k)) & 255); }
  f += json;
  writeAll(gClient, f.data(), f.size());
}

int start(int port, const Target& target, std::function<void(std::string)> onMessage, std::function<void()> onClose) {
  gTarget = target;
  gOnMessage = std::move(onMessage);
  gOnClose = std::move(onClose);
#ifdef SIGPIPE
  std::signal(SIGPIPE, SIG_IGN);   // a client that goes away mid-write: an error, not the end of the process
#endif
  zn::plat::netInit();
  const int listener = static_cast<int>(::socket(AF_INET, SOCK_STREAM, 0));
  int one = 1;
  ::setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, reinterpret_cast<const char*>(&one), sizeof one);
  sockaddr_in a{};
  a.sin_family = AF_INET;
  a.sin_port = htons(static_cast<std::uint16_t>(port));
  a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (listener < 0 || ::bind(listener, reinterpret_cast<sockaddr*>(&a), sizeof a) != 0 || ::listen(listener, 4) != 0) return 0;
  socklen_t al = sizeof a;
  ::getsockname(listener, reinterpret_cast<sockaddr*>(&a), &al);
  gPort = ntohs(a.sin_port);
  std::thread(serve, listener).detach();
  return gPort;
}

}  // namespace zn::dbg::ws
