// DevTools protocol transport for macos/linux/rpi1: a non-blocking TCP server polled by the event loop.
// HTTP: /json/list and /json/version (chrome://inspect discovery), then a WebSocket upgrade (RFC 6455, text
// frames, ping/close). Sockets survive a hot reload: shutdown() leaves them open and names them in
// ZINC_DEVTOOLS_FDS, the next version adopts them, so the DevTools window stays connected.
#include "zinc_native_cdp.h"
#include <sys/socket.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <fcntl.h>
#include <poll.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>

namespace {
// ---- SHA-1 + base64, for Sec-WebSocket-Accept only
void sha1(const uint8_t* msg, size_t len, uint8_t out[20]) {
  uint32_t h[5] = {0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0};
  size_t total = ((len + 8) / 64 + 1) * 64;
  uint8_t buf[256];
  if (total > sizeof buf) return;
  memset(buf, 0, total);
  memcpy(buf, msg, len);
  buf[len] = 0x80;
  uint64_t bits = (uint64_t)len * 8;
  for (int i = 0; i < 8; i++) buf[total - 1 - i] = (uint8_t)(bits >> (8 * i));
  auto rol = [](uint32_t x, int n) { return (x << n) | (x >> (32 - n)); };
  for (size_t off = 0; off < total; off += 64) {
    uint32_t w[80];
    for (int i = 0; i < 16; i++) w[i] = (uint32_t)buf[off + 4 * i] << 24 | (uint32_t)buf[off + 4 * i + 1] << 16 | (uint32_t)buf[off + 4 * i + 2] << 8 | buf[off + 4 * i + 3];
    for (int i = 16; i < 80; i++) w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    uint32_t a = h[0], b = h[1], c = h[2], d = h[3], e = h[4];
    for (int i = 0; i < 80; i++) {
      uint32_t f = i < 20 ? (b & c) | (~b & d) : i < 40 ? b ^ c ^ d : i < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
      uint32_t k = i < 20 ? 0x5A827999 : i < 40 ? 0x6ED9EBA1 : i < 60 ? 0x8F1BBCDC : 0xCA62C1D6;
      uint32_t t = rol(a, 5) + f + e + k + w[i];
      e = d; d = c; c = rol(b, 30); b = a; a = t;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e;
  }
  for (int i = 0; i < 20; i++) out[i] = (uint8_t)(h[i / 4] >> (24 - 8 * (i % 4)));
}
void base64(const uint8_t* in, int n, char* out) {
  static const char* t = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  int o = 0;
  for (int i = 0; i < n; i += 3) {
    uint32_t v = (uint32_t)in[i] << 16 | (i + 1 < n ? (uint32_t)in[i + 1] << 8 : 0) | (i + 2 < n ? in[i + 2] : 0);
    out[o++] = t[v >> 18]; out[o++] = t[(v >> 12) & 63];
    out[o++] = i + 1 < n ? t[(v >> 6) & 63] : '=';
    out[o++] = i + 2 < n ? t[v & 63] : '=';
  }
  out[o] = 0;
}

// ---- tiny JSON field lookup: value of the first "key": (CDP puts id and method first)
const char* field(const zrt::String& msg, const char* key) {
  char pat[64];
  snprintf(pat, sizeof pat, "\"%s\":", key);
  const char* p = strstr(msg.ptr(), pat);
  if (!p) return nullptr;
  p += strlen(pat);
  while (*p == ' ' || *p == '[') p++;  // arrays: first element
  return p;
}

zrt::String lit(const char* s) { return zrt::String::from(s, (uint32_t)strlen(s)); }

bool write_all(int fd, const char* p, size_t n) {
  while (n) {
    ssize_t w = ::write(fd, p, n);
    if (w > 0) { p += w; n -= (size_t)w; continue; }
    pollfd q = {fd, POLLOUT, 0};
    if (poll(&q, 1, 1000) <= 0) return false;  // ponytail: a stuck client blocks the frame up to 1 s, then is dropped
  }
  return true;
}

struct Client { int fd = -1; bool ws = false; int n = 0; char in[65536]; };
const int MAXC = 4;
const int RING = 32;  // console messages replayed to a client that enables Runtime late

struct HostCdp : NativeCdp, zrt::Poller {
  int lfd = -1;
  Client cl[MAXC];
  zrt::Fn<void(int32_t, zrt::String)> cb;
  bool polling = false;
  zrt::String ring[RING];
  int ring_n = 0;

  bool listen(int32_t port, zrt::Fn<void(int32_t, zrt::String)> onMessage) override {
#ifdef ZP_DEVTOOLS_PORT
    port = ZP_DEVTOOLS_PORT;  // zinc.json plugins.devtools.port
#endif
    cb = onMessage;
    if (!polling) { polling = true; zrt::add_poller(this); }
    zrt::inspector_log = on_log;
    if (const char* e = getenv("ZINC_DEVTOOLS_FDS")) {  // hot reload: adopt the previous version's sockets
      char* end;
      lfd = (int)strtol(e, &end, 10);
      for (int i = 0; i < MAXC && *end == ','; i++) { cl[i].fd = (int)strtol(end + 1, &end, 10); cl[i].ws = true; }
      unsetenv("ZINC_DEVTOOLS_FDS");
      send(-1, lit("{\"method\":\"Runtime.executionContextsCleared\",\"params\":{}}"));
      send(-1, context());
      send(-1, lit("{\"method\":\"DOM.documentUpdated\",\"params\":{}}"));
      return true;
    }
    lfd = socket(AF_INET, SOCK_STREAM, 0);
    int one = 1;
    setsockopt(lfd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof one);
    sockaddr_in a = {};
    a.sin_family = AF_INET;
    a.sin_port = htons((uint16_t)port);
    a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);  // remote devices: ssh -L 9229:127.0.0.1:9229 (zinc dev --device does it)
    if (bind(lfd, (sockaddr*)&a, sizeof a) || ::listen(lfd, 4)) {
      fprintf(stderr, "zinc devtools: port %d unavailable\n", port);
      close(lfd); lfd = -1;
      return false;
    }
    fcntl(lfd, F_SETFL, O_NONBLOCK);
    fprintf(stderr, "zinc devtools: chrome://inspect (Discover network targets: localhost:%d) or ws://127.0.0.1:%d/zinc\n", port, port);
    return true;
  }
  static zrt::String context() {
    static const char s[] = "{\"method\":\"Runtime.executionContextCreated\",\"params\":{\"context\":{\"id\":1,\"origin\":\"zinc://app\",\"name\":\"zinc\",\"uniqueId\":\"zinc-1\",\"auxData\":{\"isDefault\":true,\"type\":\"default\",\"frameId\":\"main\"}}}}";
    return zrt::String::from(s, sizeof s - 1);
  }
  static void on_log(int level, const char* s, uint32_t n);

  void send(int32_t client, zrt::String msg) override {
    uint32_t n = msg.bytes();
    char hdr[10];
    int h = 0;
    hdr[h++] = (char)0x81;
    if (n < 126) hdr[h++] = (char)n;
    else if (n < 65536) { hdr[h++] = 126; hdr[h++] = (char)(n >> 8); hdr[h++] = (char)n; }
    else { hdr[h++] = 127; for (int i = 7; i >= 0; i--) hdr[h++] = (char)((uint64_t)n >> (8 * i)); }
    for (int i = 0; i < MAXC; i++) {
      Client& c = cl[i];
      if (c.fd < 0 || !c.ws || (client >= 0 && client != i)) continue;
      if (!write_all(c.fd, hdr, (size_t)h) || !write_all(c.fd, msg.ptr(), n)) drop(c);
    }
  }
  double num(zrt::String msg, zrt::String key) override { const char* p = field(msg, key.ptr()); return p ? atof(p) : 0; }
  zrt::String str(zrt::String msg, zrt::String key) override {
    const char* p = field(msg, key.ptr());
    if (!p || *p != '"') return zrt::String();
    zrt::StrBuilder sb;
    for (p++; *p && *p != '"'; p++) {
      if (*p != '\\' || !p[1]) { sb.ch(*p); continue; }
      p++;
      sb.ch(*p == 'n' ? '\n' : *p == 't' ? '\t' : *p);  // ponytail: \uXXXX escapes are kept as is
    }
    return sb.build();
  }
  int32_t clients() override { int k = 0; for (auto& c : cl) if (c.fd >= 0 && c.ws) k++; return k; }

  void drop(Client& c) { if (c.fd >= 0) close(c.fd); c.fd = -1; c.ws = false; c.n = 0; }

  void http(Client& c) {
    char* end = strstr(c.in, "\r\n\r\n");
    if (!end) return;
    *end = 0;
    char host[128] = "127.0.0.1:9229";
    if (const char* h = strcasestr(c.in, "\r\nHost:")) { h += 7; while (*h == ' ') h++; int i = 0; while (h[i] && h[i] != '\r' && i < 127) { host[i] = h[i]; i++; } host[i] = 0; }
    char out[1024];
    if (const char* k = strcasestr(c.in, "\r\nSec-WebSocket-Key:")) {
      k += 20; while (*k == ' ') k++;
      char key[128]; int i = 0;
      while (k[i] && k[i] != '\r' && i < 60) { key[i] = k[i]; i++; }
      key[i] = 0;
      strcat(key, "258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
      uint8_t d[20]; char acc[32];
      sha1((const uint8_t*)key, strlen(key), d);
      base64(d, 20, acc);
      int n = snprintf(out, sizeof out, "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: %s\r\n\r\n", acc);
      write_all(c.fd, out, (size_t)n);
      c.ws = true; c.n = 0;
      return;
    }
    char body[768];
    if (!strncmp(c.in, "GET /json/version", 17)) snprintf(body, sizeof body, "{\"Browser\":\"Zinc/0.1\",\"Protocol-Version\":\"1.3\"}");
    else if (!strncmp(c.in, "GET /json", 9))
      snprintf(body, sizeof body, "[{\"description\":\"Zinc UI\",\"devtoolsFrontendUrl\":\"devtools://devtools/bundled/inspector.html?ws=%s/zinc\","
               "\"id\":\"zinc\",\"title\":\"Zinc app (%s)\",\"type\":\"page\",\"url\":\"zinc://app\",\"webSocketDebuggerUrl\":\"ws://%s/zinc\"}]", host, ZRT_PLATFORM, host);
    else snprintf(body, sizeof body, "Zinc DevTools endpoint: open chrome://inspect");
    int n = snprintf(out, sizeof out, "HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=UTF-8\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s", (int)strlen(body), body);
    write_all(c.fd, out, (size_t)n);
    drop(c);
  }
  // Complete frames in c.in: text -> onMessage, ping -> pong, close -> drop.
  void frames(int idx) {
    Client& c = cl[idx];
    while (c.n >= 2) {
      uint8_t* b = (uint8_t*)c.in;
      int op = b[0] & 15, hl = 2;
      uint64_t len = b[1] & 127;
      if (len == 126) { if (c.n < 4) return; len = (uint64_t)b[2] << 8 | b[3]; hl = 4; }
      else if (len == 127) { if (c.n < 10) return; len = 0; for (int i = 0; i < 8; i++) len = len << 8 | b[2 + i]; hl = 10; }
      bool masked = b[1] & 128;
      if (masked) hl += 4;
      if (len > sizeof c.in - 16) { drop(c); return; }
      if ((uint64_t)c.n < hl + len) return;
      uint8_t* p = b + hl;
      if (masked) for (uint64_t i = 0; i < len; i++) p[i] ^= b[hl - 4 + (i & 3)];
      zrt::String msg = zrt::String::from((const char*)p, (uint32_t)len);
      int used = hl + (int)len;
      memmove(c.in, c.in + used, (size_t)(c.n - used));
      c.n -= used;
      if (op == 8) { drop(c); return; }
      if (op == 9) { char pong[2] = {(char)0x8A, 0}; write_all(c.fd, pong, 2); continue; }
      if (op != 1 || !cb) continue;
      bool replay = strstr(msg.ptr(), "\"method\":\"Runtime.enable\"") != nullptr;
      cb(idx, msg);
      if (replay) for (int k = ring_n > RING ? ring_n - RING : 0; k < ring_n; k++) send(idx, ring[k % RING]);
    }
  }
  bool poll() override {
    if (lfd < 0) return false;
    for (int fd; (fd = accept(lfd, nullptr, nullptr)) >= 0;) {
      int one = 1;
      setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &one, sizeof one);
      fcntl(fd, F_SETFL, O_NONBLOCK);
      Client* c = nullptr;
      for (auto& x : cl) if (x.fd < 0) { c = &x; break; }
      if (!c) { close(fd); continue; }
      c->fd = fd; c->ws = false; c->n = 0;
    }
    for (int i = 0; i < MAXC; i++) {
      Client& c = cl[i];
      if (c.fd < 0) continue;
      ssize_t r = read(c.fd, c.in + c.n, sizeof c.in - 1 - (size_t)c.n);
      if (r == 0) { drop(c); continue; }
      if (r < 0) continue;
      c.n += (int)r;
      c.in[c.n] = 0;
      if (c.ws) frames(i); else http(c);
      if (c.fd >= 0 && c.n >= (int)sizeof c.in - 1) drop(c);
    }
    return false;
  }
  // Hot reload / restart: hand the sockets to the next version instead of closing them.
  void shutdown() override {
    zrt::inspector_log = nullptr;
    cb = nullptr;
    for (auto& s : ring) s = zrt::String();
    if (lfd < 0) return;
    char env[128];
    int n = snprintf(env, sizeof env, "%d", lfd);
    for (auto& c : cl) if (c.fd >= 0 && c.ws) n += snprintf(env + n, sizeof env - (size_t)n, ",%d", c.fd);
    setenv("ZINC_DEVTOOLS_FDS", env, 1);
    lfd = -1;
  }
};
HostCdp inst;

void HostCdp::on_log(int level, const char* s, uint32_t n) {
  static const char* types[] = {"log", "info", "debug", "warning", "error", "trace"};
  zrt::StrBuilder sb;
  sb.cstr("{\"method\":\"Runtime.consoleAPICalled\",\"params\":{\"type\":\"");
  sb.cstr(types[level < 0 || level > 5 ? 0 : level]);
  sb.cstr("\",\"args\":[{\"type\":\"string\",\"value\":");
  zrt::json_str(sb, zrt::String::from(s, n));
  sb.cstr("}],\"executionContextId\":1,\"timestamp\":");
  zrt::str_num(sb, zrt::now_ms());
  sb.cstr("}}");
  zrt::String m = sb.build();
  inst.ring[inst.ring_n++ % RING] = m;
  inst.send(-1, m);
}
}  // namespace

NativeCdp* zinc_create_Cdp() {
  inst.rc = zrt::IMMORTAL;
  return &inst;
}
