// The system JavaScriptCore embedded in a program (D110): evaluates one file and prints its last value.
// cc -O2 bench/qjs/jsc-host.c -framework JavaScriptCore -o /tmp/jsc-host && /tmp/jsc-host bench/qjs/p5shape.js        (no JIT: 6.2 ms)
// The JIT runs only when the executable carries com.apple.security.cs.allow-jit (an ad hoc signature is enough, the hardened runtime too):
// codesign -s - -f --entitlements jit.plist /tmp/jsc-host        (jit.plist: <dict><key>com.apple.security.cs.allow-jit</key><true/></dict>; 0.41 ms)
#include <JavaScriptCore/JavaScriptCore.h>
#include <stdio.h>
#include <stdlib.h>
int main(int argc, char** argv) {
  FILE* f = fopen(argv[1], "rb"); fseek(f, 0, SEEK_END); long n = ftell(f); rewind(f);
  char* src = malloc(n + 1); fread(src, 1, n, f); src[n] = 0;
  JSGlobalContextRef ctx = JSGlobalContextCreate(NULL);
  JSStringRef s = JSStringCreateWithUTF8CString(src);
  JSValueRef ex = NULL, v = JSEvaluateScript(ctx, s, NULL, NULL, 1, &ex);
  JSStringRef out = JSValueToStringCopy(ctx, ex ? ex : v, NULL);
  char buf[512]; JSStringGetUTF8CString(out, buf, sizeof buf);
  printf("%s%s\n", ex ? "exception: " : "", buf);
  return ex ? 1 : 0;
}
