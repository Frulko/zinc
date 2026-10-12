// Discovery of the agents on the local network: DNS-SD over multicast DNS, service `_zinc._tcp`, with mjansson/mdns (third_party/mdns), so
// neither Avahi nor Bonjour's library is needed and `dns-sd -B _zinc._tcp` or `avahi-browse _zinc._tcp` see an agent too. IPv4 only.
// What a record says is a hint for the list: who an agent is gets proven by the session key, never by its name here.
#include "wire.h"

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

#include "mdns.h"

namespace zn::agent {
namespace {

// The IPv4 addresses of the interfaces that are up, loopback included: an agent on this very machine answers there when no network is.
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

struct Service {
  std::string service, instance, host;
  int port = 0;
  const std::function<Txt()>* txt = nullptr;
};

// The records of the service: [0] PTR service -> instance, [1] SRV instance -> host and port, [2] A host -> address, then one TXT per pair.
// `txt` must outlive the records, which point into it.
std::vector<mdns_record_t> records(const Service& s, in_addr address, const Txt& txt) {
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
  const auto& s = *static_cast<const Service*>(user);
  char nameBuf[256];
  size_t offset = nameOffset;
  const mdns_string_t name = mdns_string_extract(data, size, &offset, nameBuf, sizeof nameBuf);
  const bool any = rtype == MDNS_RECORDTYPE_ANY;
  const Txt txt = (*s.txt)();
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
  if (rtype == MDNS_RECORDTYPE_PTR && same(name, kService)) {
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

std::vector<Found> browse(int waitMs, const std::function<bool(const Found&)>& enough) {
  std::vector<Found> found;
  std::vector<pollfd> socks;
  for (in_addr a : interfaces()) {
    const sockaddr_in on = v4(a, 0);   // an ephemeral port: the agents answer to it alone
    const int s = mdns_socket_open_ipv4(&on);
    if (s >= 0) socks.push_back({s, POLLIN, 0});
  }
  std::uint32_t buffer[512];
  const auto ask = [&] { for (const pollfd& p : socks) mdns_query_send(p.fd, MDNS_RECORDTYPE_PTR, kService, std::strlen(kService), buffer, sizeof buffer, 0); };
  using clock = std::chrono::steady_clock;
  const auto start = clock::now();
  const auto left = [&] { return waitMs - static_cast<int>(std::chrono::duration_cast<std::chrono::milliseconds>(clock::now() - start).count()); };
  bool again = true, done = false;   // a second question half way: one datagram is easily lost on Wi-Fi
  if (!socks.empty()) ask();
  while (!socks.empty() && left() > 0 && !done) {
    if (again && left() < waitMs / 2) { ask(); again = false; }
    if (::poll(socks.data(), static_cast<nfds_t>(socks.size()), again ? std::max(1, left() - waitMs / 2) : left()) <= 0) continue;
    for (const pollfd& p : socks) {
      if (!(p.revents & POLLIN)) continue;
      // the sender's address is the one that reaches the agent: peek it, the library keeps it to itself
      sockaddr_in from{};
      socklen_t n = sizeof from;
      char peek;
      if (::recvfrom(p.fd, &peek, 1, MSG_PEEK, reinterpret_cast<sockaddr*>(&from), &n) < 0) continue;
      Packet pk;
      mdns_query_recv(p.fd, buffer, sizeof buffer, onAnswer, &pk, 0);
      const std::string suffix = std::string(".") + kService;
      if (pk.port == 0 || pk.instance.size() <= suffix.size() || strcasecmp(pk.srvOf.c_str(), pk.instance.c_str()) != 0) continue;
      if (strcasecmp(pk.instance.c_str() + pk.instance.size() - suffix.size(), suffix.c_str()) != 0 || from.sin_family != AF_INET) continue;
      Found f;
      f.name = pk.instance.substr(0, pk.instance.size() - suffix.size());
      char ip[INET_ADDRSTRLEN] = "";
      inet_ntop(AF_INET, &from.sin_addr, ip, sizeof ip);
      f.host = ip;
      f.port = pk.port;
      for (const auto& kv : pk.txt) {
        if (kv.first == "id") f.id = kv.second;
        else if (kv.first == "kind") f.kind = kv.second;
        else if (kv.first == "os") f.os = kv.second;
        else if (kv.first == "pair") f.pairing = kv.second == "1";
      }
      bool known = false;
      for (const Found& o : found) known = known || (o.id == f.id && o.port == f.port && o.host == f.host);   // each address kept: not all of them reach it
      if (known) continue;
      done = done || (enough && enough(f));
      found.push_back(std::move(f));
    }
  }
  for (const pollfd& p : socks) mdns_socket_close(p.fd);
  return found;
}

void announce(const std::string& name, int port, const std::string& bind, const std::function<Txt()>& txt, const std::atomic<bool>& stop) {
  in_addr anyAddr{}, only{};
  anyAddr.s_addr = htonl(INADDR_ANY);
  if (::inet_pton(AF_INET, bind.c_str(), &only) != 1) only = anyAddr;
  const bool everywhere = only.s_addr == anyAddr.s_addr;
  const sockaddr_in on = v4(only, MDNS_PORT);   // the library joins the group on this address's network and sends from it
  const int sock = mdns_socket_open_ipv4(&on);
  if (sock < 0) return;
  in_addr first = only;
  for (in_addr a : everywhere ? interfaces() : std::vector<in_addr>{}) {   // the questions of every network, not of the default one alone
    ip_mreq req{};
    req.imr_multiaddr.s_addr = htonl(0xE00000FBu);   // 224.0.0.251
    req.imr_interface = a;
    ::setsockopt(sock, IPPROTO_IP, IP_ADD_MEMBERSHIP, &req, sizeof req);
    if (first.s_addr == anyAddr.s_addr && ntohl(a.s_addr) >> 24 != 127) first = a;
  }
  Service s;
  s.service = kService;
  s.instance = name + "." + kService;
  s.host = name + ".local.";
  s.port = port;
  s.txt = &txt;
  std::uint32_t buffer[512];
  const auto tell = [&](bool goodbye) {   // unasked, on the default network: ponytail: one announce, no probing for a name already taken
    const Txt t = txt();
    const std::vector<mdns_record_t> r = records(s, first, t);
    (goodbye ? mdns_goodbye_multicast : mdns_announce_multicast)(sock, buffer, sizeof buffer, r[0], nullptr, 0, r.data() + 1, r.size() - 1);
  };
  if (first.s_addr != anyAddr.s_addr) tell(false);
  while (!stop) {
    pollfd p{sock, POLLIN, 0};
    if (::poll(&p, 1, 300) > 0) mdns_socket_listen(sock, buffer, sizeof buffer, onQuestion, &s);
  }
  if (first.s_addr != anyAddr.s_addr) tell(true);
  mdns_socket_close(sock);
}

}  // namespace zn::agent
