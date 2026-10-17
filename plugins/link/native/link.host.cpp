// zinc:link for macos, linux and android (docs/plugins/link.md): the protocol of `zinc agent` between two programs. A connection starts with
// one line in clear ("ZNL1 pair" or "ZNL1 sess", answered "ZNL1 ok" or "ZNL1 closed"), then TLS: EC J-PAKE with the code for a pairing,
// TLS 1.3 PSK with an ephemeral key exchange for a session, by the key the pairing gave. Inside, frames of src/net/frame.h.
// Everything runs on the program's thread, in next(), which index.ts calls on a timer: no thread, so the mbedTLS of the process (built
// without thread support) is never entered twice at once, and no native callback (the QuickJS engine has none). The TLS code is the engine's src/host/tls.cpp compiled in under the namespace
// zn::linktls (plugin.json: zinc does not export its C++ to a library it loads); discovery is src/net/dnssd.cpp, the agent's.
#define ZRT_HOSTED_CPP   // the standard library's placement new, not zrt.h's (this file uses <string>, <map>, <functional>)
#include "zinc_native_link.h"

#include "host/tls.h"
#include "net/dnssd.h"
#include "net/frame.h"
#include "zn/limits.h"

#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <ifaddrs.h>
#include <net/if.h>
#include <netdb.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <poll.h>
#include <signal.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <unistd.h>

#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <map>
#include <string>
#include <vector>

namespace tls = zn::ZN_TLS_NS;

namespace {

const char* const kService = "_zinclink._tcp.local.";
const int kDialMs = 5000, kHandshakeMs = 15000, kPingMs = 15000, kSilentMs = 45000, kPairSeconds = 300;
#ifdef MSG_NOSIGNAL
const int kSendFlags = MSG_NOSIGNAL;
#else
const int kSendFlags = 0;
#endif

enum Kind { FOUND = 0, PAIRED = 1, OPEN = 2, ACCEPT = 3, MESSAGE = 4, BYTES = 5, CLOSE = 6, PAIRING = 7 };
// frames inside a session or a pairing
enum : char { kJson = 'J', kBytes = 'B', kPing = 'P', kAsk = 'Q', kAnswer = 'A', kRefuse = 'R' };

int64_t nowMs() { return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now().time_since_epoch()).count(); }

std::string hex(const std::string& b) {
  static const char* d = "0123456789abcdef";
  std::string o;
  for (unsigned char ch : b) { o.push_back(d[ch >> 4]); o.push_back(d[ch & 15]); }
  return o;
}
std::string unhex(const std::string& t) {
  auto nib = [](char ch) { return ch >= '0' && ch <= '9' ? ch - '0' : ch >= 'a' && ch <= 'f' ? ch - 'a' + 10 : -1; };
  std::string o;
  for (size_t i = 0; i + 1 < t.size(); i += 2) {
    const int hi = nib(t[i]), lo = nib(t[i + 1]);
    if (hi < 0 || lo < 0) return std::string();
    o.push_back(static_cast<char>(hi * 16 + lo));
  }
  return o;
}
std::string json(const std::string& s) {
  std::string o = "\"";
  for (unsigned char ch : s) {
    if (ch == '"' || ch == '\\') { o.push_back('\\'); o.push_back(static_cast<char>(ch)); }
    else if (ch < 0x20) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", ch); o += b; }
    else o.push_back(static_cast<char>(ch));
  }
  return o + "\"";
}
// A name as one field of a line of the store or of a pairing message: no tab, no line break, at most 63 bytes.
std::string field(std::string s) {
  for (char& ch : s) if (ch == '\t' || ch == '\n' || ch == '\r') ch = ' ';
  if (s.size() > 63) s.resize(63);
  return s;
}
// What a DNS label can hold, for the instance's name (the name shown is in its TXT record).
std::string label(std::string s) {
  for (char& ch : s) if (!((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '-')) ch = '-';
  if (s.size() > 40) s.resize(40);
  return s.empty() ? "zinc" : s;
}
std::vector<std::string> split(const std::string& s, char sep) {
  std::vector<std::string> out;
  size_t at = 0;
  for (;;) {
    const size_t e = s.find(sep, at);
    out.push_back(s.substr(at, e == std::string::npos ? std::string::npos : e - at));
    if (e == std::string::npos) return out;
    at = e + 1;
  }
}

struct Peer { std::string id, key, host, service, name; int port = 0; };

struct Conn {
  enum Phase { Dialing, Line, Tls, Open, Done } phase = Dialing;
  int fd = -1;
  bool server = false, pairing = false, shown = false;   // shown: the program has its handle (returned, or ACCEPT sent)
  std::string code, peer, host;   // the code typed (a client's pairing), the peer's id (a client's session; the server's once proven)
  int port = 0;
  std::string raw, out, in;       // bytes before TLS, encrypted bytes not yet sent, decrypted bytes not yet framed
  tls::Conn* t = nullptr;
  bool ready = false, eof = false;
  int64_t since = 0, heard = 0, said = 0;
};

zrt::Array<uint8_t> bytesOf(const char* p, size_t n) {
  zrt::Array<uint8_t> r = zrt::Array<uint8_t>::with_cap(static_cast<int32_t>(n));
  for (size_t i = 0; i < n; ++i) r.push_raw(static_cast<uint8_t>(p[i]));
  return r;
}

void prepare(int fd) {
  ::fcntl(fd, F_SETFL, ::fcntl(fd, F_GETFL, 0) | O_NONBLOCK);
  ::fcntl(fd, F_SETFD, FD_CLOEXEC);
  int one = 1;
  ::setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &one, sizeof one);
#ifdef SO_NOSIGPIPE
  ::setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &one, sizeof one);
