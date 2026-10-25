// zn::plat sockets: the BSD socket headers, or Winsock 2 on Windows, and the four calls that differ (a socket is not a file there).
// Separate from platform.h because it pulls in the system's socket headers (windows.h on Windows). Sockets stay `int`, as the callers keep them.
// ponytail: a SOCKET is a UINT_PTR; Windows hands out small values that fit an int in practice. A typedef for the descriptor if that ever bites.
#pragma once
#include <cstddef>

#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <winsock2.h>
#include <ws2tcpip.h>
#else
#include <arpa/inet.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
#ifdef __PSP__
// The PSP's C library (newlib and libcglue over sceNetInet) has select but no poll: the few polls of the console player (one or two
// sockets, src/agent) go through select. ponytail: FD_SETSIZE bounds the descriptors, as select does.
#include <sys/select.h>
struct pollfd { int fd; short events; short revents; };
#define POLLIN 0x001
#define POLLOUT 0x004
#define POLLERR 0x008
#define POLLHUP 0x010
inline int poll(pollfd* p, unsigned n, int ms) {
  fd_set r, w;
  FD_ZERO(&r);
  FD_ZERO(&w);
  int top = -1;
  for (unsigned i = 0; i < n; i++) {
    p[i].revents = 0;
    if (p[i].fd < 0) continue;
    if (p[i].events & POLLIN) FD_SET(p[i].fd, &r);
    if (p[i].events & POLLOUT) FD_SET(p[i].fd, &w);
    if (p[i].fd > top) top = p[i].fd;
  }
  timeval tv{ms / 1000, (ms % 1000) * 1000};
  const int rc = ::select(top + 1, &r, &w, nullptr, ms < 0 ? nullptr : &tv);
  if (rc <= 0) return rc;
  int ready = 0;
  for (unsigned i = 0; i < n; i++) {
    if (p[i].fd < 0) continue;
    if (FD_ISSET(p[i].fd, &r)) p[i].revents |= POLLIN;
    if (FD_ISSET(p[i].fd, &w)) p[i].revents |= POLLOUT;
    if (p[i].revents) ready++;
  }
  return ready;
}
#else
#include <poll.h>
#endif
#endif

namespace zn::plat {
#ifdef _WIN32
inline bool netInit() {   // WSAStartup, once
  static const bool ok = [] { WSADATA d; return WSAStartup(MAKEWORD(2, 2), &d) == 0; }();
  return ok;
}
inline long sockRead(int fd, void* buf, std::size_t n) { return ::recv(static_cast<SOCKET>(fd), static_cast<char*>(buf), static_cast<int>(n), 0); }
inline long sockWrite(int fd, const void* buf, std::size_t n) { return ::send(static_cast<SOCKET>(fd), static_cast<const char*>(buf), static_cast<int>(n), 0); }
inline int sockClose(int fd) { return ::closesocket(static_cast<SOCKET>(fd)); }
inline int sockPoll(pollfd* fds, unsigned n, int ms) { return ::WSAPoll(fds, n, ms); }
inline long sockReadNow(int fd, void* buf, std::size_t n) {   // what has arrived, without waiting: -1 when nothing has (no MSG_DONTWAIT on Windows)
  u_long ready = 0;
  if (::ioctlsocket(static_cast<SOCKET>(fd), FIONREAD, &ready) != 0 || ready == 0) return -1;
  return sockRead(fd, buf, n < ready ? n : ready);
}
#else
inline bool netInit() { return true; }
inline void sockNonBlock(int fd) {   // the PSP and the Vita: a socket option (their fcntl does not reach the network stack)
#if defined(__PSP__) || defined(__vita__)
  int one = 1;
  ::setsockopt(fd, SOL_SOCKET, SO_NONBLOCK, &one, sizeof one);
#else
  ::fcntl(fd, F_SETFL, ::fcntl(fd, F_GETFL, 0) | O_NONBLOCK);
#endif
}
inline long sockReadNow(int fd, void* buf, std::size_t n) { return ::recv(fd, buf, n, MSG_DONTWAIT); }
inline long sockRead(int fd, void* buf, std::size_t n) { return ::read(fd, buf, n); }
inline long sockWrite(int fd, const void* buf, std::size_t n) { return ::write(fd, buf, n); }
inline int sockClose(int fd) { return ::close(fd); }
inline int sockPoll(pollfd* fds, unsigned n, int ms) { return ::poll(fds, n, ms); }
#endif
}  // namespace zn::plat
