// JSX lowering (ZN-028), a port of compiler/src/jsx.ts: a .tsx source is rewritten to plain calls on the zinc:ui/solid (or
// zinc:ui/react) helpers before it is parsed. Solid mode: dynamic expressions become fine-grained effects; React mode: a
// component re-renders as a whole. The pass works on the token stream (the lexer tracks JSX nesting) and substitutes source
// text, keeping line breaks so diagnostics keep their line numbers.
// Not ported yet: class components in React mode (ZN-163), the hook-rule checks.
#include "frontend/jsx.h"
#include "frontend/diagnostics.h"
#include "frontend/project.h"

#include <algorithm>
#include <cctype>
#include <charconv>
#include <cmath>
#include <cstring>
#include <stdexcept>
#include <map>
#include <memory>
#include <regex>
#include <set>

#include "frontend/lexer.h"
#include "zn/shortest.h"

namespace zn::frontend {
namespace {

const std::map<std::string, int> kTags = {{"View", 0}, {"Text", 1}, {"Button", 2}, {"Image", 3}, {"ScrollView", 4}, {"Canvas", 5}, {"Input", 7}, {"TextArea", 8}};
const std::map<std::string, std::string>& kLowerTags = jsxLowercaseTags();
const std::set<std::string> kNumAttrs = {"width", "height", "grow", "gap", "bg", "color", "scale", "hidden", "x", "y", "opacity", "translateX", "translateY", "rows", "tabIndex", "dragThreshold", "numberOfLines"};
const std::map<std::string, int> kPointerAttrs = {{"onPointerDown", 0}, {"onPointerMove", 1}, {"onPointerUp", 2}, {"onDoubleClick", 3}, {"onContextMenu", 4}, {"onWheel", 5}, {"onPointerEnter", 6},
                                                  {"onPointerLeave", 7}, {"onTap", 8}, {"onLongPress", 9}, {"onDrag", 10}, {"onPinch", 11}, {"onPointerCancel", 12}};
// Hints for the page (web target, `--render dom`; docs/ui.md "Semantic hints"): kept as attributes of the node (setAttr), read by the DOM host to pick the tag and fill the
// attributes of a real element. Other targets ignore them. htmlFor is written `for` in HTML.
const std::set<std::string> kWebAttrs = {"as", "href", "target", "rel", "download", "name", "htmlFor", "autoComplete", "required", "pattern", "minLength", "maxLength", "min", "max", "step",
                                         "enterKeyHint", "title", "alt", "lang", "dir", "method", "action", "autoCapitalize", "spellCheck", "autoCorrect", "multiple", "accept", "form", "autoFocus"};
const std::set<std::string> kFlagAttrs = {"password", "readOnly", "lineNumbers", "wrap", "keepFocus", "disabled", "showsVerticalScrollIndicator", "showsHorizontalScrollIndicator",
                                          "stickToBottom", "dragToScroll"};
const std::map<std::string, int> kInputModes = {{"text", 0}, {"numeric", 1}, {"decimal", 2}, {"tel", 3}, {"email", 4}, {"url", 5}, {"search", 6}};
const std::map<std::string, int> kDragAxes = {{"x", 1}, {"y", 2}, {"both", 3}};

struct Elem;
struct Attr {
  std::string name;
  int kind = 0;  // 0 no value (true), 1 string literal, 2 expression
  std::string lit;
  std::size_t eb = 0, ee = 0;  // token range of the expression, inside the braces
  std::size_t tok = 0;
};
struct Child {
  int kind = 0;  // 0 text, 1 expression, 2 element
  std::string text;
  std::size_t eb = 0, ee = 0;
  std::shared_ptr<Elem> el;
  std::size_t tok = 0;
};
struct Elem {
  bool frag = false, selfClosing = false;
  std::string tag;
  std::vector<Attr> attrs;
  std::vector<Child> kids;
  std::size_t begin = 0, end = 0;  // token range
};

struct Failure {
  std::uint32_t pos; std::string msg; const char* code = "Z0005";
  const char* key = nullptr; std::vector<i18n::Arg> args{};   // a frequent mistake (D159): msg is the English of key, printed in the person's language
};
// The failure of a frequent mistake: its message `key` of i18n/<lang>/diag.json (which says "JSX: " itself) and the English for the tools.
[[noreturn]] void failKey(std::uint32_t pos, const char* code, const char* key, std::vector<i18n::Arg> args) {
  std::string en = i18n::message("en", key, args);
  throw Failure{pos, std::move(en), code, key, std::move(args)};
}

// UI-07: the grammar of applyToken in lib/std/ui.ts; a class that is not in it is an error (compiler/src/jsx.ts validClass).
bool validClass(const std::string& c);
// A logical class (ZN-377: ms-, me-, ps-, pe-, start-, end-, rounded-s/e, border-s/e, text-start/end) as the left-to-right class that checks it.
std::string ltrOf(const std::string& c) {
  const std::string neg = !c.empty() && c[0] == '-' ? "-" : "", t = neg.empty() ? c : c.substr(1);
  static const std::pair<const char*, const char*> kMap[] = {{"ms-", "ml-"}, {"me-", "mr-"}, {"ps-", "pl-"}, {"pe-", "pr-"}, {"start-", "left-"}, {"end-", "right-"}, {"rounded-s-", "rounded-l-"}, {"rounded-e-", "rounded-r-"}};
  for (auto [from, to] : kMap) if (t.rfind(from, 0) == 0) return neg + to + t.substr(std::strlen(from));
  if (t == "rounded-s") return "rounded-l";
  if (t == "rounded-e") return "rounded-r";
  if (t == "text-start") return "text-left";
  if (t == "text-end") return "text-right";
  if (t == "border-s" || t == "border-e") return t == "border-s" ? "border-l" : "border-r";
  if ((t.rfind("border-s-", 0) == 0 || t.rfind("border-e-", 0) == 0) && t.size() > 9 && std::isdigit(static_cast<unsigned char>(t[9]))) return std::string(t[7] == 's' ? "border-l-" : "border-r-") + t.substr(9);
  return "";
}
bool validClass(const std::string& c) {
  if (std::string l = ltrOf(c); !l.empty()) return validClass(l);
  if (c.rfind("rtl:", 0) == 0 || c.rfind("ltr:", 0) == 0) return validClass(c.substr(4));
  static const std::set<std::string> fixed = {"bg-none", "flex", "flex-row", "flex-col", "flex-wrap", "flex-1", "grow", "grow-0", "hidden", "absolute", "relative", "static", "overflow-hidden", "overflow-auto",
      "overflow-scroll", "overflow-x-auto", "overflow-x-scroll", "overflow-y-auto", "overflow-y-scroll", "w-screen", "h-screen", "sticky", "sr-only", "border-solid", "border-dashed", "border-dotted", "outline-solid", "outline-dashed", "outline-dotted", "snap-none", "snap-x", "snap-y", "snap-both", "snap-mandatory", "snap-proximity", "snap-start", "snap-center", "snap-end", "snap-align-none", "invisible", "visible", "pointer-events-none", "pointer-events-auto", "z-auto", "flex-none", "flex-auto", "flex-initial", "flex-row-reverse", "flex-col-reverse", "flex-wrap-reverse", "box-border", "box-content", "w-full", "h-full", "font-bold", "font-semibold", "font-medium", "font-normal", "font-thin", "font-extralight", "font-light", "font-extrabold", "font-black", "italic", "not-italic", "uppercase", "lowercase", "capitalize", "normal-case", "underline", "line-through", "overline", "no-underline", "align-baseline", "whitespace-normal", "whitespace-nowrap", "whitespace-pre", "whitespace-pre-wrap", "text-wrap", "text-nowrap", "break-normal", "break-words", "break-all", "truncate", "text-ellipsis", "text-clip", "text-balance", "text-justify", "@container", "group", "peer", "select-text", "select-all", "select-none", "select-auto", "text-shadow", "text-shadow-sm", "text-shadow-md", "text-shadow-lg", "text-shadow-none", "line-clamp-none", "align-super", "align-sub",
      "font-mono", "font-sans", "text-left", "text-center", "text-right", "rounded", "border", "shadow", "shadow-sm", "shadow-md", "shadow-lg", "shadow-xl", "shadow-none", "transition",
      "transition-colors", "transition-all", "transition-opacity", "transition-shadow", "transition-transform", "transition-none", "ease-linear", "ease-in", "ease-out", "ease-in-out", "tracking-tight", "tracking-wide", "tracking-wider", "tracking-widest"};
  static const std::string num = R"((\d+(\.\d+)?|\[\d+(\.\d+)?(px|rem|vh|vw|%)?\]|\[env\([a-z-]+\)\]|\d+/\d+|px))";
  static const std::string color = R"(([a-z]+-\d+|white|black|transparent|current|\[#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\]|\[(rgb|rgba|hsl|hsla)\([0-9., %]+\)\]|\[var\(--[a-z0-9-]+\)\])(/\d+)?)";
  static const std::vector<std::regex> rules = {
      std::regex(R"(^font-\[[A-Za-z0-9_.,-]+\]$)"),
      std::regex(R"(^cursor-(default|auto|text|pointer|move|ew-resize|col-resize|ns-resize|row-resize|crosshair|grab|grabbing|not-allowed)$)"),
      std::regex("^(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|w|h|top|left|right|bottom|leading|inset|inset-x|inset-y)-" + num + "$"),
      std::regex("^-(m|mx|my|mt|mr|mb|ml)-" + num + "$"),                       // negative margins
      std::regex("^-(top|left|right|bottom)-" + num + "$"),                     // negative offsets
      std::regex(R"(^(m|mx|my|mt|mr|mb|ml)-auto$)"),
      std::regex("^(min|max)-(w|h)-(" + num + R"(|xs|sm|md|lg|xl|[2-7]xl|full|none|screen)$)"),   // size limits
      std::regex(R"(^(grow|shrink)(-\d+(\.\d+)?|-\[\d+(\.\d+)?\])?$)"), std::regex(R"(^self-(auto|start|center|end|stretch)$)"), std::regex(R"(^order-(first|last|none|\d+)$)"),
      std::regex(R"(^content-(start|center|end|stretch|between|around|evenly)$)"), std::regex("^basis-(" + num + R"(|auto|full)$)"),
      std::regex("^scroll-p[trblxy]?-" + num + "$"),
      std::regex(R"(^-?z-(\d+|\[\d+\])$)"),
      std::regex(R"(^aspect-(auto|square|video|\[\d+(\.\d+)?/\d+(\.\d+)?\])$)"), std::regex("^size-" + num + "$"),                              // auto margins
      std::regex(R"(^(items|justify)-(start|center|end|stretch|between|around|evenly)$)"),
      std::regex(R"(^rounded-(none|sm|md|lg|xl|2xl|3xl|full|\[\d+(px)?\])$)"),
      std::regex(R"(^text-(xs|sm|base|lg|xl|[2-6]xl|\[\d+(px)?\])$)"),
      std::regex(R"(^bg-(gradient|linear)-to-(t|tr|r|br|b|bl|l|tl)(/[a-z]+)?$)"), std::regex(R"(^-?bg-(linear|conic)-\d+(\.\d+)?(/[a-z]+)?$)"),   // gradients (ZN-261)
      std::regex(R"(^bg-(radial|conic)(/[a-z]+)?$)"), std::regex(R"(^bg-(linear|radial|conic)-\[\S+\]$)"), std::regex(R"(^bg-\[(repeating-)?(linear|radial|conic)-gradient\(\S+\)\]$)"),
      std::regex(R"(^(from|via|to)-\d+(\.\d+)?%$)"),
      std::regex(R"(^object-(contain|cover|fill|none|scale-down|\[\S+\])$)"), std::regex(R"(^(object|bg)-(center|((top|bottom)(-(left|right))?)|((left|right)(-(top|bottom))?))$)"),   // images in a box (ZN-262)
      std::regex(R"(^bg-(\[url\(\S+\)\]|auto|cover|contain|(size|position)-\[\S+\]|repeat|no-repeat|repeat-(x|y|space|round))$)"),
      std::regex(R"(^border-(\d+|\[\d+(px)?\])$)"), std::regex(R"(^border-[trblxy](-(\d+|\[\d+(px)?\]))?$)"),
      std::regex(R"(^rounded-(t|r|b|l|tl|tr|br|bl)(-(none|sm|md|lg|xl|2xl|3xl|full|\[\d+(px)?\]))?$)"),
      std::regex(R"(^ring(-\d+)?$)"), std::regex(R"(^outline(-\d+)?$)"), std::regex(R"(^(ring|outline)-offset-\d+$)"), std::regex(R"(^outline-none$)"),
      std::regex("^-?translate-[xy]-" + num + "$"),
      std::regex(R"(^line-clamp-[1-9]\d*$)"),
      std::regex(R"(^-?word-(\d+|\[\d+(px)?\])$)"),
      std::regex(R"(^opacity-\d+$)"), std::regex(R"(^(duration|delay)-\d+$)")};
  static const std::regex variant(R"(^(focus|focus-visible|selection|placeholder|disabled|group-hover|group-focus|group-active|peer-hover|peer-focus|peer-active|aria-(?:checked|selected|expanded|pressed|disabled|busy|current|invalid|required|readonly)|data-\[[a-z][a-z0-9-]*=[A-Za-z0-9_-]+\]|dark|light|landscape|portrait|pointer-coarse|pointer-fine|hover-none|max-(?:sm|md|lg|xl|2xl)|(?:min|max)-\[\d+px\]|@(?:sm|md|lg|xl)|@\[\d+px\]|focus-within|active|hover|sm|md|lg|xl|2xl):(.*)$)");
  static const std::regex colored("^(bg|text|text-shadow|border|from|via|to|ring|outline|tint|caret)-" + color + "$");
  static const std::set<std::string> families = {"slate", "gray", "zinc", "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose"};
  std::smatch m;
  if (std::regex_match(c, m, variant)) {
    std::string state = m[1].str(), rest = m[2].str();
    if (!validClass(rest)) return false;
    if (state == "hover" || state == "focus" || state == "active" || state == "disabled" || state.rfind("group-", 0) == 0 || state.rfind("peer-", 0) == 0 || state.rfind("aria-", 0) == 0 || state.rfind("data-", 0) == 0) {   // paint-only properties (ZN-273): opacity, translate, shadow, colours, radius, ring
      static const std::regex paintOnly(R"(^(opacity-\d+|-?translate-[xy]-.+|shadow(-(none|sm|md|lg|xl))?|rounded(-(none|sm|md|lg|xl|2xl|3xl|full|\[\d+(px)?\]))?|(ring|outline)(-.+)?)$)");
      static const std::regex colouredState("^(bg|text|border)-" + color + "$");
      return std::regex_match(rest, paintOnly) || std::regex_match(rest, colouredState);
    }
    return true;
  }
  if (fixed.count(c)) return true;
  for (const std::regex& r : rules) if (std::regex_match(c, r)) return true;
  static const std::regex sideColour(R"(^border-[trblxy]-(.+)$)");   // border-t-red-500: the colour of one side
  if (std::regex_match(c, m, sideColour) && m[1].str().find_first_not_of("0123456789") != std::string::npos) return validClass("border-" + m[1].str());
  if (std::regex_match(c, m, colored)) {
    std::string col = m[2].str();
    if (col[0] == '[' || col == "white" || col == "black" || col == "transparent" || col == "current") return true;
    std::size_t dash = col.find('-');
    if (dash == std::string::npos || !families.count(col.substr(0, dash))) return false;
    std::string shade = col.substr(dash + 1);
    return shade == "50" || shade == "950" || (shade.size() == 3 && shade[1] == '0' && shade[2] == '0' && shade[0] >= '1' && shade[0] <= '9');
  }
  return false;
}

// Style objects (compiler/src/ui-style.ts): CSS-like keys become the numeric style operations of zinc:ui.
const std::map<std::string, std::vector<std::string>> kStyleAliases = {
    {"padding", {"paddingTop", "paddingRight", "paddingBottom", "paddingLeft"}}, {"paddingHorizontal", {"paddingLeft", "paddingRight"}}, {"paddingVertical", {"paddingTop", "paddingBottom"}},
    {"margin", {"marginTop", "marginRight", "marginBottom", "marginLeft"}}, {"marginHorizontal", {"marginLeft", "marginRight"}}, {"marginVertical", {"marginTop", "marginBottom"}},
    {"bg", {"backgroundColor"}}, {"radius", {"borderRadius"}}, {"x", {"translateX"}}, {"y", {"translateY"}}, {"flex", {"grow"}}, {"flexGrow", {"grow"}}, {"flexShrink", {"shrink"}}, {"flexBasis", {"basis"}}};
const std::set<std::string> kStyleNumeric = {"width", "height", "gap", "rowGap", "columnGap", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "marginTop", "marginRight", "marginBottom", "marginLeft",
    "top", "right", "bottom", "left", "opacity", "translateX", "translateY", "scale", "backgroundColor", "color", "borderColor", "borderWidth", "borderRadius", "borderTopWidth",
    "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "fontSize", "lineHeight", "letterSpacing", "grow", "shrink", "basis", "hidden", "lazy", "minWidth", "maxWidth", "minHeight", "maxHeight", "aspectRatio", "widthPercent", "heightPercent", "shadowColor", "shadowOffsetX", "shadowOffsetY", "shadowOpacity", "shadowRadius", "elevation", "rotate", "skewX", "skewY", "scaleX", "scaleY",
    "borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor", "tintColor",
    "zIndex", "shadowLevel", "textShadowColor", "textDecorationColor",   // the keys of what was class-only (ZN-774.18): z-10, shadow-md, text-shadow-red-500
    "outlineWidth", "outlineColor", "outlineOffset", "placeholderTextColor", "selectionColor", "cursorColor", "showsVerticalScrollIndicator", "showsHorizontalScrollIndicator",
    "transitionDuration", "transitionDelay"};   // and outline-2, placeholder:text-*, selection:bg-*, caret-*, duration-*, delay-* (ms)
const std::map<std::string, std::map<std::string, int>> kStyleEnums = {
    {"flexDirection", {{"column", 0}, {"row", 1}, {"column-reverse", 2}, {"row-reverse", 3}}}, {"borderStyle", {{"solid", 0}, {"dashed", 1}, {"dotted", 2}}}, {"flexWrap", {{"nowrap", 0}, {"wrap", 1}, {"wrap-reverse", 2}}},
    {"justifyContent", {{"flex-start", 0}, {"start", 0}, {"center", 1}, {"flex-end", 2}, {"end", 2}, {"space-between", 3}, {"space-around", 4}, {"space-evenly", 5}}},
    {"alignItems", {{"flex-start", 0}, {"start", 0}, {"center", 1}, {"flex-end", 2}, {"end", 2}, {"stretch", 3}, {"baseline", 4}}},
    {"alignSelf", {{"auto", -1}, {"flex-start", 0}, {"start", 0}, {"center", 1}, {"flex-end", 2}, {"end", 2}, {"stretch", 3}, {"baseline", 4}}},
    {"alignContent", {{"flex-start", 0}, {"start", 0}, {"center", 1}, {"flex-end", 2}, {"end", 2}, {"stretch", 3}, {"space-between", 4}, {"space-around", 5}, {"space-evenly", 6}}},
    {"position", {{"relative", 0}, {"static", 2}, {"absolute", 1}, {"sticky", 3}}}, {"boxSizing", {{"border-box", 0}, {"content-box", 1}}}, {"display", {{"flex", 0}, {"none", 1}, {"contents", 2}}},
    {"overflow", {{"visible", 0}, {"hidden", 1}, {"auto", 2}, {"scroll", 2}}},
    {"fontWeight", {{"normal", 400}, {"bold", 700}, {"100", 100}, {"200", 200}, {"300", 300}, {"400", 400}, {"500", 500}, {"600", 600}, {"700", 700}, {"800", 800}, {"900", 900}}},   // font-thin..font-black
    {"fontStyle", {{"normal", 0}, {"italic", 1}}}, {"textTransform", {{"none", 0}, {"uppercase", 1}, {"lowercase", 2}, {"capitalize", 3}}},
    {"textDecorationLine", {{"none", 0}, {"underline", 1}, {"line-through", 2}, {"underline line-through", 3}, {"overline", 4}}},
    {"textDecorationStyle", {{"solid", 0}, {"double", 1}, {"dotted", 2}, {"dashed", 3}}}, {"pointerEvents", {{"auto", 0}, {"none", 1}}},
    {"outlineStyle", {{"solid", 0}, {"dashed", 1}, {"dotted", 2}, {"none", 3}}},
    {"transitionTimingFunction", {{"linear", 0}, {"ease", 8}, {"ease-in", 5}, {"ease-out", 6}, {"ease-in-out", 7}}},   // ui.ts ease(): the ease-* classes' curves, and CSS's ease
    {"cursor", {{"default", 0}, {"auto", 0}, {"text", 1}, {"pointer", 2}, {"move", 3}, {"ew-resize", 4}, {"col-resize", 4}, {"ns-resize", 5}, {"row-resize", 5}, {"crosshair", 6}, {"grab", 7}, {"grabbing", 8}, {"not-allowed", 9}}},   // ui.ts CURSOR_OF
    {"textAlign", {{"left", 0}, {"start", 0}, {"center", 1}, {"right", 2}, {"end", 2}}},
    {"objectFit", {{"fill", 0}, {"contain", 1}, {"cover", 2}, {"none", 3}, {"scale-down", 4}}},   // React Native's resizeMode is objectFit (ZN-262): center scales down, repeat tiles
    {"resizeMode", {{"stretch", 0}, {"contain", 1}, {"cover", 2}, {"center", 4}, {"repeat", 5}}}};

// compiler/src/ui-style.ts styleEntry: one CSS-like property with a literal value becomes numeric style operations (the colours as `@key:hex` operations the
// UI library registers). Errors are thrown as std::runtime_error with the prototype's wording.
struct StyleOp { std::string key; double value; };
struct StyleVal { bool isNum = false; double num = 0; std::string str; };
std::string styleName(std::string name) {
  for (std::size_t k = 0; k + 1 < name.size(); ++k)
    if (name[k] == '-' && std::islower(static_cast<unsigned char>(name[k + 1]))) { name.erase(k, 1); name[k] = static_cast<char>(std::toupper(static_cast<unsigned char>(name[k]))); }
  return name;
}
std::vector<std::string> numericStyleKeys(const std::string& raw) {
  std::string name = styleName(raw);
  auto al = kStyleAliases.find(name);
  if (al != kStyleAliases.end()) return al->second;
  if (kStyleNumeric.count(name)) return {name};
  throw std::runtime_error("style '" + name + "' needs a supported literal value (or is unsupported)");
}
std::string trim(const std::string& s);
std::string lowerCase(std::string s) { for (char& c : s) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c))); return s; }
// The key a colour's alpha goes to (ui.ts writes the colour opaque, then the alpha); empty for a colour without one. backgroundColor has its own rule.
std::string colorAlphaKey(const std::string& key) {
  return key == "color" ? "colorAlpha" : key == "borderColor" ? "borderAlpha" : key == "shadowColor" ? "shadowAlpha" : key == "textShadowColor" ? "textShadowAlpha" : "";
}
// transitionProperty: names (CSS or React Native spelling; a comma list, or an array the lowering joins) onto zinc:ui's transition groups (ui.ts TR_*):
// colours 1, opacity 2, shadow 4, transform 8, the other lengths 16 (what transition-all adds). A name transitions its whole group, as the classes do.
int transitionMask(const std::string& list) {
  static const std::regex lengths(R"(^(width|height|(min|max)(Width|Height)|padding\w*|margin\w*|gap|rowGap|columnGap|border\w*(Width|Radius)|top|left|right|bottom|fontSize|letterSpacing)$)");
  int mask = 0;
  std::string word;
  auto flush = [&] {
    if (word.empty()) return;
    const std::string n = styleName(word);
    word.clear();
    if (n == "all") mask |= 31;
    else if (n == "none") {}
    else if (n == "opacity") mask |= 2;
    else if (n == "boxShadow" || n == "elevation" || n.rfind("shadow", 0) == 0) mask |= 4;
    else if (n == "transform" || n.rfind("translate", 0) == 0 || n.rfind("scale", 0) == 0 || n.rfind("rotate", 0) == 0 || n.rfind("skew", 0) == 0) mask |= 8;
    else if (n == "color" || (n.size() > 5 && n.compare(n.size() - 5, 5, "Color") == 0)) mask |= 1;
    else if (std::regex_match(n, lengths)) mask |= 16;
    else throw std::runtime_error("transitionProperty: '" + n + "' does not transition (all, none, opacity, transform, the colours, the shadow, sizes, spacing, radii, border widths, insets, fontSize, letterSpacing)");
  };
  for (char c : list) { if (c == ',' || std::isspace(static_cast<unsigned char>(c))) flush(); else word += c; }
  flush();
  return mask;
}
std::vector<StyleOp> styleEntry(std::string name, StyleVal value) {
  name = styleName(name);
  if (name == "transitionProperty") {
    if (value.isNum) throw std::runtime_error("transitionProperty takes a name ('opacity', 'backgroundColor', 'all'...) or an array of names");
    return {{name, static_cast<double>(transitionMask(value.str))}};
  }
  if ((name == "transitionDuration" || name == "transitionDelay") && !value.isNum) {   // '200ms', '0.2s' (a number is milliseconds)
    static const std::regex time(R"(^\s*(\d*\.?\d+)\s*(ms|s)\s*$)");
    std::smatch tm;
    if (!std::regex_match(value.str, tm, time)) throw std::runtime_error(name + " takes milliseconds: a number, '200ms' or '0.2s'");
    return {{name, std::stod(tm[1].str()) * (tm[2] == "s" ? 1000 : 1)}};
  }
  if (name == "border") {
    if (!value.isNum && value.str == "none") return {{"borderWidth", 0}};
    std::smatch m;
    static const std::regex solid(R"(^(\S+)\s+solid\s+(.+)$)");
    if (value.isNum || !std::regex_match(value.str, m, solid)) throw std::runtime_error("border expects <width> solid <color>");
    std::vector<StyleOp> a = styleEntry("borderWidth", StyleVal{false, 0, m[1].str()}), b = styleEntry("borderColor", StyleVal{false, 0, m[2].str()});
    a.insert(a.end(), b.begin(), b.end());
    return a;
  }
  if ((name == "backgroundImage" || name == "experimental_backgroundImage" || name == "background") && !value.isNum) {   // a CSS gradient (ZN-261): zinc:ui's bg-[...] token
    static const std::regex gradFn(R"(^\s*((repeating-)?(linear|radial|conic)-gradient\(.*\))\s*$)");
    std::smatch gm;
    if (value.str == "none") return {{"@bg-none", 0}};
    if (std::regex_match(value.str, gm, gradFn)) {
      std::string css;
      for (char ch : gm[1].str()) css += ch == ' ' ? '_' : ch;
      return {{"@bg-[" + css + "]", 0}};
    }
    static const std::regex urlFn(R"(^\s*(url\(\S+\))\s*$)");   // an image of the assets (ZN-262)
    if (std::regex_match(value.str, gm, urlFn)) return {{"@bg-[" + gm[1].str() + "]", 0}};
    if (name != "background") throw std::runtime_error(name + " takes a url(..), a linear-, radial- or conic-gradient(...) or none");
  }
  if ((name == "backgroundSize" || name == "backgroundPosition" || name == "objectPosition" || name == "backgroundRepeat") && !value.isNum) {   // zinc:ui's bg-* and object-* tokens (ZN-262)
    std::string v = trim(value.str), u;
    for (char ch : v) u += ch == ' ' ? '_' : ch;
    if (name == "backgroundSize") return {{v == "auto" || v == "cover" || v == "contain" ? "@bg-" + v : "@bg-size-[" + u + "]", 0}};
    if (name == "backgroundPosition") return {{"@bg-position-[" + u + "]", 0}};
    if (name == "objectPosition") return {{"@object-[" + u + "]", 0}};
    static const std::set<std::string> repeats = {"repeat", "no-repeat", "repeat-x", "repeat-y", "space", "round"};
    if (!repeats.count(v)) throw std::runtime_error("backgroundRepeat takes repeat, no-repeat, repeat-x, repeat-y, space or round");
    return {{v == "space" || v == "round" ? "@bg-repeat-" + v : "@bg-" + v, 0}};
  }
  if (name == "background") name = "backgroundColor";
  if (name == "flex" && value.isNum && (uiLayout() == "rn" || uiPreset() == "react-native")) {   // React Native's shorthand in the rn layout mode (ZN-358): n > 0 grows n with shrink 1 and basis 0; 0 is rigid; -1 shrinks only
    const double n = value.num;
    if (n > 0) return {{"grow", n}, {"shrink", 1}, {"basis", 0}};
    return {{"grow", 0}, {"shrink", n < 0 ? 1.0 : 0.0}, {"basis", -1}};
  }
  if (name == "flexBasis" && !value.isNum) {   // auto, or a percent of the container
    if (value.str == "auto") return {{"basis", -1}};
    static const std::regex bpct(R"(^\d+(\.\d+)?%$)");
    if (std::regex_match(value.str, bpct)) return {{"basisPercent", std::stod(value.str) / 100}};
  }
  auto en = kStyleEnums.find(name);
  if (en != kStyleEnums.end()) {
    std::string key = value.isNum ? [&] { char b[40]; std::snprintf(b, sizeof b, "%g", value.num); return std::string(b); }() : value.str;
    auto ev = en->second.find(key);
    if (ev == en->second.end()) throw std::runtime_error("unsupported " + name + ": " + key);
    return {{name == "display" ? "hidden" : name == "resizeMode" ? "objectFit" : name, static_cast<double>(ev->second)}};
  }
  if (name == "fontFamily") {
    static const std::regex ok(R"(^[A-Za-z0-9_.-]+$)");
    if (value.isNum || !std::regex_match(value.str, ok)) throw std::runtime_error("fontFamily needs a font asset name");
    static const std::regex sans(R"(^(sans-serif|system-ui|Inter)$)", std::regex::icase), mono(R"(^(monospace)$)", std::regex::icase);
    std::string family = std::regex_match(value.str, sans) ? "sans" : std::regex_match(value.str, mono) ? "mono" : value.str;
    return {{"@font-" + (family == "sans" || family == "mono" ? family : "[" + family + "]"), 0}};
  }
  if (!value.isNum && value.str == "auto") {   // auto margins take the free space of their line (ZN-380): one bit per side
    static const std::map<std::string, int> sides = {{"marginLeft", 1}, {"marginRight", 2}, {"marginTop", 4}, {"marginBottom", 8}, {"marginHorizontal", 3}, {"marginVertical", 12}, {"margin", 15}};
    auto sd = sides.find(name);
    if (sd != sides.end()) return {{"marginAuto", static_cast<double>(sd->second)}};
  }
  std::vector<std::string> keys = numericStyleKeys(name);
  bool colorKey = keys[0].size() >= 5 && keys[0].compare(keys[0].size() - 5, 5, "Color") == 0 ? true : keys[0] == "color";
  if (value.isNum) {
    double v = value.num;
    if (!std::isfinite(v) || std::fabs(v) > (colorKey ? 0xffffff : 1000000)) throw std::runtime_error(name + " is out of range");
    if (colorKey && (v != std::floor(v) || v < -1)) throw std::runtime_error(name + " needs an integer RGB color");
    if (name == "fontSize" && (v < 1 || v > 256)) throw std::runtime_error("fontSize must be 1..256");
    if (name == "opacity" && (v < 0 || v > 1)) throw std::runtime_error("opacity must be 0..1");
    std::vector<StyleOp> ops;
    for (const std::string& k : keys) ops.push_back({k, v});
    if (keys[0] == "backgroundColor") ops.push_back({"backgroundAlpha", 255});
    return ops;
  }
  const std::string& sv = value.str;
  if (colorKey) {
    const std::string alphaKey = colorAlphaKey(keys[0]);
    if (sv == "transparent") {
      if (keys[0] == "backgroundColor") return {{"backgroundColor", -1}, {"backgroundAlpha", 0}};
      if (keys[0] == "borderColor") return {{"borderColor", -1}};   // border-transparent's
      if (alphaKey.empty()) throw std::runtime_error("transparent " + name + " is unsupported");
      return {{keys[0], 0}, {alphaKey, 0}};
    }
    std::string text = sv;
    static const std::regex rgb(R"(^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$)");
    std::smatch m;
    if (std::regex_match(sv, m, rgb)) {
      int c[3] = {std::stoi(m[1].str()), std::stoi(m[2].str()), std::stoi(m[3].str())};
      double alpha = m[4].matched ? std::stod(m[4].str()) : 1;
      if (c[0] > 255 || c[1] > 255 || c[2] > 255 || alpha < 0 || alpha > 1) throw std::runtime_error("invalid rgb/rgba color");
      char b[16];
      std::snprintf(b, sizeof b, "#%02x%02x%02x", c[0], c[1], c[2]);
      text = b;
      if (alpha != 1) { std::snprintf(b, sizeof b, "%02x", static_cast<int>(std::lround(alpha * 255))); text += b; }
    }
    static const std::map<std::string, std::string> colors = {{"black", "000000"}, {"white", "ffffff"}, {"red", "ff0000"}, {"green", "008000"}, {"blue", "0000ff"}, {"gray", "808080"}, {"grey", "808080"}, {"orange", "ffa500"}, {"yellow", "ffff00"}};
    auto cn = colors.find(lowerCase(text));
    std::string hex = cn != colors.end() ? cn->second : (!text.empty() && text[0] == '#' ? text.substr(1) : text);
    static const std::regex shortHex(R"(^[\da-fA-F]{3,4}$)"), longHex(R"(^[\da-fA-F]{6}([\da-fA-F]{2})?$)");
    if (std::regex_match(hex, shortHex)) { std::string w; for (char c : hex) { w += c; w += c; } hex = w; }
    if (!std::regex_match(hex, longHex)) throw std::runtime_error("unsupported color '" + sv + "' (use a name or #RGB/#RRGGBB/#RRGGBBAA)");
    if (hex.size() == 8 && keys[0] != "backgroundColor" && alphaKey.empty()) throw std::runtime_error("alpha is only supported on backgroundColor, color, borderColor, shadowColor and textShadowColor");
    std::vector<StyleOp> ops{{keys[0], static_cast<double>(std::stol(hex.substr(0, 6), nullptr, 16))}};
    if (keys[0] == "backgroundColor") ops.push_back({"backgroundAlpha", hex.size() == 8 ? static_cast<double>(std::stol(hex.substr(6), nullptr, 16)) : 255.0});
    else if (hex.size() == 8) ops.push_back({alphaKey, static_cast<double>(std::stol(hex.substr(6), nullptr, 16))});   // the alpha follows its colour (which sets it opaque)
    return ops;
  }
  if ((name == "width" || name == "height") && sv == "auto") return {{name, -1}};
  if ((name == "minWidth" || name == "maxWidth" || name == "minHeight" || name == "maxHeight") && (sv == "auto" || sv == "none")) return {{name, -1}};
  if (name == "aspectRatio") {   // "16/9" or "1.5" (React Native takes both)
    static const std::regex ratio(R"(^\s*(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)\s*$)");
    std::smatch rm;
    if (std::regex_match(sv, rm, ratio) && std::stod(rm[2].str()) > 0) return {{"aspectRatio", std::stod(rm[1].str()) / std::stod(rm[2].str())}};
  }
  static const std::regex pct(R"(^\d+(\.\d+)?%$)");
  if ((name == "width" || name == "height") && std::regex_match(sv, pct)) {
    double percent = std::stod(sv);
    if (percent > 1000000) throw std::runtime_error("percentage out of range");
    if (percent == 0) return {{name, 0}};
    return {{name + "Percent", percent / 100}};
  }
  if (std::regex_match(sv, pct)) {   // padding, margin, insets, gaps and min/max sizes as a percent of the containing block (rn engine, ZN-382)
    static const std::set<std::string> pctKeys = {"paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "marginTop", "marginRight", "marginBottom", "marginLeft",
        "top", "left", "right", "bottom", "gap", "columnGap", "rowGap", "minWidth", "maxWidth", "minHeight", "maxHeight"};
    auto al = kStyleAliases.find(name);
    std::vector<std::string> keys = al != kStyleAliases.end() ? al->second : std::vector<std::string>{name};
    std::vector<StyleOp> ops;
    for (const std::string& k : keys) if (pctKeys.count(k)) ops.push_back({k + "Percent", std::stod(sv) / 100});
    if (ops.size() == keys.size()) return ops;
  }
  static const std::regex len(R"(^-?(?:\d+\.?\d*|\.\d+)(px|rem|em)?$)");
  if (std::regex_match(sv, len)) {
    double n = std::stod(sv);
    if (sv.size() >= 2 && (sv.compare(sv.size() - 2, 2, "em") == 0)) n *= 16;
    StyleVal nv; nv.isNum = true; nv.num = n;
    return styleEntry(name, nv);
  }
  if (name == "padding" || name == "margin") {
    std::vector<std::string> parts;
    std::size_t at = 0;
    while (at < sv.size()) {
      while (at < sv.size() && std::isspace(static_cast<unsigned char>(sv[at]))) ++at;
      std::size_t e = at;
      while (e < sv.size() && !std::isspace(static_cast<unsigned char>(sv[e]))) ++e;
      if (e > at) parts.push_back(sv.substr(at, e - at));
      at = e;
    }
    if (parts.size() > 1 && parts.size() <= 4) {
      std::string t = parts[0], r = parts.size() > 1 ? parts[1] : t, b = parts.size() > 2 ? parts[2] : t, l = parts.size() > 3 ? parts[3] : r;
      std::string four[4] = {t, r, b, l};
      std::vector<StyleOp> ops;
      for (std::size_t i = 0; i < keys.size(); ++i) { auto sub = styleEntry(keys[i], StyleVal{false, 0, four[i]}); ops.insert(ops.end(), sub.begin(), sub.end()); }
      return ops;
    }
  }
  throw std::runtime_error("unsupported " + name + ": '" + sv + "'");
}

