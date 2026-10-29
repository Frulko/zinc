// zinc doc: Markdown to HTML (ZN-856). md4c (third_party/md4c, MIT) parses CommonMark with GitHub's tables, task lists, strikethrough,
// autolinks, footnotes and [!NOTE] admonitions; this file renders its events (heading anchors and the table of contents, highlighted code with
// a copy button, links and images resolved by the page). MDX: no JavaScript runs. A page's JSX components are a fixed set rendered at build time
// (Steps, Step, Tabs, Tab, Callout, Cards, Card, Command, Screenshot, Example, Details, ApiRef); `import` and `export` lines are dropped, and an
// unknown component keeps its content with a warning.
#include "doc/internal.h"

#include "md4c.h"

#include <algorithm>
#include <cctype>
#include <set>

namespace zn::doc {
namespace {

std::string attr(const MD_ATTRIBUTE& a) { return a.text ? std::string(a.text, a.size) : std::string(); }

std::string stripTags(std::string_view html) {
  std::string out;
  bool tag = false;
  for (char c : html) {
    if (c == '<') tag = true;
    else if (c == '>') tag = false;
    else if (!tag) out += c;
  }
  return out;
}

struct Renderer {
  PageCtx& ctx;
  std::string out, text, title;
  std::vector<Heading> toc;
  std::set<std::string> ids;
  bool blocksSeen = false;
  std::size_t hStart = std::string::npos;
  unsigned hLevel = 0;
  std::string hText;
  bool inCode = false;
  std::string code, lang, info;
  int img = 0;
  std::size_t imgStart = 0;
  std::string imgSrc, imgTitle;
  int imgW = 0, imgH = 0;
  std::vector<bool> links;
  explicit Renderer(PageCtx& c) : ctx(c) {}

  std::string uniqueId(std::string base) {
    if (base.empty()) base = "section";
    std::string id = base;
    for (int n = 1; ids.count(id); n++) id = base + "-" + std::to_string(n);
    ids.insert(id);
    return id;
  }

  void enterBlock(MD_BLOCKTYPE type, void* detail) {
    switch (type) {
      case MD_BLOCK_DOC: break;
      case MD_BLOCK_QUOTE: out += "<blockquote>\n"; break;
      case MD_BLOCK_UL: out += "<ul>\n"; break;
      case MD_BLOCK_OL: {
        const auto* d = static_cast<MD_BLOCK_OL_DETAIL*>(detail);
        out += d->start == 1 ? "<ol>\n" : "<ol start=\"" + std::to_string(d->start) + "\">\n";
        break;
      }
      case MD_BLOCK_LI: {
        const auto* d = static_cast<MD_BLOCK_LI_DETAIL*>(detail);
        if (d->is_task) out += std::string("<li class=\"task\"><input type=\"checkbox\" disabled") + (d->task_mark != ' ' ? " checked" : "") + "> ";
        else out += "<li>";
        break;
      }
      case MD_BLOCK_HR: out += "<hr>\n"; break;
      case MD_BLOCK_H:
        hLevel = static_cast<MD_BLOCK_H_DETAIL*>(detail)->level;
        hStart = out.size();
        hText.clear();
        break;
      case MD_BLOCK_CODE: {
        const auto* d = static_cast<MD_BLOCK_CODE_DETAIL*>(detail);
        inCode = true;
        code.clear();
        lang = attr(d->lang);
        info = attr(d->info);
        for (auto& c : lang) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
        break;
      }
      case MD_BLOCK_HTML: break;
      case MD_BLOCK_P: out += "<p>"; break;
      case MD_BLOCK_TABLE: out += "<div class=\"table-wrap\"><table>\n"; break;
      case MD_BLOCK_THEAD: out += "<thead>\n"; break;
      case MD_BLOCK_TBODY: out += "<tbody>\n"; break;
      case MD_BLOCK_TR: out += "<tr>"; break;
      case MD_BLOCK_TH: case MD_BLOCK_TD: {
        const auto a = static_cast<MD_BLOCK_TD_DETAIL*>(detail)->align;
        out += type == MD_BLOCK_TH ? "<th" : "<td";
        out += a == MD_ALIGN_CENTER ? " style=\"text-align:center\">" : a == MD_ALIGN_RIGHT ? " style=\"text-align:right\">" : ">";
        break;
      }
      case MD_BLOCK_FOOTNOTE_DEF_SECTION: out += "<section class=\"footnotes\"><ol>\n"; break;
      case MD_BLOCK_FOOTNOTE_DEF: out += "<li id=\"fn-" + std::to_string(static_cast<MD_BLOCK_FOOTNOTE_DEF_DETAIL*>(detail)->id) + "\">"; break;
      case MD_BLOCK_ADMONITION: {
        std::string t = attr(static_cast<MD_BLOCK_ADMONITION_DETAIL*>(detail)->type);
        for (auto& c : t) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
        std::string label = t;
        if (!label.empty()) label[0] = static_cast<char>(std::toupper(static_cast<unsigned char>(label[0])));
        out += "<div class=\"callout callout-" + escapeHtml(t) + "\"><p class=\"callout-title\">" + escapeHtml(label) + "</p>\n";
        break;
      }
      default: break;
    }
    if (type != MD_BLOCK_DOC) blocksSeen = true;
  }

