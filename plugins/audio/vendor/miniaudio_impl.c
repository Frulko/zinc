/* The one translation unit of miniaudio 0.11.25, with Vorbis decoding through stb_vorbis 1.22 (PIN has the checksums).
   The order is the one miniaudio's documentation asks for: stb_vorbis's declarations, miniaudio, then stb_vorbis's code.
   The plugin build keys the compiled archive on this file alone: change the versions above when a vendored file is replaced. */
#define STB_VORBIS_HEADER_ONLY
#include "stb_vorbis.c"
#define MINIAUDIO_IMPLEMENTATION
#include "miniaudio.h"
#undef STB_VORBIS_HEADER_ONLY
#include "stb_vorbis.c"
