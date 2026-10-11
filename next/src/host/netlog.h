#pragma once
// The network log of the host (ZN-370): every request the program starts through zinc:net (fetch), zinc:mqtt and zinc:socket (outgoing TCP, and the
// WebSockets spoken on it) with its headers, bodies, frames and timings. Two readers: the inspector (zinc:devtools) takes the entries as events of the
// DevTools protocol's Network domain, and `zinc run --har file` (ZINC_HAR) writes them as a HAR 1.2 file: when the program ends, and while it runs (tick), so a
// program that is killed leaves the file too.
// Off unless one of the two asked: every call below is then a no-op and open() returns 0. Headers that carry credentials are masked when they are recorded
// (Authorization, Cookie, Set-Cookie, any name with token, secret, password, api-key or session; more names in ZINC_NET_SENSITIVE=a,b), so neither reader sees them.
// The names of ZINC_NET_SENSITIVE (and only those) are masked as query parameters, urlencoded form fields and JSON fields too: URLs, Location, the bodies of
// requests and responses, WebSocket and MQTT text (ZN-635). The bytes of a plain TCP stream are recorded as they are.
#include <string>

namespace zn::netlog {

bool on();
// Called by the event loop on every turn, and with the time it is about to sleep (ZN-636). With ZINC_HAR the file is rewritten when the log changed: at most
// once a second (less often when the log is large), and before a sleep that would outlast that second. A killed or crashed program leaves a valid HAR.
void tick(double sleepMs = 0);
// The inspector listens on `port`: recording starts, events are queued for drain(), and connections to that local port are not recorded (its own clients).
void start(int port);

enum Phase { Dns, Connect, Tls, Sent, FirstByte };

// A request starts. scheme: "http" / "https" (a response ends it), "mqtt" / "mqtts" (a stream of messages), "tcp" (a stream of bytes; becomes a WebSocket
// when the first bytes sent are an upgrade request). `headers` holds "Name: value" lines. Returns the entry's id, 0 when off.
int open(const std::string& scheme, const std::string& url, const std::string& method, const std::string& headers, const std::string& body);
void mark(int id, Phase p);   // that phase ended now (the first call counts)
void response(int id, int status, const std::string& reason, const std::string& headers, const std::string& body);   // http: the response is complete
void accepted(int id, const std::string& statusText);                  // mqtt: the broker accepted the connection
void message(int id, bool sent, const std::string& text);             // mqtt: one packet, as text
void bytes(int id, bool sent, const std::string& data);               // tcp: bytes written or read
void close(int id, const std::string& error = std::string());         // the request or stream ended ("" = normally)

// For the inspector: the queued events (one JSON object per line), and the results of Network.getResponseBody and Network.getRequestPostData.
std::string drain();
void consoleStart();          // op 4: the program's console lines from now on (consoleLine, include/zn/hostsys.h)
std::string consoleDrain();   // op 5: the lines since the last call, as Runtime.consoleAPICalled events (one per line)
std::string consoleRecent();  // op 6: the last 32, for a client that enables Runtime late
std::string responseBody(int id);
std::string postData(int id);
std::string har();   // the whole log as a HAR 1.2 document

}  // namespace zn::netlog