  void leaveBlock(MD_BLOCKTYPE type) {
    switch (type) {
      case MD_BLOCK_QUOTE: out += "</blockquote>\n"; break;
      case MD_BLOCK_UL: out += "</ul>\n"; break;
      case MD_BLOCK_OL: out += "</ol>\n"; break;
      case MD_BLOCK_LI: out += "</li>\n"; break;
      case MD_BLOCK_H: {
        const std::string inner = out.substr(hStart);
        out.resize(hStart);
        const bool onlyBefore = stripTags(out).find_first_not_of(" \n\t") == std::string::npos;
        if (hLevel == 1 && title.empty() && onlyBefore) { title = hText; hStart = std::string::npos; break; }
        const std::string id = uniqueId(slugify(hText));
        const std::string n = std::to_string(hLevel);
        out += "<h" + n + " id=\"" + id + "\">" + inner + "<a class=\"anchor\" href=\"#" + id + "\" aria-label=\"Link to this section\">#</a></h" + n + ">\n";
        if (hLevel == 2 || hLevel == 3) toc.push_back({static_cast<int>(hLevel), id, hText});
        text += hText + "\n";
        hStart = std::string::npos;
        break;
      }
      case MD_BLOCK_CODE: {
        inCode = false;
        if (!code.empty() && code.back() == '\n') code.pop_back();
        std::string meta = info.size() > lang.size() ? info.substr(lang.size()) : std::string();
        std::string codeTitle;
        const std::size_t t = meta.find("title=");
        if (t != std::string::npos && t + 6 < meta.size()) {
          const char q = meta[t + 6];
          const std::size_t e = q == '"' || q == '\'' ? meta.find(q, t + 7) : meta.find(' ', t + 6);
          codeTitle = q == '"' || q == '\'' ? meta.substr(t + 7, e == std::string::npos ? std::string::npos : e - t - 7) : meta.substr(t + 6, e == std::string::npos ? std::string::npos : e - t - 6);
        }
        const bool command = meta.find("command") != std::string::npos;
        out += std::string("<div class=\"code-block") + (command ? " command" : "") + "\"" + (lang.empty() ? "" : " data-lang=\"" + escapeHtml(lang) + "\"") + ">";
        if (!codeTitle.empty()) out += "<div class=\"code-title\">" + escapeHtml(codeTitle) + "</div>";
        out += "<pre><code>" + highlight(code, lang) + "</code></pre><button class=\"copy\" type=\"button\" aria-label=\"Copy\">Copy</button></div>\n";
        if (command) text += code + "\n";
        break;
      }
      case MD_BLOCK_P: out += "</p>\n"; text += "\n"; break;
      case MD_BLOCK_TABLE: out += "</table></div>\n"; break;
      case MD_BLOCK_THEAD: out += "</thead>\n"; break;
      case MD_BLOCK_TBODY: out += "</tbody>\n"; break;
      case MD_BLOCK_TR: out += "</tr>\n"; break;
      case MD_BLOCK_TH: out += "</th>"; text += " "; break;
      case MD_BLOCK_TD: out += "</td>"; text += " "; break;
      case MD_BLOCK_FOOTNOTE_DEF_SECTION: out += "</ol></section>\n"; break;
      case MD_BLOCK_FOOTNOTE_DEF: out += "</li>\n"; break;
      case MD_BLOCK_ADMONITION: out += "</div>\n"; break;
      default: break;
    }
  }

