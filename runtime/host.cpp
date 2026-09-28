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

// Number.prototype.toFixed for finite |v| < 1e21 (zrt::to_fixed handles the rest). printf rounds an exact tie to even;
// JS takes the larger magnitude: (2.5).toFixed(0) is "3", (0.125).toFixed(2) "0.13". Ties are found on the exact
// decimal expansion (a double has at most 1074 fractional digits), so inexact values such as 1.005 keep printf's result.
extern "C" int zrt_host_fixed(double v, int digits, char* out, int cap) {
  if (digits < 0) digits = 0;
  if (digits > 100) digits = 100;
  int n = snprintf(out, (size_t)cap, "%.*f", digits, v);
  if (n >= cap) return cap - 1;
  double m = v < 0 ? -v : v, p = 1;
  for (int i = 0; i < digits && i < 22; i++) p *= 10;
  double y = m * p;  // an exact tie gives exactly k + 0.5 here (a false positive only costs the exact check below)
  if (digits <= 22 && y < 4503599627370496.0 && y - (double)(long long)y != 0.5) return n;
  static char ex[1100];
  int en = snprintf(ex, sizeof ex, "%.1074f", m);
  if (en <= 0 || en >= (int)sizeof ex) return n;
  const char* dot = strchr(ex, '.');
  const char* d = dot + 1 + digits;
  if (*d != '5') return n;
  for (const char* q = d + 1; *q; q++) if (*q != '0') return n;
  // exact tie: the truncated magnitude plus one unit in the last place
  int keep = (int)(digits ? d - ex : dot - ex), len = 0;
  if (keep + 3 > cap) return n;
  if (v < 0) out[len++] = '-';
  out[len] = '0';  // room for a carry out of the first digit
  __builtin_memcpy(out + len + 1, ex, (size_t)keep);
  int i = len + keep;
  for (; i > len; i--) {
    if (out[i] == '.') continue;
    if (out[i] != '9') { out[i]++; break; }
    out[i] = '0';
  }
  if (i > len) __builtin_memmove(out + len, out + len + 1, (size_t)keep);
  else { out[len] = '1'; keep++; }  // 9.5 -> 10
  len += keep;
  out[len] = 0;
  return len;
}

// Files for frame captures and input tapes (ZINC_SHOT, ZINC_RECORD / ZINC_REPLAY): stdio where the target has it.
extern "C" void* zrt_host_open(const char* path, const char* mode) { return fopen(path, mode); }
extern "C" size_t zrt_host_io(void* f, void* p, size_t n, int write) { return write ? fwrite(p, 1, n, (FILE*)f) : fread(p, 1, n, (FILE*)f); }
extern "C" void zrt_host_close(void* f) { fclose((FILE*)f); }
