#include "zn/js_ext.h"

#include <vector>

namespace zn::qjs {
namespace {
std::vector<ContextHook>& hooks() { static std::vector<ContextHook> v; return v; }
}  // namespace
void addContextHook(ContextHook h) { hooks().push_back(h); }
void runContextHooks(JSContext* ctx) { for (ContextHook h : hooks()) h(ctx); }

// The web classes that loaders and engines expect, for the main program and for zinc:script contexts alike.
const char* kWebShims = R"JS((g => {
  // TextEncoder / TextDecoder (UTF-8 only): glTF and other loaders decode their JSON chunks with them (ZN-204)
  if (typeof g.TextEncoder === 'undefined') {
    g.TextEncoder = class TextEncoder {
      get encoding() { return 'utf-8'; }
      encode(s = '') {
        const out = [];
        s = String(s);
        for (let i = 0; i < s.length; i++) {
          let c = s.codePointAt(i);
          if (c > 0xffff) i++;
          if (c < 0x80) out.push(c);
          else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
          else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
          else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        }
        return new Uint8Array(out);
      }
    };
  }
  if (typeof g.TextDecoder === 'undefined') {
    g.TextDecoder = class TextDecoder {
      constructor(label = 'utf-8') { this.encoding = String(label).toLowerCase() === 'utf8' ? 'utf-8' : String(label).toLowerCase(); }
      decode(buf) {
        if (buf === undefined) return '';
        const b = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
        let s = '';
        for (let i = 0; i < b.length;) {
          const c = b[i++];
          let cp;
          if (c < 0x80) cp = c;
          else if (c >= 0xc0 && c < 0xe0 && i < b.length) cp = ((c & 31) << 6) | (b[i++] & 63);
          else if (c >= 0xe0 && c < 0xf0 && i + 1 < b.length) { cp = ((c & 15) << 12) | ((b[i] & 63) << 6) | (b[i + 1] & 63); i += 2; }
          else if (c >= 0xf0 && i + 2 < b.length) { cp = ((c & 7) << 18) | ((b[i] & 63) << 12) | ((b[i + 1] & 63) << 6) | (b[i + 2] & 63); i += 3; }
          else cp = 0xfffd;
          s += String.fromCodePoint(cp);
        }
        return s;
      }
    };
  }
  if (typeof g.AbortController === 'undefined') {   // loaders take a signal; nothing here is cancelled by one
    class AbortSignal { constructor() { this.aborted = false; this._l = []; } addEventListener(t, f) { if (t === 'abort') this._l.push(f); } removeEventListener(t, f) { this._l = this._l.filter(x => x !== f); } }
    g.AbortSignal = AbortSignal;
    g.AbortController = class AbortController { constructor() { this.signal = new AbortSignal(); } abort() { if (this.signal.aborted) return; this.signal.aborted = true; for (const f of this.signal._l) f({ type: 'abort' }); } };
  }
})(globalThis);
)JS";
}  // namespace zn::qjs
