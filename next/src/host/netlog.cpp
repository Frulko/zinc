#include "netlog.h"

#include <algorithm>
#include <cctype>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <ctime>
#include <fstream>
#include <map>
#include <utility>
#include <vector>

#include "zn/log.h"

namespace zn::netlog {
namespace {

// ponytail: fixed bounds instead of a budget in bytes: the oldest finished entry goes when there are kMaxEntries, a body keeps its first kBodyCap bytes, an
// entry its first kMaxFrames frames, and events nobody drains are dropped from the front. Make them options when a real program hits one.
constexpr size_t kMaxEntries = 1000, kBodyCap = 4u << 20, kMaxFrames = 10000, kQueueCap = 8u << 20, kFrameCap = 64u << 20;

using Head = std::vector<std::pair<std::string, std::string>>;
enum class Kind { Http, Ws, Mqtt, Tcp };
struct Frame { bool sent; int op; double wall; std::string data; };
struct Entry {
  int id = 0;
  Kind kind = Kind::Http;
  bool secure = false, announced = false, upgraded = false, done = false;
  std::string url, method, reqBody, reason, resBody, error;
  Head reqHead, resHead;
  int status = 0;
  double wall = 0, t0 = 0, tEnd = -1;         // epoch seconds at the start; seconds since the process started
  double t[5] = {-1, -1, -1, -1, -1};         // when each Phase ended, seconds after t0
  size_t sentBytes = 0, recvBytes = 0;
  std::vector<Frame> frames;
  std::string in, out;                         // WebSocket bytes not parsed yet, per direction
};
struct State {
  bool har = false, inspect = false;
  int ignorePort = 0, next = 1;
  std::string harPath, queue;
  std::map<int, Entry> entries;
  std::vector<std::string> sensitive;          // ZINC_NET_SENSITIVE, lower case
  std::chrono::steady_clock::time_point start = std::chrono::steady_clock::now();
  State() {
    const char* e = std::getenv("ZINC_NET_SENSITIVE");
    std::string item;
    for (const char* p = e ? e : ""; ; ++p) {
      if (*p && *p != ',') { item += static_cast<char>(std::tolower(static_cast<unsigned char>(*p))); continue; }
      if (!item.empty()) sensitive.push_back(item);
      item.clear();
      if (!*p) break;
    }
  }
};
State& st() { static State s; return s; }

double nowS() { return std::chrono::duration<double>(std::chrono::steady_clock::now() - st().start).count(); }
double wallS() { return std::chrono::duration<double>(std::chrono::system_clock::now().time_since_epoch()).count(); }
Entry* find(int id) { auto it = id > 0 ? st().entries.find(id) : st().entries.end(); return it == st().entries.end() || it->second.done ? nullptr : &it->second; }

// ---------------------------------------------------------------- text
// Length of the UTF-8 sequence at s[i], 0 when the bytes there are not one.
size_t utf8Len(const std::string& s, size_t i) {
  auto b = [&](size_t k) { return static_cast<unsigned char>(s[k]); };
  unsigned char c = b(i);
  if (c < 0x80) return 1;
  size_t n = c >= 0xC2 && c < 0xE0 ? 2 : c >= 0xE0 && c < 0xF0 ? 3 : c >= 0xF0 && c <= 0xF4 ? 4 : 0;
  if (!n || i + n > s.size()) return 0;
  for (size_t k = 1; k < n; ++k) if ((b(i + k) & 0xC0) != 0x80) return 0;
  if ((c == 0xE0 && b(i + 1) < 0xA0) || (c == 0xED && b(i + 1) >= 0xA0) || (c == 0xF0 && b(i + 1) < 0x90) || (c == 0xF4 && b(i + 1) >= 0x90)) return 0;
  return n;
}
bool isText(const std::string& s) {
  for (size_t i = 0; i < s.size();) { size_t n = s[i] ? utf8Len(s, i) : 0; if (!n) return false; i += n; }
  return true;
}
// A JSON string; bytes that are not UTF-8 become '?' (names, header values, URLs: bodies go through payload()).
std::string q(const std::string& s) {
  std::string clean;
  for (size_t i = 0; i < s.size();) { size_t n = utf8Len(s, i); if (n) clean.append(s, i, n); else clean += '?'; i += n ? n : 1; }
  return "\"" + log::jsonEscape(clean) + "\"";
}
std::string base64(const std::string& s) {
  static const char* t = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string r;
  for (size_t i = 0; i < s.size(); i += 3) {
    unsigned v = static_cast<unsigned char>(s[i]) << 16;
    if (i + 1 < s.size()) v |= static_cast<unsigned char>(s[i + 1]) << 8;
    if (i + 2 < s.size()) v |= static_cast<unsigned char>(s[i + 2]);
    r += t[v >> 18]; r += t[(v >> 12) & 63];
    r += i + 1 < s.size() ? t[(v >> 6) & 63] : '=';
    r += i + 2 < s.size() ? t[v & 63] : '=';
  }
  return r;
}
// A body as a JSON string: the text itself, or base64 (and *b64 = true) when it is not text.
std::string payload(const std::string& s, bool* b64) { *b64 = !isText(s); return *b64 ? "\"" + base64(s) + "\"" : q(s); }
std::string num(double v) { char b[40]; std::snprintf(b, sizeof b, "%.6f", v); return b; }
std::string ms(double seconds) { char b[40]; std::snprintf(b, sizeof b, "%.3f", seconds * 1000); return b; }
std::string lower(std::string s) { for (char& c : s) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c))); return s; }