std::string quote(const std::string& s) {
  std::string r = "\"";
  for (char c : s) {
    if (c == '"' || c == '\\') { r += '\\'; r += c; }
    else if (c == '\n') r += "\\n";
    else r += c;
  }
  return r + "\"";
}

std::string trim(const std::string& s) {
  std::size_t a = 0, b = s.size();
  while (a < b && std::isspace(static_cast<unsigned char>(s[a]))) ++a;
  while (b > a && std::isspace(static_cast<unsigned char>(s[b - 1]))) --b;
  return s.substr(a, b - a);
}

// JSX whitespace: text spanning lines is trimmed per line; inline text keeps its spaces (collapsed).
std::string jsxText(const std::string& t) {
  if (t.find('\n') != std::string::npos) {
    std::string out;
    std::size_t at = 0;
    while (at <= t.size()) {
      std::size_t nl = t.find('\n', at);
      std::string line = trim(t.substr(at, nl == std::string::npos ? std::string::npos : nl - at));
      if (!line.empty()) out += (out.empty() ? "" : " ") + line;
      if (nl == std::string::npos) break;
      at = nl + 1;
    }
    return out;
  }
  std::string out;
  bool space = false;
  for (char c : t) {
    if (std::isspace(static_cast<unsigned char>(c))) { if (!space) out += ' '; space = true; }
    else { out += c; space = false; }
  }
  return out;
}

