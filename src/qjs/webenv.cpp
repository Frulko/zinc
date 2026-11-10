// The web environment of the QuickJS engine (ZN-568): the window, document, events, frame callbacks, storage and network a JavaScript library written
// for a browser expects around WebGL. The environment is JavaScript (lib/std/webenv.js, read only when a program asks: ZINC_WEB=1, or "web" in its
// zinc.json); this file starts it and gives it what JavaScript cannot do alone, over host rows that exist. A program that does not ask pays nothing.
#include "qjs/qjs.h"

#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <filesystem>
#include <fstream>
#include <initializer_list>
#include <memory>
#include <mutex>
#include <sstream>
#include <thread>
#include <unordered_map>
#include <unordered_set>
#include <vector>
#include <sys/stat.h>

#ifndef ZN_ENGINE_MODULE   // the engine modules (src/engine) build the Node-API part only
extern "C" {
#include "../../third_party/quickjs-ng/quickjs.h"
}
#endif
#include "qjs/napi_util.h"
#include "zn/js_ext.h"

#ifndef ZN_ENGINE_MODULE
#include "frontend/capabilities.h"
#include "frontend/profile.h"
#include "frontend/project.h"
#endif
#include "zn/limits.h"
#include "res/codec.h"
#include "zn/host.h"
#include "zn/runtime.h"
#ifndef ZN_ENGINE_MODULE
#include "zn/loop.h"
namespace zn::host {
// src/host/sys_host.cpp: the checks the file rows make before a read (zinc.json "permissions", the fs scope), for a reader that does its I/O on
// another thread: "" when the program may read `path`, else the error the rows would give. Main thread. (Not in zn/host.h: <string> there
// would come before runtime/zrt.h's own placement new.)
std::string fsReadRefused(const std::string& path);
}
#endif

