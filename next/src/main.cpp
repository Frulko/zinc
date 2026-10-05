#include <cstdio>
#include <cstring>

int main(int argc, char** argv) {
  if (argc == 2 && !std::strcmp(argv[1], "--version")) {
    std::puts("zinc-next 0.0.1");
    return 0;
  }
  std::fputs("usage: zinc --version\n", stderr);
  return 2;
}
