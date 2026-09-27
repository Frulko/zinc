// zrt — non-template parts of the runtime.
#include "zrt.h"

// Provided by runtime/host.cpp (libc-backed number formatting). ponytail: replace with Ryu for freestanding targets.
extern "C" int zrt_host_shortest(double v, char* digits, int* exp10);
extern "C" double zrt_host_strtod(const char* s, int* consumed);
extern "C" int zrt_host_fixed(double v, int digits, char* out, int cap);

namespace zrt {

uint32_t live_objects = 0;
uint32_t alloc_count = 0;

// ---------- heap (MEM-10): TLSF over hal_heap_region, O(1) malloc/free ----------
// ponytail: debug builds use the system allocator so ASan/UBSan see every block.
namespace tlsf {
static const size_t ALIGN = 2 * sizeof(void*), HDR = 2 * sizeof(size_t);
static const int SL_LOG = 4, SL_N = 1 << SL_LOG, FL_SHIFT = SL_LOG + (sizeof(void*) == 8 ? 4 : 3), FL_N = 26;
static const size_t SMALL = (size_t)1 << FL_SHIFT;
struct Block { Block* prev_phys; size_t size; Block* next_free; Block* prev_free; };  // size: payload bytes | 1 free | 2 prev free
static uint32_t fl_map;
static uint32_t sl_map[FL_N];
static Block* heads[FL_N][SL_N];
static char *lo, *hi;
static size_t budget;
static inline size_t bsize(Block* b) { return b->size & ~(size_t)3; }
static inline void* payload(Block* b) { return (char*)b + HDR; }
static inline Block* of(void* p) { return (Block*)((char*)p - HDR); }
static inline Block* next(Block* b) { return (Block*)((char*)payload(b) + bsize(b)); }
static inline int msb(size_t v) { return (int)(sizeof(size_t) * 8 - 1) - (sizeof(size_t) == 8 ? __builtin_clzll((unsigned long long)v) : __builtin_clz((unsigned)v)); }
static void mapping(size_t n, int* fl, int* sl) {
  if (n < SMALL) { *fl = 0; *sl = (int)(n / (SMALL / SL_N)); return; }
  int m = msb(n);
  *sl = (int)(n >> (m - SL_LOG)) ^ SL_N;
  *fl = m - (FL_SHIFT - 1);
}
static void insert(Block* b) {
  int fl, sl; mapping(bsize(b), &fl, &sl);
  b->prev_free = nullptr; b->next_free = heads[fl][sl];
  if (b->next_free) b->next_free->prev_free = b;
  heads[fl][sl] = b; fl_map |= 1u << fl; sl_map[fl] |= 1u << sl;
}
static void remove(Block* b) {
  int fl, sl; mapping(bsize(b), &fl, &sl);
  if (b->prev_free) b->prev_free->next_free = b->next_free; else heads[fl][sl] = b->next_free;
  if (b->next_free) b->next_free->prev_free = b->prev_free;
  if (!heads[fl][sl]) { sl_map[fl] &= ~(1u << sl); if (!sl_map[fl]) fl_map &= ~(1u << fl); }
}
static Block* find(size_t n) {
  if (n >= SMALL) n += ((size_t)1 << (msb(n) - SL_LOG)) - 1;
  int fl, sl; mapping(n, &fl, &sl);
  if (fl >= FL_N) return nullptr;
  uint32_t m = sl_map[fl] & (~0u << sl);
  if (!m) {
    uint32_t f = fl + 1 < 32 ? fl_map & (~0u << (fl + 1)) : 0;
    if (!f) return nullptr;
    fl = __builtin_ctz(f); m = sl_map[fl];
  }
  return heads[fl][__builtin_ctz(m)];
}
static void init() {
  void* base; size_t size;
  hal_heap_region(&base, &size);
  uintptr_t a = ((uintptr_t)base + ALIGN - 1) & ~(uintptr_t)(ALIGN - 1);
  size -= a - (uintptr_t)base;
  size &= ~(ALIGN - 1);
  lo = (char*)a; hi = lo + size; budget = size;
  Block* b = (Block*)lo;
  b->prev_phys = nullptr; b->size = (size - 2 * HDR) | 1;
  Block* sentinel = next(b);
  sentinel->prev_phys = b; sentinel->size = 0 | 2;  // used, prev free
  insert(b);
}
[[maybe_unused]] static void* malloc(size_t n) {
  if (!lo) init();
  n = (n + ALIGN - 1) & ~(ALIGN - 1);
  if (n < 2 * sizeof(void*)) n = 2 * sizeof(void*);
  Block* b = find(n);
  if (!b) return nullptr;
  remove(b);
  size_t total = bsize(b);
  if (total >= n + HDR + ALIGN) {
    Block* r = (Block*)((char*)payload(b) + n);
    r->prev_phys = b; r->size = (total - n - HDR) | 1;
    next(r)->prev_phys = r; next(r)->size |= 2;
    b->size = n | (b->size & 2);
    insert(r);
  } else {
    b->size &= ~(size_t)1;
    next(b)->size &= ~(size_t)2;
  }
  return payload(b);
}
[[maybe_unused]] static void free(void* p) {
  Block* b = of(p);
  b->size |= 1;
  Block* nx = next(b);
  if (nx->size & 1) { remove(nx); b->size = (bsize(b) + HDR + bsize(nx)) | 1 | (b->size & 2); nx = next(b); nx->prev_phys = b; }
  if (b->size & 2) { Block* pv = b->prev_phys; remove(pv); pv->size = (bsize(pv) + HDR + bsize(b)) | 1 | (pv->size & 2); b = pv; nx = next(b); nx->prev_phys = b; }
  nx->size |= 2;
  insert(b);
}
[[maybe_unused]] static bool owns(const void* p) { return (const char*)p >= lo && (const char*)p < hi; }
}

void* alloc(size_t n) {
#ifdef ZRT_DEBUG
  void* p = hal_alloc(n ? n : 1);
#else
  void* p = tlsf::malloc(n ? n : 1);
#endif
  if (!p) {
    StrBuilder sb; sb.cstr("out of memory (heap budget "); to_s(sb, (int64_t)tlsf::budget); sb.cstr(" bytes)");
    panic(sb.build().ptr());
  }
  alloc_count++;
  return p;
}
void mfree(void* p) {
  if (!p || arena_owns(p)) return;
#ifdef ZRT_DEBUG
  hal_free(p);
#else
  if (tlsf::owns(p)) tlsf::free(p); else hal_free(p);
#endif
}

void panic(const char* msg) { hal_panic(msg, "", 0); }
void panic_at(const char* msg, const char* file, int line) { hal_panic(msg, file, line); }

Ref<Error> g_err;
Stats stats;
void Object::zrt_json(StrBuilder& sb) const { sb.cstr("{}"); }
void Object::zrt_str(StrBuilder& sb) const { sb.cstr("[object Object]"); }
void Object::zrt_delete() { this->~Object(); mfree(this); }

// MEM-12: a release cascade deeper than 256 objects is finished in slices (next allocation or frame end).
static const int MAX_CASCADE = 256, DEFER_CAP = 4096;
static int cascade_depth = 0;
static Object* deferred[DEFER_CAP];
static int deferred_n = 0;
static void destroy_now(Object* o) {
  o->rc = 0;
  live_objects--;
  if (arena_owns(o)) { arena_forget(o); o->~Object(); return; }
  if (o->wc) o->~Object(); else o->zrt_delete();
}
void destroy(Object* o) {
  if (cascade_depth >= MAX_CASCADE && deferred_n < DEFER_CAP) { deferred[deferred_n++] = o; return; }
  cascade_depth++;
  destroy_now(o);
  cascade_depth--;
}
static void drain_deferred() {
  while (deferred_n && cascade_depth == 0) { Object* o = deferred[--deferred_n]; cascade_depth++; destroy_now(o); cascade_depth--; }
}

// ---------- strings ----------

static StrObj* str_alloc(uint32_t n) {
  StrObj* s = (StrObj*)alloc(sizeof(StrObj) + n + 1);
  live_objects++;
  char* d = (char*)(s + 1);
  d[n] = 0;
  s->rc = 1; s->len = n; s->u16len = 0; s->ascii = 1; s->data = d; s->owner = nullptr;
  return s;
}
static void str_measure(StrObj* s) {
  int32_t u = 0; uint32_t ascii = 1;
  for (uint32_t i = 0; i < s->len; i++) {
    uint8_t c = (uint8_t)s->data[i];
    if (c >= 0x80) ascii = 0;
    if ((c & 0xC0) != 0x80) u += (c >= 0xF0) ? 2 : 1;
  }
  s->u16len = u; s->ascii = ascii;
}
void str_destroy(StrObj* s) { srelease(s->owner); mfree(s); live_objects--; }

String String::from(const char* p, uint32_t n) {
  if (!n) return String();
  StrObj* s = str_alloc(n);
  __builtin_memcpy((char*)s->data, p, n);
  str_measure(s);
  return adopt(s);
}

// UTF-16 index -> byte offset (R-11: O(1) when ASCII)
static uint32_t u16_to_byte(const String& s, int32_t idx) {
  if (s.is_ascii()) return (uint32_t)idx;
  const uint8_t* d = (const uint8_t*)s.ptr();
  uint32_t b = 0, n = s.bytes(); int32_t u = 0;
  while (b < n && u < idx) {
    uint8_t c = d[b];
    uint32_t w = c < 0x80 ? 1 : c < 0xE0 ? 2 : c < 0xF0 ? 3 : 4;
    u += (w == 4) ? 2 : 1; b += w;
  }
  return b > n ? n : b;
}
static String sub_bytes(const String& s, uint32_t b0, uint32_t b1) {
  if (b1 <= b0) return String();
  if (b0 == 0 && b1 == s.bytes()) return s;
  // MEM-20: the slice shares the parent buffer; the root owner stays counted.
  StrObj* root = s.s->owner ? s.s->owner : s.s;
  StrObj* r = (StrObj*)alloc(sizeof(StrObj));
  live_objects++;
  r->rc = 1; r->len = b1 - b0; r->data = s.s->data + b0; r->owner = root; sretain(root);
  str_measure(r);
  return String::adopt(r);
}

static uint32_t decode(const uint8_t* d, uint32_t n, uint32_t b, uint32_t* w) {
  uint8_t c = d[b];
  if (c < 0x80) { *w = 1; return c; }
  if (c < 0xE0 && b + 1 < n) { *w = 2; return ((c & 0x1Fu) << 6) | (d[b + 1] & 0x3Fu); }
  if (c < 0xF0 && b + 2 < n) { *w = 3; return ((c & 0x0Fu) << 12) | ((d[b + 1] & 0x3Fu) << 6) | (d[b + 2] & 0x3Fu); }
  if (b + 3 < n) { *w = 4; return ((c & 0x07u) << 18) | ((d[b + 1] & 0x3Fu) << 12) | ((d[b + 2] & 0x3Fu) << 6) | (d[b + 3] & 0x3Fu); }
  *w = 1; return 0xFFFD;
}

int32_t String::charCodeAt(int32_t i) const {
  if (i < 0 || i >= length()) return 0;  // ponytail: JS returns NaN; the prototype has no NaN-typed i32
  if (is_ascii()) return (uint8_t)ptr()[i];
  const uint8_t* d = (const uint8_t*)ptr(); uint32_t n = bytes(), b = 0; int32_t u = 0;
  while (b < n) {
    uint32_t w, cp = decode(d, n, b, &w);
    int32_t units = cp >= 0x10000 ? 2 : 1;
    if (i < u + units) {
      if (units == 1) return (int32_t)cp;
      cp -= 0x10000;
      return (int32_t)(i == u ? 0xD800 + (cp >> 10) : 0xDC00 + (cp & 0x3FF));
    }
    u += units; b += w;
  }
  return 0;
}
String String::at(int32_t i) const {
  int32_t n = length(); if (i < 0) i += n; if (i < 0 || i >= n) return String();
  return sub_bytes(*this, u16_to_byte(*this, i), u16_to_byte(*this, i + 1));
}
static int32_t clampi(int32_t i, int32_t n) { if (i < 0) { i += n; if (i < 0) i = 0; } return i > n ? n : i; }
String String::slice(int32_t a, int32_t b) const {
  int32_t n = length(); a = clampi(a, n); b = clampi(b, n);
  if (b <= a) return String();
  return sub_bytes(*this, u16_to_byte(*this, a), u16_to_byte(*this, b));
}
String String::substring(int32_t a, int32_t b) const {
  int32_t n = length();
  a = a < 0 ? 0 : a > n ? n : a; b = b < 0 ? 0 : b > n ? n : b;
  if (a > b) { int32_t t = a; a = b; b = t; }
  return sub_bytes(*this, u16_to_byte(*this, a), u16_to_byte(*this, b));
}
static int32_t byte_to_u16(const String& s, uint32_t b) {
  if (s.is_ascii()) return (int32_t)b;
  const uint8_t* d = (const uint8_t*)s.ptr(); int32_t u = 0;
  for (uint32_t i = 0; i < b; i++) if ((d[i] & 0xC0) != 0x80) u += d[i] >= 0xF0 ? 2 : 1;
  return u;
}
static int32_t find_bytes(const String& h, const String& n, uint32_t from) {
  uint32_t hn = h.bytes(), nn = n.bytes();
  if (nn == 0) return (int32_t)(from > hn ? hn : from);
  for (uint32_t i = from; i + nn <= hn; i++)
    if (__builtin_memcmp(h.ptr() + i, n.ptr(), nn) == 0) return (int32_t)i;
  return -1;
}
int32_t String::indexOf(const String& n, int32_t from) const {
  if (from < 0) from = 0;
  if (from > length()) from = length();
  int32_t b = find_bytes(*this, n, u16_to_byte(*this, from));
  return b < 0 ? -1 : byte_to_u16(*this, (uint32_t)b);
}
bool String::startsWith(const String& n) const { return n.bytes() <= bytes() && __builtin_memcmp(ptr(), n.ptr(), n.bytes()) == 0; }
bool String::endsWith(const String& n) const { return n.bytes() <= bytes() && __builtin_memcmp(ptr() + bytes() - n.bytes(), n.ptr(), n.bytes()) == 0; }
Array<String> String::split(const String& sep) const {
  Array<String> r = Array<String>::with_cap(0);
  if (sep.bytes() == 0) { for (int32_t i = 0; i < length(); i++) r.push_raw(at(i)); return r; }
  uint32_t b = 0;
  for (;;) {
    int32_t k = find_bytes(*this, sep, b);
    if (k < 0) { r.push_raw(sub_bytes(*this, b, bytes())); return r; }
    r.push_raw(sub_bytes(*this, b, (uint32_t)k));
    b = (uint32_t)k + sep.bytes();
  }
}
static bool is_ws(char c) { return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\v' || c == '\f'; }
String String::trim() const {
  uint32_t a = 0, b = bytes(); const char* p = ptr();
  while (a < b && is_ws(p[a])) a++;
  while (b > a && is_ws(p[b - 1])) b--;
  return sub_bytes(*this, a, b);
}
static StrObj lit_space = {IMMORTAL, 1, 1, 1, " ", nullptr};
StrObj lit_comma = {IMMORTAL, 1, 1, 1, ",", nullptr};
static String pad(const String& s, int32_t n, const String& f, bool start) {
  int32_t need = n - s.length();
  if (need <= 0 || f.length() == 0) return s;
  StrBuilder sb;
  if (!start) to_s(sb, s);
  int32_t fl = f.length();
  for (int32_t i = 0; i < need; i += fl) {
    if (need - i >= fl) to_s(sb, f); else to_s(sb, f.slice(0, need - i));
  }
  if (start) to_s(sb, s);
  return sb.build();
}
String String::padStart(int32_t n) const { return pad(*this, n, String(&lit_space), true); }
String String::padStart(int32_t n, const String& f) const { return pad(*this, n, f, true); }
String String::padEnd(int32_t n) const { return pad(*this, n, String(&lit_space), false); }
String String::padEnd(int32_t n, const String& f) const { return pad(*this, n, f, false); }
String String::repeat(int32_t n) const {
  if (n < 0) panic("RangeError: invalid count");
  StrBuilder sb; for (int32_t i = 0; i < n; i++) to_s(sb, *this); return sb.build();
}
static String map_ascii(const String& s, bool up) {
  if (!s.bytes()) return s;
  StrObj* r = str_alloc(s.bytes());
  char* d = (char*)r->data;
  for (uint32_t i = 0; i < s.bytes(); i++) {
    char c = s.ptr()[i];
    if (up && c >= 'a' && c <= 'z') c = (char)(c - 32);
    if (!up && c >= 'A' && c <= 'Z') c = (char)(c + 32);
    d[i] = c;
  }
  str_measure(r);
  return String::adopt(r);
}
String String::toUpperCase() const { return map_ascii(*this, true); }
String String::toLowerCase() const { return map_ascii(*this, false); }
String String::replace(const String& a, const String& b) const {
  int32_t k = find_bytes(*this, a, 0);
  if (k < 0) return *this;
  StrBuilder sb;
  sb.raw(ptr(), (uint32_t)k); to_s(sb, b); sb.raw(ptr() + k + a.bytes(), bytes() - (uint32_t)k - a.bytes());
  return sb.build();
}
String String::replaceAll(const String& a, const String& b) const {
  if (!a.bytes()) return *this;
  StrBuilder sb; uint32_t p = 0;
  for (;;) {
    int32_t k = find_bytes(*this, a, p);
    if (k < 0) break;
    sb.raw(ptr() + p, (uint32_t)k - p); to_s(sb, b); p = (uint32_t)k + a.bytes();
  }
  sb.raw(ptr() + p, bytes() - p);
  return sb.build();
}
bool operator==(const String& a, const String& b) {
  return a.s == b.s || (a.bytes() == b.bytes() && __builtin_memcmp(a.ptr(), b.ptr(), a.bytes()) == 0);
}
int str_cmp(const String& a, const String& b) {
  // ponytail: byte order == code point order; JS compares UTF-16 units (differs only for astral vs U+E000..U+FFFF)
  uint32_t n = a.bytes() < b.bytes() ? a.bytes() : b.bytes();
  int c = __builtin_memcmp(a.ptr(), b.ptr(), n);
  if (c) return c;
  return a.bytes() < b.bytes() ? -1 : a.bytes() > b.bytes() ? 1 : 0;
}
String from_char_code(int32_t c) {
  char b[3]; uint32_t u = (uint32_t)c & 0xFFFF;
  if (u < 0x80) { b[0] = (char)u; return String::from(b, 1); }
  if (u < 0x800) { b[0] = (char)(0xC0 | (u >> 6)); b[1] = (char)(0x80 | (u & 0x3F)); return String::from(b, 2); }
  b[0] = (char)(0xE0 | (u >> 12)); b[1] = (char)(0x80 | ((u >> 6) & 0x3F)); b[2] = (char)(0x80 | (u & 0x3F));
  return String::from(b, 3);
}
uint32_t hash(const String& s) {
  uint32_t h = 2166136261u;
  for (uint32_t i = 0; i < s.bytes(); i++) { h ^= (uint8_t)s.ptr()[i]; h *= 16777619u; }
  return h;
}

void StrBuilder::raw(const char* p, uint32_t n) {
  if (len + n > cap) {
    uint32_t nc = cap < 32 ? 32 : cap * 2; while (nc < len + n) nc *= 2;
    char* nb = (char*)alloc(nc);
    if (buf) { __builtin_memcpy(nb, buf, len); mfree(buf); }
    buf = nb; cap = nc;
  }
  __builtin_memcpy(buf + len, p, n); len += n;
}
String StrBuilder::build() { return String::from(buf, len); }

// ---------- number -> string (LNG-20: shortest round-trip, ECMAScript Number::toString) ----------
void str_num(StrBuilder& sb, double v) {
  if (v != v) { sb.cstr("NaN"); return; }
  if (v == 0) { sb.ch('0'); return; }
  if (v < 0) { sb.ch('-'); v = -v; }
  if (v == Inf) { sb.cstr("Infinity"); return; }
  char d[32]; int e10;
  int k = zrt_host_shortest(v, d, &e10);
  int n = e10 + 1;  // value = 0.d1d2..dk * 10^n
  if (k <= n && n <= 21) { sb.raw(d, (uint32_t)k); for (int i = k; i < n; i++) sb.ch('0'); return; }
  if (0 < n && n <= 21) { sb.raw(d, (uint32_t)n); sb.ch('.'); sb.raw(d + n, (uint32_t)(k - n)); return; }
  if (-6 < n && n <= 0) { sb.cstr("0."); for (int i = 0; i < -n; i++) sb.ch('0'); sb.raw(d, (uint32_t)k); return; }
  sb.ch(d[0]);
  if (k > 1) { sb.ch('.'); sb.raw(d + 1, (uint32_t)(k - 1)); }
  sb.ch('e'); sb.ch(n - 1 < 0 ? '-' : '+');
  to_s(sb, (int64_t)(n - 1 < 0 ? 1 - n : n - 1));
}
void to_s(StrBuilder& sb, int64_t v) {
  char b[24]; int i = 24; bool neg = v < 0;
  uint64_t u = neg ? (uint64_t)0 - (uint64_t)v : (uint64_t)v;
  do { b[--i] = (char)('0' + u % 10); u /= 10; } while (u);
  if (neg) b[--i] = '-';
  sb.raw(b + i, (uint32_t)(24 - i));
}
void json_str(StrBuilder& sb, const String& v) {
  sb.ch('"');
  for (uint32_t i = 0; i < v.bytes(); i++) {
    char c = v.ptr()[i];
    switch (c) {
      case '"': sb.cstr("\\\""); break;
      case '\\': sb.cstr("\\\\"); break;
      case '\n': sb.cstr("\\n"); break;
      case '\r': sb.cstr("\\r"); break;
      case '\t': sb.cstr("\\t"); break;
      case '\b': sb.cstr("\\b"); break;
      case '\f': sb.cstr("\\f"); break;
      default:
        if ((uint8_t)c < 0x20) { const char* hx = "0123456789abcdef"; sb.cstr("\\u00"); sb.ch(hx[(uint8_t)c >> 4]); sb.ch(hx[c & 15]); }
        else sb.ch(c);
    }
  }
  sb.ch('"');
}
void log_flush(StrBuilder& sb) { sb.ch('\n'); hal_log(sb.buf, sb.len); }

double parse_float(const String& s) {
  String t = s.trim();
  if (!t.bytes()) return NaN;
  int used = 0;
  double v = zrt_host_strtod(t.ptr(), &used);
  return used ? v : NaN;
}
double parse_int(const String& s, int32_t radix) {
  String t = s.trim(); const char* p = t.ptr(); uint32_t n = t.bytes(), i = 0;
  bool neg = false;
  if (i < n && (p[i] == '-' || p[i] == '+')) neg = p[i++] == '-';
  if ((radix == 0 || radix == 16) && i + 1 < n && p[i] == '0' && (p[i + 1] == 'x' || p[i + 1] == 'X')) { i += 2; radix = 16; }
  if (radix == 0) radix = 10;
  double v = 0; bool any = false;
  for (; i < n; i++) {
    char c = p[i]; int d = c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'z' ? c - 'a' + 10 : c >= 'A' && c <= 'Z' ? c - 'A' + 10 : 99;
    if (d >= radix) break;
    v = v * radix + d; any = true;
  }
  return any ? (neg ? -v : v) : NaN;
}
String to_fixed(double v, int32_t digits) {
  char b[400];
  int n = zrt_host_fixed(v, digits, b, (int)sizeof b);
  return String::from(b, (uint32_t)n);
}
double now_ms() { return (double)hal_time_us() / 1000.0; }

namespace math {
static uint32_t rng = 0x2545F491u;
double random() {  // xorshift32, identical in sim/zinc.mjs
  rng ^= rng << 13; rng ^= rng >> 17; rng ^= rng << 5;
  return (double)rng / 4294967296.0;
}
void seed(uint32_t s) { rng = s ? s : 0x2545F491u; }
}

// ---------- event loop (RT-10) ----------
struct Timer { Fn<void()> f; double at, every; int32_t id; };
static const int MAX_TIMERS = 64;
static Timer timers[MAX_TIMERS];
static int32_t next_timer_id = 1;
static Fn<void(double)> frame_cb;
static HalInput input, prev_input;
static int32_t frame_no = 0;
static bool quit_requested = false;
static int32_t surf_w = 320, surf_h = 240;
static Poller* pollers = nullptr;
int zrt_argc = 0;
char** zrt_argv = nullptr;

int32_t set_timer(Fn<void()> f, double ms, bool repeat) {
  for (int i = 0; i < MAX_TIMERS; i++) {
    if (timers[i].id) continue;
    timers[i].f = f; timers[i].at = now_ms() + ms; timers[i].every = repeat ? (ms < 1 ? 1 : ms) : -1; timers[i].id = next_timer_id++;
    return timers[i].id;
  }
  panic("too many timers");
}
void clear_timer(int32_t id) {
  for (int i = 0; i < MAX_TIMERS; i++) if (timers[i].id == id && id) { timers[i].id = 0; timers[i].f = nullptr; }
}

// microtask queue: bounded ring (RT-10)
static const int MQ = 4096;
static Fn<void()> mq[MQ];
static int mq_head = 0, mq_len = 0;
void microtask(Fn<void()> f) {
  if (mq_len == MQ) panic("microtask queue overflow");
  mq[(mq_head + mq_len++) % MQ] = f;
}
static PromiseBase* unhandled[64];
static int unhandled_n = 0;
void track_rejection(PromiseBase* p) { if (unhandled_n < 64) { retain(p); unhandled[unhandled_n++] = p; } }
void drain_microtasks() {
  while (mq_len) {
    Fn<void()> f = mq[mq_head];
    mq[mq_head] = nullptr;
    mq_head = (mq_head + 1) % MQ; mq_len--;
    f();
    check_uncaught();
  }
  for (int i = 0; i < unhandled_n; i++) {
    PromiseBase* p = unhandled[i];
    if (!p->handled) uncaught(p->err);
    release(p);
  }
  unhandled_n = 0;
  drain_deferred();
}
void uncaught(const Ref<Error>& e) {
  StrBuilder sb; sb.cstr("Uncaught ");
  if (e.p) e.p->zrt_str(sb); else sb.cstr("Error");
  sb.ch('\0');
  hal_panic(sb.buf, "", 0);
}
void add_poller(Poller* p) { p->next = pollers; pollers = p; }
static bool poll_all() {
  bool active = false;
  for (Poller* p = pollers; p; p = p->next) { if (p->poll()) active = true; drain_microtasks(); }
  return active;
}

// Runs due timers; returns ms until the next one, or -1 when none are pending.
static double run_timers() {
  double t = now_ms(), next = -1;
  for (int i = 0; i < MAX_TIMERS; i++) {
    if (!timers[i].id) continue;
    if (timers[i].at <= t) {
      Fn<void()> f = timers[i].f;
      if (timers[i].every >= 0) timers[i].at += timers[i].every; else { timers[i].id = 0; timers[i].f = nullptr; }
      f();
      check_uncaught();
      drain_microtasks();
    }
    if (timers[i].id && (next < 0 || timers[i].at - t < next)) next = timers[i].at - t;
  }
  return next;
}

void start(const HalConfig& cfg, int argc, char** argv) {
  zrt_argc = argc; zrt_argv = argv;
  hal_init(&cfg); surf_w = cfg.width; surf_h = cfg.height;
}

namespace gfx { void begin_frame(); void end_frame(); }

// One iteration of the main loop; false when the program is finished (used by the wasm HAL too).
static uint64_t last_frame_us = 0;
bool loop_once() {
  drain_microtasks();
  if (frame_cb && !quit_requested) {
    hal_frame_begin();
    prev_input = input;
    hal_poll_input(&input);
    if (input.quit) return false;
    uint64_t t = hal_time_us();
    double dt = hal_fixed_dt();
    if (!last_frame_us) last_frame_us = t;
    if (dt <= 0) { dt = (double)(t - last_frame_us) / 1e6; if (dt > 0.1) dt = 0.1; }
    last_frame_us = t;
    run_timers();
    poll_all();
    gfx::begin_frame();
    Fn<void(double)> cb = frame_cb;
    cb(dt);
    check_uncaught();
    drain_microtasks();
    gfx::end_frame();
    frame_no++;
    stats.frames++;
    stats.frame_us = hal_time_us() - t;
    hal_frame_end();
    return true;
  }
  double next = run_timers();
  bool active = poll_all();
  if (quit_requested || (next < 0 && !active && !mq_len)) return false;
  if (active) hal_sleep_us(1000);
  else if (next > 0) hal_sleep_us((uint64_t)(next * 1000));
  return true;
}
void run_loop() {
  while (loop_once()) {}
}

void finish() {
  frame_cb = nullptr;
  for (int i = 0; i < MAX_TIMERS; i++) { timers[i].id = 0; timers[i].f = nullptr; }
  drain_deferred();
#ifdef ZRT_DEBUG
  if (live_objects) {  // MEM-18: leak report
    StrBuilder sb; sb.cstr("zinc: "); to_s(sb, (int64_t)live_objects); sb.cstr(" object(s) still alive at exit");
    log_flush(sb);
  }
#endif
  hal_shutdown();
}

// ---------- console (RT-07, LLRT-style levels, optional JSON lines) ----------
static int log_mode = -1;  // 0 plain, 1 color (tty), 2 json
static void log_init() {
  if (log_mode >= 0) return;
  const char* f = hal_env("ZINC_LOG_FORMAT");
  log_mode = (f && f[0] == 'j') ? 2 : hal_isatty(1) ? 1 : 0;
}
void log_emit(int level, StrBuilder& sb) {
  log_init();
  bool err = level == LOG_WARN || level == LOG_ERROR || level == LOG_TRACE;
  static const char* names[] = {"LOG", "INFO", "DEBUG", "WARN", "ERROR", "TRACE"};
  if (log_mode == 2) {
    StrBuilder j; j.cstr("{\"time\":"); str_num(j, now_ms()); j.cstr(",\"level\":\""); j.cstr(names[level]); j.cstr("\",\"message\":");
    json_str(j, sb.build()); j.cstr("}\n");
    hal_log(j.buf, j.len);
    return;
  }
  if (log_mode == 1 && err) {
    StrBuilder c; c.cstr(level == LOG_WARN ? "\033[33m" : "\033[31m"); c.raw(sb.buf, sb.len); c.cstr("\033[0m\n");
    hal_log_err(c.buf, c.len);
    return;
  }
  sb.ch('\n');
  if (err) hal_log_err(sb.buf, sb.len); else hal_log(sb.buf, sb.len);
}
struct Label { String name; double t; int32_t n; };
static Label labels[32];
static Label* label(const String& s, bool create) {
  for (auto& l : labels) if (l.name.s && l.name == s) return &l;
  if (!create) return nullptr;
  for (auto& l : labels) if (!l.name.s) { l.name = s; l.t = 0; l.n = 0; return &l; }
  return &labels[31];
}
void console_time(const String& s) { label(s, true)->t = now_ms(); }
static void time_report(const String& s, bool end) {
  Label* l = label(s, false);
  StrBuilder sb; to_s(sb, s); sb.cstr(": ");
  if (!l) { sb.cstr("no such label"); log_emit(LOG_WARN, sb); return; }
  str_num(sb, (double)(int64_t)((now_ms() - l->t) * 1000) / 1000.0); sb.cstr("ms");
  if (end) l->name = String();
  log_emit(LOG_LOG, sb);
}
void console_timeEnd(const String& s) { time_report(s, true); }
void console_timeLog(const String& s) { time_report(s, false); }
void console_count(const String& s) {
  Label* l = label(s, true);
  StrBuilder sb; to_s(sb, s); sb.cstr(": "); to_s(sb, ++l->n);
  log_emit(LOG_LOG, sb);
}

// ---------- arenas (MEM-07) ----------
static mem::Arena* arena_top = nullptr;
void* arena_take(size_t n) {
  mem::Arena* a = arena_top;
  if (!a) return nullptr;
  n = (n + 15) & ~(size_t)15;
  if (a->used + n > a->size) panic("arena full (Arena.frame(bytes) sets its size)");
  void* p = a->base + a->used; a->used += n; a->live++;
  return p;
}
bool arena_owns(const void* p) {
  for (mem::Arena* a = arena_top; a; a = a->prev) if ((const char*)p >= a->base && (const char*)p < a->base + a->size) return true;
  return false;
}
void arena_forget(Object* o) {
  for (mem::Arena* a = arena_top; a; a = a->prev) if ((char*)o >= a->base && (char*)o < a->base + a->size) { a->live--; return; }
}
namespace mem {
Ref<Arena> Arena::frame(double bytes) {
  // the arena object itself lives on the heap, its block is taken from the heap once
  Arena* a = new (alloc(sizeof(Arena))) Arena();
  live_objects++;
  a->size = bytes < 256 ? 256 : (size_t)bytes;
  a->base = (char*)alloc(a->size);
  a->prev = arena_top; arena_top = a;
  return Ref<Arena>::adopt(a);
}
void Arena::zrt_dispose() {
  if (!base) return;
  if (live) panic("an object allocated in an arena outlives it (MEM-07); copy it out with arena.promote(x)");
  if (arena_top == this) arena_top = prev;
  mfree(base); base = nullptr;  // O(1): nothing inside is freed individually
}
Arena::~Arena() { zrt_dispose(); }
}
// ---------- zinc:gfx: fills a draw list executed by hal_present (UI-12) ----------
namespace gfx {
static const uint32_t MAX_CMDS = 8192, MAX_TEXT = 32768;
static HalDrawCmd cmds[MAX_CMDS];
static char text_pool[MAX_TEXT];
static uint32_t ncmd = 0, ntext = 0;

void begin_frame() { ncmd = 0; ntext = 0; }
void end_frame() { HalDrawList dl = {cmds, ncmd, text_pool}; stats.draw_cmds = ncmd; hal_present(&dl); }
static HalDrawCmd* push(uint8_t kind) {
  if (ncmd == MAX_CMDS) return nullptr;  // ponytail: silently drops past 8192 commands per frame
  HalDrawCmd* c = &cmds[ncmd++];
  c->kind = kind; c->scale = 1; c->text_len = 0; c->text_off = 0;
  return c;
}
void onFrame(Fn<void(double)> cb) { frame_cb = cb; }
int32_t width() { return surf_w; }
int32_t height() { return surf_h; }
void clear(uint32_t color) { if (HalDrawCmd* c = push(HAL_DRAW_CLEAR)) c->color = color; }
void rect(double x, double y, double w, double h, uint32_t color) {
  if (HalDrawCmd* c = push(HAL_DRAW_RECT)) { c->x = (float)x; c->y = (float)y; c->w = (float)w; c->h = (float)h; c->color = color; }
}
void line(double x1, double y1, double x2, double y2, uint32_t color) {
  if (HalDrawCmd* c = push(HAL_DRAW_LINE)) { c->x = (float)x1; c->y = (float)y1; c->w = (float)x2; c->h = (float)y2; c->color = color; }
}
void text(double x, double y, const String& s, uint32_t color, int32_t scale) {
  uint32_t n = s.bytes();
  if (n > 0xFFFF || ntext + n > MAX_TEXT) return;
  HalDrawCmd* c = push(HAL_DRAW_TEXT);
  if (!c) return;
  __builtin_memcpy(text_pool + ntext, s.ptr(), n);
  c->x = (float)x; c->y = (float)y; c->color = color; c->scale = (uint8_t)(scale < 1 ? 1 : scale);
  c->text_off = ntext; c->text_len = (uint16_t)n; ntext += n;
}
bool isDown(int32_t b) { return (input.buttons >> b) & 1u; }
bool wasPressed(int32_t b) { return ((input.buttons >> b) & 1u) && !((prev_input.buttons >> b) & 1u); }
double pointerX() { return input.px; }
double pointerY() { return input.py; }
bool pointerDown() { return input.pdown != 0; }
int32_t frame() { return frame_no; }
void quit() { quit_requested = true; }
}

}  // namespace zrt

