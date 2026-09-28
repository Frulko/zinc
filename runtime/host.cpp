// Host libc helpers for number formatting/parsing (hosted targets only).
// ponytail: libc snprintf/strtod; a freestanding Ryu port is needed for ps1/esp32 (docs/decisions/0003).
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

extern "C" int zrt_host_shortest(double v, char* digits, int* exp10) {
  char buf[40];
  for (int p = 1; p <= 17; p++) {
    snprintf(buf, sizeof buf, "%.*e", p - 1, v);
    if (strtod(buf, nullptr) == v || p == 17) break;
  }
  // buf = d[.ddd]e[+-]XX
  int k = 0; const char* s = buf;
  for (; *s && *s != 'e'; s++) if (*s != '.') digits[k++] = *s;
  *exp10 = atoi(s + 1);
  while (k > 1 && digits[k - 1] == '0') k--;
  return k;
}

extern "C" double zrt_host_strtod(const char* s, int* consumed) {
  char* end;
  double v = strtod(s, &end);
  *consumed = (int)(end - s);
  return v;
}

extern "C" int zrt_host_fixed(double v, int digits, char* out, int cap) {
  int n = snprintf(out, (size_t)cap, "%.*f", digits < 0 ? 0 : digits > 100 ? 100 : digits, v);
  return n < cap ? n : cap - 1;
}

// Files for frame captures and input tapes (ZINC_SHOT, ZINC_RECORD / ZINC_REPLAY): stdio where the target has it.
extern "C" void* zrt_host_open(const char* path, const char* mode) { return fopen(path, mode); }
extern "C" size_t zrt_host_io(void* f, void* p, size_t n, int write) { return write ? fwrite(p, 1, n, (FILE*)f) : fread(p, 1, n, (FILE*)f); }
extern "C" void zrt_host_close(void* f) { fclose((FILE*)f); }
