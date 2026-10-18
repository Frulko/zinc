// Windows laptops with two GPUs (Intel for the desktop, NVIDIA or AMD for games): the driver gives a program the integrated one unless the
// program's executable exports these two variables. Without them the window's OpenGL context came up on the Intel UHD of a GTX 1650 Ti laptop.
// ZN_GPU=integrated is not honoured here (the driver reads the exports at load); the Windows "Graphics settings" page still overrides them.
#ifdef _WIN32
extern "C" {
__declspec(dllexport) unsigned long NvOptimusEnablement = 1;               // NVIDIA Optimus
__declspec(dllexport) int AmdPowerXpressRequestHighPerformance = 1;        // AMD PowerXpress / Switchable Graphics
}
#endif
