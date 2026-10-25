// The session of the device agent (docs/reports/zinc-next-agent.md): TLS (host/tls.h, mbedTLS) over a non-blocking socket, the lines in
// clear before it, frames, JSON. Sockets, tls.cpp and yyjson only: the console player (src/agent/player.cpp) links it without the files of
// wire.cpp. ZN_AGENT_NO_THREADS (the console cores, single-threaded): no lock around mbedTLS; ZN_AGENT_SERVER_ONLY: no dial, no relay.
#include "wire.h"

#include "../host/tls.h"
#include "../net/frame.h"
#include "yyjson.h"

#include "platform/socket.h"   // the BSD socket headers, or Winsock 2 on Windows (plus WSAPoll and the four calls that differ)
#if !defined(_WIN32) && !defined(ZN_AGENT_SERVER_ONLY)
#include <netdb.h>
#endif
#if !defined(_WIN32) && __has_include(<netinet/tcp.h>)
#include <netinet/tcp.h>
#endif
#include <fcntl.h>
#include <unistd.h>

#include <algorithm>
#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#ifndef ZN_AGENT_NO_THREADS
#include <mutex>
#endif

namespace zn::agent {

namespace tls = zn::tls;

namespace {

// mbedTLS is built without thread support (the engine calls it from one thread) and the agent has a thread per session: every call that
// reaches its crypto goes through this lock, never held across a wait. ponytail: one lock for all sessions; build mbedTLS with
// MBEDTLS_THREADING_PTHREAD when sessions need to encrypt in parallel (many large transfers at once).
#ifdef ZN_AGENT_NO_THREADS
struct Locked { explicit Locked(int) {} };
int crypto() { return 0; }
#else
std::mutex& crypto() {
  static std::mutex m;
  return m;
}
using Locked = std::lock_guard<std::mutex>;
#endif

// Moves what the socket holds into the TLS input; false at the end of the stream.
bool drain(Chan& c) {
  char buf[16384];
  for (;;) {
    const ssize_t n = ::recv(c.fd, buf, sizeof buf, 0);
    if (n > 0) { tls::feed(c.tls, buf, static_cast<size_t>(n)); continue; }
    if (n == 0) return false;
    if (errno == EINTR) continue;
    return errno == EAGAIN || errno == EWOULDBLOCK;
  }
}

// Sends what TLS wants sent. While the socket is full it keeps taking what the peer sends, so two ends that write at once never wait on
// each other.
bool flush(Chan& c) {
  const std::string out = tls::takeOutput(c.tls);
  size_t off = 0;
  while (off < out.size()) {
    const ssize_t n = ::send(c.fd, out.data() + off, out.size() - off, 0);
    if (n > 0) { off += static_cast<size_t>(n); continue; }
    if (n < 0 && errno == EINTR) continue;
    if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
      pollfd p{c.fd, POLLOUT | POLLIN, 0};
      if (::poll(&p, 1, 60000) <= 0) return false;
      if ((p.revents & POLLIN) && !drain(c) && !(p.revents & POLLOUT)) return false;
      continue;
    }
    return false;
  }
  return true;
}

}  // namespace

Chan::~Chan() {
  if (tls) {
    { Locked l(crypto()); tls::close(tls); }
    if (fd >= 0) flush(*this);
    Locked l(crypto());
    tls::destroy(tls);
  }
  if (fd >= 0) ::close(fd);
}

void prepare(int fd) {
  ::fcntl(fd, F_SETFL, ::fcntl(fd, F_GETFL, 0) | O_NONBLOCK);
#ifdef FD_CLOEXEC
  ::fcntl(fd, F_SETFD, FD_CLOEXEC);
#endif
#ifdef TCP_NODELAY
  int one = 1;
  ::setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &one, sizeof one);
#endif
}