#endif
}

}  // namespace

struct Event { int32_t h, kind; std::string text, bytes; };

struct HostLink : NativeLink, zrt::Poller {
  std::deque<Event> events;
  std::string lastBytes;
  bool hooked = false;
  std::string err, storePath, selfId, selfName;
  std::vector<Peer> peerList;
  int listener = -1, listenPort = 0;
  zn::dnssd::Responder responder;
  std::string advService, advName;
  zn::dnssd::Browser browser;
  std::string browseService;
  std::string code;   // the server's open pairing
  int tries = 0;
  int64_t codeUntil = 0;
  std::map<int32_t, Conn> conns;
  int32_t nextHandle = 1;

  // ---- events ----
  void emit(int32_t h, int32_t kind, const std::string& text, const char* data = nullptr, size_t n = 0) {
    events.push_back(Event{h, kind, text, data ? std::string(data, n) : std::string()});
  }
  zrt::String next() override {
    if (events.empty()) step();
    if (events.empty()) return str("");
    const Event e = events.front();
    events.pop_front();
    lastBytes = e.bytes;
    return str(std::to_string(e.kind) + "\x1f" + std::to_string(e.h) + "\x1f" + e.text);
  }
  zrt::Array<uint8_t> bytes() override { return bytesOf(lastBytes.data(), lastBytes.size()); }
  // the Poller only for shutdown(): the work is done in next(), so it never holds the loop
  void start() { if (!hooked) { hooked = true; zrt::add_poller(this); } }
  bool poll() override { return false; }
  zrt::String str(const std::string& s) { return zrt::String::from(s.data(), static_cast<uint32_t>(s.size())); }
  zrt::String error() override { return str(err); }