namespace zn::qjs {
void installCanvas2d(napi_env env, napi_value native, const std::string& stdRoot);   // canvas2d.cpp: native.c2d, what a 2D context draws with
namespace {
using namespace zn::napi;

bool readText(const std::string& path, std::string& out) {
  std::ifstream in(path, std::ios::binary);
  if (!in) return false;
  std::stringstream ss;
  ss << in.rdbuf();
  out = ss.str();
  return true;
}

#ifndef ZN_ENGINE_MODULE
// ---- engine services: what only the engine itself can do, so each engine gives its own (ZN-773: here QuickJS's)
// structuredClone(value) through QuickJS's own serializer: it keeps cycles, Map, Set, Date, RegExp, typed arrays and array buffers, and refuses a
// function (a browser's DataCloneError)
JSValue js_structuredClone(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
  size_t n = 0;
  uint8_t* buf = JS_WriteObject(c, &n, argc > 0 ? argv[0] : JS_UNDEFINED, JS_WRITE_OBJ_REFERENCE | JS_WRITE_OBJ_STRUCTURED_CLONE);
  if (!buf) return JS_EXCEPTION;
  JSValue v = JS_ReadObject(c, buf, n, JS_READ_OBJ_REFERENCE);
  js_free(c, buf);
  return v;
}
#endif

// ---- files and the network, over the host's rows (so the program's permissions hold): what JavaScript cannot get through `__host_*` is bytes,
// since a row's string result becomes a JavaScript string
using zn::host::HostArg;
HostArg sys(zn::Rt id, std::initializer_list<HostArg> args = {}) {
  HostArg r;
  if (zn::host::hostSys) zn::host::hostSys(static_cast<int>(id), args.begin(), &r);
  return r;
}
struct Text {   // a JavaScript string as a row's string argument
  std::string s;
  bool ok;
  Text(napi_env env, napi_value v) : ok(zn::napi::text(env, v, s)) {}
  HostArg arg() const { HostArg a; a.p = s.data(); a.n = static_cast<std::uint32_t>(s.size()); return a; }
};
HostArg num(std::int64_t i) { HostArg a; a.i = i; a.d = static_cast<double>(i); return a; }
napi_value bytes(napi_env c, const HostArg& r) { return arrayBufferCopy(c, r.p, r.n); }
napi_value text(napi_env c, const HostArg& r) { return string(c, static_cast<const char*>(r.p), r.n); }

// read(path): the file's bytes as an ArrayBuffer, undefined when it cannot be read
napi_value js_read(napi_env c, napi_callback_info info) {
  Args<1> A(c, info);
  if (A.argc < 1) return nullptr;
  Text path(c, A.argv[0]);
  const HostArg r = sys(zn::Rt::HostFsReadText, {path.arg()});   // the row hands the bytes as they are
  if (sys(zn::Rt::HostFsFailed).i) return nullptr;
  return bytes(c, r);
}
// httpFetch(url, method, headerLines, body): a request on the host's loop, its handle (0: refused, httpError says why)
napi_value js_httpFetch(napi_env c, napi_callback_info info) {
  Args<4> A(c, info);
  if (A.argc < 4) return int32v(c, 0);
  Text url(c, A.argv[0]), method(c, A.argv[1]), lines(c, A.argv[2]), body(c, A.argv[3]);
  return int32v(c, static_cast<int32_t>(sys(zn::Rt::HostHttpFetch, {url.arg(), method.arg(), lines.arg(), body.arg(), num(0), num(0)}).i));
}
napi_value js_httpError(napi_env c, napi_callback_info) { return text(c, sys(zn::Rt::HostHttpError)); }
// httpPoll(ms): lets the host's loop work for up to ms, then its next event ("handle\x1fkind\x1fdata": 40 done, 41 failed) or undefined
napi_value js_httpPoll(napi_env c, napi_callback_info info) {
  Args<1> A(c, info);
  double ms = 0;
  if (A.argc > 0) number(c, A.argv[0], ms);
  HostArg wait; wait.d = ms;
  sys(zn::Rt::HostLoopWait, {wait});
  if (!sys(zn::Rt::HostEvReady).i) return nullptr;
  return text(c, sys(zn::Rt::HostEvNext));
}
// httpTake(handle): { status, head, url, body: ArrayBuffer } of a finished request, which is then freed
napi_value js_httpTake(napi_env c, napi_callback_info info) {
  Args<1> A(c, info);
  int32_t h = 0;
  if (A.argc > 0) int32(c, A.argv[0], h);
  napi_value o;
  napi_create_object(c, &o);
  set(c, o, "status", int32v(c, static_cast<int32_t>(sys(zn::Rt::HostHttpStatus, {num(h)}).i)));
  set(c, o, "head", text(c, sys(zn::Rt::HostHttpHead, {num(h)})));
  set(c, o, "url", text(c, sys(zn::Rt::HostHttpUrl, {num(h)})));
  set(c, o, "body", bytes(c, sys(zn::Rt::HostHttpBody, {num(h)})));
  sys(zn::Rt::HostHttpFree, {num(h)});
  return o;
}
// The bytes [at, at + n) of an ArrayBuffer argument (offset and length optional); nullptr with an exception pending when they are not there.
template <std::size_t N>
const uint8_t* slice(napi_env c, Args<N>& A, const char* what, std::size_t& len) {
  void* data = nullptr;
  std::size_t size = 0;
  bool is = false;
  if (A.argc < 1 || napi_is_arraybuffer(c, A.argv[0], &is) != napi_ok || !is || napi_get_arraybuffer_info(c, A.argv[0], &data, &size) != napi_ok) {
    napi_throw_type_error(c, nullptr, (std::string(what) + ": not an ArrayBuffer").c_str());
    return nullptr;
  }
  std::int64_t at = 0, n = static_cast<std::int64_t>(size);
  if (A.argc > 1) int64(c, A.argv[1], at);
  if (A.argc > 2) int64(c, A.argv[2], n);
  if (at < 0 || n < 0 || static_cast<std::uint64_t>(at) + static_cast<std::uint64_t>(n) > size) { throwRange(c, std::string(what) + ": outside the buffer"); return nullptr; }
  len = static_cast<std::size_t>(n);
  return static_cast<const uint8_t*>(data) + at;
}
// decode(buffer, offset, length): UTF-8 bytes as a string (the TextDecoder of every context is JavaScript, a byte at a time)
napi_value js_decode(napi_env c, napi_callback_info info) {
  Args<3> A(c, info);
  std::size_t n = 0;
  const uint8_t* p = slice(c, A, "decode", n);
  return p ? string(c, reinterpret_cast<const char*>(p), n) : nullptr;
}
// ---- pictures, decoded off the frame (ZN-569): the engine's codec (src/res/codec.h: PNG, JPEG, BMP, the first frame of a GIF, WebP) on a
// thread of its own, so a large picture never holds a frame. What a context sees is `__zincImages` (images below): start(bytes) and file(path)
// ask, take(ms) hands the results over one at a time, cancel(id) forgets a request. A picture is { data: ArrayBuffer of RGBA8 rows from the top,
// alpha not premultiplied, width, height }; its buffer is the decoder's own storage, handed over, not copied.
// ponytail: one image size limit for every program (zn::kMaxImagePixels, include/zn/limits.h); a zinc.json key if a program ever needs more
constexpr std::int64_t kInlinePixels = 256 * 256;   // a picture this small is decoded at once (well under a millisecond), as a browser has a page's icons before its next script

std::string tooLarge(int w, int h) {
  return "an image of " + std::to_string(w) + " x " + std::to_string(h) + " pixels is larger than the " + std::to_string(static_cast<long long>(kMaxImagePixels)) + " the web environment decodes";
}
// The pixels of an image file: true with px filled; false with `error` empty when the bytes are no picture, or naming why it was refused
bool decodePicture(const uint8_t* p, std::size_t n, int& w, int& h, std::vector<uint8_t>& px, std::string& error) {
  if (!zn::res::imageSizeRuntime(p, n, w, h) || w <= 0 || h <= 0) return false;
  if (static_cast<std::int64_t>(w) * h > kMaxImagePixels) { error = tooLarge(w, h); return false; }
  return zn::res::decodeRgbaRuntime(p, n, w, h, px) && px.size() == static_cast<std::size_t>(w) * h * 4;
}
bool readWhole(const std::string& path, std::vector<uint8_t>& out) {   // one fread of the file's size
  struct stat st;
  if (stat(path.c_str(), &st) != 0 || !S_ISREG(st.st_mode)) return false;
  std::FILE* f = std::fopen(path.c_str(), "rb");
  if (!f) return false;
  out.resize(static_cast<std::size_t>(st.st_size));
  const bool ok = std::fread(out.data(), 1, out.size(), f) == out.size();
  std::fclose(f);
  return ok;
}

// One context's requests and results. Its lifecycle is one enum changed by close(): Open while the context lives, Closed when it goes (its
// results are freed and nothing more is kept). A request is live from start to take or cancel: a result for a request that is not live, or that
// reaches a closed inbox, is dropped, never delivered. Shared by the context's thread and the decoding thread, so everything is under its lock.
class Inbox {
 public:
  enum class State { Open, Closed };
  struct Done { std::uint32_t id = 0; std::vector<uint8_t>* px = nullptr; int w = 0, h = 0; std::string error; };
  std::uint32_t open() { std::lock_guard<std::mutex> l(m_); const std::uint32_t id = ++next_; if (state_ == State::Open) live_.insert(id); return id; }
  bool wanted(std::uint32_t id) { std::lock_guard<std::mutex> l(m_); return state_ == State::Open && live_.count(id); }
  void put(Done d) {
    { std::lock_guard<std::mutex> l(m_); if (state_ == State::Open && live_.count(d.id)) { done_.push_back(std::move(d)); d.px = nullptr; } }
    delete d.px;   // not delivered: cancelled, or the context is gone
    cv_.notify_all();
  }
  // The next result; waitMs > 0 waits that long for one, < 0 until every live request has one (a deterministic run: the same frame each time)
  bool take(Done& out, double waitMs) {
    std::unique_lock<std::mutex> l(m_);
    const auto ready = [&] { return !done_.empty() || live_.empty() || state_ != State::Open; };
    if (waitMs < 0) cv_.wait(l, ready);
    else if (waitMs > 0) cv_.wait_for(l, std::chrono::microseconds(static_cast<std::int64_t>(waitMs * 1000)), ready);
    if (done_.empty()) return false;
    out = std::move(done_.front());
    done_.pop_front();
    live_.erase(out.id);
    return true;
  }
  void cancel(std::uint32_t id) {
    std::lock_guard<std::mutex> l(m_);
    live_.erase(id);
    for (auto it = done_.begin(); it != done_.end(); ++it) if (it->id == id) { delete it->px; done_.erase(it); break; }
  }
  std::size_t live() { std::lock_guard<std::mutex> l(m_); return live_.size(); }
  // Bytes lent by the context (a buffer no script can reach, read in place: no copy on the frame): the context's thread keeps the buffer alive
  // until the decoding thread gives it back, whatever became of the request.
  void lend(napi_env c, std::uint32_t id, napi_value buffer) {
    napi_ref r = nullptr;
    if (napi_create_reference(c, buffer, 1, &r) != napi_ok) return;
    lent_[id] = r;
    std::lock_guard<std::mutex> l(m_);
    ++out_;
  }
  void giveBack(std::uint32_t id) { { std::lock_guard<std::mutex> l(m_); back_.push_back(id); --out_; } cv_.notify_all(); }   // decoding thread
  void settleLoans(napi_env c) {   // the context's thread: frees what was given back
    std::vector<std::uint32_t> ids;
    { std::lock_guard<std::mutex> l(m_); ids.swap(back_); }
    for (std::uint32_t id : ids) if (auto it = lent_.find(id); it != lent_.end()) { napi_delete_reference(c, it->second); lent_.erase(it); }
  }
  void close() {
    std::unique_lock<std::mutex> l(m_);
    if (state_ != State::Open) return;   // the only transition: Open -> Closed
    state_ = State::Closed;
    for (Done& d : done_) delete d.px;
    done_.clear();
    live_.clear();
    cv_.notify_all();
    cv_.wait(l, [&] { return out_ == 0; });   // a lent buffer being read is not freed under the decoding thread (the context is going)
  }
 private:
  std::mutex m_;
  std::condition_variable cv_;
  State state_ = State::Open;
  std::uint32_t next_ = 0;   // ids are never reused: a stale id names nothing
  std::unordered_set<std::uint32_t> live_;
  std::deque<Done> done_;
  std::unordered_map<std::uint32_t, napi_ref> lent_;   // the context's thread only
  std::vector<std::uint32_t> back_;                    // lent buffers the decoding thread no longer reads
  std::size_t out_ = 0;                                // lent buffers it may still read
};

// The decoding thread of the process: the requests of every context, in the order they came. Idle until the first, then Running for the rest
// of the process (never joined, so never torn down under a decode at exit).
class Decoder {
 public:
  struct Job { std::shared_ptr<Inbox> to; std::uint32_t id = 0; std::string path; std::vector<uint8_t> bytes; const uint8_t* lent = nullptr; std::size_t lentSize = 0; };   // a path: read here too
  enum class State { Idle, Running };
  static Decoder& get() { static Decoder* d = new Decoder(); return *d; }   // ponytail: never freed, it lives as long as the process
  void push(Job j) {
    {
      std::lock_guard<std::mutex> l(m_);
      todo_.push_back(std::move(j));
      if (state_ == State::Idle) { std::thread([this] { run(); }).detach(); state_ = State::Running; }
    }
    cv_.notify_one();
  }
 private:
  void run() {
    for (;;) {
      Job j;
      { std::unique_lock<std::mutex> l(m_); cv_.wait(l, [&] { return !todo_.empty(); }); j = std::move(todo_.front()); todo_.pop_front(); }
      Inbox::Done d;
      d.id = j.id;
      if (j.to->wanted(j.id)) {   // else cancelled while it waited: not read, not decoded
        if (!j.path.empty() && !readWhole(j.path, j.bytes)) j.bytes.clear();
        const uint8_t* p = j.lent ? j.lent : j.bytes.data();
        auto* px = new std::vector<uint8_t>();
        if (decodePicture(p, j.lent ? j.lentSize : j.bytes.size(), d.w, d.h, *px, d.error)) d.px = px; else delete px;
      }
      if (j.lent) j.to->giveBack(j.id);
      j.to->put(std::move(d));
#ifndef ZN_ENGINE_MODULE
      if (zn::loop::idleWake) zn::loop::idleWake();   // a window that sleeps while nothing changes wakes to deliver it
#endif
    }
  }
  std::mutex m_;
  std::condition_variable cv_;
  State state_ = State::Idle;
  std::deque<Job> todo_;
};

// The inbox of each context that has one, for the hosts that pump on their own (zinc:script: imagesLive).
std::mutex gInboxesLock;
std::unordered_map<napi_env, Inbox*> gInboxes;

napi_value pictureValue(napi_env c, std::vector<uint8_t>* px, int w, int h) {   // takes px
  napi_value o, data;
  if (napi_create_external_arraybuffer(c, px->data(), px->size(), [](napi_env, void*, void* hint) { delete static_cast<std::vector<uint8_t>*>(hint); }, px, &data) != napi_ok) {
    data = arrayBufferCopy(c, px->data(), px->size());   // an engine that cannot hand memory over (V8's sandbox): one copy
    delete px;
  }
  napi_create_object(c, &o);
  set(c, o, "data", data);
  set(c, o, "width", int32v(c, w));
  set(c, o, "height", int32v(c, h));
  return o;
}
// A picture of these bytes: decoded now when it is small (the picture), else queued (its id); undefined when they are no picture, a RangeError
// when it is larger than kMaxImagePixels.
napi_value startBytes(napi_env c, Inbox& in, const std::shared_ptr<Inbox>& to, const uint8_t* p, std::size_t n, std::vector<uint8_t>* owned, napi_value lend = nullptr) {
  int w = 0, h = 0;
  if (!zn::res::imageSizeRuntime(p, n, w, h) || w <= 0 || h <= 0) return nullptr;
  if (static_cast<std::int64_t>(w) * h > kMaxImagePixels) return throwRange(c, tooLarge(w, h));
  if (static_cast<std::int64_t>(w) * h <= kInlinePixels) {
    auto* px = new std::vector<uint8_t>();
    std::string error;
    if (!decodePicture(p, n, w, h, *px, error)) { delete px; return nullptr; }
    return pictureValue(c, px, w, h);
  }
  Decoder::Job j;
  j.to = to; j.id = in.open();
  if (owned) j.bytes.swap(*owned);
  else if (lend) { j.lent = p; j.lentSize = n; in.lend(c, j.id, lend); }
  else j.bytes.assign(p, p + n);   // the script's buffer may change before the thread reads it
  const std::uint32_t id = j.id;
  Decoder::get().push(std::move(j));
  return uint32v(c, id);
}
// start(buffer, offset, length[, lend]): a picture of the bytes, or the id of its decode (take hands it over later); undefined for no picture.
// lend: the buffer is read in place, not copied (32 MiB cost 3 to 4 ms to copy); only for a buffer no script can reach or change (the web
// environment's own: a Blob's bytes, a response body), since the decoding thread reads it while scripts run.
napi_value js_imgStart(napi_env c, napi_callback_info info) {
  Args<4> A(c, info);
  std::size_t n = 0;
  const uint8_t* p = slice(c, A, "start", n);
  if (!p) return nullptr;
  const auto& to = *static_cast<std::shared_ptr<Inbox>*>(A.data);
  to->settleLoans(c);
  return startBytes(c, *to, to, p, n, nullptr, A.argc > 3 && truthy(c, A.argv[3]) ? A.argv[0] : nullptr);
}
#ifndef ZN_ENGINE_MODULE
constexpr std::size_t kInlineBytes = 64 << 10;   // a file this small is read at once, then decoded at once when it is small too
// file(path, fallback): the same for a file of the program, read on the thread too (fallback: where to look when the path has no file);
// undefined when it cannot be read (the program's permissions are checked here, as the file rows check them)
napi_value js_imgFile(napi_env c, napi_callback_info info) {
  Args<3> A(c, info);
  std::string path, fallback;
  if (A.argc < 1 || !zn::napi::text(c, A.argv[0], path)) return nullptr;
  if (A.argc > 1 && !zn::napi::text(c, A.argv[1], fallback)) fallback.clear();
  struct stat st;
  const auto readable = [&](const std::string& p) { return !p.empty() && zn::host::fsReadRefused(p).empty() && stat(p.c_str(), &st) == 0 && S_ISREG(st.st_mode); };
  if (!readable(path)) { if (!readable(fallback)) return nullptr; path.swap(fallback); }
  const auto& to = *static_cast<std::shared_ptr<Inbox>*>(A.data);
  if (static_cast<std::size_t>(st.st_size) <= kInlineBytes) {
    std::vector<uint8_t> bytes;
    if (!readWhole(path, bytes)) return nullptr;
    return startBytes(c, *to, to, bytes.data(), bytes.size(), &bytes);
  }
  Decoder::Job j;
  j.to = to; j.id = to->open(); j.path = path;
  const std::uint32_t id = j.id;
  Decoder::get().push(std::move(j));
  return uint32v(c, id);
}
#endif
// take(ms): the next finished decode, { id, data, width, height } or { id, error } ("" for no picture); undefined when none is ready after
// waiting up to ms (< 0: until every request has its result)
napi_value js_imgTake(napi_env c, napi_callback_info info) {
  Args<3> A(c, info);
  double ms = 0;
  if (A.argc > 0) number(c, A.argv[0], ms);
  Inbox::Done d;
  Inbox& in = **static_cast<std::shared_ptr<Inbox>*>(A.data);
  in.settleLoans(c);
  if (!in.take(d, ms)) return nullptr;
  napi_value o;
  if (d.px) o = pictureValue(c, d.px, d.w, d.h);
  else { napi_create_object(c, &o); set(c, o, "error", string(c, d.error)); }
  set(c, o, "id", uint32v(c, d.id));
  return o;
}
napi_value js_imgCancel(napi_env c, napi_callback_info info) {   // cancel(id): its result, ready or not, is never delivered
  Args<3> A(c, info);
  std::uint32_t id = 0;
  if (A.argc > 0 && uint32(c, A.argv[0], id)) (*static_cast<std::shared_ptr<Inbox>*>(A.data))->cancel(id);
  return nullptr;
}
napi_value js_imgLive(napi_env c, napi_callback_info info) {   // live(): the requests not taken nor cancelled
  Args<3> A(c, info);
  return uint32v(c, static_cast<std::uint32_t>((*static_cast<std::shared_ptr<Inbox>*>(A.data))->live()));
}
// The context's `__zincImages` (made once): its functions share one inbox, closed when the context frees them
napi_value images(napi_env env) {
  napi_value g, have;
  napi_get_global(env, &g);
  napi_valuetype t = napi_undefined;
  if (napi_get_named_property(env, g, "__zincImages", &have) == napi_ok && napi_typeof(env, have, &t) == napi_ok && t == napi_object) return have;
  auto* holder = new std::shared_ptr<Inbox>(std::make_shared<Inbox>());
  napi_value o, keep;
  napi_create_object(env, &o);
  const auto fn = [&](const char* name, napi_callback cb) { napi_value f; napi_create_function(env, name, NAPI_AUTO_LENGTH, cb, holder, &f); set(env, o, name, f); };
  fn("start", js_imgStart);
#ifndef ZN_ENGINE_MODULE
  fn("file", js_imgFile);
#endif
  fn("take", js_imgTake);
  fn("cancel", js_imgCancel);
  fn("live", js_imgLive);
  const char* det = std::getenv("ZINC_DETERMINISTIC");
  set(env, o, "deterministic", boolean(env, det && *det && *det != '0'));   // results wait for their decode: the same frame at every run
  { std::lock_guard<std::mutex> l(gInboxesLock); gInboxes[env] = holder->get(); }
  napi_create_external(env, holder, [](napi_env e, void* data, void*) {
    auto* h = static_cast<std::shared_ptr<Inbox>*>(data);
    { std::lock_guard<std::mutex> l(gInboxesLock); auto it = gInboxes.find(e); if (it != gInboxes.end() && it->second == h->get()) gInboxes.erase(it); }
    (*h)->close();   // a decode still running finishes into a closed inbox: dropped
    delete h;
  }, nullptr, &keep);
  set(env, o, "_inbox", keep);
  napi_property_descriptor d = {"__zincImages", nullptr, nullptr, nullptr, nullptr, o, napi_configurable, nullptr};   // not enumerable: no page sees it in the window's keys
  napi_define_properties(env, g, 1, &d);
  return o;
}
// run(text, name): a classic script, run as the global code it is (its functions and vars become the window's), under its file's name in stack traces
napi_value js_run(napi_env c, napi_callback_info info) {
  Args<2> A(c, info);
  if (A.argc < 2) return nullptr;
  napi_value code, r = nullptr;
  std::string name;
  if (napi_coerce_to_string(c, A.argv[0], &code) != napi_ok || !zn::napi::text(c, A.argv[1], name)) return nullptr;
  napi_run_script(c, code, name.c_str(), &r);
  return r;
}
// xmldom(file): the text of one CommonJS file of @xmldom/xmldom (third_party/xmldom/lib, ZN-706), read by the engine and not through the
// host's file row: it is the engine's own file, beside lib/std in the repository and in share/zinc, not the program's
std::string gThirdParty;   // <root>/third_party, set by webEnv; the same for every context of the process
napi_value js_xmldom(napi_env c, napi_callback_info info) {
  Args<1> A(c, info);
  std::string name, src;
  if (A.argc < 1 || !zn::napi::text(c, A.argv[0], name) || name.empty() || name.find_first_not_of("abcdefghijklmnopqrstuvwxyz-") != std::string::npos) return nullptr;
  const std::string path = gThirdParty + "/xmldom/lib/" + name + ".js";
  if (!readText(path, src)) return throwRange(c, "the XML parser is missing (" + path + ")");
  return string(c, src);
}
#ifndef ZN_ENGINE_MODULE
// module(name): the namespace of a module, loaded and run now: `new URL()` cannot wait for an import. A module that imports it and leaves the
// namespace on the global object is evaluated here; QuickJS runs a module's body at once (only its promise settles later), so one with no
// top-level await has left it when JS_Eval returns. The import goes through the engine's own loader.
JSValue js_module(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
  if (argc < 1) return JS_UNDEFINED;
  const char* chars = JS_ToCString(c, argv[0]);
  if (!chars) return JS_EXCEPTION;
  const std::string name = chars;
  JS_FreeCString(c, chars);
  if (name.find_first_of("'\\\n") != std::string::npos) return JS_ThrowTypeError(c, "module: not a module name");
  const std::string src = "import * as m from '" + name + "'; globalThis.__zincWebModule = m;";
  JSValue p = JS_Eval(c, src.data(), src.size(), "zinc:webenv/import", JS_EVAL_TYPE_MODULE);
  if (JS_IsException(p)) return p;
  if (JS_PromiseState(c, p) == JS_PROMISE_REJECTED) { JSValue err = JS_PromiseResult(c, p); JS_PromiseMarkAsHandled(c, p); JS_FreeValue(c, p); return JS_Throw(c, err); }
  JS_FreeValue(c, p);
  JSValue g = JS_GetGlobalObject(c), m = JS_GetPropertyStr(c, g, "__zincWebModule");
  JSAtom key = JS_NewAtom(c, "__zincWebModule");
  JS_DeleteProperty(c, g, key, 0);
  JS_FreeAtom(c, key);
  JS_FreeValue(c, g);
  if (JS_IsUndefined(m)) return JS_ThrowInternalError(c, "module %s did not run to its end", name.c_str());
  return m;
}
#endif

}  // namespace

void imagesHook(napi_env env) { images(env); }

// What a zinc:script context that draws with WebGL needs to load pictures as a page does (three.js's GLTFLoader: a Blob of the bytes, an object
// URL, fetch of it, createImageBitmap). A context has no web environment and no timers: its host calls __zincImagesPump at each entry while
// decodes are out (src/qjs/script_native.cpp). There is no Worker here, and no library that makes one on finding createImageBitmap (PixiJS) runs
// in such a context; the web environment adds createImageBitmap with Worker (lib/std/webenv.js).
const char* kImageShims = R"JS((g => {
  const images = g.__zincImages;
  if (!images || typeof g.createImageBitmap !== 'undefined') return;
  const domError = (message, name) => typeof g.DOMException === 'function' ? new g.DOMException(message, name) : Object.assign(new Error(message), { name });
  if (typeof g.Blob === 'undefined') {
    const enc = new TextEncoder();
    g.Blob = class Blob {   // the bytes of its parts, joined
      constructor(parts = [], options = {}) {
        const list = Array.from(parts, p => p instanceof Blob ? p._bytes : p instanceof ArrayBuffer ? new Uint8Array(p) : ArrayBuffer.isView(p) ? new Uint8Array(p.buffer, p.byteOffset, p.byteLength) : enc.encode(String(p)));
        const out = new Uint8Array(list.reduce((n, b) => n + b.length, 0));
        let at = 0;
        for (const b of list) { out.set(b, at); at += b.length; }
        Object.defineProperty(this, '_bytes', { value: out });
        this.type = String(options.type || '').toLowerCase();
      }
      get size() { return this._bytes.length; }
      arrayBuffer() { return Promise.resolve(this._bytes.slice().buffer); }
      bytes() { return Promise.resolve(this._bytes.slice()); }
      text() { return Promise.resolve(new TextDecoder().decode(this._bytes)); }
      slice(start, end, type) { return new g.Blob([this._bytes.slice(start, end)], { type }); }
    };
  }
  const blobs = new Map();
  let blobCount = 0;
  if (typeof g.URL === 'undefined') g.URL = class URL { constructor(url) { this.href = String(url); } toString() { return this.href; } };
  if (typeof g.URL.createObjectURL !== 'function') {
    g.URL.createObjectURL = blob => { const url = 'blob:zinc-script/' + ++blobCount; blobs.set(url, blob); return url; };
    g.URL.revokeObjectURL = url => { blobs.delete(String(url)); };
  }
  if (typeof g.fetch === 'undefined') {
    g.fetch = input => new Promise((resolve, reject) => {   // blob: and data: URLs: what loaders fetch of what they already hold
      const url = String(input && input.url || input);
      let blob = blobs.get(url);
      if (!blob && /^data:/i.test(url)) {
        const comma = url.indexOf(','), head = url.slice(5, comma), data = decodeURIComponent(url.slice(comma + 1));
        if (comma > 0) blob = new g.Blob([/;base64$/i.test(head) ? Uint8Array.fromBase64(data) : data], { type: head.replace(/;base64$/i, '') });
      }
      if (!blob) return reject(new TypeError('Failed to fetch ' + url + ': a zinc:script context fetches blob: and data: URLs only'));
      resolve({ ok: true, status: 200, statusText: 'OK', url, headers: { get: k => String(k).toLowerCase() === 'content-type' ? blob.type : null },
        blob: () => Promise.resolve(blob), arrayBuffer: () => blob.arrayBuffer(), text: () => blob.text(), json: () => blob.text().then(JSON.parse) });
    });
  }
  // the pixels of a texture source for the WebGL binding (src/gl/webgl_js.cpp): a bitmap's, or an ImageData
  if (typeof g.__srcPixels !== 'function') g.__srcPixels = src => !src ? null : typeof src._pixels === 'function' ? src._pixels() : src.data && src.width ? src : null;