  void enterSpan(MD_SPANTYPE type, void* detail) {
    if (img > 0 && type != MD_SPAN_IMG) return;   // inside an image: its text is the alt
    switch (type) {
      case MD_SPAN_EM: out += "<em>"; break;
      case MD_SPAN_STRONG: out += "<strong>"; break;
      case MD_SPAN_A: {
        const auto* d = static_cast<MD_SPAN_A_DETAIL*>(detail);
        std::string href = attr(d->href);
        int w = 0, h = 0;
        href = href.rfind("zdoc:", 0) == 0 ? href.substr(5) : ctx.link(href, false, w, h);
        links.push_back(!href.empty());
        if (href.empty()) { out += "<span class=\"dead-link\">"; break; }
        const bool ext = href.rfind("http://", 0) == 0 || href.rfind("https://", 0) == 0;
        out += "<a href=\"" + escapeHtml(href) + "\"" + (ext ? " class=\"external\" rel=\"noopener\"" : "");
        if (d->title.size) out += " title=\"" + escapeHtml(attr(d->title)) + "\"";
        out += ">";
        break;
      }
      case MD_SPAN_IMG: {
        if (img++ > 0) break;
        const auto* d = static_cast<MD_SPAN_IMG_DETAIL*>(detail);
        imgW = imgH = 0;
        imgSrc = ctx.link(attr(d->src), true, imgW, imgH);
        imgTitle = attr(d->title);
        imgStart = out.size();
        break;
      }
      case MD_SPAN_CODE: out += "<code>"; break;
      case MD_SPAN_DEL: out += "<del>"; break;
      case MD_SPAN_U: out += "<u>"; break;
      case MD_SPAN_MARK: out += "<mark>"; break;
      case MD_SPAN_INS: out += "<ins>"; break;
      case MD_SPAN_SUPERSCRIPT: out += "<sup>"; break;
      case MD_SPAN_SUBSCRIPT: out += "<sub>"; break;
      case MD_SPAN_LATEXMATH: case MD_SPAN_LATEXMATH_DISPLAY: out += "<code class=\"math\">"; break;
      case MD_SPAN_FOOTNOTE_REF: {
        const auto* d = static_cast<MD_SPAN_FOOTNOTE_REF_DETAIL*>(detail);
        const std::string id = std::to_string(d->id);
        out += "<sup class=\"fnref\"><a href=\"#fn-" + id + "\">" + id + "</a></sup>";
        break;
      }
      default: break;
    }
  }

  void leaveSpan(MD_SPANTYPE type) {
    if (img > 0 && type != MD_SPAN_IMG) return;
    switch (type) {
      case MD_SPAN_EM: out += "</em>"; break;
      case MD_SPAN_STRONG: out += "</strong>"; break;
      case MD_SPAN_A: { const bool ok = links.empty() || links.back(); if (!links.empty()) links.pop_back(); out += ok ? "</a>" : "</span>"; break; }
      case MD_SPAN_IMG: {
        if (--img > 0) break;
        const std::string alt = stripTags(out.substr(imgStart));
        out.resize(imgStart);
        if (imgSrc.empty()) { out += escapeHtml(alt); break; }
        out += "<img src=\"" + escapeHtml(imgSrc) + "\" alt=\"" + escapeHtml(alt) + "\"";
        if (!imgTitle.empty()) out += " title=\"" + escapeHtml(imgTitle) + "\"";
        if (imgW > 0 && imgH > 0) out += " width=\"" + std::to_string(imgW) + "\" height=\"" + std::to_string(imgH) + "\"";
        out += " loading=\"lazy\" decoding=\"async\">";
        break;
      }
      case MD_SPAN_CODE: out += "</code>"; break;
      case MD_SPAN_DEL: out += "</del>"; break;
      case MD_SPAN_U: out += "</u>"; break;
      case MD_SPAN_MARK: out += "</mark>"; break;
      case MD_SPAN_INS: out += "</ins>"; break;
      case MD_SPAN_SUPERSCRIPT: out += "</sup>"; break;
      case MD_SPAN_SUBSCRIPT: out += "</sub>"; break;
      case MD_SPAN_LATEXMATH: case MD_SPAN_LATEXMATH_DISPLAY: out += "</code>"; break;
      default: break;
    }
  }

