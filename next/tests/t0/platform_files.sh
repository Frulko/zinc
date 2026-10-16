#!/bin/sh
# Platform-specific files (docs/targets/capabilities.md): next to which.ts, which.esp32.ts replaces it under --profile esp32, and imports keep
# writing './which'; without a profile the host's own name (macos, linux) is the tag, and which.ts is used when no such file exists.
cd "$(dirname "$0")/../golden/platform-files" || exit 2
fail=0
got=$("$ZINC" run main.ts 2>/dev/null); [ "$got" = "which.ts" ] || { echo "platform_files: host run printed '$got', want which.ts"; fail=1; }
got=$("$ZINC" run --profile esp32 main.ts 2>/dev/null); [ "$got" = "which.esp32.ts" ] || { echo "platform_files: --profile esp32 printed '$got', want which.esp32.ts"; fail=1; }
[ $fail -eq 0 ] && echo "platform files: ok"
exit $fail