  // ---- the store: this program's id and its peers' keys, a file only its user reads ----
  static std::string defaultStore() {
    const char* zh = std::getenv("ZINC_HOME");
    const char* home = std::getenv("HOME");
    const std::string base = zh && *zh ? std::string(zh) : std::string(home && *home ? home : ".") + "/.zinc";
    const char* app = std::getenv("ZINC_APP_NAME");
    return base + "/link/" + label(app && *app ? app : "app") + ".keys";
  }
  void load() {
    peerList.clear();
    selfId.clear();
    FILE* f = std::fopen(storePath.c_str(), "rb");
    if (f) {
      char line[1024];
      while (std::fgets(line, sizeof line, f)) {
        std::string l = line;
        while (!l.empty() && (l.back() == '\n' || l.back() == '\r')) l.pop_back();
        const std::vector<std::string> p = split(l, '\t');
        if (p.size() == 2 && p[0] == "self") selfId = p[1];
        else if (p.size() == 7 && p[0] == "peer") {
          Peer pe{p[1], unhex(p[2]), p[3], p[5], p[6], std::atoi(p[4].c_str())};
          if (pe.id.size() == 16 && pe.key.size() == 32) peerList.push_back(pe);
        }
      }
      std::fclose(f);
    }
    if (selfId.size() != 16) { selfId = hex(tls::randomBytes(8)); save(); }
  }
  bool save() {
    const size_t slash = storePath.find_last_of('/');
    if (slash != std::string::npos) {   // the directories, made private
      std::string dir;
      for (const std::string& part : split(storePath.substr(0, slash), '/')) { dir += part + "/"; if (part.empty()) continue; ::mkdir(dir.c_str(), 0700); }
    }
    std::string text = "zinclink 1\nself\t" + selfId + "\n";
    for (const Peer& p : peerList) text += "peer\t" + p.id + "\t" + hex(p.key) + "\t" + p.host + "\t" + std::to_string(p.port) + "\t" + field(p.service) + "\t" + field(p.name) + "\n";
    const std::string tmp = storePath + ".tmp";
    const int fd = ::open(tmp.c_str(), O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0600);
    if (fd < 0) { err = storePath + ": " + std::strerror(errno); return false; }
    const bool ok = ::write(fd, text.data(), text.size()) == static_cast<ssize_t>(text.size());
    ::close(fd);
    if (!ok || ::rename(tmp.c_str(), storePath.c_str()) != 0) { err = storePath + ": cannot be written"; return false; }
    return true;
  }
  Peer* findPeer(const std::string& id) { for (Peer& p : peerList) if (p.id == id) return &p; return nullptr; }
  void keep(const Peer& p) {
    if (Peer* old = findPeer(p.id)) *old = p; else peerList.push_back(p);
    save();
  }
  std::string peerJson(const Peer& p) {
    return "{\"id\":" + json(p.id) + ",\"name\":" + json(p.name) + ",\"host\":" + json(p.host) + ",\"port\":" + std::to_string(p.port) + ",\"service\":" + json(p.service) + "}";
  }
  std::string peerJson(const std::string& id) { Peer* p = findPeer(id); return p ? peerJson(*p) : peerJson(Peer{id, "", "", "", "", 0}); }

  zrt::String init(zrt::String store, zrt::String name) override {
    storePath = store.bytes() ? std::string(store.ptr(), store.bytes()) : defaultStore();
    selfName = field(std::string(name.ptr(), name.bytes()));
    load();
    signal(SIGPIPE, SIG_IGN);   // a peer that vanished: send returns EPIPE (Linux has MSG_NOSIGNAL, macOS SO_NOSIGPIPE; this for the rest)
    start();
    return str(selfId);
  }
  zrt::String peers() override {
    std::string o = "[";
    for (const Peer& p : peerList) o += (o.size() > 1 ? "," : "") + peerJson(p);
    return str(o + "]");
  }
  bool forget(zrt::String id) override {
    const std::string s(id.ptr(), id.bytes());
    bool had = false;
    for (size_t i = 0; i < peerList.size(); ++i) if (peerList[i].id == s) { peerList.erase(peerList.begin() + static_cast<long>(i)); had = true; break; }
    if (!had) return false;
    save();
    std::vector<int32_t> gone;
    for (auto& [h, c] : conns) if (c.peer == s && !c.pairing) gone.push_back(h);
    for (int32_t h : gone) end(h, "forgotten", true);
    return true;
  }

