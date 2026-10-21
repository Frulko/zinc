// libc functions bionic gained after API 19 (Android 4.4), for a Zinc Android export built against API 21 (the NDK floor).
// The list is what the Toumei C800 projector's libc lacked for bouncing-ball (toumei-c800-api19.sh check). Experimental, not the engine.
// Applied by toumei-c800-api19.sh; report: toumei-c800-projector.md.
#define _GNU_SOURCE
#include <errno.h>
#include <iconv.h>
#include <ifaddrs.h>
#include <limits.h>
#include <locale.h>
#include <pthread.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/epoll.h>
#include <sys/sendfile.h>
#include <sys/socket.h>
#include <sys/syscall.h>
#include <time.h>
#include <unistd.h>
#include <wchar.h>
#include <wctype.h>

// syscalls the 3.10 kernel has and bionic 4.4 does not wrap
int accept4(int fd, struct sockaddr* a, socklen_t* l, int flags) { return syscall(__NR_accept4, fd, a, l, flags); }
int dup3(int o, int n, int flags) { return syscall(__NR_dup3, o, n, flags); }
int epoll_create1(int flags) { return syscall(__NR_epoll_create1, flags); }
int epoll_pwait(int fd, struct epoll_event* ev, int max, int timeout, const sigset_t* ss) {
  unsigned long long k = 0;   // the kernel's sigset is 64 bits, bionic arm32's 32
  if (ss) memcpy(&k, ss, sizeof *ss);
  return syscall(__NR_epoll_pwait, fd, ev, max, timeout, ss ? &k : NULL, sizeof k);
}
int inotify_init1(int flags) { return syscall(__NR_inotify_init1, flags); }
int recvmmsg(int fd, struct mmsghdr* m, unsigned int n, int flags, const struct timespec* t) { return syscall(__NR_recvmmsg, fd, m, n, flags, t); }
int sendmmsg(int fd, const struct mmsghdr* m, unsigned int n, int flags) { return syscall(__NR_sendmmsg, fd, m, n, flags); }
ssize_t sendfile64(int out, int in, off64_t* off, size_t count) { return syscall(__NR_sendfile64, out, in, off, count); }
// ponytail: right for the calling thread only (4.4 has no public way to read another thread's tid)
pid_t pthread_gettid_np(pthread_t t) { (void)t; return (pid_t)syscall(__NR_gettid); }

// inline in the headers before API 21
struct cmsghdr* __cmsg_nxthdr(struct msghdr* msg, struct cmsghdr* cmsg) {
  struct cmsghdr* p = (struct cmsghdr*)((char*)cmsg + CMSG_ALIGN(cmsg->cmsg_len));
  return (size_t)((char*)(p + 1) - (char*)msg->msg_control) > msg->msg_controllen ? NULL : p;
}
size_t __ctype_get_mb_cur_max(void) { return 1; }
ssize_t __read_chk(int fd, void* buf, size_t count, size_t size) { if (count > size) abort(); return read(fd, buf, count); }
void _Exit(int status) { _exit(status); }
void android_set_abort_message(const char* msg) { (void)msg; }
int getpagesize(void) { return (int)sysconf(_SC_PAGESIZE); }
int rand(void) { return (int)(lrand48() & 0x7fffffff); }
double atof(const char* s) { return strtod(s, NULL); }
float strtof(const char* s, char** end) { return (float)strtod(s, end); }
long double strtold(const char* s, char** end) { return strtod(s, end); }   // long double is double on arm32
float wcstof(const wchar_t* s, wchar_t** end) { return (float)wcstod(s, end); }
long double wcstold(const wchar_t* s, wchar_t** end) { return wcstod(s, end); }
static long long wide_strtoll(const wchar_t* s, wchar_t** end, int base, int is_unsigned) {
  char buf[128], *e;
  size_t i = 0;
  for (; i < sizeof buf - 1 && s[i] > 0 && s[i] < 128; i++) buf[i] = (char)s[i];
  buf[i] = 0;
  long long r = is_unsigned ? (long long)strtoull(buf, &e, base) : strtoll(buf, &e, base);
  if (end) *end = (wchar_t*)s + (e - buf);
  return r;
}
long long wcstoll(const wchar_t* s, wchar_t** end, int base) { return wide_strtoll(s, end, base, 0); }
unsigned long long wcstoull(const wchar_t* s, wchar_t** end, int base) { return (unsigned long long)wide_strtoll(s, end, base, 1); }

// signals: sigset_t is one unsigned long on arm32
int sigemptyset(sigset_t* s) { if (!s) { errno = EINVAL; return -1; } memset(s, 0, sizeof *s); return 0; }
int sigfillset(sigset_t* s) { if (!s) { errno = EINVAL; return -1; } memset(s, 0xff, sizeof *s); return 0; }
static int sigbit(sigset_t* s, int n, int on) {
  unsigned b = (unsigned)n - 1;
  if (!s || b >= 8 * sizeof *s) { errno = EINVAL; return -1; }
  unsigned long* w = (unsigned long*)s + b / LONG_BIT;
  if (on) *w |= 1UL << (b % LONG_BIT); else *w &= ~(1UL << (b % LONG_BIT));
  return 0;
}
int sigaddset(sigset_t* s, int n) { return sigbit(s, n, 1); }
int sigdelset(sigset_t* s, int n) { return sigbit(s, n, 0); }
sighandler_t signal(int n, sighandler_t h) {
  struct sigaction sa, old;
  memset(&sa, 0, sizeof sa);
  sa.sa_handler = h;
  sa.sa_flags = SA_RESTART;
  return sigaction(n, &sa, &old) < 0 ? SIG_ERR : old.sa_handler;
}