  void onText(MD_TEXTTYPE type, std::string_view t) {
    if (inCode) { code += t; return; }
    switch (type) {
      case MD_TEXT_NULLCHAR: out += "\xEF\xBF\xBD"; break;
      case MD_TEXT_BR: out += img ? " " : "<br>\n"; break;
      case MD_TEXT_SOFTBR: out += img ? " " : "\n"; if (hStart == std::string::npos) text += " "; return;
      case MD_TEXT_HTML: out += t; return;
      case MD_TEXT_ENTITY: out += t; break;
      default: out += escapeHtml(t);
    }
    if (hStart != std::string::npos) hText += t;
    else text += t;
  }
};

// ---- MDX ----

struct Tag {
  std::string name;
  std::map<std::string, std::string> attrs;
  bool closing = false, selfClose = false;
  std::size_t end = 0;   // index after the `>`
};

// The tag at s[p] (a `<`); false when the `>` is not in s.
bool parseTag(std::string_view s, std::size_t p, Tag& tag) {
  std::size_t i = p + 1;
  if (i < s.size() && s[i] == '/') { tag.closing = true; i++; }
  const std::size_t n = i;
  while (i < s.size() && (std::isalnum(static_cast<unsigned char>(s[i])) || s[i] == '.' || s[i] == '_')) i++;
  tag.name = std::string(s.substr(n, i - n));
  while (i < s.size()) {
    while (i < s.size() && std::isspace(static_cast<unsigned char>(s[i]))) i++;
    if (i >= s.size()) return false;
    if (s[i] == '>') { tag.end = i + 1; return true; }
    if (s[i] == '/' && i + 1 < s.size() && s[i + 1] == '>') { tag.selfClose = true; tag.end = i + 2; return true; }
    const std::size_t a = i;
    while (i < s.size() && !std::isspace(static_cast<unsigned char>(s[i])) && s[i] != '=' && s[i] != '>' && s[i] != '/') i++;
    const std::string key(s.substr(a, i - a));
    if (key.empty()) { i++; continue; }
    std::string value = "true";
    if (i < s.size() && s[i] == '=') {
      i++;
      if (i < s.size() && (s[i] == '"' || s[i] == '\'')) {
        const char q = s[i];
        const std::size_t e = s.find(q, i + 1);
        if (e == std::string_view::npos) return false;
        value = std::string(s.substr(i + 1, e - i - 1));
        i = e + 1;
      } else if (i < s.size() && s[i] == '{') {
        int d = 0;
        const std::size_t b = i;
        for (; i < s.size(); i++) { if (s[i] == '{') d++; else if (s[i] == '}' && --d == 0) break; }
        if (i >= s.size()) return false;
        value = std::string(s.substr(b + 1, i - b - 1));
        if (value.size() >= 2 && (value[0] == '"' || value[0] == '\'' || value[0] == '`') && value.back() == value[0]) value = value.substr(1, value.size() - 2);
        i++;
      }
    }
    tag.attrs[key] = value;
  }
  return false;
}

std::string get(const Tag& t, const char* k, const std::string& otherwise = {}) {
  const auto it = t.attrs.find(k);
  return it == t.attrs.end() ? otherwise : it->second;
}

struct Mdx {
  PageCtx& ctx;
  std::string out;
  struct Open { Tag tag; int indent = -1; };
  std::vector<Open> stack;
  bool command = false;
  std::vector<std::string> commandLines;

  void block(const std::string& html) {
    while (!out.empty() && (out.size() < 2 || out.substr(out.size() - 2) != "\n\n")) out += '\n';
    out += html;
    out += "\n\n";
  }
  std::string image(const std::string& src, int& w, int& h) { return src.empty() ? std::string() : ctx.link(src, true, w, h); }
  std::string imgTag(const std::string& src, const std::string& alt) {
    int w = 0, h = 0;
    const std::string url = image(src, w, h);
    if (url.empty()) { ctx.warnings.push_back("image not found: " + src); return {}; }
    std::string s = "<img src=\"" + escapeHtml(url) + "\" alt=\"" + escapeHtml(alt) + "\"";
    if (w > 0 && h > 0) s += " width=\"" + std::to_string(w) + "\" height=\"" + std::to_string(h) + "\"";
    return s + " loading=\"lazy\" decoding=\"async\">";
  }

