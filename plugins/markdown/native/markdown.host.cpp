// zinc:markdown for macos and linux (rmpp includes this file): md4c's callbacks as one string of records (markdown.spec.ts).
// Entities are decoded here with md4c's own table (vendor/md4c/entity.c), so the Zinc side only sees UTF-8 text.
#include "zinc_native_markdown.h"
#include "../vendor/md4c/md4c.h"
extern "C" {
#include "../vendor/md4c/entity.h"
}
#include <string.h>

namespace {
struct Out { zrt::StrBuilder sb; };

void utf8(zrt::StrBuilder& sb, unsigned c) {
  if (c == 0 || c > 0x10ffff || (c >= 0xd800 && c <= 0xdfff)) c = 0xfffd;
  if (c < 0x80) sb.ch((char)c);
  else if (c < 0x800) { sb.ch((char)(0xc0 | (c >> 6))); sb.ch((char)(0x80 | (c & 0x3f))); }
  else if (c < 0x10000) { sb.ch((char)(0xe0 | (c >> 12))); sb.ch((char)(0x80 | ((c >> 6) & 0x3f))); sb.ch((char)(0x80 | (c & 0x3f))); }
  else { sb.ch((char)(0xf0 | (c >> 18))); sb.ch((char)(0x80 | ((c >> 12) & 0x3f))); sb.ch((char)(0x80 | ((c >> 6) & 0x3f))); sb.ch((char)(0x80 | (c & 0x3f))); }
}
// verbatim text, the record separators replaced by spaces
void raw(zrt::StrBuilder& sb, const char* p, unsigned n) {
  for (unsigned i = 0; i < n; i++) sb.ch(p[i] == '\x1e' || p[i] == '\x1f' ? ' ' : p[i]);
}
void entity(zrt::StrBuilder& sb, const char* t, unsigned n) {
  if (n > 3 && t[1] == '#') {
    unsigned c = 0;
    if (t[2] == 'x' || t[2] == 'X') for (unsigned i = 3; i + 1 < n; i++) { char h = t[i]; c = 16 * c + (h <= '9' ? h - '0' : (h | 0x20) - 'a' + 10); }
    else for (unsigned i = 2; i + 1 < n; i++) c = 10 * c + (t[i] - '0');
    utf8(sb, c);
    return;
  }
  const ENTITY* e = entity_lookup(t, n);
  if (!e) { raw(sb, t, n); return; }
  utf8(sb, e->codepoints[0]);
  if (e->codepoints[1]) utf8(sb, e->codepoints[1]);
}
void attr(zrt::StrBuilder& sb, const MD_ATTRIBUTE& a) {
  if (!a.text) return;
  for (int i = 0; a.substr_offsets[i] < a.size; i++) {
    const char* p = a.text + a.substr_offsets[i];
    unsigned n = a.substr_offsets[i + 1] - a.substr_offsets[i];
    if (a.substr_types[i] == MD_TEXT_ENTITY) entity(sb, p, n);
    else if (a.substr_types[i] == MD_TEXT_NULLCHAR) utf8(sb, 0xfffd);
    else raw(sb, p, n);
  }
}
void head(Out* o, char op, int type, long a, long b) {
  zrt::StrBuilder& sb = o->sb;
  sb.ch(op); zrt::to_s(sb, (int64_t)type); sb.ch('\x1f'); zrt::to_s(sb, (int64_t)a); sb.ch('\x1f'); zrt::to_s(sb, (int64_t)b); sb.ch('\x1f');
}
void tail(Out* o) { o->sb.ch('\x1f'); o->sb.ch('\x1e'); }

int enter_block(MD_BLOCKTYPE t, void* d, void* u) {
  Out* o = (Out*)u;
  long a = 0, b = 0;
  if (t == MD_BLOCK_H) a = ((MD_BLOCK_H_DETAIL*)d)->level;
  else if (t == MD_BLOCK_OL) a = ((MD_BLOCK_OL_DETAIL*)d)->start;
  else if (t == MD_BLOCK_LI) {
    const MD_BLOCK_LI_DETAIL* li = (MD_BLOCK_LI_DETAIL*)d;
    a = !li->is_task ? -1 : li->task_mark == ' ' ? 0 : 1;
    b = li->is_task ? (long)li->task_mark_offset : -1;
  } else if (t == MD_BLOCK_TH || t == MD_BLOCK_TD) a = ((MD_BLOCK_TD_DETAIL*)d)->align;
  head(o, 'B', t, a, b);
  if (t == MD_BLOCK_CODE) attr(o->sb, ((MD_BLOCK_CODE_DETAIL*)d)->lang);
  o->sb.ch('\x1f');
  tail(o);
  return 0;
}
int leave_block(MD_BLOCKTYPE t, void*, void* u) { Out* o = (Out*)u; head(o, 'b', t, 0, 0); o->sb.ch('\x1f'); tail(o); return 0; }
int enter_span(MD_SPANTYPE t, void* d, void* u) {
  Out* o = (Out*)u;
  head(o, 'S', t, 0, 0);
  if (t == MD_SPAN_A) { attr(o->sb, ((MD_SPAN_A_DETAIL*)d)->href); o->sb.ch('\x1f'); attr(o->sb, ((MD_SPAN_A_DETAIL*)d)->title); }
  else if (t == MD_SPAN_IMG) { attr(o->sb, ((MD_SPAN_IMG_DETAIL*)d)->src); o->sb.ch('\x1f'); attr(o->sb, ((MD_SPAN_IMG_DETAIL*)d)->title); }
  else if (t == MD_SPAN_WIKILINK) { attr(o->sb, ((MD_SPAN_WIKILINK_DETAIL*)d)->target); o->sb.ch('\x1f'); }
  else o->sb.ch('\x1f');
  tail(o);
  return 0;
}
int leave_span(MD_SPANTYPE t, void*, void* u) { Out* o = (Out*)u; head(o, 's', t, 0, 0); o->sb.ch('\x1f'); tail(o); return 0; }
int text(MD_TEXTTYPE t, const MD_CHAR* p, MD_SIZE n, void* u) {
  Out* o = (Out*)u;
  head(o, 'T', t, 0, 0);
  if (t == MD_TEXT_ENTITY) entity(o->sb, p, n);
  else if (t == MD_TEXT_NULLCHAR) utf8(o->sb, 0xfffd);
  else if (t != MD_TEXT_BR && t != MD_TEXT_SOFTBR) raw(o->sb, p, n);
  o->sb.ch('\x1f');
  tail(o);
  return 0;
}
}  // namespace

struct HostMarkdown : NativeMarkdown {
  zrt::String events(zrt::String src, int32_t flags) override {
    Out o;
    MD_PARSER p;
    memset(&p, 0, sizeof p);
    p.flags = (unsigned)flags;
    p.enter_block = enter_block; p.leave_block = leave_block; p.enter_span = enter_span; p.leave_span = leave_span; p.text = text;
    if (md_parse(src.ptr(), src.bytes(), &p, &o) != 0) return zrt::String();
    return o.sb.build();
  }
  zrt::String setByte(zrt::String src, int32_t offset, zrt::String mark) override {
    if (offset < 0 || (uint32_t)offset >= src.bytes() || mark.bytes() != 1) return src;
    zrt::StrBuilder sb;
    sb.raw(src.ptr(), src.bytes());
    sb.buf[offset] = mark.ptr()[0];
    return sb.build();
  }
  zrt::String version() override { return zrt::String::from("0.6.0", 5); }
};
NativeMarkdown* zinc_create_Markdown() { static HostMarkdown inst; inst.rc = zrt::IMMORTAL; return &inst; }
