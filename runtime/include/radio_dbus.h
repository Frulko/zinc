#pragma once
// The OS supplies LGPL libsystemd at run time; this header never links it into Zinc.
#include <cstdint>
#include <cerrno>
#include <cstring>
#include <dlfcn.h>
#include <functional>
#include <list>
#include <memory>
#include <string>
#include <vector>

namespace zinc::radio {
struct sd_bus;
struct sd_bus_message;
struct sd_bus_slot;
struct sd_bus_error { const char* name; const char* message; int need_free; };
using Handler = int (*)(sd_bus_message*, void*, sd_bus_error*);
#define ZN_BUS_FUNCTIONS(X) \
 X(int, new_bus, sd_bus_new, (sd_bus**)) \
 X(int, set_address, sd_bus_set_address, (sd_bus*, const char*)) \
 X(int, set_bus_client, sd_bus_set_bus_client, (sd_bus*, int)) \
 X(int, start, sd_bus_start, (sd_bus*)) \
 X(sd_bus*, close_unref, sd_bus_close_unref, (sd_bus*)) \
 X(int, process, sd_bus_process, (sd_bus*, sd_bus_message**)) \
 X(int, new_call, sd_bus_message_new_method_call, (sd_bus*, sd_bus_message**, const char*, const char*, const char*, const char*)) \
 X(sd_bus_message*, message_unref, sd_bus_message_unref, (sd_bus_message*)) \
 X(sd_bus_slot*, slot_unref, sd_bus_slot_unref, (sd_bus_slot*)) \
 X(int, call_async, sd_bus_call_async, (sd_bus*, sd_bus_slot**, sd_bus_message*, Handler, void*, uint64_t)) \
 X(int, add_match_async, sd_bus_add_match_async, (sd_bus*, sd_bus_slot**, const char*, Handler, Handler, void*)) \
 X(int, is_error, sd_bus_message_is_method_error, (sd_bus_message*, const char*)) \
 X(const sd_bus_error*, get_error, sd_bus_message_get_error, (sd_bus_message*)) \
 X(int, get_errno, sd_bus_message_get_errno, (sd_bus_message*)) \
 X(const char*, signature, sd_bus_message_get_signature, (sd_bus_message*, int)) \
 X(const char*, path, sd_bus_message_get_path, (sd_bus_message*)) \
 X(const char*, interface, sd_bus_message_get_interface, (sd_bus_message*)) \
 X(const char*, member, sd_bus_message_get_member, (sd_bus_message*)) \
 X(int, peek, sd_bus_message_peek_type, (sd_bus_message*, char*, const char**)) \
 X(int, read_basic, sd_bus_message_read_basic, (sd_bus_message*, char, void*)) \
 X(int, enter, sd_bus_message_enter_container, (sd_bus_message*, char, const char*)) \
 X(int, exit, sd_bus_message_exit_container, (sd_bus_message*)) \
 X(int, append_basic, sd_bus_message_append_basic, (sd_bus_message*, char, const void*)) \
 X(int, open, sd_bus_message_open_container, (sd_bus_message*, char, const char*)) \
 X(int, close, sd_bus_message_close_container, (sd_bus_message*))
#define ZN_BUS_EXPORT_FUNCTIONS(X) \
 X(int, add_object, sd_bus_add_object, (sd_bus*, sd_bus_slot**, const char*, Handler, void*)) \
 X(int, new_return, sd_bus_message_new_method_return, (sd_bus_message*, sd_bus_message**)) \
 X(int, new_error, sd_bus_message_new_method_error, (sd_bus_message*, sd_bus_message**, const sd_bus_error*)) \
 X(int, send, sd_bus_send, (sd_bus*, sd_bus_message*, uint64_t*)) \
 X(const char*, sender, sd_bus_message_get_sender, (sd_bus_message*)) \
 X(int, is_call, sd_bus_message_is_method_call, (sd_bus_message*, const char*, const char*)) \
 X(int, expect_reply, sd_bus_message_get_expect_reply, (sd_bus_message*)) \
 X(int, can_send, sd_bus_can_send, (sd_bus*, char))
struct Api {
#define ZN_FIELD(ret, field, symbol, args) ret (*field) args = nullptr;
  ZN_BUS_FUNCTIONS(ZN_FIELD)
  ZN_BUS_EXPORT_FUNCTIONS(ZN_FIELD)
#undef ZN_FIELD
};
struct Library {
  Api api;
  void* handle = nullptr;
  ~Library() { if (handle) dlclose(handle); }
  bool load() {
    if (handle) return true;
#ifdef __linux__
    handle = dlopen("libsystemd.so.0", RTLD_NOW | RTLD_LOCAL);
    if (!handle) return false;
#define ZN_LOAD(ret, field, symbol, args) api.field = reinterpret_cast<decltype(api.field)>(dlsym(handle, #symbol)); if (!api.field) { dlclose(handle); handle = nullptr; api = {}; return false; }
    ZN_BUS_FUNCTIONS(ZN_LOAD)
#define ZN_LOAD_EXPORT(ret, field, symbol, args) api.field = reinterpret_cast<decltype(api.field)>(dlsym(handle, #symbol));
    ZN_BUS_EXPORT_FUNCTIONS(ZN_LOAD_EXPORT)
#undef ZN_LOAD_EXPORT
#undef ZN_LOAD
    return true;
#else
    return false;
#endif
  }
};
#undef ZN_BUS_FUNCTIONS
#undef ZN_BUS_EXPORT_FUNCTIONS

inline bool objectPath(const std::string& s) {
  if (s.empty() || s.size() > 1024 || s[0] != '/') return false;
  if (s == "/") return true;
  bool component = false;
  for (size_t i = 1; i < s.size(); i++) {
    unsigned char c = s[i];
    if (c == '/') { if (!component) return false; component = false; }
    else if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_') component = true;
    else return false;
  }
  return component;
}
struct Value {
  char type = 0;
  std::string contents, text;
  uint64_t number = 0;
  std::vector<Value> children;
  static Value string(std::string s, char type = 's') { Value v; v.type = type; v.text = std::move(s); return v; }
  static Value integer(uint64_t n, char type = 'u') { Value v; v.type = type; v.number = n; return v; }
  static Value container(char t, std::string signature, std::vector<Value> values) { Value v; v.type = t; v.contents = std::move(signature); v.children = std::move(values); return v; }
  static Value variant(Value v) { std::string s = v.type == 'a' ? "a" + v.contents : std::string(1, v.type); return container('v', s, {std::move(v)}); }
  const Value* property(const std::string& key) const {
    if (type != 'a' || contents != "{sv}") return nullptr;
    for (auto& e : children) if (e.type == 'e' && e.children.size() == 2 && e.children[0].type == 's' && e.children[0].text == key) {
      auto& v = e.children[1]; return v.type == 'v' && v.children.size() == 1 ? &v.children[0] : nullptr;
    }
    return nullptr;
  }
};
inline Value dictionary(std::vector<Value> entries = {}) { return Value::container('a', "{sv}", std::move(entries)); }
inline Value property(std::string key, Value v) { return Value::container('e', "sv", {Value::string(std::move(key)), Value::variant(std::move(v))}); }
inline Value bytes(const std::vector<uint8_t>& data) { std::vector<Value> vs; for (auto b : data) vs.push_back(Value::integer(b, 'y')); return Value::container('a', "y", std::move(vs)); }
struct Budget { size_t bytes = 0, nodes = 0; bool take(size_t n) { bytes += n; return bytes <= 1048576 && ++nodes <= 16384; } };
inline bool readValue(Api& a, sd_bus_message* m, Value& v, Budget& budget, unsigned depth = 0) {
  if (depth > 24 || !budget.take(sizeof(Value))) return false;
  const char* contents = nullptr;
  if (a.peek(m, &v.type, &contents) <= 0) return false;
  if (v.type == 'a' || v.type == 'e' || v.type == 'r' || v.type == 'v') {
    if (!contents || std::strlen(contents) > 255) return false;
    v.contents = contents;
    if (a.enter(m, v.type, contents) <= 0) return false;
    char t; const char* c;
    int n;
    while ((n = a.peek(m, &t, &c)) > 0) { Value child; if (!readValue(a, m, child, budget, depth + 1)) return false; v.children.push_back(std::move(child)); }
    return n == 0 && a.exit(m) >= 0 && (v.type != 'v' || v.children.size() == 1);
  }
  if (v.type == 's' || v.type == 'o' || v.type == 'g') {
    const char* p = nullptr;
    if (a.read_basic(m, v.type, &p) <= 0 || !p) return false;
    size_t n = strnlen(p, 1048577);
    if (!budget.take(n)) return false;
    v.text.assign(p, n); return v.type != 'o' || objectPath(v.text);
  }
  int result = -1;
  switch (v.type) {
    case 'y': { uint8_t n = 0; result = a.read_basic(m, 'y', &n); v.number = n; break; }
    case 'n': case 'q': { uint16_t n = 0; result = a.read_basic(m, v.type, &n); v.number = n; break; }
    case 'b': case 'i': case 'u': { uint32_t n = 0; result = a.read_basic(m, v.type, &n); v.number = n; break; }
    case 'x': case 't': case 'd': { uint64_t n = 0; result = a.read_basic(m, v.type, &n); v.number = n; break; }
    default: return false; // Unix fds are never accepted from radio properties.
  }
  return result > 0;
}
inline bool appendValue(Api& a, sd_bus_message* m, const Value& v, unsigned depth = 0) {
  if (depth > 24) return false;
  if (v.type == 'a' || v.type == 'e' || v.type == 'r' || v.type == 'v') {
    if (a.open(m, v.type, v.contents.c_str()) < 0) return false;
    for (auto& c : v.children) if (!appendValue(a, m, c, depth + 1)) return false;
    return a.close(m) >= 0;
  }
  if (v.type == 's' || v.type == 'o' || v.type == 'g') {
    if (v.text.find('\0') != std::string::npos || (v.type == 'o' && !objectPath(v.text))) return false;
    return a.append_basic(m, v.type, v.text.c_str()) >= 0;
  }
  // Use exact-width storage; sd-bus reads the pointed-to native type, not a uint64_t prefix.
  switch (v.type) {
    case 'y': { uint8_t n = v.number; return a.append_basic(m, v.type, &n) >= 0; }
    case 'n': case 'q': { uint16_t n = v.number; return a.append_basic(m, v.type, &n) >= 0; }
    case 'b': case 'i': case 'u': { uint32_t n = v.number; return a.append_basic(m, v.type, &n) >= 0; }
    case 'x': case 't': case 'd': return a.append_basic(m, v.type, &v.number) >= 0;
    default: return false;
  }
}
struct Reply {
  std::string signature, path, interface, member, error;
  int code = 0;
  std::vector<Value> values;
  bool ok() const { return error.empty(); }
};
inline Reply readReply(Api& a, sd_bus_message* m) {
  Reply r;
  if (a.is_error(m, nullptr) > 0) {
    const auto* e = a.get_error(m);
    // The daemon's free-form message may echo a password. Keep only the error name and errno.
    r.error = e && e->name ? e->name : "D-Bus method error"; r.code = a.get_errno(m); return r;
  }
  const char* sig = a.signature(m, 1); r.signature = sig ? sig : "";
  const char* p = a.path(m); r.path = p ? p : "";
  p = a.interface(m); r.interface = p ? p : "";
  p = a.member(m); r.member = p ? p : "";
  Budget budget; char t; const char* c; int n;
  while ((n = a.peek(m, &t, &c)) > 0) { Value v; if (!readValue(a, m, v, budget)) { r.error = "invalid or oversized D-Bus reply"; break; } r.values.push_back(std::move(v)); }
  if (n < 0) r.error = "invalid D-Bus reply";
  return r;
}
class Bus {
public:
  enum class State { idle, starting, ready, failed, closed };
  enum class Failure { none, unavailable, denied, other };
  using Callback = std::function<void(const Reply&)>;
private:
  struct Pending { Bus* owner; uint64_t generation; sd_bus_slot* slot = nullptr; Callback callback, installation; enum class State { waiting, done } state = State::waiting; bool persistent = false; };
  Library library;
  Api* api;
  sd_bus* bus = nullptr;
  State phase = State::idle;
  Failure failureKind = Failure::none;
  uint64_t generation = 1;
  std::list<std::unique_ptr<Pending>> pending;
  std::string failure;
  bool transition(State next) {
    bool valid = (phase == State::idle && next == State::starting) || (phase == State::starting && (next == State::ready || next == State::failed)) || (phase == State::ready && next == State::failed) || (next == State::closed) || ((phase == State::closed || phase == State::failed) && next == State::starting);
    if (valid) phase = next;
    return valid;
  }
  static int delivered(sd_bus_message* m, void* data, sd_bus_error*) {
    auto& p = *static_cast<Pending*>(data);
    if (p.generation != p.owner->generation || p.state != Pending::State::waiting) return 0;
    if (!p.persistent) p.state = Pending::State::done;
    Reply r = readReply(*p.owner->api, m); auto callback = p.callback; callback(r); return 0;
  }
  static int installed(sd_bus_message* m, void* data, sd_bus_error*) {
    auto& p = *static_cast<Pending*>(data);
    if (p.generation != p.owner->generation) return 0;
    if (p.owner->api->is_error(m, nullptr) <= 0) { if (p.installation) { auto cb=p.installation; cb(readReply(*p.owner->api,m)); } return 0; }
    p.state = Pending::State::done;
    Reply r = readReply(*p.owner->api, m); auto callback = p.callback; callback(r); return 0;
  }
  void cancel() { ++generation; for (auto& p : pending) if (p->slot) api->slot_unref(p->slot); pending.clear(); }
  static Failure classify(int n) {
    if (n == -EACCES || n == -EPERM) return Failure::denied;
    if (n == -ENOENT || n == -ECONNREFUSED || n == -ENOTCONN || n == -EPIPE || n == -ECONNRESET || n == -ENOSYS) return Failure::unavailable;
    return Failure::other;
  }
  void fail(std::string why, Failure kind) { failure = std::move(why); failureKind = kind; transition(State::failed); }
public:
  explicit Bus(Api* injected = nullptr) : api(injected ? injected : &library.api) {}
  Bus(const Bus&) = delete;
  Bus& operator=(const Bus&) = delete;
  ~Bus() { stop(); }
  State state() const { return phase; }
  const std::string& error() const { return failure; }
  bool unavailable() const { return phase == State::failed && failureKind == Failure::unavailable; }
  bool start() {
    if (phase == State::ready) return true;
    if (phase == State::starting) return false;
    transition(State::starting); failure.clear(); failureKind = Failure::none;
    if (api == &library.api && !library.load()) { fail("libsystemd.so.0 unavailable", Failure::unavailable); return false; }
    int n = api->new_bus(&bus);
    if (n >= 0) n = api->set_address(bus, "unix:path=/run/dbus/system_bus_socket");
    if (n >= 0) n = api->set_bus_client(bus, 1);
    if (n >= 0) n = api->start(bus);
    if (n < 0) { if (bus) bus = api->close_unref(bus); fail("system bus unavailable (" + std::to_string(n) + ")", classify(n)); return false; }
    transition(State::ready); return true;
  }
  void stop() { if (bus) { cancel(); bus = api->close_unref(bus); } transition(State::closed); }
  void poll() {
    if (phase != State::ready) return;
    for (unsigned i = 0; i < 32; i++) {
      int n = api->process(bus, nullptr);
      if (phase != State::ready) return;
      if (n < 0) { cancel(); bus = api->close_unref(bus); fail("system bus disconnected (" + std::to_string(n) + ")", classify(n)); return; }
      if (n == 0) break;
    }
    pending.remove_if([&](auto& p) { if (p->state != Pending::State::done) return false; if (p->slot) api->slot_unref(p->slot); return true; });
  }
  bool call(const char* destination, const std::string& path, const char* interface, const char* member, std::vector<Value> args, Callback callback, uint64_t timeout = 10000000) {
    if (phase != State::ready || timeout == 0 || !objectPath(path) || pending.size() >= 128) return false;
    sd_bus_message* m = nullptr;
    int n = api->new_call(bus, &m, destination, path.c_str(), interface, member);
    struct Guard { Api* api; sd_bus_message* m; ~Guard() { if (m) api->message_unref(m); } } guard{api, m};
    if (n < 0 || !m) return false;
    for (auto& a : args) if (!appendValue(*api, m, a)) return false;
    auto p = std::make_unique<Pending>(); p->owner = this; p->generation = generation; p->callback = std::move(callback);
    n = api->call_async(bus, &p->slot, m, delivered, p.get(), timeout > 30000000 ? 30000000 : timeout);
    if (n < 0) { if (p->slot) api->slot_unref(p->slot); return false; }
    pending.push_back(std::move(p)); return true;
  }
  Api& rawApi() { return *api; }
  sd_bus* rawBus() { return bus; }
  bool match(const std::string& rule, Callback callback, Callback installation = {}) {
    if (phase != State::ready || pending.size() >= 128) return false;
    auto p = std::make_unique<Pending>(); p->owner = this; p->generation = generation; p->callback = std::move(callback); p->persistent = true; p->installation = std::move(installation);
    int n = api->add_match_async(bus, &p->slot, rule.c_str(), delivered, installed, p.get());
    if (n < 0) { if (p->slot) api->slot_unref(p->slot); return false; }
    pending.push_back(std::move(p)); return true;
  }
};
inline std::string hex(const std::vector<uint8_t>& b) { std::string out; const char* digits = "0123456789abcdef"; for (auto c : b) { out += digits[c >> 4]; out += digits[c & 15]; } return out; }
inline std::vector<uint8_t> byteArray(const Value* v) { std::vector<uint8_t> out; if (v && v->type == 'a' && v->contents == "y") for (auto& c : v->children) { if (c.type != 'y') return {}; out.push_back(c.number); } return out; }
}
