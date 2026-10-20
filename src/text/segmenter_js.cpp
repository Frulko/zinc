// Intl.Segmenter for the QuickJS engine (ZN-165): grapheme, word (and the non-standard "line") granularity over libunibreak. Indices are UTF-16 offsets, as in the standard.
// ponytail: no dictionary word breaking (Thai, CJK words stay UAX #29 runs, ICU uses dictionaries) and no sentence granularity.
#include <string>
#include <vector>
#include "quickjs.h"
#include "text/segment.h"
#include "zn/js_ext.h"

namespace zn::text {
namespace {

// __zincSegBreaks(str, kind 0|1|2) -> array of boundaries in UTF-16 units
JSValue js_breaks(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
  JSValue arr = JS_NewArray(c);
  if (argc < 2) return arr;
  size_t len = 0;
  const char* s = JS_ToCStringLen(c, &len, argv[0]);
  if (!s) return arr;
  int kind = 0;
  JS_ToInt32(c, &kind, argv[1]);
  // utf-8 boundaries, converted to UTF-16 units while walking the bytes (a 4-byte sequence is two units)
  std::vector<uint32_t> bs = boundaries(std::string_view(s, len), kind == 1 ? Seg::Word : kind == 2 ? Seg::Line : Seg::Grapheme);
  uint32_t units = 0, at = 0, k = 0;
  for (size_t i = 0; i < len && k < bs.size();) {
    unsigned char b = (unsigned char)s[i];
    size_t n = b < 0x80 ? 1 : b < 0xE0 ? 2 : b < 0xF0 ? 3 : 4;
    units += n == 4 ? 2 : 1;
    i += n;
    if (i >= bs[k]) JS_SetPropertyUint32(c, arr, at++, JS_NewUint32(c, units)), ++k;
  }
  JS_FreeCString(c, s);
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

void install(JSContext* c) {
  JSValue global = JS_GetGlobalObject(c);
  JS_SetPropertyStr(c, global, "__zincSegBreaks", JS_NewCFunction(c, js_breaks, "__zincSegBreaks", 2));
  JSValue r = JS_Eval(c, kShim, std::char_traits<char>::length(kShim), "<intl-segmenter>", JS_EVAL_TYPE_GLOBAL);
  JS_FreeValue(c, r);
  JS_FreeValue(c, global);
}

}  // namespace

void installSegmenter() { zn::qjs::addContextHook(install); }

}  // namespace zn::text
