#pragma once
// zinc doc (ZN-856): what the files of src/doc share. Private to the module; doc.h is its one public header.
#include <functional>
#include <map>
#include <string>
#include <string_view>
#include <vector>

namespace zn::doc {

// ---- api.cpp: the API of a source file, read with the frontend's lexer (no checker: a file that does not type still documents) ----
struct Member { std::string kind, name, sig, doc; };                // kind: method, property, getter, setter, constructor
struct Item { std::string kind, name, sig, doc; std::vector<Member> members; };   // kind: function, class, interface, type, const, enum, namespace
struct Module {
  std::string name;       // zinc:sqlite, or the file's path in a project (src/game/world)
  std::string file;       // the source, relative to the root it was read from (shown under the title)
  std::string overview;   // the file's leading comment, as Markdown
  std::vector<Item> items;
  std::vector<std::string> reexports;   // `export * from './x'`: relative specifiers the caller reads into the same module
};
// The modules of one file: `name` for its top level, one more per `declare module 'x' { ... }` (lib/*.d.ts). In a .d.ts file the top-level
// declarations count as exported (they are the globals). The doc comments are /** */ blocks or the // lines right above a declaration, as godoc.
std::vector<Module> extractApi(std::string_view src, const std::string& name, const std::string& file, bool jsx, bool ambient);
// A doc comment's text (JSDoc tags @param, @returns, @throws, @example, @deprecated, @see) as Markdown.
std::string docMarkdown(std::string_view raw);

// ---- highlight.cpp: code to HTML spans at build time. TypeScript, TSX and JavaScript go through the frontend's lexer (what the engine
// itself reads); shell, JSON and C-like code through small tables. `typeLink` turns a type name into a link (the API pages), or "". ----
std::string highlight(std::string_view code, std::string_view lang, const std::function<std::string(std::string_view)>& typeLink = {});
std::string escapeHtml(std::string_view s);

// ---- md.cpp: Markdown (md4c, CommonMark + GitHub) and MDX's component set to HTML ----
struct Heading { int level; std::string id, text; };
struct PageCtx {
  // a link or image of the page as written: the URL to write ("" when it leads nowhere: the text stays, the link goes); w and h get an image's size
  std::function<std::string(const std::string& url, bool image, int& w, int& h)> link;
  std::function<std::string(const std::string& name)> apiRef;   // <ApiRef name="X" />: the URL of a symbol, "" when unknown
  std::vector<std::string> warnings;
};
struct Rendered {
  std::string html, title, text;   // title: the page's first H1 (taken out of html); text: plain text for the search index
  std::map<std::string, std::string> front;   // the front matter (--- key: value ---)
  std::vector<Heading> toc;        // H2 and H3
};
// `rawHtml`: HTML in the text passes through (pages); off for doc comments, whose JSX examples are text.
Rendered renderMarkdown(std::string_view src, bool mdx, PageCtx& ctx, bool rawHtml = true);
std::string slugify(std::string_view text);

// ---- theme.cpp: the default theme, written into _zdoc/ of every site ----
extern const char* const kStyleCss;
extern const char* const kDocJs;

}  // namespace zn::doc
