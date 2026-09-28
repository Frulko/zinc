// zinc:net serve(): the HTTP/1.1 request parser (runtime/mod/net.cpp, Server::handle). The request arrives in two
// parts (split at the first byte's position) like successive recv() calls; replies go to /dev/null.
#include "fuzz.h"
#include "../../runtime/mod/net.cpp"
#include <fcntl.h>
using namespace zrt;

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* d, size_t n) {
  if (n < 1 || n > (1 << 17)) return 0;
  static net::Server* srv;
  if (!srv) {
    srv = new (alloc(sizeof(net::Server))) net::Server();
    srv->handler = [](Ref<net::Request> r) -> Ref<net::Reply> {
      auto p = make<net::Reply>();
      p->body = cat(r->method, r->path, r->body.bytes());
      return p;
    };
  }
  int fd = open("/dev/null", O_WRONLY);
  net::Conn k{fd, new (alloc(sizeof(StrBuilder))) StrBuilder(), nullptr, 0};
  size_t cut = 1 + d[0] % n;
  k.in->raw((const char*)d + 1, (uint32_t)(cut - 1));
  if (!srv->handle(&k)) { k.in->raw((const char*)d + cut, (uint32_t)(n - cut)); srv->handle(&k); }
  close(fd);
  k.in->~StrBuilder(); mfree(k.in);
  zfuzz::clear();
  return 0;
}