// Lowered text without the markers of Lowering::mark, for the tests made on it (a literal, a percent template).
static std::string bare(const std::string& t) {
  if (t.find('\x01') == std::string::npos) return t;
  std::string o;
  for (std::size_t i = 0; i < t.size(); ++i) {
    if (t[i] == '\x01' && i + 1 < t.size() && t[i + 1] == 'Z') { i += 2; while (i < t.size() && std::isdigit(static_cast<unsigned char>(t[i]))) ++i; continue; }   // the kind letter is skipped by the loop
    o += t[i];
  }
  return o;
}

struct Lowering {
  std::string_view s;
  std::vector<Token> t;
  bool react = false;
  bool marks = false;   // lowerJsx: where copies and element code begin, for unmark() (a style sheet's lowering has none)
  std::string mark(std::size_t pos, char kind) const { return marks ? "\x01Z" + std::to_string(pos) + kind : std::string(); }   // kind C: a copy from pos, G: code for pos
  std::set<std::string> classTags;   // names that are class components (ZN-163)
  int counter = 0;
  std::map<std::string, std::string> imported;
  std::string lib;
  bool hot = false;   // zinc dev's hot mode, a file of the project: Solid calls to the project's components get their Fast Refresh proxy
  std::string devFile;   // a dev run (zinc dev, ZINC_DEV=1), a file of the project: each component call records its name, file:line and props for the inspector

  std::string tx(std::size_t i) const { return std::string(s.substr(t[i].start, t[i].end - t[i].start)); }
  bool isP(std::size_t i, const char* p) const { return i < t.size() && t[i].kind == Tok::Punct && tx(i) == p; }
  bool isK(std::size_t i, const char* p) const { return i < t.size() && t[i].kind == Tok::Keyword && tx(i) == p; }
  [[noreturn]] void fail(std::size_t i, const std::string& msg) const { throw Failure{t[i < t.size() ? i : t.size() - 1].start, msg}; }

  bool endsExpr(std::size_t i) const {
    switch (t[i].kind) {
      case Tok::Ident: case Tok::PrivateName: case Tok::Number: case Tok::BigInt: case Tok::String: case Tok::Regex:
      case Tok::TemplateNoSub: case Tok::TemplateTail: case Tok::JsxText: return true;
      case Tok::Keyword: { std::string x = tx(i); return x == "this" || x == "super" || x == "null" || x == "true" || x == "false"; }
      case Tok::Punct: { std::string x = tx(i); return x == ")" || x == "]" || x == "}" || x == "++" || x == "--"; }
      default: return false;
    }
  }
  bool jsxStart(std::size_t i) const {
    if (!isP(i, "<") || i + 1 >= t.size()) return false;
    if (i > 0 && endsExpr(i - 1)) return false;
    // `<T,>(x: T) => x` and `<T extends U>(x: T) => x` are the type parameters of an arrow function, as TypeScript reads a .tsx file
    if (t[i + 1].kind == Tok::Ident && i + 3 < t.size() && (isP(i + 2, ",") || (tx(i + 2) == "extends" && !isP(i + 3, "=") && !isP(i + 3, ">") && !isP(i + 3, "/")))) return false;
    return t[i + 1].kind == Tok::Ident || isP(i + 1, ">");
  }
  // index of the `}` / `)` / `]` closing the bracket at `i`
  std::size_t match(std::size_t i) const {
    int d = 0;
    for (std::size_t k = i; k < t.size(); ++k) {
      if (t[k].kind != Tok::Punct) continue;
      std::string x = tx(k);
      if (x == "{" || x == "(" || x == "[") ++d;
      else if (x == "}" || x == ")" || x == "]") { if (--d == 0) return k; }
    }
    fail(i, "unbalanced bracket in JSX");
  }

  // ---- parsing of one element starting at token `i` (the `<`)
  std::shared_ptr<Elem> parseElem(std::size_t i) {
    auto e = std::make_shared<Elem>();
    e->begin = i;
    ++i;
    if (isP(i, ">")) { e->frag = true; ++i; }
    else {
      e->tag = tx(i);
      if (std::islower(static_cast<unsigned char>(e->tag[0]))) {   // Z0007: components start with a capital letter, as in React
        auto it = kLowerTags.find(e->tag);
        std::string want = it != kLowerTags.end() ? it->second : "";
        if (want.empty()) {
          std::vector<std::string> names;
          for (auto& [low, cap] : kLowerTags) names.push_back(low);
          if (std::string near = nearest(e->tag, names); !near.empty()) want = kLowerTags.at(near);
        }
        failKey(t[i].start, "Z0007", want.empty() ? "diag.detail.jsxCapital" : "diag.detail.jsxWrite", {{"tag", e->tag}, {"want", want}});
      }
      ++i;
      for (;;) {
        if (isP(i, "/>")) { e->selfClosing = true; ++i; e->end = i; return e; }
        if (isP(i, ">")) { ++i; break; }
        if (isP(i, "{")) {   // {...pan.panHandlers} (ZN-366): a PanHandlers object attaches itself; other spreads fail to type-check
          if (!isP(i + 1, "...")) fail(i, "unexpected token in a JSX tag");
          Attr a; a.name = "..."; a.tok = i; a.kind = 2; a.eb = i + 2; a.ee = match(i);
          i = a.ee + 1;
          e->attrs.push_back(a);
          continue;
        }
        if (t[i].kind != Tok::Ident) fail(i, "unexpected token in a JSX tag");
        Attr a;
        a.name = tx(i); a.tok = i;
        if (a.name == "class") failKey(t[i].start, "Z0006", "diag.detail.jsxClassName", {{"tag", e->tag}});
        ++i;
        if (isP(i, "=")) {
          ++i;
          if (t[i].kind == Tok::String) { a.kind = 1; std::string q = tx(i); a.lit = q.substr(1, q.size() - 2); ++i; }
          else if (isP(i, "{")) { std::size_t m = match(i); a.kind = 2; a.eb = i + 1; a.ee = m; i = m + 1; }
          else fail(i, "unsupported JSX attribute value");
        }
        e->attrs.push_back(std::move(a));
      }
    }
    for (;;) {
      // a tag left open (ZN-711): the error is at the tag that opened it, with the closing tag to write
      const std::string open = "<" + e->tag + ">", close = "</" + e->tag + ">";
      auto unclosed = [&](std::uint32_t line, const std::string& other) {   // line: where another tag closes instead, 0 when none does
        if (e->frag) throw Failure{t[e->begin].start, open + " is not closed" + (line ? " (line " + std::to_string(line) + " closes " + other + " instead)" : "") + ": add " + close, "Z0002"};
        failKey(t[e->begin].start, "Z0002", line ? "diag.detail.jsxClosedBy" : "diag.detail.jsxNotClosed", {{"open", open}, {"close", close}, {"line", std::to_string(line)}, {"other", other}});
      };
      if (i >= t.size()) unclosed(0, "");
      if (t[i].kind == Tok::JsxText) { Child c; c.kind = 0; c.text = tx(i); c.tok = i; e->kids.push_back(std::move(c)); ++i; }
      else if (isP(i, "{")) { std::size_t m = match(i); Child c; c.kind = 1; c.eb = i + 1; c.ee = m; c.tok = i; e->kids.push_back(std::move(c)); i = m + 1; }
      else if (isP(i, "</")) {
        ++i;
        if (!e->frag) {  // the closing tag's name
          if (i < t.size() && tx(i) != e->tag) unclosed(lineCol(s, t[i].start).line, isP(i, ">") ? "a fragment, </>" : "</" + tx(i) + ">");
          ++i;
        }
        if (!isP(i, ">")) fail(i, "malformed closing JSX tag");
        ++i;
        e->end = i;
        return e;
      } else if (isP(i, "<")) { Child c; c.kind = 2; c.tok = i; c.el = parseElem(i); i = c.el->end; e->kids.push_back(std::move(c)); }
      else unclosed(0, "");   // a token no child starts with: the element ran past its end
    }
  }

  // ---- source text of a token range with its JSX lowered
  std::string rw(std::size_t a, std::size_t b) {
    if (a >= b) return "";
    std::string out;
    std::size_t pos = t[a].start;
    for (std::size_t i = a; i < b; ++i) {
      if (jsxStart(i)) {
        auto e = parseElem(i);
        out += mark(pos, 'C') + std::string(s.substr(pos, t[i].start - pos)) + lower(*e);
        pos = t[e->end - 1].end;
        i = e->end - 1;
      } else if (styleObjs.count(i) && match(i) < b) {
        out += mark(pos, 'C') + std::string(s.substr(pos, t[i].start - pos)) + styleObject(i + 1, match(i));
        pos = t[match(i)].end;
        i = match(i);
      }
    }
    return out + mark(pos, 'C') + std::string(s.substr(pos, t[b - 1].end - pos)) + mark(t[b - 1].end, 'G');
  }

  std::string lower(const Elem& e) {
    std::vector<std::string> lines;
    std::string v = element(e, lines);
    std::string body;
    for (auto& l : lines) body += l + " ";
    return mark(t[e.begin].start, 'G') + "((): i32 => { " + body + "return " + v + "; })()";   // its lines: unmark() at the next copy
  }

  std::string valueOf(const Attr& a) { return a.kind == 1 ? quote(a.lit) : a.kind == 2 ? rw(a.eb, a.ee) : "true"; }
  static std::string num(int n) { return std::to_string(n); }

  // `x` stripped of enclosing parentheses: the token range of the inner expression
  void strip(std::size_t& a, std::size_t& b) const {
    while (b > a + 1 && isP(a, "(") && match(a) == b - 1) { ++a; --b; }
  }
  bool jsxOnly(std::size_t a, std::size_t b) {
    strip(a, b);
    if (a >= b || !jsxStart(a)) return false;
    return parseElem(a)->end == b;
  }
  bool isNull(std::size_t a, std::size_t b) const { strip(a, b); return b == a + 1 && isK(a, "null"); }
  // [a, b) is an element, or a conditional of elements (`c ? <A/> : <B/>`): what a .map callback returns as rows
  bool jsxValue(std::size_t a, std::size_t b) {
    strip(a, b);
    if (jsxOnly(a, b)) return true;
    if (nodeCallAt(a, b)) return true;   // `cond ? props.render(x) : <View/>`
    std::size_t q = 0, colon = 0;
    int depth = 0;
    scan(a, b, [&](std::size_t i, const std::string& x) {
      if (x == "?") { if (!q) q = i; ++depth; }
      else if (x == ":" && depth > 0 && --depth == 0 && !colon) colon = i;
    });
    return colon && jsxValue(q + 1, colon) && jsxValue(colon + 1, b);
  }