// ---------------------------------------------------------------- the names of ZINC_NET_SENSITIVE in query strings and bodies (ZN-635)
// Opt-in, unlike the headers below: a field called token or session is often the data being debugged, so only the names the developer listed are masked.
bool listed(const std::string& name) { return std::find(st().sensitive.begin(), st().sensitive.end(), lower(name)) != st().sensitive.end(); }
// name=value pairs separated by & (a query string, a urlencoded form): the value of a listed name becomes ***.
// ponytail: names are compared as written, not percent-decoded (pass%77ord is not password); decode them if a real program sends such names.
std::string maskPairs(const std::string& s) {
  std::string out;
  for (size_t i = 0; i <= s.size();) {
    const size_t end = std::min(s.find('&', i), s.size()), eq = s.find('=', i);
    if (eq < end && listed(s.substr(i, eq - i))) out += s.substr(i, eq - i + 1) + "***"; else out.append(s, i, end - i);
    if (end < s.size()) out += '&';
    i = end + 1;
  }
  return out;
}
// The query of a URL or of a request target (between ? and #).
std::string maskQuery(const std::string& url) {
  const size_t q = url.find('?');
  if (q == std::string::npos || st().sensitive.empty()) return url;
  const size_t h = std::min(url.find('#', q), url.size());
  return url.substr(0, q + 1) + maskPairs(url.substr(q + 1, h - q - 1)) + url.substr(h);
}
// Index after the closing quote of the JSON string that starts at s[i] (the end of the text when it is cut).
size_t stringEnd(const std::string& s, size_t i) {
  for (++i; i < s.size(); ++i) { if (s[i] == '\\') ++i; else if (s[i] == '"') return i + 1; }
  return s.size();
}
// Index after the JSON value that starts at s[i]: a string, a balanced object or array, else a scalar.
size_t valueEnd(const std::string& s, size_t i) {
  if (i < s.size() && s[i] == '"') return stringEnd(s, i);
  for (int depth = 0; i < s.size(); ++i) {
    const char c = s[i];
    if (c == '"') i = stringEnd(s, i) - 1;
    else if (c == '{' || c == '[') ++depth;
    else if (c == '}' || c == ']') { if (depth == 0) return i; if (--depth == 0) return i + 1; }
    else if (depth == 0 && (c == ',' || std::isspace(static_cast<unsigned char>(c)))) return i;
  }
  return s.size();
}
// Text that holds JSON (a body, a WebSocket or MQTT message, an event stream): the value after "name": becomes "***" for each listed name, at any depth, and
// every other byte is kept. Not a JSON parser (the host links none): it follows strings and brackets only, so a body cut short or a stream of JSON lines is
// masked too. ponytail: a key written with escapes ("pin") and JSON inside a JSON string are not recognised.
std::string maskJson(const std::string& s) {
  if (st().sensitive.empty()) return s;
  std::string out;
  for (size_t i = 0; i < s.size();) {
    const size_t quote = std::min(s.find('"', i), s.size());
    out.append(s, i, quote - i);
    if (quote == s.size()) break;
    const size_t end = stringEnd(s, quote);
    size_t v = end;
    while (v < s.size() && std::isspace(static_cast<unsigned char>(s[v]))) ++v;
    const bool key = v < s.size() && s[v] == ':' && end - quote >= 2 && listed(s.substr(quote + 1, end - quote - 2));
    if (!key) { out.append(s, quote, end - quote); i = end; continue; }
    for (++v; v < s.size() && std::isspace(static_cast<unsigned char>(s[v])); ++v) {}
    out.append(s, quote, v - quote);
    out += "\"***\"";
    i = valueEnd(s, v);
  }
  return out;
}
// A request or response body as it is recorded: a urlencoded form by its fields, any other text as JSON; bytes that are not text are left alone.
std::string maskBody(const std::string& body, const std::string& contentType) {
  if (st().sensitive.empty() || !isText(body)) return body;
  return lower(contentType).find("x-www-form-urlencoded") != std::string::npos ? maskPairs(body) : maskJson(body);
}

