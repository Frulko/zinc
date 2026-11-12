#include "host/fs_lock.h"
#include "zn/runtime.h"
#include <cassert>
#include <cstdio>
#include <fstream>
#include <thread>
#ifndef _WIN32
#include <csignal>
#include <sys/wait.h>
#endif
using namespace zn::host::fslock;
static_assert(zn::isSysTailRow(zn::Rt::HostFsTryLock) && zn::isSysRow(zn::Rt::HostFsUnlock));
static_assert(static_cast<unsigned>(zn::Rt::HostFsUnlock) + 1 == static_cast<unsigned>(zn::Rt::Count));
int main(int argc, char** argv) {
  assert(argc == 2);
  const std::string path = std::string(argv[1]) + "/held.lock", other = path + ".other";
  { std::ofstream out(path); out << "preserved"; }
  std::int32_t first = 0, token = 0;
  assert(acquire(path, first) == 0 && first > 0);
  assert(acquire(path, token) == 0 && token == 0);
  assert(acquire(other, token) == 0 && token > first);
  assert(release(token) == 0 && release(token) == EBADF);
  std::thread worker([&] {
    std::int32_t own = 0;
    assert(release(first) == EBADF);
    assert(acquire(path, own) == 0 && own == 0);
    assert(acquire(other, own) == 0 && own > 0);
    // The thread intentionally leaves its acquisition to its TLS RAII owner.
  });
  worker.join();
  assert(acquire(other, token) == 0 && token > 0);
  assert(release(token) == 0);
  assert(release(first) == 0);
  assert(acquire(path, token) == 0 && token > first);
  assert(release(first) == EBADF);
  std::int32_t contended = -1;
  assert(acquire(path, contended) == 0 && contended == 0);
  assert(release(token) == 0);
  { std::ifstream in(path); std::string text; in >> text; assert(text == "preserved"); }
#ifndef _WIN32
  assert(link(path.c_str(), (path + ".alias").c_str()) == 0);
  assert(acquire(path, first) == 0 && first > 0);
  assert(acquire(path + ".alias", token) == 0 && token == 0);
  assert(release(first) == 0);
  int ready[2]; assert(pipe(ready) == 0);
  const pid_t child = fork(); assert(child >= 0);
  if (!child) {
    close(ready[0]);
    std::int32_t own = 0;
    if (acquire(path, own) != 0 || own <= 0) _exit(2);
    if (write(ready[1], "x", 1) != 1) _exit(3);
    for (;;) pause();
  }
  close(ready[1]); char byte = 0;
  assert(read(ready[0], &byte, 1) == 1 && byte == 'x'); close(ready[0]);
  assert(acquire(path, token) == 0 && token == 0);
  assert(kill(child, SIGKILL) == 0);
  int status = 0; assert(waitpid(child, &status, 0) == child && WIFSIGNALED(status));
  assert(acquire(path, token) == 0 && token > 0); assert(release(token) == 0);
  assert(symlink(path.c_str(), other.c_str()) == -1 && errno == EEXIST);
  assert(unlink(other.c_str()) == 0 && symlink(path.c_str(), other.c_str()) == 0);
  assert(acquire(other, token) == ELOOP && token == 0);
  assert(acquire(argv[1], token) != 0 && token == 0);
#endif
  nextToken.store(INT32_MAX);
  assert(acquire(path, token) == 0 && token == INT32_MAX);
  assert(release(token) == 0);
  assert(acquire(path, token) == EMFILE && token == 0);
  std::puts("owned filesystem locks: pass");
}
