#pragma once
// zinc doc (ZN-856, docs/guide/13-doc.md): the documentation of a project, a plugin or the engine as a static site, as cargo doc and godoc
// make theirs. The API comes from the code (exported declarations and their doc comments, a plugin's native spec), the guides from Markdown
// and MDX pages (a project's docs/, a plugin's docs/), with search, light and dark themes and a theme.css a project overrides. Offline: md4c,
// the frontend's lexer and a theme compiled into zinc; nothing is fetched. --serve serves it on a local port and rebuilds it on change.
#include <string>
#include <vector>

namespace zn::doc {

/** `zinc doc [dir] [--std] [--out dir] [--serve [--port n]]`: args[0] is "zinc", args[1] "doc". `engineRoot`: the engine's files (lib/std,
 *  plugins, docs). Returns the exit code. */
int run(const std::vector<std::string>& args, const std::string& engineRoot);

}  // namespace zn::doc
