#include "zrt.h"
#include "mod/mqtt.h"
#include "mod/sock.h"

namespace zrt { namespace mqtt {
struct Sub { String filter; Fn<void(String, String)> cb; };
struct Conn : Poller {
  int fd = -1;
  bool connected = false, dead = false;
  StrBuilder out, in;
  Array<Sub*> subs = Array<Sub*>::with_cap(0);
  Ref<PromiseObj<Unit>> on_connack;
  double last_ping = 0;
  uint16_t next_id = 1;
  void shutdown() override { on_connack = nullptr; for (int32_t i = 0; i < subs.length(); i++) subs.get(i)->cb = nullptr; subs = Array<Sub*>(); }
  static void varlen(StrBuilder& b, uint32_t n) { do { uint8_t d = n % 128; n /= 128; if (n) d |= 128; b.ch((char)d); } while (n); }
  static void str16(StrBuilder& b, const String& s) { b.ch((char)(s.bytes() >> 8)); b.ch((char)(s.bytes() & 255)); b.raw(s.ptr(), s.bytes()); }
  void packet(uint8_t type, StrBuilder& body) { out.ch((char)type); varlen(out, body.len); out.raw(body.buf, body.len); }
  static bool match(const String& filter, const String& topic) {
    const char *f = filter.ptr(), *t = topic.ptr(); uint32_t fi = 0, ti = 0, fn = filter.bytes(), tn = topic.bytes();
    while (fi < fn) {
      if (f[fi] == '#') return true;
      if (f[fi] == '+') { while (ti < tn && t[ti] != '/') ti++; fi++; continue; }
      if (ti >= tn || f[fi] != t[ti]) return false;
      fi++; ti++;
    }
    return ti == tn;
  }
  bool poll() override {
    if (dead) return false;
    if (out.len) {
      ssize_t w = ::send(fd, out.buf, out.len, MSG_NOSIGNAL);
      if (w > 0) { __builtin_memmove(out.buf, out.buf + w, out.len - (uint32_t)w); out.len -= (uint32_t)w; }
      else if (w < 0 && errno != EAGAIN && errno != ENOTCONN && errno != EINPROGRESS) fail(connected ? "mqtt: connection lost" : "mqtt: cannot connect");
    }
    char buf[4096];
    for (;;) {
      ssize_t n = recv(fd, buf, sizeof buf, 0);
      if (n > 0) in.raw(buf, (uint32_t)n);
      else { if (n == 0) fail(connected ? "mqtt: closed by broker" : "mqtt: cannot connect"); else if (errno == ECONNREFUSED || errno == ECONNRESET) fail(connected ? "mqtt: connection lost" : "mqtt: cannot connect"); break; }
    }
    while (parse()) {}
    if (connected && now_ms() - last_ping > 30000) { out.ch((char)0xC0); out.ch(0); last_ping = now_ms(); }
    return !dead;
  }
  void fail(const char* why) {
    dead = true;
    if (on_connack.p && !on_connack->st) on_connack->reject(make<Error>(String::from(why, (uint32_t)strlen(why))));
  }
  bool parse() {
    if (in.len < 2) return false;
    uint32_t len = 0, mul = 1, i = 1;
    for (; i < in.len; i++) { uint8_t d = (uint8_t)in.buf[i]; len += (d & 127) * mul; mul *= 128; if (!(d & 128)) break; }
    if (i >= in.len || in.len < i + 1 + len) return false;
    uint8_t type = (uint8_t)in.buf[0];
    const uint8_t* p = (const uint8_t*)in.buf + i + 1;
    if ((type & 0xF0) == 0x20) {  // CONNACK
      connected = p[1] == 0; last_ping = now_ms();
      if (connected) on_connack->resolve(Unit{}); else fail("mqtt: connection refused");
    } else if ((type & 0xF0) == 0x30) {  // PUBLISH
      uint32_t tl = (uint32_t)p[0] << 8 | p[1];
      String topic = String::from((const char*)p + 2, tl);
      uint32_t off = 2 + tl + (((type >> 1) & 3) ? 2 : 0);
      String payload = String::from((const char*)p + off, len - off);
      for (int32_t k = 0; k < subs.length(); k++) if (match(subs.get(k)->filter, topic)) { subs.get(k)->cb(topic, payload); check_uncaught(); }
    }
    uint32_t used = i + 1 + len;
    __builtin_memmove(in.buf, in.buf + used, in.len - used); in.len -= used;
    return true;
  }
};
static Conn* conn(MqttClient* c) { return (Conn*)c->impl; }
Promise<Unit> MqttClient::connect() {
  auto pr = Promise<Unit>::make_pending();
  sock::CStr h(host);
  int fd = sock::tcp_connect(h.c(), port);
  if (fd < 0) { pr.p->reject(make<Error>(String::from("mqtt: cannot connect", 20))); return pr; }
  Conn* k = new (alloc(sizeof(Conn))) Conn();
  k->fd = fd; k->on_connack = pr.p; impl = k;
  StrBuilder b;
  Conn::str16(b, String::from("MQTT", 4)); b.ch(4); b.ch(0x02); b.ch(0); b.ch(60);
  Conn::str16(b, clientId);
  k->packet(0x10, b);
  add_poller(k);
  return pr;
}
void MqttClient::publish(const String& topic, const String& payload) {
  Conn* k = conn(this); if (!k || k->dead) return;
  StrBuilder b; Conn::str16(b, topic); b.raw(payload.ptr(), payload.bytes());
  k->packet(0x30, b);
}
void MqttClient::subscribe(const String& topic, Fn<void(String, String)> cb) {
  Conn* k = conn(this); if (!k || k->dead) return;
  Sub* s = new (alloc(sizeof(Sub))) Sub(); s->filter = topic; s->cb = cb; k->subs.push(s);
  StrBuilder b; uint16_t id = k->next_id++; b.ch((char)(id >> 8)); b.ch((char)(id & 255)); Conn::str16(b, topic); b.ch(0);
  k->packet(0x82, b);
}
void MqttClient::close() {
  Conn* k = conn(this); if (!k || k->dead) return;
  k->out.ch((char)0xE0); k->out.ch(0);
  ::send(k->fd, k->out.buf, k->out.len, MSG_NOSIGNAL);
  ::close(k->fd); k->dead = true;
  for (int32_t i = 0; i < k->subs.length(); i++) k->subs.get(i)->cb = nullptr;
}
MqttClient::~MqttClient() {}
}}