  const waiting = new Map();   // decode id -> what settles its promise
  Object.defineProperty(g, '__zincImagesPump', { value: () => {
    if (!waiting.size) return;
    for (let r = images.take(images.deterministic ? -1 : 0); r !== undefined; r = images.take(0)) {
      const settle = waiting.get(r.id);
      waiting.delete(r.id);
      if (settle) settle(r);
    }
  }, configurable: true });
  const picture = d => ({ data: new Uint8ClampedArray(d.data), width: d.width, height: d.height });
  const decode = bytes => g.__zincDecodeImage ? g.__zincDecodeImage(bytes) : new Promise((resolve, reject) => {   // a picture of the bytes, null for none
    let r;
    try { r = images.start(bytes.buffer, bytes.byteOffset, bytes.byteLength, true); } catch (err) { return reject(err); }   // lent: a Blob's own bytes, or a copy of them
    if (r === undefined || r === null) return resolve(null);
    if (typeof r === 'object') return resolve(picture(r));
    waiting.set(r, d => d.data ? resolve(picture(d)) : d.error ? reject(new RangeError(d.error)) : resolve(null));
  });
  // An ImageBitmap: pixels with an orientation and a premultiplication fixed when it was made (createImageBitmap's options). The pixels are kept
  // as decoded and the two choices travel with them: the WebGL binding applies them as it uploads, in place of the context's unpack parameters,
  // which WebGL ignores for a bitmap. So making one costs no pass over the pixels.
  const made = Symbol('made');
  class ImageBitmap {
    constructor(token, px, flipY, premultiply) {
      if (token !== made) throw new TypeError('Illegal constructor');
      this.width = px.width; this.height = px.height;
      Object.defineProperty(this, '_px', { value: { px, flipY, premultiply }, writable: true });
    }
    close() { this._px = null; this.width = 0; this.height = 0; }
    _pixels() { const p = this._px; return p && { data: p.px.data, width: p.px.width, height: p.px.height, flipY: p.flipY, premultiply: p.premultiply }; }
  }
  // createImageBitmap(source[, sx, sy, sw, sh][, options]): from a Blob (an image file's bytes, decoded off the frame), an ImageData or another
  // bitmap. imageOrientation 'flipY' and premultiplyAlpha 'none' | 'premultiply' | 'default' (premultiplied) are honoured, from any source as the pixels stay unpremultiplied; a rectangle that
  // leaves the source is transparent there. Resizing is not done: asked for, the promise is rejected by name.
  function createImageBitmap(source, a, b, c, d, e) {
    const options = (typeof a === 'object' && a !== null ? a : e) || {};
    if (options.resizeWidth !== undefined || options.resizeHeight !== undefined) return Promise.reject(domError('createImageBitmap does not resize', 'NotSupportedError'));
    const isBlob = source && typeof source.arrayBuffer === 'function' && typeof source.size === 'number';
    const pixels = !isBlob ? Promise.resolve(g.__srcPixels(source)) : source._bytes instanceof Uint8Array ? decode(source._bytes) : source.arrayBuffer().then(buf => decode(new Uint8Array(buf)));
    return pixels.then(px => {
      if (!px || !px.width || !px.height) throw domError('The source image could not be decoded', 'InvalidStateError');
      if (typeof a === 'number') {   // the source rectangle: a negative size counts back from its corner
        let sx = Math.trunc(a), sy = Math.trunc(b), sw = Math.trunc(c), sh = Math.trunc(d);
        if (sw < 0) { sx += sw; sw = -sw; }
        if (sh < 0) { sy += sh; sh = -sh; }
        if (!sw || !sh) throw new RangeError('createImageBitmap: the source rectangle is empty');
        if (px.flipY) sy = px.height - (sy + sh);   // a bitmap that is shown turned over keeps its rows as decoded: the rectangle is in what is shown
        const out = new Uint8ClampedArray(sw * sh * 4), x0 = Math.max(0, sx), x1 = Math.min(px.width, sx + sw);
        if (x1 > x0) for (let y = Math.max(0, sy), y1 = Math.min(px.height, sy + sh); y < y1; y++) out.set(px.data.subarray((y * px.width + x0) * 4, (y * px.width + x1) * 4), ((y - sy) * sw + x0 - sx) * 4);
        px = { data: out, width: sw, height: sh, flipY: px.flipY, premultiply: px.premultiply };
      }
      return new ImageBitmap(made, px, !!px.flipY !== (options.imageOrientation === 'flipY'), options.premultiplyAlpha !== 'none');
    });
  }
  Object.defineProperty(g, '__zincBitmapRestore', { value: (bitmap, px) => {
    Object.setPrototypeOf(bitmap, ImageBitmap.prototype);
    Object.defineProperty(bitmap, '_px', { value: { px, flipY: !!px.flipY, premultiply: !!px.premultiply }, writable: true, configurable: true });
  }, configurable: true });
  g.ImageBitmap = ImageBitmap;
  g.createImageBitmap = createImageBitmap;
})(globalThis);
)JS";
std::size_t imagesLive(napi_env env) {
  std::lock_guard<std::mutex> l(gInboxesLock);
  auto it = gInboxes.find(env);
  return it == gInboxes.end() ? 0 : it->second->live();
}

