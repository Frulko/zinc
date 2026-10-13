// The calls libuv makes that a glibc older than 2.14 does not have (webOS 3 on the HP TouchPad has 2.8), made as system calls.
// The kernel answers ENOSYS for what it lacks (2.6.35 has no sendmmsg) and libuv takes its other path. Empty on a current glibc.
#define _GNU_SOURCE
#include <features.h>
#if defined(__GLIBC__) && __GLIBC__ == 2 && __GLIBC_MINOR__ < 14
#include <errno.h>
#include <signal.h>
#include <sys/epoll.h>
#include <pthread.h>
#include <sys/prctl.h>
#include <sys/socket.h>
#include <sys/syscall.h>
#include <time.h>
#include <unistd.h>

int accept4(int fd, struct sockaddr* addr, socklen_t* len, int flags) { return syscall(SYS_accept4, fd, addr, len, flags); }
int dup3(int from, int to, int flags) { return syscall(SYS_dup3, from, to, flags); }
// glibc 2.8 for ARM has epoll_pwait as a stub that answers ENOSYS without a system call: libuv then never sees an event (and spins)
int epoll_pwait(int fd, struct epoll_event* events, int n, int timeout, const sigset_t* mask) {
  return mask ? syscall(SYS_epoll_pwait, fd, events, n, timeout, mask, _NSIG / 8) : epoll_wait(fd, events, n, timeout);
}
int eventfd(unsigned int count, int flags) { return syscall(SYS_eventfd2, count, flags); }   // glibc 2.8 has it, and refuses every flag
int epoll_create1(int flags) { return syscall(SYS_epoll_create1, flags); }
int inotify_init1(int flags) { return syscall(SYS_inotify_init1, flags); }
int pipe2(int fds[2], int flags) { return syscall(SYS_pipe2, fds, flags); }
int recvmmsg(int fd, struct mmsghdr* v, unsigned int n, int flags, struct timespec* timeout) { return syscall(SYS_recvmmsg, fd, v, n, flags, timeout); }
int sendmmsg(int fd, struct mmsghdr* v, unsigned int n, int flags) { return syscall(SYS_sendmmsg, fd, v, n, flags); }
// the name of a thread: the kernel's own call names the calling thread only
int pthread_setname_np(pthread_t t, const char* name) { return pthread_equal(t, pthread_self()) ? (prctl(PR_SET_NAME, name) ? errno : 0) : ENOSYS; }
int pthread_getname_np(pthread_t t, char* buf, size_t n) {
  char name[16] = "";
  if (!pthread_equal(t, pthread_self())) return ENOSYS;
  if (prctl(PR_GET_NAME, name)) return errno;
  if (n < sizeof name) return ERANGE;
  for (size_t i = 0; i < sizeof name; i++) buf[i] = name[i];
  return 0;
}
#endif