  // ---- the server ----
  int32_t listen(int32_t port) override {
    if (listener >= 0) return listenPort;
    const int s = ::socket(AF_INET, SOCK_STREAM, 0);
    if (s < 0) { err = std::strerror(errno); return -1; }
    int one = 1;
    ::setsockopt(s, SOL_SOCKET, SO_REUSEADDR, &one, sizeof one);
    sockaddr_in a{};
    a.sin_family = AF_INET;
    a.sin_addr.s_addr = htonl(INADDR_ANY);
    a.sin_port = htons(static_cast<uint16_t>(port));
    if (::bind(s, reinterpret_cast<sockaddr*>(&a), sizeof a) != 0 || ::listen(s, 16) != 0) { err = "port " + std::to_string(port) + ": " + std::strerror(errno); ::close(s); return -1; }
    socklen_t n = sizeof a;
    ::getsockname(s, reinterpret_cast<sockaddr*>(&a), &n);
    prepare(s);
    listener = s;
    listenPort = ntohs(a.sin_port);
    start();
    return listenPort;
  }
  zn::dnssd::Txt txt() {
    return {{"id", selfId}, {"svc", advService}, {"name", selfName}, {"pair", code.empty() ? "0" : "1"}, {"v", "1"}};
  }
  bool advertise(zrt::String service, zrt::String name) override {
    advService = std::string(service.ptr(), service.bytes());
    if (name.bytes()) selfName = field(std::string(name.ptr(), name.bytes()));
    responder.close();
    if (advService.empty()) return true;
    if (listener < 0) { err = "advertise: listen first"; return false; }
    if (!responder.open(kService, label(selfName) + "-" + selfId.substr(0, 6), listenPort, "0.0.0.0", [this] { return txt(); })) { err = "this machine has no multicast"; return false; }
    start();
    return true;
  }
  zrt::String openPairing() override {
    if (listener < 0) { err = "openPairing: listen first"; return str(""); }
    const std::string r = tls::randomBytes(4);
    if (r.size() != 4) { err = "no random numbers"; return str(""); }
    uint32_t v = 0;
    std::memcpy(&v, r.data(), 4);
    char c[8];
    std::snprintf(c, sizeof c, "%06u", v % 1000000u);
    code = c;
    tries = 0;
    codeUntil = nowMs() + kPairSeconds * 1000;
    announceAgain();
    return str(code);
  }
  void closePairing() override { if (!code.empty()) { code.clear(); announceAgain(); } }
  void announceAgain() {   // the pairing flag of the TXT record changed: say it unasked
    if (responder.sock >= 0) { const std::string s = advService; zrt::String a = str(s), b = str(""); advertise(a, b); }
  }

  // ---- the client ----
  int32_t dial(const std::string& host, int port, Conn& c) {
    addrinfo hints{};
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_STREAM;
    addrinfo* list = nullptr;
    // ponytail: getaddrinfo blocks for a name (a .local name asks the system's resolver); addresses, the usual case, return at once
    if (::getaddrinfo(host.c_str(), std::to_string(port).c_str(), &hints, &list) != 0 || !list) { err = "no address for " + host; return -1; }
    const int s = ::socket(list->ai_family, list->ai_socktype, list->ai_protocol);
    if (s < 0) { ::freeaddrinfo(list); err = std::strerror(errno); return -1; }
    prepare(s);
    const int rc = ::connect(s, list->ai_addr, list->ai_addrlen);
    ::freeaddrinfo(list);
    if (rc != 0 && errno != EINPROGRESS) { err = "nothing answers at " + host + ":" + std::to_string(port); ::close(s); return -1; }
    c.fd = s;
    c.host = host;
    c.port = port;
    c.since = c.heard = c.said = nowMs();
    c.shown = true;
    const int32_t h = nextHandle++;
    conns[h] = c;
    start();
    return h;
  }
  int32_t pair(zrt::String host, int32_t port, zrt::String pcode) override {
    Conn c;
    c.pairing = true;
    c.code = std::string(pcode.ptr(), pcode.bytes());
    return dial(std::string(host.ptr(), host.bytes()), port, c);
  }
  int32_t connect(zrt::String host, int32_t port, zrt::String peer) override {
    Conn c;
    c.peer = std::string(peer.ptr(), peer.bytes());
    if (!findPeer(c.peer)) { err = "not paired with " + c.peer; return -1; }
    return dial(std::string(host.ptr(), host.bytes()), port, c);
  }