  // top-level scan of [a, b): calls f(i, text) for every token outside brackets and JSX elements
  template <class F> void scan(std::size_t a, std::size_t b, F f) {
    for (std::size_t i = a; i < b; ++i) {
      if (jsxStart(i)) { i = parseElem(i)->end - 1; continue; }
      if (t[i].kind == Tok::Punct) {
        std::string x = tx(i);
        if (x == "(" || x == "[" || x == "{") { i = match(i); continue; }
        f(i, x);
      }
    }
  }

  struct Cond { std::size_t cb, ce; std::string yes, no; bool hasNo = false, negate = false; };
  // [a, b) is `c ? x : y` at its top level: the `?` and its `:`
  bool ternary(std::size_t a, std::size_t b, std::size_t& q, std::size_t& colon) {
    bool hasQ = false;
    int depth = 0;
    colon = 0;
    scan(a, b, [&](std::size_t i, const std::string& x) {
      if (x == "?") { if (!hasQ) { hasQ = true; q = i; } ++depth; }
      else if (x == ":" && hasQ && depth > 0) { if (--depth == 0 && !colon) colon = i; }
    });
    return hasQ && colon != 0;
  }
  bool conditional(std::size_t a, std::size_t b, Cond& out) {
    std::size_t q = 0, colon = 0, lastAnd = 0;
    bool hasQ = false, hasAnd = false, other = false;
    int depth = 0;
    scan(a, b, [&](std::size_t i, const std::string& x) {
      if (x == "?") { if (!hasQ) { hasQ = true; q = i; } ++depth; }
      else if (x == ":" && hasQ && depth > 0) { if (--depth == 0 && !colon) colon = i; }
      else if (x == "&&") { hasAnd = true; lastAnd = i; }
      else if (x == "||" || x == "??") other = true;
    });
    if (hasQ && colon) {
      auto branch = [&](std::size_t x0, std::size_t x1, std::string& dst) {
        std::size_t y0 = x0, y1 = x1;
        strip(y0, y1);
        if (jsxOnly(x0, x1)) { dst = lower(*parseElem(y0)); return true; }
        if (nodeCallAt(y0, y1)) { dst = rw(y0, y1); return true; }   // `cond ? chip('Skip') : null`: a call that makes a node
        Cond in;   // a nested conditional, c1 ? <A/> : c2 ? <B/> : <C/>: a fragment showing one of its branches
        if (y0 >= y1 || !conditional(y0, y1, in)) return false;
        dst = showNode(in);
        return true;
      };
      std::string yes, no;
      bool yj = branch(q + 1, colon, yes), nj = branch(colon + 1, b, no);
      if (yj && (nj || isNull(colon + 1, b))) { out = {a, q, yes, no, nj, false}; return true; }
      if (nj && isNull(q + 1, colon)) { out = {a, q, no, "", false, true}; return true; }
      return false;
    }
    if (!hasQ && hasAnd && !other && jsxOnly(lastAnd + 1, b)) {
      std::size_t y0 = lastAnd + 1, y1 = b;
      strip(y0, y1);
      out = {a, lastAnd, lower(*parseElem(y0)), "", false, false};
      return true;
    }
    if (!hasQ && hasAnd && !other) {   // `cond && props.renderFooter()`
      std::size_t y0 = lastAnd + 1, y1 = b;
      strip(y0, y1);
      if (!nodeCallAt(y0, y1)) return false;
      out = {a, lastAnd, rw(y0, y1), "", false, false};
      return true;
    }
    return false;
  }

  // a conditional as an expression: a fragment that shows its branch (react: the branch itself)
  std::string showNode(const Cond& c) {
    std::string cond = rw(c.cb, c.ce);
    if (c.negate) cond = "!(" + cond + ")";
    if (react) return "((" + cond + ") ? " + c.yes + " : " + (c.hasNo ? c.no : "_el(6)") + ")";
    std::string v = "__n" + std::to_string(counter++);
    return "((): i32 => { const " + v + ": i32 = _el(6); _show(" + v + ", " + showArgs(cond, c) + "); return " + v + "; })()";
  }
  // The condition and branches of _show: each branch tests the condition again, so what it narrows (`p.children !== undefined ?
  // p.children() : ...`) stays narrowed in the branch's own function, as in the ternary written
  std::string showArgs(const std::string& cond, const Cond& c) {
    return "() => (" + cond + "), () => ((" + cond + ") ? " + c.yes + " : _el(6)), " + (c.hasNo ? "() => ((" + cond + ") ? _el(6) : " + c.no + ")" : std::string("null"));
  }

  // `callee(args)` over [a, b): the open paren, or 0
  std::size_t callParen(std::size_t a, std::size_t b) {
    if (b <= a + 2 || !isP(b - 1, ")")) return 0;
    std::size_t open = b - 1;
    int d = 0;
    for (std::size_t k = b; k-- > a;) {
      if (t[k].kind != Tok::Punct) continue;
      std::string x = tx(k);
      if (x == ")" || x == "]" || x == "}") ++d;
      else if (x == "(" || x == "[" || x == "{") { if (--d == 0) { open = k; break; } }
    }
    return open > a ? open : 0;
  }
  // [a, b) is a call of a function that makes a node: `Card(x)`, `props.renderItem(x)`, a function of this file that returns JSX
  bool nodeCallAt(std::size_t a, std::size_t b) {
    const std::size_t open = callParen(a, b);
    return open && dotted(a, open) && nodeCall(calleeText(a, open));
  }
  bool dotted(std::size_t a, std::size_t b) const {   // `a.b.c` and nothing else over [a, b)
    for (std::size_t k = a; k < b; ++k) if (!(t[k].kind == Tok::Ident || (isP(k, ".") && k > a))) return false;
    return b > a;
  }
  std::string calleeText(std::size_t a, std::size_t open) const { std::string r; for (std::size_t k = a; k < open; ++k) r += tx(k); return r; }
  static bool childrenCall(const std::string& callee) {
    std::size_t dot = callee.rfind('.');
    std::string last = dot == std::string::npos ? callee : callee.substr(dot + 1);
    if (last == "children" || last == "render") return true;   // `props.render(item)`: a render prop
    return last.size() > 6 && last.compare(0, 6, "render") == 0 && std::isupper(static_cast<unsigned char>(last[6]));
  }
  // The functions of this file that return JSX (components and helpers, `function f() { return <View .../>; }` or `const f = () => <View/>`):
  // a call of one as a child is a node to mount, not a number to print (ZN-689).
  std::set<std::string> jsxFns;
  std::set<std::string> jsxVars;   // the variables of this file that hold an element (filled with jsxFns)
  bool jsxFnsRead = false;
  bool bodyReturnsJsx(std::size_t open, std::size_t close) {
    for (std::size_t k = open + 1; k < close; ++k) {
      if (!isK(k, "return")) continue;
      std::size_t r0 = k + 1;
      while (isP(r0, "(")) ++r0;
      if (jsxStart(r0)) return true;
    }
    return false;
  }
  const std::set<std::string>& jsxFunctions() {
    if (jsxFnsRead) return jsxFns;
    jsxFnsRead = true;
    for (std::size_t i = 0; i + 3 < t.size(); ++i) {
      if (isK(i, "function") && t[i + 1].kind == Tok::Ident) {
        std::size_t p = i + 2;
        while (p < t.size() && !isP(p, "(") && !isP(p, "{") && !isP(p, ";")) ++p;   // past type parameters
        if (!isP(p, "(")) continue;
        std::size_t q = match(p) + 1;
        while (q < t.size() && !isP(q, "{") && !isP(q, ";") && !isP(q, "=>")) ++q;   // past the return type
        if (isP(q, "{") && bodyReturnsJsx(q, match(q))) jsxFns.insert(tx(i + 1));
      } else if ((isK(i, "const") || isK(i, "let")) && t[i + 1].kind == Tok::Ident) {
        for (std::size_t d = i + 1; d < t.size() && t[d].kind == Tok::Ident;) {   // every declarator: `const a = 1, body = <View/>;`
          std::size_t q = d + 1;
          if (isP(q, ":")) { while (q < t.size() && !isP(q, "=") && !isP(q, ";") && !isP(q, ",")) { if (isP(q, "(") || isP(q, "[") || isP(q, "{")) q = match(q); ++q; } }
          std::size_t end = q + 1;   // the end of the initializer: a `;` or a `,` outside brackets
          if (isP(q, "=")) {
            while (end < t.size() && !isP(end, ";") && !isP(end, ",")) { if (isP(end, "(") || isP(end, "[") || isP(end, "{")) end = match(end); else if (jsxStart(end)) end = parseElem(end)->end - 1; ++end; }
            if (returnsJsx(q + 1, end)) jsxFns.insert(tx(d));
            else if (jsxValue(q + 1, end)) jsxVars.insert(tx(d));   // a node held in a variable: `{body}` mounts it
          } else end = q;
          if (!isP(end, ",")) break;
          d = end + 1;
        }
      } else if (t[i].kind == Tok::Ident && isP(i + 1, "=") && !isP(i + 2, "{") && !(i > 0 && (isP(i - 1, ".") || isP(i - 1, "?.")))) {
        // an element assigned later, `let form; if (a) form = <View/>; else form = <Text/>;`: `{form}` mounts it too (a JSX attribute,
        // `title={<Text/>}`, is not an assignment: its value starts with a brace)
        std::size_t end = i + 2;
        while (end < t.size() && !isP(end, ";") && !isP(end, ",") && !isP(end, ")") && !isP(end, "}")) {
          if (isP(end, "(") || isP(end, "[") || isP(end, "{")) end = match(end); else if (jsxStart(end)) end = parseElem(end)->end - 1;
          ++end;
        }
        if (end > i + 2 && jsxValue(i + 2, end)) jsxVars.insert(tx(i));
      }
    }
    return jsxFns;
  }
  // A call that gives a node: render functions, the file's functions that return JSX, and components (a capitalised bare name, as React
  // names them; the global constructors that make strings and numbers, String(x) and the like, are not).
  bool nodeCall(const std::string& callee) {
    if (childrenCall(callee)) return true;
    if (callee.empty() || callee.find('.') != std::string::npos || callee.find('<') != std::string::npos) return false;
    if (jsxFunctions().count(callee)) return true;
    static const std::set<std::string> builtins{"String", "Number", "Boolean", "BigInt", "Symbol", "Date", "Array", "Object", "Error", "RegExp", "Map", "Set", "Promise", "JSON", "Math", "Intl"};
    return std::isupper(static_cast<unsigned char>(callee[0])) && !builtins.count(callee);
  }
  // A prop value that may read a signal when it is evaluated: a call outside the bodies of the functions it holds and outside JSX
  // (`title={page()}`, `items={xs.map(...)}`), not `onClick={() => go(p)}`, `label="x"`, `size={n}`, `icon={<Icon/>}`.
  bool readsAtEval(std::size_t a, std::size_t b) {
    for (std::size_t i = a; i < b; ++i) {
      if (jsxStart(i)) { i = parseElem(i)->end - 1; continue; }
      if (isK(i, "function")) { while (i < b && !isP(i, "{")) ++i; if (i < b) i = match(i); continue; }
      if (isP(i, "=>")) {   // an arrow's body: a block, or an expression up to the `,` or the bracket that ends it
        if (isP(i + 1, "{")) { i = match(i + 1); continue; }
        std::size_t j = i + 1;
        for (; j < b; ++j) {
          if (jsxStart(j)) { j = parseElem(j)->end - 1; continue; }
          if (isP(j, "(") || isP(j, "[") || isP(j, "{")) { j = match(j); continue; }
          if (isP(j, ",") || isP(j, ")") || isP(j, "]") || isP(j, "}")) break;
        }
        i = j - 1;
        continue;
      }
      if (isP(i, "(") && i > a && (t[i - 1].kind == Tok::Ident || isP(i - 1, ")") || isP(i - 1, "]") || isP(i - 1, "?."))) return true;
    }
    return false;
  }
  bool hasJsx(std::size_t a, std::size_t b) const { for (std::size_t i = a; i < b; ++i) if (jsxStart(i)) return true; return false; }
  // [a, b) is an arrow function (`x => ...`, `({ pressed }) => ...`, `(s: T): R => ...`): the index of its `=>`, else 0
  std::size_t arrowAt(std::size_t a, std::size_t b) const {
    strip(a, b);
    if (a + 1 < b && t[a].kind == Tok::Ident && isP(a + 1, "=>")) return a + 1;
    if (!isP(a, "(")) return 0;
    std::size_t q = match(a) + 1;
    if (isP(q, ":")) while (q < b && !isP(q, "=>")) { if (isP(q, "(") || isP(q, "[") || isP(q, "{")) q = match(q); ++q; }   // past a return type
    return q < b && isP(q, "=>") ? q : 0;
  }

  // an arrow function over [a, b) that returns JSX
  bool returnsJsx(std::size_t a, std::size_t b) {
    std::size_t arrow = 0;
    scan(a, b, [&](std::size_t i, const std::string& x) { if (x == "=>" && !arrow) arrow = i; });
    if (!arrow) return false;
    std::size_t x0 = arrow + 1, x1 = b;
    if (isP(x0, "{")) {
      for (std::size_t k = x0; k < x1; ++k) {
        if (!isK(k, "return")) continue;
        std::size_t r1 = 0;
        scan(k + 1, x1, [&](std::size_t i, const std::string& x) { if (!r1 && (x == ";" || x == "}")) r1 = i; });
        if (r1 && jsxValue(k + 1, r1)) return true;
      }
      return false;
    }
    return jsxValue(x0, x1);
  }