  void open(const Tag& t) {
    const std::string& n = t.name;
    if (n == "Callout" || n == "Aside" || n == "Note" || n == "Tip" || n == "Warning") {
      std::string type = n == "Callout" || n == "Aside" ? get(t, "type", "note") : n;
      for (auto& c : type) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
      if (type == "info") type = "note";
      if (type == "caution") type = "warning";
      if (type == "error") type = "danger";
      if (type == "success") type = "tip";
      std::string title = get(t, "title");
      if (title.empty()) { title = type; title[0] = static_cast<char>(std::toupper(static_cast<unsigned char>(title[0]))); }
      block("<div class=\"callout callout-" + escapeHtml(type) + "\"><p class=\"callout-title\">" + escapeHtml(title) + "</p>");
    } else if (n == "Steps") block("<div class=\"steps\">");
    else if (n == "Step") block("<div class=\"step\"><p class=\"step-title\">" + escapeHtml(get(t, "title")) + "</p>");
    else if (n == "Tabs") block("<div class=\"tabs\">");
    else if (n == "Tab" || n == "TabItem") block("<div class=\"tab\" data-label=\"" + escapeHtml(get(t, "label", get(t, "title", "Tab"))) + "\">");
    else if (n == "Cards" || n == "CardGrid") block("<div class=\"cards\">");
    else if (n == "Card" || n == "LinkCard") {
      const std::string title = escapeHtml(get(t, "title"));
      const std::string icon = get(t, "icon");
      std::string href = get(t, "href");
      int w = 0, h = 0;
      if (!href.empty()) { const std::string u = ctx.link(href, false, w, h); if (u.empty()) ctx.warnings.push_back("card link leads nowhere: " + href); href = u; }
      std::string head = "<div class=\"card\">" + (icon.empty() ? std::string() : "<span class=\"card-icon\">" + escapeHtml(icon) + "</span>");
      head += href.empty() ? "<p class=\"card-title\">" + title + "</p>" : "<p class=\"card-title\"><a href=\"" + escapeHtml(href) + "\">" + title + "</a></p>";
      if (!get(t, "description").empty()) head += "<p>" + escapeHtml(get(t, "description")) + "</p>";
      block(head);
    } else if (n == "Example") {
      const std::string title = get(t, "title");
      block("<div class=\"example\"><div class=\"example-title\">Example" + (title.empty() ? std::string() : std::string(" · ") + escapeHtml(title)) + "</div><div class=\"example-body\">");
    } else if (n == "Details") block("<details class=\"details\"><summary>" + escapeHtml(get(t, "summary", get(t, "title", "Details"))) + "</summary>");
    else if (n == "Command") { command = true; commandLines.clear(); }
    else if (n == "Screenshot" || n == "Image") {
      const std::string img = imgTag(get(t, "src"), get(t, "alt", get(t, "caption")));
      if (img.empty()) return;
      const std::string title = get(t, "title"), caption = get(t, "caption");
      std::string html = "<figure class=\"screenshot" + std::string(get(t, "frame") == "none" || n == "Image" ? " plain" : "") + "\"><div class=\"frame\">";
      if (n == "Screenshot" && get(t, "frame") != "none") html += "<div class=\"frame-bar\"><i></i><i></i><i></i><span>" + escapeHtml(title) + "</span></div>";
      html += img + "</div>";
      if (!caption.empty()) html += "<figcaption>" + escapeHtml(caption) + "</figcaption>";
      block(html + "</figure>");
    } else {
      ctx.warnings.push_back("unknown MDX component <" + n + ">: its content is kept");
      std::string cls = n;
      for (auto& c : cls) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
      block("<div class=\"mdx-" + escapeHtml(cls) + "\">");
    }
  }

  void close(const Tag& t) {
    const std::string& n = t.name;
    if (n == "Command") {
      command = false;
      std::string fence = "```sh command\n";
      for (auto& l : commandLines) { if (l.empty()) continue; fence += (l.rfind("$ ", 0) == 0 ? "" : "$ ") + l + "\n"; }
      block(fence + "```");
    } else if (n == "Screenshot" || n == "Image") {
    } else if (n == "Example") {
      std::string html = "</div>";
      const std::string shot = get(t, "screenshot");
      if (!shot.empty()) { const std::string img = imgTag(shot, get(t, "title", "Screenshot")); if (!img.empty()) html += "<figure class=\"example-shot\">" + img + "</figure>"; }
      block(html + "</div>");
    } else if (n == "Details") block("</details>");
    else block("</div>");
  }