#ifndef ZN_AGENT_SERVER_ONLY
int dial(const std::string& host, int port, int timeoutMs, std::string& err) {
  addrinfo hints{};
  hints.ai_socktype = SOCK_STREAM;
  addrinfo* list = nullptr;
  if (::getaddrinfo(host.c_str(), std::to_string(port).c_str(), &hints, &list) != 0 || !list) { err = "no address for " + host; return -1; }
  int fd = -1;
  for (addrinfo* a = list; a && fd < 0; a = a->ai_next) {
    const int s = ::socket(a->ai_family, a->ai_socktype, a->ai_protocol);
    if (s < 0) continue;
    prepare(s);
    int rc = ::connect(s, a->ai_addr, a->ai_addrlen);
    if (rc != 0 && errno == EINPROGRESS) {
      pollfd p{s, POLLOUT, 0};
      int soErr = 0;
      socklen_t n = sizeof soErr;
      rc = ::poll(&p, 1, timeoutMs) > 0 && ::getsockopt(s, SOL_SOCKET, SO_ERROR, &soErr, &n) == 0 && soErr == 0 ? 0 : -1;
    }
    if (rc == 0) fd = s; else ::close(s);
  }
  ::freeaddrinfo(list);
  if (fd < 0) err = "nothing answers at " + host + ":" + std::to_string(port);
  return fd;
}

#endif

bool writeAll(int fd, const char* p, std::size_t n) {
  while (n > 0) {
    const ssize_t k = ::write(fd, p, n);
    if (k > 0) { p += k; n -= static_cast<size_t>(k); continue; }
    if (k < 0 && errno == EINTR) continue;
    if (k < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
      pollfd w{fd, POLLOUT, 0};
      if (::poll(&w, 1, 60000) <= 0) return false;
      continue;
    }
    return false;
  }
  return true;
}

bool sendLine(int fd, const std::string& line) { const std::string l = line + "\n"; return writeAll(fd, l.data(), l.size()); }

// A byte at a time: what follows the line belongs to TLS.
bool recvLine(int fd, std::string& line, int timeoutMs) {
  line.clear();
  while (line.size() < 64) {
    pollfd p{fd, POLLIN, 0};
    if (::poll(&p, 1, timeoutMs) <= 0) return false;
    char ch;
    const ssize_t n = ::recv(fd, &ch, 1, 0);
    if (n == 0 || (n < 0 && errno != EAGAIN && errno != EINTR)) return false;
    if (n < 0) continue;
    if (ch == '\n') return true;
    line.push_back(ch);
  }
  return false;
}

bool openPskClient(Chan& c, const std::string& identity, const std::string& key, std::string& err) {
  Locked l(crypto());
  return (c.tls = tls::openPskClient(identity, key, err)) != nullptr;
}
bool openPskServer(Chan& c, std::function<std::string(const std::string&)> lookup, std::string& err) {
  Locked l(crypto());
  return (c.tls = tls::openPskServer(std::move(lookup), err)) != nullptr;
}
bool openPake(Chan& c, bool server, const std::string& code, std::string& err) {
  Locked l(crypto());
  return (c.tls = tls::openPake(server, code, err)) != nullptr;
}
std::string peerIdentity(Chan& c) { return tls::pskIdentity(c.tls); }
std::string randomBytes(std::size_t n) {
  Locked l(crypto());
  return tls::randomBytes(n);
}

namespace {
tls::State stepLocked(Chan& c) { Locked l(crypto()); return tls::step(c.tls); }
tls::State readLocked(Chan& c) { Locked l(crypto()); return tls::read(c.tls, c.in); }
}  // namespace

bool handshake(Chan& c, int timeoutMs, std::string& err) {
  for (;;) {
    const tls::State st = stepLocked(c);
    const bool sent = flush(c);   // on a failure too: the alert tells the peer why
    if (st == tls::State::Ready) {
      readLocked(c);   // the peer's first frames may have come with the end of its handshake: from here on, what was read is decrypted
      return sent;
    }
    if (st == tls::State::Failed) { err = tls::error(c.tls); return false; }
    if (!sent) { err = "the connection was lost"; return false; }
    pollfd p{c.fd, POLLIN, 0};
    if (::poll(&p, 1, timeoutMs) <= 0) { err = "no answer in time"; return false; }
    if (!drain(c)) {   // closed: what arrived before may still end the handshake, or say why it failed
      const tls::State last = stepLocked(c);
      flush(c);
      if (last == tls::State::Ready) { readLocked(c); return true; }
      err = last == tls::State::Failed ? tls::error(c.tls) : "the connection was closed";
      return false;
    }
  }
}

