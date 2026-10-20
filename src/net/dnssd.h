#pragma once
// DNS-SD over multicast DNS (RFC 6762, 6763) with mjansson/mdns (third_party/mdns, one header), so neither Avahi nor Bonjour's library is
// needed and `dns-sd -B` or `avahi-browse` see the services too. IPv4 only. Shared by `zinc agent` (src/agent, service _zinc._tcp) and
// zinc:link (plugins/link, _zinclink._tcp, which compiles this file into its own library): a Responder and a Browser that a loop polls
// (non-blocking sockets), and the blocking browse and announce the agent's threads call. What a record says is a hint: who a peer is
// gets proven by a key, never by its name here.
#include <atomic>
#include <cstdint>
#include <functional>
#include <string>
#include <utility>
#include <vector>

namespace zn::dnssd {

using Txt = std::vector<std::pair<std::string, std::string>>;

/** One instance of the service as an answer gave it. `host` is the address the answer came from: the one that reaches the instance. */
struct Found {
  std::string name, host;   // the instance's name without the service
  int port = 0;
  Txt txt;
  std::string get(const std::string& key) const;   // a TXT value, "" when absent
};

/** Answers the questions for one instance. `txt` is read for each answer (a pairing flag changes). */
struct Responder {
  int sock = -1;
  std::string service, instance, host;
  int port = 0;
  std::uint32_t first = 0;   // the address (network order) of the unasked announces: the default network's
  std::function<Txt()> txt;
  /** `service` as "_zinc._tcp.local."; `bind` "0.0.0.0" answers on every network, another address only on its own, so an instance is never
   *  announced where it cannot be reached. False when the machine has no multicast. Announces the instance once. */
  bool open(const std::string& service, const std::string& name, int port, const std::string& bind, std::function<Txt()> txt);
  void serve();   // answers the questions that arrived; never waits
  void close();   // says goodbye
  Responder() = default;
  Responder(const Responder&) = delete;
  Responder& operator=(const Responder&) = delete;
  ~Responder() { close(); }
};

/** Asks for the instances of a service on every IPv4 interface, loopback included (an instance on this very machine answers there). */
struct Browser {
  std::vector<int> socks;
  std::string service;
  bool open(const std::string& service);
  void ask();                              // one question on each interface
  bool read(int sock, Found& out);         // the instance one answer on `sock` gives, if it is one of the service; never waits
  void close();
  Browser() = default;
  Browser(const Browser&) = delete;
  Browser& operator=(const Browser&) = delete;
  ~Browser() { close(); }
};

/** The instances that answer within `waitMs` (asked twice); the wait ends early at the first one `enough` accepts. Each address is kept. */
std::vector<Found> browse(const std::string& service, int waitMs, const std::function<bool(const Found&)>& enough = {});
/** Answers until `stop`; returns at once when the machine has no multicast. */
void announce(const std::string& service, const std::string& name, int port, const std::string& bind, const std::function<Txt()>& txt, const std::atomic<bool>& stop);

}  // namespace zn::dnssd
