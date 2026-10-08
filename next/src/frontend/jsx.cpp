// JSX lowering (ZN-028), a port of compiler/src/jsx.ts: a .tsx source is rewritten to plain calls on the zinc:ui/solid (or
// zinc:ui/react) helpers before it is parsed. Solid mode: dynamic expressions become fine-grained effects; React mode: a
// component re-renders as a whole. The pass works on the token stream (the lexer tracks JSX nesting) and substitutes source
// text, keeping line breaks so diagnostics keep their line numbers.
// Not ported yet: class components in React mode (ZN-163), the hook-rule checks.
#include "frontend/jsx.h"
#include "frontend/project.h"

#include <cctype>
#include <charconv>
#include <cmath>
#include <stdexcept>
#include <map>
#include <memory>
#include <regex>
#include <set>

#include "frontend/lexer.h"

namespace zn::frontend {
namespace {

const std::map<std::string, int> kTags = {{"view", 0}, {"text", 1}, {"button", 2}, {"image", 3}, {"scroll", 4}, {"canvas", 5}, {"input", 7}, {"textarea", 8},
                                          {"View", 0}, {"Text", 1}, {"Button", 2}, {"Image", 3}, {"ScrollView", 4}, {"Canvas", 5}, {"Input", 7}, {"TextArea", 8}};
const std::set<std::string> kNumAttrs = {"width", "height", "grow", "gap", "bg", "color", "scale", "hidden", "x", "y", "opacity", "translateX", "translateY", "rows", "tabIndex", "dragThreshold"};
const std::map<std::string, int> kPointerAttrs = {{"onPointerDown", 0}, {"onPointerMove", 1}, {"onPointerUp", 2}, {"onDoubleClick", 3}, {"onContextMenu", 4}, {"onWheel", 5}, {"onPointerEnter", 6},
                                                  {"onPointerLeave", 7}, {"onTap", 8}, {"onLongPress", 9}, {"onDrag", 10}, {"onPinch", 11}, {"onPointerCancel", 12}};
const std::set<std::string> kFlagAttrs = {"password", "readOnly", "lineNumbers", "wrap", "keepFocus", "disabled"};
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

struct Failure { std::uint32_t pos; std::string msg; };

// UI-07: the grammar of applyToken in lib/std/ui.ts; a class that is not in it is an error (compiler/src/jsx.ts validClass).
bool validClass(const std::string& c) {
  static const std::set<std::string> fixed = {"flex", "flex-row", "flex-col", "flex-wrap", "flex-1", "grow", "grow-0", "hidden", "absolute", "relative", "static", "overflow-hidden", "overflow-auto",
      "overflow-scroll", "overflow-x-auto", "overflow-x-scroll", "overflow-y-auto", "overflow-y-scroll", "w-screen", "h-screen", "sticky", "sr-only", "border-solid", "border-dashed", "border-dotted", "snap-none", "snap-x", "snap-y", "snap-both", "snap-mandatory", "snap-proximity", "snap-start", "snap-center", "snap-end", "snap-align-none", "invisible", "visible", "pointer-events-none", "pointer-events-auto", "z-auto", "flex-none", "flex-auto", "flex-initial", "flex-row-reverse", "flex-col-reverse", "w-full", "h-full", "font-bold", "font-semibold", "font-medium", "font-normal", "font-thin", "font-extralight", "font-light", "font-extrabold", "font-black", "italic", "not-italic", "uppercase", "lowercase", "capitalize", "normal-case", "underline", "line-through", "overline", "no-underline", "align-baseline", "whitespace-normal", "whitespace-nowrap", "whitespace-pre", "whitespace-pre-wrap", "text-wrap", "text-nowrap", "break-normal", "break-words", "break-all", "truncate", "text-ellipsis", "text-clip", "text-balance", "text-justify", "@container", "group", "peer", "select-text", "select-all", "select-none", "select-auto", "text-shadow", "text-shadow-sm", "text-shadow-md", "text-shadow-lg", "text-shadow-none", "line-clamp-none", "align-super", "align-sub",
      "font-mono", "font-sans", "text-left", "text-center", "text-right", "rounded", "border", "shadow", "shadow-sm", "shadow-md", "shadow-lg", "shadow-xl", "shadow-none", "transition",
      "transition-colors", "transition-all", "ease-in", "ease-out", "ease-in-out", "tracking-tight", "tracking-wide", "tracking-wider", "tracking-widest"};
  static const std::string num = R"((\d+(\.\d+)?|\[\d+(\.\d+)?(px|rem|vh|vw|%)?\]|\[env\([a-z-]+\)\]|\d+/\d+|px))";
  static const std::string color = R"(([a-z]+-\d+|white|black|transparent|current|\[#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\]|\[(rgb|rgba|hsl|hsla)\([0-9., %]+\)\]|\[var\(--[a-z0-9-]+\)\])(/\d+)?)";
  static const std::vector<std::regex> rules = {
      std::regex(R"(^font-\[[A-Za-z0-9_.,-]+\]$)"),
      std::regex(R"(^cursor-(default|auto|text|pointer|move|ew-resize|col-resize|ns-resize|row-resize|crosshair|grab|grabbing|not-allowed)$)"),
      std::regex("^(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|w|h|top|left|right|bottom|leading|inset|inset-x|inset-y)-" + num + "$"),
      std::regex("^-(m|mx|my|mt|mr|mb|ml)-" + num + "$"),                       // negative margins
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
      std::regex(R"(^bg-gradient-to-(t|b|l|r)$)"), std::regex(R"(^border-(\d+|\[\d+(px)?\])$)"), std::regex(R"(^border-[trblxy](-(\d+|\[\d+(px)?\]))?$)"),
      std::regex(R"(^rounded-(t|r|b|l|tl|tr|br|bl)(-(none|sm|md|lg|xl|2xl|3xl|full|\[\d+(px)?\]))?$)"),
      std::regex(R"(^ring(-\d+)?$)"), std::regex(R"(^outline(-\d+)?$)"), std::regex(R"(^(ring|outline)-offset-\d+$)"), std::regex(R"(^outline-none$)"),
      std::regex("^-?translate-[xy]-" + num + "$"),
      std::regex(R"(^line-clamp-[1-9]\d*$)"),
      std::regex(R"(^-?word-(\d+|\[\d+(px)?\])$)"),
      std::regex(R"(^opacity-\d+$)"), std::regex(R"(^duration-\d+$)")};
  static const std::regex variant(R"(^(focus|focus-visible|selection|disabled|group-hover|group-focus|group-active|peer-hover|peer-focus|peer-active|aria-(?:checked|selected|expanded|pressed|disabled|busy|current|invalid|required|readonly)|data-\[[a-z][a-z0-9-]*=[A-Za-z0-9_-]+\]|dark|light|landscape|portrait|pointer-coarse|pointer-fine|hover-none|max-(?:sm|md|lg|xl|2xl)|(?:min|max)-\[\d+px\]|@(?:sm|md|lg|xl)|@\[\d+px\]|focus-within|active|hover|sm|md|lg|xl|2xl):(.*)$)");
  static const std::regex colored("^(bg|text|text-shadow|border|from|via|to|ring|outline)-" + color + "$");
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
const std::set<std::string> kStyleNumeric = {"width", "height", "gap", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "marginTop", "marginRight", "marginBottom", "marginLeft",
    "top", "right", "bottom", "left", "opacity", "translateX", "translateY", "scale", "backgroundColor", "color", "borderColor", "borderWidth", "borderRadius", "borderTopWidth",
    "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "fontSize", "lineHeight", "letterSpacing", "grow", "shrink", "basis", "hidden", "lazy", "minWidth", "maxWidth", "minHeight", "maxHeight", "aspectRatio", "widthPercent", "heightPercent", "shadowColor", "shadowOffsetX", "shadowOffsetY", "shadowOpacity", "shadowRadius", "elevation", "rotate", "skewX", "skewY", "scaleX", "scaleY"};
const std::map<std::string, std::map<std::string, int>> kStyleEnums = {
    {"flexDirection", {{"column", 0}, {"row", 1}}}, {"flexWrap", {{"nowrap", 0}, {"wrap", 1}}},
    {"justifyContent", {{"flex-start", 0}, {"start", 0}, {"center", 1}, {"flex-end", 2}, {"end", 2}, {"space-between", 3}, {"space-around", 4}, {"space-evenly", 5}}},
    {"alignItems", {{"flex-start", 0}, {"start", 0}, {"center", 1}, {"flex-end", 2}, {"end", 2}, {"stretch", 3}}},
    {"alignSelf", {{"auto", -1}, {"flex-start", 0}, {"start", 0}, {"center", 1}, {"flex-end", 2}, {"end", 2}, {"stretch", 3}}},
    {"alignContent", {{"flex-start", 0}, {"start", 0}, {"center", 1}, {"flex-end", 2}, {"end", 2}, {"stretch", 3}, {"space-between", 4}, {"space-around", 5}, {"space-evenly", 6}}},
    {"position", {{"relative", 0}, {"static", 0}, {"absolute", 1}}}, {"display", {{"flex", 0}, {"none", 1}}},
    {"overflow", {{"visible", 0}, {"hidden", 1}, {"auto", 2}, {"scroll", 2}}},
    {"fontWeight", {{"normal", 0}, {"400", 0}, {"500", 0}, {"bold", 1}, {"600", 1}, {"700", 1}, {"800", 1}, {"900", 1}}},
    {"textAlign", {{"left", 0}, {"start", 0}, {"center", 1}, {"right", 2}, {"end", 2}}}};

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
std::string lowerCase(std::string s) { for (char& c : s) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c))); return s; }
std::vector<StyleOp> styleEntry(std::string name, StyleVal value) {
  name = styleName(name);
  if (name == "border") {
    if (!value.isNum && value.str == "none") return {{"borderWidth", 0}};
    std::smatch m;
    static const std::regex solid(R"(^(\S+)\s+solid\s+(.+)$)");
    if (value.isNum || !std::regex_match(value.str, m, solid)) throw std::runtime_error("border expects <width> solid <color>");
    std::vector<StyleOp> a = styleEntry("borderWidth", StyleVal{false, 0, m[1].str()}), b = styleEntry("borderColor", StyleVal{false, 0, m[2].str()});
    a.insert(a.end(), b.begin(), b.end());
    return a;
  }
  if (name == "background") name = "backgroundColor";
  if (name == "flex" && value.isNum && uiLayout() == "rn") {   // React Native's shorthand in the rn layout mode (ZN-358): n > 0 grows n with shrink 1 and basis 0; 0 is rigid; -1 shrinks only
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
    return {{name == "display" ? "hidden" : name, static_cast<double>(ev->second)}};
  }
  if (name == "fontFamily") {
    static const std::regex ok(R"(^[A-Za-z0-9_.-]+$)");
    if (value.isNum || !std::regex_match(value.str, ok)) throw std::runtime_error("fontFamily needs a font asset name");
    static const std::regex sans(R"(^(sans-serif|system-ui|Inter)$)", std::regex::icase), mono(R"(^(monospace)$)", std::regex::icase);
    std::string family = std::regex_match(value.str, sans) ? "sans" : std::regex_match(value.str, mono) ? "mono" : value.str;
    return {{"@font-" + (family == "sans" || family == "mono" ? family : "[" + family + "]"), 0}};
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
    if (sv == "transparent") {
      if (keys[0] != "backgroundColor") throw std::runtime_error("transparent " + name + " is unsupported");
      return {{"backgroundColor", -1}, {"backgroundAlpha", 0}};
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
    if (hex.size() == 8 && keys[0] != "backgroundColor") throw std::runtime_error("alpha is only supported on backgroundColor");
    std::vector<StyleOp> ops{{keys[0], static_cast<double>(std::stol(hex.substr(0, 6), nullptr, 16))}};
    if (keys[0] == "backgroundColor") ops.push_back({"backgroundAlpha", hex.size() == 8 ? static_cast<double>(std::stol(hex.substr(6), nullptr, 16)) : 255.0});
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

struct Lowering {
  std::string_view s;
  std::vector<Token> t;
  bool react = false;
  std::set<std::string> classTags;   // names that are class components (ZN-163)
  int counter = 0;
  std::map<std::string, std::string> imported;
  std::string lib;

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
      e->tag = tx(i); ++i;
      for (;;) {
        if (isP(i, "/>")) { e->selfClosing = true; ++i; e->end = i; return e; }
        if (isP(i, ">")) { ++i; break; }
        if (isP(i, "{")) fail(i, "spread attributes are not supported");
        if (t[i].kind != Tok::Ident) fail(i, "unexpected token in a JSX tag");
        Attr a;
        a.name = tx(i); a.tok = i; ++i;
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
      if (i >= t.size()) fail(e->begin, "unclosed JSX element");
      if (t[i].kind == Tok::JsxText) { Child c; c.kind = 0; c.text = tx(i); c.tok = i; e->kids.push_back(std::move(c)); ++i; }
      else if (isP(i, "{")) { std::size_t m = match(i); Child c; c.kind = 1; c.eb = i + 1; c.ee = m; c.tok = i; e->kids.push_back(std::move(c)); i = m + 1; }
      else if (isP(i, "</")) {
        ++i;
        if (!e->frag) ++i;  // the closing tag's name
        if (!isP(i, ">")) fail(i, "malformed closing JSX tag");
        ++i;
        e->end = i;
        return e;
      } else if (isP(i, "<")) { Child c; c.kind = 2; c.tok = i; c.el = parseElem(i); i = c.el->end; e->kids.push_back(std::move(c)); }
      else fail(i, "unexpected token in JSX children");
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
        out += std::string(s.substr(pos, t[i].start - pos)) + lower(*e);
        pos = t[e->end - 1].end;
        i = e->end - 1;
      }
    }
    return out + std::string(s.substr(pos, t[b - 1].end - pos));
  }

  std::string lower(const Elem& e) {
    std::vector<std::string> lines;
    std::string v = element(e, lines);
    std::string body;
    for (auto& l : lines) body += l + " ";
    std::string code = "((): i32 => { " + body + "return " + v + "; })()";
    int want = 0, have = 0;
    for (std::size_t k = t[e.begin].start; k < t[e.end - 1].end; ++k) want += s[k] == '\n';
    for (char c : code) have += c == '\n';
    return code + std::string(want > have ? want - have : 0, '\n');
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
      auto branch = [&](std::size_t x0, std::size_t x1, std::string& dst) { if (!jsxOnly(x0, x1)) return false; std::size_t y0 = x0, y1 = x1; strip(y0, y1); dst = lower(*parseElem(y0)); return true; };
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
    return false;
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
  std::string calleeText(std::size_t a, std::size_t open) const { std::string r; for (std::size_t k = a; k < open; ++k) r += tx(k); return r; }
  static bool childrenCall(const std::string& callee) {
    std::size_t dot = callee.rfind('.');
    std::string last = dot == std::string::npos ? callee : callee.substr(dot + 1);
    if (last == "children") return true;
    return last.size() > 6 && last.compare(0, 6, "render") == 0 && std::isupper(static_cast<unsigned char>(last[6]));
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
        std::size_t r0 = k + 1;
        while (isP(r0, "(")) ++r0;
        if (jsxStart(r0)) return true;
      }
      return false;
    }
    return jsxOnly(x0, x1);
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
    auto r = std::to_chars(buf, buf + sizeof buf, v);
    return std::string(buf, r.ptr);
  }
  std::string styleObject(std::size_t a, std::size_t b) {
    std::vector<std::string> keys, values, resources;
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
      if (styleName(key) == "shadowOffset" && vb < ve && isP(vb, "{") && isP(ve - 1, "}")) {   // React Native's { width, height } (ZN-360)
        std::vector<std::pair<std::size_t, std::size_t>> parts;
        std::size_t from2 = vb + 1;
        scan(vb + 1, ve - 1, [&](std::size_t q, const std::string& tk) { if (tk == ",") { parts.push_back({from2, q}); from2 = q + 1; } });
        if (from2 < ve - 1) parts.push_back({from2, ve - 1});
        for (auto [p0, p1] : parts) {
          if (p1 < p0 + 3 || !isP(p0 + 1, ":")) fail(p0, "shadowOffset takes { width: number, height: number }");
          const std::string side = tx(p0);
          if (side != "width" && side != "height") fail(p0, "shadowOffset takes { width: number, height: number }");
          keys.push_back(quote(side == "width" ? "shadowOffsetX" : "shadowOffsetY"));
          values.push_back("(" + rw(p0 + 2, p1) + ")");
        }
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
      try {
        if (literal) {
          std::string sk = styleName(key);
          for (const StyleOp& op : styleEntry(key, lv)) {
            if (sk == "fontSize" && op.key == "fontSize") resources.push_back("font-size: " + std::to_string(static_cast<long>(std::lround(op.value))) + "px");
            bool color = op.key == "backgroundColor" || op.key == "color" || op.key == "borderColor" || op.key == "shadowColor";
            if (color) { char hx[24]; long long cv = static_cast<long long>(op.value); std::snprintf(hx, sizeof hx, "%llx", static_cast<unsigned long long>(cv < 0 ? -cv : cv)); keys.push_back(quote("@" + op.key + ":" + (cv < 0 ? "-" : "") + std::string(hx))); values.push_back("0"); }
            else { keys.push_back(quote(op.key)); values.push_back(jsNumber(op.value)); }
          }
        } else {
          std::string raw = rw(vb, ve);
          std::string dk = key;
          if ((styleName(key) == "width" || styleName(key) == "height") && ve > vb + 2 && t[vb].kind == Tok::Ident && tx(vb) == "pct" && isP(vb + 1, "(") && isP(ve - 1, ")")) {
            dk = styleName(key) + "Percent";   // width: pct(v()): a percent decided at run time (ZN-359)
            raw = "(" + rw(vb + 2, ve - 1) + ") / 100";
          }
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
    return "new __ZStyle([" + ks + "], [" + vs + "])" + (rs.empty() ? "" : " /* " + rs + " */");
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
    if (upper) {
      auto it = imported.find(tag);
      bool hostImport = it == imported.end() || ((it->second.find("components") != std::string::npos || it->second.find("zinc:ui") != std::string::npos) && it->second.rfind("zinc:ui/kit", 0) != 0);
      if (!(kTags.count(tag) && hostImport)) return component(e, out);
    }
    auto tagIt = kTags.find(tag);
    if (tagIt == kTags.end()) fail(e.begin + 1, "unknown host component <" + tag + "> (view, text, button, image, scroll, canvas, input, textarea)");
    int tagNo = tagIt->second;
    out.push_back("const " + v + ": i32 = _el(" + num(tagNo) + ");");
    for (const Attr& a : e.attrs) {
      std::string name = a.name == "className" ? "class" : a.name;
      std::string expr = a.kind == 2 ? valueOf(a) : "true";
      bool lit = a.kind == 1;
      auto push = [&](const std::string& l) { out.push_back(l); };
      if (name == "class") {
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
      else if (name == "style") {
        if (a.kind != 2) fail(a.tok, "style expects an object, a StyleSheet entry or an array of styles");
        std::string layers = styleLayers(a.eb, a.ee);
        if (constantStyle(a.eb, a.ee)) { std::string id = "__zsheet" + std::to_string(staticStyles.size()); staticStyles.push_back("const " + id + " = " + layers + ";"); layers = id; }
        push(react ? "_styles(" + v + ", " + layers + ");" : "_dynStyles(" + v + ", () => " + layers + ");");
      }
      else if (name == "src") push(lit ? "_img(" + v + ", " + quote(a.lit) + ");" : react ? "_img(" + v + ", " + expr + ");" : "_dynImg(" + v + ", () => (" + expr + "));");
      else if (name == "ref") push("_ref(" + v + ", " + expr + ");");
      else if (name == "focusable") push("_focusable(" + v + ");");
      else if (name == "debugName") {}
      else if (name == "role") push("_str(" + v + ", 'role', " + (lit ? quote(a.lit) : expr) + ");");
      else if (name == "aria-label") push(lit ? "_str(" + v + ", 'label', " + quote(a.lit) + ");" : react ? "_str(" + v + ", 'label', " + expr + ");" : "_dynStr(" + v + ", 'label', () => (" + expr + "));");
      else if (name == "aria-hidden") push("_num(" + v + ", 'ariaHidden', " + (lit || a.kind == 0 || expr == "true" ? "1" : "0") + ");");
      else if (name.rfind("aria-", 0) == 0 || name.rfind("data-", 0) == 0) {   // aria-checked={on}, data-state="open": read by the aria-*: and data-[k=v]: variants
        const std::string key = quote("attr:" + name);
        if (lit) push("_str(" + v + ", " + key + ", " + quote(a.lit) + ");");
        else push(react ? "_str(" + v + ", " + key + ", String(" + expr + "));" : "_dynStr(" + v + ", " + key + ", () => String(" + expr + "));");
      }
      else if (name == "onDraw") push("_draw(" + v + ", " + expr + ");");
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
      else if (name == "inputMode" && lit && kInputModes.count(a.lit)) push("_num(" + v + ", 'inputMode', " + num(kInputModes.at(a.lit)) + ");");
      else if (kFlagAttrs.count(name)) {
        if (lit || a.kind == 0 || expr == "true" || expr == "false") push("_num(" + v + ", '" + name + "', " + (lit || expr == "true" || a.kind == 0 ? "1" : "0") + ");");
        else push(react ? "_num(" + v + ", '" + name + "', (" + expr + ") ? 1 : 0);" : "_dynNum(" + v + ", '" + name + "', () => ((" + expr + ") ? 1 : 0));");
      } else if (kNumAttrs.count(name)) {
        bool plain = !expr.empty() && expr.find_first_not_of("-0123456789.") == std::string::npos;
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
      else fail(c.tok, "<text> can only contain text and {expressions}");
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
        if (open && childrenCall(callee)) { out.push_back("_append(" + parent + ", " + rw(a, b) + ");"); continue; }
        if (open && callee.size() > 4 && callee.compare(callee.size() - 4, 4, ".map") == 0 && returnsJsx(open + 1, b - 1)) {
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
        if (conditional(a, b, cj)) {
          std::string cond = rw(cj.cb, cj.ce);
          if (cj.negate) cond = "!(" + cond + ")";
          if (react) out.push_back("_append(" + parent + ", (" + cond + ") ? " + cj.yes + " : " + (cj.hasNo ? cj.no : "_el(6)") + ");");
          else out.push_back("_show(" + parent + ", () => (" + cond + "), () => " + cj.yes + ", " + (cj.hasNo ? "() => " + cj.no : "null") + ");");
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
    for (const Attr& a : e.attrs) attrs.push_back({a.name, &a});
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
    if (tag == "VirtualList") {  // <VirtualList count={n} itemHeight={h} class="...">{(i) => <row/>}</VirtualList>
      const Attr* count = find("count");
      const Attr* ih = find("itemHeight");
      const Attr* est = find("estimatedItemHeight");   // rows of different heights: the estimate (a negative itemHeight for zinc:ui virtualize)
      const Child* c = kids.size() == 1 ? kids[0] : nullptr;
      if (!count || (!ih && !est) || !c || c->kind != 1 || c->ee <= c->eb) fail(e.begin, "<VirtualList> needs count, itemHeight and a function child: {(i) => <...>}");
      out.push_back("const " + v + ": i32 = _el(4);");
      const Attr* cls = find("class");
      if (!cls) cls = find("className");
      if (cls && cls->kind == 1) out.push_back("_class(" + v + ", " + quote(cls->lit) + ");");
      else if (cls) out.push_back(react ? "_class(" + v + ", " + valueOf(*cls) + ");" : "_dynClass(" + v + ", () => (" + valueOf(*cls) + "));");
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
      for (auto& p : attrs) if (p.first != "key") props.push_back(p.first + ": " + valueOf(*p.second));
      auto nodeValued = [&](const Child* k) {
        if (k->kind != 1 || k->ee <= k->eb) return true;
        if (jsxStart(k->eb) && parseElem(k->eb)->end == k->ee) return true;
        std::size_t open = callParen(k->eb, k->ee);
        return open && childrenCall(calleeText(k->eb, open));
      };
      if (kids.size() > 1 || (kids.size() == 1 && (kids[0]->kind == 0 || !nodeValued(kids[0])))) {
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
      std::string args;
      for (std::size_t k = 0; k < props.size(); ++k) args += (k ? ", " : "") + props[k];
      std::string call = tag + "(" + (props.empty() ? "" : "{ " + args + " }") + ")";
      std::string keyArg = key ? "'' + (" + valueOf(*key) + ")" : "''";
      if (react && classTags.count(tag)) out.push_back("_cc(" + v + ", () => new " + tag + "(" + (props.empty() ? "{}" : "{ " + args + " }") + "), " + quote(tag) + ", " + keyArg + ");");   // a class component (Inferno, React classes): an instance per mount
      else out.push_back(react ? "_rc(" + v + ", () => " + call + ", " + quote(tag) + ", " + keyArg + ");" : "_append(" + v + ", " + call + ");");
    }
    return v;
  }
};

}  // namespace

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
      if (k < L.t.size() && L.t[k].kind == Tok::String && L.tx(k) == "'zinc:ui'") {
        for (auto& f : found) names.insert(f);
        if (ns) names.insert(nsName + ".StyleSheet");
      } else if (k < L.t.size() && L.t[k].kind == Tok::String && L.tx(k) == "\"zinc:ui\"") {
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
    return "import { Style as __ZStyle } from 'zinc:ui'; " + hoisted + out;
  } catch (const Failure& f) {
    diags.push_back({"Z0005", f.pos, "StyleSheet: " + f.msg, file});
    return std::string(src);
  }
}

std::string lowerJsx(std::string_view src, std::vector<Diag>& diags, std::uint32_t file, const std::set<std::string>* classTags) {
  std::size_t lt = src.find('<');
  bool maybe = false;
  for (; lt != std::string_view::npos && lt + 1 < src.size(); lt = src.find('<', lt + 1))
    if (std::isalpha(static_cast<unsigned char>(src[lt + 1])) || src[lt + 1] == '>') { maybe = true; break; }
  if (!maybe) return std::string(src);
  Lowering L;
  L.s = src;
  L.t = lex(src, true);
  if (classTags) L.classTags = *classTags;
  try {
    // imports: names to modules (a kit component's explicit import wins over the host tag of the same name); the model
    for (std::size_t i = 0; i < L.t.size(); ++i) {
      if (!L.isK(i, "import")) continue;
      std::size_t k = i + 1;
      std::vector<std::string> names;
      while (k < L.t.size() && !L.isK(k, "from") && !(L.t[k].kind == Tok::Ident && L.tx(k) == "from") && L.t[k].kind != Tok::String) {
        if (L.t[k].kind == Tok::Ident) { names.push_back(L.tx(k)); if (L.isK(k + 1, "as") || (L.t[k + 1].kind == Tok::Ident && L.tx(k + 1) == "as")) { names.pop_back(); k += 2; if (L.t[k].kind == Tok::Ident) names.push_back(L.tx(k)); } }
        ++k;
      }
      if (k < L.t.size() && L.t[k].kind != Tok::String) ++k;
      if (k < L.t.size() && L.t[k].kind == Tok::String) {
        std::string spec = L.tx(k);
        spec = spec.substr(1, spec.size() - 2);
        for (auto& n : names) L.imported[n] = spec;
        if (spec == "zinc:ui/react" || spec == "react" || spec == "inferno") L.react = true;
      }
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
    // replace the top-level JSX elements
    std::string out;
    std::size_t pos = 0;
    for (std::size_t i = 0; i < L.t.size(); ++i) {
      if (!L.jsxStart(i)) continue;
      auto e = L.parseElem(i);
      out += std::string(src.substr(pos, L.t[i].start - pos)) + L.lower(*e);
      pos = L.t[e->end - 1].end;
      i = e->end - 1;
    }
    out += std::string(src.substr(pos));
    { std::string hoisted; for (const std::string& st : L.staticStyles) hoisted += st + " "; out = hoisted + out; }
    const char* input = "_styles, _ptr, _key, _onText, _str, _hl, _ctx";
    std::string helpers = L.react ? std::string("_el, _text, _textOf, _append, _class, _on, _draw, _num, _img, _ref, _focusable, _rc, _cc, _virtual, ") + input
                                  : std::string("_dynStyles, _el, _text, _textOf, _dynTextOf, _append, _class, _on, _draw, _num, _dynText, _dynClass, _dynNum, _show, _for, _img, _dynImg, _ref, _focusable, _virtual, _dynStr, ") + input;
    std::string styleImport = out.find("new __ZStyle(") != std::string::npos && out.find("Style as __ZStyle") == std::string::npos ? "import { Style as __ZStyle } from 'zinc:ui'; " : "";
    return styleImport + "import { " + helpers + " } from '" + L.lib + "'; " + out;
  } catch (const Failure& f) {
    diags.push_back({"Z0005", f.pos, "JSX: " + f.msg, file});
    return std::string(src);
  }
}

}  // namespace zn::frontend
