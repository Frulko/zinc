#include "http.h"
#include "host/permissions.h"

#include <llhttp.h>
#include <wslay/wslay.h>
#include <uv.h>

#include <algorithm>
#include <cctype>
#include <cerrno>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <map>
#include <string_view>
#include <memory>
#include <new>
#include <vector>

#include "crypto.h"
#include "netlog.h"
#include "tls.h"
#include "zn/loop.h"

#include <sys/stat.h>
#ifndef _WIN32
#include <unistd.h>
#endif
#ifdef __APPLE__
#include <TargetConditionals.h>
#endif
#if defined(__linux__)
#include <sys/sendfile.h>
#define ZN_SENDFILE 1
#elif defined(__APPLE__) && !TARGET_OS_IPHONE   // iOS kills a process that calls sendfile (SIGSYS)
#include <sys/socket.h>
#include <sys/uio.h>
#define ZN_SENDFILE 1
#endif

namespace zn::http {
std::string gError;
namespace {

const char* reasonOf(int s) {
  switch (s) {
    case 100: return "Continue"; case 101: return "Switching Protocols"; case 200: return "OK"; case 201: return "Created"; case 202: return "Accepted"; case 204: return "No Content";
    case 206: return "Partial Content"; case 301: return "Moved Permanently"; case 302: return "Found"; case 303: return "See Other";
    case 304: return "Not Modified"; case 307: return "Temporary Redirect"; case 308: return "Permanent Redirect"; case 400: return "Bad Request";
    case 401: return "Unauthorized"; case 403: return "Forbidden"; case 404: return "Not Found"; case 405: return "Method Not Allowed";
    case 408: return "Request Timeout"; case 409: return "Conflict"; case 410: return "Gone"; case 413: return "Payload Too Large"; case 416: return "Range Not Satisfiable";
    case 415: return "Unsupported Media Type"; case 418: return "I'm a Teapot"; case 422: return "Unprocessable Entity"; case 426: return "Upgrade Required";
    case 429: return "Too Many Requests"; case 431: return "Request Header Fields Too Large"; case 500: return "Internal Server Error";
    case 501: return "Not Implemented"; case 502: return "Bad Gateway"; case 503: return "Service Unavailable"; case 504: return "Gateway Timeout";
    default: return s < 400 ? "OK" : "Error";
  }
}
uv_loop_t* L() { return static_cast<uv_loop_t*>(loop::uvLoop()); }
void alloc(uv_handle_t*, size_t n, uv_buf_t* b) { b->base = static_cast<char*>(std::malloc(n)); b->len = static_cast<unsigned>(b->base ? n : 0); }
struct WriteReq { uv_write_t req; std::string data; bool closeAfter; int fetch = 0; };
bool hasCtl(const std::string& s) { return s.find_first_of(std::string("\r\0", 2)) != std::string::npos; }

// Both sides collect a message the same way.
struct Msg {
  std::string head, body, field, value;   // head: "name: value\n" lines
  bool inValue = false;
  void flush() { if (inValue) { head += field + ": " + value + "\n"; field.clear(); value.clear(); inValue = false; } }
  void onField(const char* p, size_t n) { flush(); field.append(p, n); }
  void onValue(const char* p, size_t n) { inValue = true; value.append(p, n); }
};

// ---------------------------------------------------------------- client
constexpr int kRedirectCap = 20, kConnectCapMs = 30000;

struct Fetch {
  int handle = 0;
  uv_tcp_t tcp;
  uv_timer_t timer;
  uv_connect_t creq;
  llhttp_t parser;
  llhttp_settings_t settings;
  std::string url, method, headers, reqBody, host, path, reason, finalUrl;
  int port = 80, status = 0, redirects = 0, maxBytes = 0;
  uint64_t timeoutMs = 0, startMs = 0;
  Msg msg;
  bool tooBig = false, finished = false, restart = false, released = false, tcpOpen = false, timerOpen = false;
  bool tls12 = false, answered = false;   // tls12: the retry of a server that dropped a TLS 1.3 session; answered: response bytes came
  bool secure = false, reqSent = false;
  bool progress = false;               // a large body: its upload is reported (event 43) as the socket takes it
  uint64_t wireTotal = 0, wireSent = 0;
  tls::Conn* tls = nullptr;
  bool tlsBusy = false;                // a worker is in the handshake: nothing here touches the connection until it is back
  std::string tlsWaiting;              // what the socket gave meanwhile
  int closing = 0;
  int log = 0;   // the entry of this hop in the network log (netlog.h), 0 when nobody records
  std::string savePath;                // the body goes to this file, never to memory (RequestInit.saveTo)
  FILE* saving = nullptr;              // open on the worker thread; written there, so a slow disk never holds up the frames (an SD card: seconds)
  uv_work_t saveWork;
  std::string saveWaiting, saveChunk;  // what came in; what the worker is writing
  bool saveAppend = false, saveWriting = false, saveWriteFailed = false, saveReadPaused = false;
  bool held = false, heldOk = false;   // the answer is in: told once the file has it all
  std::string heldWhy;
  bool saveFailed = false;
  // RequestInit.bodyFile: the file goes after reqBody and before upTail, read one block at a time as the socket takes them (a 500 MB
  // upload holds a few blocks, not the file). Its lifecycle is `up`, changed only by upTo.
  enum class Up { None, Waiting, Sending, Sent };   // no file; the head is not out yet; blocks go as the socket drains; all queued
  Up up = Up::None;
  uv_file upFd = -1;
  uint64_t upSize = 0, upOff = 0;
  uint64_t inFlight = 0;   // bytes handed to uv_write whose callback has not come: libuv writes at once and frees in the callback
  std::string upPath, upTail;
};
std::vector<std::unique_ptr<Fetch>> gFetches;   // index = handle - 1
Fetch* fetchAt(int h) { return h > 0 && static_cast<size_t>(h) <= gFetches.size() ? gFetches[static_cast<size_t>(h) - 1].get() : nullptr; }

bool splitUrl(const std::string& u, Fetch* f, std::string* why) {
  bool https = u.compare(0, 8, "https://") == 0;
  if (!https && u.compare(0, 7, "http://") != 0) { *why = "unsupported protocol"; return false; }
  f->secure = https;
  size_t hs = https ? 8 : 7, pe = u.find_first_of("/?#", hs);
  std::string auth = u.substr(hs, pe == std::string::npos ? pe : pe - hs);
  f->path = pe == std::string::npos ? "/" : u.substr(pe);
  if (f->path[0] != '/') f->path = "/" + f->path;
  size_t hash = f->path.find('#');
  if (hash != std::string::npos) f->path.resize(hash);
  size_t colon = auth.rfind(':');
  f->port = https ? 443 : 80;
  if (colon != std::string::npos) { f->port = std::atoi(auth.c_str() + colon + 1); auth.resize(colon); }
  f->host = auth;
  f->url = u;
  if (f->host.empty() || f->port <= 0 || f->port >= 65536) { *why = "invalid URL " + u; return false; }
  return true;
}

void startConnection(Fetch* f);
std::string buildRequest(Fetch* k);
// One entry of the network log per hop: what is really sent (our Host, User-Agent... included).
void logOpen(Fetch* f) {
  if (!netlog::on()) return;
  const std::string req = buildRequest(f);
  const size_t a = req.find("\r\n") + 2, b = req.find("\r\n\r\n");
  f->log = netlog::open(f->secure ? "https" : "http", f->url, f->method, req.substr(a, b - a), f->reqBody);
}

void fdClose(uv_file fd) { uv_fs_t r; uv_fs_close(nullptr, &r, fd, nullptr); uv_fs_req_cleanup(&r); }
// The one place the file body changes state: Waiting (again) at each connection, from the first byte; Sending once the head is out; Sent
// when all is queued; None drops it (the fetch ended, or a redirect turned it into a GET).
void upTo(Fetch* f, Fetch::Up to) {
  using Up = Fetch::Up;
  if (f->up == Up::None) return;   // no file, or dropped: nothing brings it back
  if (to == Up::Sending && f->up != Up::Waiting) return;
  if (to == Up::Sent && f->up != Up::Sending) return;
  if (to == Up::Waiting) f->upOff = 0;
  if (to == Up::None) { fdClose(f->upFd); f->upFd = -1; f->upTail.clear(); }
  f->up = to;
}
// The body bytes not yet handed to the socket.
uint64_t upLeft(const Fetch* f) { return f->up == Fetch::Up::Waiting || f->up == Fetch::Up::Sending ? f->upSize - f->upOff + f->upTail.size() : 0; }
// Never killed by a peer that leaves mid-write (Linux sends SIGPIPE; libuv sets SO_NOSIGPIPE on macOS): as Node does, unless the program
// listens for the signal itself.
void noSigpipe() {
#ifndef _WIN32
  static const bool done = [] { struct sigaction sa{}; if (sigaction(SIGPIPE, nullptr, &sa) == 0 && sa.sa_handler == SIG_DFL) std::signal(SIGPIPE, SIG_IGN); return true; }();
  (void)done;
#endif
}
void maybeFree(Fetch* f) {
  if (f->closing == 0 && f->released && f->finished) gFetches[static_cast<size_t>(f->handle) - 1].reset();
}
void onFetchClosed(uv_handle_t* h) {
  auto* f = static_cast<Fetch*>(h->data);
  f->closing--;
  if (h == reinterpret_cast<uv_handle_t*>(&f->tcp)) {
    f->tcpOpen = false;
    if (f->restart && !f->finished) { f->restart = false; startConnection(f); return; }
  }
  maybeFree(f);
}
void closeTcp(Fetch* f) {
  if (f->tls) { if (!f->tlsBusy) tls::destroy(f->tls); f->tls = nullptr; }   // busy: onTlsStepped destroys it
  f->tlsWaiting.clear();
  f->reqSent = false;
  if (f->tcpOpen) { f->closing++; uv_close(reinterpret_cast<uv_handle_t*>(&f->tcp), onFetchClosed); f->tcpOpen = false; }
}
void onFetchRead(uv_stream_t* s, ssize_t n, const uv_buf_t* b);
void finish(Fetch* f, bool ok, const std::string& why);
const size_t kSaveWaitingCap = 8u << 20;   // beyond this the network waits for the disk
void saveWritten(uv_work_t* w, int);
void saveMore(Fetch* f) {
  if (f->saveWriting || f->saveWaiting.empty()) return;
  f->saveChunk.clear();
  f->saveChunk.swap(f->saveWaiting);
  f->saveWriting = true;
  f->closing++;
  f->saveWork.data = f;
  uv_queue_work(L(), &f->saveWork, [](uv_work_t* w) {
    auto* k = static_cast<Fetch*>(w->data);
    if (k->saveWriteFailed) return;
    if (!k->saving) k->saving = std::fopen(k->savePath.c_str(), k->saveAppend ? "ab" : "wb");
    if (!k->saving || std::fwrite(k->saveChunk.data(), 1, k->saveChunk.size(), k->saving) != k->saveChunk.size() || std::fflush(k->saving) != 0) k->saveWriteFailed = true;
#ifndef _WIN32
    if (!k->saveWriteFailed) fsync(fileno(k->saving));   // written now, not in a burst later that holds up what reads the disk (a film, on an SD card)
#endif
  }, saveWritten);
}
void saveWritten(uv_work_t* w, int) {
  auto* f = static_cast<Fetch*>(w->data);
  f->saveWriting = false;
  f->closing--;
  if (f->saveWriteFailed) f->saveFailed = true;
  if (f->saveReadPaused) {
    f->saveReadPaused = false;
    if (f->tcpOpen && !f->finished) uv_read_start(reinterpret_cast<uv_stream_t*>(&f->tcp), alloc, onFetchRead);
  }
  saveMore(f);
  if (f->held && !f->saveWriting) { f->held = false; finish(f, f->heldOk, f->heldWhy); }
  maybeFree(f);
}
void finish(Fetch* f, bool ok, const std::string& why) {
  if (f->finished || f->held) return;
  if (f->saveWriting || !f->saveWaiting.empty()) { f->held = true; f->heldOk = ok; f->heldWhy = why; return; }
  f->finished = true;
  upTo(f, Fetch::Up::None);
  if (f->saveFailed) ok = false;
  if (f->saving) { if (std::fclose(f->saving) != 0 && ok) { ok = false; f->saveFailed = true; } f->saving = nullptr; }
  if (f->timerOpen) { uv_timer_stop(&f->timer); f->closing++; uv_close(reinterpret_cast<uv_handle_t*>(&f->timer), onFetchClosed); f->timerOpen = false; }
  closeTcp(f);
  loop::addActive(-1);
  if (ok) netlog::response(f->log, f->status, f->reason, f->msg.head, f->msg.body); else netlog::close(f->log, why);
  loop::pushEvent(f->handle, ok ? 40 : 41, f->saveFailed ? "fetch failed: cannot write " + f->savePath : why);
}

std::string resolveLocation(Fetch* f, const std::string& loc) {
  if (loc.compare(0, 7, "http://") == 0 || loc.compare(0, 8, "https://") == 0) return loc;
  std::string origin = std::string(f->secure ? "https://" : "http://") + f->host + (f->port == (f->secure ? 443 : 80) ? "" : ":" + std::to_string(f->port));
  if (loc[0] == '/') return origin + loc;
  size_t slash = f->path.rfind('/');
  return origin + f->path.substr(0, slash + 1) + loc;
}
std::string headerOf(const std::string& head, const std::string& name) {   // case-insensitive, first match
  size_t i = 0;
  while (i < head.size()) {
    size_t e = head.find('\n', i);
    if (e == std::string::npos) e = head.size();
    size_t c = head.find(':', i);
    if (c != std::string::npos && c < e && c - i == name.size()) {
      bool same = true;
      for (size_t k = 0; k < name.size(); k++) if (std::tolower(static_cast<unsigned char>(head[i + k])) != name[k]) same = false;
      if (same) { size_t v = c + 1; while (v < e && head[v] == ' ') v++; return head.substr(v, e - v); }
    }
    i = e + 1;
  }
  return "";
}

// The header lines of a request without Authorization, Proxy-Authorization and Cookie.
std::string withoutCredentials(const std::string& lines) {
  std::string out;
  for (size_t i = 0; i < lines.size();) {
    size_t e = lines.find('\n', i);
    if (e == std::string::npos) e = lines.size();
    const std::string line = lines.substr(i, e - i);
    std::string name = line.substr(0, line.find(':'));
    for (char& c : name) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    if (name != "authorization" && name != "proxy-authorization" && name != "cookie") out += (out.empty() ? "" : "\n") + line;
    i = e + 1;
  }
  return out;
}

void onComplete(Fetch* f) {
  f->msg.flush();
  int s = llhttp_get_status_code(&f->parser);
  std::string loc = headerOf(f->msg.head, "location");
  if ((s == 301 || s == 302 || s == 303 || s == 307 || s == 308) && !loc.empty()) {
    if (f->redirects++ >= kRedirectCap) { finish(f, false, "fetch failed: too many redirects"); return; }
    std::string next = resolveLocation(f, loc), why;
    Fetch probe;
    if (!splitUrl(next, &probe, &why)) { finish(f, false, "fetch failed: " + why); return; }
    if (std::string deny = zn::host::perm::check("net", probe.host); !deny.empty()) { finish(f, false, "fetch failed: redirected, " + deny); return; }
    if (s == 303 || ((s == 301 || s == 302) && f->method == "POST")) { if (f->method != "HEAD") f->method = "GET"; f->reqBody.clear(); upTo(f, Fetch::Up::None); }
    netlog::response(f->log, s, f->reason, f->msg.head, f->msg.body);   // the redirect is an entry of its own, as in a HAR
    // credentials are for the origin they were given to: a redirect to another scheme, host or port drops them, as browsers and curl do
    if (probe.secure != f->secure || probe.host != f->host || probe.port != f->port) f->headers = withoutCredentials(f->headers);
    splitUrl(next, f, &why);
    logOpen(f);
    f->msg = Msg();
    f->restart = true;
    closeTcp(f);
    return;
  }
  f->status = s;
  finish(f, true, "");
}

constexpr size_t kUploadBlock = 256 << 10;   // a large body goes in blocks: each one written is a step of its progress
constexpr size_t kUploadAhead = 1u << 20;    // a file body is read while less than this waits for the socket
void pumpUpload(Fetch* f);
void rawWrite(Fetch* f, const std::string& bytes) {
  if (bytes.empty() || f->finished || !f->tcpOpen) return;
  f->wireTotal += bytes.size();
  for (size_t at = 0; at < bytes.size(); at += kUploadBlock) {
    auto* w = new WriteReq{{}, bytes.substr(at, kUploadBlock), false, f->handle};
    uv_buf_t b = uv_buf_init(w->data.data(), static_cast<unsigned>(w->data.size()));
    if (uv_write(&w->req, reinterpret_cast<uv_stream_t*>(&f->tcp), &b, 1, [](uv_write_t* r2, int st) {
          auto* x = reinterpret_cast<WriteReq*>(r2);
          Fetch* g = fetchAt(x->fetch);
          if (g) g->inFlight -= x->data.size();
          if (g && st == 0 && !g->finished) {
            g->wireSent += x->data.size();
            if (g->progress) loop::pushEvent(g->handle, 47, std::to_string(g->wireSent) + " " + std::to_string(g->wireTotal + upLeft(g)));
            pumpUpload(g);
          }
          delete x;
        }) != 0) { delete w; return; }
    f->inFlight += w->data.size();
  }
}
// Plain bytes of the response into llhttp.
void parseBytes(Fetch* f, const char* data, size_t n) {
  if (f->finished || f->restart) return;
  f->answered = true;
  netlog::mark(f->log, netlog::FirstByte);
  llhttp_errno_t e = llhttp_execute(&f->parser, data, n);
  if (e != HPE_OK && e != HPE_PAUSED && !f->finished && !f->restart) finish(f, false, f->tooBig ? "fetch failed: response too large" : std::string("fetch failed: ") + (f->saveFailed ? "cannot write " + f->savePath : llhttp_get_error_reason(&f->parser)));
}
void parseEof(Fetch* f) {
  if (f->finished || f->restart) return;
  llhttp_errno_t e = llhttp_finish(&f->parser);
  if (!f->finished && !f->restart) finish(f, false, e == HPE_OK ? "fetch failed: empty response" : "fetch failed: ECONNRESET");
}
std::string buildRequest(Fetch* k) {
  std::string req = k->method + " " + k->path + " HTTP/1.1\r\nHost: " + k->host + (k->port == (k->secure ? 443 : 80) ? "" : ":" + std::to_string(k->port)) + "\r\nConnection: close\r\n";
  if (headerOf(k->headers, "user-agent") == "") req += "User-Agent: zinc/0.1\r\n";   // the program's own wins (MusicBrainz asks each app to name itself)
  if (headerOf(k->headers, "accept") == "") req += "Accept: */*\r\n";
  for (size_t i = 0; i < k->headers.size();) {
    size_t e = k->headers.find('\n', i);
    if (e == std::string::npos) e = k->headers.size();
    req += k->headers.substr(i, e - i) + "\r\n";
    i = e + 1;
  }
  const uint64_t file = k->up == Fetch::Up::None ? 0 : k->upSize + k->upTail.size();
  if (!k->reqBody.empty() || file || k->method == "POST" || k->method == "PUT" || k->method == "PATCH") req += "Content-Length: " + std::to_string(k->reqBody.size() + file) + "\r\n";
  return req + "\r\n" + k->reqBody;
}
// Moves what the TLS connection has to say to the socket, then takes what it can say to the program.
void pumpTls(Fetch* f);
// The handshake's signatures and key exchange take the CPU for 60 to 800 ms on a 2011 tablet (a frame's budget is 16): on a worker. One step at
// a time for a connection, so its bytes wait in tlsWaiting; `closing` keeps the Fetch alive until the step is back.
struct TlsStep { uv_work_t work; Fetch* f; tls::Conn* conn; tls::State st; };
void onTlsStepped(uv_work_t* w, int) {
  auto* j = static_cast<TlsStep*>(w->data);
  Fetch* f = j->f;
  const bool current = j->conn == f->tls;
  const tls::State st = j->st;
  f->tlsBusy = false;
  f->closing--;
  if (current) rawWrite(f, tls::takeOutput(f->tls)); else tls::destroy(j->conn);   // the fetch ended or restarted meanwhile
  delete j;
  if (f->tls && !f->finished && !f->restart) {
    const bool more = !f->tlsWaiting.empty();
    if (more) { tls::feed(f->tls, f->tlsWaiting.data(), f->tlsWaiting.size()); f->tlsWaiting.clear(); }
    if (more || !current || st != tls::State::Handshaking) pumpTls(f);
  }
  maybeFree(f);
}
void pumpTls(Fetch* f) {
  if (!f->tls || f->finished || f->restart || f->tlsBusy) return;
  if (!tls::settled(f->tls)) {
    auto* j = new TlsStep{{}, f, f->tls, tls::State::Handshaking};
    j->work.data = j;
    f->tlsBusy = true;
    f->closing++;
    uv_queue_work(static_cast<uv_loop_t*>(loop::uvLoop()), &j->work, [](uv_work_t* w) { auto* s = static_cast<TlsStep*>(w->data); s->st = tls::step(s->conn); }, onTlsStepped);
    return;
  }
  tls::State st = tls::step(f->tls);
  rawWrite(f, tls::takeOutput(f->tls));
  if (st == tls::State::Failed) { finish(f, false, "fetch failed: " + tls::error(f->tls)); return; }
  if (st != tls::State::Ready) return;
  if (!f->reqSent) { f->reqSent = true; netlog::mark(f->log, netlog::Tls); tls::write(f->tls, buildRequest(f)); rawWrite(f, tls::takeOutput(f->tls)); netlog::mark(f->log, netlog::Sent); pumpUpload(f); }
  if (f->finished || f->restart) return;
  std::string plain;
  tls::State rs = tls::read(f->tls, plain);
  rawWrite(f, tls::takeOutput(f->tls));
  if (!plain.empty()) parseBytes(f, plain.data(), plain.size());
  if (f->finished || f->restart) return;
  if (rs == tls::State::Failed) finish(f, false, "fetch failed: " + tls::error(f->tls));
  else if (rs == tls::State::Closed) parseEof(f);
}

void onFetchRead(uv_stream_t* s, ssize_t n, const uv_buf_t* buf) {
  auto* f = static_cast<Fetch*>(s->data);
  if (n > 0 && !f->finished && !f->restart) {
    if (f->tlsBusy) f->tlsWaiting.append(buf->base, static_cast<size_t>(n));
    else if (f->tls) { tls::feed(f->tls, buf->base, static_cast<size_t>(n)); pumpTls(f); }
    else parseBytes(f, buf->base, static_cast<size_t>(n));
  } else if (n < 0 && !f->finished && !f->restart) {
    // Some servers drop mbedTLS's TLS 1.3 session once the request is in, without a word (no response, no alert); OpenSSL's works.
    // The root cause is not found (docs/reports/hardware/hp-touchpad-webos.md, section 14): the request is made again once over TLS 1.2.
    if (f->tls && f->reqSent && !f->answered && !f->tls12 && tls::isTls13(f->tls)) { f->tls12 = true; f->msg = Msg(); f->restart = true; closeTcp(f); }
    else if (f->tls) finish(f, false, f->reqSent ? "fetch failed: ECONNRESET" : "fetch failed: TLS handshake failed");   // closed without close_notify
    else parseEof(f);
  }
  if (buf->base) std::free(buf->base);
}

void connectTo(Fetch* f, sockaddr_in a) {
  netlog::mark(f->log, netlog::Dns);
  upTo(f, Fetch::Up::Waiting);   // a new connection (a redirect, the TLS 1.2 retry) sends the file from its start
  uv_tcp_init(L(), &f->tcp);
  f->tcp.data = f->creq.data = f;
  f->tcpOpen = true;
  llhttp_settings_init(&f->settings);
  f->settings.on_status = [](llhttp_t* p, const char* at, size_t n) { static_cast<Fetch*>(p->data)->reason.assign(at, n); return 0; };
  f->settings.on_header_field = [](llhttp_t* p, const char* at, size_t n) { static_cast<Fetch*>(p->data)->msg.onField(at, n); return 0; };
  f->settings.on_header_value = [](llhttp_t* p, const char* at, size_t n) { static_cast<Fetch*>(p->data)->msg.onValue(at, n); return 0; };
  f->settings.on_headers_complete = [](llhttp_t* p) { static_cast<Fetch*>(p->data)->msg.flush(); return static_cast<Fetch*>(p->data)->method == "HEAD" ? 1 : 0; };
  f->settings.on_body = [](llhttp_t* p, const char* at, size_t n) {
    auto* k = static_cast<Fetch*>(p->data);
    if (!k->savePath.empty() && (p->status_code == 200 || p->status_code == 206)) {
      if (k->saveFailed) return -1;
      k->saveAppend = p->status_code == 206;
      k->saveWaiting.append(at, n);
      saveMore(k);
      if (k->saveWaiting.size() > kSaveWaitingCap && !k->saveReadPaused && k->tcpOpen) { k->saveReadPaused = true; uv_read_stop(reinterpret_cast<uv_stream_t*>(&k->tcp)); }
      return 0;
    }
    if (k->msg.body.size() + n > static_cast<size_t>(k->maxBytes)) { k->tooBig = true; return -1; }
    k->msg.body.append(at, n);
    return 0;
  };
  f->settings.on_message_complete = [](llhttp_t* p) { onComplete(static_cast<Fetch*>(p->data)); return 0; };
  llhttp_init(&f->parser, HTTP_RESPONSE, &f->settings);
  f->parser.data = f;
  uint64_t elapsed = uv_now(L()) - f->startMs;
  uv_timer_stop(&f->timer);
  uint64_t connectMs = f->timeoutMs < kConnectCapMs ? f->timeoutMs : kConnectCapMs;
  uv_timer_start(&f->timer, [](uv_timer_t* t) { finish(static_cast<Fetch*>(t->data), false, "fetch failed: timeout"); }, connectMs > elapsed ? connectMs - elapsed : 1, 0);
  int rc = uv_tcp_connect(&f->creq, &f->tcp, reinterpret_cast<sockaddr*>(&a), [](uv_connect_t* r, int status) {
    auto* k = static_cast<Fetch*>(r->data);
    if (status != 0) { if (!k->finished) finish(k, false, status == UV_ECONNREFUSED ? "fetch failed: ECONNREFUSED" : status == UV_ETIMEDOUT ? "fetch failed: timeout" : "fetch failed: " + std::string(uv_err_name(status))); return; }
    if (k->finished) return;
    netlog::mark(k->log, netlog::Connect);
    uint64_t used = uv_now(L()) - k->startMs;
    uv_timer_stop(&k->timer);
    uv_timer_start(&k->timer, [](uv_timer_t* t) { finish(static_cast<Fetch*>(t->data), false, "fetch failed: timeout"); }, k->timeoutMs > used ? k->timeoutMs - used : 1, 0);
    uv_read_start(reinterpret_cast<uv_stream_t*>(&k->tcp), alloc, onFetchRead);
    if (k->secure) {
      std::string err;
      k->answered = false;
      k->tls = tls::openClient(k->host, err, k->tls12);
      if (!k->tls) { finish(k, false, "fetch failed: " + err); return; }
      pumpTls(k);
    } else { k->reqSent = true; rawWrite(k, buildRequest(k)); netlog::mark(k->log, netlog::Sent); pumpUpload(k); }

  });
  if (rc != 0) finish(f, false, "fetch failed: ECONNREFUSED");
}

// Reads the file body block by block while less than kUploadAhead waits for the socket: a disk faster than the network waits for the network
// (each write done calls this again), and the memory stays a few blocks. The reads are libuv's synchronous calls on the loop thread, as the
// server's file replies (a page-cache hit is microseconds). ponytail: a uv_fs read on the pool if a slow disk shows in the frames.
void pumpUpload(Fetch* f) {
  using Up = Fetch::Up;
  if (!f->reqSent || f->finished || f->restart || !f->tcpOpen || f->tlsBusy) return;
  upTo(f, Up::Sending);
  thread_local std::unique_ptr<char[]> buf;
  while (f->up == Up::Sending && f->inFlight < kUploadAhead && !f->finished) {
    if (f->upOff == f->upSize) {
      const std::string tail = f->upTail;
      upTo(f, Up::Sent);
      if (f->tls) { tls::write(f->tls, tail); rawWrite(f, tls::takeOutput(f->tls)); } else rawWrite(f, tail);
      break;
    }
    if (!buf) buf.reset(new char[kUploadBlock]);
    uv_buf_t b = uv_buf_init(buf.get(), static_cast<unsigned>(std::min<uint64_t>(kUploadBlock, f->upSize - f->upOff)));
    uv_fs_t r;
    const ssize_t n = uv_fs_read(nullptr, &r, f->upFd, &b, 1, static_cast<int64_t>(f->upOff), nullptr);
    uv_fs_req_cleanup(&r);
    if (n <= 0) { finish(f, false, "fetch failed: cannot read " + f->upPath + (n < 0 ? std::string(": ") + uv_strerror(static_cast<int>(n)) : std::string(": it shrank"))); return; }
    f->upOff += static_cast<uint64_t>(n);
    if (f->tls) { tls::write(f->tls, std::string(buf.get(), static_cast<size_t>(n))); rawWrite(f, tls::takeOutput(f->tls)); }
    else rawWrite(f, std::string(buf.get(), static_cast<size_t>(n)));
  }
}

// A name asks the network and can take seconds (5 s seen for a radio's logo on a tablet): on a worker, or every frame waits for it.
void startConnection(Fetch* f) {
  sockaddr_in a;
  if (uv_ip4_addr(f->host.c_str(), f->port, &a) == 0) { connectTo(f, a); return; }
  struct Lookup { uv_getaddrinfo_t req; Fetch* f; };
  auto* lookup = new Lookup{{}, f};
  addrinfo hints{};
  hints.ai_family = AF_INET;
  hints.ai_socktype = SOCK_STREAM;
  f->closing++;
  const int rc = uv_getaddrinfo(L(), &lookup->req, [](uv_getaddrinfo_t* q, int status, addrinfo* res) {
    auto* done = reinterpret_cast<Lookup*>(q);
    Fetch* k = done->f;
    delete done;
    k->closing--;
    if (!k->finished) {
      if (status != 0 || !res) finish(k, false, "fetch failed: ENOTFOUND");
      else { sockaddr_in found = *reinterpret_cast<sockaddr_in*>(res->ai_addr); found.sin_port = htons(static_cast<uint16_t>(k->port)); connectTo(k, found); }
    }
    if (res) uv_freeaddrinfo(res);
    maybeFree(k);
  }, f->host.c_str(), nullptr, &hints);
  if (rc != 0) { delete lookup; f->closing--; finish(f, false, "fetch failed: ENOTFOUND"); }
}

// ---------------------------------------------------------------- server
// A connection reads one request, hands it to the program (event 42) and waits for the reply; bytes that arrive meanwhile (a pipelining
// client) wait in `pending` and are parsed once the reply is out. Keep-alive is HTTP/1.1's default; the reply is written with writev, and
// with uv_try_write first: a reply that fits in the socket's buffer (nearly all) is not copied at all.
struct Limits {
  size_t headerBytes = 16384;        // request line and headers: 431 above
  size_t bodyBytes = 16u << 20;      // 413 above; a body is held whole until the handler runs: 32 uploads at 16 MiB are half a Pi 3's 1 GB
                                     // (ZN-1028; 64 MiB was 2 GB). Larger bodies: maxBodyBytes, or streamBody, which holds none
  size_t conns = 10000;              // open connections of the program's servers: the next ones are closed at once
  int connsPerIp = 256;              // open connections of one client address
  double ratePerIp = 0;              // requests per second of one address (a bucket that size, refilled continuously); 0: no limit; 429 above
  uint64_t headersMs = 10000;        // from a request's first byte to the end of its headers (a client that trickles them, slowloris): 408
  uint64_t requestMs = 10000;        // the longest pause while a body arrives: 408
  uint64_t keepAliveMs = 5000;       // a kept-alive connection with no request
  bool streamBody = false;           // the body reaches the program in chunks (events 43, then 44) instead of with the request
  uint64_t wsPayloadBytes = 16u << 20;      // a WebSocket message: above it the connection closes with 1009
  uint64_t wsIdleMs = 120000;               // a WebSocket without a frame that long gets a ping, then the close when it stays silent as long
  size_t wsBackpressureBytes = 16u << 20;   // bytes waiting for a WebSocket client that does not read: above it the connection closes (1008)
};
struct FileSend;
struct Listener { uv_tcp_t tcp; int port = 0; std::shared_ptr<tls::Server> tls; Limits lim; bool toldBody = false; };   // toldBody: the program heard of a 413   // tls: an https server (its connections share it)
enum class St { Reading, Handling, Streaming, Idle, WebSocket };   // Streaming: a reply in parts (replyStart/write/end) or a file goes out
struct SConn {
  int id = 0, port = 0;   // port: the listener's; the program's handler for that server answers
  uv_tcp_t tcp;
  uv_timer_t timer;
  llhttp_t parser;
  Msg msg;
  std::string target, ip, pending;
  Limits lim;
  St st = St::Reading;
  size_t headBytes = 0, bodySeen = 0, queuedBody = 0;
  int err = 0;   // the status a callback refused the request with (413, 429, 431)
  FileSend* file = nullptr;   // a file being sent (replyFile)
  bool complete = false, answered = false, closed = false, keepAlive = true, http10 = false, isHead = false, chunked = false, readPaused = false, wantDrain = false;
  tls::Conn* tls = nullptr;
  std::shared_ptr<tls::Server> tlsServer;   // kept while the connection lives: a stopped server's settings outlive it
  wslay_event_context_ptr ws = nullptr;     // an upgraded connection (wsAccept)
  std::string wsKey, wsIn, wsOut;           // wsKey: the request's Sec-WebSocket-Key
  size_t wsInAt = 0;
  bool wsPinged = false, wsReported = false, wsCloseAfterWrite = false;
  int closing = 0;
};
struct Peer { int conns = 0; double tokens = 0; uint64_t at = 0; };
std::map<int, Listener*> gListeners;   // by port: a program may serve several (the app's songs for a speaker, a Subsonic API...)
std::map<int, SConn*> gConns;
std::map<std::string, Peer> gPeers;    // by client address: its connections and its request bucket
int gNextConn = 1;
constexpr size_t kDrainBytes = 64u << 10, kPendingCap = 1u << 20, kQueuedBodyCap = 1u << 20;
constexpr int kEvRequest = 42, kEvBody = 43, kEvBodyEnd = 44, kEvDrain = 45, kEvGone = 46;

SConn* connAt(int id) { auto it = gConns.find(id); return it == gConns.end() || it->second->closed ? nullptr : it->second; }
void fileDrop(SConn* c);
void onSClosed(uv_handle_t* h) {
  auto* c = static_cast<SConn*>(h->data);
  if (--c->closing == 0) { if (c->tls) tls::destroy(c->tls); if (c->ws) wslay_event_context_free(c->ws); fileDrop(c); delete c; }
}
void closeConn(SConn* c) {
  if (c->closed) return;
  c->closed = true;
  if (c->st == St::Handling || c->st == St::Streaming) loop::pushEvent(c->id, kEvGone, "");   // the program holds it: it learns the client is gone
  if (c->ws && !c->wsReported) {   // a WebSocket gone without the close handshake: the code the server sent (1009, 1008...), else 1006
    c->wsReported = true;
    const uint16_t sent = wslay_event_get_status_code_sent(c->ws);
    loop::pushEvent(c->id, 82, std::to_string(sent && sent != WSLAY_CODE_NO_STATUS_RCVD ? sent : 1006) + "\x1e");
  }
  gConns.erase(c->id);
  auto p = gPeers.find(c->ip);
  if (p != gPeers.end() && --p->second.conns <= 0 && p->second.tokens >= c->lim.ratePerIp) gPeers.erase(p);   // a full bucket is a fresh one
  uv_read_stop(reinterpret_cast<uv_stream_t*>(&c->tcp));
  uv_timer_stop(&c->timer);
  c->closing = 2;
  uv_close(reinterpret_cast<uv_handle_t*>(&c->timer), onSClosed);
  uv_close(reinterpret_cast<uv_handle_t*>(&c->tcp), onSClosed);
}
void onSTimer(uv_timer_t* t);
void arm(SConn* c, uint64_t ms) {
  if (ms == 0) { uv_timer_stop(&c->timer); return; }   // a limit of 0: none (a zero-length timer would close the connection at once)
  uv_timer_start(&c->timer, onSTimer, ms, 0);
}

// The Date header, made again when the second changes (RFC 9110 asks an origin server with a clock for it).
const std::string& dateLine() {
  static const char* const kDay[] = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
  static const char* const kMon[] = {"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};
  thread_local std::string line;
  thread_local time_t at = 0;
  const time_t now = time(nullptr);
  if (now != at || line.empty()) {
    at = now;
    struct tm g{};
#ifdef _WIN32
    gmtime_s(&g, &now);
#else
    gmtime_r(&now, &g);
#endif
    char b[64];
    std::snprintf(b, sizeof b, "Date: %s, %02d %s %04d %02d:%02d:%02d GMT\r\n", kDay[g.tm_wday], g.tm_mday, kMon[g.tm_mon], g.tm_year + 1900, g.tm_hour, g.tm_min, g.tm_sec);
    line = b;
  }
  return line;
}

enum class Then { More, End, Close };
void nextRequest(SConn* c);
struct FileSend;
void sendBlock(FileSend* s);
struct Out { uv_write_t req; std::string a, b; SConn* c; bool close; };
void afterWrite(SConn* c) {   // a queued write is done: wake a program that waits for the socket to drain
  if (c->wantDrain && c->tcp.write_queue_size < kDrainBytes / 2) { c->wantDrain = false; loop::pushEvent(c->id, kEvDrain, ""); }
}
void onWritten(uv_write_t* r, int status) {
  auto* o = reinterpret_cast<Out*>(r);
  SConn* c = o->c;
  const bool close = o->close;
  delete o;
  if (c->closed) return;
  if (status < 0 || close) { closeConn(c); return; }
  afterWrite(c);
  if (c->file && c->tcp.write_queue_size == 0) sendBlock(c->file);   // a file goes on
  if (c->wsCloseAfterWrite && c->tcp.write_queue_size == 0) closeConn(c);   // the close handshake is out
}
// Sends a then b (one writev); `then` says what follows: more of the same reply, its end (the next request, or the close), or the close.
void send(SConn* c, std::string&& a, std::string_view b, Then then, bool raw = false, bool queue = false) {   // raw: bytes TLS made already; queue: no try_write
  if (c->closed) return;
  if (then != Then::More) c->st = St::Idle;   // the program no longer holds the connection
  const bool close = then == Then::Close || (then == Then::End && !c->keepAlive);
  if (c->tls && !raw) {
    if ((!a.empty() && !tls::write(c->tls, a)) || (!b.empty() && !tls::write(c->tls, std::string(b)))) { closeConn(c); return; }
    if (close) tls::close(c->tls);
    a = tls::takeOutput(c->tls);
    b = std::string_view();
  }
  uv_stream_t* s = reinterpret_cast<uv_stream_t*>(&c->tcp);
  size_t skip = 0;   // bytes the socket took at once
  if (c->tcp.write_queue_size == 0 && !queue) {
    uv_buf_t bufs[2] = {uv_buf_init(a.data(), static_cast<unsigned>(a.size())), uv_buf_init(const_cast<char*>(b.data()), static_cast<unsigned>(b.size()))};
    const int w = uv_try_write(s, bufs, b.empty() ? 1 : 2);
    if (w >= 0) skip = static_cast<size_t>(w);
    else if (w != UV_EAGAIN && w != UV_ENOSYS) { closeConn(c); return; }
  }
  if (skip == a.size() + b.size()) {
    if (close) closeConn(c);
    else if (then == Then::End) nextRequest(c);
    return;
  }
  auto* o = new Out{{}, std::string(), std::string(), c, close};
  if (skip < a.size()) { o->a = a.substr(skip); o->b.assign(b.data(), b.size()); }
  else o->b.assign(b.data() + (skip - a.size()), b.size() - (skip - a.size()));
  uv_buf_t bufs[2] = {uv_buf_init(o->a.data(), static_cast<unsigned>(o->a.size())), uv_buf_init(o->b.data(), static_cast<unsigned>(o->b.size()))};
  if (o->a.empty()) bufs[0] = bufs[1];
  if (uv_write(&o->req, s, bufs, o->a.empty() || o->b.empty() ? 1 : 2, onWritten) != 0) { delete o; closeConn(c); return; }
  if (then == Then::End && !close) nextRequest(c);   // the next reply queues behind this one: the order holds
}
void quick(SConn* c, int status) {
  if (c->closed) return;
  if (c->answered) { closeConn(c); return; }
  c->answered = true;
  c->keepAlive = false;
  // A limit the program set says which, to the client in the body and to the program once on stderr (its log), with the option to raise.
  const std::string why = status == 413 ? "request body over this server's limit of " + std::to_string(c->lim.bodyBytes) + " bytes (maxBodyBytes)\n"
                        : status == 431 ? "request headers over this server's limit of " + std::to_string(c->lim.headerBytes) + " bytes (maxHeaderBytes)\n" : "";
  if (status == 413) {
    auto li = gListeners.find(c->port);
    if (li != gListeners.end() && !li->second->toldBody) {
      li->second->toldBody = true;
      std::fprintf(stderr, "zinc: warning: the server on port %d refused a request body from %s with 413: over its limit of %zu bytes; raise it with serve(port, handler, { maxBodyBytes }) or take the body as it comes with { streamBody: true }\n", c->port, c->ip.c_str(), c->lim.bodyBytes);
    }
  }
  std::string h = std::string("HTTP/1.1 ") + std::to_string(status) + " " + reasonOf(status) + "\r\n" + dateLine() + (status == 429 ? "Retry-After: 1\r\n" : "") +
                  (why.empty() ? "" : "Content-Type: text/plain; charset=utf-8\r\n") + "Content-Length: " + std::to_string(why.size()) + "\r\nConnection: close\r\n\r\n" + why;
  send(c, std::move(h), std::string_view(), Then::Close);
}

void parseRequest(SConn* c, const char* data, size_t n);
void sAlloc(uv_handle_t*, size_t, uv_buf_t* b);
void onSRead(uv_stream_t* s, ssize_t n, const uv_buf_t* buf);
void nextRequest(SConn* c) {
  c->msg.head.clear(); c->msg.field.clear(); c->msg.value.clear(); c->msg.inValue = false;
  if (c->msg.body.capacity() > (64u << 10)) std::string().swap(c->msg.body); else c->msg.body.clear();   // a kept connection does not hold an upload's memory
  c->target.clear();
  c->headBytes = c->bodySeen = 0;
  c->complete = c->answered = c->chunked = false;
  c->st = St::Idle;
  arm(c, c->lim.keepAliveMs);
  llhttp_resume(&c->parser);
  if (c->readPaused) { c->readPaused = false; uv_read_start(reinterpret_cast<uv_stream_t*>(&c->tcp), sAlloc, onSRead); }
  if (!c->pending.empty()) {
    std::string p = std::move(c->pending);
    c->pending.clear();
    parseRequest(c, p.data(), p.size());
  }
}
void pauseReading(SConn* c) {
  if (!c->readPaused) { c->readPaused = true; uv_read_stop(reinterpret_cast<uv_stream_t*>(&c->tcp)); }
}
void wsFeed(SConn* c, const char* data, size_t n);
void parseRequest(SConn* c, const char* data, size_t n) {
  if (c->closed) return;
  if (c->ws) { wsFeed(c, data, n); return; }
  if (c->complete) {   // the program has the last request: the next ones wait
    c->pending.append(data, n);
    if (c->pending.size() > kPendingCap) pauseReading(c);
    return;
  }
  const llhttp_errno_t e = llhttp_execute(&c->parser, data, n);
  if (e == HPE_PAUSED) {
    const char* at = llhttp_get_error_pos(&c->parser);
    if (at && at >= data && at < data + n) c->pending.append(at, static_cast<size_t>(data + n - at));
  } else if (e != HPE_OK && !c->closed) quick(c, c->err ? c->err : 400);
}

std::string requestEvent(SConn* c, llhttp_t* p, const std::string& body) {
  const char* method = llhttp_method_name(static_cast<llhttp_method_t>(llhttp_get_method(p)));
  const std::string port = std::to_string(c->port);
  std::string d;
  d.reserve(std::strlen(method) + c->target.size() + c->ip.size() + port.size() + c->msg.head.size() + body.size() + 5);
  d += method; d += '\x1e'; d += c->target; d += '\x1e'; d += c->ip; d += '\x1e'; d += port; d += '\x1e'; d += c->msg.head; d += '\x1e'; d += body;
  return d;
}
SConn* of(llhttp_t* p) { return static_cast<SConn*>(p->data); }
bool headRoom(SConn* c, size_t n) {
  c->headBytes += n;
  if (c->headBytes <= c->lim.headerBytes) return true;
  c->err = 431;
  return false;
}
const llhttp_settings_t& serverSettings() {
  static const llhttp_settings_t s = [] {
    llhttp_settings_t x;
    llhttp_settings_init(&x);
    x.on_message_begin = [](llhttp_t* p) {
      SConn* c = of(p);
      c->st = St::Reading;
      arm(c, c->lim.headersMs);
      if (c->lim.ratePerIp > 0) {
        Peer& peer = gPeers[c->ip];
        const uint64_t now = uv_now(L());
        peer.tokens = std::min(c->lim.ratePerIp, peer.tokens + c->lim.ratePerIp * static_cast<double>(now - peer.at) / 1000.0);
        peer.at = now;
        if (peer.tokens < 1) { c->err = 429; return -1; }
        peer.tokens -= 1;
      }
      return 0;
    };
    x.on_url = [](llhttp_t* p, const char* at, size_t n) { if (!headRoom(of(p), n)) return -1; of(p)->target.append(at, n); return 0; };
    x.on_header_field = [](llhttp_t* p, const char* at, size_t n) { if (!headRoom(of(p), n)) return -1; of(p)->msg.onField(at, n); return 0; };
    x.on_header_value = [](llhttp_t* p, const char* at, size_t n) { if (!headRoom(of(p), n)) return -1; of(p)->msg.onValue(at, n); return 0; };
    x.on_headers_complete = [](llhttp_t* p) {
      SConn* c = of(p);
      c->msg.flush();
      c->http10 = p->http_major == 1 && p->http_minor == 0;
      c->isHead = llhttp_get_method(p) == HTTP_HEAD;
      c->keepAlive = llhttp_should_keep_alive(p) != 0;
      if (p->content_length > c->lim.bodyBytes && (p->flags & F_CONTENT_LENGTH)) { c->err = 413; return -1; }   // refused before the body comes
      if (p->upgrade) {   // the connection is the program's to upgrade (wsAccept) or closes after the reply
        c->keepAlive = false;
        c->wsKey.clear();
        std::string up = headerOf(c->msg.head, "upgrade");
        for (char& ch : up) ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
        if (up == "websocket" && headerOf(c->msg.head, "sec-websocket-version") == "13" && llhttp_get_method(p) == HTTP_GET) c->wsKey = headerOf(c->msg.head, "sec-websocket-key");
      }
      arm(c, c->lim.requestMs);
      if (c->lim.streamBody) { c->st = St::Handling; loop::pushEvent(c->id, kEvRequest, requestEvent(c, p, std::string())); }
      return 0;
    };
    x.on_body = [](llhttp_t* p, const char* at, size_t n) {
      SConn* c = of(p);
      c->bodySeen += n;
      if (c->bodySeen > c->lim.bodyBytes) { c->err = 413; return -1; }
      if (c->lim.requestMs) arm(c, c->lim.requestMs);
      if (c->lim.streamBody) {
        if (c->answered) return 0;   // the program answered already: the rest is read and dropped
        c->queuedBody += n;
        loop::pushEvent(c->id, kEvBody, "", std::string(at, n));
        if (c->queuedBody > kQueuedBodyCap) pauseReading(c);   // the program reads slower than the client sends
      } else c->msg.body.append(at, n);
      return 0;
    };
    x.on_message_complete = [](llhttp_t* p) {
      SConn* c = of(p);
      c->msg.flush();
      c->complete = true;
      uv_timer_stop(&c->timer);   // the request is all here: the program may answer later (serveAsync)
      if (c->lim.streamBody) {
        if (!c->answered) loop::pushEvent(c->id, kEvBodyEnd, "");   // else the reply went out before the body ended: the connection closes
      } else {
        c->st = St::Handling;
        loop::pushEvent(c->id, kEvRequest, requestEvent(c, p, c->msg.body), c->msg.body);   // the payload: the body byte for byte (Request.rawBody)
      }
      return static_cast<int>(HPE_PAUSED);
    };
    return x;
  }();
  return s;
}

void onSTimer(uv_timer_t* t) {
  auto* c = static_cast<SConn*>(t->data);
  if (c->st == St::WebSocket) {   // silent for the idle time: a ping; silent again: gone
    if (c->wsPinged) { closeConn(c); return; }
    c->wsPinged = true;
    wsPing(c->id);
    if (!c->closed) arm(c, c->lim.wsIdleMs);
    return;
  }
  if (c->st == St::Reading && !c->answered) quick(c, 408); else closeConn(c);
}
void sAlloc(uv_handle_t*, size_t, uv_buf_t* b) {   // the bytes are parsed (or copied into TLS) before the next read: one buffer serves them all
  thread_local std::unique_ptr<char[]> buf;
  if (!buf) buf.reset(new (std::nothrow) char[64 << 10]);
  *b = uv_buf_init(buf.get(), buf ? 64 << 10 : 0);
}
void onSRead(uv_stream_t* s, ssize_t n, const uv_buf_t* buf) {
  auto* c = static_cast<SConn*>(s->data);
  if (c->closed) return;
  if (n == UV_EOF && c->complete && !c->tls) {   // a client that half-closes after its request still gets the reply, then the close
    uv_read_stop(s);
    c->keepAlive = false;
    if (c->st == St::Idle) closeConn(c);
    return;
  }
  if (n < 0) { closeConn(c); return; }
  if (n == 0) return;
  if (!c->tls) { parseRequest(c, buf->base, static_cast<size_t>(n)); return; }
  tls::feed(c->tls, buf->base, static_cast<size_t>(n));
  const tls::State st = tls::step(c->tls);
  std::string out = tls::takeOutput(c->tls);
  if (!out.empty()) send(c, std::move(out), std::string_view(), Then::More, true);
  if (c->closed) return;
  if (st == tls::State::Failed) { closeConn(c); return; }
  if (st != tls::State::Ready) return;
  std::string plain;
  const tls::State rs = tls::read(c->tls, plain);
  if (!plain.empty()) parseRequest(c, plain.data(), plain.size());
  if (!c->closed && (rs == tls::State::Failed || rs == tls::State::Closed)) closeConn(c);
}
std::string peerName(uv_tcp_t* t) {
  sockaddr_storage a{};
  int len = sizeof a;
  char ip[64] = "";
  if (uv_tcp_getpeername(t, reinterpret_cast<sockaddr*>(&a), &len) == 0) {
    if (a.ss_family == AF_INET6) uv_ip6_name(reinterpret_cast<sockaddr_in6*>(&a), ip, sizeof ip);
    else uv_ip4_name(reinterpret_cast<sockaddr_in*>(&a), ip, sizeof ip);
  }
  if (std::strncmp(ip, "::ffff:", 7) == 0 && std::strchr(ip + 7, '.')) return ip + 7;   // an IPv4 client of the dual-stack socket
  return ip;
}
void onConnection(uv_stream_t* srv, int status) {
  if (status != 0) return;
  auto* li = static_cast<Listener*>(srv->data);
  auto* c = new SConn();
  uv_tcp_init(L(), &c->tcp);
  uv_timer_init(L(), &c->timer);
  c->tcp.data = c->timer.data = c;
  c->lim = li->lim;
  if (gPeers.size() > 65536) for (auto it = gPeers.begin(); it != gPeers.end();) it = it->second.conns <= 0 ? gPeers.erase(it) : std::next(it);
  bool ok = uv_accept(srv, reinterpret_cast<uv_stream_t*>(&c->tcp)) == 0 && gConns.size() < c->lim.conns;
  if (ok) {
    c->ip = peerName(&c->tcp);
    Peer& peer = gPeers[c->ip];
    if (peer.conns == 0 && peer.at == 0) { peer.tokens = c->lim.ratePerIp; peer.at = uv_now(L()); }
    ok = peer.conns < c->lim.connsPerIp;
    if (ok) peer.conns++;
    else if (peer.conns == 0) gPeers.erase(c->ip);
  }
  if (!ok) {   // over a limit: closed before a byte is read, the cheapest answer to a flood
    c->closed = true;
    c->closing = 2;
    uv_close(reinterpret_cast<uv_handle_t*>(&c->timer), onSClosed);
    uv_close(reinterpret_cast<uv_handle_t*>(&c->tcp), onSClosed);
    return;
  }
  c->id = gNextConn++;
  gConns[c->id] = c;
  c->port = li->port;
  uv_tcp_nodelay(&c->tcp, 1);
  if (li->tls) {
    std::string err;
    c->tlsServer = li->tls;
    c->tls = tls::openServer(li->tls.get(), err);
    if (!c->tls) { closeConn(c); return; }
  }
  llhttp_init(&c->parser, HTTP_REQUEST, &serverSettings());
  c->parser.data = c;
  arm(c, c->lim.headersMs);
  uv_read_start(reinterpret_cast<uv_stream_t*>(&c->tcp), sAlloc, onSRead);
}

// The status line, the program's header lines (a line with a control character is dropped) and the Date; what the lines ask for.
struct Head { std::string text; bool chunked = false, length = false, close = false; };
bool nameIs(const char* p, size_t n, const char* name) {
  const size_t k = std::strlen(name);
  if (n < k + 1 || p[k] != ':') return false;
  for (size_t i = 0; i < k; i++) if (std::tolower(static_cast<unsigned char>(p[i])) != name[i]) return false;
  return true;
}
bool valueIs(const char* p, size_t n, size_t from, const char* v) {
  while (from < n && p[from] == ' ') from++;
  const size_t k = std::strlen(v);
  if (n - from != k) return false;
  for (size_t i = 0; i < k; i++) if (std::tolower(static_cast<unsigned char>(p[from + i])) != v[i]) return false;
  return true;
}
Head headOf(int status, const std::string& headers) {
  Head h;
  h.text.reserve(96 + headers.size());
  h.text += "HTTP/1.1 "; h.text += std::to_string(status); h.text += ' '; h.text += reasonOf(status); h.text += "\r\n";
  for (size_t i = 0; i < headers.size();) {
    size_t e = headers.find('\n', i);
    if (e == std::string::npos) e = headers.size();
    const char* line = headers.data() + i;
    const size_t n = e - i;
    i = e + 1;
    if (n == 0 || std::memchr(line, '\r', n) || std::memchr(line, '\0', n)) continue;
    if (nameIs(line, n, "transfer-encoding")) { h.chunked = valueIs(line, n, 18, "chunked"); if (h.chunked) continue; }   // added by the server below
    else if (nameIs(line, n, "content-length")) { h.length = true; }
    else if (nameIs(line, n, "connection")) { h.close = valueIs(line, n, 11, "close"); continue; }
    h.text.append(line, n);
    h.text += "\r\n";
  }
  h.text += dateLine();
  return h;
}
void endHead(SConn* c, Head& h) {
  if (h.close || !c->complete) c->keepAlive = false;   // a streamed body that is not all read: the connection cannot be reused
  if (!c->keepAlive) h.text += "Connection: close\r\n";
  else if (c->http10) h.text += "Connection: keep-alive\r\n";
  h.text += "\r\n";
}
bool bodiless(SConn* c, int status) { return c->isHead || status == 204 || status == 304 || (status >= 100 && status < 200); }

// A file as the body. On macOS and Linux over plain HTTP the kernel copies it from the page cache to the socket (sendfile(2), no byte through
// the program), as much as the socket takes; when it is full, one small block goes by uv_write, and its completion (the socket has room
// again) brings the next sendfile: libuv offers no other wait for a writable socket it owns. Under TLS (the bytes must be encrypted) and on
// Windows, the file is read one block at a time into one buffer and written (uv_try_write: no copy while the socket takes it all); the next
// block once the socket holds no more than this one, so a slow client slows the reads. A Range asks for one byte range. The reads are
// libuv's synchronous file calls on the loop thread (a page-cache hit is microseconds; portable, no stdio buffer in between). ponytail: a
// uv_fs read pool if a slow disk shows in other requests' latency. Not uv_fs_sendfile: on Linux it tries copy_file_range first, which a
// socket refuses, and falls back to a read/write loop that blocks in poll().
constexpr size_t kFileBlock = 256u << 10, kFileTurn = 1u << 20;   // kFileTurn: bytes written in one go before the loop gets its turn back
void fileClose(uv_file fd) { uv_fs_t r; uv_fs_close(nullptr, &r, fd, nullptr); uv_fs_req_cleanup(&r); }
// Files stay open between requests, checked by a stat (same inode, size and modification time) at each: on macOS an open and a close cost
// 13 us, a stat 1.5 us, and the open was a quarter of a static file's time (ZN-892). A changed file is opened again.
struct OpenFile {
  uv_file fd = -1;
  uint64_t ino = 0, size = 0, mtimeNs = 0;
  ~OpenFile() { if (fd >= 0) fileClose(fd); }
};
std::map<std::string, std::shared_ptr<OpenFile>> gFiles;   // ponytail: 64 entries, the whole cache dropped when full; an LRU if a site serves more hot files
std::shared_ptr<OpenFile> openFile(const std::string& path) {
  uv_fs_t r;
  if (uv_fs_stat(nullptr, &r, path.c_str(), nullptr) != 0) { uv_fs_req_cleanup(&r); gFiles.erase(path); return nullptr; }
  const uv_stat_t st = r.statbuf;
  uv_fs_req_cleanup(&r);
  if ((st.st_mode & S_IFMT) != S_IFREG) return nullptr;
  const uint64_t mt = static_cast<uint64_t>(st.st_mtim.tv_sec) * 1000000000u + static_cast<uint64_t>(st.st_mtim.tv_nsec);
  auto it = gFiles.find(path);
  if (it != gFiles.end() && it->second->ino == st.st_ino && it->second->size == st.st_size && it->second->mtimeNs == mt) return it->second;
  const uv_file fd = uv_fs_open(nullptr, &r, path.c_str(), UV_FS_O_RDONLY, 0, nullptr);
  uv_fs_req_cleanup(&r);
  if (fd < 0) return nullptr;
  auto f = std::make_shared<OpenFile>();   // not a copy of a temporary: its destructor would close the file
  f->fd = fd; f->ino = st.st_ino; f->size = st.st_size; f->mtimeNs = mt;
  if (gFiles.size() >= 64) gFiles.clear();
  gFiles[path] = f;
  return f;
}
struct FileSend { SConn* c; std::shared_ptr<OpenFile> file; uint64_t off, left; std::string head; };
void fileDrop(SConn* c) { delete c->file; c->file = nullptr; }
#ifdef ZN_SENDFILE
constexpr size_t kProbeBlock = 16u << 10;   // the block written by uv_write to learn when a full socket has room: the only bytes copied
// Up to `len` bytes of `fd` from `off` straight into the socket: what it took (0 when it is full), -1 on an error or past the file's end.
int64_t sendfileTo(int sock, int fd, uint64_t off, size_t len) {
#ifdef __linux__
  off_t o = static_cast<off_t>(off);
  const ssize_t n = ::sendfile(sock, fd, &o, len);
  if (n > 0) return n;
  return n < 0 && (errno == EAGAIN || errno == EINTR) ? 0 : -1;   // 0: the file ended (it shrank)
#else
  off_t sent = static_cast<off_t>(len);   // in: how much to send; out: how much went, an EAGAIN included
  const int r = ::sendfile(fd, sock, static_cast<off_t>(off), &sent, nullptr, 0);
  if (r == 0) return sent > 0 ? sent : -1;   // 0 sent without an error: past the end
  return errno == EAGAIN || errno == EINTR ? sent : -1;
#endif
}
#endif
void sendBlock(FileSend* s) {
  SConn* c = s->c;
  thread_local std::unique_ptr<char[]> buf;
  if (!buf) buf.reset(new char[kFileBlock]);
  size_t turn = 0;
#ifdef ZN_SENDFILE
  uv_os_fd_t sock = -1;
  if (!c->tls && s->left > 0 && uv_fileno(reinterpret_cast<uv_handle_t*>(&c->tcp), &sock) == 0) {
    c->file = s;   // owned by the connection while it goes: a close drops it
    if (!s->head.empty()) {   // the head first, through libuv: the file goes once the socket took it
      std::string head = std::move(s->head);
      s->head.clear();
      send(c, std::move(head), std::string_view(), Then::More);
      if (c->closed) return;
      if (c->tcp.write_queue_size > 0) { arm(c, c->lim.requestMs); return; }
    }
    while (s->left > 0 && turn < kFileTurn) {
      const int64_t n = sendfileTo(sock, s->file->fd, s->off, static_cast<size_t>(std::min<uint64_t>(s->left, kFileTurn - turn)));
      if (n < 0) { fileDrop(c); closeConn(c); return; }   // the client left, or the file shrank: the client sees a short body
      if (n == 0) break;
      s->off += static_cast<uint64_t>(n);
      s->left -= static_cast<uint64_t>(n);
      turn += static_cast<size_t>(n);
    }
    if (s->left == 0) { c->file = nullptr; delete s; send(c, std::string(), std::string_view(), Then::End); return; }
    // full, or the loop's turn: a small block by uv_write; its completion (onWritten) calls this again
    const size_t want = static_cast<size_t>(std::min<uint64_t>(kProbeBlock, s->left));
    uv_buf_t b = uv_buf_init(buf.get(), static_cast<unsigned>(want));
    uv_fs_t r;
    const ssize_t n = uv_fs_read(nullptr, &r, s->file->fd, &b, 1, static_cast<int64_t>(s->off), nullptr);
    uv_fs_req_cleanup(&r);
    if (n <= 0) { fileDrop(c); closeConn(c); return; }
    s->off += static_cast<uint64_t>(n);
    s->left -= static_cast<uint64_t>(n);
    if (s->left == 0) { c->file = nullptr; delete s; send(c, std::string(), std::string_view(buf.get(), static_cast<size_t>(n)), Then::End, false, true); return; }
    send(c, std::string(), std::string_view(buf.get(), static_cast<size_t>(n)), Then::More, false, true);
    if (!c->closed) arm(c, c->lim.requestMs);
    return;
  }
#endif
  for (;;) {
    const size_t want = static_cast<size_t>(std::min<uint64_t>(kFileBlock, s->left));
    uv_buf_t b = uv_buf_init(buf.get(), static_cast<unsigned>(want));
    uv_fs_t r;
    const ssize_t n = want == 0 ? 0 : uv_fs_read(nullptr, &r, s->file->fd, &b, 1, static_cast<int64_t>(s->off), nullptr);
    if (want) uv_fs_req_cleanup(&r);
    if (want && n <= 0) { c->file = s; fileDrop(c); closeConn(c); return; }   // the file shrank or cannot be read: the client sees a short body
    s->off += static_cast<uint64_t>(n);
    s->left -= static_cast<uint64_t>(n);
    std::string head = std::move(s->head);
    s->head.clear();
    if (s->left == 0) {
      delete s;
      c->file = nullptr;
      send(c, std::move(head), std::string_view(buf.get(), static_cast<size_t>(n)), Then::End);
      return;
    }
    turn += static_cast<size_t>(n);
    c->file = s;   // owned by the connection while it goes: a close drops it
    send(c, std::move(head), std::string_view(buf.get(), static_cast<size_t>(n)), Then::More, false, turn >= kFileTurn);
    if (c->closed) return;
    // onWritten goes on once the socket took it; idle that long: gone. After the turn's queued write too: libuv may write it at once and
    // free its copy only in the callback, so going on here copied the whole file into memory for a fast client (572 MB for 500 MB)
    if (c->tcp.write_queue_size > 0 || turn >= kFileTurn) { arm(c, c->lim.requestMs); return; }
  }
}
/** "bytes=a-b", "bytes=a-", "bytes=-n" of a file of `size` bytes: false when it is not one satisfiable range. */
bool byteRange(const std::string& h, uint64_t size, uint64_t& from, uint64_t& to) {
  if (h.compare(0, 6, "bytes=") != 0 || size == 0) return false;
  const std::string r = h.substr(6);
  const size_t dash = r.find('-');
  if (dash == std::string::npos || r.find(',') != std::string::npos) return false;
  const std::string a = r.substr(0, dash), b = r.substr(dash + 1);
  auto num = [](const std::string& t, uint64_t& v) { if (t.empty() || t.find_first_not_of("0123456789") != std::string::npos || t.size() > 18) return false; v = std::stoull(t); return true; };
  uint64_t x = 0, y = 0;
  if (a.empty()) { if (!num(b, y) || y == 0) return false; from = y >= size ? 0 : size - y; to = size - 1; return true; }
  if (!num(a, x) || x >= size) return false;
  from = x;
  to = b.empty() ? size - 1 : (num(b, y) && y >= x ? std::min(y, size - 1) : UINT64_MAX);
  return to != UINT64_MAX;
}

// ---------------------------------------------------------------- WebSocket (ZN-893)
// An upgraded connection: wslay (third_party/wslay) reads and writes the frames (masking, fragments, ping/pong, the close handshake, the
// message size limit); bytes go through send() like an HTTP reply, so TLS (wss) and the drain events work the same. Events: 80 open,
// 81 message (data "t" or "b", payload the bytes), 82 closed (data "code \x1e reason"), 45 drain.
constexpr int kEvWsOpen = 80, kEvWsMessage = 81, kEvWsClose = 82;
ssize_t wsRecv(wslay_event_context_ptr ctx, uint8_t* buf, size_t len, int, void* user) {
  auto* c = static_cast<SConn*>(user);
  const size_t left = c->wsIn.size() - c->wsInAt;
  if (left == 0) { wslay_event_set_error(ctx, WSLAY_ERR_WOULDBLOCK); return -1; }
  const size_t k = std::min(len, left);
  std::memcpy(buf, c->wsIn.data() + c->wsInAt, k);
  c->wsInAt += k;
  return static_cast<ssize_t>(k);
}
ssize_t wsSendCb(wslay_event_context_ptr, const uint8_t* data, size_t len, int, void* user) {
  static_cast<SConn*>(user)->wsOut.append(reinterpret_cast<const char*>(data), len);   // gathered, written once by wsFlush
  return static_cast<ssize_t>(len);
}
void wsMsg(wslay_event_context_ptr, const wslay_event_on_msg_recv_arg* a, void* user) {
  auto* c = static_cast<SConn*>(user);
  if (a->opcode == WSLAY_TEXT_FRAME || a->opcode == WSLAY_BINARY_FRAME)
    loop::pushEvent(c->id, kEvWsMessage, a->opcode == WSLAY_TEXT_FRAME ? "t" : "b", std::string(reinterpret_cast<const char*>(a->msg), a->msg_length));
  else if (a->opcode == WSLAY_CONNECTION_CLOSE && !c->wsReported) {
    c->wsReported = true;
    loop::pushEvent(c->id, kEvWsClose, std::to_string(a->status_code ? a->status_code : 1005) + '\x1e' +
                                       (a->msg_length > 2 ? std::string(reinterpret_cast<const char*>(a->msg) + 2, a->msg_length - 2) : std::string()));   // msg starts with the code
  }
}
// Writes what wslay has to say, and closes the connection once the close handshake is over (or wslay failed).
void wsFlush(SConn* c) {
  if (c->closed || !c->ws) return;
  if (wslay_event_send(c->ws) != 0) { closeConn(c); return; }
  if (!c->wsOut.empty()) {
    std::string out;
    out.swap(c->wsOut);
    send(c, std::move(out), std::string_view(), Then::More);
  }
  if (!c->closed && !wslay_event_want_read(c->ws) && !wslay_event_want_write(c->ws)) {
    if (c->tcp.write_queue_size == 0) closeConn(c);
    else c->wsCloseAfterWrite = true;
  }
}
void wsFeed(SConn* c, const char* data, size_t n) {
  if (c->wsInAt == c->wsIn.size()) { c->wsIn.clear(); c->wsInAt = 0; }
  c->wsIn.append(data, n);
  c->wsPinged = false;
  if (c->lim.wsIdleMs) arm(c, c->lim.wsIdleMs);
  if (wslay_event_recv(c->ws) != 0) { closeConn(c); return; }   // a protocol error: wslay queued the close frame it owes, the socket goes
  wsFlush(c);
}
std::string base64(const unsigned char* p, size_t n) {
  static const char* k = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string o;
  for (size_t i = 0; i < n; i += 3) {
    const uint32_t v = static_cast<uint32_t>(p[i]) << 16 | (i + 1 < n ? static_cast<uint32_t>(p[i + 1]) << 8 : 0) | (i + 2 < n ? p[i + 2] : 0);
    o += k[v >> 18 & 63]; o += k[v >> 12 & 63]; o += i + 1 < n ? k[v >> 6 & 63] : '='; o += i + 2 < n ? k[v & 63] : '=';
  }
  return o;
}

}  // namespace

void fetchSaveTo(int h, const std::string& path) { if (Fetch* f = fetchAt(h)) f->savePath = path; }

int fetchOpen(const std::string& url, const std::string& method, const std::string& headers, const std::string& body, int timeoutMs, int maxBytes, const std::string& file, const std::string& tail) {
  noSigpipe();
  auto f = std::make_unique<Fetch>();
  Fetch* p = f.get();
  gFetches.push_back(std::move(f));
  p->handle = static_cast<int>(gFetches.size());
  p->method = method.empty() ? "GET" : method;
  p->headers = headers;
  p->reqBody = body;
  std::string fail;
  if (!file.empty()) {
    uv_fs_t r;
    p->upPath = file;
    p->upFd = uv_fs_open(nullptr, &r, file.c_str(), UV_FS_O_RDONLY, 0, nullptr);
    uv_fs_req_cleanup(&r);
    if (p->upFd >= 0 && uv_fs_fstat(nullptr, &r, p->upFd, nullptr) == 0 && (r.statbuf.st_mode & S_IFMT) == S_IFREG) { p->upSize = r.statbuf.st_size; p->upTail = tail; p->up = Fetch::Up::Waiting; }
    else fail = "cannot read " + file;
    uv_fs_req_cleanup(&r);
    if (!fail.empty() && p->upFd >= 0) { fdClose(p->upFd); p->upFd = -1; }
  }
  p->progress = body.size() + upLeft(p) > (64u << 10);
  p->timeoutMs = timeoutMs > 0 ? static_cast<uint64_t>(timeoutMs) : 120000;
  p->maxBytes = maxBytes > 0 ? maxBytes : 64 << 20;
  p->startMs = uv_now(L());
  loop::addActive(1);
  uv_timer_init(L(), &p->timer);
  p->timer.data = p;
  p->timerOpen = true;
  std::string why;
  if (!fail.empty()) finish(p, false, "fetch failed: " + fail);
  else if (!splitUrl(url, p, &why)) finish(p, false, "fetch failed: " + why);
  else if (std::string deny = zn::host::perm::check("net", p->host); !deny.empty()) finish(p, false, "fetch failed: " + deny);   // zinc.json permissions (ZN-322)
  else { logOpen(p); startConnection(p); }
  return p->handle;
}
int fetchStatus(int h) { Fetch* f = fetchAt(h); return f ? f->status : 0; }
std::string fetchHead(int h) { Fetch* f = fetchAt(h); return f ? f->reason + "\n" + f->msg.head : ""; }
std::string fetchBody(int h) { Fetch* f = fetchAt(h); return f ? f->msg.body : ""; }
std::string fetchUrl(int h) { Fetch* f = fetchAt(h); return f ? f->url : ""; }
void fetchFree(int h) { Fetch* f = fetchAt(h); if (f) { f->released = true; maybeFree(f); } }

int serve(int port, const std::string& certPem, const std::string& keyPem, const std::string& host) {
  noSigpipe();
  if (port != 0) stop(port);   // the same port again replaces its server
  std::shared_ptr<tls::Server> secure;
  if (!certPem.empty()) {   // parsed once: a handshake no longer parses the certificate and key again (849 to N handshakes/s, ZN-893)
    std::string err;
    tls::Server* t = tls::serverNew(certPem, keyPem, err);
    if (!t) { gError = err; return 0; }
    secure.reset(t, tls::serverFree);
  }
  auto* l = new Listener;
  l->tls = std::move(secure);
  uv_tcp_init(L(), &l->tcp);
  l->tcp.data = l;
  // Every IPv4 address by default, or the address the program gives (127.0.0.1, ::1, or :: for IPv6 and IPv4), else ZINC_BIND (the person
  // who runs it restricts it without a rebuild, behind a reverse proxy: docs/guide/08-security.md). ponytail: not :: by default: on macOS a
  // bind of :: succeeds while another program holds the IPv4 port, which then gets the IPv4 clients; two sockets would fix it.
  sockaddr_storage a{};
  const char* bindEnv = std::getenv("ZINC_BIND");
  const std::string h = !host.empty() ? host : bindEnv && *bindEnv ? std::string(bindEnv) : std::string("0.0.0.0");
  int rc = h.find(':') != std::string::npos ? uv_ip6_addr(h.c_str(), port, reinterpret_cast<sockaddr_in6*>(&a)) : uv_ip4_addr(h.c_str(), port, reinterpret_cast<sockaddr_in*>(&a));
  if (rc != 0) { gError = "cannot listen on " + h + ": not an IP address"; uv_close(reinterpret_cast<uv_handle_t*>(&l->tcp), [](uv_handle_t* x) { delete static_cast<Listener*>(x->data); }); return 0; }
  rc = uv_tcp_bind(&l->tcp, reinterpret_cast<sockaddr*>(&a), 0);
  if (rc == 0) rc = uv_listen(reinterpret_cast<uv_stream_t*>(&l->tcp), 511, onConnection);   // libuv reports a busy port here, not at bind; 511: Node's backlog
  if (rc != 0) {
    const std::string p = std::to_string(port);
    gError = rc == UV_EADDRINUSE ? "port " + p + " is already in use by another program: stop it, or listen on another port (0 lets the system pick a free one)"
           : rc == UV_EACCES ? "cannot listen on port " + p + ": permission denied (ports below 1024 need administrator rights)"
           : "cannot listen on port " + p + ": " + uv_strerror(rc);
    uv_close(reinterpret_cast<uv_handle_t*>(&l->tcp), [](uv_handle_t* h) { delete static_cast<Listener*>(h->data); });
    return 0;
  }
  sockaddr_storage bound{};
  int len = sizeof bound;
  uv_tcp_getsockname(&l->tcp, reinterpret_cast<sockaddr*>(&bound), &len);
  l->port = ntohs(bound.ss_family == AF_INET6 ? reinterpret_cast<sockaddr_in6*>(&bound)->sin6_port : reinterpret_cast<sockaddr_in*>(&bound)->sin_port);
  gListeners[l->port] = l;
  loop::addActive(1);
  return l->port;
}
bool option(int port, const std::string& name, double v) {
  auto it = gListeners.find(port);
  if (it == gListeners.end() || v < 0) return false;
  Limits& m = it->second->lim;
  const auto n = static_cast<uint64_t>(v);
  if (name == "maxHeaderBytes") m.headerBytes = n;
  else if (name == "maxBodyBytes") m.bodyBytes = n;
  else if (name == "maxConnections") m.conns = n;
  else if (name == "maxConnectionsPerIp") m.connsPerIp = static_cast<int>(std::min<uint64_t>(n, 1u << 30));
  else if (name == "requestsPerSecondPerIp") m.ratePerIp = v;
  else if (name == "headersTimeoutMs") m.headersMs = n;
  else if (name == "requestTimeoutMs") m.requestMs = n;
  else if (name == "keepAliveTimeoutMs") m.keepAliveMs = n;
  else if (name == "streamBody") m.streamBody = v != 0;
  else if (name == "wsMaxPayloadBytes") m.wsPayloadBytes = n;
  else if (name == "wsIdleTimeoutMs") m.wsIdleMs = n;
  else if (name == "wsBackpressureBytes") m.wsBackpressureBytes = n;
  else return false;
  return true;
}
const std::string& lastError() { return gError; }
bool setCertificate(int port, const std::string& certPem, const std::string& keyPem) {   // new connections use it, open ones keep theirs
  auto it = gListeners.find(port);
  if (it == gListeners.end() || !it->second->tls) { gError = "no https server on port " + std::to_string(port); return false; }
  std::string err;
  tls::Server* t = tls::serverNew(certPem, keyPem, err);
  if (!t) { gError = err; return false; }
  it->second->tls.reset(t, tls::serverFree);
  return true;
}
void stop(int port) {
  for (auto it = gListeners.begin(); it != gListeners.end();) {
    if (port != 0 && it->first != port) { ++it; continue; }
    uv_close(reinterpret_cast<uv_handle_t*>(&it->second->tcp), [](uv_handle_t* h) { delete static_cast<Listener*>(h->data); });
    it = gListeners.erase(it);
    loop::addActive(-1);
  }
  if (gListeners.empty()) gFiles.clear();
}
void reply(int conn, int status, const std::string& headers, const std::string& body) {
  SConn* c = connAt(conn);
  if (!c || c->answered) return;
  c->answered = true;
  Head h = headOf(status, headers);
  const bool none = bodiless(c, status);
  std::string chunks;
  if (h.chunked && !none) {   // the program asked for chunked transfer: the body goes in 4 KiB chunks
    h.text += "Transfer-Encoding: chunked\r\n";
    chunks.reserve(body.size() + body.size() / 4096 * 8 + 16);
    for (size_t i = 0; i < body.size(); i += 4096) {
      const size_t n = std::min<size_t>(4096, body.size() - i);
      char hex[16];
      std::snprintf(hex, sizeof hex, "%zx\r\n", n);
      chunks += hex;
      chunks.append(body, i, n);
      chunks += "\r\n";
    }
    chunks += "0\r\n\r\n";
  } else if (!h.length && status != 204 && !(status >= 100 && status < 200)) {
    h.text += "Content-Length: ";
    h.text += std::to_string(body.size());
    h.text += "\r\n";
  }
  endHead(c, h);
  send(c, std::move(h.text), none ? std::string_view() : h.chunked ? std::string_view(chunks) : std::string_view(body), Then::End);
}
bool replyStart(int conn, int status, const std::string& headers) {
  SConn* c = connAt(conn);
  if (!c || c->answered) return false;
  c->answered = true;
  Head h = headOf(status, headers);
  c->chunked = !h.length && !bodiless(c, status);
  if (c->chunked) h.text += "Transfer-Encoding: chunked\r\n";
  if (c->http10 && c->chunked) c->keepAlive = false;   // HTTP/1.0 has no chunks: the end of the body is the close
  endHead(c, h);
  c->st = St::Streaming;
  send(c, std::move(h.text), std::string_view(), Then::More);
  return !c->closed;
}
int write(int conn, const std::string& data) {
  SConn* c = connAt(conn);
  if (!c || c->st != St::Streaming) return -1;
  if (!data.empty() && !c->isHead) {
    if (c->chunked) {
      char hex[24];
      std::snprintf(hex, sizeof hex, "%zx\r\n", data.size());
      std::string framed;
      framed.reserve(data.size() + 32);
      framed += hex; framed += data; framed += "\r\n";
      send(c, std::move(framed), std::string_view(), Then::More);
    } else send(c, std::string(), data, Then::More);
  }
  if (c->closed) return -1;
  const int queued = static_cast<int>(std::min<size_t>(c->tcp.write_queue_size, INT32_MAX));
  if (static_cast<size_t>(queued) >= kDrainBytes) c->wantDrain = true;
  return queued;
}
void end(int conn) {
  SConn* c = connAt(conn);
  if (!c || c->st != St::Streaming) return;
  send(c, c->chunked && !c->isHead ? std::string("0\r\n\r\n") : std::string(), std::string_view(), Then::End);
}
void bodyTaken(int conn, size_t n) {
  SConn* c = connAt(conn);
  if (!c) return;
  c->queuedBody -= std::min(c->queuedBody, n);
  if (c->readPaused && c->queuedBody < kQueuedBodyCap / 4 && c->pending.size() < kPendingCap) { c->readPaused = false; uv_read_start(reinterpret_cast<uv_stream_t*>(&c->tcp), sAlloc, onSRead); }
}

void replyFile(int conn, int status, const std::string& headers, const std::string& path, const std::string& range) {
  SConn* c = connAt(conn);
  if (!c || c->answered) return;
  std::shared_ptr<OpenFile> f = openFile(path);
  if (!f) { reply(conn, 404, "", ""); return; }
  const uint64_t size = f->size;
  uint64_t from = 0, to = size == 0 ? 0 : size - 1;
  std::string extra;
  if (!range.empty()) {
    if (!byteRange(range, size, from, to)) { reply(conn, 416, "Content-Range: bytes */" + std::to_string(size), ""); return; }
    status = 206;
    extra = "Content-Range: bytes " + std::to_string(from) + "-" + std::to_string(to) + "/" + std::to_string(size) + "\r\n";
  }
  const uint64_t length = size == 0 ? 0 : to - from + 1;
  c->answered = true;
  Head h = headOf(status, headers);
  h.text += extra + "Accept-Ranges: bytes\r\nContent-Length: " + std::to_string(length) + "\r\n";
  endHead(c, h);
  c->st = St::Streaming;
  sendBlock(new FileSend{c, std::move(f), from, c->isHead ? 0 : length, std::move(h.text)});
}

bool wsAccept(int conn, const std::string& headers) {
  SConn* c = connAt(conn);
  if (!c || c->answered) return false;
  if (c->wsKey.empty()) { reply(conn, 400, "", "not a WebSocket request"); return false; }
  std::string err;
  const std::string digest = crypto::run("digest:sha-1", c->wsKey + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11", "", "", "", 0, 0, err);   // RFC 6455 4.2.2
  if (digest.size() != 20) { reply(conn, 500, "", "WebSocket: " + err); return false; }
  c->answered = true;
  Head h = headOf(101, headers);
  h.text += "Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + base64(reinterpret_cast<const unsigned char*>(digest.data()), digest.size()) + "\r\n\r\n";
  static const wslay_event_callbacks cbs = {wsRecv, wsSendCb, nullptr, nullptr, nullptr, nullptr, wsMsg};
  if (wslay_event_context_server_init(&c->ws, &cbs, c) != 0) { closeConn(c); return false; }
  wslay_event_config_set_max_recv_msg_length(c->ws, c->lim.wsPayloadBytes);
  send(c, std::move(h.text), std::string_view(), Then::More);
  if (c->closed) return false;
  c->st = St::WebSocket;
  if (c->lim.wsIdleMs) arm(c, c->lim.wsIdleMs); else uv_timer_stop(&c->timer);
  loop::pushEvent(c->id, kEvWsOpen, "");
  if (!c->pending.empty()) {   // frames that came with the request
    std::string p = std::move(c->pending);
    c->pending.clear();
    wsFeed(c, p.data(), p.size());
  }
  return !c->closed;
}
int wsSend(int conn, const std::string& data, bool binary) {
  SConn* c = connAt(conn);
  if (!c || !c->ws || !wslay_event_get_write_enabled(c->ws)) return -1;
  const wslay_event_msg m = {static_cast<uint8_t>(binary ? WSLAY_BINARY_FRAME : WSLAY_TEXT_FRAME), reinterpret_cast<const uint8_t*>(data.data()), data.size()};
  if (wslay_event_queue_msg(c->ws, &m) != 0) return -1;
  wsFlush(c);
  if (c->closed) return -1;
  const size_t queued = c->tcp.write_queue_size + wslay_event_get_queued_msg_length(c->ws);
  if (queued > c->lim.wsBackpressureBytes) {   // a client that does not read: the connection goes rather than the memory
    wslay_event_queue_close(c->ws, 1008, reinterpret_cast<const uint8_t*>("backpressure"), 12);
    wsFlush(c);
    closeConn(c);
    return -1;
  }
  if (queued >= kDrainBytes) c->wantDrain = true;
  return static_cast<int>(std::min<size_t>(queued, INT32_MAX));
}
void wsClose(int conn, int code, const std::string& reason) {
  SConn* c = connAt(conn);
  if (!c || !c->ws) return;
  wslay_event_queue_close(c->ws, static_cast<uint16_t>(code), reinterpret_cast<const uint8_t*>(reason.data()), std::min<size_t>(reason.size(), 123));
  wsFlush(c);
}
void wsPing(int conn) {
  SConn* c = connAt(conn);
  if (!c || !c->ws) return;
  const wslay_event_msg m = {WSLAY_PING, nullptr, 0};
  wslay_event_queue_msg(c->ws, &m);
  wsFlush(c);
}

}  // namespace zn::http
