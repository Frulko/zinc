// POSIX socket helpers shared by net, osc, mqtt, telemetry (hosts; lwIP on esp32 has the same API).
#pragma once
#include <sys/socket.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <string.h>

#ifndef MSG_NOSIGNAL
#define MSG_NOSIGNAL 0
#endif
namespace zrt { namespace sock {
inline void nosigpipe(int fd) {
#ifdef SO_NOSIGPIPE
  int one = 1; setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &one, sizeof one);
#else
  (void)fd;
#endif
}
inline void nonblock(int fd) { fcntl(fd, F_SETFL, fcntl(fd, F_GETFL, 0) | O_NONBLOCK); }
inline bool resolve(const char* host, int port, sockaddr_in* out) {
  memset(out, 0, sizeof *out);
  out->sin_family = AF_INET; out->sin_port = htons((uint16_t)port);
  if (inet_pton(AF_INET, host, &out->sin_addr) == 1) return true;
  addrinfo hints{}, *res = nullptr; hints.ai_family = AF_INET;
  if (getaddrinfo(host, nullptr, &hints, &res) || !res) return false;
  out->sin_addr = ((sockaddr_in*)res->ai_addr)->sin_addr;
  freeaddrinfo(res);
  return true;
}
inline int udp_bind(int port) {
  int fd = socket(AF_INET, SOCK_DGRAM, 0);
  if (fd < 0) return -1;
  int one = 1; setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof one);
  sockaddr_in a{}; a.sin_family = AF_INET; a.sin_port = htons((uint16_t)port); a.sin_addr.s_addr = htonl(INADDR_ANY);
  if (port && bind(fd, (sockaddr*)&a, sizeof a) < 0) { close(fd); return -1; }
  nonblock(fd);
  return fd;
}
inline int tcp_listen(int port) {
  int fd = socket(AF_INET, SOCK_STREAM, 0);
  if (fd < 0) return -1;
  int one = 1; setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof one);
  sockaddr_in a{}; a.sin_family = AF_INET; a.sin_port = htons((uint16_t)port); a.sin_addr.s_addr = htonl(INADDR_ANY);
  if (bind(fd, (sockaddr*)&a, sizeof a) < 0 || listen(fd, 16) < 0) { close(fd); return -1; }
  nonblock(fd);
  return fd;
}
inline int tcp_connect(const char* host, int port) {
  sockaddr_in a;
  if (!resolve(host, port, &a)) return -1;
  int fd = socket(AF_INET, SOCK_STREAM, 0);
  if (fd < 0) return -1;
  nonblock(fd);
  nosigpipe(fd);
  int one = 1; setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &one, sizeof one);
  if (connect(fd, (sockaddr*)&a, sizeof a) < 0 && errno != EINPROGRESS) { close(fd); return -1; }
  return fd;
}
struct CStr { StrBuilder sb; CStr(const String& s) { to_s(sb, s); sb.ch('\0'); } const char* c() const { return sb.buf; } };
}}
