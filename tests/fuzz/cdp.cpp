// DevTools endpoint (plugins/devtools): first byte odd, WebSocket frames after the upgrade (masked or not, 16/64-bit
// lengths, ping, close); even, the HTTP request (/json, upgrade with Host / Origin checks). Replies go to /dev/null.
#include "fuzz.h"
#include "../../plugins/devtools/native/cdp.host.cpp"
#include <fcntl.h>

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* d, size_t n) {
  if (n < 1 || n > 65000) return 0;
  HostCdp& h = inst;
  if (!h.cb) h.cb = [](int32_t, zrt::String m) { (void)inst.str(m, zrt::String::from("method", 6)); (void)inst.num(m, zrt::String::from("id", 2)); };
  Client& c = h.cl[0];
  c.fd = open("/dev/null", O_WRONLY);
  c.ws = d[0] & 1;
  c.n = (int)(n - 1);
  memcpy(c.in, d + 1, n - 1);
  c.in[c.n] = 0;
  if (c.ws) h.frames(0); else h.http(c);
  if (c.fd >= 0) h.drop(c);
  zfuzz::clear();
  return 0;
}
