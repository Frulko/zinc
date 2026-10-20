// Windows laptops with two GPUs (Intel for the desktop, NVIDIA or AMD for games): the driver gives a program the integrated one unless the
// program's executable exports these two variables. Without them the window's OpenGL context came up on the Intel UHD of a GTX 1650 Ti laptop.
// The default is the discrete GPU (the faster one); ZINC_GPU=integrated asks for the integrated one (battery), ZINC_GPU=discrete or unset for the
// discrete one. The variables are read by the driver when the graphics library loads, after this constructor and before the first window; the
// "Graphics settings" page of Windows still overrides both.
#ifdef _WIN32
#include <cstdlib>
#include <cstring>
extern "C" {
__declspec(dllexport) unsigned long NvOptimusEnablement = 1;               // NVIDIA Optimus
__declspec(dllexport) int AmdPowerXpressRequestHighPerformance = 1;        // AMD PowerXpress / Switchable Graphics
}
namespace {
struct GpuChoice {
  GpuChoice() {
    const char* g = std::getenv("ZINC_GPU");
    if (g && !std::strcmp(g, "integrated")) { NvOptimusEnablement = 0; AmdPowerXpressRequestHighPerformance = 0; }
  }
} gpuChoice;
}
#endif
