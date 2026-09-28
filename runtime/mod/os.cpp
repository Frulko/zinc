// zinc:os — machine information on POSIX hosts (macos, linux, rpi1, rmpp); same shapes as Node's os module.
#include "zrt.h"
#include "mod/os.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <pwd.h>
#include <sys/utsname.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <net/if.h>
#include <ifaddrs.h>
#ifdef __APPLE__
#include <sys/sysctl.h>
#include <net/if_dl.h>
#include <mach/mach.h>
#include <time.h>
#else
#include <sys/sysinfo.h>
#include <netpacket/packet.h>
#endif

namespace zrt { namespace os {
static String str(const char* s) { return String::from(s, (uint32_t)strlen(s)); }
String hostname() { char b[256]; if (gethostname(b, sizeof b) != 0) return String(); b[255] = 0; return str(b); }
String homedir() {
  const char* h = getenv("HOME");
  if (h && *h) return str(h);
  struct passwd* pw = getpwuid(getuid());
  return pw && pw->pw_dir ? str(pw->pw_dir) : String();
}
String tmpdir() {
  const char* t = getenv("TMPDIR");
  if (!t || !*t) t = getenv("TMP");
  if (!t || !*t) t = getenv("TEMP");
  if (!t || !*t) t = "/tmp";
  size_t n = strlen(t);
  while (n > 1 && t[n - 1] == '/') n--;
  return String::from(t, (uint32_t)n);
}
String arch() {
#if defined(__aarch64__)
  return str("arm64");
#elif defined(__x86_64__)
  return str("x64");
#elif defined(__arm__)
  return str("arm");
#elif defined(__i386__)
  return str("ia32");
#elif defined(__riscv)
  return str("riscv64");
#else
  return str("unknown");
#endif
}
String type() { struct utsname u; return uname(&u) == 0 ? str(u.sysname) : String(); }
String release() { struct utsname u; return uname(&u) == 0 ? str(u.release) : String(); }
double uptime() {
#ifdef __APPLE__
  struct timeval boot; size_t n = sizeof boot; int mib[2] = {CTL_KERN, KERN_BOOTTIME};
  if (sysctl(mib, 2, &boot, &n, nullptr, 0) != 0) return 0;
  return (double)(time(nullptr) - boot.tv_sec);
#else
  struct sysinfo si; return sysinfo(&si) == 0 ? (double)si.uptime : 0;
#endif
}
Array<double> loadavg() {
  double l[3] = {0, 0, 0};
  if (getloadavg(l, 3) < 0) l[0] = l[1] = l[2] = 0;
  return Array<double>::of(l[0], l[1], l[2]);
}
double totalmem() {
#ifdef __APPLE__
  uint64_t m = 0; size_t n = sizeof m;
  return sysctlbyname("hw.memsize", &m, &n, nullptr, 0) == 0 ? (double)m : 0;
#else
  struct sysinfo si; return sysinfo(&si) == 0 ? (double)si.totalram * si.mem_unit : 0;
#endif
}
double freemem() {
#ifdef __APPLE__
  vm_statistics64_data_t vm; mach_msg_type_number_t cnt = HOST_VM_INFO64_COUNT;
  if (host_statistics64(mach_host_self(), HOST_VM_INFO64, (host_info64_t)&vm, &cnt) != KERN_SUCCESS) return 0;
  return (double)vm.free_count * (double)sysconf(_SC_PAGESIZE);
#else
  // MemAvailable, like libuv
  if (FILE* f = fopen("/proc/meminfo", "r")) {
    char line[256]; double kb = -1;
    while (fgets(line, sizeof line, f)) if (!strncmp(line, "MemAvailable:", 13)) { kb = atof(line + 13); break; }
    fclose(f);
    if (kb >= 0) return kb * 1024;
  }
  struct sysinfo si; return sysinfo(&si) == 0 ? (double)si.freeram * si.mem_unit : 0;
#endif
}
int32_t availableParallelism() { long n = sysconf(_SC_NPROCESSORS_ONLN); return n > 0 ? (int32_t)n : 1; }
Array<Ref<CpuInfo>> cpus() {
  Array<Ref<CpuInfo>> r = Array<Ref<CpuInfo>>::with_cap(0);
  String model; double speed = 0;
#ifdef __APPLE__
  char b[256]; size_t n = sizeof b;
  if (sysctlbyname("machdep.cpu.brand_string", b, &n, nullptr, 0) == 0) model = str(b);
  uint64_t hz = 0; n = sizeof hz;
  if (sysctlbyname("hw.cpufrequency", &hz, &n, nullptr, 0) == 0) speed = (double)(hz / 1000000);
#else
  if (FILE* f = fopen("/proc/cpuinfo", "r")) {
    char line[512];
    while (fgets(line, sizeof line, f)) {
      const char* c = strchr(line, ':');
      if (!c) continue;
      if (!model.bytes() && (!strncmp(line, "model name", 10) || !strncmp(line, "Model", 5) || !strncmp(line, "Processor", 9))) {
        c++; while (*c == ' ' || *c == '\t') c++;
        size_t k = strlen(c); while (k && (c[k - 1] == '\n' || c[k - 1] == ' ')) k--;
        model = String::from(c, (uint32_t)k);
      }
      if (speed == 0 && !strncmp(line, "cpu MHz", 7)) speed = (double)(int64_t)atof(c + 1);
    }
    fclose(f);
  }
#endif
  for (int32_t i = 0; i < availableParallelism(); i++) { auto c = make<CpuInfo>(); c->model = model; c->speed = speed; r.push(c); }
  return r;
}
Array<Ref<NetworkInterface>> networkInterfaces() {
  Array<Ref<NetworkInterface>> r = Array<Ref<NetworkInterface>>::with_cap(0);
  struct ifaddrs* all = nullptr;
  if (getifaddrs(&all) != 0) return r;
  for (struct ifaddrs* a = all; a; a = a->ifa_next) {
    if (!a->ifa_addr || !(a->ifa_flags & IFF_UP) || !(a->ifa_flags & IFF_RUNNING)) continue;
    int fam = a->ifa_addr->sa_family;
    if (fam != AF_INET && fam != AF_INET6) continue;
    auto n = make<NetworkInterface>();
    char buf[INET6_ADDRSTRLEN] = {0};
    const void* ad = fam == AF_INET ? (const void*)&((sockaddr_in*)a->ifa_addr)->sin_addr : (const void*)&((sockaddr_in6*)a->ifa_addr)->sin6_addr;
    inet_ntop(fam, ad, buf, sizeof buf); n->address = str(buf);
    buf[0] = 0;
    if (a->ifa_netmask) {
      const void* nm = fam == AF_INET ? (const void*)&((sockaddr_in*)a->ifa_netmask)->sin_addr : (const void*)&((sockaddr_in6*)a->ifa_netmask)->sin6_addr;
      inet_ntop(fam, nm, buf, sizeof buf);
    }
    n->netmask = str(buf);
    n->name = str(a->ifa_name);
    n->family = str(fam == AF_INET ? "IPv4" : "IPv6");
    n->internal = (a->ifa_flags & IFF_LOOPBACK) != 0;
    n->mac = str("00:00:00:00:00:00");
    for (struct ifaddrs* l = all; l; l = l->ifa_next) {  // the link-layer entry of the same interface
      if (!l->ifa_addr || strcmp(l->ifa_name, a->ifa_name)) continue;
#ifdef __APPLE__
      if (l->ifa_addr->sa_family != AF_LINK) continue;
      const struct sockaddr_dl* dl = (const struct sockaddr_dl*)l->ifa_addr;
      if (dl->sdl_alen != 6) continue;
      const unsigned char* m = (const unsigned char*)LLADDR(dl);
#else
      if (l->ifa_addr->sa_family != AF_PACKET) continue;
      const struct sockaddr_ll* ll = (const struct sockaddr_ll*)l->ifa_addr;
      if (ll->sll_halen != 6) continue;
      const unsigned char* m = ll->sll_addr;
#endif
      char mac[18]; snprintf(mac, sizeof mac, "%02x:%02x:%02x:%02x:%02x:%02x", m[0], m[1], m[2], m[3], m[4], m[5]);
      n->mac = str(mac);
      break;
    }
    r.push(n);
  }
  freeifaddrs(all);
  return r;
}
Ref<UserInfo> userInfo() {
  auto u = make<UserInfo>();
  u->uid = (int32_t)getuid(); u->gid = (int32_t)getgid();
  if (struct passwd* pw = getpwuid(getuid())) {
    u->username = str(pw->pw_name ? pw->pw_name : "");
    u->shell = str(pw->pw_shell ? pw->pw_shell : "");
    u->homedir = str(pw->pw_dir ? pw->pw_dir : "");
  }
  return u;
}
}}