  // ---- style={...}: an object, an array of layers, a conditional of those, or any expression of type Style
  std::string styleLayers(std::size_t a, std::size_t b) {
    strip(a, b);
    if (isP(a, "[") && match(a) == b - 1) {
      std::string out = "[";
      std::size_t from = a + 1;
      bool first = true;
      auto emit = [&](std::size_t x, std::size_t y) { if (x < y) { out += (first ? "" : ", ") + styleExpr(x, y); first = false; } };
      scan(a + 1, b - 1, [&](std::size_t i, const std::string& x) { if (x == ",") { emit(from, i); from = i + 1; } else if (x == "...") fail(i, "spread style arrays are unsupported"); });
      emit(from, b - 1);
      return out + "]";
    }
    return "[" + styleExpr(a, b) + "]";
  }
  // a style expression made only of literals is evaluated once, at the top of the module
  bool constantStyle(std::size_t a, std::size_t b) {
    if (b == a + 1) return t[a].kind == Tok::Number || t[a].kind == Tok::String || t[a].kind == Tok::TemplateNoSub || isK(a, "null") || isK(a, "false");
    if (b == a + 2) return isP(a, "-") && t[a + 1].kind == Tok::Number;
    bool obj = isP(a, "{") && match(a) == b - 1, arr = isP(a, "[") && match(a) == b - 1;
    if (!obj && !arr) return false;
    std::vector<std::pair<std::size_t, std::size_t>> parts;
    std::size_t from = a + 1;
    scan(a + 1, b - 1, [&](std::size_t i, const std::string& x) { if (x == ",") { parts.push_back({from, i}); from = i + 1; } });
    if (from < b - 1) parts.push_back({from, b - 1});
    for (auto [x, y] : parts) {
      if (x >= y) continue;
      if (obj) {
        if (!(t[x].kind == Tok::Ident || t[x].kind == Tok::String) || !isP(x + 1, ":") || !constantStyle(x + 2, y)) return false;
      } else if (!constantStyle(x, y)) return false;
    }
    return true;
  }
  std::vector<std::string> staticStyles;
  // Styles computed by a function or held in a constant of this file (`style={seg(on)}`, `style={card}`): the names a style attribute reads,
  // gathered by a first pass, and the object literals those declarations give, lowered to a Style where they are written.
  std::set<std::string> styleNames;
  std::set<std::size_t> styleObjs;   // the `{` of each object literal to lower
  void collectStyleNames(std::size_t a, std::size_t b) {
    for (std::size_t k = a; k < b; ++k) {
      if (isP(k, "{")) { k = match(k); continue; }   // an object written in place is lowered already
      if (t[k].kind != Tok::Ident || (k > a && isP(k - 1, "."))) continue;
      if (isP(k + 1, "(")) { styleNames.insert(tx(k)); k = match(k + 1); continue; }
      if (k + 1 >= b || isP(k + 1, ",") || isP(k + 1, "]") || isP(k + 1, ":") || isP(k + 1, ")")) styleNames.insert(tx(k));
    }
  }
  void returnedObjects(std::size_t open, std::size_t close) {   // `return {...}` and `return ({...})` in a block
    for (std::size_t k = open + 1; k < close; ++k) {
      if (!isK(k, "return")) continue;
      std::size_t r = k + 1;
      while (isP(r, "(")) ++r;
      if (isP(r, "{")) styleObjs.insert(r);
    }
  }
  void findStyleObjects() {
    for (std::size_t i = 0; i + 3 < t.size(); ++i) {
      if (isK(i, "function") && t[i + 1].kind == Tok::Ident && styleNames.count(tx(i + 1))) {
        std::size_t p = i + 2;
        while (p < t.size() && !isP(p, "(") && !isP(p, "{") && !isP(p, ";")) ++p;
        if (!isP(p, "(")) continue;
        std::size_t q = match(p) + 1;
        while (q < t.size() && !isP(q, "{") && !isP(q, ";") && !isP(q, "=>")) ++q;
        if (isP(q, "{")) returnedObjects(q, match(q));
      } else if ((isK(i, "const") || isK(i, "let")) && t[i + 1].kind == Tok::Ident && styleNames.count(tx(i + 1))) {
        std::size_t q = i + 2;
        if (isP(q, ":")) { while (q < t.size() && !isP(q, "=") && !isP(q, ";")) { if (isP(q, "(") || isP(q, "[") || isP(q, "{")) q = match(q); ++q; } }
        if (!isP(q, "=")) continue;
        if (isP(q + 1, "{")) { styleObjs.insert(q + 1); continue; }   // const card = { ... }
        std::size_t arrow = q + 1;   // const seg = (on) => ({ ... }) or => { return { ... }; }
        while (arrow < t.size() && !isP(arrow, "=>") && !isP(arrow, ";") && !isP(arrow, ",")) { if (isP(arrow, "(") || isP(arrow, "[") || isP(arrow, "<")) arrow = isP(arrow, "<") ? arrow : match(arrow); ++arrow; }
        if (!isP(arrow, "=>")) continue;
        std::size_t r = arrow + 1;
        if (isP(r, "{")) returnedObjects(r, match(r));
        else { while (isP(r, "(")) ++r; if (isP(r, "{")) styleObjs.insert(r); }
      }
    }
  }
  std::string styleExpr(std::size_t a, std::size_t b) {
    strip(a, b);
    if (b == a + 1 && (isK(a, "null") || isK(a, "false") || (t[a].kind == Tok::Ident && tx(a) == "undefined"))) return "new __ZStyle([], [])";
    std::size_t q = 0, colon = 0, andAt = 0;
    int depth = 0;
    scan(a, b, [&](std::size_t i, const std::string& x) {
      if (x == "?") { if (!q) q = i; ++depth; }
      else if (x == ":" && q && depth > 0) { if (--depth == 0 && !colon) colon = i; }
      else if (x == "&&" && !q) andAt = i;
    });
    if (q && colon) return "(" + rw(a, q) + " ? " + styleExpr(q + 1, colon) + " : " + styleExpr(colon + 1, b) + ")";
    if (andAt && !q) return "(" + rw(a, andAt) + " ? " + styleExpr(andAt + 1, b) + " : new __ZStyle([], []))";
    if (isP(a, "{") && match(a) == b - 1) return styleObject(a + 1, b - 1);
    return rw(a, b);
  }
  // the JavaScript text of a number (shortest form that reads back)
  static std::string jsNumber(double v) {
    char buf[40];
    return std::string(buf, zn::shortestDouble(buf, buf + sizeof buf, v, false));
  }
  // A value of a string-valued key decided at run time (ZN-362): `cond ? 'bold' : 'normal'`, nested, between literals. Each literal goes through styleEntry
  // like a static value, so the branches become numbers on the same keys; a colour becomes its 0xRRGGBB number. Empty when [a, b) is not such a tree.
  std::vector<std::pair<std::string, std::string>> literalChoice(const std::string& key, std::size_t a, std::size_t b) {
    strip(a, b);
    std::size_t q = 0, colon = 0;
    int depth = 0;
    scan(a, b, [&](std::size_t i, const std::string& x) {
      if (x == "?") { if (!q) q = i; ++depth; }
      else if (x == ":" && q && depth > 0) { if (--depth == 0 && !colon) colon = i; }
    });
    if (q && colon) {
      auto l = literalChoice(key, q + 1, colon), r = literalChoice(key, colon + 1, b);
      if (l.empty() || r.empty()) return {};
      if (l.size() != r.size()) fail(q, "both branches of '" + styleName(key) + "' must set the same properties");
      for (std::size_t k = 0; k < l.size(); ++k) {
        if (l[k].first != r[k].first) fail(q, "both branches of '" + styleName(key) + "' must set the same properties");
        l[k].second = "(" + rw(a, q) + " ? " + l[k].second + " : " + r[k].second + ")";
      }
      return l;
    }
    StyleVal lv;
    if (b == a + 1 && (t[a].kind == Tok::String || t[a].kind == Tok::TemplateNoSub)) lv.str = tx(a).substr(1, tx(a).size() - 2);
    else if (b == a + 1 && t[a].kind == Tok::Number) { lv.isNum = true; lv.num = std::strtod(tx(a).c_str(), nullptr); }
    else if (b == a + 2 && isP(a, "-") && t[a + 1].kind == Tok::Number) { lv.isNum = true; lv.num = -std::strtod(tx(a + 1).c_str(), nullptr); }
    else return {};
    std::vector<std::pair<std::string, std::string>> out;
    try { for (const StyleOp& op : styleEntry(key, lv)) out.push_back({op.key, jsNumber(op.value)}); } catch (const std::runtime_error& e) { fail(a, e.what()); }
    if (out.size() == 1 && !colorAlphaKey(out[0].first).empty()) out.push_back({colorAlphaKey(out[0].first), "255"});   // '#fff8' and 'red' set the same keys
    return out;
  }
  std::string styleObject(std::size_t a, std::size_t b) {
    std::vector<std::string> keys, values, resources;
    bool tokens = false;   // a class token ('@font-mono', '@bg-[...]'): ui.styleC(), which brings the class parser into the program (ZN-774.18)
    std::size_t from = a;
    std::vector<std::pair<std::size_t, std::size_t>> props;
    scan(a, b, [&](std::size_t i, const std::string& x) { if (x == ",") { props.push_back({from, i}); from = i + 1; } });
    if (from < b) props.push_back({from, b});
    for (auto [x, y] : props) {
      if (x >= y) continue;
      if (!(t[x].kind == Tok::Ident || t[x].kind == Tok::String) || isP(x, "...")) fail(x, "style objects use named properties; compose with style={[base, override]}");
      std::string key = tx(x);
      if (t[x].kind == Tok::String) key = key.substr(1, key.size() - 2);
      std::size_t vb = x + 1, ve = y;
      if (isP(x + 1, ":")) vb = x + 2; else { vb = x; ve = x + 1; }  // shorthand `{ gap }`
      if (styleName(key) == "textShadowRadius") continue;   // accepted: the text shadow is drawn sharp, as the text-shadow-* classes (docs/ui.md)
      const std::string off = styleName(key) == "textShadowOffset" ? "textShadowOffset" : "shadowOffset";
      if (styleName(key) == off && vb < ve && isP(vb, "{") && isP(ve - 1, "}")) {   // React Native's { width, height } (ZN-360)
        std::vector<std::pair<std::size_t, std::size_t>> parts;
        std::size_t from2 = vb + 1;
        scan(vb + 1, ve - 1, [&](std::size_t q, const std::string& tk) { if (tk == ",") { parts.push_back({from2, q}); from2 = q + 1; } });
        if (from2 < ve - 1) parts.push_back({from2, ve - 1});
        for (auto [p0, p1] : parts) {
          if (p1 < p0 + 3 || !isP(p0 + 1, ":")) fail(p0, off + " takes { width: number, height: number }");
          const std::string side = tx(p0);
          if (side != "width" && side != "height") fail(p0, off + " takes { width: number, height: number }");
          keys.push_back(quote(off + (side == "width" ? "X" : "Y")));
          values.push_back("(" + rw(p0 + 2, p1) + ")");
        }
        continue;
      }
      if (styleName(key) == "transitionProperty" && vb < ve && isP(vb, "[") && isP(ve - 1, "]")) {   // ['opacity', 'transform'] (Reanimated's): one mask
        std::string names;
        for (std::size_t q = vb + 1; q + 1 < ve; ++q) {
          if (t[q].kind == Tok::String) names += tx(q).substr(1, tx(q).size() - 2) + ",";
          else if (!isP(q, ",")) fail(q, "transitionProperty takes a name or an array of names");
        }
        try { keys.push_back(quote("transitionProperty")); values.push_back(jsNumber(transitionMask(names))); } catch (const std::runtime_error& e) { fail(vb, e.what()); }
        continue;
      }
      if (styleName(key) == "transform" && vb < ve && isP(vb, "[") && isP(ve - 1, "]")) {   // React Native's [{ rotate: '45deg' }, { scale: 1.2 }...] (ZN-361)
        const char* use = "transform takes [{ translateX | translateY | scale | scaleX | scaleY | rotate | skewX | skewY: value }, ...]";
        std::vector<std::pair<std::size_t, std::size_t>> entries;
        std::size_t from2 = vb + 1;
        scan(vb + 1, ve - 1, [&](std::size_t q, const std::string& tk) { if (tk == ",") { entries.push_back({from2, q}); from2 = q + 1; } });
        if (from2 < ve - 1) entries.push_back({from2, ve - 1});
        for (auto [e0, e1] : entries) {
          if (e1 < e0 + 5 || !isP(e0, "{") || match(e0) != e1 - 1 || !isP(e0 + 2, ":")) fail(e0, use);
          std::string kind = tx(e0 + 1);
          if (kind == "rotateZ") kind = "rotate";
          if (kind != "translateX" && kind != "translateY" && kind != "scale" && kind != "scaleX" && kind != "scaleY" && kind != "rotate" && kind != "skewX" && kind != "skewY")
            fail(e0 + 1, kind == "perspective" || kind == "rotateX" || kind == "rotateY" || kind == "matrix" ? "transform: " + kind + " is 3D, only 2D transforms are supported" : use);
          std::size_t v0 = e0 + 3, v1 = e1 - 1;
          std::string value = "(" + rw(v0, v1) + ")";
          if (v1 == v0 + 1 && (t[v0].kind == Tok::String || t[v0].kind == Tok::TemplateNoSub)) {   // an angle: '45deg', '-0.5rad', '0.25turn'
            if (kind != "rotate" && kind != "skewX" && kind != "skewY") fail(v0, "transform: " + kind + " takes a number");
            static const std::regex angle(R"(^\s*(-?\d*\.?\d+)\s*(deg|rad|turn)\s*$)");
            std::smatch m;
            const std::string lit = tx(v0).substr(1, tx(v0).size() - 2);
            if (!std::regex_match(lit, m, angle)) fail(v0, "transform: " + kind + " takes an angle like '45deg' or '0.5rad'");
            double deg = std::stod(m[1].str());
            if (m[2] == "rad") deg = deg * 180 / 3.14159265358979323846; else if (m[2] == "turn") deg *= 360;
            value = jsNumber(deg);
          }
          if (kind == "scale") { keys.push_back(quote("scaleX")); values.push_back(value); keys.push_back(quote("scaleY")); values.push_back(value); }   // ponytail: a dynamic scale is read twice
          else { keys.push_back(quote(kind)); values.push_back(value); }
        }
        continue;
      }
      // a literal value (string, number, negative number, hex) becomes numeric operations here; anything else is read when the style is applied
      bool literal = false;
      StyleVal lv;
      if (ve == vb + 1 && (t[vb].kind == Tok::String || t[vb].kind == Tok::TemplateNoSub)) { literal = true; lv.str = tx(vb).substr(1, tx(vb).size() - 2); }
      else if (ve == vb + 1 && t[vb].kind == Tok::Number) { literal = true; lv.isNum = true; lv.num = std::strtod(tx(vb).c_str(), nullptr); if (tx(vb).size() > 1 && (tx(vb)[1] == 'x' || tx(vb)[1] == 'X')) lv.num = static_cast<double>(std::strtoull(tx(vb).c_str() + 2, nullptr, 16)); }
      else if (ve == vb + 2 && isP(vb, "-") && t[vb + 1].kind == Tok::Number) { literal = true; lv.isNum = true; lv.num = -std::strtod(tx(vb + 1).c_str(), nullptr); }
      else if (ve == vb + 1 && (tx(vb) == "true" || tx(vb) == "false")) { literal = true; lv.isNum = true; lv.num = tx(vb) == "true" ? 1 : 0; }   // showsVerticalScrollIndicator: false
      try {
        if (literal) {
          std::string sk = styleName(key);
          for (const StyleOp& op : styleEntry(key, lv)) {
            if (sk == "fontSize" && op.key == "fontSize") resources.push_back("font-size: " + std::to_string(static_cast<long>(std::lround(op.value))) + "px");
            bool color = op.key == "color" || (op.key.size() > 5 && op.key.compare(op.key.size() - 5, 5, "Color") == 0);   // backgroundColor, borderTopColor...
            if (color) { char hx[24]; long long cv = static_cast<long long>(op.value); std::snprintf(hx, sizeof hx, "%llx", static_cast<unsigned long long>(cv < 0 ? -cv : cv)); keys.push_back(quote("@" + op.key + ":" + (cv < 0 ? "-" : "") + std::string(hx))); values.push_back("0"); }
            else { keys.push_back(quote(op.key)); values.push_back(jsNumber(op.value)); tokens = tokens || op.key[0] == '@'; }
          }
        } else {
          std::string sk = styleName(key);
          const bool stringKey = kStyleEnums.count(sk) || sk == "background" || sk == "border";
          if (stringKey || (!kStyleAliases.count(sk) && !kStyleNumeric.count(sk) && sk != "width" && sk != "height")) {   // an enum or string key: a conditional between literals lowers to numbers (ZN-362)
            auto choice = literalChoice(key, vb, ve);
            if (choice.empty() && sk == "fontWeight") choice.push_back({"fontWeight", "(" + rw(vb, ve) + ")"});   // a number: 100 to 900
            if (choice.empty()) fail(vb, "'" + sk + "' takes a literal or a conditional between literals (c ? 'a' : 'b'); a string decided elsewhere cannot be lowered");
            for (auto& [k, v] : choice) { keys.push_back(quote(k)); values.push_back(v); tokens = tokens || k[0] == '@'; }
            continue;
          }
          const std::string ck = kStyleAliases.count(sk) && kStyleAliases.at(sk).size() == 1 ? kStyleAliases.at(sk)[0] : sk;   // bg is backgroundColor
          bool colourKey = ck == "color" || (ck.size() > 5 && ck.compare(ck.size() - 5, 5, "Color") == 0);
          if (colourKey) {   // a conditional between colour literals: their numbers (a number decided elsewhere stays a number)
            auto choice = literalChoice(key, vb, ve);
            if (!choice.empty()) {
              for (auto& [k, v] : choice) { keys.push_back(quote(k)); values.push_back(v); }
              bool alpha = false;
              for (auto& kv : choice) alpha = alpha || kv.first == "backgroundAlpha";
              if (ck == "backgroundColor" && !alpha) { keys.push_back(quote("backgroundAlpha")); values.push_back("255"); }
              continue;
            }
          }
          std::string raw = rw(vb, ve);
          std::string dk = key;
          if ((styleName(key) == "width" || styleName(key) == "height") && ve > vb + 2 && t[vb].kind == Tok::Ident && tx(vb) == "pct" && isP(vb + 1, "(") && isP(ve - 1, ")")) {
            dk = styleName(key) + "Percent";   // width: pct(v()): a percent decided at run time (ZN-359)
            raw = "(" + rw(vb + 2, ve - 1) + ") / 100";
          }
          static const std::regex percentTemplate(R"(^`\$\{([^`]*)\}%`$)");   // React Native's width: `${p}%` (ZN-290)
          std::smatch pm;
          const std::string rawText = bare(raw);
          if ((styleName(key) == "width" || styleName(key) == "height") && std::regex_match(rawText, pm, percentTemplate)) {
            dk = styleName(key) + "Percent";
            raw = "(" + pm[1].str() + ") / 100";
          }
          if (sk == "showsVerticalScrollIndicator" || sk == "showsHorizontalScrollIndicator") raw = "((" + raw + ") ? 1 : 0)";   // a boolean decided at run time
          for (const std::string& k : numericStyleKeys(dk)) {
            keys.push_back(quote(k)); values.push_back("(" + raw + ")");
            if (k == "backgroundColor") { keys.push_back(quote("backgroundAlpha")); values.push_back("255"); }
          }
        }
      } catch (const std::runtime_error& e) { fail(vb < t.size() ? vb : x, e.what()); }
    }
    std::string ks, vs;
    for (std::size_t k = 0; k < keys.size(); ++k) { ks += (k ? ", " : "") + keys[k]; vs += (k ? ", " : "") + values[k]; }
    std::string rs;
    for (std::size_t k = 0; k < resources.size(); ++k) rs += (k ? "; " : "") + resources[k];
    return std::string(tokens ? "__ZStyleC([" : "new __ZStyle([") + ks + "], [" + vs + "])" + (rs.empty() ? "" : " /* " + rs + " */");
  }