// ---------------------------------------------------------------- headers
bool sensitive(const std::string& name) {
  const std::string n = lower(name);
  for (const char* exact : {"authorization", "proxy-authorization", "cookie", "set-cookie"}) if (n == exact) return true;
  for (const char* part : {"token", "secret", "password", "passwd", "api-key", "apikey", "session", "credential"}) if (n.find(part) != std::string::npos) return true;
  return listed(n);
}
// "Name: value" lines (\n or \r\n) into pairs; the values of sensitive headers are masked here, so nothing downstream holds them (a Location keeps its URL,
// less the listed query parameters).
Head parseHead(const std::string& lines) {
  Head h;
  for (size_t i = 0; i < lines.size();) {
    size_t e = lines.find('\n', i);
    if (e == std::string::npos) e = lines.size();
    std::string line = lines.substr(i, e - i);
    i = e + 1;
    if (!line.empty() && line.back() == '\r') line.pop_back();
    size_t c = line.find(':');
    if (c == std::string::npos || c == 0) continue;
    size_t v = c + 1;
    while (v < line.size() && line[v] == ' ') ++v;
    std::string name = line.substr(0, c);
    h.emplace_back(name, sensitive(name) ? "***" : lower(name) == "location" ? maskQuery(line.substr(v)) : line.substr(v));
  }
  return h;
}
std::string headerOf(const Head& h, const char* name) { for (const auto& p : h) if (lower(p.first) == name) return p.second; return ""; }
std::string headObject(const Head& h) {   // the protocol's Headers: one member per name, repeated values joined with \n as Chrome does
  Head merged;
  for (const auto& p : h) {
    auto it = std::find_if(merged.begin(), merged.end(), [&](const auto& m) { return m.first == p.first; });
    if (it == merged.end()) merged.push_back(p); else it->second += "\n" + p.second;
  }
  std::string r = "{";
  for (const auto& p : merged) r += (r.size() > 1 ? "," : "") + q(p.first) + ":" + q(p.second);
  return r + "}";
}
std::string headArray(const Head& h) {    // HAR
  std::string r = "[";
  for (const auto& p : h) r += std::string(r.size() > 1 ? "," : "") + "{\"name\":" + q(p.first) + ",\"value\":" + q(p.second) + "}";
  return r + "]";
}
// user:password@ of a URL is a credential too; so are the query parameters the developer listed.
std::string cleanUrl(const std::string& raw) {
  const std::string url = maskQuery(raw);
  size_t a = url.find("://");
  if (a == std::string::npos) return url;
  size_t end = url.find_first_of("/?#", a + 3), at = url.find('@', a + 3);
  if (at == std::string::npos || (end != std::string::npos && at > end)) return url;
  return url.substr(0, a + 3) + "***" + url.substr(at);
}
std::string mimeOf(const Entry& e) {
  std::string ct = headerOf(e.resHead, "content-type");
  ct = ct.substr(0, ct.find(';'));
  return !ct.empty() ? ct : isText(e.resBody) ? "text/plain" : "application/octet-stream";
}

