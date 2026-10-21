#pragma once
// A Chrome DevTools target on 127.0.0.1 (ZN-371.04, ZN-773.05): HTTP discovery (/json/list, /json/version) for chrome://inspect, then a WebSocket
// (RFC 6455) at /<id>, one client at a time (the last connection wins). zinc debug --cdp (cdp.cpp) speaks the protocol over it with zinc's own
// debugger; the V8 engine module (src/engine/v8_inspector.cpp) hands it to V8's inspector. The handshake's SHA-1 and base64 come from mbedTLS.
#include <functional>
#include <string>

namespace zn::dbg::ws {

struct Target { std::string id, title, url; };   // what chrome://inspect lists: the WebSocket's path, the program, its file:// URL

// Serves the target on its own thread; each text message from the client goes to onMessage on the connection's reader thread, and onClose runs
// when that client goes. The port it listens on (port 0: any free one), or 0 when it cannot.
int start(int port, const Target& target, std::function<void(std::string)> onMessage, std::function<void()> onClose = {});
void send(const std::string& json);           // one text frame to the client, from any thread; nothing without a client
std::string quote(const std::string& s);      // s as a JSON string

}  // namespace zn::dbg::ws
