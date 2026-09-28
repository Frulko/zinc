// zinc:net — fetch (libcurl multi, polled by the event loop) and a minimal HTTP/1.1 server.
#pragma once
namespace zrt { namespace net {
/** Web Headers: case-insensitive names (stored lowercase), insertion order kept, iteration sorted by name. */
struct Headers : Object {
  static constexpr uint32_t ZRT_CID = 0xFFFE24;
  Array<String> names = Array<String>::with_cap(0);
  Array<String> vals = Array<String>::with_cap(0);
  Headers() {}
  bool zrt_isa(uint32_t id) const override { return id == ZRT_CID; }
  static String lower(const String& s) { return s.toLowerCase(); }
  void append(const String& name, const String& value) { names.push(lower(name)); vals.push(value.trim()); }
  void set(const String& name, const String& value) { del(name); append(name, value); }
  void delete_(const String& name) { del(name); }
  void del(const String& name) {
    String n = lower(name);
    for (int32_t i = names.length() - 1; i >= 0; i--) if (names.get(i) == n) { names.splice(i, 1); vals.splice(i, 1); }
  }
  bool has(const String& name) const { String n = lower(name); for (int32_t i = 0; i < names.length(); i++) if (names.get(i) == n) return true; return false; }
  /** Values of a name joined with ', ' ('' when absent). */
  String get(const String& name) const {
    String n = lower(name); StrBuilder sb; bool any = false;
    for (int32_t i = 0; i < names.length(); i++) if (names.get(i) == n) { if (any) sb.cstr(", "); to_s(sb, vals.get(i)); any = true; }
    return sb.build();
  }
  /** Distinct names, sorted. */
  Array<String> keys() const {
    Array<String> r = Array<String>::with_cap(0);
    for (int32_t i = 0; i < names.length(); i++) if (!r.includes(names.get(i))) r.push(names.get(i));
    return r.sort([](const String& a, const String& b) { return (double)str_cmp(a, b); });
  }
  void forEach(Fn<void(String, String)> f) const { Array<String> k = keys(); for (int32_t i = 0; i < k.length(); i++) f(get(k.get(i)), k.get(i)); }
};
struct RequestInit : Object {
  static constexpr uint32_t ZRT_CID = 0xFFFE20;
  String method, body, contentType;
  Ref<Headers> headers;
  int32_t timeoutMs = 0;
  Array<uint8_t> bodyBytes;  // binary body (wins over `body`)
  RequestInit() {}
};
struct Response : Object {
  static constexpr uint32_t ZRT_CID = 0xFFFE21;
  int32_t status = 0;
  bool ok = false;
  String statusText, url;
  Ref<Headers> headers = make<Headers>();
  String body;
  Response() {}
  bool zrt_isa(uint32_t id) const override { return id == ZRT_CID; }
  Promise<String> text() { return Promise<String>::resolved(body); }
  Promise<Array<uint8_t>> bytes() {
    Array<uint8_t> r = Array<uint8_t>::with_cap((int32_t)body.bytes());
    if (body.bytes()) { __builtin_memcpy(r.a->data, body.ptr(), body.bytes()); r.a->len = (int32_t)body.bytes(); }
    return Promise<Array<uint8_t>>::resolved(r);
  }
  /** Gradual profile: the body as a Dyn tree; rejects on invalid JSON. */
  Promise<Dyn> json() {
    Dyn d = json_parse(body);
    if (g_err.p) return Promise<Dyn>::rejected(take_error());
    return Promise<Dyn>::resolved(d);
  }
  void zrt_fields(StrBuilder& sb, bool& first) const override { json_field(sb, first, "status", status); json_field(sb, first, "ok", ok); }
  void zrt_json(StrBuilder& sb) const override { sb.ch('{'); bool first = true; zrt_fields(sb, first); sb.ch('}'); }
};
struct Request : Object {
  static constexpr uint32_t ZRT_CID = 0xFFFE22;
  String method, path, body;
  Ref<Headers> headers = make<Headers>();
  Request() {}
};
struct Reply : Object {
  static constexpr uint32_t ZRT_CID = 0xFFFE23;
  int32_t status = 200;
  String body, contentType;
  Ref<Headers> headers;
  Reply() {}
};
/** Reason phrase of a status code (the ones Node's http module uses). */
const char* reason(int32_t status);
Promise<Ref<Response>> fetch(const String& url, const Ref<RequestInit>& init = Ref<RequestInit>());
void serve(int32_t port, Fn<Ref<Reply>(Ref<Request>)> handler);
void stop();
}}
