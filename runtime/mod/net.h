// zinc:net — fetch (libcurl multi, polled by the event loop) and a minimal HTTP/1.1 server.
#pragma once
namespace zrt { namespace net {
struct RequestInit : Object {
  static constexpr uint32_t ZRT_CID = 0xFFFE20;
  String method, body, contentType;
  RequestInit() {}
};
struct Response : Object {
  static constexpr uint32_t ZRT_CID = 0xFFFE21;
  int32_t status = 0;
  bool ok = false;
  String body;
  Response() {}
  bool zrt_isa(uint32_t id) const override { return id == ZRT_CID; }
  Promise<String> text() { return Promise<String>::resolved(body); }
  void zrt_fields(StrBuilder& sb, bool& first) const override { json_field(sb, first, "status", status); json_field(sb, first, "ok", ok); }
  void zrt_json(StrBuilder& sb) const override { sb.ch('{'); bool first = true; zrt_fields(sb, first); sb.ch('}'); }
};
struct Request : Object {
  static constexpr uint32_t ZRT_CID = 0xFFFE22;
  String method, path, body;
  Request() {}
};
struct Reply : Object {
  static constexpr uint32_t ZRT_CID = 0xFFFE23;
  int32_t status = 200;
  String body, contentType;
  Reply() {}
};
Promise<Ref<Response>> fetch(const String& url, const Ref<RequestInit>& init = Ref<RequestInit>());
void serve(int32_t port, Fn<Ref<Reply>(Ref<Request>)> handler);
void stop();
}}
