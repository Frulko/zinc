// zn::i18n: the languages of the tooling (D159, docs/reports/onboarding-i18n-research.md). The messages are flat JSON catalogs,
// i18n/<lang>/<area>.json (areas cli, diag; every key starts with its area), with {name} placeholders ({{ is a literal brace) and CLDR
// plural suffixes (_one, _many, _other). English is the source and is compiled in, so a missing file or key prints English, never nothing.
// Depends on nothing of the engine (yyjson only).
#pragma once
#include <initializer_list>
#include <string>
#include <vector>

namespace zn::i18n {

/** The languages shipped, English first. */
inline constexpr const char* kLanguages[] = {"en", "fr", "es", "it", "de"};

/** The shipped language of a tag ("fr-CA", "de_DE.UTF-8", "es-419" give fr, de, es), "" when it is none of them. */
std::string match(const std::string& tag);

/** Where the catalogs are (`dir`, normally <engine>/i18n; ZINC_I18N_DIR wins, for a translator) and the settings file that may hold
 *  "lang" ($ZINC_HOME/config.json). Nothing is read before the first message. */
void configure(const std::string& dir, const std::string& configFile);

/** The language of the messages, first hit wins: ZINC_LANG (--lang sets it), "lang" of the settings file, LANGUAGE, then LC_ALL,
 *  LC_MESSAGES or LANG (C and POSIX mean English), the macOS preferred languages, English. Never setlocale(). */
std::string language();
/** Makes `lang` the language of the next messages (zinc config set lang, the first-run welcome). */
void use(const std::string& lang);

/** The CLDR cardinal category of `n` in `lang` ("one", "many" or "other"): fr says one for 0 and 1.5, en other. */
const char* plural(const std::string& lang, double n);

struct Arg { const char* name; std::string value; };
/** The message `id` in the language in force, its {placeholders} filled from `args`: English when that language lacks it, the id itself
 *  when English lacks it too (tools/i18n-check prevents that). */
std::string tr(const char* id, std::initializer_list<Arg> args = {});
/** A message about a number: `id`_one, _many or _other by the plural category of `count` (many falls back to other, then to `id`),
 *  {count} filled with it. */
std::string trn(const char* id, double count, std::initializer_list<Arg> args = {});
/** The message `id` in `lang` (English when that language lacks it): a diagnostic keeps its English text, made with it, for the tools
 *  that read it, and is printed in the person's language. */
std::string message(const std::string& lang, const char* id, const std::vector<Arg>& args);

}  // namespace zn::i18n
