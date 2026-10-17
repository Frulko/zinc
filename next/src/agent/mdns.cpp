// Discovery of the agents on the local network: DNS-SD service `_zinc._tcp` on src/net/dnssd (mjansson/mdns), shared with zinc:link.
// What a record says is a hint for the list: who an agent is gets proven by the session key, never by its name here.
#include "wire.h"

#include "../net/dnssd.h"

namespace zn::agent {

std::vector<Found> browse(int waitMs, const std::function<bool(const Found&)>& enough) {
  const auto agent = [](const dnssd::Found& d) {
    Found f;
    f.name = d.name;
    f.host = d.host;
    f.port = d.port;
    f.id = d.get("id");
    f.kind = d.get("kind");
    f.os = d.get("os");
    f.pairing = d.get("pair") == "1";
    return f;
  };
  std::vector<Found> out;
  for (const dnssd::Found& d : dnssd::browse(kService, waitMs, [&](const dnssd::Found& d) { return enough && enough(agent(d)); })) out.push_back(agent(d));
  return out;
}

void announce(const std::string& name, int port, const std::string& bind, const std::function<Txt()>& txt, const std::atomic<bool>& stop) {
  dnssd::announce(kService, name, port, bind, txt, stop);
}

}  // namespace zn::agent
