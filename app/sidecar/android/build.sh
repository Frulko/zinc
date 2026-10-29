#!/bin/sh
# The Android screen of Sidecar: app/sidecar/android/build.sh builds build/sidecar-screen.apk (Android 5 and later, armeabi-v7a and
# arm64-v8a) with the SDK's tools alone, no Gradle: the NDK's clang for jni/receiver.c and the vendored codecs, javac and d8 for the
# activity, aapt2, zipalign and apksigner (the debug keystore). install.sh puts it on the device on the USB cable.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
sdk=${ANDROID_HOME:-$HOME/Library/Android/sdk}
bt=$sdk/build-tools/$(ls "$sdk/build-tools" | sort -V | tail -n 1)
jar=$sdk/platforms/$(ls "$sdk/platforms" | sort -V | tail -n 1)/android.jar
ndk=$sdk/ndk/$(ls "$sdk/ndk" | sort -V | tail -n 1)
cc=$(echo "$ndk"/toolchains/llvm/prebuilt/*/bin)
out=$here/build; rm -rf "$out"; mkdir -p "$out/classes" "$out/apk/lib"
src="$here/jni/receiver.c $root/third_party/lz4/lz4.c $(ls "$root"/third_party/zstd/common/*.c "$root"/third_party/zstd/decompress/*.c)"
for abi in armeabi-v7a:armv7a-linux-androideabi21 arm64-v8a:aarch64-linux-android21; do
  mkdir -p "$out/apk/lib/${abi%%:*}"
  "$cc/${abi#*:}-clang" -O2 -shared -fPIC -w -DZSTD_DISABLE_ASM -DZSTD_MULTITHREAD=0 -I"$root/third_party/lz4" -I"$root/third_party/zstd" \
    $src -landroid -llog -Wl,-z,max-page-size=16384 -o "$out/apk/lib/${abi%%:*}/libsidecar.so"
done
javac -nowarn -Xlint:-options --release 11 -cp "$jar" -d "$out/classes" "$here"/src/dev/zinc/sidecar/*.java
"$bt/d8" --min-api 21 --lib "$jar" --output "$out/apk" $(find "$out/classes" -name '*.class')
"$bt/aapt2" link -o "$out/base.apk" -I "$jar" --manifest "$here/AndroidManifest.xml"
(cd "$out/apk" && zip -qr "$out/base.apk" classes.dex lib)
"$bt/zipalign" -f -p 4 "$out/base.apk" "$out/aligned.apk"
"$bt/apksigner" sign --ks "$HOME/.android/debug.keystore" --ks-pass pass:android --out "$out/sidecar-screen.apk" "$out/aligned.apk"
echo "built $out/sidecar-screen.apk"
