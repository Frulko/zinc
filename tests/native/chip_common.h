// Shared by the chip model tests (ZN-127): a tee that records every write a driver makes (the captured stream) before the model sees it, golden files and mutation of a stream.
#pragma once
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "hw.h"

struct Tee {
  zn_hw_model inner;
  std::vector<std::vector<uint8_t>> log;
  static int write(void* u, const uint8_t* d, int n) { Tee* t = (Tee*)u; t->log.emplace_back(d, d + n); return t->inner.write(t->inner.user, d, n); }
  static int read(void* u, uint8_t r, uint8_t* o, int n) { Tee* t = (Tee*)u; return t->inner.read ? t->inner.read(t->inner.user, r, o, n) : 0; }
  zn_hw_model model() { return {write, inner.read ? read : nullptr, this}; }
};

static std::string slurp(const char* path) { std::ifstream in(path, std::ios::binary); std::stringstream ss; ss << in.rdbuf(); return ss.str(); }

/** The golden at `path` equals `got`; with ZN_UPDATE_GOLDEN=1 the file is written instead. */
static bool matchesGolden(const char* path, const std::string& got) {
  if (getenv("ZN_UPDATE_GOLDEN")) { std::ofstream(path, std::ios::binary) << got; return true; }
  std::string want = slurp(path);
  if (want == got) return true;
  fprintf(stderr, "differs from %s:\n%s\n", path, got.c_str());
  return false;
}
#define CHECK(c) do { if (!(c)) { fprintf(stderr, "%s:%d: check failed: %s\n", __FILE__, __LINE__, #c); return 1; } } while (0)
