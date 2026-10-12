#pragma once
// Private to src/agent: what the daemon (server.cpp) and the client (client.cpp) share. The protocol is described in
// docs/reports/zinc-next-agent.md: a line in clear that names the kind of connection, then TLS, then frames.
#include <atomic>
#include <cstdint>
#include <functional>
#include <memory>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

struct yyjson_doc;
struct yyjson_val;
namespace zn::tls { struct Conn; }

namespace zn::agent {

inline constexpr int kPort = 7733;
inline constexpr const char* kService = "_zinc._tcp.local.";
inline constexpr std::size_t kMaxFrame = 1 << 20;   // a longer frame ends the session: nothing we send comes close
inline constexpr std::size_t kChunk = 32 * 1024;    // the data frames of streams and files

// A frame is one byte of type, four bytes of length (big endian) and the payload.
enum : char {
  kJson = 'J',   // a request, an answer, an entry of a file transfer
  kIn = 'I',     // bytes for the remote side's input (a shell's stdin, a forwarded port)
  kOut = 'O',    // bytes of its output (stdout, a file's content, a log, a forwarded port)
  kErr = 'E',    // its stderr
  kExit = 'X',   // the stream is over; the payload is the exit status in decimal
  kWin = 'W',    // the terminal's size: "rows cols"
  kEof = 'C',    // no more bytes will follow in this direction
};

// ---- a TLS session over a connected socket (wire.cpp) ----

struct Chan {
  int fd = -1;
  zn::tls::Conn* tls = nullptr;
  std::string in;   // decrypted bytes not yet taken as frames
  Chan() = default;
  Chan(const Chan&) = delete;
  Chan& operator=(const Chan&) = delete;
  ~Chan();
};

int dial(const std::string& host, int port, int timeoutMs, std::string& err);   // a connected socket, or -1
void prepare(int fd);                                                           // non-blocking, closed on exec, no delay
bool sendLine(int fd, const std::string& line);                                 // the lines in clear before TLS
bool recvLine(int fd, std::string& line, int timeoutMs);
// The three kinds of session (host/tls.h): by the key a pairing gave, on each side, and by the pairing code. False with `err`.
bool openPskClient(Chan& c, const std::string& identity, const std::string& key, std::string& err);
bool openPskServer(Chan& c, std::function<std::string(const std::string& identity)> lookup, std::string& err);
bool openPake(Chan& c, bool server, const std::string& code, std::string& err);
std::string peerIdentity(Chan& c);       // server side, after the handshake: the identity whose key the client proved
std::string randomBytes(std::size_t n);  // from the system's generator; empty in a build without TLS
bool handshake(Chan& c, int timeoutMs, std::string& err);
bool send(Chan& c, char type, std::string_view payload);
/** Reads what the socket holds and decrypts it into `c.in`; false once the peer closed or the session failed (frames may still be waiting). */
bool fill(Chan& c);
/** Takes one whole frame out of `c.in`; `bad` is set for a frame longer than kMaxFrame. */
bool next(Chan& c, char& type, std::string& payload, bool* bad = nullptr);
/** The next frame, waiting for it; false when the session ended or nothing came in `timeoutMs` (-1: no limit). */
bool recv(Chan& c, char& type, std::string& payload, int timeoutMs = -1);
/** Between a session and a socket until both directions end: the socket's bytes leave as `outType` frames, `inType` frames go to the socket. */
void relaySocket(Chan& c, int sock, char outType, char inType);
bool writeAll(int fd, const char* p, std::size_t n);   // a blocking or a non-blocking descriptor

// ---- JSON (yyjson) ----

std::string jsonText(std::string_view s);   // a JSON string literal

/** A JSON object being written. */
struct Obj {
  std::string s = "{";
  Obj& raw(std::string_view key, std::string_view json);
  Obj& str(std::string_view key, std::string_view v) { return raw(key, jsonText(v)); }
  Obj& num(std::string_view key, long long v) { return raw(key, std::to_string(v)); }
  Obj& real(std::string_view key, double v);
  Obj& flag(std::string_view key, bool v) { return raw(key, v ? "true" : "false"); }
  std::string done() const { return s + "}"; }
};
std::string array(const std::vector<std::string>& jsonItems);

/** A value of a parsed document; a missing key reads as "", 0, false or nothing. */
struct Val {
  yyjson_val* v = nullptr;
  bool has(const char* key) const;
  std::string str(const char* key) const;
  long long num(const char* key) const;
  double real(const char* key) const;
  bool flag(const char* key) const;
  std::vector<std::string> strs(const char* key) const;                          // an array of strings
  std::vector<std::pair<std::string, std::string>> pairs(const char* key) const; // an object of strings
  std::vector<Val> items(const char* key) const;                                 // an array of objects
};
struct Doc : Val {
  yyjson_doc* doc = nullptr;
  explicit Doc(std::string_view text);
  Doc(const Doc&) = delete;
  Doc& operator=(const Doc&) = delete;
  ~Doc();
  bool ok() const { return v != nullptr; }
};

/** Sends the answer {"ok": false, "error": ...}. */
bool refuse(Chan& c, const std::string& why);

// ---- files and keys ----

std::string hex(std::string_view bytes);
std::string unhex(std::string_view text);
bool readFile(const std::string& path, std::string& out);
bool writePrivate(const std::string& path, const std::string& data);   // mode 0600, replaced in one step
std::string hostName();                                                 // this machine's name without its domain
std::string cleanName(std::string s);                                   // what a file name and a DNS label can both hold

/** A name inside a transfer: relative, no "..", nothing that leaves the root it is written under. */
bool safeRel(const std::string& name);
/** The file or the tree at `path` as entries: {"dir": rel}, {"file": rel, "mode", "size"} followed by its bytes, then {"end": true}. */
bool sendTree(Chan& c, const std::string& path, std::uint64_t& files, std::uint64_t& bytes, std::string& err);
/** Writes the entries under `root` (the file itself when the sender had one file). An entry that cannot be written is skipped and reported
 *  at the end, so the sender is always read to its last entry. */
bool recvTree(Chan& c, const std::string& root, std::uint64_t& files, std::uint64_t& bytes, std::string& err);

// ---- discovery (mdns.cpp) ----

struct Found { std::string name, host, id, kind, os; int port = 0; bool pairing = false; };
using Txt = std::vector<std::pair<std::string, std::string>>;
/** The agents that answer a query for the service within `waitMs`, on every IPv4 interface; the wait ends early at the first one `enough` accepts. */
std::vector<Found> browse(int waitMs, const std::function<bool(const Found&)>& enough = {});
/** Answers the queries for the service until `stop`, with the records of instance `name` on `port`; returns at once when the machine has no
 *  multicast. `bind` is the address the agent listens on: "0.0.0.0" answers on every network, another address only on its own, so an
 *  agent is never announced where it cannot be reached. `txt` is read for each answer (the pairing flag changes). */
void announce(const std::string& name, int port, const std::string& bind, const std::function<Txt()>& txt, const std::atomic<bool>& stop);

// ---- the devices this workstation is paired with (client.cpp) ----

struct Device { std::string id, name, client, key, host; int port = kPort; };

}  // namespace zn::agent