// ---------------------------------------------------------------- events of the Network domain
void emit(const char* method, const Entry& e, const std::string& params) {
  State& s = st();
  if (!s.inspect) return;
  if (s.queue.size() > kQueueCap) s.queue.erase(0, s.queue.find('\n', s.queue.size() / 2) + 1);
  s.queue += std::string("{\"method\":\"Network.") + method + "\",\"params\":{\"requestId\":\"" + std::to_string(e.id) + "\"," + params + "}}\n";
}
double connectEnd(const Entry& e) { return e.secure && e.t[Tls] >= 0 ? e.t[Tls] : e.t[Connect]; }
std::string timing(const Entry& e) {
  auto at = [&](double v) { return v < 0 ? std::string("-1") : ms(v); };
  return "{\"requestTime\":" + num(e.t0) + ",\"proxyStart\":-1,\"proxyEnd\":-1,\"dnsStart\":" + (e.t[Dns] < 0 ? "-1" : "0") + ",\"dnsEnd\":" + at(e.t[Dns]) +
         ",\"connectStart\":" + at(e.t[Dns]) + ",\"connectEnd\":" + at(connectEnd(e)) + ",\"sslStart\":" + at(e.secure ? e.t[Connect] : -1) + ",\"sslEnd\":" + at(e.secure ? e.t[Tls] : -1) +
         ",\"workerStart\":-1,\"workerReady\":-1,\"workerFetchStart\":-1,\"workerRespondWithSettled\":-1,\"sendStart\":" + at(connectEnd(e)) + ",\"sendEnd\":" + at(e.t[Sent]) +
         ",\"pushStart\":0,\"pushEnd\":0,\"receiveHeadersStart\":" + at(e.t[FirstByte]) + ",\"receiveHeadersEnd\":" + at(e.t[FirstByte]) + "}";
}
bool stream(const Entry& e) { return e.kind == Kind::Ws || e.kind == Kind::Mqtt; }
const char* typeOf(const Entry& e) { return e.kind == Kind::Http ? "Fetch" : "Other"; }