#ifndef ZN_ENGINE_MODULE
std::string webMode(const std::string& entry) {
  if (const char* v = std::getenv("ZINC_WEB"); v && *v) return std::strcmp(v, "0") ? v : "";   // ZINC_WEB=0 turns a project's "web" off, ZINC_WEB=trace names the window members a library misses
  const std::string projectFile = zn::frontend::findProjectFile(entry);
  std::string text;
  zn::frontend::Project project;
  std::string err;
  return !projectFile.empty() && readText(projectFile, text) && zn::frontend::parseProject(text, project, err) && project.web ? "1" : "";
}

std::string webBase(const std::string& entry) {   // the page's directory, what relative URLs resolve against: the project's (where zinc.json is, as index.html would be), else the entry's
  const std::string projectFile = zn::frontend::findProjectFile(entry);
  return std::filesystem::path(projectFile.empty() ? entry : projectFile).parent_path().string();
}
#endif

bool webEnv(napi_env env, const std::string& stdRoot, const std::string& mode, const std::string& base, void (*services)(napi_env env, napi_value web)) {
  const std::string path = stdRoot + "/webenv.js";
  std::string js;
  if (!readText(path, js)) { std::fprintf(stderr, "zinc: the web environment is missing (%s)\n", path.c_str()); return false; }
  napi_value g, n, code, r;
  napi_get_global(env, &g);
  napi_create_object(env, &n);
  method(env, n, "read", js_read);
  method(env, n, "httpFetch", js_httpFetch);
  method(env, n, "httpError", js_httpError);
  method(env, n, "httpPoll", js_httpPoll);
  method(env, n, "httpTake", js_httpTake);
  method(env, n, "decode", js_decode);
  set(env, n, "images", images(env));   // pictures decoded off the frame
  method(env, n, "run", js_run);
  method(env, n, "xmldom", js_xmldom);
  gThirdParty = (std::filesystem::path(stdRoot) / "../../third_party").lexically_normal().string();
  set(env, n, "base", string(env, base));
  set(env, n, "trace", boolean(env, mode == "trace"));
#ifndef ZN_ENGINE_MODULE   // (an engine module has no frontend: there a GPU without WebGL 2 gets the warning, not the refusal)
  // the "requires" a GPU without WebGL 2 fails and one with it meets (gpu>=webgl2, gpu>=gles3): checked when the machine makes no WebGL 2 context
  if (std::string projectFile = zn::frontend::findProjectFile(base + "/zinc.json"), text, err; !projectFile.empty() && readText(projectFile, text)) {
    zn::frontend::Project project;
    if (zn::frontend::parseProject(text, project, err)) {
      std::string need;
      for (const std::string& r : project.requires_)
        if (!zn::frontend::satisfied(r, {{"gpu", "webgl1"}}) && zn::frontend::satisfied(r, {{"gpu", "webgl2"}})) need = r;
      set(env, n, "name", string(env, project.name.empty() ? std::filesystem::path(projectFile).parent_path().filename().string() : project.name));
      set(env, n, "webgl2Need", string(env, need));
      set(env, n, "force", boolean(env, zn::frontend::force()));
    }
  }
#endif
  installCanvas2d(env, n, stdRoot);
  services(env, n);   // structuredClone and module, the engine's own
  set(env, g, "__zincWeb", n);   // the environment takes it and removes it
  napi_create_string_utf8(env, js.data(), js.size(), &code);
  if (napi_run_script(env, code, "zinc:webenv", &r) == napi_ok) return true;
  napi_value ex, st;
  napi_get_and_clear_last_exception(env, &ex);
  std::string s = "exception", stack;
  zn::napi::text(env, ex, s);
  napi_valuetype t = napi_undefined;
  napi_typeof(env, ex, &t);
  if (t == napi_object && napi_get_named_property(env, ex, "stack", &st) == napi_ok && isString(env, st)) zn::napi::text(env, st, stack);
  std::fprintf(stderr, "zinc: the web environment failed: %s\n%s", s.c_str(), stack.c_str());
  return false;
}

