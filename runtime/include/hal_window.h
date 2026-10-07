// Window properties and window events for the desktop HAL (ZN-233, docs/reports/system-integration.md 4.5). Additive: a HAL that does not define these ignores them, and a program that
// sets nothing gets the window it always got. The host sets the configuration before the window exists, the system plugin installs the handlers.
#pragma once
#ifdef __cplusplus
extern "C" {
#endif
/** `app.window` of zinc.json: what must be known before the window is created. Zero or false means "as before". */
typedef struct HalWindowConfig {
  int has_position, x, y;       // 1: place the window at (x, y)
  int min_w, min_h;             // minimum size in logical pixels, 0 = none
  int borderless;               // 1: no title bar and frame (`titleBar: "none"` or `frame: false`)
  int always_on_top;            // 1: above the other windows
  int transparent;              // 1: the window background is transparent where the surface is
  int not_resizable;            // 1: fixed size
  char title[96];               // "" = the program's title
} HalWindowConfig;
/** Stores the configuration (copied) for the next window creation. */
void hal_set_window_config(const HalWindowConfig* c);
/** Called when the window is asked to close; return 0 to veto (close to tray). Without a handler the program quits. */
void hal_set_close_handler(int (*handler)(void));
/** Called with the path (or the text) of each file dropped on the window. */
void hal_set_drop_handler(void (*handler)(const char* pathOrText, int isText));
#ifdef __cplusplus
}
#endif