void announce(Entry& e) {
  e.announced = true;
  if (stream(e)) {
    emit("webSocketCreated", e, "\"url\":" + q(e.url) + ",\"initiator\":{\"type\":\"other\"}");
    emit("webSocketWillSendHandshakeRequest", e, "\"timestamp\":" + num(e.t0) + ",\"wallTime\":" + num(e.wall) + ",\"request\":{\"headers\":" + headObject(e.reqHead) + "}");
    return;
  }
  bool b64 = false;
  std::string post = e.reqBody.empty() ? "" : payload(e.reqBody, &b64);
  emit("requestWillBeSent", e, "\"loaderId\":\"zinc\",\"documentURL\":\"zinc://app\",\"request\":{\"url\":" + q(e.url) + ",\"method\":" + q(e.method) + ",\"headers\":" + headObject(e.reqHead) +
       ",\"initialPriority\":\"High\",\"referrerPolicy\":\"no-referrer\"" + (e.reqBody.empty() ? "" : ",\"hasPostData\":true") + (post.empty() || b64 ? "" : ",\"postData\":" + post) +
       "},\"timestamp\":" + num(e.t0) + ",\"wallTime\":" + num(e.wall) + ",\"initiator\":{\"type\":\"other\"},\"type\":\"" + typeOf(e) + "\",\"frameId\":\"main\"");
}
void finish(Entry& e, const std::string& error) {
  if (!e.announced) announce(e);
  e.done = true;
  e.error = error;
  e.tEnd = nowS();
  e.in.clear(); e.out.clear();
  const std::string ts = "\"timestamp\":" + num(e.tEnd);
  if (stream(e)) {
    if (!error.empty()) emit("webSocketFrameError", e, ts + ",\"errorMessage\":" + q(error));
    emit("webSocketClosed", e, ts);
    return;
  }
  if (!error.empty() && e.status == 0) { emit("loadingFailed", e, ts + ",\"type\":\"" + typeOf(e) + "\",\"errorText\":" + q(error) + ",\"canceled\":false"); return; }
  emit("responseReceived", e, "\"loaderId\":\"zinc\",\"timestamp\":" + num(e.t[FirstByte] < 0 ? e.tEnd : e.t0 + e.t[FirstByte]) + ",\"type\":\"" + typeOf(e) + "\",\"frameId\":\"main\",\"response\":{\"url\":" + q(e.url) +
       ",\"status\":" + std::to_string(e.status) + ",\"statusText\":" + q(e.reason) + ",\"headers\":" + headObject(e.resHead) + ",\"mimeType\":" + q(mimeOf(e)) +
       ",\"charset\":\"\",\"connectionReused\":false,\"connectionId\":" + std::to_string(e.id) + ",\"fromDiskCache\":false,\"fromServiceWorker\":false,\"fromPrefetchCache\":false,\"encodedDataLength\":" +
       std::to_string(e.recvBytes) + ",\"protocol\":\"" + (e.kind == Kind::Http ? "http/1.1" : "tcp") + "\",\"securityState\":\"" + (e.secure ? "secure" : "insecure") + "\",\"timing\":" + timing(e) + "}");
  if (e.kind == Kind::Http) emit("dataReceived", e, ts + ",\"dataLength\":" + std::to_string(e.recvBytes) + ",\"encodedDataLength\":" + std::to_string(e.recvBytes));
  emit("loadingFinished", e, ts + ",\"encodedDataLength\":" + std::to_string(e.recvBytes));
}
void addFrame(Entry& e, bool sent, int op, const std::string& raw) {
  const std::string data = op == 1 ? maskJson(raw) : raw;
  const std::string text = op == 1 ? q(data) : "\"" + base64(data) + "\"";   // the protocol: text for text frames, base64 for every other opcode
  emit(sent ? "webSocketFrameSent" : "webSocketFrameReceived", e, "\"timestamp\":" + num(nowS()) + ",\"response\":{\"opcode\":" + std::to_string(op) + ",\"mask\":" + (sent ? "true" : "false") + ",\"payloadData\":" + text + "}");
  if (e.frames.size() < kMaxFrames) e.frames.push_back(Frame{sent, op, wallS(), data.substr(0, kBodyCap)});
}
// RFC 6455 frames out of `buf` (what one side wrote so far), whole frames only.
void parseFrames(Entry& e, std::string& buf, bool sent) {
  for (;;) {
    if (buf.size() < 2) return;
    auto b = [&](size_t k) { return static_cast<unsigned char>(buf[k]); };
    const bool masked = (b(1) & 0x80) != 0;
    uint64_t n = b(1) & 127;
    size_t at = 2;
    if (n == 126) { if (buf.size() < 4) return; n = static_cast<uint64_t>(b(2)) << 8 | b(3); at = 4; }
    else if (n == 127) { if (buf.size() < 10) return; n = 0; for (size_t k = 2; k < 10; ++k) n = n << 8 | b(k); at = 10; }
    if (n > kFrameCap) { buf.clear(); return; }   // not a stream we can follow
    if (masked) at += 4;
    if (buf.size() < at + n) return;
    std::string data = buf.substr(at, static_cast<size_t>(n));
    if (masked) for (size_t i = 0; i < data.size(); ++i) data[i] = static_cast<char>(data[i] ^ buf[at - 4 + (i & 3)]);
    addFrame(e, sent, b(0) & 15, data);
    buf.erase(0, at + static_cast<size_t>(n));
  }
}