  // <ApiRef name="X" /> anywhere in a line: a link to the symbol, written as Markdown
  std::string inlineRefs(std::string line) {
    for (std::size_t p = line.find("<ApiRef"); p != std::string::npos; p = line.find("<ApiRef", p)) {
      Tag t;
      if (!parseTag(line, p, t)) break;
      const std::string name = get(t, "name");
      const std::string url = ctx.apiRef(name);
      if (url.empty()) ctx.warnings.push_back("<ApiRef name=\"" + name + "\"> names no symbol");
      const std::string md = url.empty() ? "`" + name + "`" : "[`" + name + "`](zdoc:" + url + ")";
      line.replace(p, t.end - p, md);
      p += md.size();
    }
    for (std::size_t p = line.find("{/*"); p != std::string::npos; p = line.find("{/*", p)) {
      const std::size_t e = line.find("*/}", p);
      if (e == std::string::npos) break;
      line.erase(p, e + 3 - p);
    }
    return line;
  }

  void content(std::string_view line) {
    std::size_t lead = 0;
    while (lead < line.size() && (line[lead] == ' ' || line[lead] == '\t')) lead++;
    if (!stack.empty() && lead < line.size()) {
      Open& top = stack.back();
      if (top.indent < 0) top.indent = static_cast<int>(lead);
    }
    const std::size_t cut = stack.empty() || stack.back().indent < 0 ? 0 : std::min(lead, static_cast<std::size_t>(stack.back().indent));
    std::string l(line.substr(cut));
    if (command) { std::size_t a = 0; while (a < l.size() && l[a] == ' ') a++; commandLines.push_back(l.substr(a)); return; }
    out += l;
    out += '\n';
  }

