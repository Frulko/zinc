// Port of wrapText, wrapPara and ellipsize of lib/std/ui.ts (ZN-284); keep the two in step. JavaScript counts UTF-16 units where this counts code points,
// which only differs for characters outside the BMP (break-all and break-words then cut at a whole character).
#include "host/text_wrap.h"

namespace zn::host {
namespace {

struct Wrapper {
  const TextMetric& m;
  const WrapStyle& s;

  double lineWidth(std::string_view t) const {
    double w = m.width(m.user, s.font, t, s.tracking);
    if (s.wordSpacing != 0) { int k = 0; for (char c : t) k += c == ' '; w += s.wordSpacing * k; }
    return w;
  }
  static std::size_t nextChar(std::string_view t, std::size_t i) {   // the byte after the UTF-8 character at i
    ++i;
    while (i < t.size() && (static_cast<unsigned char>(t[i]) & 0xC0) == 0x80) ++i;
    return i;
  }
  static std::size_t chars(std::string_view t) { std::size_t k = 0; for (std::size_t i = 0; i < t.size(); i = nextChar(t, i)) ++k; return k; }
  static std::size_t byteOf(std::string_view t, std::size_t k) { std::size_t i = 0; while (k-- > 0 && i < t.size()) i = nextChar(t, i); return i; }
  static std::vector<std::string_view> split(std::string_view t, char sep) {   // String.prototype.split: empty pieces kept
    std::vector<std::string_view> out;
    for (std::size_t a = 0;;) {
      std::size_t b = t.find(sep, a);
      out.push_back(t.substr(a, b == std::string_view::npos ? std::string_view::npos : b - a));
      if (b == std::string_view::npos) return out;
      a = b + 1;
    }
  }
  static std::string trimEnd(std::string s) {   // ponytail: ASCII white space and U+00A0; JavaScript's trimEnd also drops the other Unicode spaces
    for (;;) {
      if (!s.empty() && (s.back() == ' ' || (s.back() >= '\t' && s.back() <= '\r'))) s.pop_back();
      else if (s.size() >= 2 && static_cast<unsigned char>(s[s.size() - 2]) == 0xC2 && static_cast<unsigned char>(s.back()) == 0xA0) s.resize(s.size() - 2);
      else return s;
    }
  }

  /** Greedy wrap of one paragraph; limit > 0 stops once there are more than `limit` lines. */
  std::vector<std::string> para(std::string_view text, double avail, int limit) const {
    std::vector<std::string> out;
    if (lineWidth(text) <= avail || avail <= s.size) { out.emplace_back(text); return out; }
    std::string line;
    if (s.wordBreak == 2) {
      for (std::size_t i = 0; i < text.size();) {
        const std::size_t j = nextChar(text, i);
        std::string cand = line;
        cand.append(text.substr(i, j - i));
        if (lineWidth(cand) > avail && !line.empty()) { out.push_back(line); line.assign(text.substr(i, j - i)); if (limit > 0 && static_cast<int>(out.size()) > limit) return out; }
        else line = std::move(cand);
        i = j;
      }
    } else {
      for (std::string_view word : split(text, ' ')) {
        std::string cand = line.empty() ? std::string(word) : line + ' ' + std::string(word);
        if (lineWidth(cand) > avail && !line.empty()) { out.push_back(line); line.assign(word); if (limit > 0 && static_cast<int>(out.size()) > limit) return out; }
        else line = std::move(cand);
        if (s.wordBreak == 1) while (chars(line) > 1 && lineWidth(line) > avail) {
          std::size_t k = chars(line) - 1;
          while (k > 1 && lineWidth(std::string_view(line).substr(0, byteOf(line, k))) > avail) k--;
          const std::size_t cut = byteOf(line, k);
          out.push_back(line.substr(0, cut));
          line.erase(0, cut);
        }
      }
    }
    if (!line.empty() || out.empty()) out.push_back(line);
    return out;
  }
  /** `line` cut so that it and the ellipsis fit `avail`. */
  std::string ellipsize(const std::string& line, double avail) const {
    std::size_t lo = 0, hi = chars(line);
    while (lo < hi) {
      const std::size_t mid = (lo + hi + 1) >> 1;
      if (lineWidth(trimEnd(line.substr(0, byteOf(line, mid))) + "…") > avail) hi = mid - 1; else lo = mid;
    }
    return trimEnd(line.substr(0, byteOf(line, lo))) + "…";
  }
};

}  // namespace

void wrapLines(const TextMetric& metric, const WrapStyle& style, std::string_view text, double avail, std::vector<std::string>& lines, std::vector<double>& widths) {
  const Wrapper w{metric, style};
  const WrapStyle& s = style;
  lines.clear();
  widths.clear();
  if (s.whiteSpace == 0 && s.wordBreak == 0 && s.clamp == 0 && !s.ellipsis && !s.balance) lines = w.para(text, avail, 0);
  else {
    const std::vector<std::string_view> paras = s.whiteSpace >= 2 ? Wrapper::split(text, '\n') : std::vector<std::string_view>{text};
    const bool cut = s.clamp > 0 && !s.balance;   // a clamp without balance needs one line more than the clamp, no more
    for (std::string_view p : paras) {
      if (cut && static_cast<int>(lines.size()) > s.clamp) break;
      if (s.whiteSpace == 1 || s.whiteSpace == 2) lines.emplace_back(p);
      else if (paras.size() == 1) lines = w.para(p, avail, cut ? s.clamp : 0);
      else for (std::string& l : w.para(p, avail, cut ? s.clamp + 1 - static_cast<int>(lines.size()) : 0)) lines.push_back(std::move(l));
    }
    if (s.balance && lines.size() > 1 && lines.size() <= 6 && s.whiteSpace != 1 && s.whiteSpace != 2) {   // like Chrome, only short blocks are balanced
      double lo = 0, hi = avail;
      const int want = static_cast<int>(lines.size());
      for (int i = 0; i < 12; i++) {
        const double mid = (lo + hi) / 2;
        int k = 0;
        for (std::string_view p : paras) { if (k > want) break; k += static_cast<int>(w.para(p, mid, want + 1 - k).size()); }
        if (k <= want) hi = mid; else lo = mid;
      }
      lines.clear();
      for (std::string_view p : paras) for (std::string& l : w.para(p, hi, 0)) lines.push_back(std::move(l));
    }
    if (s.clamp > 0 && static_cast<int>(lines.size()) > s.clamp) {
      lines.resize(static_cast<std::size_t>(s.clamp));
      lines.back() = w.ellipsize(lines.back(), avail);
    } else if (s.ellipsis && (s.whiteSpace == 1 || s.whiteSpace == 2 || s.clamp == 1)) {
      for (std::string& l : lines) if (w.lineWidth(l) > avail && avail > s.size) l = w.ellipsize(l, avail);
    }
  }
  for (const std::string& l : lines) widths.push_back(w.lineWidth(l));
}

}  // namespace zn::host
