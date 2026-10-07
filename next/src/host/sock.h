#pragma once
// Sockets for zinc:socket (ZN-088) on the libuv loop: TCP, Unix domain streams, UDP and DNS lookups, as handles that report through loop events
// (include/zn/loop.h). Event kinds, with the handle in the event:
//   50 data (the bytes are the event's payload), 51 open (connected, listening or bound), 52 accept (data = the new handle), 53 closed by the peer, 54 error (text),
//   55 datagram (data = address \x1e port, the bytes are the payload), 56 lookup done (data = addresses joined with ','), 57 lookup failed (text)
#include <cstddef>
#include <cstdint>
#include <string>

namespace zn::sock {

// Each returns a handle (>= 1), or -1 with the reason in error().
int connectTcp(const std::string& host, int port);
int connectUnix(const std::string& path);
int listenTcp(const std::string& host, int port);   // port 0: any free port (localPort)
int listenUnix(const std::string& path);
int udp(const std::string& host, int port);
bool write(int h, const std::string& bytes);        // queued; false when the handle is closed or not a stream
bool sendTo(int h, const std::string& host, int port, const std::string& bytes);
void end(int h);                                    // FIN once the queued data is out
void close(int h);                                  // now; no closed event follows
int localPort(int h);
std::string remoteAddress(int h);
int remotePort(int h);
int lookup(const std::string& host);               // request id: the events carry it as their handle
const std::string& error();

}  // namespace zn::sock
