// zinc:remote viewer (plugins/remote-view): the message stream a display-remote server sends (HELLO, RECT with RLE
// pixels, FRAME, PONG), decoded into the session's runtime image.
#include "fuzz.h"
#include "../../plugins/remote-view/native/remote.host.cpp"

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* d, size_t n) {
  if (n > (1 << 18)) return 0;
  static HostRemote* r = (HostRemote*)zinc_create_Remote();
  Session& s = ss[0];
  s = Session();
  s.st = OPEN; s.fd = -1;
  s.in = (uint8_t*)malloc(n ? n : 1); memcpy(s.in, d, n); s.len = s.cap = n;
  (void)r->parse(0);
  r->free_session(s);
  zfuzz::clear();
  return 0;
}
