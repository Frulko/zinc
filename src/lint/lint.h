#pragma once
// zinc migrate and zinc lint (docs/reports/zinc-lint-migrate.md, docs/guide/10-lint-migrate.md): codemods that rewrite a project when the language or an
// API changes, and the rules that check a program before a compile, on its own and per target (targets/capabilities.json, zinc.json, plugin.json).
// Both work on the engine's own lexer and loader: no Node, no download, the same reading of the source as the compiler's.
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace zn::lint {

/** One place a codemod or a source rule found: bytes [start, end) of the text, what to write there (empty: no automatic fix), and why. */
struct Site { std::uint32_t start, end; std::string replacement, message; };

/** A codemod: `id` (what zinc migrate and the engine's diagnostics name), `since` (the engine change that needs it), the diagnostic it fixes,
 *  and `scan`, the sites of one source (.tsx or .jsx code). */
struct Codemod { const char* id; const char* since; const char* code; const char* summary; std::vector<Site> (*scan)(std::string_view src); };
const std::vector<Codemod>& codemods();

/** `src` with the replacement of every site that has one (sites in any order, overlapping ones after the first skipped). */
std::string rewrite(std::string_view src, const std::vector<Site>& sites);
/** The sites of `cm` in a file: a .tsx or .jsx file, or the tsx/jsx/ts/js fences of a .md file (positions in the whole text); none for other
 *  files and for code the lexer refuses (an unterminated string...). Strings, comments and JSX text are never sites. */
std::vector<Site> scanFile(const Codemod& cm, const std::string& path, std::string_view text);

/** The string literals of the className attributes of a .tsx/.jsx source, one entry per class: its byte offset and the class. */
struct ClassUse { std::uint32_t at; std::string cls; };
std::vector<ClassUse> classNames(std::string_view src);

/** `zinc migrate [--list] [--dry-run|--apply] [<codemod>...] [paths]` (args[0] is "zinc", args[1] "migrate"). */
int migrate(const std::vector<std::string>& args);
/** `zinc lint [--target <profile>|--all-targets] [--json] [--rules] [path]`. Exit 1 when a rule of severity error fires on the source or on a
 *  target in force (--target, else the targets zinc.json names, else this machine). */
int lint(const std::vector<std::string>& args, const std::string& engineRoot);

}  // namespace zn::lint