bool send(Chan& c, char type, std::string_view payload) {
  const std::string f = net::frame(type, payload);
  { Locked l(crypto()); if (!tls::write(c.tls, f)) return false; }
  return flush(c);
}

bool fill(Chan& c) {
  const bool open = drain(c);
  const tls::State st = readLocked(c);
  flush(c);
  return open && st == tls::State::Ready;
}

bool next(Chan& c, char& type, std::string& payload, bool* bad) { return net::takeFrame(c.in, kMaxAgentFrame, type, payload, bad); }

bool recv(Chan& c, char& type, std::string& payload, int timeoutMs) {
  for (;;) {
    bool bad = false;
    if (next(c, type, payload, &bad)) return true;
    if (bad) return false;
    pollfd p{c.fd, POLLIN, 0};
    const int r = ::poll(&p, 1, timeoutMs);
    if (r < 0 && errno == EINTR) continue;
    if (r <= 0) return false;
    if (!fill(c)) return next(c, type, payload);
  }
}

#ifndef ZN_AGENT_SERVER_ONLY
void relaySocket(Chan& c, int sock, char outType, char inType) {
  bool fromSock = true, fromPeer = true, open = true;   // the two directions, each ended by its own end of stream
  char buf[kChunk];
  for (;;) {
    char type;
    std::string payload;
    while (next(c, type, payload)) {   // first what is already here: frames come in groups, and the socket stays quiet after the last
      if (type == inType && !writeAll(sock, payload.data(), payload.size())) return;
      if (type == kEof) { ::shutdown(sock, SHUT_WR); fromPeer = false; }
    }
    if (!open || !(fromSock || fromPeer)) return;
    pollfd p[2] = {{c.fd, POLLIN, 0}, {fromSock ? sock : -1, POLLIN, 0}};
    if (::poll(p, 2, -1) < 0) { if (errno == EINTR) continue; return; }
    if (p[1].revents) {
      const ssize_t n = ::recv(sock, buf, sizeof buf, 0);
      if (n > 0) {
        if (!send(c, outType, std::string_view(buf, static_cast<size_t>(n)))) return;
      } else if (n == 0 || (errno != EAGAIN && errno != EINTR)) {
        fromSock = false;
        if (!send(c, kEof, {})) return;
      }
    }
    if (p[0].revents) open = fill(c);
  }
}
#endif

// ---- JSON ----

std::string jsonText(std::string_view s) {
  std::string o = "\"";
  for (const char ch : s) {
    const auto u = static_cast<unsigned char>(ch);
    if (ch == '"' || ch == '\\') { o.push_back('\\'); o.push_back(ch); }
    else if (u < 0x20) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", u); o += b; }
    else o.push_back(ch);
  }
  o.push_back('"');
  return o;
}

Obj& Obj::raw(std::string_view key, std::string_view json) {
  if (s.size() > 1) s.push_back(',');
  s += jsonText(key);
  s.push_back(':');
  s += json;
  return *this;
}

Obj& Obj::real(std::string_view key, double v) {
  char b[32];
  std::snprintf(b, sizeof b, "%.2f", v);
  return raw(key, b);
}

std::string array(const std::vector<std::string>& jsonItems) {
  std::string o = "[";
  for (const std::string& i : jsonItems) { if (o.size() > 1) o.push_back(','); o += i; }
  return o + "]";
}

