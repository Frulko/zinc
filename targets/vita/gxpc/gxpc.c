// gxpc: compiles the Cg programs of zinc's GXM paths with the console's own SceShaccCg (ur0:data/libshacccg.suprx, or ur0:data/external/),
// on a PS Vita, once, into ux0:data/zinc/gxp/<name>.gxp; the GXP files are then committed in targets/vita/shaders and embedded, so no
// player needs the compiler. psp2spvc's GXP ran in Vita3K but crashed a real Vita's GPU (2026-10-25). Build: targets/vita/gxpc/README.md.
#include <psp2/kernel/modulemgr.h>
#include <psp2/kernel/processmgr.h>
#include <psp2/kernel/clib.h>
#include <psp2/io/fcntl.h>
#include <psp2/io/stat.h>
#include <psp2/shacccg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const char kTex3dV[] =
  "// zinc:3d on GXM (plugins/3d/native/render3d.vita.cpp): the vertex program of every draw, compiled by Sony's SceShaccCg (gxpc.c) into\n"
  "// ../shaders/tex3d-v.gxp. The lighting is the software renderer's, per vertex on the CPU, in the aColor stream. Its outputs are the inputs of\n"
  "// SDL's texture fragment program (third_party/SDL3/src/render/vitagxm/shader_src/texture_f.cg): COLOR and TEXCOORD0, texture x colour.\n"
  "// Wvp: clip = Wvp * position, uploaded row by row.\n"
  "void main(float3 aPosition, float2 aTexcoord, float4 aColor, uniform float4x4 Wvp,\n"
  "          out float4 vPosition : POSITION, out float4 vColor : COLOR, out float2 vTexcoord : TEXCOORD0)\n"
  "{\n"
  "    vPosition = mul(Wvp, float4(aPosition, 1.0f));\n"
  "    vColor = aColor;\n"
  "    vTexcoord = aTexcoord;\n"
  "}\n"
  "";

static struct { const char* name; const char* src; SceShaccCgTargetProfile profile; } kPrograms[] = {
  {"tex3d-v", kTex3dV, SCE_SHACCCG_PROFILE_VP},
};

static SceUID logFd = -1;
static void say(const char* line) {
  sceClibPrintf("%s", line);
  if (logFd >= 0) { sceIoWrite(logFd, line, strlen(line)); sceIoSyncByFd(logFd, 0); }
}

static const char* current;
static SceShaccCgSourceFile source;
static SceShaccCgSourceFile* openFile(const char* name, const SceShaccCgSourceLocation* from, const SceShaccCgCompileOptions* o, const char** err) {
  (void)from; (void)o; (void)err;
  source.fileName = name; source.text = current; source.size = (SceUInt32)strlen(current);
  return &source;
}
static void* alloc(unsigned int n) { return malloc(n); }

int main(void) {
  sceIoMkdir("ux0:data/zinc", 0777);
  sceIoMkdir("ux0:data/zinc/gxp", 0777);
  logFd = sceIoOpen("ux0:data/zinc/gxp/gxpc.log", SCE_O_WRONLY | SCE_O_CREAT | SCE_O_TRUNC, 0666);
  char line[256];
  SceUID mod = sceKernelLoadStartModule("ur0:data/libshacccg.suprx", 0, NULL, 0, NULL, NULL);
  if (mod < 0) mod = sceKernelLoadStartModule("ur0:data/external/libshacccg.suprx", 0, NULL, 0, NULL, NULL);
  if (mod < 0) { snprintf(line, sizeof line, "gxpc: no libshacccg.suprx in ur0:data or ur0:data/external (0x%08X)\n", (unsigned)mod); say(line); sceKernelExitProcess(1); return 1; }
  sceShaccCgSetDefaultAllocator(alloc, free);
  SceShaccCgCallbackList cb;
  sceShaccCgInitializeCallbackList(&cb, SCE_SHACCCG_TRIVIAL);
  cb.openFile = openFile;
  int failed = 0;
  for (unsigned i = 0; i < sizeof kPrograms / sizeof kPrograms[0]; i++) {
    SceShaccCgCompileOptions opt;
    sceShaccCgInitializeCompileOptions(&opt);
    opt.mainSourceFile = kPrograms[i].name;
    opt.targetProfile = kPrograms[i].profile;
    opt.entryFunctionName = "main";
    opt.locale = SCE_SHACCCG_ENGLISH;
    opt.optimizationLevel = 3;
    current = kPrograms[i].src;
    const SceShaccCgCompileOutput* out = sceShaccCgCompileProgram(&opt, &cb, 0);
    for (int d = 0; out && d < out->diagnosticCount; d++) {
      snprintf(line, sizeof line, "gxpc: %s: line %u: %s\n", kPrograms[i].name,
        out->diagnostics[d].location ? (unsigned)out->diagnostics[d].location->lineNumber : 0u, out->diagnostics[d].message);
      say(line);
    }
    if (!out || !out->programData) { snprintf(line, sizeof line, "gxpc: %s: not compiled\n", kPrograms[i].name); say(line); failed = 1; continue; }
    char path[96];
    snprintf(path, sizeof path, "ux0:data/zinc/gxp/%s.gxp", kPrograms[i].name);
    SceUID fd = sceIoOpen(path, SCE_O_WRONLY | SCE_O_CREAT | SCE_O_TRUNC, 0666);
    if (fd >= 0) { sceIoWrite(fd, out->programData, out->programSize); sceIoClose(fd); }
    snprintf(line, sizeof line, "gxpc: %s: %u bytes in %s\n", kPrograms[i].name, (unsigned)out->programSize, path);
    say(line);
  }
  say(failed ? "gxpc: done, with errors\n" : "gxpc: done\n");
  sceKernelExitProcess(failed);
  return failed;
}
