/* zinc: what the CMake of chromaprint would write (config.h.in) for this build: KissFFT (vendored beside it), no FFmpeg and
 * no internal avresample (the only LGPL part of chromaprint is left out: the plugin feeds it 11025 Hz mono, its own rate). */
#define HAVE_ROUND 1
#define HAVE_LRINTF 1
#define USE_KISSFFT 1
