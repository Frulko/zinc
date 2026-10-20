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
#include <netinet/in.h>
#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>
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
inline long sockReadNow(int fd, void* buf, std::size_t n) { return ::recv(fd, buf, n, MSG_DONTWAIT); }
inline long sockRead(int fd, void* buf, std::size_t n) { return ::read(fd, buf, n); }
inline long sockWrite(int fd, const void* buf, std::size_t n) { return ::write(fd, buf, n); }
inline int sockClose(int fd) { return ::close(fd); }
inline int sockPoll(pollfd* fds, unsigned n, int ms) { return ::poll(fds, n, ms); }
#endif
}  // namespace zn::plat
