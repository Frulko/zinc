// The session of the device agent: TLS (host/tls.h, mbedTLS) over a non-blocking socket, frames, JSON, file transfers. Every wait is a poll.
#include "wire.h"

#include "../host/tls.h"
#include "../net/frame.h"
#include "yyjson.h"

#include <arpa/inet.h>
#include <fcntl.h>
#include <netdb.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <poll.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <unistd.h>

#include <algorithm>
#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <mutex>
#include <sstream>

namespace zn::agent {

namespace fs = std::filesystem;
namespace tls = zn::tls;

namespace {

// mbedTLS is built without thread support (the engine calls it from one thread) and the agent has a thread per session: every call that
// reaches its crypto goes through this lock, never held across a wait. ponytail: one lock for all sessions; build mbedTLS with
// MBEDTLS_THREADING_PTHREAD when sessions need to encrypt in parallel (many large transfers at once).
std::mutex& crypto() {
  static std::mutex m;
  return m;
}
using Locked = std::lock_guard<std::mutex>;

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
  ::fcntl(fd, F_SETFD, FD_CLOEXEC);
  int one = 1;
  ::setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &one, sizeof one);
}

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

bool readFile(const std::string& path, std::string& out) {
  std::ifstream f(path, std::ios::binary);
  if (!f) return false;
  std::ostringstream s;
  s << f.rdbuf();
  out = s.str();
  return true;
}

bool writePrivate(const std::string& path, const std::string& data) {
  const std::string tmp = path + ".tmp";
  const int fd = ::open(tmp.c_str(), O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0600);
  if (fd < 0) return false;
  const bool ok = writeAll(fd, data.data(), data.size());
  ::close(fd);
  return ok && ::rename(tmp.c_str(), path.c_str()) == 0;
}

std::string hostName() {
  char b[256] = "";
  ::gethostname(b, sizeof b - 1);
  std::string s = b;
  return s.substr(0, s.find('.'));
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

namespace {

bool sendFile(Chan& c, const std::string& path, const std::string& rel, std::uint64_t& files, std::uint64_t& bytes, std::string& err, const Sent& sent) {
  const int fd = ::open(path.c_str(), O_RDONLY | O_CLOEXEC);
  struct stat st{};
  if (fd < 0 || ::fstat(fd, &st) != 0) { err = path + ": " + std::strerror(errno); if (fd >= 0) ::close(fd); return false; }
  bool ok = send(c, kJson, Obj().str("file", rel).num("mode", st.st_mode & 0777).num("size", static_cast<long long>(st.st_size)).done());
  char buf[kChunk];
  for (std::uint64_t left = static_cast<std::uint64_t>(st.st_size); ok && left > 0;) {
    const ssize_t n = ::read(fd, buf, static_cast<size_t>(std::min<std::uint64_t>(left, sizeof buf)));
    if (n <= 0) { err = path + " changed while it was read"; ok = false; break; }
    ok = send(c, kOut, std::string_view(buf, static_cast<size_t>(n)));
    left -= static_cast<std::uint64_t>(n);
    bytes += static_cast<std::uint64_t>(n);
    if (ok && sent) sent(bytes);
  }
  ::close(fd);
  if (ok) ++files;
  else if (err.empty()) err = "the connection was lost";
  return ok;
}

}  // namespace

bool sendTree(Chan& c, const std::string& path, std::uint64_t& files, std::uint64_t& bytes, std::string& err, const Sent& sent) {
  std::error_code ec;
  bool ok = true;
  const char* fault = std::getenv("ZINC_AGENT_FAULT");   // tests/t0/agent.sh: a sender that lies about a name, to see the receiver refuse it
  if (fs::is_regular_file(path, ec)) {
    ok = sendFile(c, path, fault && !std::strcmp(fault, "escape") ? "../escaped" : "", files, bytes, err, sent);
  } else if (fs::is_directory(path, ec)) {
    ok = send(c, kJson, Obj().str("dir", "").done());
    // ponytail: links and special files are left out (a link could name anything on the other side); add them when a tree needs its links
    for (auto it = fs::recursive_directory_iterator(path, fs::directory_options::skip_permission_denied, ec); ok && !ec && it != fs::recursive_directory_iterator(); it.increment(ec)) {
      const std::string rel = it->path().lexically_relative(path).generic_string();
      if (it->is_symlink(ec)) continue;
      if (it->is_directory(ec)) ok = send(c, kJson, Obj().str("dir", rel).done());
      else if (it->is_regular_file(ec)) ok = sendFile(c, it->path().string(), rel, files, bytes, err, sent);
    }
    if (!ok && err.empty()) err = "the connection was lost";
  } else {
    err = path + ": no such file or directory";
    ok = false;
  }
  if (ok) return send(c, kJson, Obj().flag("end", true).done());
  send(c, kJson, Obj().str("error", err).done());
  return false;
}

bool recvTree(Chan& c, const std::string& root, std::uint64_t& files, std::uint64_t& bytes, std::string& err) {
  std::string firstErr;   // kept until the sender is done: it is not reading us while it sends
  const auto note = [&](const std::string& e) { if (firstErr.empty()) firstErr = e; };
  const auto under = [&](const std::string& rel) { return rel.empty() ? root : root + "/" + rel; };
  int out = -1;
  std::uint64_t left = 0;
  for (;;) {
    char type;
    std::string payload;
    if (!recv(c, type, payload)) { if (out >= 0) ::close(out); err = "the connection ended during the transfer"; return false; }
    if (type == kOut) {
      if (payload.size() > left) { if (out >= 0) ::close(out); err = "the transfer does not follow its sizes"; return false; }
      left -= payload.size();
      if (out >= 0) {
        if (writeAll(out, payload.data(), payload.size())) bytes += payload.size();
        else { note(std::string("write: ") + std::strerror(errno)); ::close(out); out = -1; }
      }
      if (left == 0 && out >= 0) { ::close(out); out = -1; }
      continue;
    }
    if (type != kJson) continue;
    const Doc d(payload);
    if (left != 0 || !d.ok() || d.has("error")) {   // the sender gave up in the middle
      if (out >= 0) ::close(out);
      err = d.ok() && d.has("error") ? d.str("error") : "the transfer was interrupted";
      return false;
    }
    if (d.flag("end")) break;
    const bool isDir = d.has("dir");
    const std::string rel = d.str(isDir ? "dir" : "file");
    if (!isDir) left = static_cast<std::uint64_t>(d.num("size"));
    if (!safeRel(rel)) { note("refused: the name '" + rel + "' leaves the destination"); continue; }
    const std::string target = under(rel);
    std::error_code ec;
    if (isDir) {
      fs::create_directories(target, ec);
      if (ec) note(target + ": " + ec.message());
      continue;
    }
    if (fs::path(target).has_parent_path()) fs::create_directories(fs::path(target).parent_path(), ec);
    out = ::open(target.c_str(), O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0600);
    if (out < 0) { note(target + ": " + std::strerror(errno)); continue; }
    ::fchmod(out, static_cast<mode_t>(d.num("mode")) & 0777);
    ++files;
    if (left == 0) { ::close(out); out = -1; }
  }
  if (!firstErr.empty()) { err = firstErr; return false; }
  return true;
}

}  // namespace zn::agent