// ---------------------------------------------------------------- HAR 1.2
std::string isoDate(double wall) {
  std::time_t s = static_cast<std::time_t>(wall);
  std::tm tm{};
  gmtime_r(&s, &tm);
  char b[40], out[48];
  std::strftime(b, sizeof b, "%Y-%m-%dT%H:%M:%S", &tm);
  std::snprintf(out, sizeof out, "%s.%03dZ", b, static_cast<int>((wall - static_cast<double>(s)) * 1000));
  return out;
}
std::string harEntry(const Entry& e) {
  const double end = e.tEnd < 0 ? nowS() - e.t0 : e.tEnd - e.t0, con = connectEnd(e);
  auto opt = [](double v) { return v < 0 ? std::string("-1") : ms(v); };
  bool b64 = false;
  std::string r = "{\"startedDateTime\":\"" + isoDate(e.wall) + "\",\"time\":" + ms(end) + ",\"request\":{\"method\":" + q(e.method) + ",\"url\":" + q(e.url) +
                  ",\"httpVersion\":\"HTTP/1.1\",\"cookies\":[],\"headers\":" + headArray(e.reqHead) + ",\"queryString\":[],\"headersSize\":-1,\"bodySize\":" + std::to_string(e.kind == Kind::Http ? e.reqBody.size() : e.sentBytes);
  if (!e.reqBody.empty()) {
    std::string text = payload(e.reqBody, &b64);
    r += ",\"postData\":{\"mimeType\":" + q(headerOf(e.reqHead, "content-type")) + ",\"text\":" + text + (b64 ? ",\"encoding\":\"base64\"" : "") + "}";
  }
  std::string text = payload(e.resBody, &b64);
  r += "},\"response\":{\"status\":" + std::to_string(e.status) + ",\"statusText\":" + q(e.reason) + ",\"httpVersion\":\"HTTP/1.1\",\"cookies\":[],\"headers\":" + headArray(e.resHead) +
       ",\"content\":{\"size\":" + std::to_string(e.resBody.size()) + ",\"mimeType\":" + q(mimeOf(e)) + ",\"text\":" + text + (b64 ? ",\"encoding\":\"base64\"" : "") + "},\"redirectURL\":" + q(headerOf(e.resHead, "location")) +
       ",\"headersSize\":-1,\"bodySize\":" + std::to_string(e.recvBytes) + (e.error.empty() ? "" : ",\"_error\":" + q(e.error)) + "},\"cache\":{}";
  r += ",\"timings\":{\"blocked\":-1,\"dns\":" + opt(e.t[Dns]) + ",\"connect\":" + opt(con < 0 ? -1 : con - std::max(e.t[Dns], 0.0)) + ",\"ssl\":" + opt(e.secure && e.t[Tls] >= 0 && e.t[Connect] >= 0 ? e.t[Tls] - e.t[Connect] : -1) +
       ",\"send\":" + ms(e.t[Sent] < 0 ? 0 : e.t[Sent] - std::max(con, 0.0)) + ",\"wait\":" + ms(e.t[FirstByte] < 0 || e.t[Sent] < 0 ? 0 : e.t[FirstByte] - e.t[Sent]) + ",\"receive\":" + ms(e.t[FirstByte] < 0 ? 0 : end - e.t[FirstByte]) + "}";
  r += std::string(",\"_resourceType\":\"") + (e.kind == Kind::Http ? "fetch" : stream(e) ? "websocket" : "other") + "\"";
  if (stream(e)) {
    r += ",\"_webSocketMessages\":[";
    for (size_t i = 0; i < e.frames.size(); ++i) {
      const Frame& f = e.frames[i];
      r += std::string(i ? "," : "") + "{\"type\":\"" + (f.sent ? "send" : "receive") + "\",\"time\":" + num(f.wall) + ",\"opcode\":" + std::to_string(f.op) + ",\"data\":" + (f.op == 1 ? q(f.data) : "\"" + base64(f.data) + "\"") + "}";
    }
    r += "]";
  }
  return r + "}";
}

}  // namespace

