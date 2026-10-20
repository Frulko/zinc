---
id: ZN-621
title: 'zinc export --target android: Gradle project generator'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 14:04'
updated_date: '2026-10-16 13:35'
labels:
  - mobile
  - size-M
milestone: m-26
dependencies:
  - ZN-618
  - ZN-620
ordinal: 195000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Writes `dist/<name>-android/`: Gradle and CMake files, an `SDLActivity` subclass, AndroidManifest from `zinc.json` (id, version, orientation, permissions), the AOT C++, the engine sources, assets; target API 36, min API 21, 16 KB alignment flags (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the generated tree equals a golden for hello
- [x] #2 `--print` lists the commands (`./gradlew assembleDebug`, `bundleRelease`)
- [x] #3 no Android tool is run by the test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-16 (worktree, Android chain). Reworked on the owner's request (via the coordinator): the project comes from SDL's own tooling, not hand-written.

- third_party/SDL3: the whole android-project/ of the 3.4.16 archive (Gradle scripts at both levels, settings.gradle, gradle.properties, the wrapper, AndroidManifest.xml, res/, app/jni/ CMake and ndk-build files, the Java glue) and build-scripts/create-android-project.py, plus src/haptic/android (SDL_android.c includes its header); 70 files, checksums in third_party/SDL3/ANDROID.sha256, README row updated.
- zinc export --target android (src/cli_core.cpp exportAndroid): copies the template and changes what create-android-project.py changes (YourSourceHere.c -> the program's units and src/app/shell_sdl.cpp in app/jni/src/CMakeLists.txt, org.libsdl.app -> the package id in app/build.gradle, name="SDLActivity" -> <Last>Activity in the manifest, the activity class written under the package; YourSourceHere.c removed), then the Zinc changes, each one a replace that must match (a moved template is an error):
  app/jni/CMakeLists.txt add_subdirectory(SDL) -> add_subdirectory(${ZINC_ENGINE} zinc EXCLUDE_FROM_ALL) (SDL3 is built inside the engine); app/jni/src/CMakeLists.txt: the program's plugins (zn_plugin_<name> from their sources, tc::pluginSource), main linked with zn_app, ZN_APP_LIBRARY, ZN_APP_HEAP_MB, -Wl,-u,JNI_OnLoad (SDL_android.c sits in a static archive), 16 KB pages (-z max-page-size=16384, ANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON); app/build.gradle compileSdk/targetSdk 35 -> 36, minSdk and the platform arguments 21 -> 24, ndkVersion 28.2 -> 29.0.14206865, versionCode/versionName from zinc.json (app.versionCode, else 1.2.3 -> 10203), abiFilters -> zinc.abis (armeabi-v7a, arm64-v8a, x86_64), -DZINC_ENGINE; build.gradle AGP 8.7.3 -> 8.13.2 (compileSdk 36); gradle-wrapper.properties Gradle 8.12 -> 8.14.3 with its distributionSha256Sum; strings.xml app_name; the manifest's permissions (zinc.json permissions: net INTERNET, camera, microphone RECORD_AUDIO, location; INTERNET when none are declared) and android:screenOrientation (app.orientation); gradle.properties += BUILD_WITH_CMAKE=1 (the template's CMake path), zinc.engine, zinc.abis; app.icon into every mipmap; assets/ into app/src/main/assets/zinc/assets with assets.txt (a stamp, then the files) for the shell; README-zinc.txt.
- The activity overrides getLibraries() -> {"main"}: SDL3 is linked into libmain.so, no libSDL3.so.
- minSdk 24, not 21: libuv calls pthread_barrier_*, in bionic since API 24 (the NDK refuses the calls below it); the owner's limit was "at most 25" and the Nexus 7 2012 runs 25. Profile id note updated (Android 7.0, API 24).
- The program's C++ comes from `ZN_AOT_CPP_ONLY=1 zinc build --profile android` (ZN-620): program.cpp, program.partN.cpp, and program.plugins (the names).
- engine CMake (CMakeLists.txt) usable as a subdirectory: CMAKE_SOURCE_DIR/CMAKE_BINARY_DIR -> CMAKE_CURRENT_*; ANDROID: libuv's [linux] sources, _GNU_SOURCE, libdl; ZRT_PLATFORM "android".

Test tests/t0/export_android.sh (1 s): the exported tree of examples/hello equals tests/golden/export-android/hello.txt (every file and its sha256 with the engine and output paths normalized; the program's C++ by name), --print lists ./gradlew assembleDebug and bundleRelease, traps for gradle/adb/java/sdkmanager/aapt2/ndk-build on the PATH are not called, and the package id, ABIs, activity, SDK levels and 16 KB flag are where they belong. UPDATE=1 rewrites the golden.
- app/build.gradle: targets "main" in the cmake block: AGP builds every library and executable of the CMake project otherwise (the engine's CLI, its tests).
- Proven by ZN-622: the exported rn-showcase builds with ./gradlew assembleDebug -Pzinc.abis=armeabi-v7a (AGP fetched the SDK's CMake 3.22.1 by itself) and runs on the Nexus 7.
<!-- SECTION:NOTES:END -->
