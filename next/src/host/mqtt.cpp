#include "mqtt.h"

#include <uv.h>

#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <vector>

#include "zn/loop.h"

namespace zn::mqtt {
namespace {

constexpr size_t kBrokerPacketLimit = 1u << 20;   // a longer packet from the broker ends the connection (plaintext TCP, untrusted lengths)

struct Client {
  uv_tcp_t tcp;
  uv_connect_t connectReq;
  uv_timer_t ping;
  std::string in;
  int handle = 0;
  uint16_t nextId = 1;
  bool connected = false, dead = false;
};
std::vector<Client*> gClients;   // index = handle - 1; entries live until the process ends (handles are never reused)

Client* at(int h) { return h > 0 && static_cast<size_t>(h) <= gClients.size() ? gClients[static_cast<size_t>(h) - 1] : nullptr; }
void onClosed(uv_handle_t* h) { (void)h; }

void str16(std::string& b, const std::string& s) {
  b += static_cast<char>(s.size() >> 8);
  b += static_cast<char>(s.size() & 255);
  b += s;
}
std::string packet(uint8_t type, const std::string& body) {
  std::string p(1, static_cast<char>(type));
  size_t n = body.size();
  do { uint8_t d = n % 128; n /= 128; if (n) d |= 128; p += static_cast<char>(d); } while (n);
  return p + body;
}

struct WriteReq { uv_write_t req; std::string data; };
void send(Client* c, const std::string& bytes) {
  if (c->dead) return;
  auto* w = new WriteReq{{}, bytes};
  uv_buf_t b = uv_buf_init(w->data.data(), static_cast<unsigned>(w->data.size()));
  if (uv_write(&w->req, reinterpret_cast<uv_stream_t*>(&c->tcp), &b, 1, [](uv_write_t* r, int) { delete reinterpret_cast<WriteReq*>(r); }) != 0) delete w;
}

void shut(Client* c) {   // closes both handles once
  if (c->dead) return;
  c->dead = true;
  uv_close(reinterpret_cast<uv_handle_t*>(&c->ping), onClosed);
  uv_close(reinterpret_cast<uv_handle_t*>(&c->tcp), onClosed);
  loop::addActive(-1);
}
void fail(Client* c, const char* why) {
  bool wasConnected = c->connected;
  shut(c);
  loop::pushEvent(c->handle, wasConnected ? 32 : 30, why);
}

bool parse(Client* c) {
  const std::string& in = c->in;
  if (in.size() < 2) return false;
  size_t len = 0, mul = 1, i = 1;
  for (; i < in.size() && i <= 4; i++) { uint8_t d = static_cast<uint8_t>(in[i]); len += (d & 127) * mul; mul *= 128; if (!(d & 128)) break; }
  if (i > 4) { fail(c, "mqtt: bad packet"); return false; }
  if (i >= in.size()) return false;
  if (len > kBrokerPacketLimit) { fail(c, "mqtt: packet too large"); return false; }
  if (in.size() - i - 1 < len) return false;
  uint8_t type = static_cast<uint8_t>(in[0]);
  const uint8_t* p = reinterpret_cast<const uint8_t*>(in.data()) + i + 1;
  if ((type & 0xF0) == 0x20 && len >= 2) {   // CONNACK
    if (p[1] != 0) { fail(c, "mqtt: connection refused"); return false; }
    c->connected = true;
    loop::pushEvent(c->handle, 30, "");
  } else if ((type & 0xF0) == 0x30 && len >= 2) {   // PUBLISH
    unsigned qos = (type >> 1) & 3;
    size_t tl = size_t(p[0]) << 8 | p[1];
    size_t off = 2 + tl + (qos ? 2 : 0);
    if (off <= len) {
      loop::pushEvent(c->handle, 31, std::string(reinterpret_cast<const char*>(p) + 2, tl) + '\x1e' + std::string(reinterpret_cast<const char*>(p) + off, len - off));
      if (qos == 1) send(c, packet(0x40, std::string(reinterpret_cast<const char*>(p) + 2 + tl, 2)));   // PUBACK
    }
  }
  c->in.erase(0, i + 1 + len);
  return true;
}

}  // namespace

int open(const std::string& host, int port, const std::string& clientId) {
  sockaddr_in a;
  if (!loop::resolveHost(host, port, &a)) return -1;
  auto* c = new Client();
  auto* l = static_cast<uv_loop_t*>(loop::uvLoop());
  gClients.push_back(c);
  c->handle = static_cast<int>(gClients.size());
  uv_tcp_init(l, &c->tcp);
  uv_timer_init(l, &c->ping);
  c->tcp.data = c->ping.data = c->connectReq.data = c;
  loop::addActive(1);
  std::string hello;
  str16(hello, "MQTT");
  hello += std::string("\x04\x02\0\x3c", 4);   // level 4, clean session, keepalive 60 s
  str16(hello, clientId);
  hello = packet(0x10, hello);
  int rc = uv_tcp_connect(&c->connectReq, &c->tcp, reinterpret_cast<sockaddr*>(&a), [](uv_connect_t* r, int status) {
    auto* k = static_cast<Client*>(r->data);
    if (status != 0) { fail(k, "mqtt: cannot connect"); return; }
    uv_read_start(reinterpret_cast<uv_stream_t*>(&k->tcp),
                  [](uv_handle_t*, size_t n, uv_buf_t* b) { b->base = static_cast<char*>(std::malloc(n)); b->len = static_cast<unsigned>(b->base ? n : 0); },
                  [](uv_stream_t* s, ssize_t n, const uv_buf_t* b) {
                    auto* k = static_cast<Client*>(s->data);
                    if (n > 0 && !k->dead) { k->in.append(b->base, static_cast<size_t>(n)); while (!k->dead && parse(k)) {} }
                    if (b->base) std::free(b->base);
                    if (n < 0) fail(k, k->connected ? "mqtt: closed by broker" : "mqtt: cannot connect");
                  });
    uv_timer_start(&k->ping, [](uv_timer_t* t) { send(static_cast<Client*>(t->data), std::string("\xC0\0", 2)); }, 30000, 30000);
    uv_unref(reinterpret_cast<uv_handle_t*>(&k->ping));
  });
  if (rc != 0) { fail(c, "mqtt: cannot connect"); return c->handle; }
  send(c, hello);   // queued behind the connect
  return c->handle;
}

void publish(int h, const std::string& topic, const std::string& payload, bool retain, int qos) {
  Client* c = at(h);
  if (!c || c->dead || !c->connected) return;
  std::string b;
  str16(b, topic);
  if (qos == 1) { b += static_cast<char>(c->nextId >> 8); b += static_cast<char>(c->nextId & 255); c->nextId++; }
  send(c, packet(static_cast<uint8_t>(0x30 | (qos == 1 ? 2 : 0) | (retain ? 1 : 0)), b + payload));
}
void subscribe(int h, const std::string& filter) {
  Client* c = at(h);
  if (!c || c->dead) return;
  std::string b;
  b += static_cast<char>(c->nextId >> 8);
  b += static_cast<char>(c->nextId & 255);
  c->nextId++;
  str16(b, filter);
  b += '\0';
  send(c, packet(0x82, b));
}
void close(int h) {
  Client* c = at(h);
  if (!c || c->dead) return;
  send(c, std::string("\xE0\0", 2));
  uv_shutdown_t* sd = new uv_shutdown_t;   // let the DISCONNECT out before the socket closes
  sd->data = c;
  if (uv_shutdown(sd, reinterpret_cast<uv_stream_t*>(&c->tcp), [](uv_shutdown_t* r, int) { shut(static_cast<Client*>(r->data)); delete r; }) != 0) { delete sd; shut(c); }
}

}  // namespace zn::mqtt