  std::string element(const Elem& e, std::vector<std::string>& out) {
    std::string v = "__n" + std::to_string(counter++);
    if (e.frag) {
      out.push_back("const " + v + ": i32 = _el(6);");
      children(v, e.kids, out);
      return v;
    }
    const std::string& tag = e.tag;
    bool upper = std::isupper(static_cast<unsigned char>(tag[0]));
    if (upper && !jsxHostTag(tag, imported, e.begin)) return component(e, out);
    auto tagIt = kTags.find(tag);
    if (tagIt == kTags.end()) fail(e.begin + 1, "unknown host component <" + tag + "> (View, Text, Button, Image, ScrollView, Canvas, Input, TextArea)");
    int tagNo = tagIt->second;
    out.push_back("const " + v + ": i32 = _el(" + num(tagNo) + ");");
    for (const Attr& a : e.attrs) {
      const std::string& name = a.name;
      std::string expr = a.kind == 2 ? valueOf(a) : "true";
      const std::string plainExpr = bare(expr);   // what the tests below read: the text the user wrote
      bool lit = a.kind == 1;
      auto push = [&](const std::string& l) { out.push_back(l); };
      if (name == "className") {
        if (lit) {
          std::size_t at = 0;
          while (at < a.lit.size()) {
            while (at < a.lit.size() && std::isspace(static_cast<unsigned char>(a.lit[at]))) ++at;
            std::size_t end = at;
            while (end < a.lit.size() && !std::isspace(static_cast<unsigned char>(a.lit[end]))) ++end;
            if (end > at && !validClass(a.lit.substr(at, end - at))) fail(a.tok, "unknown class '" + a.lit.substr(at, end - at) + "' (UI-07)");
            at = end;
          }
          push("_class(" + v + ", " + quote(a.lit) + ");");
        }
        else push(react ? "_class(" + v + ", " + expr + ");" : "_dynClass(" + v + ", () => (" + expr + "));");
      } else if (name == "onClick" || name == "onPress") push("_on(" + v + ", " + expr + ");");
      else if (name == "...") push("_spread(" + v + ", " + expr + ");");
      else if (name == "onScroll") push("_scroll(" + v + ", " + expr + ");");
      else if (name == "style") {
        if (a.kind != 2) fail(a.tok, "style expects an object, a StyleSheet entry or an array of styles");
        collectStyleNames(a.eb, a.ee);
        std::string layers = styleLayers(a.eb, a.ee);
        if (constantStyle(a.eb, a.ee)) { std::string id = "__zsheet" + std::to_string(staticStyles.size()); staticStyles.push_back("const " + id + " = " + layers + ";"); layers = id; }
        push(react ? "_styles(" + v + ", " + layers + ");" : "_dynStyles(" + v + ", () => " + layers + ");");
      }
      else if (name == "src") push(lit ? "_img(" + v + ", " + quote(a.lit) + ");" : react ? "_img(" + v + ", " + expr + ");" : "_dynImg(" + v + ", () => (" + expr + "));");
      else if (name == "image") push(react ? "_imgH(" + v + ", " + expr + ");" : "_dynImgH(" + v + ", () => (" + expr + "));");   // a runtime image (imageFromBytes, a plugin): what src is for the assets
      else if (name == "ref") push("_ref(" + v + ", " + expr + ");");
      else if (name == "focusable") push("_focusable(" + v + ");");
      else if (name == "debugName") {}
      else if (name == "role") push("_str(" + v + ", 'role', " + (lit ? quote(a.lit) : expr) + ");");
      else if (name == "aria-label") push(lit ? "_str(" + v + ", 'label', " + quote(a.lit) + ");" : react ? "_str(" + v + ", 'label', " + expr + ");" : "_dynStr(" + v + ", 'label', () => (" + expr + "));");
      else if (name == "aria-hidden") push("_num(" + v + ", 'ariaHidden', " + (lit || a.kind == 0 || plainExpr == "true" ? "1" : "0") + ");");
      else if (name.rfind("aria-", 0) == 0 || name.rfind("data-", 0) == 0) {   // aria-checked={on}, data-state="open": read by the aria-*: and data-[k=v]: variants
        const std::string key = quote("attr:" + name);
        if (lit) push("_str(" + v + ", " + key + ", " + quote(a.lit) + ");");
        else push(react ? "_str(" + v + ", " + key + ", String(" + expr + "));" : "_dynStr(" + v + ", " + key + ", () => String(" + expr + "));");
      }
      else if (name == "onDraw") push("_draw(" + v + ", " + expr + ");");
      else if (name == "onSubmit") push("_submit(" + v + ", " + expr + ");");
      else if (name == "accessibilityRole") push("_str(" + v + ", 'role', " + (lit ? quote(a.lit) : expr) + ");");
      else if (name == "scrollKey") push(lit ? "_str(" + v + ", 'scrollKey', " + quote(a.lit) + ");" : react ? "_str(" + v + ", 'scrollKey', " + expr + ");" : "_dynStr(" + v + ", 'scrollKey', () => (" + expr + "));");   // scroll restoration (docs/ui.md)
      else if (name == "accessibilityLabel") push(lit ? "_str(" + v + ", 'label', " + quote(a.lit) + ");" : react ? "_str(" + v + ", 'label', " + expr + ");" : "_dynStr(" + v + ", 'label', () => (" + expr + "));");
      else if (kWebAttrs.count(name) || (name == "type" && !(lit && (a.lit == "password" || a.lit == "text")))) {   // a hint for the page
        const std::string key = quote("attr:" + (name == "htmlFor" ? std::string("for") : name));
        if (a.kind == 0) push("_str(" + v + ", " + key + ", 'true');");
        else if (lit) push("_str(" + v + ", " + key + ", " + quote(a.lit) + ");");
        else push(react ? "_str(" + v + ", " + key + ", String(" + expr + "));" : "_dynStr(" + v + ", " + key + ", () => String(" + expr + "));");
      }
      else if (kPointerAttrs.count(name)) push("_ptr(" + v + ", " + num(kPointerAttrs.at(name)) + ", " + expr + ");");
      else if (name == "onKeyDown") push("_key(" + v + ", " + expr + ");");
      else if (name == "dragAxis" && lit && kDragAxes.count(a.lit)) push("_num(" + v + ", 'dragAxis', " + num(kDragAxes.at(a.lit)) + ");");
      else if (name == "grab" && lit && (a.lit == "keep" || a.lit == "keep-x" || a.lit == "auto")) push("_num(" + v + ", 'grab', " + num(a.lit == "keep" ? 1 : a.lit == "keep-x" ? 2 : 0) + ");");
      else if (name == "keyContext") push("_ctx(" + v + ", " + (lit ? quote(a.lit) : expr) + ");");
      else if (name == "onInput" || name == "onChange") push("_onText(" + v + ", " + (name == "onChange" && !react ? "true" : "false") + ", " + expr + ");");
      else if (name == "value" || name == "placeholder") {
        if (lit) push("_str(" + v + ", '" + name + "', " + quote(a.lit) + ");");
        else push(react ? "_str(" + v + ", '" + name + "', " + expr + ");" : "_dynStr(" + v + ", '" + name + "', () => (" + expr + "));");
      } else if (name == "highlight") push("_hl(" + v + ", " + expr + ");");
      else if (name == "type" && lit && a.lit == "password") push("_num(" + v + ", 'password', 1);");
      else if (name == "type" && lit && a.lit == "text") {}
      else if ((name == "resizeMode" || name == "objectFit") && lit && kStyleEnums.at(name).count(a.lit)) push("_num(" + v + ", 'objectFit', " + num(kStyleEnums.at(name).at(a.lit)) + ");");   // <Image resizeMode="cover"> (ZN-262)
      else if (name == "inputMode" && lit && kInputModes.count(a.lit)) push("_num(" + v + ", 'inputMode', " + num(kInputModes.at(a.lit)) + ");");
      else if (kFlagAttrs.count(name)) {
        if (lit || a.kind == 0 || plainExpr == "true" || plainExpr == "false") push("_num(" + v + ", '" + name + "', " + (lit || plainExpr == "true" || a.kind == 0 ? "1" : "0") + ");");
        else push(react ? "_num(" + v + ", '" + name + "', (" + expr + ") ? 1 : 0);" : "_dynNum(" + v + ", '" + name + "', () => ((" + expr + ") ? 1 : 0));");
      } else if (kNumAttrs.count(name)) {
        bool plain = !plainExpr.empty() && plainExpr.find_first_not_of("-0123456789.") == std::string::npos;
        if (lit) push("_num(" + v + ", '" + name + "', " + a.lit + ");");
        else if (react || plain) push("_num(" + v + ", '" + name + "', " + expr + ");");
        else push("_dynNum(" + v + ", '" + name + "', () => (" + expr + "));");
      } else if (name == "key") {}
      else fail(a.tok, "unknown attribute '" + name + "' on <" + tag + ">");
    }
    bool hasKids = false;
    for (const Child& c : e.kids) if (!(c.kind == 0 && trim(c.text).empty())) hasKids = true;
    if (tagNo >= 7 && hasKids) fail(e.begin, "<" + tag + "> takes its text from value={...}, not from children");
    if (tagNo == 1) textContent(v, e.kids, out);
    else children(v, e.kids, out);
    return v;
  }

  void textContent(const std::string& v, const std::vector<Child>& kids, std::vector<std::string>& out) {
    std::string tpl;
    bool dynamic = false;
    for (const Child& c : kids) {
      if (c.kind == 0) {
        for (char ch : jsxText(c.text)) { if (ch == '`' || ch == '\\' || ch == '$') tpl += '\\'; tpl += ch; }
      } else if (c.kind == 1 && c.ee > c.eb) { tpl += "${" + rw(c.eb, c.ee) + "}"; dynamic = true; }
      else if (c.kind == 1) {}
      else if (c.el && !c.el->frag && c.el->tag == "Image" && jsxHostTag("Image", imported, c.el->begin)) {
        // an inline picture, as React Native's <Image> in a <Text>: the image node is a child of the text and an U+FFFC stands for it
        const std::string img = element(*c.el, out);
        out.push_back("_append(" + v + ", " + img + ");");
        tpl += "\xEF\xBF\xBC";
      }
      else fail(c.tok, "<Text> can only contain text, {expressions} and <Image>");
    }
    if (tpl.empty()) return;
    out.push_back(dynamic && !react ? "_dynTextOf(" + v + ", () => `" + tpl + "`);" : "_textOf(" + v + ", `" + tpl + "`);");
  }

  void children(const std::string& parent, const std::vector<Child>& kids, std::vector<std::string>& out) {
    for (const Child& c : kids) {
      if (c.kind == 0) {
        std::string tt = trim(jsxText(c.text));
        if (!tt.empty()) out.push_back("_text(" + parent + ", " + quote(tt) + ");");
      } else if (c.kind == 1) {
        if (c.ee <= c.eb) continue;
        std::size_t a = c.eb, b = c.ee;
        if (jsxStart(a) && parseElem(a)->end == b) { auto el = parseElem(a); std::string cv = element(*el, out); out.push_back("_append(" + parent + ", " + cv + ");"); continue; }
        std::size_t open = callParen(a, b);
        std::string callee = open ? calleeText(a, open) : "";
        // a call and nothing else: `{cond && props.children()}` ends with one too, and is a conditional (below)
        if (open && callee.find("&&") == std::string::npos && callee.find("||") == std::string::npos && callee.find('?') == std::string::npos && nodeCall(callee)) { out.push_back("_append(" + parent + ", " + rw(a, b) + ");"); continue; }
        if (b == a + 1 && t[a].kind == Tok::Ident && (jsxFunctions(), jsxVars.count(tx(a)))) { out.push_back("_append(" + parent + ", " + rw(a, b) + ");"); continue; }
        // `{props.children}` as React and Solid write it: the children a component is given are a function that makes them, called here
        if (b >= a + 3 && tx(b - 1) == "children" && isP(b - 2, ".") && dotted(a, b)) { out.push_back("_append(" + parent + ", " + rw(a, b) + "());"); continue; }
        std::size_t q = 0, colon = 0;
        const bool isTernary = ternary(a, b, q, colon);   // `c ? x : xs.map(...)` ends with a call too: not a list
        if (open && !isTernary && callee.size() > 4 && callee.compare(callee.size() - 4, 4, ".map") == 0 && returnsJsx(open + 1, b - 1)) {
          bool oneArg = true;
          scan(open + 1, b - 1, [&](std::size_t, const std::string& x) { if (x == ",") oneArg = false; });
          if (oneArg) {
            std::string list = rw(a, open - 2), fn = rw(open + 1, b - 1);
            if (react) out.push_back("for (const __c of " + rw(a, b) + ") _append(" + parent + ", __c);");
            else out.push_back("_for(" + parent + ", () => (" + list + "), " + fn + ");");
            continue;
          }
        }
        Cond cj;
        const bool isCond = conditional(a, b, cj);
        if (react && !isCond && isTernary) {
          // `{c ? <A/> : list.map(...)}`, a branch conditional() does not take (a list of rows, an expression): each branch is a child of
          // its own, lowered by these same rules
          auto branch = [&](std::size_t x0, std::size_t x1) {
            strip(x0, x1);
            if (isNull(x0, x1)) return;
            Child k; k.kind = 1; k.eb = x0; k.ee = x1;
            children(parent, {k}, out);
          };
          out.push_back("if (" + rw(a, q) + ") {");
          branch(q + 1, colon);
          out.push_back("} else {");
          branch(colon + 1, b);
          out.push_back("}");
        } else if (isCond) {
          std::string cond = rw(cj.cb, cj.ce);
          if (cj.negate) cond = "!(" + cond + ")";
          if (react) out.push_back("_append(" + parent + ", (" + cond + ") ? " + cj.yes + " : " + (cj.hasNo ? cj.no : "_el(6)") + ");");
          else out.push_back("_show(" + parent + ", " + showArgs(cond, cj) + ");");
        } else {
          std::string e = rw(a, b);
          out.push_back(react ? "_text(" + parent + ", `${" + e + "}`);" : "_dynText(" + parent + ", () => `${" + e + "}`);");
        }
      } else {
        std::string cv = element(*c.el, out);
        out.push_back("_append(" + parent + ", " + cv + ");");
      }
    }
  }