bool Val::has(const char* key) const { return yyjson_obj_get(v, key) != nullptr; }
std::string Val::str(const char* key) const {
  yyjson_val* x = yyjson_obj_get(v, key);
  return yyjson_is_str(x) ? std::string(yyjson_get_str(x), yyjson_get_len(x)) : std::string();
}
long long Val::num(const char* key) const {
  yyjson_val* x = yyjson_obj_get(v, key);
  return yyjson_is_int(x) ? static_cast<long long>(yyjson_get_sint(x)) : yyjson_is_real(x) ? static_cast<long long>(yyjson_get_real(x)) : 0;
}
double Val::real(const char* key) const { yyjson_val* x = yyjson_obj_get(v, key); return yyjson_is_num(x) ? yyjson_get_num(x) : 0; }
bool Val::flag(const char* key) const { return yyjson_is_true(yyjson_obj_get(v, key)); }
std::vector<std::string> Val::strs(const char* key) const {
  std::vector<std::string> out;
  size_t i, n;
  yyjson_val* x;
  yyjson_arr_foreach(yyjson_obj_get(v, key), i, n, x) if (yyjson_is_str(x)) out.emplace_back(yyjson_get_str(x), yyjson_get_len(x));
  return out;
}
std::vector<std::pair<std::string, std::string>> Val::pairs(const char* key) const {
  std::vector<std::pair<std::string, std::string>> out;
  size_t i, n;
  yyjson_val *k, *x;
  yyjson_obj_foreach(yyjson_obj_get(v, key), i, n, k, x) if (yyjson_is_str(x)) out.emplace_back(yyjson_get_str(k), std::string(yyjson_get_str(x), yyjson_get_len(x)));
  return out;
}
std::vector<Val> Val::items(const char* key) const {
  std::vector<Val> out;
  size_t i, n;
  yyjson_val* x;
  yyjson_arr_foreach(yyjson_obj_get(v, key), i, n, x) if (yyjson_is_obj(x)) out.push_back(Val{x});
  return out;
}

Doc::Doc(std::string_view text) {
  doc = yyjson_read(text.data(), text.size(), YYJSON_READ_ALLOW_INVALID_UNICODE);   // file names are bytes, not always UTF-8
  yyjson_val* root = doc ? yyjson_doc_get_root(doc) : nullptr;
  v = yyjson_is_obj(root) ? root : nullptr;
}
Doc::~Doc() { yyjson_doc_free(doc); }

bool refuse(Chan& c, const std::string& why) { return send(c, kJson, Obj().flag("ok", false).str("error", why).done()); }

// ---- files and keys ----

std::string hex(std::string_view bytes) {
  static const char* d = "0123456789abcdef";
  std::string o;
  for (const char ch : bytes) { o.push_back(d[(static_cast<unsigned char>(ch) >> 4) & 15]); o.push_back(d[static_cast<unsigned char>(ch) & 15]); }
  return o;
}

std::string unhex(std::string_view text) {
  const auto nib = [](char ch) { return ch >= '0' && ch <= '9' ? ch - '0' : ch >= 'a' && ch <= 'f' ? ch - 'a' + 10 : ch >= 'A' && ch <= 'F' ? ch - 'A' + 10 : -1; };
  std::string o;
  for (size_t i = 0; i + 1 < text.size(); i += 2) {
    const int hi = nib(text[i]), lo = nib(text[i + 1]);
    if (hi < 0 || lo < 0) return std::string();
    o.push_back(static_cast<char>(hi * 16 + lo));
  }
  return o;
}

std::string cleanName(std::string s) {
  for (char& ch : s) if (!((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '_')) ch = '-';
  if (s.size() > 40) s.resize(40);
  return s.empty() ? "zinc" : s;
}

bool safeRel(const std::string& name) {
  if (name.empty()) return true;
  if (name[0] == '/' || name.find('\0') != std::string::npos) return false;
  size_t at = 0;
  while (at <= name.size()) {
    const size_t end = std::min(name.find('/', at), name.size());
    const std::string part = name.substr(at, end - at);
    if (part.empty() || part == "." || part == "..") return false;
    at = end + 1;
  }
  return true;
}

}  // namespace zn::agent
