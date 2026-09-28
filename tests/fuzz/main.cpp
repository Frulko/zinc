// Standalone driver for compilers without libFuzzer: runs every file given (or every file in a directory given)
// through LLVMFuzzerTestOneInput once. scripts/fuzz.sh --replay uses it to check the corpora (regressions).
#include <dirent.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* d, size_t n);

static int run_file(const char* path) {
  FILE* f = fopen(path, "rb");
  if (!f) { fprintf(stderr, "cannot open %s\n", path); return 1; }
  fseek(f, 0, SEEK_END);
  long n = ftell(f);
  fseek(f, 0, SEEK_SET);
  uint8_t* b = (uint8_t*)malloc(n > 0 ? (size_t)n : 1);
  size_t got = fread(b, 1, (size_t)(n > 0 ? n : 0), f);
  fclose(f);
  LLVMFuzzerTestOneInput(b, got);
  free(b);
  return 0;
}

int main(int argc, char** argv) {
  int files = 0;
  for (int i = 1; i < argc; i++) {
    struct stat st;
    if (argv[i][0] == '-' || stat(argv[i], &st)) continue;  // libFuzzer-style flags are ignored
    if (!S_ISDIR(st.st_mode)) { run_file(argv[i]); files++; continue; }
    DIR* d = opendir(argv[i]);
    while (struct dirent* e = d ? readdir(d) : nullptr) {
      if (e->d_name[0] == '.') continue;
      char p[4096];
      snprintf(p, sizeof p, "%s/%s", argv[i], e->d_name);
      run_file(p);
      files++;
    }
    if (d) closedir(d);
  }
  printf("replayed %d input(s)\n", files);
  return 0;
}
