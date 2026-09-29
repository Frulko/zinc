// zrt — non-template parts of the runtime.
#include "zrt.h"
#include <setjmp.h>

extern "C" { HalDisplay* hal_display = nullptr; }
// Optional HAL hook (targets/common/hal_posix.cpp): routes fatal signals of the main thread to `on_fault`.
extern "C" __attribute__((weak)) void hal_trap_faults(void (*on_fault)(const char* what));
extern "C" __attribute__((weak)) int hal_heap_region_more(int, void**, size_t*) { return 0; }

// Crash policy (docs/dev-mode.md): 0 exit (default), 1 red box, 2 restart. ZRT_DEV: dev build (hot reload host).
#ifndef ZRT_CRASH
#define ZRT_CRASH 0
#endif

// Static budgets (NFR-05): small targets define smaller values (esp32/ps1 profiles).
#ifndef ZRT_MAX_DRAW_CMDS
#define ZRT_MAX_DRAW_CMDS 8192
#endif
#ifndef ZRT_TEXT_POOL
#define ZRT_TEXT_POOL 32768
#endif
#ifndef ZRT_MICROTASKS
#define ZRT_MICROTASKS 4096
#endif
#ifndef ZRT_DEFERRED
#define ZRT_DEFERRED 4096
#endif
#ifndef ZRT_TIMERS
#define ZRT_TIMERS 64
#endif

// Provided by runtime/host.cpp (libc-backed number formatting). ponytail: replace with Ryu for freestanding targets.
extern "C" int zrt_host_shortest(double v, char* digits, int* exp10);
extern "C" double zrt_host_strtod(const char* s, int* consumed);
extern "C" int zrt_host_fixed(double v, int digits, char* out, int cap);
extern "C" void* zrt_host_open(const char* path, const char* mode);
extern "C" size_t zrt_host_io(void* f, void* p, size_t n, int write);
extern "C" void zrt_host_close(void* f);

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
// ESP32 internal RAM comes in several blocks: the heap may span up to 4 regions (hal_heap_region_more)
static const int MAX_REGIONS = 4;
static char *lo[MAX_REGIONS], *hi[MAX_REGIONS];
static int nreg;
static size_t budget, used;
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
static void add_region(void* base, size_t size) {
  uintptr_t a = ((uintptr_t)base + ALIGN - 1) & ~(uintptr_t)(ALIGN - 1);
  size -= a - (uintptr_t)base;
  size &= ~(ALIGN - 1);
  lo[nreg] = (char*)a; hi[nreg] = lo[nreg] + size; budget += size;
  Block* b = (Block*)lo[nreg++];
  b->prev_phys = nullptr; b->size = (size - 2 * HDR) | 1;
  Block* sentinel = next(b);
  sentinel->prev_phys = b; sentinel->size = 0 | 2;  // used, prev free
  insert(b);
}
static void init() {
  void* base; size_t size;
  hal_heap_region(&base, &size);
  if (!base || size < 4096) hal_panic("no heap region (hal_heap_region)", "", 0);
  add_region(base, size);
  for (int i = 0; nreg < MAX_REGIONS && hal_heap_region_more(i, &base, &size); i++)
    if (base && size >= 4096) add_region(base, size);
}
[[maybe_unused]] static void* malloc(size_t n) {
  if (!nreg) init();
  if (n > budget) return nullptr;  // also keeps the rounding below from wrapping a huge request to a tiny block
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
  used += bsize(b);
  return payload(b);
}
[[maybe_unused]] static void free(void* p) {
  Block* b = of(p);
  used -= bsize(b);
  b->size |= 1;
  Block* nx = next(b);
  if (nx->size & 1) { remove(nx); b->size = (bsize(b) + HDR + bsize(nx)) | 1 | (b->size & 2); nx = next(b); nx->prev_phys = b; }
  if (b->size & 2) { Block* pv = b->prev_phys; remove(pv); pv->size = (bsize(pv) + HDR + bsize(b)) | 1 | (pv->size & 2); b = pv; nx = next(b); nx->prev_phys = b; }
  nx->size |= 2;
  insert(b);
}
[[maybe_unused]] static bool owns(const void* p) {
  for (int i = 0; i < nreg; i++) if ((const char*)p >= lo[i] && (const char*)p < hi[i]) return true;
  return false;
}
}

static void drain_deferred();
void* alloc(size_t n) {
#ifdef ZRT_DEBUG
  void* p = hal_alloc(n ? n : 1);
#else
  void* p = tlsf::malloc(n ? n : 1);
  if (!p) { drain_deferred(); p = tlsf::malloc(n ? n : 1); }   // release cascades cut short by MAX_CASCADE hold memory until drained
#endif
  if (!p) {
    // no allocation from here on (a StrBuilder would recurse into alloc): format into a static buffer
    static char msg[128];
    const char* head = "out of memory (heap budget ";
    uint32_t k = 0;
    while (*head) msg[k++] = *head++;
    char digits[24]; int nd = 0;
    uint64_t v = (uint64_t)tlsf::budget;
    do { digits[nd++] = (char)('0' + v % 10); v /= 10; } while (v && nd < 24);
    while (nd) msg[k++] = digits[--nd];
    const char* tail = " bytes, asked ";
    while (*tail) msg[k++] = *tail++;
    v = (uint64_t)n; nd = 0;
    do { digits[nd++] = (char)('0' + v % 10); v /= 10; } while (v && nd < 24);
    while (nd) msg[k++] = digits[--nd];
    tail = ", in use ";
    while (*tail) msg[k++] = *tail++;
    v = (uint64_t)tlsf::used; nd = 0;
    do { digits[nd++] = (char)('0' + v % 10); v /= 10; } while (v && nd < 24);
    while (nd) msg[k++] = digits[--nd];
    msg[k++] = ')'; msg[k] = 0;
    panic(msg);
  }
  alloc_count++;
  return p;
}
size_t heap_used() { return tlsf::used; }
size_t heap_budget() { return tlsf::budget; }
void mfree(void* p) {
  if (!p || arena_owns(p)) return;
#ifdef ZRT_DEBUG
  if (!pool_give(p)) hal_free(p);
#else
  if (tlsf::owns(p)) tlsf::free(p); else if (!pool_give(p)) hal_free(p);
#endif
}
// A pooled object that was weakly referenced is freed by mfree when its last Weak goes: back to its pool, never to
// the system allocator (its slot is static storage).
PoolSlab* pool_slabs = nullptr;
bool pool_give(void* p) {
  for (PoolSlab* s = pool_slabs; s; s = s->next)
    if ((unsigned char*)p >= s->lo && (unsigned char*)p < s->hi) { *(void**)p = *s->head; *s->head = p; return true; }
  return false;
}