  std::string component(const Elem& e, std::vector<std::string>& out) {
    const std::string& tag = e.tag;
    std::string v = "__n" + std::to_string(counter++);
    std::vector<std::pair<std::string, const Attr*>> attrs;
    for (const Attr& a : e.attrs) { if (a.name == "...") fail(a.tok, "spread attributes work on host elements only ({...pan.panHandlers})"); attrs.push_back({a.name, &a}); }
    auto find = [&](const char* n) -> const Attr* { for (auto& p : attrs) if (p.first == n) return p.second; return nullptr; };
    std::vector<const Child*> kids;
    for (const Child& c : e.kids) if (!(c.kind == 0 && trim(c.text).empty())) kids.push_back(&c);
    auto childNode = [&](const Child* c) -> std::string {
      if (!c) return "_el(6)";
      if (c->kind == 1 && c->ee > c->eb) {
        if (jsxStart(c->eb) && parseElem(c->eb)->end == c->ee) return lower(*parseElem(c->eb));
        return rw(c->eb, c->ee);
      }
      return lower(*c->el);
    };
    if (tag == "VirtualList") {  // <VirtualList count={n} itemHeight={h} className="...">{(i) => <Row/>}</VirtualList>
      const Attr* count = find("count");
      const Attr* ih = find("itemHeight");
      const Attr* est = find("estimatedItemHeight");   // rows of different heights: the estimate (a negative itemHeight for zinc:ui virtualize)
      const Child* c = kids.size() == 1 ? kids[0] : nullptr;
      if (!count || (!ih && !est) || !c || c->kind != 1 || c->ee <= c->eb) fail(e.begin, "<VirtualList> needs count, itemHeight and a function child: {(i) => <...>}");
      out.push_back("const " + v + ": i32 = _el(4);");
      const Attr* cls = find("className");
      if (cls && cls->kind == 1) out.push_back("_class(" + v + ", " + quote(cls->lit) + ");");
      else if (cls) out.push_back(react ? "_class(" + v + ", " + valueOf(*cls) + ");" : "_dynClass(" + v + ", () => (" + valueOf(*cls) + "));");
      if (const Attr* rf = find("ref")) out.push_back("_ref(" + v + ", " + valueOf(*rf) + ");");
      const Attr* sk = find("scrollKey");   // before the rows: the kept offset is taken at the first layout, so only the rows there are built
      if (sk && sk->kind == 1) out.push_back("_str(" + v + ", 'scrollKey', " + quote(sk->lit) + ");");
      else if (sk) out.push_back(react ? "_str(" + v + ", 'scrollKey', " + valueOf(*sk) + ");" : "_dynStr(" + v + ", 'scrollKey', () => (" + valueOf(*sk) + "));");
      for (const Attr& a : e.attrs) {   // the scroll flags of a ScrollView (stickToBottom: a chat's history); anything else is refused, not dropped
        if (a.name == "count" || a.name == "itemHeight" || a.name == "estimatedItemHeight" || a.name == "className" || a.name == "ref" || a.name == "scrollKey" || a.name == "key") continue;
        if (!kFlagAttrs.count(a.name)) fail(a.tok, "unknown attribute '" + a.name + "' on <VirtualList>");
        const std::string x = a.kind == 2 ? valueOf(a) : "";
        if (a.kind != 2 || x == "true" || x == "false") out.push_back("_num(" + v + ", '" + a.name + "', " + (x == "false" ? "0" : "1") + ");");
        else out.push_back(react ? "_num(" + v + ", '" + a.name + "', (" + x + ") ? 1 : 0);" : "_dynNum(" + v + ", '" + a.name + "', () => ((" + x + ") ? 1 : 0));");
      }
      const std::string height = ih ? valueOf(*ih) : "-(" + valueOf(*est) + ")";
      out.push_back(react ? "_virtual(" + v + ", " + valueOf(*count) + ", " + height + ", " + rw(c->eb, c->ee) + ");"
                          : "_virtual(" + v + ", () => (" + valueOf(*count) + "), " + height + ", " + rw(c->eb, c->ee) + ");");
      return v;
    }
    out.push_back("const " + v + ": i32 = _el(6);");
    if (tag == "Show" && !react) {
      const Attr* when = find("when");
      if (!when) fail(e.begin, "<Show> needs when");
      const Attr* fb = find("fallback");
      out.push_back("_show(" + v + ", () => (" + valueOf(*when) + "), () => " + childNode(kids.empty() ? nullptr : kids[0]) + ", " + (fb ? "() => " + valueOf(*fb) : "null") + ");");
    } else if (tag == "For" && !react) {
      const Child* c = kids.empty() ? nullptr : kids[0];
      const Attr* each = find("each");
      if (!c || c->kind != 1 || c->ee <= c->eb || !each) fail(e.begin, "<For> expects each and a function child: {(item, i) => <...>}");
      out.push_back("_for(" + v + ", () => (" + valueOf(*each) + "), " + rw(c->eb, c->ee) + ");");
    } else {
      std::vector<std::string> props;
      const Attr* key = find("key");
      auto imp = imported.find(tag);
      const bool rn = imp != imported.end() && imp->second == "zinc:react-native";   // its style props are one flattened Style, as React Native composes them
      auto styleProp = [](const std::string& n) { return n == "style" || (n != "barStyle" && n.size() > 5 && n.compare(n.size() - 5, 5, "Style") == 0); };   // StatusBar's barStyle is a string
      // Solid: props that read signals (`title={page()}`) are evaluated in an effect that mounts the component again when they change
      // (Solid passes them as getters; Zinc's props are typed values). They come first; `_u()` then stops the tracking, so the body
      // runs untracked as Solid runs components: on the first static prop, or, when every prop reads, after a second read of the last.
      std::vector<std::string> dyn;
      const Attr* lastDyn = nullptr;
      for (auto& p : attrs) {
        if (p.first == "key") continue;
        if (rn && p.first == "style" && p.second->kind == 2 && arrowAt(p.second->eb, p.second->ee)) {   // Pressable's style={({ pressed }) => [...]}
          std::size_t a = p.second->eb, b = p.second->ee;
          strip(a, b);
          std::size_t q = arrowAt(a, b);
          props.push_back("styleFn: " + (isP(q + 1, "{") ? rw(a, b) : rw(a, q + 1) + " _flat(" + styleLayers(q + 1, b) + ")"));   // a block body returns a Style itself
          continue;
        }
        std::string val = rn && p.second->kind == 2 && styleProp(p.first) ? "_flat(" + styleLayers(p.second->eb, p.second->ee) + ")" : valueOf(*p.second);
        if (!react && p.second->kind == 2 && readsAtEval(p.second->eb, p.second->ee)) { dyn.push_back(p.first + ": " + val); lastDyn = p.second; }
        else props.push_back(p.first + ": " + val);
      }
      auto nodeValued = [&](const Child* k) {
        if (k->kind != 1 || k->ee <= k->eb) return true;
        if (jsxStart(k->eb) && parseElem(k->eb)->end == k->ee) return true;
        std::size_t open = callParen(k->eb, k->ee);
        return open && nodeCall(calleeText(k->eb, open));
      };
      if (rn && kids.size() == 1 && kids[0]->kind == 1 && arrowAt(kids[0]->eb, kids[0]->ee)) props.push_back("childrenFn: " + rw(kids[0]->eb, kids[0]->ee));   // Pressable's {({ pressed }) => <...>}
      else if (kids.size() > 1 || (kids.size() == 1 && (kids[0]->kind == 0 || !nodeValued(kids[0])))) {
        std::vector<std::string> lines;
        std::string f = "__n" + std::to_string(counter++);
        lines.push_back("const " + f + ": i32 = _el(6);");
        std::vector<Child> copy;
        for (const Child* k : kids) copy.push_back(*k);
        children(f, copy, lines);
        std::string body;
        for (auto& l : lines) body += l + " ";
        props.push_back("children: () => ((): i32 => { " + body + "return " + f + "; })()");
      } else if (kids.size() == 1) props.push_back("children: () => " + childNode(kids[0]));
      const bool tracked = !dyn.empty();
      if (tracked) {
        auto untrackAt = [](std::string& prop, const std::string& before) { std::size_t c = prop.find(": ") + 2; prop = prop.substr(0, c) + "(" + before + "_u(), " + prop.substr(c) + ")"; };
        if (!props.empty()) untrackAt(props[0], "");
        else if (!hasJsx(lastDyn->eb, lastDyn->ee)) untrackAt(dyn.back(), dyn.back().substr(dyn.back().find(": ") + 2) + ", ");   // the read that tracks, then the value
        // ponytail: every prop reads and the last holds JSX: the body is tracked too (a read at its top level mounts it again)
        props.insert(props.begin(), dyn.begin(), dyn.end());
      }
      std::string args;
      for (std::size_t k = 0; k < props.size(); ++k) args += (k ? ", " : "") + props[k];
      std::string call = tag + "(" + (props.empty() ? "" : "{ " + args + " }") + ")";
      if (react && !props.empty() && !classTags.count(tag)) {   // React: the props are evaluated once, here, where what they read is narrowed
        const std::string pv = "__p" + std::to_string(counter++);
        out.push_back("const " + pv + " = _props(" + tag + ", { " + args + " });");
        call = tag + "(" + pv + ")";
      }
      if (hot && !react && lib == "zinc:ui/solid" && tag.find('.') == std::string::npos) {   // a component of the project: its Fast Refresh proxy
        auto im = imported.find(tag);
        if (im == imported.end() || im->second.empty() || im->second.rfind("./", 0) == 0 || im->second.rfind("../", 0) == 0) call = "_hotC('@hot:" + tag + "', () => " + call + ")";
      }
      std::string keyArg = key ? "'' + (" + valueOf(*key) + ")" : "''";
      if (react && classTags.count(tag)) out.push_back("_cc(" + v + ", () => new " + tag + "(" + (props.empty() ? "{}" : "{ " + args + " }") + "), " + quote(tag) + ", " + keyArg + ");");   // a class component (Inferno, React classes): an instance per mount
      else out.push_back(react ? "_rc(" + v + ", () => " + call + ", " + quote(tag) + ", " + keyArg + ");" : tracked ? "_comp(" + v + ", () => " + call + ");" : "_append(" + v + ", " + call + ");");
      if (!devFile.empty() && (lib == "zinc:ui/solid" || lib == "zinc:ui/react")) {   // the inspector's component tree: its name, where it is called, its props as written
        const std::size_t at = t[e.begin].start;
        const auto line = 1 + std::count(s.begin(), s.begin() + static_cast<std::ptrdiff_t>(at), '\n');
        std::string written;
        for (const Attr& a : e.attrs) {
          written += (written.empty() ? "" : " ") + a.name;
          if (a.kind == 1) written += "=\"" + a.lit + "\"";
          else if (a.kind == 2 && a.ee > a.eb) {
            std::string x(s.substr(t[a.eb].start, t[a.ee - 1].end - t[a.eb].start));
            if (x.size() > 80) x = x.substr(0, 77) + "...";
            written += "={" + x + "}";
          }
        }
        out.push_back("_cn(" + v + ", " + quote(tag) + ", " + quote(devFile + ":" + std::to_string(line)) + ", " + quote(written) + ");");
      }
    }
    return v;
  }
};

}  // namespace

// A lowercase tag is refused (Z0007, owner 2026-10-16): the component to write instead, for the old host tags and the HTML ones people reach for.
// zinc migrate jsx-capitalised-tags rewrites exactly these (src/lint).
std::map<std::string, std::string> jsxImports(std::string_view s, const std::vector<Token>& t, bool* react) {
  std::map<std::string, std::string> imported;
  auto tx = [&](std::size_t i) { return std::string(s.substr(t[i].start, t[i].end - t[i].start)); };
  auto isK = [&](std::size_t i, const char* w) { return i < t.size() && t[i].kind == Tok::Keyword && tx(i) == w; };
  auto isId = [&](std::size_t i, const char* w) { return i < t.size() && t[i].kind == Tok::Ident && tx(i) == w; };
  for (std::size_t i = 0; i < t.size(); ++i) {
    if (!isK(i, "import")) continue;
    std::size_t k = i + 1;
    std::vector<std::string> names;
    while (k < t.size() && !isK(k, "from") && !isId(k, "from") && t[k].kind != Tok::String) {
      if (t[k].kind == Tok::Ident) { names.push_back(tx(k)); if (isK(k + 1, "as") || isId(k + 1, "as")) { names.pop_back(); k += 2; if (k < t.size() && t[k].kind == Tok::Ident) names.push_back(tx(k)); } }
      ++k;
    }
    if (k < t.size() && t[k].kind != Tok::String) ++k;
    if (k < t.size() && t[k].kind == Tok::String) {
      std::string spec = tx(k);
      spec = spec.substr(1, spec.size() - 2);
      for (auto& n : names) imported[n] = spec;
      if (react && (spec == "zinc:ui/react" || spec == "react" || spec == "inferno")) *react = true;
    }
  }
  // a component the file declares at its top level with a host tag's name (function Button, class Input, const Input = (...) => ...) is that
  // component, as in React: it shadows the host tag; recorded with an empty module. Inside its own declaration the tag stays the host's (a
  // wrapper such as zinc:ui/nuxt's Input draws the host Input: a call to itself would never end); the declaration's tokens are kept under
  // "\x01<name>" as "first last". A constant that is not a function (react-native's `const View: i32 = ui.VIEW`) names the host tag.
  int depth = 0;
  auto depthAt = [&](std::size_t i, int d) {
    const Tok k = t[i].kind;
    if (k == Tok::Punct) { const std::string p = tx(i); if (p == "{") ++d; else if (p == "}") --d; }
    else if (k == Tok::TemplateHead) ++d;
    else if (k == Tok::TemplateTail) --d;
    return d;
  };
  for (std::size_t i = 0; i + 1 < t.size(); ++i) {
    const Tok k = t[i].kind;
    const int before = depth;
    depth = depthAt(i, depth);
    if (before != 0 || (k != Tok::Keyword && k != Tok::Ident)) continue;
    const std::string w = tx(i);
    if (w != "function" && w != "class" && w != "const" && w != "let" && w != "var") continue;
    const std::size_t n = i + 1;
    if (t[n].kind != Tok::Ident || !kTags.count(tx(n)) || imported.count(tx(n))) continue;
    if ((w == "const" || w == "let" || w == "var") &&
        !(n + 2 < t.size() && tx(n + 1) == "=" && (tx(n + 2) == "(" || tx(n + 2) == "function" || tx(n + 2) == "async" || (n + 3 < t.size() && t[n + 2].kind == Tok::Ident && tx(n + 3) == "=>")))) continue;
    // the end of the declaration: a function's or a class's body closed outside the parameters (a parameter's type has braces too), else
    // the statement's `;`, else the next declaration
    std::size_t e = n + 1;
    const bool body = w == "function" || w == "class";
    for (int d = 0, parens = 0; e < t.size(); ++e) {
      const int was = d;
      d = depthAt(e, d);
      if (t[e].kind == Tok::Punct) { const std::string p = tx(e); if (p == "(" || p == "[") ++parens; else if (p == ")" || p == "]") --parens; }
      if (parens != 0) continue;
      if ((body && was > 0 && d == 0) || (d == 0 && tx(e) == ";")) break;
      if (was != 0 || (t[e].kind != Tok::Keyword && t[e].kind != Tok::Ident)) continue;
      const std::string x = tx(e);
      if (x == "function" || x == "class" || x == "const" || x == "let" || x == "var" || x == "export" || x == "import") break;
    }
    imported[tx(n)] = "";
    imported["\x01" + tx(n)] = std::to_string(i) + " " + std::to_string(e);
  }
  return imported;
}

bool jsxHostTag(const std::string& tag, const std::map<std::string, std::string>& imported, std::size_t at) {
  if (!kTags.count(tag)) return false;
  auto it = imported.find(tag);
  if (it != imported.end() && it->second.empty() && at != std::string::npos)   // inside the file's own component of that name: the host tag
    if (auto r = imported.find("\x01" + tag); r != imported.end()) {
      const std::size_t sp = r->second.find(' ');
      if (at >= std::stoul(r->second.substr(0, sp)) && at <= std::stoul(r->second.substr(sp + 1))) return true;
    }
  // only zinc:ui's own names are the host tags: the kits' Button, Input... and an app's (components/Button.tsx, or declared in the file) are components
  return it == imported.end() || (it->second.rfind("zinc:ui", 0) == 0 && it->second.rfind("zinc:ui/kit", 0) != 0 && it->second.rfind("zinc:ui/nuxt", 0) != 0) ||
         ((it->second == "zinc:react-native" || it->second == "@pocketjs/framework/solid/components") &&   // the host elements of zinc:react-native (ZN-367) and PocketJS
          (tag == "View" || tag == "Text" || tag == "Image" || tag == "ScrollView"));                          // its Button is a component
}

const std::map<std::string, std::string>& jsxLowercaseTags() {
  static const std::map<std::string, std::string> tags = {{"view", "View"}, {"text", "Text"}, {"button", "Button"}, {"image", "Image"}, {"scroll", "ScrollView"},
                                                          {"canvas", "Canvas"}, {"input", "Input"}, {"textarea", "TextArea"}, {"div", "View"}, {"span", "Text"},
                                                          {"p", "Text"}, {"img", "Image"}, {"scrollview", "ScrollView"}};
  return tags;
}