#ifndef ZN_ENGINE_MODULE
namespace {
bool workerScripts(JSContext* ctx, const std::string& stdRoot) {
  std::string script;
  if (!readText(stdRoot + "/webworker.js", script)) return false;
  for (const auto& [name, text] : std::initializer_list<std::pair<const char*, std::string>>{{"<image-shims>", kImageShims}, {"<web-worker>", script}}) {
    JSValue value = JS_Eval(ctx, text.data(), text.size(), name, JS_EVAL_TYPE_GLOBAL);
    const bool ok = !JS_IsException(value);
    JS_FreeValue(ctx, value);
    if (!ok) return false;
  }
  return true;
}
}

bool webWorkerEnv(JSContext* ctx, const std::string& stdRoot, const std::string& base) {
  napi_env env = napiEnv(ctx);
  napi_value global, scope;
  napi_get_global(env, &global);
  napi_create_object(env, &scope);
  set(env, scope, "base", string(env, base));
  set(env, global, "__zincWorkerScope", scope);
  method(env, global, "__zincWorkerRead", js_read);
  imagesHook(env);
  const char* boot = R"JS(
import { Blob as BytesBlob, URL, URLSearchParams, Event, EventTarget, MessageEvent, ErrorEvent, DOMException, TextEncoder, TextDecoder, atob, btoa } from 'zinc:web';
import { fetch as request, Response, Request, Headers } from 'zinc:web/fetch';
Object.assign(globalThis, { URL, URLSearchParams, Event, EventTarget, MessageEvent, ErrorEvent, DOMException, TextEncoder, TextDecoder, atob, btoa, Response, Request, Headers });
globalThis.location = new URL(__zincWorkerScope.base);
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input && input.url || input), location.href);
  let response;
  if (url.protocol === 'file:') {
    const bytes = __zincWorkerRead(decodeURIComponent(url.pathname));
    if (bytes === undefined) throw new TypeError('Failed to fetch ' + url.href);
    response = new Response(BytesBlob.fromBytes(Array.from(new Uint8Array(bytes))));
  } else response = await request(url.href, init);
  const bytes = response.bytes.bind(response);
  response.arrayBuffer = async () => Uint8Array.from(await bytes()).buffer;
  response.blob = async () => new Blob([Uint8Array.from(await bytes())], { type: response.headers.get('content-type') || '' });
  return response;
};
)JS";
  JSValue value = JS_Eval(ctx, boot, std::strlen(boot), "<worker-globals>", JS_EVAL_TYPE_MODULE);
  const bool ok = !JS_IsException(value);
  JS_FreeValue(ctx, value);
  return ok && workerScripts(ctx, stdRoot);
}

bool webEnv(JSContext* ctx, const std::string& stdRoot, const std::string& entry) {
  const std::string mode = webMode(entry);
  if (mode.empty()) return true;
  const bool ok = webEnv(napiEnv(ctx), stdRoot, mode, webBase(entry), [](napi_env env, napi_value web) {   // QuickJS's serializer and module loader
    JSContext* c = contextOf(env);
    set(env, web, "structuredClone", zn_napi_inline::push(env, JS_NewCFunction(c, js_structuredClone, "structuredClone", 1)));
    set(env, web, "module", zn_napi_inline::push(env, JS_NewCFunction(c, js_module, "module", 1)));
  });
  return ok && workerScripts(ctx, stdRoot);
}
#endif

}  // namespace zn::qjs
