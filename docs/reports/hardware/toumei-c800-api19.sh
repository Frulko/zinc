#!/bin/sh
# Makes a `zinc export --target android` project run on Android 4.4 (API 19, armeabi-v7a), as on the Toumei C800 projector.
# Usage: toumei-c800-api19.sh apply <export dir>          the four changes of toumei-c800-projector.md section 3
#        toumei-c800-api19.sh check <export dir> <libs dir>  libc names the built libmain.so needs and the device lacks
#                                                         (<libs dir>: adb pull of the device's /system/lib/lib{c,m,dl,log,android,EGL,GLESv2}.so)
# Then: JAVA_HOME=".../Android Studio.app/Contents/jbr/Contents/Home" ./gradlew assembleDebug -Pzinc.abis=armeabi-v7a
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
NDKBIN=$(ls -d "${ANDROID_NDK_HOME:-$HOME/Library/Android/sdk/ndk/29.0.14206865}"/toolchains/llvm/prebuilt/*/bin | head -1)
cmd=$1; dir=$2
[ -n "$dir" ] && [ -f "$dir/app/build.gradle" ] || { echo "usage: $0 apply|check <export dir> [libs dir]" >&2; exit 2; }

case $cmd in
apply)
  g=$dir/app/build.gradle
  grep -q 'minSdkVersion 19' "$g" && { echo "already applied: $dir"; exit 0; }
  # 1. API 19 for the APK, 21 (the NDK 29 floor) for the native code; API 24+ symbols declared weak (getifaddrs, posix_spawn...)
  sed -i '' 's/minSdkVersion [0-9]*/minSdkVersion 19/; s/android-2[0-9]/android-21/g' "$g"
  sed -i '' 's|"-DANDROID_PLATFORM=android-21",|"-DANDROID_PLATFORM=android-21", "-DCMAKE_C_FLAGS=-D__ANDROID_UNAVAILABLE_SYMBOLS_ARE_WEAK__", "-DCMAKE_CXX_FLAGS=-D__ANDROID_UNAVAILABLE_SYMBOLS_ARE_WEAK__", "-DCMAKE_JOB_POOLS=c=6", "-DCMAKE_JOB_POOL_COMPILE=c",|' "$g"
  sed -i '' 's/^zinc.abis=.*/zinc.abis=armeabi-v7a/' "$dir/gradle.properties"
  echo "android.ndk.suppressMinSdkVersionError=21" >> "$dir/gradle.properties"
  # 2. the libc names 4.4 lacks
  cp "$HERE/toumei-c800-api19-shim.c" "$dir/app/jni/src/api19_shim.c"
  sed -i '' 's|^\(    ${ZINC_ENGINE}/src/app/shell_sdl.cpp\)$|\1\
    api19_shim.c|' "$dir/app/jni/src/CMakeLists.txt"
  # 3. SDL: Dalvik rejects a class that implements a missing interface (View.OnApplyWindowInsetsListener is API 20)
  j=$dir/app/src/main/java/org/libsdl/app
  perl -0pi -e 's/implements SurfaceHolder.Callback,\n    View.OnApplyWindowInsetsListener, View.OnKeyListener/implements SurfaceHolder.Callback,\n    View.OnKeyListener/; s/setOnApplyWindowInsetsListener\(this\);/if (Build.VERSION.SDK_INT >= 20) SDLInsets20.register(this);/g; s/    \@Override\n    public WindowInsets onApplyWindowInsets/    public WindowInsets onApplyWindowInsets/' "$j/SDLSurface.java"
  cat > "$j/SDLInsets20.java" <<'EOF'
package org.libsdl.app;

import android.view.View;
import android.view.WindowInsets;

// API 19: View.OnApplyWindowInsetsListener is API 20; this class is loaded only when SDLSurface calls it, on API 20 and later.
final class SDLInsets20 {
    static void register(final SDLSurface s) {
        s.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) { return s.onApplyWindowInsets(v, insets); }
        });
    }
}
EOF
  # 4. Zinc's activity: the system bar colours are API 21
  perl -pi -e 's/^(\s+)getWindow\(\)\.set(Status|Navigation)BarColor\(Color\.TRANSPARENT\);/$1if (Build.VERSION.SDK_INT >= 21) getWindow().set$2BarColor(Color.TRANSPARENT);/; s/Build\.VERSION\.SDK_INT < 35\) \{/Build.VERSION.SDK_INT < 35 \&\& Build.VERSION.SDK_INT >= 21) {/' "$dir/app/src/main/java/dev/zinc/app/ZincActivity.java"
  echo "applied: $dir"
  ;;
check)
  libs=$3; so=$(find "$dir/app/build/intermediates" -path '*armeabi-v7a/libmain.so' | head -1)
  [ -d "$libs" ] && [ -n "$so" ] || { echo "need the device libs dir and a built libmain.so" >&2; exit 2; }
  "$NDKBIN/llvm-nm" -D --defined-only "$libs"/*.so | awk '{print $NF}' | sort -u > "$dir/.device-syms"
  # strong (U) ones fail the load; weak (w) ones resolve to 0 and fail only when called
  "$NDKBIN/llvm-nm" -D --undefined-only "$so" | awk '{print $1, $NF}' | sed 's/@.*//' | sort -u |
    while read -r t s; do grep -qx "$s" "$dir/.device-syms" || echo "$t $s"; done
  ;;
*) echo "usage: $0 apply|check <export dir> [libs dir]" >&2; exit 2 ;;
esac