[[noreturn]] static void crash(const char* msg, const char* file, int line);
void panic(const char* msg) { crash(msg, "", 0); }
void panic_at(const char* msg, const char* file, int line) { crash(msg, file, line); }

Ref<Error> g_err;
Stats stats;
void (*telemetry_frame)() = nullptr;
void (*telemetry_log)(int, const char*, uint32_t) = nullptr;
void Object::zrt_json(StrBuilder& sb) const { sb.cstr("{}"); }
void Object::zrt_str(StrBuilder& sb) const { sb.cstr("[object Object]"); }
void Object::zrt_inspect(StrBuilder& sb, Insp& in) const { insp_object(sb, in, this, nullptr); }
void Object::zrt_delete() { this->~Object(); mfree(this); }

// MEM-12: a release cascade deeper than 256 objects is finished in slices (next allocation or frame end).
static const int MAX_CASCADE = 256, DEFER_CAP = ZRT_DEFERRED;
static int cascade_depth = 0;
static Object* deferred[DEFER_CAP];
static int deferred_n = 0;
static void destroy_now(Object* o) {
  o->rc = 0;
  live_objects--;
  if (arena_owns(o)) { arena_forget(o); o->~Object(); return; }
  // weakly referenced: destroy now, free when the last Weak goes. The extra count keeps the memory alive while the
  // destructor runs (children holding a Weak to their parent drop it from inside this destructor).
  if (o->wc) { o->wc++; o->~Object(); if (--o->wc == 0) mfree(o); }
  else o->zrt_delete();
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

// JS caps strings too (V8: ~2^29 units); here it keeps byte counts, UTF-16 lengths and size math from wrapping
static const uint32_t MAX_STR = 1u << 30;
static StrObj* str_alloc(uint32_t n) {
  if (n > MAX_STR) panic("RangeError: Invalid string length");
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

// A computed '' is a real (immortal, shared) empty string: only an absent value is a null String, so
// `s.slice(3) === undefined` is false and `x ?? 'd'` keeps a computed ''.
static StrObj empty_str = {IMMORTAL, 0, 0, 1, "", nullptr};
String String::from(const char* p, uint32_t n) {
  if (!n) return String(&empty_str);
  StrObj* s = str_alloc(n);
  __builtin_memcpy((char*)s->data, p, n);
  // Rejoin adjacent WTF-8 surrogate units so concatenation has the same bytes,
  // comparison and hash as the equivalent UTF-8 astral character.
  if (__builtin_memchr(p, 0xED, n)) {
    auto* d = (uint8_t*)s->data; uint32_t out = 0;
    for (uint32_t i = 0; i < n;) {
      if (i + 5 < n && d[i] == 0xED && d[i+1] >= 0xA0 && d[i+1] <= 0xAF && (d[i+2] & 0xC0) == 0x80 &&
          d[i+3] == 0xED && d[i+4] >= 0xB0 && d[i+4] <= 0xBF && (d[i+5] & 0xC0) == 0x80) {
        const uint32_t high = ((d[i+1] & 0x0F) << 6) | (d[i+2] & 0x3F), low = ((d[i+4] & 0x0F) << 6) | (d[i+5] & 0x3F);
        const uint32_t cp = 0x10000 + (high << 10) + low;
        d[out++] = uint8_t(0xF0 | (cp >> 18)); d[out++] = uint8_t(0x80 | ((cp >> 12) & 0x3F));
        d[out++] = uint8_t(0x80 | ((cp >> 6) & 0x3F)); d[out++] = uint8_t(0x80 | (cp & 0x3F)); i += 6;
      } else d[out++] = d[i++];
    }
    d[out] = 0; s->len = out;
  }
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
  if (b1 <= b0) return String(&empty_str);
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
// Keep UTF-16 slices exact even when a boundary splits an astral code point.
// Isolated surrogate units use WTF-8 internally; aligned slices still share storage.
static String sub_utf16(const String& s, int32_t a, int32_t b) {
  if (b <= a) return String(&empty_str);
  const uint32_t begin = u16_to_byte(s, a), end = u16_to_byte(s, b);
  const bool low = a < s.length() && begin == u16_to_byte(s, a + 1);
  const bool high = b < s.length() && end == u16_to_byte(s, b + 1);
  if (!low && !high) return sub_bytes(s, begin, end);
  StrBuilder out;
  const auto unit = [&](int32_t value) {
    const char bytes[] = { char(0xE0 | (value >> 12)), char(0x80 | ((value >> 6) & 0x3F)), char(0x80 | (value & 0x3F)) };
    out.raw(bytes, 3);
  };
  if (low) unit(s.charCodeAt(a));
  const uint32_t stop = high ? end - 4 : end;
  out.raw(s.ptr() + begin, stop - begin);
  if (high) unit(s.charCodeAt(b - 1));
  return out.build();
}
String String::at(int32_t i) const {
  int32_t n = length(); if (i < 0) i += n; if (i < 0 || i >= n) return String();
  return sub_utf16(*this, i, i + 1);
}
static int32_t clampi(int32_t i, int32_t n) { if (i < 0) { i += n; if (i < 0) i = 0; } return i > n ? n : i; }
String String::slice(int32_t a, int32_t b) const {
  int32_t n = length(); a = clampi(a, n); b = clampi(b, n);
  if (b <= a) return String(&empty_str);
  return sub_utf16(*this, a, b);
}
String String::substring(int32_t a, int32_t b) const {
  int32_t n = length();
  a = a < 0 ? 0 : a > n ? n : a; b = b < 0 ? 0 : b > n ? n : b;
  if (a > b) { int32_t t = a; a = b; b = t; }
  return sub_utf16(*this, a, b);
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
int32_t String::lastIndexOf(const String& n, int32_t from) const {
  // last match starting at or before `from` (UTF-16 index), like JS: one backward scan (a forward rescan from each
  // match never ended for an empty needle and was quadratic)
  uint32_t hn = bytes(), nn = n.bytes();
  if (nn > hn) return -1;
  if (from < 0) from = 0;
  uint32_t b = u16_to_byte(*this, from > length() ? length() : from);
  if (b > hn - nn) b = hn - nn;
  for (uint32_t i = b + 1; i-- > 0;) if (__builtin_memcmp(ptr() + i, n.ptr(), nn) == 0) return byte_to_u16(*this, i);
  return -1;
}
bool String::startsWith(const String& n) const { return n.bytes() <= bytes() && __builtin_memcmp(ptr(), n.ptr(), n.bytes()) == 0; }
bool String::endsWith(const String& n) const { return n.bytes() <= bytes() && __builtin_memcmp(ptr() + bytes() - n.bytes(), n.ptr(), n.bytes()) == 0; }
bool String::startsWith(const String& n, int32_t pos) const {
  uint32_t b = u16_to_byte(*this, pos < 0 ? 0 : pos > length() ? length() : pos);
  return n.bytes() <= bytes() - b && __builtin_memcmp(ptr() + b, n.ptr(), n.bytes()) == 0;
}
bool String::endsWith(const String& n, int32_t end) const {
  uint32_t b = u16_to_byte(*this, end < 0 ? 0 : end > length() ? length() : end);
  return n.bytes() <= b && __builtin_memcmp(ptr() + b - n.bytes(), n.ptr(), n.bytes()) == 0;
}
String String::concat(const String& o) const { return cat(*this, o); }
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
// Bytes of the JS WhiteSpace / LineTerminator code point that starts p (0 if none): ASCII, U+00A0, U+1680,
// U+2000-U+200A, U+2028, U+2029, U+202F, U+205F, U+3000 and U+FEFF, like String.prototype.trim.
static uint32_t ws_at(const uint8_t* p, uint32_t n) {
  if (!n) return 0;
  if (p[0] < 0x80) return is_ws((char)p[0]) ? 1 : 0;
  if (n >= 2 && p[0] == 0xC2 && p[1] == 0xA0) return 2;
  if (n < 3 || (p[0] & 0xF0) != 0xE0 || (p[1] & 0xC0) != 0x80 || (p[2] & 0xC0) != 0x80) return 0;
  uint32_t c = (p[0] & 0x0Fu) << 12 | (p[1] & 0x3Fu) << 6 | (p[2] & 0x3Fu);
  return c == 0x1680 || (c >= 0x2000 && c <= 0x200A) || c == 0x2028 || c == 0x2029 || c == 0x202F || c == 0x205F || c == 0x3000 || c == 0xFEFF ? 3 : 0;
}
static String trim_ws(const String& s, bool start, bool end) {
  const uint8_t* p = (const uint8_t*)s.ptr(); uint32_t a = 0, b = s.bytes(), w;
  while (start && a < b && (w = ws_at(p + a, b - a))) a += w;
  for (bool more = end; more && b > a;) {
    more = false;
    for (uint32_t k = 1; k <= 3 && k <= b - a; k++) if (ws_at(p + b - k, k) == k) { b -= k; more = true; break; }
  }
  return sub_bytes(s, a, b);
}
String String::trim() const { return trim_ws(*this, true, true); }
String String::trimStart() const { return trim_ws(*this, true, false); }
String String::trimEnd() const { return trim_ws(*this, false, true); }
static StrObj lit_space = {IMMORTAL, 1, 1, 1, " ", nullptr};
StrObj lit_comma = {IMMORTAL, 1, 1, 1, ",", nullptr};
static String pad(const String& s, int32_t n, const String& f, bool start) {
  if (n <= s.length() || f.length() == 0) return s;
  const int32_t need = n - s.length();
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
String String::padStart(int32_t n, const String& f) const { return pad(*this, n, f.s ? f : String(&lit_space), true); }
String String::padEnd(int32_t n) const { return pad(*this, n, String(&lit_space), false); }
String String::padEnd(int32_t n, const String& f) const { return pad(*this, n, f.s ? f : String(&lit_space), false); }
String String::repeat(int32_t n) const {
  if (n < 0) panic("RangeError: invalid count");
  if (!n || !bytes()) return String();
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
// Case mapping beyond ASCII (like JS for these ranges): Latin-1, Latin Extended-A, Greek and Cyrillic, so
// on-screen keyboards and i18n text upper-case the same on every target as on the sim. ß upper-cases to "SS".
// ponytail: other scripts (Armenian, Georgian, Latin Extended-B, Turkish dotted i...) keep their case.
static uint32_t case_map(uint32_t c, bool up) {
  if (c < 0x80) return up ? (c >= 'a' && c <= 'z' ? c - 32 : c) : (c >= 'A' && c <= 'Z' ? c + 32 : c);
  if (up) {
    if ((c >= 0xE0 && c <= 0xFE && c != 0xF7)) return c - 0x20;
    if (c == 0xFF) return 0x178;
    if ((c >= 0x100 && c <= 0x137) || (c >= 0x14A && c <= 0x177)) return c & ~1u;
    if ((c >= 0x139 && c <= 0x148) || (c >= 0x179 && c <= 0x17E)) return (c & 1) ? c : c - 1;
    if (c >= 0x3B1 && c <= 0x3CB && c != 0x3C2) return c - 0x20;
    if (c == 0x3C2) return 0x3A3;
    if (c == 0x3AC) return 0x386;
    if (c >= 0x3AD && c <= 0x3AF) return c - 0x25;
    if (c == 0x3CC) return 0x38C;
    if (c == 0x3CD || c == 0x3CE) return c - 0x3F;
    if (c >= 0x430 && c <= 0x44F) return c - 0x20;
    if (c >= 0x450 && c <= 0x45F) return c - 0x50;
    if ((c >= 0x460 && c <= 0x481) || (c >= 0x48A && c <= 0x4BF) || (c >= 0x4D0 && c <= 0x52F)) return c & ~1u;
  } else {
    if ((c >= 0xC0 && c <= 0xDE && c != 0xD7)) return c + 0x20;
    if (c == 0x178) return 0xFF;
    if ((c >= 0x100 && c <= 0x137) || (c >= 0x14A && c <= 0x177)) return c | 1u;
    if ((c >= 0x139 && c <= 0x148) || (c >= 0x179 && c <= 0x17E)) return (c & 1) ? c + 1 : c;
    if (c >= 0x391 && c <= 0x3AB && c != 0x3A2) return c + 0x20;
    if (c == 0x386) return 0x3AC;
    if (c >= 0x388 && c <= 0x38A) return c + 0x25;
    if (c == 0x38C) return 0x3CC;
    if (c == 0x38E || c == 0x38F) return c + 0x3F;
    if (c >= 0x410 && c <= 0x42F) return c + 0x20;
    if (c >= 0x400 && c <= 0x40F) return c + 0x50;
    if ((c >= 0x460 && c <= 0x481) || (c >= 0x48A && c <= 0x4BF) || (c >= 0x4D0 && c <= 0x52F)) return c | 1u;
  }
  return c;
}
static String map_case(const String& s, bool up) {
  const uint8_t* p = (const uint8_t*)s.ptr();
  uint32_t n = s.bytes(), i = 0;
  while (i < n && p[i] < 0x80) i++;
  if (i == n) return map_ascii(s, up);   // fast path
  StrBuilder sb;
  i = 0;
  while (i < n) {
    uint8_t b = p[i];
    uint32_t len = b < 0x80 ? 1 : b < 0xE0 ? 2 : b < 0xF0 ? 3 : 4, c = b < 0x80 ? b : b < 0xE0 ? b & 0x1F : b < 0xF0 ? b & 0x0F : b & 0x07;
    for (uint32_t k = 1; k < len && i + k < n; k++) c = (c << 6) | (p[i + k] & 0x3F);
    i += len;
    if (up && c == 0xDF) { sb.raw("SS", 2); continue; }
    uint32_t m = case_map(c, up);
    char buf[4]; uint32_t w;
    if (m < 0x80) { buf[0] = (char)m; w = 1; }
    else if (m < 0x800) { buf[0] = (char)(0xC0 | (m >> 6)); buf[1] = (char)(0x80 | (m & 0x3F)); w = 2; }
    else if (m < 0x10000) { buf[0] = (char)(0xE0 | (m >> 12)); buf[1] = (char)(0x80 | ((m >> 6) & 0x3F)); buf[2] = (char)(0x80 | (m & 0x3F)); w = 3; }
    else { buf[0] = (char)(0xF0 | (m >> 18)); buf[1] = (char)(0x80 | ((m >> 12) & 0x3F)); buf[2] = (char)(0x80 | ((m >> 6) & 0x3F)); buf[3] = (char)(0x80 | (m & 0x3F)); w = 4; }
    sb.raw(buf, w);
  }
  return sb.build();
}
String String::toUpperCase() const { return map_case(*this, true); }
String String::toLowerCase() const { return map_case(*this, false); }
// GetSubstitution for a string pattern. A split point denotes the boundary
// between the two UTF-16 units of the astral code point at byte offset k.
template<class Writer> static void replacement_unit(Writer& out, uint32_t unit) {
  const char bytes[] = { char(0xE0 | (unit >> 12)), char(0x80 | ((unit >> 6) & 0x3F)), char(0x80 | (unit & 0x3F)) };
  out.raw(bytes, 3);
}
template<class Writer> static void substitute(Writer& out, const String& s, uint32_t k, uint32_t len, const String& rep, uint32_t split = 0) {
  const char* r = rep.ptr(); const uint32_t n = rep.bytes();
  for (uint32_t i = 0; i < n && !out.full(); i++) {
    const char c = i + 1 < n && r[i] == '$' ? r[i + 1] : 0;
    if (c == '$') out.ch('$');
    else if (c == '&') out.raw(s.ptr() + k, len);
    else if (c == '`') {
      out.raw(s.ptr(), k);
      if (split) replacement_unit(out, 0xD800 + ((split - 0x10000) >> 10));
    } else if (c == '\'') {
      if (split) replacement_unit(out, 0xDC00 + ((split - 0x10000) & 0x3FF));
      const uint32_t end = split ? k + 4 : k + len;
      out.raw(s.ptr() + end, s.bytes() - end);
    } else { out.ch(r[i]); continue; }
    i++;
  }
}
// The same traversal measures bounded VM output and builds the native result.
// UTF-8 decoding is streaming; empty patterns match every UTF-16 boundary.
template<class Writer> static bool replace_into(Writer& out, const String& s, const String& pattern, const String& rep, bool all) {
  if (all && !pattern.bytes()) {
    if (!rep.bytes()) return false;
    const auto* bytes = (const uint8_t*)s.ptr(); uint32_t at = 0;
    while (at < s.bytes() && !out.full()) {
      uint32_t width; const uint32_t cp = decode(bytes, s.bytes(), at, &width);
      substitute(out, s, at, 0, rep);
      if (cp >= 0x10000) {
        replacement_unit(out, 0xD800 + ((cp - 0x10000) >> 10));
        substitute(out, s, at, 0, rep, cp);
        replacement_unit(out, 0xDC00 + ((cp - 0x10000) & 0x3FF));
      } else out.raw(s.ptr() + at, width);
      at += width;
    }
    if (!out.full()) substitute(out, s, s.bytes(), 0, rep);
    return true;
  }
  uint32_t at = 0; bool found = false;
  while (!out.full()) {
    const int32_t match = find_bytes(s, pattern, at);
    if (match < 0) break;
    found = true;
    out.raw(s.ptr() + at, uint32_t(match) - at);
    substitute(out, s, uint32_t(match), pattern.bytes(), rep);
    at = uint32_t(match) + pattern.bytes();
    if (!all) break;
  }
  if (found && !out.full()) out.raw(s.ptr() + at, s.bytes() - at);
  return found;
}
struct ReplacementSize {
  uint64_t size = 0, limit;
  bool full() const { return size > limit; }
  void raw(const char*, uint32_t n) { if (!full()) size += n; }
  void ch(char) { raw(nullptr, 1); }
};
uint64_t replacement_bytes(const String& text, const String& pattern, const String& replacement, bool all, uint64_t limit) {
  ReplacementSize out{0, limit};
  return replace_into(out, text, pattern, replacement, all) ? out.size : text.bytes();
}
struct ReplacementBuilder : StrBuilder { bool full() const { return false; } };
String String::replace(const String& pattern, const String& replacement) const {
  ReplacementBuilder out;
  return replace_into(out, *this, pattern, replacement, false) ? out.build() : *this;
}
String String::replaceAll(const String& pattern, const String& replacement) const {
  ReplacementBuilder out;
  return replace_into(out, *this, pattern, replacement, true) ? out.build() : *this;
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
  if (n > cap - len) {  // cap >= len: no wrap-around
    if (n > MAX_STR || len + n > MAX_STR) panic("RangeError: Invalid string length");
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
  String t = s.trim(); const char* p = t.ptr(); uint32_t n = t.bytes();
  uint32_t sign = n && (p[0] == '+' || p[0] == '-') ? 1 : 0;
  if (n - sign >= 8 && __builtin_memcmp(p + sign, "Infinity", 8) == 0) return p[0] == '-' ? -Inf : Inf;
  // the longest StrDecimalLiteral prefix: strtod alone also reads hex ("0x10" is 0 in JS), "inf" and "nan"
  uint32_t len = dyn_dec_len(p, n);
  return len ? dyn_strtod(p, len) : NaN;
}
double parse_int(const String& s, int32_t radix) {
  String t = s.trim(); const char* p = t.ptr(); uint32_t n = t.bytes(), i = 0;
  bool neg = false;
  if (radix != 0 && (radix < 2 || radix > 36)) return NaN;
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
  if (digits < 0 || digits > 100) panic("RangeError: toFixed() digits argument must be between 0 and 100");
  if (!(v > -1e21 && v < 1e21)) return cat(v);  // NaN, infinities and |v| >= 1e21 print like ToString (JS)
  if (v == 0) v = 0;  // (-0).toFixed(1) is "0.0" (but (-1e-7).toFixed(1) is "-0.0")
  char b[400];
  int n = zrt_host_fixed(v, digits, b, (int)sizeof b);
  return String::from(b, (uint32_t)n);
}
// Deterministic mode (docs/guide/06-testing.md, Determinism): ZINC_DETERMINISTIC=1, ZINC_RECORD=tape or
// ZINC_REPLAY=tape. Date.now / performance.now / timers read a virtual clock advanced by the frame time (and, between
// frames of a program without a frame loop, straight to the next timer); frames use a fixed dt; HAL input is replaced
// by nothing (1), recorded (2) or read back from a tape (3).
int32_t det_mode = 0;
static double vclock = 0;  // virtual ms since start
double now_ms() { return det_mode ? vclock : (double)hal_time_us() / 1000.0; }

namespace math {
static uint32_t rng = defaultSeed;
double random() { return random(rng); } // xorshift32, identical in sim/zinc.mjs
void seed(uint32_t s) { seed(rng, s); }
}

// ---------- event loop (RT-10) ----------
struct Label { String name; double t; int32_t n; };
static Label labels[32];
struct Timer { Fn<void()> f; double at, every; int32_t id; };
static const int MAX_TIMERS = ZRT_TIMERS;
static Timer timers[MAX_TIMERS];
static int32_t next_timer_id = 1;
Fn<void(double)> frame_cb;
HalInput input, prev_input;
int32_t frame_no = 0;
bool quit_requested = false;
int32_t surf_w = 320, surf_h = 240;
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
static const int MQ = ZRT_MICROTASKS;
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
static bool thrown = false;
void uncaught(const Ref<Error>& e) {
  StrBuilder sb; sb.cstr("Uncaught ");
  if (e.p) e.p->zrt_str(sb); else sb.cstr("Error");
  sb.ch('\0');
  thrown = true;  // report the stack of the `throw` (loc_throw), not the current one
  crash(sb.buf, "", 0);
}
static uint32_t pollers_added = 0;
void add_poller(Poller* p) { p->next = pollers; pollers = p; pollers_added++; }
static void (*finishers[16])();
static int nfinishers = 0;
void at_finish(void (*f)()) { if (nfinishers < 16) finishers[nfinishers++] = f; }
static bool poll_all() {
  bool active = false;
  for (Poller* p = pollers; p; p = p->next) { if (p->poll()) active = true; drain_microtasks(); }
  return active;
}

// Runs due timers in JS order (due time, then creation), each followed by its microtasks; returns the due time of the
// next pending timer, or -1 when there is none. ponytail: O(timers) scan per firing, fine for ZRT_TIMERS = 64.
static double run_timers() {
  for (;;) {
    int k = -1;
    for (int i = 0; i < MAX_TIMERS; i++)
      if (timers[i].id && (k < 0 || timers[i].at < timers[k].at || (timers[i].at == timers[k].at && timers[i].id < timers[k].id))) k = i;
    if (k < 0) return -1;
    double t = now_ms();
    if (timers[k].at > t) return timers[k].at;
    Fn<void()> f = timers[k].f;
    if (timers[k].every < 0) { timers[k].id = 0; timers[k].f = nullptr; }
    else {
      timers[k].at += timers[k].every;
      // real time: an interval that fell behind (a long frame, a suspended machine) skips ahead instead of bursting
      if (!det_mode && timers[k].at <= t) timers[k].at = t + timers[k].every;
    }
    f();
    check_uncaught();
    drain_microtasks();
  }
}

#ifndef ZRT_MIN_FRAME_US
#define ZRT_MIN_FRAME_US 8000  // 125 fps
#endif
bool poll_host(bool& frame) {
  frame = bool(frame_cb);
  if (frame) return loop_once();
  drain_microtasks();
  const uint32_t added=pollers_added;
  const double next=run_timers();
  const bool active=poll_all();
  return !quit_requested && (active || next>=0 || mq_len || added!=pollers_added);
}
bool display_driver = false;  // a plugins/display-* driver took over the screen and input
// Input tape (ZINC_RECORD / ZINC_REPLAY): a header, then {frame, HalInput} for every frame whose input differs from the
// previous one. ponytail: raw structs (~1 KB per changed frame, little-endian hosts with the same hal.h); pen samples
// (hal_pen_push) and window resizes are not recorded.
static const char TAPE_MAGIC[8] = {'Z', 'T', 'A', 'P', 'E', '1', 0, 0};
static void* tape = nullptr;
static HalInput tape_in, tape_next;  // replay: input in effect, next record
static int32_t tape_at = -1;         // frame of tape_next (-1: tape ended)
static void tape_read() {
  int32_t f;
  tape_at = tape && zrt_host_io(tape, &f, 4, 0) == 4 && zrt_host_io(tape, &tape_next, sizeof tape_next, 0) == sizeof tape_next ? f : -1;
  // a tape is a file: its counts index fixed arrays (touches, keys, text), so they are clamped like a HAL's would be
  HalInput& in = tape_next;
  auto clamp = [](int32_t& n, int32_t max) { n = n < 0 ? 0 : n > max ? max : n; };
  clamp(in.ntouch, HAL_MAX_TOUCH); clamp(in.nkeys, HAL_MAX_KEYS); clamp(in.nbtn, HAL_MAX_BUTTON_EVENTS); clamp(in.ntext, HAL_TEXT_BYTES);
  for (int32_t i = 0; i < in.nkeys; i++) if ((uint32_t)in.keys[i].off + in.keys[i].len > HAL_TEXT_BYTES) in.keys[i].off = in.keys[i].len = 0;
}
static void det_init() {
  const char* rec = hal_env("ZINC_RECORD");
  const char* rep = hal_env("ZINC_REPLAY");
  const char* d = hal_env("ZINC_DETERMINISTIC");
  det_mode = rep && *rep ? 3 : rec && *rec ? 2 : d && *d && *d != '0' ? 1 : 0;
  vclock = 0;
  tape_in = HalInput{};
  tape_in.pinch = 1;
  if (det_mode < 2) return;
  const char* file = det_mode == 3 ? rep : rec;
  tape = zrt_host_open(file, det_mode == 3 ? "rb" : "wb");
  if (!tape) hal_panic("cannot open the input tape", file, 0);
  uint32_t hdr[3];
  __builtin_memcpy(hdr, TAPE_MAGIC, 8);
  hdr[2] = (uint32_t)sizeof(HalInput);
  if (det_mode == 2) { zrt_host_io(tape, hdr, sizeof hdr, 1); return; }
  uint32_t got[3] = {};
  if (zrt_host_io(tape, got, sizeof got, 0) != sizeof got || __builtin_memcmp(got, hdr, sizeof hdr)) hal_panic("not an input tape of this Zinc version", file, 0);
  tape_read();
}
/** After the HAL has polled: keeps (and records) or replaces the input of this frame. The HAL's quit stays. */
static void det_input() {
  if (det_mode == 2) {
    if (__builtin_memcmp(&input, &tape_in, sizeof input)) { tape_in = input; zrt_host_io(tape, &frame_no, 4, 1); zrt_host_io(tape, &input, sizeof input, 1); }
    return;
  }
  while (tape_at >= 0 && tape_at <= frame_no) { tape_in = tape_next; tape_read(); }
  int32_t quit = input.quit;
  input = tape_in;
  input.quit = quit;
}
static void det_finish() { if (tape) zrt_host_close(tape); tape = nullptr; }

void start(const HalConfig& cfg, int argc, char** argv) {
  zrt_argc = argc; zrt_argv = argv;
  det_init();
  hal_init(&cfg); surf_w = cfg.width; surf_h = cfg.height;
  display_driver = hal_display && hal_display->init(&cfg);
}

namespace gfx { void begin_frame(); void end_frame(); void sync_surface(); }

// One iteration of the main loop; false when the program is finished (used by the wasm HAL too).
static uint64_t last_frame_us = 0;
static bool in_frame = false;
bool loop_once() {
  drain_microtasks();
  if (frame_cb && !quit_requested) {
    hal_frame_begin();
    prev_input = input;
    input.wheel = 0; input.pinch = 1;
    hal_poll_input(&input);
    if (display_driver && hal_display->poll) hal_display->poll(&input);
    if (input.quit) return false;
    if (det_mode) det_input();
    uint64_t t = hal_time_us();
    double dt = display_driver && !det_mode ? 0 : hal_fixed_dt();
    if (det_mode && dt <= 0) dt = 1.0 / 60.0;
    if (!last_frame_us) last_frame_us = t;
    if (dt <= 0) { dt = (double)(t - last_frame_us) / 1e6; if (dt > 0.1) dt = 0.1; }
    last_frame_us = t;
    vclock += dt * 1000.0;  // the same expression as sim/zinc.mjs: identical doubles
    run_timers();
    poll_all();
    gfx::sync_surface();
    in_frame = true;
    gfx::begin_frame();
    Fn<void(double)> cb = frame_cb;
    cb(dt);
    check_uncaught();
    drain_microtasks();
    gfx::end_frame();
    in_frame = false;
    frame_no++;
    stats.frames++;
    stats.frame_us = hal_time_us() - t;
    if (telemetry_frame) telemetry_frame();
    hal_frame_end();
#ifndef __EMSCRIPTEN__
    // cap the frame rate when presenting does not block on vsync (hidden window, fbdev): saves CPU, keeps dt sane
    if (!det_mode && (display_driver || hal_fixed_dt() <= 0)) { uint64_t spent = hal_time_us() - t; if (spent < ZRT_MIN_FRAME_US) hal_sleep_us(ZRT_MIN_FRAME_US - spent); }
#endif
    return true;
  }
  uint32_t added = pollers_added;
  double next = run_timers();
  bool active = poll_all() || added != pollers_added;
  if (!quit_requested && next < 0 && !active && !mq_len) {
    // a callback run by a later poller may have started work on an earlier one that already reported idle (a fetch
    // issued after the fetcher's poll) or armed a timer: look once more before ending the program
    next = run_timers();
    active = poll_all() || added != pollers_added;
  }
  if (quit_requested || (next < 0 && !active && !mq_len)) return false;
  if (det_mode) {
    // no waiting for timers: the clock jumps to the next one; while pollers have work (sockets), 1 virtual ms per
    // real ms, like the sleep below
    double to = active ? vclock + 1 : next;
    if (next >= 0 && next < to) to = next;
    if (active) hal_sleep_us(1000);
    if (to > vclock) vclock = to;
    return true;
  }
  if (active) hal_sleep_us(1000);
  else if (next >= 0) { double wait = next - now_ms(); if (wait > 0) hal_sleep_us(wait < 1000 ? (uint64_t)(wait * 1000) : 1000000); }  // huge delays: wake up every second
  return true;
}
static int loop_step() { return loop_once() ? 1 : 0; }
}  // namespace zrt
extern "C" void zrt_redraw(void) {
  using namespace zrt;
  // deterministic runs: the window system must not run extra frames (the last one stays on screen)
  if (in_frame || !frame_cb || quit_requested || det_mode) return;
  in_frame = true;
  gfx::sync_surface();
  gfx::begin_frame();
  Fn<void(double)> cb = frame_cb;
  cb(0);
  check_uncaught();
  drain_microtasks();
  gfx::end_frame();
  in_frame = false;
}
namespace zrt {
void run_loop() { hal_run(loop_step); }

// Releases what the program holds in the runtime (callbacks, timers, queues); the HAL stays up.
static void teardown() {
  frame_cb = nullptr;
  for (Poller* p = pollers; p; p = p->next) p->shutdown();
  for (int i = 0; i < nfinishers; i++) finishers[i]();
  for (int i = 0; i < mq_len; i++) mq[(mq_head + i) % MQ] = nullptr;
  mq_len = 0;
  for (int i = 0; i < unhandled_n; i++) release(unhandled[i]);
  unhandled_n = 0;
  g_err = nullptr;
  for (auto& l : labels) l.name = String();
  for (int i = 0; i < MAX_TIMERS; i++) { timers[i].id = 0; timers[i].f = nullptr; }
  // pending promises and the async frames awaiting them reference each other: drop the continuations
  // (the promises are held while their lists are cleared, since clearing can free other promises)
  {
    Array<Ref<PromiseBase>> live = Array<Ref<PromiseBase>>::with_cap(0);
    for (PromiseBase* p = promises_head; p; p = p->next_live) live.push(Ref<PromiseBase>(p));
    for (int32_t i = 0; i < live.length(); i++) live.get(i)->conts = Array<Fn<void()>>::with_cap(0);
  }
  drain_deferred();
}
PromiseBase* promises_head = nullptr;
void finish() {
  teardown();
  if (hal_trap_faults) hal_trap_faults(nullptr);
#ifdef ZRT_DEBUG
  if (live_objects) {  // MEM-18: leak report
    StrBuilder sb; sb.cstr("zinc: "); to_s(sb, (int64_t)live_objects); sb.cstr(" object(s) still alive at exit");
    log_flush(sb);
  }
#endif
#ifdef ZRT_DEV
  if (live_objects) {  // the hot-reload host discards the heap wholesale; this shows what the old version kept
    StrBuilder sb; sb.cstr("zinc dev: "); to_s(sb, (int64_t)live_objects); sb.cstr(" object(s) alive at teardown (heap discarded)\n");
    hal_log_err(sb.buf, sb.len);
  }
#endif
  det_finish();
  if (display_driver && hal_display->shutdown) hal_display->shutdown();
  hal_shutdown();
}

// ---------- crash handling (docs/dev-mode.md) ----------
// A panic, an uncaught error or (POSIX) a fatal signal longjmps back to the guarded step. Policy 1 draws the red box
// (gfx builds) and restarts on A/Start; policy 2 restarts at once. Restart = deinit + teardown + init, in process:
// objects held by the abandoned stack frames leak (bounded by what the stack held).
LocFrame loc_root(nullptr);
LocFrame* loc_top = &loc_root;
const char* const* loc_names = nullptr;
static uint32_t throw_locs[8];
static int throw_n = 0;
void loc_throw() {
  throw_n = 0;
  for (LocFrame* f = loc_top; f && throw_n < 8; f = f->up) if (f->loc) throw_locs[throw_n++] = f->loc;
}
namespace gfx {
__attribute__((weak)) bool crash_screen(const char*, uint32_t) { return false; }  // red box; false without a screen
__attribute__((weak)) void present_overlay() {}
__attribute__((weak)) void log_banner(int, const char*, uint32_t) {}
}
static jmp_buf crash_env;
static bool armed = false, crashed = false;
static char crash_text[2048];
static uint32_t crash_len = 0;
static void (*app_init)() = nullptr;
static void (*app_deinit)() = nullptr;
static void ct_add(const char* s) { while (*s && crash_len + 1 < sizeof crash_text) crash_text[crash_len++] = *s++; crash_text[crash_len] = 0; }

static void crash(const char* msg, const char* file, int line) {
  if (ZRT_CRASH == 0 || !armed) hal_panic(msg, file, line);
  armed = false;  // a fault while handling this one is fatal
  crash_len = 0;
  ct_add(msg);
  if (file && *file) {
    char n[16]; int k = 15; n[k] = 0; uint32_t v = (uint32_t)line; do { n[--k] = (char)('0' + v % 10); v /= 10; } while (v && k);
    ct_add(" ("); ct_add(file); ct_add(":"); ct_add(n + k); ct_add(")");
  }
  if (loc_names) {
    uint32_t ids[8]; int n = 0;
    if (thrown && throw_n) { for (int i = 0; i < throw_n; i++) ids[n++] = throw_locs[i]; }
    else for (LocFrame* f = loc_top; f && n < 8; f = f->up) if (f->loc) ids[n++] = f->loc;
    for (int i = 0; i < n; i++) { ct_add("\n    at "); ct_add(loc_names[ids[i]]); }
  }
  thrown = false;
  hal_log_err("panic: ", 7); hal_log_err(crash_text, crash_len); hal_log_err("\n", 1);
  longjmp(crash_env, 1);
}
static void on_fault(const char* what) { crash(what, "", 0); }

// Runs f; false when it crashed (the runtime state is reset to the guard point).
static bool guarded(void (*f)()) {
  if (setjmp(crash_env)) { loc_top = &loc_root; cascade_depth = 0; return false; }
  armed = true;
  f();
  armed = false;
  return true;
}
static bool step_result;
static void step_body() { step_result = loop_once(); }
static bool boxed = false;  // the red box is on screen
[[maybe_unused]] static double crash_at[3] = {-1e9, -1e9, -1e9};
static void crashed_now();
static void restart() {
  crashed = boxed = false;
  guarded(app_deinit);  // may fault on a broken state: the rest is abandoned
  teardown();
  gfx::crash_screen(nullptr, 0);
  if (!guarded(app_init)) crashed_now();
  else loc_root.loc = 0;
}
static void crashed_now() {
  crashed = true;
  if (ZRT_CRASH == 1 && gfx::crash_screen(crash_text, crash_len)) { boxed = true; return; }
#ifndef ZRT_DEV  // dev without a screen: the program stops, the dev host waits for the next build
  // automatic restart (policy 2, or a red box without a screen); three crashes within five seconds give up
  crash_at[0] = crash_at[1]; crash_at[1] = crash_at[2]; crash_at[2] = now_ms();
  if (crash_at[2] - crash_at[0] < 5000) hal_panic("crash loop (3 crashes in 5 s), giving up", "", 0);
  hal_log_err("zinc: restarting\n", 17);
  restart();
#endif
}
// Red box loop: keeps the window alive, restarts on A/Start/click.
static int crash_step() {
  if (!boxed) return 0;
  hal_frame_begin();
  prev_input = input;
  input.wheel = 0; input.pinch = 1;
  hal_poll_input(&input);
  if (display_driver && hal_display->poll) hal_display->poll(&input);
  if (input.quit) return 0;
  gfx::present_overlay();
  hal_frame_end();
  uint32_t pressed = input.buttons & ~prev_input.buttons;
  if ((pressed & (HAL_A | HAL_START)) || (!input.pdown && prev_input.pdown)) restart();
  return 1;
}
static int app_step() {
  if (crashed) return crash_step();
  if (!guarded(step_body)) { crashed_now(); return 1; }
  return step_result ? 1 : 0;
}

int app_main(const HalConfig& cfg, int argc, char** argv, void (*init)(), void (*deinit)()) {
  start(cfg, argc, argv);
  app_init = init; app_deinit = deinit;
  if (ZRT_CRASH == 0) { init(); run_loop(); deinit(); finish(); return 0; }
  if (hal_trap_faults) hal_trap_faults(on_fault);
  if (!guarded(init)) crashed_now();
  loc_root.loc = 0;  // module code has run; later frames report their own functions
  hal_run(app_step);
  if (!crashed) guarded(deinit);
  finish();
  return crashed ? 101 : 0;
}

// ---------- console (RT-07, LLRT-style levels, optional JSON lines) ----------
static int log_mode = -1;  // 0 plain, 1 color (tty), 2 json
static void log_init() {
  if (log_mode >= 0) return;
  const char* f = hal_env("ZINC_LOG_FORMAT");
  log_mode = (f && f[0] == 'j') ? 2 : hal_isatty(1) ? 1 : 0;
}
void (*inspector_log)(int level, const char* s, uint32_t n) = nullptr;
bool log_color() { log_init(); return log_mode == 1; }
void log_emit(int level, StrBuilder& sb) {
  log_init();
  if (telemetry_log) telemetry_log(level, sb.buf, sb.len);
  if (inspector_log) inspector_log(level, sb.buf, sb.len);
#ifdef ZRT_DEV
  if (level == LOG_WARN || level == LOG_ERROR) gfx::log_banner(level, sb.buf, sb.len);  // LogBox-style banner
#endif
  bool err = level == LOG_WARN || level == LOG_ERROR || level == LOG_TRACE;
  static const char* names[] = {"LOG", "INFO", "DEBUG", "WARN", "ERROR", "TRACE"};
  if (log_mode == 2) {
    StrBuilder j; j.cstr("{\"time\":"); str_num(j, now_ms()); j.cstr(",\"level\":\""); j.cstr(names[level]); j.cstr("\",\"message\":");
    json_str(j, sb.build()); j.cstr("}\n");
    hal_log(j.buf, j.len);
    return;
  }
  if (log_mode == 1 && err && !__builtin_memchr(sb.buf, 0x1b, sb.len)) {  // plain text lines: whole line in colour
    StrBuilder c; c.cstr(level == LOG_WARN ? "\033[33m" : "\033[31m"); c.raw(sb.buf, sb.len); c.cstr("\033[0m\n");
    hal_log_err(c.buf, c.len);
    return;
  }
  sb.ch('\n');
  if (err) hal_log_err(sb.buf, sb.len); else hal_log(sb.buf, sb.len);
}
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
  if (bytes > 1073741824.0) panic("RangeError: arena too large");
  a->size = bytes >= 256 ? (size_t)bytes : 256;  // NaN too
  a->base = (char*)alloc(a->size);
  a->prev = arena_top; arena_top = a;
  return Ref<Arena>::adopt(a);
}
void Arena::zrt_dispose() {
  if (!base) return;
  if (live) panic("an object allocated in an arena outlives it (MEM-07); copy it out with arena.promote(x)");
  // unlink wherever it is: an arena disposed out of order must not stay in the chain after it is freed
  for (Arena** pp = &arena_top; *pp; pp = &(*pp)->prev) if (*pp == this) { *pp = prev; break; }
  mfree(base); base = nullptr;  // O(1): nothing inside is freed individually
}
Arena::~Arena() { zrt_dispose(); }
}
// zinc:gfx lives in runtime/gfx.cpp (linked only by programs that draw); these defaults keep other programs small.
namespace gfx {
__attribute__((weak)) void begin_frame() {}
__attribute__((weak)) void sync_surface() {}
__attribute__((weak)) void end_frame() {}
}

}  // namespace zrt
