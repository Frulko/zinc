#pragma once
#include "zn/embed.h"
#ifdef __cplusplus
extern "C" {
#endif
int obs_start(void);
void obs_controls(double speed, int paused, int selected);
int obs_selected(void);
void obs_stop(void);
int obs_has_external_window(void);
#ifdef __cplusplus
}
#endif
