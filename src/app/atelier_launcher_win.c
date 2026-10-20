// "Zinc Atelier.exe", the launcher of Zinc-Atelier-<version>-windows-<arch>.zip (tools/package): a GUI program, so no console window opens.
// It starts bin\zinc.exe beside it on the Atelier with %ZINC_PROJECT% or %USERPROFILE%\Zinc as the project, writing a first hello.ts there,
// as the launcher of the macOS app does (tools/package, LAUNCHER). A zinc.exe that cannot start says so in a message box.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <wchar.h>

int WINAPI WinMain(HINSTANCE inst, HINSTANCE prev, LPSTR cmd, int show) {
  (void)inst; (void)prev; (void)cmd; (void)show;
  wchar_t here[MAX_PATH], proj[MAX_PATH], file[MAX_PATH], line[4 * MAX_PATH];
  DWORD n = GetModuleFileNameW(NULL, here, MAX_PATH);
  if (n == 0 || n >= MAX_PATH) return 1;
  wchar_t* slash = wcsrchr(here, L'\\');
  if (slash) *slash = 0;
  DWORD e = GetEnvironmentVariableW(L"ZINC_PROJECT", proj, MAX_PATH);
  if (e == 0 || e >= MAX_PATH) {
    e = GetEnvironmentVariableW(L"USERPROFILE", proj, MAX_PATH - 8);
    if (e == 0 || e >= MAX_PATH - 8) return 1;
    wcscat(proj, L"\\Zinc");
  }
  CreateDirectoryW(proj, NULL);
  if (_snwprintf(file, MAX_PATH, L"%ls\\hello.ts", proj) < 0) return 1;
  HANDLE f = CreateFileW(file, GENERIC_WRITE, 0, NULL, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, NULL);   // CREATE_NEW: an existing file is kept
  if (f != INVALID_HANDLE_VALUE) {
    static const char hello[] = "console.log(\"hello from Zinc\");\n";
    DWORD wrote;
    WriteFile(f, hello, sizeof hello - 1, &wrote, NULL);
    CloseHandle(f);
  }
  if (_snwprintf(line, 4 * MAX_PATH, L"\"%ls\\bin\\zinc.exe\" run \"%ls\\share\\zinc\\next\\app\\atelier\\main.tsx\" -- \"%ls\"", here, here, proj) < 0) return 1;
  STARTUPINFOW si;
  PROCESS_INFORMATION pi;
  ZeroMemory(&si, sizeof si);
  si.cb = sizeof si;
  if (!CreateProcessW(NULL, line, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, here, &si, &pi)) {
    MessageBoxW(NULL, L"bin\\zinc.exe could not be started: unzip the whole folder and open Zinc Atelier.exe from it.", L"Zinc Atelier", MB_ICONERROR);
    return 1;
  }
  CloseHandle(pi.hThread);
  CloseHandle(pi.hProcess);
  return 0;
}
