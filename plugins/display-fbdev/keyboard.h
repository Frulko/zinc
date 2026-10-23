// libxkbcommon's stable C ABI, loaded at runtime so framebuffer-only boards need no development headers.
#pragma once
#include <dlfcn.h>
#include <locale.h>

namespace keyboard {
struct Names { const char *rules, *model, *layout, *variant, *options; };
static void *library, *context, *map, *state, *table, *compose;
static time_t config_changed;
#define XKB_FN(name, result, args) static result (*name) args
XKB_FN(context_new, void*, (int)); XKB_FN(context_unref, void, (void*));
XKB_FN(keymap_new_from_names, void*, (void*, const Names*, int)); XKB_FN(keymap_unref, void, (void*));
XKB_FN(state_new, void*, (void*)); XKB_FN(state_unref, void, (void*));
XKB_FN(state_update_key, int, (void*, uint32_t, int));
XKB_FN(state_key_get_one_sym, uint32_t, (void*, uint32_t));
XKB_FN(state_key_get_utf8, int, (void*, uint32_t, char*, size_t));
XKB_FN(state_mod_name_is_active, int, (void*, const char*, int));
XKB_FN(keymap_key_get_syms_by_level, int, (void*, uint32_t, uint32_t, uint32_t, const uint32_t**));
XKB_FN(state_key_get_layout, uint32_t, (void*, uint32_t));
XKB_FN(compose_table_new_from_locale, void*, (void*, const char*, int));
XKB_FN(compose_table_unref, void, (void*)); XKB_FN(compose_state_new, void*, (void*, int));
XKB_FN(compose_state_unref, void, (void*)); XKB_FN(compose_state_feed, int, (void*, uint32_t));
XKB_FN(compose_state_get_status, int, (void*)); XKB_FN(compose_state_get_utf8, int, (void*, char*, size_t));
XKB_FN(compose_state_reset, void, (void*));
#undef XKB_FN
static void shutdown() {
  if (compose) compose_state_unref(compose);
  if (table) compose_table_unref(table);
  if (state) state_unref(state);
  if (map) keymap_unref(map);
  if (context) context_unref(context);
  compose = table = state = map = context = nullptr;
  if (library) dlclose(library);
  library = nullptr;
}
static std::string setting(const char* source, const char* key) {
  // /etc/default/keyboard is a shell assignment file, never executed by the player.
  FILE* f = fopen(source, "r");
  if (!f) return {};
  char line[2048]; std::string value;
  const size_t n = strlen(key);
  while (fgets(line, sizeof line, f)) if (!strncmp(line, key, n) && line[n] == '=') {
    value = line + n + 1;
    while (!value.empty() && (value.back() == '\n' || value.back() == '\r')) value.pop_back();
    if (value.size() >= 2 && (value.front() == '"' || value.front() == '\'') && value.back() == value.front()) value = value.substr(1, value.size() - 2);
  }
  fclose(f); return value;
}
static bool init() {
  library = dlopen("libxkbcommon.so.0", RTLD_NOW | RTLD_LOCAL);
  if (!library) return false;
#define LOAD(name) name = reinterpret_cast<decltype(name)>(dlsym(library, "xkb_" #name)); if (!name) { shutdown(); return false; }
  LOAD(context_new); LOAD(context_unref); LOAD(keymap_new_from_names); LOAD(keymap_unref);
  LOAD(state_new); LOAD(state_unref); LOAD(state_update_key); LOAD(state_key_get_one_sym); LOAD(state_key_get_utf8);
  LOAD(state_mod_name_is_active); LOAD(keymap_key_get_syms_by_level); LOAD(state_key_get_layout);
  LOAD(compose_table_new_from_locale); LOAD(compose_table_unref); LOAD(compose_state_new); LOAD(compose_state_unref);
  LOAD(compose_state_feed); LOAD(compose_state_get_status); LOAD(compose_state_get_utf8); LOAD(compose_state_reset);
#undef LOAD
  const char* keys[] = {"XKBMODEL", "XKBLAYOUT", "XKBVARIANT", "XKBOPTIONS"};
  const char* envs[] = {"XKB_DEFAULT_MODEL", "XKB_DEFAULT_LAYOUT", "XKB_DEFAULT_VARIANT", "XKB_DEFAULT_OPTIONS"};
  std::string values[4];
  for (int i = 0; i < 4; i++) values[i] = getenv(envs[i]) ? getenv(envs[i]) : setting("/etc/default/keyboard", keys[i]);
  Names names{nullptr, values[0].empty() ? nullptr : values[0].c_str(), values[1].empty() ? nullptr : values[1].c_str(), values[2].c_str(), values[3].c_str()};
  context = context_new(0);
  if (context) map = keymap_new_from_names(context, &names, 0);
  if (map) state = state_new(map);
  if (!state) { shutdown(); return false; }
  const char* locale = setlocale(LC_CTYPE, "");
  table = compose_table_new_from_locale(context, locale ? locale : "C.UTF-8", 0);
  if (table) compose = compose_state_new(table, 0);
  struct stat file;
  config_changed = stat("/etc/default/keyboard", &file) == 0 ? file.st_mtime : 0;
  return true;
}
static uint32_t mods() {
  if (!state) return 0;
  uint32_t out = 0;
  const char* names[] = {"Shift", "Control", "Mod1", "Mod4"};
  for (int i = 0; i < 4; i++) if (state_mod_name_is_active(state, names[i], 1 << 3) > 0) out |= 1u << i;
  return out;
}
static bool refresh() {
  struct stat file;
  const time_t current = stat("/etc/default/keyboard", &file) == 0 ? file.st_mtime : 0;
  if (current == config_changed) return false;
  config_changed = current;
  shutdown(); return init();
}
static int named(uint32_t sym) {
  switch (sym) {
    case 0xff08: return HAL_KEY_BACKSPACE; case 0xffff: return HAL_KEY_DELETE;
    case 0xff0d: case 0xff8d: return HAL_KEY_ENTER; case 0xff09: case 0xfe20: return HAL_KEY_TAB;
    case 0xff1b: return HAL_KEY_ESCAPE;
    case 0xff51: return HAL_KEY_ARROW_LEFT; case 0xff53: return HAL_KEY_ARROW_RIGHT;
    case 0xff52: return HAL_KEY_ARROW_UP; case 0xff54: return HAL_KEY_ARROW_DOWN;
    case 0xff50: return HAL_KEY_HOME; case 0xff57: return HAL_KEY_END;
    case 0xff55: return HAL_KEY_PAGEUP; case 0xff56: return HAL_KEY_PAGEDOWN;
  }
  if (sym >= 0xffbe && sym <= 0xffc9) return HAL_KEY_F1 + sym - 0xffbe;
  return sym >= 32 && sym <= 126 ? (int)sym : 0;
}
static void event(HalInput* in, int code, int value, bool update) {
  if (!state) return;
  const uint32_t key = code + 8;
  if (update) state_update_key(state, key, value != 0);
  in->mods = mods();
  const uint32_t* symbols = nullptr;
  const int n = keymap_key_get_syms_by_level(map, key, state_key_get_layout(state, key), 0, &symbols);
  const int logical = named(n > 0 ? symbols[0] : state_key_get_one_sym(state, key));
  if (logical && in->nkeys < HAL_MAX_KEYS) in->keys[in->nkeys++] = {logical, in->mods, value == 0 ? HAL_KEY_UP : value == 2 ? HAL_KEY_REPEAT : HAL_KEY_DOWN, 0, 0};
  if (!value) return;
  char text[HAL_TEXT_BYTES];
  int length = 0, status = 0;
  if (compose) {
    compose_state_feed(compose, state_key_get_one_sym(state, key));
    status = compose_state_get_status(compose);
    if (status == 2) length = compose_state_get_utf8(compose, text, sizeof text);
    if (status == 2 || status == 3) compose_state_reset(compose);
  }
  if (!status) length = state_key_get_utf8(state, key, text, sizeof text);
  if (!(in->mods & (HAL_MOD_CTRL | HAL_MOD_META)) && length > 0 && length < (int)sizeof text && (unsigned char)text[0] >= 32 &&
      in->nkeys < HAL_MAX_KEYS && in->ntext + length <= HAL_TEXT_BYTES) {
    memcpy(in->text + in->ntext, text, length);
    in->keys[in->nkeys++] = {0, in->mods, HAL_KEY_TEXT, (uint16_t)in->ntext, (uint16_t)length};
    in->ntext += length;
  }
}
}
