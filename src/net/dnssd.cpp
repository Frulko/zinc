// DNS-SD over multicast DNS with mjansson/mdns: see dnssd.h. Moved from src/agent/mdns.cpp (ZN-756) so zinc:link shares it.
#include "dnssd.h"

#include <arpa/inet.h>
#include <ifaddrs.h>
#include <net/if.h>
#include <netinet/in.h>
#include <poll.h>
#include <strings.h>
#include <sys/socket.h>
#include <unistd.h>

#include <algorithm>
#include <chrono>
#include <cstring>
#include <thread>

#include "mdns/mdns.h"

namespace zn::dnssd {
namespace {

// The IPv4 addresses of the interfaces that are up, loopback included.
std::vector<in_addr> interfaces() {
  std::vector<in_addr> out;
  ifaddrs* list = nullptr;
  if (getifaddrs(&list) != 0) return out;
  for (ifaddrs* i = list; i; i = i->ifa_next)
    if (i->ifa_addr && i->ifa_addr->sa_family == AF_INET && (i->ifa_flags & IFF_UP)) out.push_back(reinterpret_cast<sockaddr_in*>(i->ifa_addr)->sin_addr);
  freeifaddrs(list);
  return out;
}

sockaddr_in v4(in_addr a, int port) {
  sockaddr_in s{};
  s.sin_family = AF_INET;
  s.sin_addr = a;
  s.sin_port = htons(static_cast<std::uint16_t>(port));
#ifdef __APPLE__
  s.sin_len = sizeof s;
#endif
  return s;
}

mdns_string_t ms(const std::string& s) { return {s.data(), s.size()}; }
bool same(mdns_string_t a, const std::string& b) { return a.length == b.size() && strncasecmp(a.str, b.data(), b.size()) == 0; }

// The address of this machine on the route to `to`: what the A record must say to the one who asked.
in_addr localToward(const sockaddr* to, socklen_t len) {
  in_addr a{};
  a.s_addr = htonl(INADDR_LOOPBACK);
  int s = ::socket(AF_INET, SOCK_DGRAM, 0);
  if (s < 0) return a;
  sockaddr_in me{};
  socklen_t n = sizeof me;
  if (::connect(s, to, len) == 0 && ::getsockname(s, reinterpret_cast<sockaddr*>(&me), &n) == 0) a = me.sin_addr;
  ::close(s);
  return a;
}

// The records of the instance: [0] PTR service -> instance, [1] SRV instance -> host and port, [2] A host -> address, then one TXT per pair.
// `txt` must outlive the records, which point into it.
std::vector<mdns_record_t> records(const Responder& s, in_addr address, const Txt& txt) {
  std::vector<mdns_record_t> r(3);
  r[0].name = ms(s.service);
  r[0].type = MDNS_RECORDTYPE_PTR;
  r[0].data.ptr.name = ms(s.instance);
  r[1].name = ms(s.instance);
  r[1].type = MDNS_RECORDTYPE_SRV;
  r[1].data.srv.name = ms(s.host);
  r[1].data.srv.port = static_cast<std::uint16_t>(s.port);
  r[2].name = ms(s.host);
  r[2].type = MDNS_RECORDTYPE_A;
  r[2].data.a.addr = v4(address, 0);
  for (const auto& kv : txt) {
    mdns_record_t t{};
    t.name = ms(s.instance);
    t.type = MDNS_RECORDTYPE_TXT;
    t.data.txt.key = ms(kv.first);
    t.data.txt.value = ms(kv.second);
    r.push_back(t);
  }
  return r;
}

int onQuestion(int sock, const sockaddr* from, size_t addrlen, mdns_entry_type_t entry, uint16_t queryId, uint16_t rtype, uint16_t rclass, uint32_t, const void* data,
               size_t size, size_t nameOffset, size_t, size_t, size_t, void* user) {
  if (entry != MDNS_ENTRYTYPE_QUESTION) return 0;
  const auto& s = *static_cast<const Responder*>(user);
  char nameBuf[256];
  size_t offset = nameOffset;
  const mdns_string_t name = mdns_string_extract(data, size, &offset, nameBuf, sizeof nameBuf);
  const bool any = rtype == MDNS_RECORDTYPE_ANY;
  const Txt txt = s.txt ? s.txt() : Txt{};
  std::vector<mdns_record_t> r = records(s, localToward(from, static_cast<socklen_t>(addrlen)), txt);
  mdns_record_t answer{};
  const mdns_record_t* more = nullptr;
  size_t moreCount = 0;
  if (same(name, "_services._dns-sd._udp.local.") && (any || rtype == MDNS_RECORDTYPE_PTR)) {   // which services are there
    answer.name = name;
    answer.type = MDNS_RECORDTYPE_PTR;
    answer.data.ptr.name = ms(s.service);
  } else if (same(name, s.service) && (any || rtype == MDNS_RECORDTYPE_PTR)) {   // who offers the service: everything in one answer
    answer = r[0];
    more = r.data() + 1;
    moreCount = r.size() - 1;
  } else if (same(name, s.instance) && (any || rtype == MDNS_RECORDTYPE_SRV)) {
    answer = r[1];
    more = r.data() + 2;
    moreCount = r.size() - 2;
  } else if (same(name, s.instance) && rtype == MDNS_RECORDTYPE_TXT && r.size() > 3) {
    answer = r[3];
    more = r.data() + 4;
    moreCount = r.size() - 4;
  } else if (same(name, s.host) && (any || rtype == MDNS_RECORDTYPE_A)) {
    answer = r[2];
  } else {
    return 0;
  }
  std::uint32_t buffer[512];
  if (rclass & MDNS_UNICAST_RESPONSE)
    mdns_query_answer_unicast(sock, from, addrlen, buffer, sizeof buffer, queryId, static_cast<mdns_record_type_t>(rtype), name.str, name.length, answer, nullptr, 0, more, moreCount);
  else
    mdns_query_answer_multicast(sock, buffer, sizeof buffer, answer, nullptr, 0, more, moreCount);
  return 0;
}

// What one answer packet says about one instance.
struct Packet {
  const std::string* service = nullptr;
  std::string instance, srvOf;
  Txt txt;
  int port = 0;
};

int onAnswer(int, const sockaddr*, size_t, mdns_entry_type_t, uint16_t, uint16_t rtype, uint16_t, uint32_t, const void* data, size_t size, size_t nameOffset, size_t,
             size_t recordOffset, size_t recordLength, void* user) {
  auto& p = *static_cast<Packet*>(user);
  char nameBuf[256], valueBuf[256];
  size_t offset = nameOffset;
  const mdns_string_t name = mdns_string_extract(data, size, &offset, nameBuf, sizeof nameBuf);
  if (rtype == MDNS_RECORDTYPE_PTR && same(name, *p.service)) {
    const mdns_string_t inst = mdns_record_parse_ptr(data, size, recordOffset, recordLength, valueBuf, sizeof valueBuf);
    p.instance.assign(inst.str, inst.length);
  } else if (rtype == MDNS_RECORDTYPE_SRV) {
    p.port = mdns_record_parse_srv(data, size, recordOffset, recordLength, valueBuf, sizeof valueBuf).port;
    p.srvOf.assign(name.str, name.length);
  } else if (rtype == MDNS_RECORDTYPE_TXT) {
    mdns_record_txt_t kv[16];
    const size_t n = mdns_record_parse_txt(data, size, recordOffset, recordLength, kv, 16);
    for (size_t i = 0; i < n; ++i) p.txt.emplace_back(std::string(kv[i].key.str, kv[i].key.length), std::string(kv[i].value.str, kv[i].value.length));
  }
  return 0;
}

}  // namespace

std::string Found::get(const std::string& key) const {
  for (const auto& kv : txt) if (kv.first == key) return kv.second;
  return std::string();
}

bool Responder::open(const std::string& svc, const std::string& name, int p, const std::string& bind, std::function<Txt()> t) {
  close();
  in_addr anyAddr{}, only{};
  anyAddr.s_addr = htonl(INADDR_ANY);
  if (::inet_pton(AF_INET, bind.c_str(), &only) != 1) only = anyAddr;
  const bool everywhere = only.s_addr == anyAddr.s_addr;
  const sockaddr_in on = v4(only, MDNS_PORT);   // the library joins the group on this address's network and sends from it
  sock = mdns_socket_open_ipv4(&on);
  if (sock < 0) return false;
  in_addr firstAddr = only;
  for (in_addr a : everywhere ? interfaces() : std::vector<in_addr>{}) {   // the questions of every network, not of the default one alone
    ip_mreq req{};
    req.imr_multiaddr.s_addr = htonl(0xE00000FBu);   // 224.0.0.251
    req.imr_interface = a;
    ::setsockopt(sock, IPPROTO_IP, IP_ADD_MEMBERSHIP, &req, sizeof req);
    if (firstAddr.s_addr == anyAddr.s_addr && ntohl(a.s_addr) >> 24 != 127) firstAddr = a;
  }
  service = svc;
  instance = name + "." + svc;
  host = name + ".local.";
  port = p;
  first = firstAddr.s_addr;
  txt = std::move(t);
  if (first != anyAddr.s_addr) {   // unasked, on the default network: ponytail: one announce, no probing for a name already taken
    const Txt now = txt ? txt() : Txt{};
    in_addr a{};
    a.s_addr = first;
    const std::vector<mdns_record_t> r = records(*this, a, now);
    std::uint32_t buffer[512];
    mdns_announce_multicast(sock, buffer, sizeof buffer, r[0], nullptr, 0, r.data() + 1, r.size() - 1);
  }
  return true;
}

void Responder::serve() {
  if (sock < 0) return;
  std::uint32_t buffer[512];
  for (int i = 0; i < 64; ++i) {   // what the socket holds now, bounded so a flood cannot hold the loop
    pollfd p{sock, POLLIN, 0};
    if (::poll(&p, 1, 0) <= 0) return;
    mdns_socket_listen(sock, buffer, sizeof buffer, onQuestion, this);
  }
}

void Responder::close() {
  if (sock < 0) return;
  if (first != htonl(INADDR_ANY)) {
    const Txt now = txt ? txt() : Txt{};
    in_addr a{};
    a.s_addr = first;
    const std::vector<mdns_record_t> r = records(*this, a, now);
    std::uint32_t buffer[512];
    mdns_goodbye_multicast(sock, buffer, sizeof buffer, r[0], nullptr, 0, r.data() + 1, r.size() - 1);
  }
  mdns_socket_close(sock);
  sock = -1;
}

bool Browser::open(const std::string& svc) {
  close();
  service = svc;
  for (in_addr a : interfaces()) {
    const sockaddr_in on = v4(a, 0);   // an ephemeral port: the responders answer to it alone
    const int s = mdns_socket_open_ipv4(&on);
    if (s >= 0) socks.push_back(s);
  }
  return !socks.empty();
}

void Browser::ask() {
  std::uint32_t buffer[512];
  for (int s : socks) mdns_query_send(s, MDNS_RECORDTYPE_PTR, service.c_str(), service.size(), buffer, sizeof buffer, 0);
}

bool Browser::read(int s, Found& out) {
  // the sender's address is the one that reaches the instance: peek it, the library keeps it to itself
  sockaddr_in from{};
  socklen_t n = sizeof from;
  char peek;
  if (::recvfrom(s, &peek, 1, MSG_PEEK, reinterpret_cast<sockaddr*>(&from), &n) < 0) return false;
  std::uint32_t buffer[512];
  Packet pk;
  pk.service = &service;
  mdns_query_recv(s, buffer, sizeof buffer, onAnswer, &pk, 0);
  const std::string suffix = "." + service;
  if (pk.port == 0 || pk.instance.size() <= suffix.size() || strcasecmp(pk.srvOf.c_str(), pk.instance.c_str()) != 0) return false;
  if (strcasecmp(pk.instance.c_str() + pk.instance.size() - suffix.size(), suffix.c_str()) != 0 || from.sin_family != AF_INET) return false;
  out = Found{};
  out.name = pk.instance.substr(0, pk.instance.size() - suffix.size());
  char ip[INET_ADDRSTRLEN] = "";
  inet_ntop(AF_INET, &from.sin_addr, ip, sizeof ip);
  out.host = ip;
  out.port = pk.port;
  out.txt = std::move(pk.txt);
  return true;
}

void Browser::close() {
  for (int s : socks) mdns_socket_close(s);
  socks.clear();
}

std::vector<Found> browse(const std::string& service, int waitMs, const std::function<bool(const Found&)>& enough) {
  std::vector<Found> found;
  Browser b;
  if (!b.open(service)) return found;
  std::vector<pollfd> fds;
  for (int s : b.socks) fds.push_back({s, POLLIN, 0});
  using clock = std::chrono::steady_clock;
  const auto start = clock::now();
  const auto left = [&] { return waitMs - static_cast<int>(std::chrono::duration_cast<std::chrono::milliseconds>(clock::now() - start).count()); };
  bool again = true, done = false;   // a second question half way: one datagram is easily lost on Wi-Fi
  b.ask();
  while (left() > 0 && !done) {
    if (again && left() < waitMs / 2) { b.ask(); again = false; }
    if (::poll(fds.data(), static_cast<nfds_t>(fds.size()), again ? std::max(1, left() - waitMs / 2) : left()) <= 0) continue;
    for (const pollfd& p : fds) {
      Found f;
      if (!(p.revents & POLLIN) || !b.read(p.fd, f)) continue;
      bool known = false;
      for (const Found& o : found) known = known || (o.get("id") == f.get("id") && o.port == f.port && o.host == f.host);   // each address kept: not all of them reach it
      if (known) continue;
      done = done || (enough && enough(f));
      found.push_back(std::move(f));
    }
  }
  return found;
}

void announce(const std::string& service, const std::string& name, int port, const std::string& bind, const std::function<Txt()>& txt, const std::atomic<bool>& stop) {
  // A service started at boot can come before the network: no multicast route yet (the group cannot be joined), and Wi-Fi brings an address
  // later. So the responder is opened again until it works, and again when the machine's addresses change (checked every 3 s).
  Responder r;
  std::string opened;
  for (int tick = 0; !stop; ++tick) {
    if (tick % 10 == 0) {
      std::string now;
      for (in_addr a : interfaces()) now += std::to_string(a.s_addr) + " ";
      if (r.sock < 0 || now != opened) opened = r.open(service, name, port, bind, txt) ? now : std::string();
    }
    pollfd p{r.sock, POLLIN, 0};
    if (r.sock < 0) std::this_thread::sleep_for(std::chrono::milliseconds(300));
    else if (::poll(&p, 1, 300) > 0) r.serve();
  }
}

}  // namespace zn::dnssd