// React Native's imports under the react-native preset (ZN-367.05): 'react' is zinc:ui/react (a default `React` becomes a namespace import of it), and of
// 'react-native' the names live in zinc:react-native except Animated and Easing (zinc:ui/animated) and Linking (zinc:react-native/linking, it needs the
// opener permission). `import type` from either is dropped. Lines are kept, so diagnostics still point at the right place.
std::string rewriteReactNativeImports(std::string_view src, bool tsx) {
  if (src.find("'react") == std::string_view::npos && src.find("\"react") == std::string_view::npos) return std::string(src);
  Lowering L;
  L.s = src;
  L.t = lex(src, tsx);
  std::string out;
  std::size_t pos = 0;
  for (std::size_t i = 0; i < L.t.size(); ++i) {
    if (!L.isK(i, "import")) continue;
    std::size_t k = i + 1;
    while (k < L.t.size() && L.t[k].kind != Tok::String && !L.isP(k, ";") && !L.isP(k, "(")) ++k;
    if (k >= L.t.size() || L.t[k].kind != Tok::String) continue;
    const std::string spec = L.tx(k).substr(1, L.tx(k).size() - 2);
    if (spec != "react" && spec != "react-native") continue;
    std::string def, ns;
    std::vector<std::pair<std::string, std::string>> named;   // imported name, local name
    bool typeOnly = i + 1 < k && L.t[i + 1].kind == Tok::Ident && L.tx(i + 1) == "type";
    for (std::size_t j = i + 1; j < k; ++j) {
      if (L.isP(j, "*") && j + 2 < k) { ns = L.tx(j + 2); j += 2; continue; }
      if (L.isP(j, "{")) {
        std::size_t e = L.match(j);
        for (std::size_t q = j + 1; q < e; ++q) {
          if (L.t[q].kind != Tok::Ident) continue;
          if (L.tx(q) == "type" && q + 1 < e && L.t[q + 1].kind == Tok::Ident) { ++q; while (q + 1 < e && !L.isP(q + 1, ",")) ++q; continue; }   // `type T` inside braces: a type, dropped
          std::string name = L.tx(q), local = name;
          if (q + 2 < e && L.t[q + 1].kind == Tok::Ident && L.tx(q + 1) == "as") { local = L.tx(q + 2); q += 2; }
          named.push_back({name, local});
        }
        j = e;
        continue;
      }
      if (L.t[j].kind == Tok::Ident && L.tx(j) != "type" && L.tx(j) != "from" && def.empty() && ns.empty()) def = L.tx(j);
    }
    std::string rep;
    if (!typeOnly) {
      if (spec == "react") {
        if (!def.empty()) rep += "import * as " + def + " from 'zinc:ui/react'; ";
        if (!ns.empty()) rep += "import * as " + ns + " from 'zinc:ui/react'; ";
        std::string list;
        for (auto& [n, l] : named) list += (list.empty() ? "" : ", ") + (n == l ? n : n + " as " + l);
        if (!list.empty()) rep += "import { " + list + " } from 'zinc:ui/react'; ";
      } else {
        std::string list, linking, easing;
        for (auto& [n, l] : named) {
          if (n == "Animated") rep += "import * as " + l + " from 'zinc:ui/animated'; ";
          else if (n == "Easing") easing += (easing.empty() ? "" : ", ") + (n == l ? n : n + " as " + l);
          else if (n == "Linking") linking += (linking.empty() ? "" : ", ") + (n == l ? n : n + " as " + l);
          else list += (list.empty() ? "" : ", ") + (n == l ? n : n + " as " + l);
        }
        if (!easing.empty()) rep += "import { " + easing + " } from 'zinc:ui/animated'; ";
        if (!linking.empty()) rep += "import { " + linking + " } from 'zinc:react-native/linking'; ";
        if (!list.empty()) rep += "import { " + list + " } from 'zinc:react-native'; ";
        if (!ns.empty()) rep += "import * as " + ns + " from 'zinc:react-native'; ";
      }
    }
    std::size_t end = k + 1 < L.t.size() && L.isP(k + 1, ";") ? k + 1 : k;
    std::size_t a = L.t[i].start, b = L.t[end].end;
    int lines = 0;
    for (std::size_t q = a; q < b; ++q) lines += src[q] == '\n';
    out += std::string(src.substr(pos, a - pos)) + rep + std::string(static_cast<std::size_t>(lines), '\n');
    pos = b;
    i = end;
  }
  out += std::string(src.substr(pos));
  return out;
}

// StyleSheet.create({ name: { ...css } }) becomes ({ name: new __ZStyle(...) }) in .ts and .tsx alike (compiler/src/styles.ts lowerStyleSheets).
std::string lowerStyleSheets(std::string_view src, std::vector<Diag>& diags, std::uint32_t file, bool tsx) {
  if (src.find("StyleSheet") == std::string_view::npos) return std::string(src);
  Lowering L;
  L.s = src;
  L.t = lex(src, tsx);
  try {
    std::set<std::string> names;  // the local names of StyleSheet imported from zinc:ui (`ui.StyleSheet` for a namespace import)
    for (std::size_t i = 0; i < L.t.size(); ++i) {
      if (!L.isK(i, "import")) continue;
      std::size_t k = i + 1;
      std::vector<std::string> found;
      bool ns = false;
      std::string nsName;
      while (k < L.t.size() && L.t[k].kind != Tok::String) {
        if (L.isP(k, "*") && L.t[k + 1].kind == Tok::Ident && L.tx(k + 1) == "as") { ns = true; nsName = L.tx(k + 2); }
        if (L.t[k].kind == Tok::Ident && L.tx(k) == "StyleSheet") found.push_back(L.t[k + 1].kind == Tok::Ident && L.tx(k + 1) == "as" ? L.tx(k + 2) : "StyleSheet");
        ++k;
      }
      if (k < L.t.size() && L.t[k].kind == Tok::String && (L.tx(k) == "'zinc:ui'" || L.tx(k) == "'zinc:react-native'")) {
        for (auto& f : found) names.insert(f);
        if (ns) names.insert(nsName + ".StyleSheet");
      } else if (k < L.t.size() && L.t[k].kind == Tok::String && (L.tx(k) == "\"zinc:ui\"" || L.tx(k) == "\"zinc:react-native\"")) {
        for (auto& f : found) names.insert(f);
        if (ns) names.insert(nsName + ".StyleSheet");
      }
    }
    if (names.empty()) return std::string(src);
    std::string out;
    std::size_t pos = 0;
    bool any = false;
    for (std::size_t i = 0; i + 3 < L.t.size(); ++i) {
      // <name>.create( { ... } )
      std::size_t k = i;
      std::string nm = L.tx(k);
      if (L.t[k].kind != Tok::Ident) continue;
      if (L.isP(k + 1, ".") && L.t[k + 2].kind == Tok::Ident && names.count(nm + "." + L.tx(k + 2)) && L.isP(k + 3, ".")) { nm += "." + L.tx(k + 2); k += 2; }
      if (!names.count(nm) || !L.isP(k + 1, ".") || L.tx(k + 2) != "create" || !L.isP(k + 3, "(")) continue;
      std::size_t open = k + 3, close = L.match(open);
      if (!L.isP(open + 1, "{") || L.match(open + 1) != close - 1) L.fail(open, "StyleSheet.create expects an object of named style objects");
      std::size_t ob = open + 1, oe = close - 1;
      std::vector<std::pair<std::size_t, std::size_t>> props;
      std::size_t from = ob + 1;
      L.scan(ob + 1, oe, [&](std::size_t j, const std::string& x) { if (x == ",") { props.push_back({from, j}); from = j + 1; } });
      if (from < oe) props.push_back({from, oe});
      std::string fields;
      for (auto [x, y] : props) {
        if (x >= y) continue;
        if (!(L.t[x].kind == Tok::Ident || L.t[x].kind == Tok::String) || !L.isP(x + 1, ":")) L.fail(x, "StyleSheet.create expects named styles");
        std::string name = L.tx(x);
        if (L.t[x].kind == Tok::String) name = name.substr(1, name.size() - 2);
        fields += (fields.empty() ? "" : ", ") + name + ": " + L.styleExpr(x + 2, y);
      }
      std::string code = "({ " + fields + " })";
      std::size_t startOff = L.t[i].start, endOff = L.t[close].end;
      int want = 0, have = 0;
      for (std::size_t q = startOff; q < endOff; ++q) want += src[q] == '\n';
      for (char c : code) have += c == '\n';
      out += std::string(src.substr(pos, startOff - pos)) + code + std::string(want > have ? want - have : 0, '\n');
      pos = endOff;
      i = close;
      any = true;
    }
    if (!any) return std::string(src);
    out += std::string(src.substr(pos));
    std::string hoisted;
    for (const std::string& st : L.staticStyles) hoisted += st + " ";
    const bool tokens = (hoisted + out).find("__ZStyleC([") != std::string::npos;
    return std::string(tokens ? "import { Style as __ZStyle, styleC as __ZStyleC } from 'zinc:ui'; " : "import { Style as __ZStyle } from 'zinc:ui'; ") + hoisted + out;
  } catch (const Failure& f) {
    diags.push_back({"Z0005", f.pos, "StyleSheet: " + f.msg, file});
    return std::string(src);
  }
}

// The markers out of lowered text: each copy and each element's code starts on the line of the source it comes from (line breaks are added
// where the text is behind: generated code has none of its own), and `map` gets the pieces.
static std::string unmark(const std::string& in, std::string_view src, std::vector<SrcPiece>* map) {
  std::vector<std::size_t> starts{0};
  for (std::size_t i = 0; i < src.size(); ++i) if (src[i] == '\n') starts.push_back(i + 1);
  std::string out;
  out.reserve(in.size() + 64);
  std::size_t line = 0;
  if (map) map->push_back({0, 0, false});   // the helpers' import at the top
  for (std::size_t i = 0; i < in.size(); ++i) {
    if (in[i] == '\x01' && i + 1 < in.size() && in[i + 1] == 'Z') {
      std::size_t j = i + 2, p = 0;
      while (j < in.size() && std::isdigit(static_cast<unsigned char>(in[j]))) p = p * 10 + static_cast<std::size_t>(in[j++] - '0');
      const std::size_t want = static_cast<std::size_t>(std::upper_bound(starts.begin(), starts.end(), p) - starts.begin()) - 1;
      for (; line < want; ++line) out += '\n';
      if (map) map->push_back({static_cast<std::uint32_t>(out.size()), static_cast<std::uint32_t>(p), j < in.size() && in[j] == 'C'});
      i = j;
      continue;
    }
    if (in[i] == '\n') ++line;
    out += in[i];
  }
  return out;
}

std::uint32_t sourceOffset(const std::vector<SrcPiece>& map, std::uint32_t out) {
  auto it = std::upper_bound(map.begin(), map.end(), out, [](std::uint32_t o, const SrcPiece& p) { return o < p.out; });
  if (it == map.begin()) return out;
  --it;
  return it->copy ? it->src + (out - it->out) : it->src;
}

std::uint32_t loweredOffset(const std::vector<SrcPiece>& map, std::uint32_t src) {
  std::uint32_t best = 0, bestGap = ~0u;
  for (std::size_t k = 0; k < map.size(); ++k) {
    if (!map[k].copy) continue;
    const std::uint32_t len = k + 1 < map.size() ? map[k + 1].out - map[k].out : ~0u - map[k].out;
    if (src >= map[k].src && src - map[k].src < len) return map[k].out + (src - map[k].src);
    const std::uint32_t gap = src < map[k].src ? map[k].src - src : src - map[k].src;
    if (gap < bestGap) { bestGap = gap; best = map[k].out; }
  }
  return best;
}

bool importsReact(std::string_view src) {
  bool react = false;
  jsxImports(src, lex(src, true), &react);
  return react;
}

std::string lowerJsx(std::string_view src, std::vector<Diag>& diags, std::uint32_t file, const std::set<std::string>* classTags, std::vector<SrcPiece>* map, bool hot, const std::string& devFile, bool projectReact) {
  std::size_t lt = src.find('<');
  bool maybe = false;
  for (; lt != std::string_view::npos && lt + 1 < src.size(); lt = src.find('<', lt + 1))
    if (std::isalpha(static_cast<unsigned char>(src[lt + 1])) || src[lt + 1] == '>') { maybe = true; break; }
  if (!maybe) return std::string(src);
  Lowering L;
  L.s = src;
  L.t = lex(src, true);
  L.marks = true;
  L.hot = hot;
  L.devFile = devFile;
  if (classTags) L.classTags = *classTags;
  try {
    // imports: names to modules (a kit component's explicit import wins over the host tag of the same name); the model
    L.imported = jsxImports(src, L.t, &L.react);
    if (!L.react && projectReact) {
      bool solid = false;
      for (const auto& kv : L.imported) if (kv.second == "zinc:ui/solid" || kv.second == "solid-js") solid = true;
      L.react = !solid;
    }
    std::size_t pr = src.find("@jsxHelpers");
    L.lib = L.react ? "zinc:ui/react" : "zinc:ui/solid";
    if (pr != std::string_view::npos) {
      std::size_t a = pr + 11;
      while (a < src.size() && std::isspace(static_cast<unsigned char>(src[a]))) ++a;
      std::size_t b = a;
      while (b < src.size() && !std::isspace(static_cast<unsigned char>(src[b]))) ++b;
      L.lib = std::string(src.substr(a, b - a));
    }
    // a style computed elsewhere in the file (`style={seg(on)}`): a first pass finds the names the style attributes read
    if (std::regex_search(src.begin(), src.end(), std::regex(R"(style=\{\s*[\[(]*\s*[A-Za-z_$])"))) {
      Lowering D;
      D.s = src; D.t = L.t; D.react = L.react; D.imported = L.imported; D.classTags = L.classTags; D.lib = L.lib;
      for (std::size_t i = 0; i < D.t.size(); ++i) if (D.jsxStart(i)) { auto e = D.parseElem(i); D.lower(*e); i = e->end - 1; }
      L.styleNames = D.styleNames;
      L.findStyleObjects();
    }
    // replace the top-level JSX elements, and the style objects found above
    std::string out;
    std::size_t pos = 0;
    for (std::size_t i = 0; i < L.t.size(); ++i) {
      if (L.styleObjs.count(i)) {
        out += L.mark(pos, 'C') + std::string(src.substr(pos, L.t[i].start - pos)) + L.styleObject(i + 1, L.match(i));
        pos = L.t[L.match(i)].end;
        i = L.match(i);
        continue;
      }
      if (!L.jsxStart(i)) continue;
      auto e = L.parseElem(i);
      out += L.mark(pos, 'C') + std::string(src.substr(pos, L.t[i].start - pos)) + L.lower(*e);
      pos = L.t[e->end - 1].end;
      i = e->end - 1;
    }
    out += L.mark(pos, 'C') + std::string(src.substr(pos));
    { std::string hoisted; for (const std::string& st : L.staticStyles) hoisted += unmark(st, std::string_view(), nullptr) + " "; out = hoisted + out; }   // constants on the first line: markers out, no line break
    const char* input = "_styles, _ptr, _key, _onText, _str, _hl, _ctx";
    std::string helpers = L.react ? std::string("_el, _text, _textOf, _append, _class, _on, _draw, _num, _img, _ref, _focusable, _rc, _cc, _virtual, ") + input
                                  : std::string("_dynStyles, _el, _text, _textOf, _dynTextOf, _append, _class, _on, _draw, _num, _dynText, _dynClass, _dynNum, _show, _for, _img, _dynImg, _ref, _focusable, _virtual, _dynStr, ") + input;
    if (out.find("_spread(") != std::string::npos) helpers += ", _spread";   // only when used: not every JSX library has them
    if (out.find("_scroll(") != std::string::npos) helpers += ", _scroll";
    if (out.find("_imgH(") != std::string::npos) helpers += ", _imgH";
    if (out.find("_dynImgH(") != std::string::npos) helpers += ", _dynImgH";
    if (out.find("_submit(") != std::string::npos) helpers += ", _submit";
    if (out.find("_flat(") != std::string::npos) helpers += ", _flat";
    if (out.find("_props(") != std::string::npos) helpers += ", _props";
    if (out.find("_comp(") != std::string::npos) helpers += ", _comp, _u";
    if (out.find("_hotC(") != std::string::npos) helpers += ", _hotC";
    if (out.find("_cn(") != std::string::npos) helpers += ", _cn";
    std::string styleImport = out.find("new __ZStyle(") != std::string::npos && out.find("Style as __ZStyle") == std::string::npos ? "import { Style as __ZStyle } from 'zinc:ui'; " : "";
    if (out.find("__ZStyleC([") != std::string::npos && out.find("styleC as __ZStyleC") == std::string::npos) styleImport += "import { styleC as __ZStyleC } from 'zinc:ui'; ";
    return unmark(styleImport + "import { " + helpers + " } from '" + L.lib + "'; " + out, src, map);
  } catch (const Failure& f) {
    diags.push_back({f.code, f.pos, f.key ? f.msg : "JSX: " + f.msg, file, f.key, f.args});
    return std::string(src);
  }
}

}  // namespace zn::frontend
