#include "frontend/diagnostics.h"

#include <algorithm>
#include <cctype>

#include "frontend/lexer.h"
#include "i18n/i18n.h"
#include "zn/diagnostics.h"

namespace zn::frontend {
namespace {

bool english() { return i18n::language() == "en"; }

// The registry's `field` (title, why, fix) in the person's language: English is the registry itself, the other languages
// i18n/<lang>/diag.json, which tools/i18n-check keeps complete (a missing key prints English)
std::string text(const DiagInfo& d, const char* field, const char* en) {
  if (english()) return en;
  const std::string id = std::string("diag.") + d.code + "." + field;
  return i18n::tr(id.c_str());
}

std::string detail(const Diag& d) { return d.key && !english() ? i18n::message(i18n::language(), d.key, d.args) : d.detail; }

std::string quote(std::string_view t) {
  std::string q = "\"";
  for (char c : t) {
    if (c == '"' || c == '\\') { q += '\\'; q += c; }
    else if (c == '\n') q += "\\n";
    else q += c;
  }
  return q + "\"";
}

}  // namespace

std::string nearest(std::string_view name, const std::vector<std::string>& candidates) {
  std::string best;
  std::size_t bestD = std::min(name.size(), std::max<std::size_t>(2, name.size() / 3) + 1);   // 2 edits (a swap of two letters) on a short name, never the whole name
  for (const std::string& c : candidates) {
    std::vector<std::size_t> row(c.size() + 1);   // Levenshtein, one row
    for (std::size_t j = 0; j <= c.size(); ++j) row[j] = j;
    for (std::size_t i = 1; i <= name.size(); ++i) {
      std::size_t diag = row[0];
      row[0] = i;
      for (std::size_t j = 1; j <= c.size(); ++j) {
        std::size_t up = row[j];
        row[j] = std::min({up + 1, row[j - 1] + 1, diag + (name[i - 1] == c[j - 1] ? 0 : 1)});
        diag = up;
      }
    }
    if (row[c.size()] < bestD && c != name) { bestD = row[c.size()]; best = c; }
  }
  return best;
}

std::string hint(const std::vector<Diag>& diags, std::string_view file) {
  if (diags.empty()) return "";
  const DiagInfo* info = findDiag(diags[0].code);
  std::string out = i18n::trn("diag.hint.errors", static_cast<double>(diags.size()));
  if (info) out += " " + text(*info, "fix", info->fix) + " " + i18n::tr("diag.hint.explain", {{"code", info->code}});
  // what JavaScript allows and a typed program does not (an untyped parameter, var): the file runs as it is under its .js name (QuickJS)
  const std::string_view code = diags[0].code;
  if ((code == kZCannotInfer || code == kZVarForbidden) && file.size() > 3 && file.substr(file.size() - 3) == ".ts")
    out += " " + i18n::tr("diag.hint.js", {{"js", std::string(file.substr(0, file.size() - 3)) + ".js"}});
  return out;
}

std::string format(const Diag& d, std::string_view src, std::string_view file) {
  LineCol lc = lineCol(src, d.pos);
  const DiagInfo* info = findDiag(d.code);
  std::string out = std::string(file) + ":" + std::to_string(lc.line) + ":" + std::to_string(lc.col) + ": error " + d.code + ": " +
                    (info ? text(*info, "title", info->title) : "unknown diagnostic");
  if (!d.detail.empty()) out += ": " + detail(d);
  return out;
}

std::string explain(std::string_view code) {
  const DiagInfo* d = findDiag(code);
  if (!d) return "";
  std::string out = std::string(d->code) + ": " + text(*d, "title", d->title) + "\n\n" + i18n::tr("diag.explain.why") + " " + text(*d, "why", d->why) +
                    "\n" + i18n::tr("diag.explain.fix") + " " + text(*d, "fix", d->fix) + "\n\n" + i18n::tr("diag.explain.example") + "\n" + d->example + "\n";
  if (!english()) out += "\n" + i18n::tr("diag.explain.english", {{"title", d->title}}) + "\n";   // what to search for
  return out;
}

std::string markdown() {
  std::string out = "# " + i18n::tr("diag.markdown.title") + "\n\n" + i18n::tr("diag.markdown.intro") + "\n";
  const std::string fix = i18n::tr("diag.explain.fix");
  for (const DiagInfo& d : kDiagnostics)
    out += std::string("\n## ") + d.code + ": " + text(d, "title", d.title) + "\n\n" + text(d, "why", d.why) + "\n\n" + fix + " " + text(d, "fix", d.fix) +
           "\n\n```ts\n" + d.example + "\n```\n";
  return out;
}

std::string codes() {
  std::string out;
  for (const DiagInfo& d : kDiagnostics) out += std::string(d.code) + "\n";
  return out;
}

std::string list() {
  std::string out;
  for (const DiagInfo& d : kDiagnostics) out += std::string(d.code) + "  " + text(d, "title", d.title) + "\n";
  return out + "\n" + i18n::tr("diag.list.more") + "\n";
}

std::string catalog() {
  std::string out = "{";
  for (const DiagInfo& d : kDiagnostics) {
    const std::string k = std::string("\n  \"diag.") + d.code + ".";
    out += k + "title\": " + quote(d.title) + "," + k + "why\": " + quote(d.why) + "," + k + "fix\": " + quote(d.fix) + ",";
  }
  out.back() = '\n';
  return out + "}\n";
}

std::string normalizeCode(std::string_view code) {
  std::string c(code);
  if (!c.empty() && c.size() <= 4 && std::all_of(c.begin(), c.end(), [](unsigned char x) { return std::isdigit(x); })) return "Z" + std::string(4 - c.size(), '0') + c;
  for (char& x : c) x = static_cast<char>(std::toupper(static_cast<unsigned char>(x)));
  return c;
}

}  // namespace zn::frontend