// ponytail: timed waits on a libuv condition then run on CLOCK_REALTIME; 4.4 only has pthread_cond_timedwait_monotonic_np
int pthread_condattr_setclock(pthread_condattr_t* a, clockid_t c) { (void)a; (void)c; return 0; }

// locales: 4.4 has only "C"; every locale is that one
static char the_locale;
locale_t newlocale(int mask, const char* name, locale_t base) { (void)mask; (void)name; return base ? base : (locale_t)&the_locale; }
void freelocale(locale_t l) { (void)l; }
locale_t uselocale(locale_t l) { (void)l; return LC_GLOBAL_LOCALE; }
struct lconv* localeconv(void) {
  static struct lconv c = {.decimal_point = ".", .thousands_sep = "", .grouping = "", .int_curr_symbol = "", .currency_symbol = "",
                           .mon_decimal_point = "", .mon_thousands_sep = "", .mon_grouping = "", .positive_sign = "", .negative_sign = ""};
  return &c;
}
int iswalpha_l(wint_t c, locale_t l) { (void)l; return iswalpha(c); }
int iswblank_l(wint_t c, locale_t l) { (void)l; return c == L' ' || c == L'\t'; }
int iswcntrl_l(wint_t c, locale_t l) { (void)l; return iswcntrl(c); }
int iswdigit_l(wint_t c, locale_t l) { (void)l; return iswdigit(c); }
int iswlower_l(wint_t c, locale_t l) { (void)l; return iswlower(c); }
int iswprint_l(wint_t c, locale_t l) { (void)l; return iswprint(c); }
int iswpunct_l(wint_t c, locale_t l) { (void)l; return iswpunct(c); }
int iswspace_l(wint_t c, locale_t l) { (void)l; return iswspace(c); }
int iswupper_l(wint_t c, locale_t l) { (void)l; return iswupper(c); }
int iswxdigit_l(wint_t c, locale_t l) { (void)l; return iswxdigit(c); }
wint_t towlower_l(wint_t c, locale_t l) { (void)l; return towlower(c); }
wint_t towupper_l(wint_t c, locale_t l) { (void)l; return towupper(c); }
int strcoll_l(const char* a, const char* b, locale_t l) { (void)l; return strcoll(a, b); }
size_t strxfrm_l(char* d, const char* s, size_t n, locale_t l) { (void)l; return strxfrm(d, s, n); }
size_t strftime_l(char* d, size_t n, const char* f, const struct tm* t, locale_t l) { (void)l; return strftime(d, n, f, t); }
long double strtold_l(const char* s, char** e, locale_t l) { (void)l; return strtold(s, e); }
long long strtoll_l(const char* s, char** e, int b, locale_t l) { (void)l; return strtoll(s, e, b); }
unsigned long long strtoull_l(const char* s, char** e, int b, locale_t l) { (void)l; return strtoull(s, e, b); }
int wcscoll_l(const wchar_t* a, const wchar_t* b, locale_t l) { (void)l; return wcscoll(a, b); }
size_t wcsxfrm_l(wchar_t* d, const wchar_t* s, size_t n, locale_t l) { (void)l; return wcsxfrm(d, s, n); }

// multibyte
int mbtowc(wchar_t* pwc, const char* s, size_t n) {
  static mbstate_t st;
  if (!s) return 0;
  size_t r = mbrtowc(pwc, s, n, &st);
  return r == (size_t)-1 || r == (size_t)-2 ? -1 : (int)r;
}
size_t mbsnrtowcs(wchar_t* dst, const char** src, size_t nms, size_t len, mbstate_t* ps) {
  static mbstate_t st;
  if (!ps) ps = &st;
  const char* s = *src;
  size_t n = 0;
  while (nms > 0 && (!dst || n < len)) {
    wchar_t wc;
    size_t r = mbrtowc(&wc, s, nms, ps);
    if (r == (size_t)-1) { if (dst) *src = s; return (size_t)-1; }
    if (r == (size_t)-2) break;
    if (r == 0) { if (dst) { dst[n] = 0; *src = NULL; } return n; }
    if (dst) dst[n] = wc;
    s += r; nms -= r; n++;
  }
  if (dst) *src = s;
  return n;
}
size_t wcsnrtombs(char* dst, const wchar_t** src, size_t nwc, size_t len, mbstate_t* ps) {
  static mbstate_t st;
  if (!ps) ps = &st;
  const wchar_t* s = *src;
  size_t n = 0;
  char buf[MB_LEN_MAX];
  for (; nwc > 0; s++, nwc--) {
    size_t r = wcrtomb(buf, *s, ps);
    if (r == (size_t)-1) { if (dst) *src = s; return (size_t)-1; }
    if (dst) { if (n + r > len) break; memcpy(dst + n, buf, r); }
    if (*s == 0) { if (dst) *src = NULL; return n; }
    n += r;
  }
  if (dst) *src = s;
  return n;
}

// referenced weakly; defined here so a call never jumps to address 0
FILE* fopen64(const char* p, const char* m) { return fopen(p, m); }
int fseeko64(FILE* f, off64_t o, int w) { return fseeko(f, (off_t)o, w); }
off64_t ftello64(FILE* f) { return ftello(f); }
int getifaddrs(struct ifaddrs** a) { *a = NULL; errno = ENOSYS; return -1; }
void freeifaddrs(struct ifaddrs* a) { (void)a; }
iconv_t iconv_open(const char* to, const char* from) { (void)to; (void)from; errno = EINVAL; return (iconv_t)-1; }
size_t iconv(iconv_t c, char** in, size_t* inl, char** out, size_t* outl) { (void)c; (void)in; (void)inl; (void)out; (void)outl; errno = EBADF; return (size_t)-1; }
int iconv_close(iconv_t c) { (void)c; return 0; }
