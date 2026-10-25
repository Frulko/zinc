#pragma once
// Private to src/agent: what the daemon (server.cpp) and the client (client.cpp) share. The protocol is described in
// docs/reports/zinc-next-agent.md: a line in clear that names the kind of connection, then TLS, then frames.
#include <atomic>
#include <cstdint>
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "zn/limits.h"

struct yyjson_doc;
struct yyjson_val;
namespace zn::tls { struct Conn; }

namespace zn::agent {

// Hold the agent state's display mutex across fork/handoff; the child waits on a pipe before exec.
bool awaitScreen(int fd);
bool handoffScreen(long pid, int fd, std::string& err);
void releaseScreen(long pid);

inline constexpr int kPort = 7733;
inline constexpr const char* kService = "_zinc._tcp.local.";
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
/** Takes one whole frame out of `c.in`; `bad` is set for a frame longer than kMaxAgentFrame. */
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
/** The file or the tree at `path` as entries: {"dir": rel}, {"file": rel, "mode", "size"} followed by its bytes, then {"end": true}.
 *  `sent`, when given, is told the bytes handed to the connection so far, after each frame of data (the progress of a transfer). */
using Sent = std::function<void(std::uint64_t bytes)>;
bool sendTree(Chan& c, const std::string& path, std::uint64_t& files, std::uint64_t& bytes, std::string& err, const Sent& sent = {});
Sent progress(const std::string& path);   // the "send" step lines of a transfer of `path` (client.cpp)
/** Writes the entries under `root` (the file itself when the sender had one file). An entry that cannot be written is skipped and reported
 *  at the end, so the sender is always read to its last entry. */
bool recvTree(Chan& c, const std::string& root, std::uint64_t& files, std::uint64_t& bytes, std::string& err);

// ---- the service and signed updates (ota.cpp) ----

/** `zinc agent install|uninstall [--print] ...`: the launchd agent or the systemd user unit that starts `self agent` with the machine. */
int serviceCommand(const std::vector<std::string>& args, const std::string& self);
/** May the app staged in the directory `fresh` replace the one installed in `dest`? An app whose zinc.json has update.publicKey takes only a
 *  .zapp whose detached signature `sigHex` (zinc sign) verifies with that key and whose version is higher; the version it replaces then
 *  goes with it as previous.zapp, and it is on trial. Any other app is replaced as before. False with `err`. */
bool otaAdmit(const std::string& dest, const std::string& fresh, const std::string& sigHex, std::string& err);
/** After `name` started as `pid`: an update on trial is watched until it has held $ZINC_AGENT_TRIAL_MS (5 s) or ended. True when it exited at
 *  once with an error: the previous version is back in its place, `why` says so, and the caller starts it. `home` is the agent's directory. */
bool otaRolledBack(const std::string& home, const std::string& name, long pid, std::string& why);
/** `update`: the app `name` from its channel (zinc.json update, or `url`), as zinc update-app checks it; no name: the engine, as zinc update.
 *  The answer to send: {"ok": true, "text": ...} or {"ok": false, "error": ...}. */
std::string otaUpdate(const std::string& home, const std::string& engine, const std::string& name, const std::string& url);

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
/** A session with the paired device `device` (its name or the start of its id; empty: the only one), `req` sent and its answer read into
 *  `answer`; `name` gets the device's name. Null, with the reason said on stderr, when there is no such device or it refuses. */
std::unique_ptr<Chan> deviceSession(const std::string& device, const std::string& req, std::string& answer, std::string& name);

// ---- processes the agent starts (server.cpp) ----

/** This process's environment with `extra` replacing or adding variables, as the strings execve takes. */
std::vector<std::string> environment(const std::vector<std::pair<std::string, std::string>>& extra);
std::vector<char*> pointers(std::vector<std::string>& v);
/** In the child, between fork and exec: the directory, then every descriptor from `keep` on closed, then the program. */
[[noreturn]] void execChild(const char* dir, char* const* argv, char* const* envp, int keep = 3);
int exitCode(int status);
/** apps/<name>/app.json (ZN-820): what the player's launcher shows of an app sent here, its title and its icon (zinc.json app.icon, kept
 *  with the app; `members`: a .zapp's files, its icon then copied beside it), when it came and whether zinc dev sent it. */
void recordApp(const std::string& dir, const std::string& name, bool dev, const std::map<std::string, std::string>* members);

// ---- zinc dev --device (dev.cpp) ----

/** The agent's side of a dev session: the files the workstation sends, the program restarted at each `start`, its output sent back, the
 *  bytes of `I` frames written to its dev socket (asset reload, src/host/assets_host.h), until the workstation leaves. */
void opDev(Chan& c, const Val& req, const std::string& home, const std::string& self, const std::string& engine, std::mutex& displayMu);

// ---- zinc device screen --live (live.cpp) ----

/** The device: the program on the screen streams its frames to a socket named in <screen dir>/live.request (src/host/mirror.cpp), relayed
 *  as `O` frames; `I` frames carry the workstation's input back, until it leaves. */
void opLive(Chan& c, const std::atomic<bool>& stop);
/** The workstation: the device's screen in a window, driven by this machine's mouse and keyboard. */
int cmdLive(Device& d);

// ---- the inspector, the frame, the telemetry and the load of an app (inspect.cpp, ZN-729.05) ----

using Env = std::vector<std::pair<std::string, std::string>>;
/** The device: the port an app about to start gives its inspector. ZINC_DEVTOOLS_PORT of `env` when the workstation chose one, else a free
 *  port of this machine, added to `env`. */
int inspectorPort(Env& env);
/** The device: what a running app adds to its entry in `apps`: "inspector" (the second line of its pid file), "cpuMs" and "rss" (the
 *  processes of its group, summed), "at" (the monotonic clock when they were read, in ms). */
void appStats(Obj& o, const std::string& pidFile, long pid);
/** The device: sends `what()` now and every `ms` until the workstation leaves or `stop`. */
void every(Chan& c, int ms, const std::function<std::string()>& what, const std::atomic<bool>& stop);
/** The workstation: `zinc device [<device>] inspect <app> [--port n] | shot <app> [file.png] | monitor <app> | top [-n count] [--json]`. */
int inspectCommand(Device& d, const std::string& op, const std::vector<std::string>& args, const std::string& self);
/** The workstation: `zinc device inspect --all`, the inspector of every running app of every paired device on a port of this machine. */
int inspectAll(std::vector<Device>& paired);
// What these commands take from client.cpp.
std::unique_ptr<Chan> ask(Device& d, const std::string& req, std::string& answer, bool mayLook = true);   // `request`
int forwardPort(Device& d, int local, int remote, const std::function<void(int port)>& listening);       // `forward`, never returns while it works
int followLogs(Device& d, const std::string& name);
int runTool(const std::vector<std::string>& argv);                                                         // its exit status

}  // namespace zn::agent
