// kms.cpp under its own names: Linux chooses between the screen and a window at run time (linux.cpp).
#define zgl_backend_init zgl_kms_init
#define zgl_backend_scale zgl_kms_scale
#define zgl_backend_size zgl_kms_size
#define zgl_backend_native zgl_kms_native
#define zgl_backend_swap zgl_kms_swap
#define zgl_backend_poll zgl_kms_poll
#define zgl_backend_shutdown zgl_kms_shutdown
#define zgl_backend_egl zgl_kms_egl
#include "kms.cpp"
