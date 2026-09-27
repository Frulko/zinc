#include "zrt.h"
#include "mod/osc.h"
#include "mod/sock.h"

namespace zrt { namespace osc {
static int tx = -1;
static void pad_str(StrBuilder& b, const String& s) { to_s(b, s); uint32_t n = s.bytes() + 1; b.ch('\0'); while (n % 4) { b.ch('\0'); n++; } }
static void be32(StrBuilder& b, uint32_t v) { char c[4] = {(char)(v >> 24), (char)(v >> 16), (char)(v >> 8), (char)v}; b.raw(c, 4); }
void send(const String& host, int32_t port, const String& address, const Array<double>& numbers, const Array<String>& strings) {
  if (tx < 0) tx = sock::udp_bind(0);
  StrBuilder b, tags;
  tags.ch(',');
  int32_t nn = numbers.a ? numbers.length() : 0, ns = strings.a ? strings.length() : 0;
  for (int32_t i = 0; i < nn; i++) { double v = numbers.get(i); tags.ch(v == (double)(int32_t)v ? 'i' : 'f'); }
  for (int32_t i = 0; i < ns; i++) tags.ch('s');
  pad_str(b, address); pad_str(b, tags.build());
  for (int32_t i = 0; i < nn; i++) {
    double v = numbers.get(i);
    if (v == (double)(int32_t)v) be32(b, (uint32_t)(int32_t)v);
    else { float f = (float)v; uint32_t u; __builtin_memcpy(&u, &f, 4); be32(b, u); }
  }
  for (int32_t i = 0; i < ns; i++) pad_str(b, strings.get(i));
  sockaddr_in a; sock::CStr h(host);
  if (sock::resolve(h.c(), port, &a)) sendto(tx, b.buf, b.len, 0, (sockaddr*)&a, sizeof a);
}
static uint32_t rd32(const uint8_t* p) { return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 | p[3]; }
static int32_t str_at(const uint8_t* p, int32_t n, int32_t off, String* out) {
  int32_t e = off; while (e < n && p[e]) e++;
  if (e >= n) return -1;
  *out = String::from((const char*)p + off, (uint32_t)(e - off));
  return (e + 4) & ~3;
}
struct Listener : Poller {
  int fd; Fn<void(Ref<OscMessage>)> cb;
  void shutdown() override { cb = nullptr; }
  bool poll() override {
    uint8_t buf[2048];
    for (;;) {
      ssize_t n = recv(fd, buf, sizeof buf, 0);
      if (n <= 0) return fd >= 0;
      auto m = make<OscMessage>();
      String tags;
      int32_t off = str_at(buf, (int32_t)n, 0, &m->address);
      if (off < 0) continue;
      off = str_at(buf, (int32_t)n, off, &tags);
      if (off < 0) continue;
      for (uint32_t t = 1; t < tags.bytes() && off <= n; t++) {
        char c = tags.ptr()[t];
        if (c == 'i' && off + 4 <= n) { m->numbers.push((double)(int32_t)rd32(buf + off)); off += 4; }
        else if (c == 'f' && off + 4 <= n) { uint32_t u = rd32(buf + off); float f; __builtin_memcpy(&f, &u, 4); m->numbers.push((double)f); off += 4; }
        else if (c == 'd' && off + 8 <= n) { uint64_t u = (uint64_t)rd32(buf + off) << 32 | rd32(buf + off + 4); double d; __builtin_memcpy(&d, &u, 8); m->numbers.push(d); off += 8; }
        else if (c == 'T' || c == 'F') m->numbers.push(c == 'T' ? 1 : 0);
        else if (c == 's') { String s; off = str_at(buf, (int32_t)n, off, &s); if (off < 0) break; m->strings.push(s); }
        else break;
      }
      cb(m);
      check_uncaught();
    }
  }
};
static Listener* listener = nullptr;
void listen(int32_t port, Fn<void(Ref<OscMessage>)> cb) {
  int fd = sock::udp_bind(port);
  if (fd < 0) { g_err = make<Error>(String::from("osc: cannot bind port", 21)); return; }
  listener = new (alloc(sizeof(Listener))) Listener();
  listener->fd = fd; listener->cb = cb;
  add_poller(listener);
}
void close() { if (listener && listener->fd >= 0) { ::close(listener->fd); listener->fd = -1; listener->cb = nullptr; } }
}}
