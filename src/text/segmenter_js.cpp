// Intl.Segmenter for the QuickJS engine (ZN-165): grapheme, word (and the non-standard "line") granularity over libunibreak. Indices are UTF-16 offsets, as in the standard.
// ponytail: no dictionary word breaking (Thai, CJK words stay UAX #29 runs, ICU uses dictionaries) and no sentence granularity.
#include <string>
#include <vector>
#include <napi/js_native_api.h>
#include "text/segment.h"
#include "zn/js_ext.h"

namespace zn::text {
namespace {

// __zincSegBreaks(str, kind 0|1|2) -> array of boundaries in UTF-16 units
napi_value js_breaks(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  napi_value arr;
  napi_create_array(env, &arr);
  size_t len = 0;
  if (argc < 2 || napi_get_value_string_utf8(env, argv[0], nullptr, 0, &len) != napi_ok) return arr;
  std::string s(len, '\0');
  napi_get_value_string_utf8(env, argv[0], s.data(), len + 1, &len);
  int32_t kind = 0;
  napi_get_value_int32(env, argv[1], &kind);
  // utf-8 boundaries, converted to UTF-16 units while walking the bytes (a 4-byte sequence is two units)
  std::vector<uint32_t> bs = boundaries(s, kind == 1 ? Seg::Word : kind == 2 ? Seg::Line : Seg::Grapheme);
  uint32_t units = 0, at = 0, k = 0;
  for (size_t i = 0; i < len && k < bs.size();) {
    unsigned char b = (unsigned char)s[i];
    size_t n = b < 0x80 ? 1 : b < 0xE0 ? 2 : b < 0xF0 ? 3 : 4;
    units += n == 4 ? 2 : 1;
    i += n;
    if (i >= bs[k]) {
      napi_value u;
      napi_create_uint32(env, units, &u);
      napi_set_element(env, arr, at++, u);
      ++k;
    }
  }
  return arr;
}

const char* kShim = R"JS(
(function (g) {
  const KINDS = { grapheme: 0, word: 1, line: 2 };
  const wordLike = (s) => { for (const ch of s) { const c = ch.codePointAt(0); if (c < 128 ? /[0-9A-Za-z_]/.test(ch) : !((c >= 0x2000 && c <= 0x2BFF) || (c >= 0x3000 && c <= 0x303F) || (c >= 0xFE00 && c <= 0xFE0F) || c >= 0x1F000 || /\s/.test(ch))) return true; } return false; };
  class Segments {
    constructor(seg, input) { this._k = seg; this._s = String(input); const b = __zincSegBreaks(this._s, KINDS[seg.granularity]); this._b = b; }
    _at(i) { const s = this._s, from = i ? this._b[i - 1] : 0, to = this._b[i]; const seg = s.slice(from, to); const r = { segment: seg, index: from, input: s }; if (this._k.granularity === 'word') r.isWordLike = wordLike(seg); return r; }
    containing(index) { index = Math.trunc(Number(index)) || 0; if (index < 0 || index >= this._s.length) return undefined; for (let i = 0; i < this._b.length; i++) if (index < this._b[i]) return this._at(i); return undefined; }
    [Symbol.iterator]() { let i = 0; const self = this; return { next() { return i < self._b.length ? { value: self._at(i++), done: false } : { value: undefined, done: true }; }, [Symbol.iterator]() { return this; } }; }
  }
  class Segmenter {
    constructor(locales, options) { const gr = (options && options.granularity) || 'grapheme'; if (!(gr in KINDS)) throw new RangeError('Value ' + gr + ' out of range for Intl.Segmenter options property granularity'); this._gr = gr; this._loc = Array.isArray(locales) ? locales[0] : locales; }
    get granularity() { return this._gr; }
    segment(input) { return new Segments({ granularity: this._gr }, input); }
    resolvedOptions() { return { locale: this._loc || 'en-US', granularity: this._gr }; }
    static supportedLocalesOf(l) { return Array.isArray(l) ? l : l ? [l] : []; }
  }
  if (typeof g.Intl === 'undefined') g.Intl = {};
  if (!g.Intl.Segmenter) Object.defineProperty(g.Intl, 'Segmenter', { value: Segmenter, writable: true, configurable: true });
})(globalThis);
)JS";

void install(napi_env env) {
  napi_value global, fn, src, r;
  napi_get_global(env, &global);
  napi_create_function(env, "__zincSegBreaks", NAPI_AUTO_LENGTH, js_breaks, nullptr, &fn);
  napi_set_named_property(env, global, "__zincSegBreaks", fn);
  napi_create_string_utf8(env, kShim, NAPI_AUTO_LENGTH, &src);
  napi_run_script(env, src, "<intl-segmenter>", &r);
}

}  // namespace

void installSegmenter() { zn::qjs::addContextHook(install); }

}  // namespace zn::text