  void run(std::string_view src) {
    std::vector<std::string> lines;
    for (std::size_t p = 0; p <= src.size();) {
      std::size_t nl = src.find('\n', p);
      if (nl == std::string_view::npos) nl = src.size();
      lines.emplace_back(src.substr(p, nl - p));
      p = nl + 1;
    }
    std::string fence;
    bool skippingImport = false;
    for (std::size_t i = 0; i < lines.size(); i++) {
      std::string line = lines[i];
      if (!line.empty() && line.back() == '\r') line.pop_back();
      std::size_t lead = 0;
      while (lead < line.size() && (line[lead] == ' ' || line[lead] == '\t')) lead++;
      const std::string_view tl = std::string_view(line).substr(lead);
      if (!fence.empty()) {
        content(line);
        if (tl.substr(0, fence.size()) == fence && tl.find_first_not_of(fence[0]) == std::string_view::npos) fence.clear();
        continue;
      }
      if (tl.substr(0, 3) == "```" || tl.substr(0, 3) == "~~~") {
        std::size_t n = 0;
        while (n < tl.size() && tl[n] == tl[0]) n++;
        fence = std::string(tl.substr(0, n));
        content(line);
        continue;
      }
      if (skippingImport) { if (line.find(" from ") != std::string::npos || line.find(';') != std::string::npos) skippingImport = false; continue; }
      if (stack.empty() && lead == 0 && (tl.rfind("import ", 0) == 0 || tl.rfind("export ", 0) == 0)) {
        if (line.find(" from ") == std::string::npos && line.find(';') == std::string::npos && tl.rfind("import ", 0) == 0 && line.find('\'') == std::string::npos && line.find('"') == std::string::npos) skippingImport = true;
        continue;
      }
      const bool tagLine = tl.size() > 1 && tl[0] == '<' && (std::isupper(static_cast<unsigned char>(tl[1])) || (tl[1] == '/' && tl.size() > 2 && std::isupper(static_cast<unsigned char>(tl[2]))));
      if (!tagLine || tl.rfind("<ApiRef", 0) == 0) { content(inlineRefs(line)); continue; }
      std::string s(tl);
      Tag t;
      while (!parseTag(s, 0, t) && i + 1 < lines.size()) { s += "\n" + lines[++i]; t = Tag(); }   // an opening tag over several lines
      if (t.end == 0) { content(line); continue; }
      std::string rest = s.substr(t.end);
      if (t.closing) {
        while (!stack.empty() && stack.back().tag.name != t.name) { close(stack.back().tag); stack.pop_back(); }
        if (!stack.empty()) { close(stack.back().tag); stack.pop_back(); }
        continue;
      }
      open(t);
      if (t.selfClose) { close(t); if (!rest.empty()) content(inlineRefs(rest)); continue; }
      stack.push_back({t, -1});
      const std::string end = "</" + t.name + ">";
      const std::size_t e = rest.find(end);
      if (e != std::string::npos) {   // <Command>zinc run</Command> on one line
        const std::string inner = rest.substr(0, e);
        if (inner.find_first_not_of(" \t") != std::string::npos) content(inlineRefs(inner.substr(inner.find_first_not_of(" \t"))));
        close(stack.back().tag);
        stack.pop_back();
        continue;
      }
      if (rest.find_first_not_of(" \t") != std::string::npos) content(inlineRefs(rest.substr(rest.find_first_not_of(" \t"))));
    }
    while (!stack.empty()) { ctx.warnings.push_back("<" + stack.back().tag.name + "> is not closed"); close(stack.back().tag); stack.pop_back(); }
  }
};

}  // namespace

// GitHub's heading anchors, so the #fragments people write against GitHub work here: lower case, a space becomes a dash, punctuation goes
// (letters, digits, `-`, `_` and non-ASCII stay).
std::string slugify(std::string_view text) {
  std::string s;
  for (unsigned char c : text) {
    if (std::isalnum(c) || c >= 0x80 || c == '-' || c == '_') s += static_cast<char>(std::tolower(c));
    else if (c == ' ') s += '-';
  }
  return s;
}

Rendered renderMarkdown(std::string_view src, bool mdx, PageCtx& ctx, bool rawHtml) {
  Rendered r;
  // front matter
  if (src.substr(0, 4) == "---\n" || src.substr(0, 5) == "---\r\n") {
    const std::size_t e = src.find("\n---", 3);
    if (e != std::string_view::npos) {
      std::string_view fm = src.substr(src.find('\n') + 1, e - src.find('\n'));
      for (std::size_t p = 0; p < fm.size();) {
        std::size_t nl = fm.find('\n', p);
        if (nl == std::string_view::npos) nl = fm.size();
        std::string_view line = fm.substr(p, nl - p);
        p = nl + 1;
        const std::size_t c = line.find(':');
        if (c == std::string_view::npos || line.empty() || line[0] == ' ' || line[0] == '#') continue;
        std::string k(line.substr(0, c)), v(line.substr(c + 1));
        while (!v.empty() && (v[0] == ' ' || v[0] == '\t')) v.erase(0, 1);
        while (!v.empty() && (v.back() == ' ' || v.back() == '\r')) v.pop_back();
        if (v.size() >= 2 && (v[0] == '"' || v[0] == '\'') && v.back() == v[0]) v = v.substr(1, v.size() - 2);
        r.front[k] = v;
      }
      const std::size_t after = src.find('\n', e + 1);
      src = after == std::string_view::npos ? std::string_view() : src.substr(after + 1);
    }
  }
  std::string pre;
  if (mdx) {
    Mdx m{ctx, {}, {}, false, {}};
    m.run(src);
    pre = std::move(m.out);
    src = pre;
  }
  Renderer rd(ctx);
  MD_PARSER parser{};
  parser.flags = MD_DIALECT_GITHUB | (mdx ? MD_FLAG_NOINDENTEDCODEBLOCKS : 0u) | (rawHtml ? 0u : MD_FLAG_NOHTML);
  parser.enter_block = [](MD_BLOCKTYPE t, void* d, void* u) { static_cast<Renderer*>(u)->enterBlock(t, d); return 0; };
  parser.leave_block = [](MD_BLOCKTYPE t, void*, void* u) { static_cast<Renderer*>(u)->leaveBlock(t); return 0; };
  parser.enter_span = [](MD_SPANTYPE t, void* d, void* u) { static_cast<Renderer*>(u)->enterSpan(t, d); return 0; };
  parser.leave_span = [](MD_SPANTYPE t, void*, void* u) { static_cast<Renderer*>(u)->leaveSpan(t); return 0; };
  parser.text = [](MD_TEXTTYPE t, const MD_CHAR* s, MD_SIZE n, void* u) { static_cast<Renderer*>(u)->onText(t, std::string_view(s, n)); return 0; };
  md_parse(src.data(), static_cast<MD_SIZE>(src.size()), &parser, &rd);
  r.html = std::move(rd.out);
  r.title = rd.title;
  r.text = std::move(rd.text);
  r.toc = std::move(rd.toc);
  return r;
}

}  // namespace zn::doc