// ZINC_HAR (`zinc run --har file`) is looked up until it is there: the CLI sets it after the host is installed. The file is written when the process ends
// normally (the end of the program, quit(), sys.exit).
bool on() {
  State& s = st();
  if (const char* p = s.har ? nullptr : std::getenv("ZINC_HAR"); p && *p) {
    s.har = true;
    s.harPath = p;
    std::atexit([] { std::ofstream(st().harPath, std::ios::binary) << har() << "\n"; });
  }
  return s.har || s.inspect;
}
void start(int port) { st().inspect = true; st().ignorePort = port; }

int open(const std::string& scheme, const std::string& url, const std::string& method, const std::string& headers, const std::string& body) {
  State& s = st();
  if (!on()) return 0;
  if (scheme == "tcp" && s.ignorePort > 0)
    for (const char* host : {"127.0.0.1", "localhost", "[::1]"}) if (url == "tcp://" + std::string(host) + ":" + std::to_string(s.ignorePort)) return 0;
  if (s.entries.size() >= kMaxEntries)
    for (auto it = s.entries.begin(); it != s.entries.end(); ++it) if (it->second.done) { s.entries.erase(it); break; }
  Entry& e = s.entries[s.next];
  e.id = s.next++;
  e.kind = scheme == "tcp" ? Kind::Tcp : scheme.compare(0, 4, "mqtt") == 0 ? Kind::Mqtt : Kind::Http;
  e.secure = scheme == "https" || scheme == "mqtts";
  e.url = cleanUrl(url);
  e.method = method;
  e.reqHead = parseHead(headers);
  e.reqBody = maskBody(body, headerOf(e.reqHead, "content-type")).substr(0, kBodyCap);
  e.sentBytes = body.size();
  e.t0 = nowS();
  e.wall = wallS();
  if (e.kind != Kind::Tcp) announce(e);   // a TCP stream is announced with its first bytes: they say whether it is a WebSocket
  return e.id;
}
void mark(int id, Phase p) {
  Entry* e = find(id);
  if (e && e->t[p] < 0) e->t[p] = nowS() - e->t0;
}
void response(int id, int status, const std::string& reason, const std::string& headers, const std::string& body) {
  Entry* e = find(id);
  if (!e) return;
  e->status = status;
  e->reason = reason;
  e->resHead = parseHead(headers);
  e->resBody = maskBody(body, headerOf(e->resHead, "content-type")).substr(0, kBodyCap);
  e->recvBytes = body.size();
  finish(*e, "");
}
void accepted(int id, const std::string& statusText) {
  Entry* e = find(id);
  if (!e) return;
  e->status = 101;
  e->reason = statusText;
  e->upgraded = true;
  emit("webSocketHandshakeResponseReceived", *e, "\"timestamp\":" + num(nowS()) + ",\"response\":{\"status\":101,\"statusText\":" + q(statusText) + ",\"headers\":{}}");
}
void message(int id, bool sent, const std::string& text) {
  Entry* e = find(id);
  if (!e) return;
  (sent ? e->sentBytes : e->recvBytes) += text.size();
  addFrame(*e, sent, isText(text) ? 1 : 2, text);
}
void bytes(int id, bool sent, const std::string& data) {
  Entry* e = find(id);
  if (!e) return;
  (sent ? e->sentBytes : e->recvBytes) += data.size();
  if (e->kind == Kind::Tcp && !e->announced) {
    // ponytail: a WebSocket is recognised when the upgrade request is one write (zinc:socket's WebSocket writes it so); split writes stay a TCP entry.
    size_t end = data.find("\r\n\r\n"), line = data.find("\r\n"), sp = data.find(' ', 4);
    if (sent && data.compare(0, 4, "GET ") == 0 && end != std::string::npos && sp < line && lower(data.substr(0, end)).find("upgrade: websocket") != std::string::npos) {
      e->kind = Kind::Ws;
      e->url = "ws" + e->url.substr(3) + maskQuery(data.substr(4, sp - 4));   // tcp://host:port + the request target
      e->method = "GET";
      e->reqHead = parseHead(data.substr(line + 2, end - line - 2));
      announce(*e);
      return;
    }
    announce(*e);
  }
  if (e->kind == Kind::Tcp) {
    std::string& body = sent ? e->reqBody : e->resBody;
    if (body.size() < kBodyCap) body.append(data, 0, kBodyCap - body.size());
    if (!sent) emit("dataReceived", *e, "\"timestamp\":" + num(nowS()) + ",\"dataLength\":" + std::to_string(data.size()) + ",\"encodedDataLength\":" + std::to_string(data.size()));
    return;
  }
  std::string& buf = sent ? e->out : e->in;
  buf += data;
  if (!sent && !e->upgraded) {   // the server's answer to the upgrade
    size_t end = buf.find("\r\n\r\n"), line = buf.find("\r\n");
    if (end == std::string::npos) return;
    size_t sp = buf.find(' ');
    e->status = sp < line ? std::atoi(buf.c_str() + sp + 1) : 0;
    size_t sp2 = buf.find(' ', sp + 1);
    e->reason = sp2 < line ? buf.substr(sp2 + 1, line - sp2 - 1) : "";
    e->resHead = parseHead(buf.substr(line + 2, end - line - 2));
    e->upgraded = true;
    emit("webSocketHandshakeResponseReceived", *e, "\"timestamp\":" + num(nowS()) + ",\"response\":{\"status\":" + std::to_string(e->status) + ",\"statusText\":" + q(e->reason) + ",\"headers\":" + headObject(e->resHead) + "}");
    buf.erase(0, end + 4);
  }
  if (e->upgraded) parseFrames(*e, buf, sent);
}
void close(int id, const std::string& error) {
  Entry* e = find(id);
  if (!e) return;
  if (e->kind == Kind::Tcp && e->t[Connect] >= 0) { e->status = 200; e->reason = "Connection closed"; }
  finish(*e, error);
}

std::string drain() { std::string out; out.swap(st().queue); return out; }
std::string responseBody(int id) {
  auto it = st().entries.find(id);
  bool b64 = false;
  std::string text = payload(it == st().entries.end() ? std::string() : it->second.resBody, &b64);
  return "{\"body\":" + text + ",\"base64Encoded\":" + (b64 ? "true" : "false") + "}";
}
std::string postData(int id) {
  auto it = st().entries.find(id);
  bool b64 = false;
  std::string text = payload(it == st().entries.end() ? std::string() : it->second.reqBody, &b64);
  return "{\"postData\":" + text + ",\"base64Encoded\":" + (b64 ? "true" : "false") + "}";
}
std::string har() {
  std::string r = "{\"log\":{\"version\":\"1.2\",\"creator\":{\"name\":\"zinc\",\"version\":\"0.1\"},\"pages\":[],\"entries\":[";
  bool first = true;
  for (const auto& kv : st().entries) { r += (first ? "" : ",") + harEntry(kv.second); first = false; }
  return r + "]}}";
}

}  // namespace zn::netlog
