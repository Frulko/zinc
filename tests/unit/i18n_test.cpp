// src/i18n (tests/t0/i18n.sh): the CLDR plural categories of the five languages, the choice of the language (D159 order) and the
// fallback to the English compiled in, on catalogs written here.
#include "i18n/i18n.h"

#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <string>
#include <unistd.h>

namespace fs = std::filesystem;
using namespace zn::i18n;

static int failures = 0;
#define CHECK(cond, ...) do { if (!(cond)) { std::fprintf(stderr, "FAIL %s:%d: ", __FILE__, __LINE__); std::fprintf(stderr, __VA_ARGS__); std::fputc('\n', stderr); ++failures; } } while (0)

static void write(const fs::path& p, const std::string& text) { fs::create_directories(p.parent_path()); std::ofstream(p) << text; }

int main() {
  // CLDR cardinals (unicode-org/cldr-json supplemental/plurals.json) on 0, 1, 1.5, 2 and 1000000
  const double n[] = {0, 1, 1.5, 2, 1000000};
  const struct { const char* lang; const char* want[5]; } table[] = {
      {"en", {"other", "one", "other", "other", "other"}},
      {"de", {"other", "one", "other", "other", "other"}},
      {"fr", {"one", "one", "one", "other", "many"}},
      {"es", {"other", "one", "other", "other", "many"}},
      {"it", {"other", "one", "other", "other", "many"}},
  };
  for (const auto& row : table)
    for (int k = 0; k < 5; ++k) CHECK(std::string(plural(row.lang, n[k])) == row.want[k], "plural(%s, %g) = %s, want %s", row.lang, n[k], plural(row.lang, n[k]), row.want[k]);
  CHECK(std::string(plural("fr", 2000000)) == "many" && std::string(plural("fr", 1000001)) == "other", "fr: many is for exact millions");

  CHECK(match("fr-CA") == "fr" && match("de_DE.UTF-8") == "de" && match("es-419") == "es" && match("IT") == "it" && match("en") == "en", "match of regional tags");
  CHECK(match("pt-BR").empty() && match("").empty() && match("C").empty(), "match of a language that is not shipped");

  const fs::path dir = fs::temp_directory_path() / ("zn-i18n-test-" + std::to_string(::getpid()));
  fs::remove_all(dir);
  write(dir / "i18n/fr/cli.json", R"({"cli.unknown.command": "commande inconnue '{name}'", "cli.test.files_one": "{count} fichier", "cli.test.files_other": "{count} fichiers", "cli.test.brace": "{{name} reste {name}"})");
  write(dir / "home/config.json", R"({"lang": "it", "atelier.theme": "dark"})");
  for (const char* k : {"ZINC_LANG", "ZINC_I18N_DIR", "LANGUAGE", "LC_ALL", "LC_MESSAGES", "LANG"}) unsetenv(k);

  // the order: ZINC_LANG, the settings file, LANGUAGE, LC_ALL / LC_MESSAGES / LANG
  configure((dir / "i18n").string(), (dir / "home/config.json").string());
  setenv("LANG", "de_DE.UTF-8", 1);
  CHECK(language() == "it", "the settings file wins over LANG: %s", language().c_str());
  setenv("ZINC_LANG", "fr-CA", 1);
  configure((dir / "i18n").string(), (dir / "home/config.json").string());
  CHECK(language() == "fr", "ZINC_LANG wins over the settings file, fr-CA is fr: %s", language().c_str());
  unsetenv("ZINC_LANG");
  configure((dir / "i18n").string(), "");
  CHECK(language() == "de", "LANG decides when nothing else is set: %s", language().c_str());
  setenv("LANGUAGE", "pt_BR:es", 1);
  configure((dir / "i18n").string(), "");
  CHECK(language() == "es", "LANGUAGE: the first shipped language of the list: %s", language().c_str());
  unsetenv("LANGUAGE");
  setenv("LC_ALL", "C", 1);
  configure((dir / "i18n").string(), "");
  CHECK(language() == "en", "LC_ALL=C is English: %s", language().c_str());
  setenv("LC_ALL", "pt_PT.UTF-8", 1);
  configure((dir / "i18n").string(), "");
  CHECK(language() == "en", "a language that is not shipped is English: %s", language().c_str());
  unsetenv("LC_ALL");
  unsetenv("LANG");

  // the messages: the language's, English for a key it lacks, the id for a key nobody has; placeholders and plurals
  setenv("ZINC_LANG", "fr", 1);
  configure((dir / "i18n").string(), "");
  CHECK(tr("cli.unknown.command", {{"name", "rnu"}}) == "commande inconnue 'rnu'", "fr message: %s", tr("cli.unknown.command", {{"name", "rnu"}}).c_str());
  CHECK(tr("cli.help.none", {{"name", "x"}}) == "zinc: no help for 'x' (zinc help lists the commands)", "a key fr lacks falls back to the English compiled in: %s", tr("cli.help.none", {{"name", "x"}}).c_str());
  CHECK(tr("cli.nobody.has.this") == "cli.nobody.has.this", "an unknown id prints itself");
  CHECK(tr("cli.test.brace", {{"name", "x"}}) == "{name} reste x", "{{ is a literal brace: %s", tr("cli.test.brace", {{"name", "x"}}).c_str());
  CHECK(trn("cli.test.files", 0) == "0 fichier" && trn("cli.test.files", 1.5) == "1.5 fichier" && trn("cli.test.files", 2) == "2 fichiers", "fr plurals: %s, %s", trn("cli.test.files", 0).c_str(), trn("cli.test.files", 2).c_str());
  CHECK(trn("cli.test.files", 1000000) == "1000000 fichiers", "fr many falls back to other: %s", trn("cli.test.files", 1000000).c_str());
  use("de");
  CHECK(language() == "de" && tr("cli.unknown.command", {{"name", "x"}}) == "zinc: unknown command 'x' (zinc help lists the commands)", "no German file here: English");
  fs::remove_all(dir / "i18n");
  setenv("ZINC_I18N_DIR", (dir / "nothing").string().c_str(), 1);
  configure("/also/nothing", "");
  CHECK(tr("cli.usage", {{"usage", "zinc x"}}) == "usage: zinc x", "no catalogs at all: English: %s", tr("cli.usage", {{"usage", "zinc x"}}).c_str());
  fs::remove_all(dir);

  if (failures == 0) std::puts("i18n: ok");
  return failures ? 1 : 0;
}