  // ---- sending ----
  bool frame(Conn& c, char type, const std::string& payload) {
    if (!c.ready || payload.size() > zn::kMaxAgentFrame) return false;
    if (!tls::write(c.t, zn::net::frame(type, payload))) return false;
    c.out += tls::takeOutput(c.t);
    c.said = nowMs();
    flush(c);
    return true;
  }
  bool send(int32_t h, zrt::String text) override {
    auto it = conns.find(h);
    return it != conns.end() && it->second.phase == Conn::Open && frame(it->second, kJson, std::string(text.ptr(), text.bytes()));
  }
  bool sendBytes(int32_t h, int32_t kind, zrt::Array<uint8_t> data) override {
    auto it = conns.find(h);
    if (it == conns.end() || it->second.phase != Conn::Open || kind < 0 || kind > 255) return false;
    std::string p(1, static_cast<char>(kind));
    const int32_t n = data.a ? data.length() : 0;
    p.reserve(1 + static_cast<size_t>(n));
    for (int32_t i = 0; i < n; ++i) p.push_back(static_cast<char>(data.get(i)));
    return frame(it->second, kBytes, p);
  }
  void flush(Conn& c) {
    while (!c.out.empty() && c.fd >= 0) {
      const ssize_t n = ::send(c.fd, c.out.data(), c.out.size(), kSendFlags);
      if (n > 0) { c.out.erase(0, static_cast<size_t>(n)); continue; }
      if (n < 0 && errno == EINTR) continue;
      if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) return;
      c.eof = true;   // the peer is gone
      c.out.clear();
      return;
    }
  }
  void close(int32_t h) override { end(h, "", false); }
  // Ends a connection; the program hears CLOSE with `why` when `tell` and it has the handle.
  void end(int32_t h, const std::string& why, bool tell) {
    auto it = conns.find(h);
    if (it == conns.end()) return;
    Conn& c = it->second;
    if (c.t) {
      if (c.ready && c.fd >= 0) { tls::close(c.t); c.out += tls::takeOutput(c.t); flush(c); }
      tls::destroy(c.t);
    }
    if (c.fd >= 0) ::close(c.fd);
    const bool shown = c.shown;
    conns.erase(it);
    if (tell && shown) emit(h, CLOSE, why);
  }

  // ---- a turn: what the sockets hold ----
  void step() {
    const int64_t now = nowMs();
    responder.serve();
    for (int s : browser.socks) {
      zn::dnssd::Found f;
      for (int i = 0; i < 32 && browser.read(s, f); ++i) {
        if (f.get("svc") != browseService || f.get("id").size() != 16 || f.get("id") == selfId) continue;
        const std::string name = f.get("name").empty() ? f.name : f.get("name");
        emit(-1, FOUND, "{\"name\":" + json(name) + ",\"host\":" + json(f.host) + ",\"port\":" + std::to_string(f.port) + ",\"id\":" + json(f.get("id")) +
                            ",\"service\":" + json(browseService) + ",\"pairing\":" + (f.get("pair") == "1" ? "true" : "false") + "}");
      }
    }
    if (listener >= 0) {
      for (int i = 0; i < 16; ++i) {
        const int s = ::accept(listener, nullptr, nullptr);
        if (s < 0) break;
        prepare(s);
        Conn c;
        c.fd = s;
        c.server = true;
        c.phase = Conn::Line;
        c.since = c.heard = c.said = now;
        conns[nextHandle++] = c;
      }
    }
    if (!code.empty() && now > codeUntil) { code.clear(); announceAgain(); emit(-1, PAIRING, "closed"); }
    std::vector<int32_t> hs;
    for (auto& kv : conns) hs.push_back(kv.first);
    for (int32_t h : hs) turn(h, now);
  }

  void turn(int32_t h, int64_t now) {
    auto it = conns.find(h);
    if (it == conns.end()) return;
    Conn& c = it->second;
    if (c.phase == Conn::Dialing) {
      pollfd p{c.fd, POLLOUT, 0};
      if (::poll(&p, 1, 0) <= 0) { if (now - c.since > kDialMs) end(h, "nothing answers at " + c.host + ":" + std::to_string(c.port), true); return; }
      int soErr = 0;
      socklen_t n = sizeof soErr;
      if (::getsockopt(c.fd, SOL_SOCKET, SO_ERROR, &soErr, &n) != 0 || soErr != 0) { end(h, "nothing answers at " + c.host + ":" + std::to_string(c.port), true); return; }
      c.out += c.pairing ? "ZNL1 pair\n" : "ZNL1 sess\n";
      c.phase = Conn::Line;
      c.since = now;
    }
    char buf[16384];
    for (;;) {   // what the socket holds
      const ssize_t n = ::recv(c.fd, buf, sizeof buf, 0);
      if (n > 0) {
        c.heard = now;
        if (c.t) tls::feed(c.t, buf, static_cast<size_t>(n)); else c.raw.append(buf, static_cast<size_t>(n));
        continue;
      }
      if (n < 0 && errno == EINTR) continue;
      if (n == 0 || (errno != EAGAIN && errno != EWOULDBLOCK)) c.eof = true;
      break;
    }
    if (c.phase == Conn::Line && !line(h, c)) return;
    if (c.phase == Conn::Tls || c.phase == Conn::Open) {
      if (!c.ready) {
        const tls::State st = tls::step(c.t);
        c.out += tls::takeOutput(c.t);
        flush(c);
        if (st == tls::State::Failed || (st == tls::State::Handshaking && (c.eof || now - c.since > kHandshakeMs))) { refused(h, c); return; }
        if (st == tls::State::Ready) { c.ready = true; if (!ready(h, c)) return; }
      }
      if (c.ready) {
        const tls::State st = tls::read(c.t, c.in);
        c.out += tls::takeOutput(c.t);
        char type;
        std::string payload;
        bool bad = false;
        while (zn::net::takeFrame(c.in, zn::kMaxAgentFrame, type, payload, &bad)) if (!framed(h, type, payload)) return;
        it = conns.find(h);
        if (it == conns.end()) return;
        if (bad) { end(h, "the peer sent a frame too large", true); return; }
        if (st == tls::State::Closed) { end(h, "", true); return; }
        if (st == tls::State::Failed) { end(h, tls::error(c.t), true); return; }
      }
    }
    if (c.eof) { end(h, c.phase == Conn::Open ? "" : "the connection was closed", true); return; }
    if (c.phase == Conn::Open) {
      if (now - c.heard > kSilentMs) { end(h, "the peer stopped answering", true); return; }
      if (now - c.said > kPingMs && !frame(c, kPing, "")) { end(h, "the connection was lost", true); return; }
    } else if (c.phase == Conn::Done) {
      if (c.out.empty() || now - c.since > 2000) { end(h, "", false); return; }   // said what it had to say
    } else if (now - c.since > kHandshakeMs) {
      end(h, "no answer in time", true);
      return;
    }
    flush(c);
  }

  // The line in clear before TLS; false when the connection ended.
  bool line(int32_t h, Conn& c) {
    const size_t nl = c.raw.find('\n');
    if (nl == std::string::npos) {
      if (c.raw.size() > 64 || c.eof) { end(h, "what answers at " + c.host + ":" + std::to_string(c.port) + " is not a zinc:link program", true); return false; }
      flush(c);
      return true;
    }
    const std::string l = c.raw.substr(0, nl), rest = c.raw.substr(nl + 1);
    c.raw.clear();
    std::string e;
    if (c.server) {
      if (l == "ZNL1 pair") {
        if (code.empty() || tries >= 3) { c.out += "ZNL1 closed\n"; c.phase = Conn::Done; c.since = nowMs(); flush(c); return false; }
        ++tries;   // counted before the handshake: a try that never ends is a try
        c.pairing = true;
        c.out += "ZNL1 ok\n";
        c.t = tls::openPake(true, code, e);
      } else if (l == "ZNL1 sess") {
        c.out += "ZNL1 ok\n";
        c.t = tls::openPskServer([this](const std::string& id) { Peer* p = findPeer(id); return p ? p->key : std::string(); }, e);
      } else {
        end(h, "", false);
        return false;
      }
    } else if (l == "ZNL1 ok") {
      if (c.pairing) c.t = tls::openPake(false, c.code, e);
      else { Peer* p = findPeer(c.peer); c.t = p ? tls::openPskClient(selfId, p->key, e) : nullptr; if (!p) e = "not paired with " + c.peer; }
    } else if (l == "ZNL1 closed") {
      end(h, "the pairing is closed on the other side: open a new code there", true);
      return false;
    } else {
      end(h, "what answers at " + c.host + ":" + std::to_string(c.port) + " is not a zinc:link program", true);
      return false;
    }
    if (!c.t) { end(h, e, true); return false; }
    if (!rest.empty()) tls::feed(c.t, rest.data(), rest.size());
    c.phase = Conn::Tls;
    c.since = nowMs();
    return true;
  }

  // The handshake failed: a wrong code, or a key the other side does not hold.
  void refused(int32_t h, Conn& c) {
    if (c.server && c.pairing) {
      if (tries >= 3) { code.clear(); announceAgain(); emit(-1, PAIRING, "closed"); }
      else emit(-1, PAIRING, "try " + std::to_string(tries));
      end(h, "", false);
    } else if (c.pairing) {
      end(h, "wrong code (the other side closes the pairing after three)", true);
    } else {
      end(h, c.server ? "" : "the peer does not accept this program's key: pair again", !c.server);
    }
  }

  // TLS is up; false when the connection ended.
  bool ready(int32_t h, Conn& c) {
    if (c.pairing && !c.server) return frame(c, kAsk, selfId + "\t" + selfName) || (end(h, "the connection was lost", true), false);
    if (c.pairing) return true;   // the server waits for the request
    c.phase = Conn::Open;
    if (c.server) {
      c.peer = tls::pskIdentity(c.t);
      c.shown = true;
      emit(h, ACCEPT, peerJson(c.peer));
    } else {
      if (Peer* p = findPeer(c.peer); p && (p->host != c.host || p->port != c.port)) { p->host = c.host; p->port = c.port; save(); }   // where it is now
      emit(h, OPEN, peerJson(c.peer));
    }
    return conns.count(h) > 0;
  }

  // One frame; false when the connection ended.
  bool framed(int32_t h, char type, const std::string& payload) {
    Conn& c = conns[h];
    if (c.phase == Conn::Open) {
      if (type == kJson) emit(h, MESSAGE, payload);
      else if (type == kBytes && !payload.empty()) emit(h, BYTES, std::to_string(static_cast<unsigned char>(payload[0])), payload.data() + 1, payload.size() - 1);
      return conns.count(h) > 0;
    }
    if (c.server && type == kAsk) {   // a pairing that proved the code: the peer's identity, a new key for it
      const std::vector<std::string> p = split(payload, '\t');
      const std::string key = tls::randomBytes(32);
      if (p.size() != 2 || p[0].size() != 16 || key.size() != 32) { frame(c, kRefuse, "a request this program does not understand"); c.phase = Conn::Done; return false; }
      const Peer pe{p[0], key, "", advService, field(p[1]), 0};
      keep(pe);
      frame(c, kAnswer, selfId + "\t" + selfName + "\t" + hex(key));
      code.clear();   // one code, one peer
      announceAgain();
      c.phase = Conn::Done;
      c.since = nowMs();
      emit(-1, PAIRED, peerJson(pe));
      return false;
    }
    if (!c.server && type == kAnswer) {
      const std::vector<std::string> p = split(payload, '\t');
      const std::string key = p.size() == 3 ? unhex(p[2]) : std::string();
      if (p[0].size() != 16 || key.size() != 32) { end(h, "the other side answered something else", true); return false; }
      const Peer pe{p[0], key, c.host, browseService.empty() ? std::string() : browseService, field(p[1]), c.port};
      keep(pe);
      end(h, "", false);
      emit(h, PAIRED, peerJson(pe));
      return false;
    }
    if (!c.server && type == kRefuse) { end(h, payload, true); return false; }
    return true;
  }

  bool browse(zrt::String service) override {
    const std::string s(service.ptr(), service.bytes());
    if (s.empty()) { browser.close(); browseService.clear(); return true; }
    if (s != browseService || browser.socks.empty()) {
      browseService = s;
      if (!browser.open(kService)) { err = "this machine has no multicast"; return false; }
    }
    browser.ask();
    start();
    return true;
  }

  zrt::String addresses() override {
    std::string out;
    ifaddrs* list = nullptr;
    if (getifaddrs(&list) == 0) {
      for (ifaddrs* i = list; i; i = i->ifa_next) {
        if (!i->ifa_addr || i->ifa_addr->sa_family != AF_INET || !(i->ifa_flags & IFF_UP) || (i->ifa_flags & IFF_LOOPBACK)) continue;
        char ip[INET_ADDRSTRLEN] = "";
        inet_ntop(AF_INET, &reinterpret_cast<sockaddr_in*>(i->ifa_addr)->sin_addr, ip, sizeof ip);
        out += (out.empty() ? "" : ",") + std::string(ip);
      }
      freeifaddrs(list);
    }
    return str(out);
  }

  void shutdown() override {
    events.clear();
    std::vector<int32_t> hs;
    for (auto& kv : conns) hs.push_back(kv.first);
    for (int32_t h : hs) end(h, "", false);
    responder.close();
    browser.close();
    if (listener >= 0) { ::close(listener); listener = -1; }
  }
};

NativeLink* zinc_create_Link() {
  static HostLink inst;
  inst.rc = zrt::IMMORTAL;
  return &inst;
}
