#pragma once
// HTTP/1.1 for zinc:net (ZN-087): a client (fetch) and a server on the libuv loop, parsed with llhttp (third_party/llhttp).
// Results arrive as loop events (include/zn/loop.h): 40 a fetch finished, 41 a fetch failed (data = the reason, Node's words), 42 a request
// reached a server (handle = the connection, data = method \x1e target \x1e client address \x1e server port \x1e "name: value\n" lines \x1e body,
// payload = the body's bytes); with the option streamBody the request comes at the end of its headers, its body in events 43 (payload = a chunk)
// and 44 (the end). 45: a reply in parts can be written again (write() returned kDrainBytes or more); 46: the client left while the program held
// the request; 47: a large fetch body on its way (data = "sent total"). Connections are kept alive (HTTP/1.1) and pipelined requests answered
// in order.
#include <string>

namespace zn::http {

// Starts a request; `headers` holds "Name: value\n" lines. Redirects are followed (20 at most). Returns a handle (>= 1).
// fail: a reason the request cannot start (the body's file unreadable); it fails like a refused connection. A body over 64 KB reports
// its upload as it goes (loop event 43, "sent total" in bytes on the wire).
int fetchOpen(const std::string& url, const std::string& method, const std::string& headers, const std::string& body, int timeoutMs, int maxBytes, const std::string& fail = "");
int fetchStatus(int h);
std::string fetchHead(int h);   // the reason phrase, then "name: value\n" lines
std::string fetchBody(int h);
std::string fetchUrl(int h);    // after redirects
void fetchFree(int h);

// The port it listens on (port 0: a free one the system picks), 0 when the port cannot be bound (or the certificate is bad: lastError());
// several servers may listen at once (a request's event names its port); serving a port again replaces its server. A PEM certificate chain
// and key make it an https server.
// Replaces the certificate of the https server on `port` (a renewal): new connections get it, open ones keep the old one.
bool setCertificate(int port, const std::string& certPem, const std::string& keyPem);
int serve(int port, const std::string& certPem = std::string(), const std::string& keyPem = std::string(), const std::string& host = std::string());   // host: the address to bind ('' every IPv4 one)
const std::string& lastError();
// Limits and modes of the server on `port` (zinc:net ServeOptions): maxHeaderBytes (431), maxBodyBytes (413), maxConnections (of all the
// servers), maxConnectionsPerIp, requestsPerSecondPerIp (429; 0 no limit), headersTimeoutMs (the headers from their first byte: 408),
// requestTimeoutMs (the longest pause in a body: 408), keepAliveTimeoutMs, streamBody (1). false for an unknown name or port.
bool option(int port, const std::string& name, double value);
void reply(int conn, int status, const std::string& headers, const std::string& body);
// A reply in parts: the head now (chunked unless the headers give a Content-Length), the body by write(), end() last. write returns the
// bytes the socket still holds (event 45 once they fall back after a write returned 64 KiB or more), -1 when the client is gone.
bool replyStart(int conn, int status, const std::string& headers);
int write(int conn, const std::string& data);
void end(int conn);
// The program took `bytes` of a streamed body (event 43): a connection paused for a slow reader reads again.
void bodyTaken(int conn, size_t bytes);
// WebSocket (RFC 6455, ZN-893; frames by wslay): the program accepts an upgrade request (its event 42 had Upgrade: websocket) with
// wsAccept, which answers 101 with `headers` added; false and a 400 when the request is not a WebSocket handshake. Then events 80 (open),
// 81 (a message: data "t" text or "b" binary, payload its bytes), 82 (closed: data "code \x1e reason"; 1006 without a close frame) and 45
// (drain). wsSend returns the bytes waiting to be written (a drain event follows once it was 64 KiB or more), -1 when the connection is
// closed or over its backpressure limit. Options: wsMaxPayloadBytes (16 MiB, 1009 above), wsIdleTimeoutMs (120 s: a ping, then the
// close), wsBackpressureBytes (16 MiB, 1008 above).
bool wsAccept(int conn, const std::string& headers);
int wsSend(int conn, const std::string& data, bool binary);
void wsClose(int conn, int code, const std::string& reason);
void wsPing(int conn);
// The file at `path` as the body, sent in blocks; `range` is the request's Range header ('' for the whole file): one satisfiable byte
// range gives a 206 with Content-Range, another a 416; a missing file a 404. Accept-Ranges and Content-Length are added.
void replyFile(int conn, int status, const std::string& headers, const std::string& path, const std::string& range);
void stop(int port = 0);   // the server on `port`, every server with 0

}  // namespace zn::http
