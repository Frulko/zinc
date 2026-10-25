cmake_minimum_required(VERSION 3.20)
project(zinc_next C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release)  # benchmarks and the speed gates need -O2
endif()

# Reproducible builds (ZN-333, docs/reports/zinc-next-reproducible.md): the checkout and build paths never reach the binary through __FILE__, and with
# ZN_REPRODUCIBLE the path of the checkout is not compiled in either (zinc finds its files in the package around it, or $ZINC_ROOT): two release builds of one
# commit in two directories are byte-identical.
set(ZN_REPO_DIR "${CMAKE_CURRENT_SOURCE_DIR}")   # the checkout; the compiler compares prefixes as text, so no ".."
add_compile_options("-ffile-prefix-map=${CMAKE_CURRENT_BINARY_DIR}=build" "-ffile-prefix-map=${ZN_REPO_DIR}=zinc")
option(ZN_REPRODUCIBLE "do not compile the checkout's path into zinc (release packages; a build-tree zinc then needs ZINC_ROOT)" OFF)
option(ZN_SANITIZE "Build with ASan and UBSan" OFF)
option(ZN_FUZZ "Build the libFuzzer targets of tests/fuzz (needs a clang with libFuzzer: Homebrew llvm; see docs/reports/zinc-next-fuzzing.md)" OFF)

add_compile_options(-Wall -Wextra -ffp-contract=off)  # no fused multiply-add: the interpreter, the AOT programs and every host must round the same way
if(WIN32)   # mingw-w64 through the pinned zig (cmake/zig-windows.cmake, docs/reports/zinc-windows-port.md): M_PI under -std=c++20, no min/max macros (zig targets Windows 10 itself: _WIN32_WINNT)
  add_compile_definitions(_USE_MATH_DEFINES NOMINMAX)
endif()
if(ZN_SANITIZE)
  add_compile_options(-fsanitize=address,undefined -fno-omit-frame-pointer)
  add_link_options(-fsanitize=address,undefined)
  if(ZN_FUZZ)
    add_compile_options(-fsanitize=fuzzer-no-link)   # coverage instrumentation of every library; only the targets link the engine
  endif()
endif()

# Dependency direction: include/zn <- frontend <- ir <- zbc <- rt <- vm (see ARCHITECTURE.md).
add_library(zn_yyjson STATIC third_party/yyjson/yyjson.c)
target_include_directories(zn_yyjson PUBLIC third_party/yyjson)
set_target_properties(zn_yyjson PROPERTIES C_STANDARD 11 POSITION_INDEPENDENT_CODE ON)
target_compile_options(zn_yyjson PRIVATE -w -O2)

# libuv (third_party/libuv, the source list of zn-sources.txt): the event loop of the host (timers, child processes, IO)
file(STRINGS third_party/libuv/zn-sources.txt ZN_UV_LINES)
set(ZN_UV_SOURCES "")
set(ZN_UV_SECTION "")
foreach(line IN LISTS ZN_UV_LINES)
  if(line MATCHES "^#" OR line STREQUAL "")
    continue()
  elseif(line MATCHES "^\\[(.*)\\]$")
    set(ZN_UV_SECTION "${CMAKE_MATCH_1}")
  elseif((ZN_UV_SECTION STREQUAL "common")
      OR (ZN_UV_SECTION STREQUAL "unix" AND NOT WIN32)
      OR (ZN_UV_SECTION STREQUAL "darwin" AND APPLE)
      OR (ZN_UV_SECTION STREQUAL "linux" AND (CMAKE_SYSTEM_NAME STREQUAL "Linux" OR ANDROID))
      OR (ZN_UV_SECTION STREQUAL "win" AND WIN32))
    list(APPEND ZN_UV_SOURCES third_party/libuv/${line})
  endif()
endforeach()
# llhttp (third_party/llhttp): the HTTP/1.1 parser of zinc:net
add_library(zn_llhttp STATIC third_party/llhttp/src/api.c third_party/llhttp/src/http.c third_party/llhttp/src/llhttp.c)
target_include_directories(zn_llhttp PUBLIC third_party/llhttp/include)

# mbedTLS 4.0.0 with TF-PSA-Crypto (third_party/mbedtls): TLS 1.2/1.3 and the PSA crypto API (zinc:net https, zinc:mqtt over TLS, crypto.subtle). Our own build: no CMake of the library.
option(ZN_TLS "link mbedTLS: https, TLS for zinc:mqtt, crypto.subtle (off: smaller binary, those report an error)" ON)
file(GLOB ZN_MBEDTLS_SOURCES third_party/mbedtls/library/*.c third_party/mbedtls/tf-psa-crypto/core/*.c third_party/mbedtls/tf-psa-crypto/drivers/builtin/src/*.c)
if(NOT ZN_TLS)
  set(ZN_MBEDTLS_SOURCES third_party/mbedtls/library/version.c)   # an empty library keeps the target names
endif()
add_library(zn_mbedtls STATIC ${ZN_MBEDTLS_SOURCES})
target_include_directories(zn_mbedtls PUBLIC third_party/mbedtls/include third_party/mbedtls/tf-psa-crypto/include third_party/mbedtls/tf-psa-crypto/drivers/builtin/include
  PRIVATE third_party/mbedtls/library third_party/mbedtls/tf-psa-crypto/core third_party/mbedtls/tf-psa-crypto/drivers/builtin/src)
set_target_properties(zn_mbedtls PROPERTIES C_STANDARD 99 POSITION_INDEPENDENT_CODE ON)
target_compile_options(zn_mbedtls PRIVATE -w -O2)
if(WIN32)
  target_link_libraries(zn_mbedtls PUBLIC bcrypt)   # the PSA entropy source: BCryptGenRandom
endif()

add_library(zn_uv STATIC ${ZN_UV_SOURCES})
target_include_directories(zn_uv PUBLIC third_party/libuv/include PRIVATE third_party/libuv/src)
target_compile_definitions(zn_uv PRIVATE _FILE_OFFSET_BITS=64 _LARGEFILE_SOURCE)
if(APPLE)
  target_compile_definitions(zn_uv PRIVATE _DARWIN_UNLIMITED_SELECT=1 _DARWIN_USE_64_BIT_INODE=1)
elseif(CMAKE_SYSTEM_NAME STREQUAL "Linux")
  target_compile_definitions(zn_uv PRIVATE _GNU_SOURCE _POSIX_C_SOURCE=200112)
  target_sources(zn_uv PRIVATE src/host/glibc_compat.c)   # what an old glibc lacks (webOS 3: 2.8); empty on a current one
  target_link_libraries(zn_uv PUBLIC dl rt)
elseif(WIN32)   # Windows (cmake/zig-windows.cmake): libuv's win back end, the Winsock sip stack and the session's environment
  target_sources(zn_uv PRIVATE src/host/win_sync_shim.c)          # the wait-on-address calls of libuv's win back end: no libsynchronization in zig's mingw
  target_link_libraries(zn_uv PUBLIC ws2_32 iphlpapi psapi userenv dbghelp ole32 uuid)
elseif(ANDROID)   # bionic: libuv's linux sources, dlopen in libdl, clock_gettime in libc (ZN-622)
  # posix_spawn is in bionic since API 28: declared weak below it (the NDK's mechanism); an app never spawns (ZN_APP_LIBRARY) and the linker drops uv_spawn
  target_compile_definitions(zn_uv PRIVATE _GNU_SOURCE __ANDROID_UNAVAILABLE_SYMBOLS_ARE_WEAK__)
  target_link_libraries(zn_uv PUBLIC dl)
endif()
find_package(Threads REQUIRED)
target_link_libraries(zn_uv PUBLIC Threads::Threads)
set_target_properties(zn_llhttp PROPERTIES C_STANDARD 11 POSITION_INDEPENDENT_CODE ON)
target_compile_options(zn_llhttp PRIVATE -w -O2)
set_target_properties(zn_uv PROPERTIES C_STANDARD 11 POSITION_INDEPENDENT_CODE ON)
target_compile_options(zn_uv PRIVATE -fno-strict-aliasing -w -O2)

# The native-module ABI (ZN-096): the registry, which the frontend (Z5011), the runtime (CallNative) and the tests use
add_library(zn_native STATIC src/rt/native.cpp)
target_include_directories(zn_native PUBLIC include)
find_package(Threads REQUIRED)
target_link_libraries(zn_native PUBLIC Threads::Threads)

# The operating-system calls of the command line and its tools (processes, shared libraries, file stamps, sockets), POSIX or Win32: src/platform/platform.h
add_library(zn_platform STATIC src/platform/platform.cpp)
target_include_directories(zn_platform PUBLIC src)
if(WIN32)
  target_link_libraries(zn_platform PUBLIC ws2_32 psapi)
endif()

# The languages of the tooling (D159, src/i18n/i18n.h): English, the source, is compiled in from i18n/en/*.json (a change reconfigures);
# the other languages are read from i18n/ beside the engine at run time
foreach(_area cli diag)
  file(READ ${CMAKE_CURRENT_SOURCE_DIR}/i18n/en/${_area}.json ZN_I18N_EN_${_area})
  set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/i18n/en/${_area}.json)
endforeach()
configure_file(src/i18n/en.inc.in ${CMAKE_CURRENT_BINARY_DIR}/gen/i18n/en.inc @ONLY)
add_library(zn_i18n STATIC src/i18n/i18n.cpp)
target_include_directories(zn_i18n PUBLIC src PRIVATE ${CMAKE_CURRENT_BINARY_DIR}/gen/i18n)
target_link_libraries(zn_i18n PRIVATE zn_yyjson ${CMAKE_DL_LIBS})

add_library(zn_frontend STATIC src/frontend/plugin_manifest.cpp src/frontend/tsconfig.cpp src/frontend/resolve.cpp src/frontend/project.cpp src/frontend/lexer.cpp src/frontend/parser.cpp src/frontend/diagnostics.cpp src/frontend/check.cpp src/frontend/modules.cpp src/frontend/inspect.cpp src/frontend/snippet.cpp src/frontend/desugar.cpp src/frontend/dyn.cpp src/frontend/jsx.cpp src/frontend/native_gen.cpp src/frontend/profile.cpp src/frontend/capabilities.cpp)
target_include_directories(zn_frontend PUBLIC include src)
target_link_libraries(zn_frontend PUBLIC zn_yyjson zn_native zn_i18n)   # the diagnostics speak the person's language (D159)

add_library(zn_ir STATIC src/ir/ir.cpp src/ir/parse.cpp src/ir/lower.cpp src/ir/rc.cpp src/ir/opt.cpp)
target_link_libraries(zn_ir PUBLIC zn_frontend)

add_library(zn_zbc STATIC src/zbc/zbc.cpp src/zbc/emit.cpp)
target_link_libraries(zn_zbc PUBLIC zn_ir)
target_include_directories(zn_zbc PUBLIC include src)

# mimalloc (third_party/): the runtime allocates many small objects; it also serves global operator new/delete.
add_library(zn_mimalloc STATIC third_party/mimalloc/src/static.c)
target_include_directories(zn_mimalloc PUBLIC third_party/mimalloc/include)
target_compile_definitions(zn_mimalloc PRIVATE MI_STATIC_LIB MI_SKIP_COLLECT_ON_EXIT)   # no purge of the heap at exit: the process ends anyway (ZN-592.06)
set_target_properties(zn_mimalloc PROPERTIES C_STANDARD 11 POSITION_INDEPENDENT_CODE ON)
target_compile_options(zn_mimalloc PRIVATE -w -O2)

add_library(zn_rt STATIC src/rt/machine.cpp src/rt/rtcalls.cpp src/rt/program.cpp src/rt/unicode.cpp)
target_link_libraries(zn_rt PUBLIC zn_zbc zn_mimalloc zn_regexp)   # libunicode: case mapping, normalization, collation
if(ZN_SANITIZE)
  target_compile_definitions(zn_rt PUBLIC ZN_NO_MIMALLOC)   # keep ASan's own allocator checks
else()
  target_sources(zn_rt PRIVATE src/rt/alloc.cpp)            # the heap budget (mimalloc serves the runtime's objects)
  add_library(zn_rt_new STATIC src/rt/alloc_new.cpp)        # mimalloc serves global operator new/delete: a separate archive, linked into compiled programs only when they need the budget (ZN-146)
  target_include_directories(zn_rt_new PUBLIC include src PRIVATE third_party/mimalloc/include)
  set_target_properties(zn_rt_new PROPERTIES CXX_STANDARD 20 POSITION_INDEPENDENT_CODE ON)
  target_link_libraries(zn_rt_new PUBLIC zn_rt zn_mimalloc)
  # not in zinc either (ZN-592): replacing the global operators made dyld patch libc++'s uses in the shared cache at every launch, 8 ms of the
  # 29 before main on the Intel Mac; the objects' containers count through ObjAlloc, so the heap budget does not need them
endif()

add_library(zn_vm STATIC src/vm/vm.cpp)
target_link_libraries(zn_vm PUBLIC zn_rt)

add_library(zn_aot STATIC src/aot/aot.cpp)
target_link_libraries(zn_aot PUBLIC zn_zbc)

# The graphics host (ZN-027): the existing runtime (runtime/: zrt, raster, gfx) behind the zn::host::Gfx table, headless.
# Built with the runtime's own flags so its pixels match the old builds. Off where the runtime does not build.
if(ANDROID)
  set(ZN_PLATFORM_NAME android)
elseif(CMAKE_SYSTEM_NAME STREQUAL "iOS")   # APPLE is true there too: Cocoa and OpenGL code is guarded by Darwin (macOS), not by APPLE
  set(ZN_PLATFORM_NAME ios)
elseif(CMAKE_SYSTEM_NAME STREQUAL "Linux")
  set(ZN_PLATFORM_NAME linux)
elseif(WIN32)
  set(ZN_PLATFORM_NAME windows)
else()
  set(ZN_PLATFORM_NAME macos)
endif()
option(ZN_HOST_GFX "link the graphics host (zinc:gfx)" ON)
set(ZN_RUNTIME_DIR ${CMAKE_CURRENT_SOURCE_DIR}/runtime)
if(ZN_HOST_GFX AND EXISTS ${ZN_RUNTIME_DIR}/gfx.cpp)
  set(ZN_HAL_PLATFORM ${CMAKE_CURRENT_SOURCE_DIR}/targets/common/hal_posix.cpp)
  if(WIN32)   # docs/targets/windows.md: targets/windows/hal_windows.cpp, the Win32 stand-in
    set(ZN_HAL_PLATFORM ${CMAKE_CURRENT_SOURCE_DIR}/targets/windows/hal_windows.cpp)
  endif()
  add_library(zn_host_gfx STATIC src/host/loop.cpp src/host/osc.cpp src/host/mqtt.cpp src/host/netlog.cpp src/host/http.cpp src/host/tls.cpp src/host/crypto.cpp src/host/regexp.cpp src/host/sock.cpp src/host/sys_host.cpp src/host/assets_host.cpp src/host/permissions.cpp src/host/gfx_host.cpp src/host/ui_log.cpp src/host/render_bench.cpp src/host/backend_sw.cpp src/host/resources.cpp src/host/splash.cpp src/host/mirror.cpp
    ${ZN_RUNTIME_DIR}/zrt.cpp ${ZN_RUNTIME_DIR}/host.cpp ${ZN_RUNTIME_DIR}/raster.cpp ${ZN_RUNTIME_DIR}/ttf.cpp ${ZN_RUNTIME_DIR}/gfx.cpp
    src/host/hal_dispatch.cpp ${CMAKE_CURRENT_SOURCE_DIR}/targets/null/hal_null.cpp ${ZN_HAL_PLATFORM})
  # the headless and the window HAL live in one binary: their hal_* functions are renamed, src/host/hal_dispatch.cpp picks one at run time
  set(ZN_HAL_FUNCS init shutdown frame_begin frame_end poll_input present surface_size fixed_dt)
  set(ZN_NULL_DEFS "")
  foreach(f ${ZN_HAL_FUNCS})
    list(APPEND ZN_NULL_DEFS "hal_${f}=null_hal_${f}")
  endforeach()
  set_source_files_properties(${CMAKE_CURRENT_SOURCE_DIR}/targets/null/hal_null.cpp PROPERTIES COMPILE_DEFINITIONS "${ZN_NULL_DEFS}")
  # SDL3 is built from third_party/SDL3 (3.4.16) and linked statically: no dylib to ship (ZN-118). -DZN_SDL_VENDORED=OFF uses an installed SDL3 instead.
  option(ZN_SDL_VENDORED "build the vendored SDL3 statically" ON)
  if(ZN_SDL_VENDORED AND EXISTS ${CMAKE_CURRENT_SOURCE_DIR}/third_party/SDL3/CMakeLists.txt)
    set(SDL_SHARED OFF CACHE BOOL "" FORCE)
    set(SDL_STATIC ON CACHE BOOL "" FORCE)
    set(SDL_TESTS OFF CACHE BOOL "" FORCE)
    set(SDL_TEST_LIBRARY OFF CACHE BOOL "" FORCE)
    set(SDL_INSTALL OFF CACHE BOOL "" FORCE)
    set(SDL_EXAMPLES OFF CACHE BOOL "" FORCE)
    foreach(sub AUDIO CAMERA GPU HAPTIC SENSOR POWER DIALOG TRAY VULKAN RENDER_D3D RENDER_D3D11 RENDER_D3D12 DIRECTX)   # what the HAL does not use: video, events, clipboard, touch, pen, GL, and for gamepads joysticks with HIDAPI, as SDL builds them by default (ZN-574); the Direct3D render drivers are Windows-only and not vendored (docs/targets/windows.md)
      set(SDL_${sub} OFF CACHE BOOL "" FORCE)
    endforeach()
    foreach(sub JOYSTICK HIDAPI VIRTUAL_JOYSTICK)   # forced on: a build directory older than ZN-574 has them cached off
      set(SDL_${sub} ON CACHE BOOL "" FORCE)
    endforeach()
    add_subdirectory(third_party/SDL3 EXCLUDE_FROM_ALL)
    target_compile_options(SDL3-static PRIVATE -w)   # vendored code: its warnings are not ours
    target_compile_definitions(SDL3-static PRIVATE ZN_SDL_NO_DYNAPI)   # no dynamic API table (src/dynapi/SDL_dynapi.h, patched): unused SDL code is dead-stripped (ZN-604)
    if(ZN_LINUX_GLIBC AND ZN_LINUX_GLIBC VERSION_LESS 2.34 AND CMAKE_SIZEOF_VOID_P EQUAL 4)   # cmake/zig-linux.cmake on 32 bits: the 64-bit time
      target_compile_options(SDL3-static PRIVATE -U_TIME_BITS)   # functions SDL asks for came with glibc 2.34; its clocks are monotonic, 2038 does not concern them
    endif()
    set(SDL3_FOUND TRUE)
    set(ZN_SDL_VENDORED_BUILD TRUE)
  else()
    if(NOT CMAKE_CROSSCOMPILING)   # a cross build (tools/cross-libs) never links the SDL3 of the machine it runs on
      find_package(SDL3 CONFIG QUIET)
    endif()
  endif()
  if(SDL3_FOUND)
    set(ZN_SDL_FUNCS init shutdown frame_begin frame_end poll_input present surface_size fixed_dt text_input clipboard_get clipboard_set set_cursor escape_by_app escape pixel_scale window_handle
      win_open win_close win_state win_input win_present win_current)
    set(ZN_SDL_DEFS "")
    foreach(f ${ZN_SDL_FUNCS})
      list(APPEND ZN_SDL_DEFS "hal_${f}=sdl_hal_${f}")
    endforeach()
    # The window host: the SDL HAL, linked into zn_host_gfx, or (ZN_WINDOW_MODULE, macOS) kept out of zinc: compiled programs link the
    # static zn_host_window, zinc loads the module libzn_window (with SDL3 and the GUI frameworks) at the first window (ZN-592.01)
    set(ZN_WINDOW_SRC ${CMAKE_CURRENT_SOURCE_DIR}/targets/macos/hal_sdl.cpp)
    if(CMAKE_SYSTEM_NAME STREQUAL "Darwin")
      list(APPEND ZN_WINDOW_SRC ${CMAKE_CURRENT_SOURCE_DIR}/targets/macos/hal_cocoa.mm)
    endif()
    if(CMAKE_SYSTEM_NAME MATCHES "^(Darwin|iOS)$")   # the Metal present of the software raster (ZN-627; the macOS window's default, ZN-764)
      list(APPEND ZN_WINDOW_SRC ${CMAKE_CURRENT_SOURCE_DIR}/targets/macos/hal_metal.mm)
      set_source_files_properties(${CMAKE_CURRENT_SOURCE_DIR}/targets/macos/hal_metal.mm PROPERTIES COMPILE_OPTIONS "-fobjc-arc")
    endif()
    option(ZN_WINDOW_MODULE "zinc loads the window host from libzn_window at the first window instead of linking SDL3 and the GUI frameworks (macOS)" ${APPLE})
    if(ZN_WINDOW_MODULE)
      add_library(zn_host_window STATIC ${ZN_WINDOW_SRC})
      add_library(zn_window MODULE ${ZN_WINDOW_SRC})
      set(ZN_WINDOW_TARGETS zn_host_window zn_window)
      set(ZN_WINDOW_LIBS zn_host_window zn_window)
      list(APPEND ZN_SDL_DEFS ZN_WINDOW_SEPARATE)
      target_compile_definitions(zn_host_gfx PRIVATE ZN_WINDOW_SEPARATE)   # hal_dispatch.cpp's stand-ins for a program without window (ZN-592.06)
    else()
      target_sources(zn_host_gfx PRIVATE ${ZN_WINDOW_SRC})
      set(ZN_WINDOW_TARGETS zn_host_gfx)
    endif()
    if(CMAKE_SYSTEM_NAME STREQUAL "Darwin")   # the Cocoa piece of the transparent window (ZN-249); the window presents with OpenGL and replays the command lists (ZN-412.02)
      list(APPEND ZN_SDL_DEFS ZN_HAL_GL GL_SILENCE_DEPRECATION)
      foreach(t ${ZN_WINDOW_TARGETS})
        target_link_libraries(${t} PUBLIC "-framework OpenGL")
      endforeach()
      set_source_files_properties(${CMAKE_CURRENT_SOURCE_DIR}/targets/macos/hal_cocoa.mm PROPERTIES COMPILE_OPTIONS "-fobjc-arc;-w")
    elseif(CMAKE_SYSTEM_NAME STREQUAL "Linux")   # Linux (ZN-412.06): GL functions loaded through SDL into a private table (glad's header), no libGL link
      list(APPEND ZN_SDL_DEFS ZN_HAL_GL)
      foreach(t ${ZN_WINDOW_TARGETS})
        target_include_directories(${t} PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/third_party/glad/include)
      endforeach()
    elseif(WIN32)   # Windows (docs/reports/zinc-windows-port.md): the same WGL path through SDL, glad's table
      list(APPEND ZN_SDL_DEFS ZN_HAL_GL)
      foreach(t ${ZN_WINDOW_TARGETS})
        target_include_directories(${t} PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/third_party/glad/include)
      endforeach()
    elseif(ANDROID)   # Android (ZN-622): OpenGL ES 2 and the replay's GLES 2 path, libGLESv2 linked; ZINC_RENDERER=cpu keeps SDL_Renderer
      list(APPEND ZN_SDL_DEFS ZN_HAL_GL)
      foreach(t ${ZN_WINDOW_TARGETS})
        target_link_libraries(${t} PUBLIC GLESv2)
      endforeach()
    endif()
    set_source_files_properties(${CMAKE_CURRENT_SOURCE_DIR}/targets/macos/hal_sdl.cpp PROPERTIES COMPILE_DEFINITIONS "${ZN_SDL_DEFS}")
    target_compile_definitions(zn_host_gfx PRIVATE ZN_HOST_SDL)
    if(ZN_WINDOW_MODULE)
      target_link_libraries(zn_host_window PUBLIC SDL3::SDL3)
      target_include_directories(zn_window PRIVATE $<TARGET_PROPERTY:SDL3::SDL3,INTERFACE_INCLUDE_DIRECTORIES>)
      set_target_properties(zn_window PROPERTIES PREFIX "lib" SUFFIX ".dylib" LIBRARY_OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR})
      # zrt, the HAL helpers and hal_env come from zinc (ENABLE_EXPORTS); SDL3 is all here, for the display drivers, zinc:3d and libzn_webgl
      # that resolve it from this module (loaded RTLD_GLOBAL before them)
      target_link_options(zn_window PRIVATE "LINKER:-undefined,dynamic_lookup")
      if(ZN_SDL_VENDORED_BUILD)
        target_link_libraries(zn_window PRIVATE "-Wl,-force_load,${CMAKE_CURRENT_BINARY_DIR}/third_party/SDL3/libSDL3.a")
        add_dependencies(zn_window SDL3-static)
        foreach(fw Cocoa CoreMedia CoreVideo IOKit Carbon Foundation Metal QuartzCore AppKit CoreFoundation CoreGraphics CoreServices UniformTypeIdentifiers GameController CoreHaptics ForceFeedback)
          target_link_libraries(zn_window PRIVATE "-framework ${fw}")
        endforeach()
        target_link_libraries(zn_window PRIVATE objc)
      else()
        target_link_libraries(zn_window PRIVATE SDL3::SDL3)
      endif()
    else()
      target_link_libraries(zn_host_gfx PUBLIC SDL3::SDL3)
    endif()
    if(ZN_SDL_VENDORED_BUILD)
      set(ZN_SDL_LIB "${CMAKE_CURRENT_BINARY_DIR}/third_party/SDL3/libSDL3.a")
      set(ZN_SDL_LIB_LINE "'@bin@/third_party/SDL3/libSDL3.a'")   # beside zinc in the build tree, written relative to it (ZN-333)
      set(ZN_SDL_INC "${CMAKE_CURRENT_SOURCE_DIR}/third_party/SDL3/include")
    else()
      get_target_property(ZN_SDL_LIB SDL3::SDL3 LOCATION)
      get_target_property(ZN_SDL_INC SDL3::SDL3 INTERFACE_INCLUDE_DIRECTORIES)
    endif()
    message(STATUS "zinc: window support through SDL3 (${ZN_SDL_LIB})")
  else()
    message(STATUS "zinc: SDL3 not found, apps run headless only")
  endif()
  target_link_libraries(zn_host_gfx PUBLIC zn_uv zn_llhttp zn_mbedtls zn_regexp zn_codec zn_zpk)   # zn_zpk: the packs of zinc:assets (ZN-436)
  if(WIN32)
    target_link_libraries(zn_host_gfx PUBLIC crypt32)   # the system's certificate store (src/host/tls.cpp)
  endif()
  target_include_directories(zn_host_gfx PRIVATE third_party/bcdec third_party/etcdec)   # the CPU decoders of compressed textures (ZN-439)
  if(NOT ZN_TLS)
    target_compile_definitions(zn_host_gfx PRIVATE ZN_NO_TLS)
  endif()
  foreach(t zn_host_gfx ${ZN_WINDOW_LIBS})   # the window host is compiled as the rest of the runtime: the same zrt layouts
    set_target_properties(${t} PROPERTIES CXX_STANDARD 17 CXX_STANDARD_REQUIRED ON CXX_EXTENSIONS OFF)
    target_include_directories(${t} PUBLIC include PRIVATE ${ZN_RUNTIME_DIR} ${ZN_RUNTIME_DIR}/include)
    target_compile_options(${t} PRIVATE -fno-exceptions -fno-rtti -fwrapv -ffp-contract=off -fno-threadsafe-statics -O2 -w)
    target_compile_definitions(${t} PRIVATE ZRT_HEAP_BYTES=536870912u ZRT_PLATFORM="${ZN_PLATFORM_NAME}" ZRT_POINT_POOL=262144 ZRT_GROW_DRAW_CMDS)
  endforeach()
endif()

# libwebp 1.5.0 (BSD-3): decoder and encoder of .webp assets and captures (ZN-226); no demux/mux. The SIMD files compile to nothing unless the compiler targets their instruction set.
file(GLOB ZN_WEBP_SRC third_party/libwebp/src/dec/*.c third_party/libwebp/src/dsp/*.c third_party/libwebp/src/enc/*.c third_party/libwebp/src/utils/*.c third_party/libwebp/sharpyuv/*.c)
add_library(zn_webp STATIC ${ZN_WEBP_SRC})
target_include_directories(zn_webp PUBLIC third_party/libwebp third_party/libwebp/src)
set_target_properties(zn_webp PROPERTIES C_STANDARD 99 POSITION_INDEPENDENT_CODE ON)
target_compile_options(zn_webp PRIVATE -w -O2)
add_library(zn_res STATIC src/res/res.cpp)
add_library(zn_codec STATIC src/res/codec.cpp)   # encoders (stb_image_write); screenshots and zinc capture use it
target_include_directories(zn_codec PUBLIC src PRIVATE third_party/stb)
set_target_properties(zn_codec PROPERTIES CXX_STANDARD 20 POSITION_INDEPENDENT_CODE ON)
target_compile_options(zn_codec PRIVATE -w -O2)
target_include_directories(zn_res PUBLIC include src PRIVATE third_party/stb)
# the baker subsets the TrueType files it embeds to the characters a program can show (ZN-428): hb-subset, CLI only (programs link zn_host_gfx, not zn_res)
add_library(zn_hb_subset STATIC third_party/harfbuzz/src/zn-harfbuzz-subset.cc)
target_include_directories(zn_hb_subset PUBLIC third_party/harfbuzz/src)
set_target_properties(zn_hb_subset PROPERTIES CXX_STANDARD 17 POSITION_INDEPENDENT_CODE ON)
target_compile_options(zn_hb_subset PRIVATE -w -O2 -fno-exceptions -fno-rtti -DHB_NO_MT)
target_link_libraries(zn_hb_subset PUBLIC zn_harfbuzz)
target_link_libraries(zn_res PUBLIC zn_webp zn_rt zn_hb_subset)   # zn::uni (case maps of the baked glyphs)

add_library(zn_dev STATIC src/dev/core.cpp src/dev/client.cpp)
target_include_directories(zn_dev PUBLIC include src)
target_link_libraries(zn_dev PUBLIC zn_platform zn_vm)

# QR codes (ZN-631): Nayuki's encoder for the code zinc dev --lan prints (MIT), quirc's decoder for camera frames (ISC; plugins/camera compiles it too)
add_library(zn_qrcodegen STATIC third_party/qrcodegen/qrcodegen.c)
target_include_directories(zn_qrcodegen PUBLIC third_party/qrcodegen)
set_target_properties(zn_qrcodegen PROPERTIES C_STANDARD 99 POSITION_INDEPENDENT_CODE ON)
target_compile_options(zn_qrcodegen PRIVATE -w -O2)
set(ZN_QUIRC ${CMAKE_CURRENT_SOURCE_DIR}/plugins/camera/vendor/quirc)   # vendored by the camera plugin, which compiles it for every target
add_library(zn_quirc STATIC ${ZN_QUIRC}/quirc.c ${ZN_QUIRC}/decode.c ${ZN_QUIRC}/identify.c ${ZN_QUIRC}/version_db.c)
target_include_directories(zn_quirc PUBLIC ${ZN_QUIRC})
set_target_properties(zn_quirc PROPERTIES C_STANDARD 99 POSITION_INDEPENDENT_CODE ON)
target_compile_options(zn_quirc PRIVATE -w -O2)
add_executable(qr_test tests/native/qr_test.cpp)   # the encoder's codes, drawn at several scales, read back by the decoder (tests/t0/qr_code.sh)
target_link_libraries(qr_test PRIVATE zn_qrcodegen zn_quirc)
target_include_directories(qr_test PRIVATE third_party)
target_compile_options(qr_test PRIVATE -w)   # stb_image_write.h

# SHA-256 (third_party/sha256, public domain): toolchain downloads, .zapp members, ZPK entries
add_library(zn_sha256 STATIC third_party/sha256/sha256.c)
target_include_directories(zn_sha256 PUBLIC third_party/sha256)
target_compile_options(zn_sha256 PRIVATE -w)

# lz4 1.10.0 (lib/ only, BSD-2) and zstd 1.5.7 (BSD-3): the codecs of ZPK packs (ZN-433, docs/zpk.md). zstd's compressor and dictionary builder,
# lz4hc and the pack writer are archive members of their own, linked only where packs are written (lz4.c holds both directions of lz4).
add_library(zn_lz4 STATIC third_party/lz4/lz4.c third_party/lz4/lz4hc.c)
target_include_directories(zn_lz4 PUBLIC third_party/lz4)
set_target_properties(zn_lz4 PROPERTIES C_STANDARD 99 POSITION_INDEPENDENT_CODE ON)
target_compile_options(zn_lz4 PRIVATE -w -O2)
file(GLOB ZN_ZSTD_SRC third_party/zstd/common/*.c third_party/zstd/decompress/*.c third_party/zstd/compress/*.c third_party/zstd/dictBuilder/*.c)
add_library(zn_zstd STATIC ${ZN_ZSTD_SRC})
target_include_directories(zn_zstd PUBLIC third_party/zstd)
target_compile_definitions(zn_zstd PRIVATE ZSTD_DISABLE_ASM)   # the C Huffman loop: no assembler file to build per target (zig, wasm)
set_target_properties(zn_zstd PROPERTIES C_STANDARD 99 POSITION_INDEPENDENT_CODE ON)
target_compile_options(zn_zstd PRIVATE -w -O2)
add_library(zn_zpk STATIC src/zpk/zpk.cpp src/zpk/write.cpp)
target_include_directories(zn_zpk PUBLIC src include)   # include: zn/limits.h
target_link_libraries(zn_zpk PUBLIC zn_lz4 zn_zstd zn_sha256)
add_executable(zpk_test tests/unit/zpk_test.cpp)
target_link_libraries(zpk_test PRIVATE zn_zpk)
# the GL replay's capability record and tuning table (ZN-741, D119): driver strings in, no GL, nothing of the runtime linked
add_executable(gl_caps_test tests/native/gl_caps.cpp)
target_include_directories(gl_caps_test PRIVATE runtime)
# the asset build (ZN-434): importers, the content-addressed cache (xxHash 0.8.4, header only), groups to packs; CLI only
# sprites and atlases (ZN-438): stb_rect_pack 1.01 packs the pages, cute_aseprite 1.04 reads .aseprite files, yyjson the JSON sheets; tile maps
# (ZN-443): yyjson reads Tiled and LDtk JSON, stb_image (zn_res) and zstd (zn_zpk) decompress their layers; textures (ZN-439): stb_image_resize2
# 2.18 makes the mipmaps, basisu (a pinned tool, src/tc) encodes the block formats; models (ZN-441): gltfpack (a pinned tool) processes them, cgltf 1.15
# reads its output for the .zmesh of zinc:3d; worlds (src/assets/world.h): cgltf reads the scenes, meshoptimizer 1.3 simplifies their levels
add_library(zn_assets STATIC src/assets/assets.cpp src/assets/sprite.cpp src/assets/tilemap.cpp src/assets/texture.cpp src/assets/model.cpp src/assets/world.cpp src/assets/cook.cpp src/assets/console_tex.cpp third_party/rg_etc1/rg_etc1.cpp)
target_include_directories(zn_assets PUBLIC src PRIVATE third_party/xxhash third_party/stb third_party/cute_aseprite third_party/cgltf third_party/meshoptimizer third_party/rg_etc1)
target_link_libraries(zn_assets PUBLIC zn_platform zn_zpk zn_res zn_meshopt PRIVATE zn_yyjson zn_codec)   # zn_codec: the PNG levels basisu reads (ZN-439)
add_executable(assets_test tests/unit/assets_test.cpp)
target_link_libraries(assets_test PRIVATE zn_assets)
add_executable(project_test tests/unit/project_test.cpp)   # zinc.json's game keys (ZN-435)
target_link_libraries(project_test PRIVATE zn_frontend)

# The version zinc reports (zinc --version, the .zapp stamps, zinc update): -DZN_VERSION, else git describe of the checkout (v0.1.1-46-g9e97 -> 0.1.1+46.g9e97),
# else 0.0.0-dev; read at configure time. The release key: -DZN_UPDATE_PUBKEY, else update.pub (all zeros: the placeholder, no key).
set(ZN_VERSION "" CACHE STRING "the version zinc reports (empty: git describe)")
set(ZN_UPDATE_PUBKEY "" CACHE STRING "hex Ed25519 public key of the release update manifests (empty: update.pub)")
set(_zn_version "${ZN_VERSION}")
if(NOT _zn_version)
  execute_process(COMMAND git describe --tags --match "v[0-9]*" WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}" OUTPUT_VARIABLE _zn_describe OUTPUT_STRIP_TRAILING_WHITESPACE ERROR_QUIET RESULT_VARIABLE _zn_rc)
  if(_zn_rc EQUAL 0 AND _zn_describe MATCHES "^v[0-9]")
    string(REGEX REPLACE "^v" "" _zn_version "${_zn_describe}")
    string(REGEX REPLACE "-([0-9]+)-g([0-9a-f]+)$" "+\\1.g\\2" _zn_version "${_zn_version}")
  else()
    set(_zn_version "0.0.0-dev")
  endif()
endif()
set(_zn_pubkey "${ZN_UPDATE_PUBKEY}")
if(NOT _zn_pubkey AND EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/update.pub")
  file(STRINGS "${CMAKE_CURRENT_SOURCE_DIR}/update.pub" _zn_pubkey LIMIT_COUNT 1)
  set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/update.pub")
endif()
if(_zn_pubkey MATCHES "^0+$")
  set(_zn_pubkey "")
elseif(_zn_pubkey AND NOT _zn_pubkey MATCHES "^[0-9a-f]+$")
  message(FATAL_ERROR "ZN_UPDATE_PUBKEY / update.pub: 64 lowercase hex digits (zinc update-keygen, zinc update-pubkey <seed>)")
endif()
string(LENGTH "${_zn_pubkey}" _zn_len)
if(_zn_pubkey AND NOT _zn_len EQUAL 64)
  message(FATAL_ERROR "ZN_UPDATE_PUBKEY / update.pub: 64 hex digits, not ${_zn_len}")
endif()
message(STATUS "zinc ${_zn_version}, update key: ${_zn_pubkey}")
set_source_files_properties(src/tc/selfupdate.cpp PROPERTIES COMPILE_DEFINITIONS "ZN_VERSION=\"${_zn_version}\";ZN_UPDATE_PUBKEY=\"${_zn_pubkey}\"")
add_library(zn_tc STATIC src/tc/tc.cpp src/tc/consoles.cpp src/tc/selfupdate.cpp src/tc/engines.cpp src/tc/plugin_build.cpp src/tc/bundle.cpp src/tc/tuf.cpp src/tc/tlog.cpp src/tc/policy.cpp src/zapp.cpp third_party/monocypher/monocypher.c third_party/monocypher/monocypher-ed25519.c)   # monocypher: Ed25519 for signed update manifests (ZN-149)
target_include_directories(zn_tc PUBLIC src PRIVATE third_party/monocypher)
target_sources(zn_tc PRIVATE src/tc/progress.cpp)
target_link_libraries(zn_tc PUBLIC zn_platform zn_frontend zn_sha256 zn_i18n ${CMAKE_DL_LIBS})
if(APPLE)
  # src/tc/bundle.cpp opens CoreFoundation at its call (not linked: ~400 framework initializers at each launch, ZN-592.01)
endif()
if(ZN_SDL_LIB AND NOT ZN_SDL_INC)   # a prefix install does not name its include directory: it is beside the library
  get_filename_component(ZN_SDL_LIBDIR "${ZN_SDL_LIB}" DIRECTORY)
  if(EXISTS "${ZN_SDL_LIBDIR}/../include/SDL3/SDL.h")
    set(ZN_SDL_INC "${ZN_SDL_LIBDIR}/../include")
  endif()
endif()
if(ZN_SDL_INC)
  list(GET ZN_SDL_INC 0 ZN_SDL_INC0)
  string(REPLACE "${CMAKE_CURRENT_SOURCE_DIR}" "@root@" ZN_SDL_INC0 "${ZN_SDL_INC0}")   # the vendored headers, relative to the engine files (ZN-333)
  target_compile_definitions(zn_tc PRIVATE ZN_SDL_INCLUDE="${ZN_SDL_INC0}")   # the display drivers' emulator windows include <SDL3/SDL.h>
endif()
set_source_files_properties(third_party/monocypher/monocypher.c third_party/monocypher/monocypher-ed25519.c PROPERTIES COMPILE_OPTIONS "-w")

add_library(zn_prof STATIC src/prof/prof.cpp)
target_link_libraries(zn_prof PUBLIC zn_platform zn_vm)
add_library(zn_dbg STATIC src/dbg/dbg.cpp src/dbg/eval.cpp src/dbg/dap.cpp src/dbg/cdp.cpp)   # zinc debug (ZN-371.01), --dap (ZN-371.02), --cdp (ZN-371.04)
target_link_libraries(zn_dbg PUBLIC zn_platform zn_vm)
if(ZN_TLS)   # the CDP server's WebSocket handshake takes SHA-1 and base64 from mbedTLS
  target_sources(zn_dbg PRIVATE src/dbg/ws.cpp)
  target_compile_definitions(zn_dbg PRIVATE ZN_DBG_CDP=1)
  target_link_libraries(zn_dbg PRIVATE zn_mbedtls)
endif()

# QuickJS-ng (third_party/): the second engine of ZN-051, plain JavaScript and stripped TypeScript behind the same host calls.
# libregexp and libunicode are their own library (the regular expressions of Zinc programs link only these); QuickJS-ng links the same copy.
add_library(zn_regexp STATIC third_party/quickjs-ng/libregexp.c third_party/quickjs-ng/libunicode.c src/host/lre_host.c)
target_include_directories(zn_regexp PUBLIC third_party/quickjs-ng)
set_target_properties(zn_regexp PROPERTIES C_STANDARD 11 POSITION_INDEPENDENT_CODE ON)
target_compile_options(zn_regexp PRIVATE -w -O2)
add_library(zn_quickjs STATIC third_party/quickjs-ng/quickjs.c third_party/quickjs-ng/dtoa.c)
target_include_directories(zn_quickjs PUBLIC third_party/quickjs-ng)
target_compile_definitions(zn_quickjs PRIVATE QUICKJS_NG_BUILD lre_check_stack_overflow=qjs_lre_check_stack_overflow lre_check_timeout=qjs_lre_check_timeout lre_realloc=qjs_lre_realloc)   # src/host/lre_host.c is the one definition
set_target_properties(zn_quickjs PROPERTIES C_STANDARD 11 POSITION_INDEPENDENT_CODE ON)
target_compile_options(zn_quickjs PRIVATE -w -O2)
target_link_libraries(zn_quickjs PUBLIC zn_regexp)
option(ZN_QJS_PROFILE "the QuickJS profiler of zinc profile --engine quickjs: opcode counts in the interpreter loop, so a separate build directory (ZN-598)" OFF)
if(ZN_QJS_PROFILE)
  target_sources(zn_quickjs PRIVATE src/qjs/qjs_prof.cpp)
  target_compile_definitions(zn_quickjs PUBLIC ZN_QJS_PROFILE)
endif()
set(ZN_QJS_AOT_GEN "" CACHE FILEPATH "a C file of tools/qjs2c: QuickJS functions compiled to C, bound at their first call (ZN-599 spike)")
if(ZN_QJS_AOT_GEN)
  target_compile_definitions(zn_quickjs PRIVATE ZN_QJS_AOT "ZN_QJS_AOT_GEN=\"${ZN_QJS_AOT_GEN}\"")
endif()
# zinc-mqjs (owner, 2026-10-21): the host MicroQuickJS (third_party/mquickjs, its own mqjs.c unchanged) that `--target esp32 --engine mquickjs`
# runs to check and compile a program for the ESP32's mquickjs firmware (src/cli_mqjs.cpp). An executable beside zinc, not linked into it: its JS_*
# names are QuickJS-ng's too. Its ROM tables are generated by a host program, so neither Windows (termios) nor a cross build has it.
if(NOT WIN32 AND NOT CMAKE_CROSSCOMPILING)
  set(ZN_MQ ${CMAKE_CURRENT_SOURCE_DIR}/third_party/mquickjs)
  set(ZN_MQ_GEN ${CMAKE_CURRENT_BINARY_DIR}/mquickjs)
  # its table is upstream's with the two host calls of zinc:native (firmware/esp32-mquickjs/main/zn_native.c), so that the check runs a plugin's
  # native module, loaded from the plugin's library for this computer (ZINC_MQJS_NATIVE), as the firmware runs it
  file(READ ${ZN_MQ}/mqjs_stdlib.c ZN_MQ_TABLE)
  set(ZN_MQ_LAST "    JS_CFUNC_DEF(\"clearTimeout\", 1, js_clearTimeout),\n")
  string(REPLACE "${ZN_MQ_LAST}" "${ZN_MQ_LAST}    JS_CFUNC_DEF(\"__host_nativeOpen\", 1, js_native_open),\n    JS_CFUNC_DEF(\"__host_nativeCall\", 10, js_native_call),\n" ZN_MQ_ZINC "${ZN_MQ_TABLE}")
  if(ZN_MQ_ZINC STREQUAL ZN_MQ_TABLE)
    message(FATAL_ERROR "third_party/mquickjs/mqjs_stdlib.c changed: its line for clearTimeout, after which zinc-mqjs adds zinc:native's host calls, is not there")
  endif()
  set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS ${ZN_MQ}/mqjs_stdlib.c)
  file(CONFIGURE OUTPUT ${ZN_MQ_GEN}/zinc_mqjs_stdlib.c CONTENT "${ZN_MQ_ZINC}" @ONLY)   # written when it changes only (the file has no @)
  file(CONFIGURE OUTPUT ${ZN_MQ_GEN}/zinc_mqjs_native.h CONTENT "#include <stddef.h>\n#include <stdint.h>\n#include \"mquickjs.h\"\nJSValue js_native_open(JSContext *, JSValue *, int, JSValue *);\nJSValue js_native_call(JSContext *, JSValue *, int, JSValue *);\n" @ONLY)
  add_executable(zn_mqjs_stdlib ${ZN_MQ_GEN}/zinc_mqjs_stdlib.c ${ZN_MQ}/mquickjs_build.c)
  target_include_directories(zn_mqjs_stdlib PRIVATE ${ZN_MQ})
  target_compile_options(zn_mqjs_stdlib PRIVATE -w)
  add_custom_command(OUTPUT ${ZN_MQ_GEN}/mqjs_stdlib.h ${ZN_MQ_GEN}/mquickjs_atom.h
    COMMAND ${CMAKE_COMMAND} -E make_directory ${ZN_MQ_GEN}
    COMMAND zn_mqjs_stdlib > ${ZN_MQ_GEN}/mqjs_stdlib.h
    COMMAND zn_mqjs_stdlib -a > ${ZN_MQ_GEN}/mquickjs_atom.h
    DEPENDS zn_mqjs_stdlib)
  add_executable(zinc-mqjs ${ZN_MQ}/mqjs.c ${ZN_MQ}/readline.c ${ZN_MQ}/readline_tty.c ${ZN_MQ}/mquickjs.c ${ZN_MQ}/dtoa.c ${ZN_MQ}/libm.c ${ZN_MQ}/cutils.c
                 firmware/esp32-mquickjs/main/zn_native.c ${ZN_MQ_GEN}/mqjs_stdlib.h ${ZN_MQ_GEN}/mquickjs_atom.h)
  target_include_directories(zinc-mqjs PRIVATE ${ZN_MQ_GEN} ${ZN_MQ} include)
  target_compile_definitions(zinc-mqjs PRIVATE _GNU_SOURCE ZN_NATIVE_DLOPEN)
  target_compile_options(zinc-mqjs PRIVATE -w -O2)
  set_source_files_properties(${ZN_MQ}/mqjs.c PROPERTIES COMPILE_OPTIONS "-include;${ZN_MQ_GEN}/zinc_mqjs_native.h")   # the table names them
  target_link_libraries(zinc-mqjs PRIVATE m ${CMAKE_DL_LIBS})
  set_target_properties(zinc-mqjs PROPERTIES ENABLE_EXPORTS ON)   # a plugin's library it loads finds zn_js_heap there (main/zn_native.c)
endif()
# zinc:script (ZN-103): the native module "QuickJS" over the vendored QuickJS-ng; zinc registers it, an AOT program that uses it links this library
add_library(zn_yaml STATIC third_party/libyaml/api.c third_party/libyaml/loader.c third_party/libyaml/parser.c third_party/libyaml/reader.c third_party/libyaml/scanner.c)   # libyaml 0.2.5 (read side only): scenario files (ZN-295)
target_include_directories(zn_yaml PUBLIC third_party/libyaml)
target_compile_definitions(zn_yaml PRIVATE YAML_VERSION_MAJOR=0 YAML_VERSION_MINOR=2 YAML_VERSION_PATCH=5 "YAML_VERSION_STRING=\"0.2.5\"")
target_compile_options(zn_yaml PRIVATE -w)
add_library(zn_sim STATIC src/sim/sim.cpp src/sim/board.cpp src/sim/scenario.cpp src/sim/program_dut.cpp src/sim/replay.cpp src/sim/parts/registry.cpp)
target_link_libraries(zn_sim PUBLIC zn_yyjson zn_yaml)   # the simulator core (ZN-292): scheduler, netlist, trace
set_target_properties(zn_sim PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON)
target_include_directories(zn_sim PUBLIC include src)
add_executable(sim_test tests/native/sim_test.cpp)
set_target_properties(sim_test PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON)
target_link_libraries(sim_test PRIVATE zn_sim)
add_executable(scenario_test tests/native/scenario_test.cpp)
set_target_properties(scenario_test PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON)
target_link_libraries(scenario_test PRIVATE zn_sim)
add_executable(board_test tests/native/board_test.cpp)
set_target_properties(board_test PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON)
target_link_libraries(board_test PRIVATE zn_sim)
# Node-API on QuickJS-ng (third_party/node-api, ZN-773): the one binding ABI of the JavaScript engines; the engine's own bindings include
# napi/inline.h (ZN_NAPI_INLINE) so their hot calls compile to loads and stores on QuickJS
add_library(zn_napi_qjs STATIC third_party/node-api/src/js_native_api_quickjs.cc third_party/node-api/src/js_native_api_shared.cc third_party/node-api/src/env_quickjs.cc)
target_include_directories(zn_napi_qjs PUBLIC third_party/node-api/include third_party/node-api/quickjs)
set_target_properties(zn_napi_qjs PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON POSITION_INDEPENDENT_CODE ON)
target_compile_options(zn_napi_qjs PRIVATE -w -O2)
target_compile_definitions(zn_napi_qjs PUBLIC NAPI_VERSION=8 NAPI_DISABLE_CPP_EXCEPTIONS)
target_link_libraries(zn_napi_qjs PUBLIC zn_quickjs)
add_library(zn_qjs_ext STATIC src/qjs/ext.cpp src/qjs/web_shims.cpp)   # the context hooks (WebGL for trusted programs and for zinc:script when zinc.json asks)
target_link_libraries(zn_qjs_ext PUBLIC zn_quickjs zn_napi_qjs)
target_include_directories(zn_qjs_ext PUBLIC include src)
add_library(zn_script STATIC src/qjs/script_native.cpp)
target_link_libraries(zn_script PUBLIC zn_quickjs zn_native zn_qjs_ext)
target_include_directories(zn_script PUBLIC include)

add_library(zn_qjs STATIC src/qjs/qjs.cpp src/qjs/bundle.cpp src/qjs/strip.cpp src/qjs/prelude.cpp src/qjs/native_js.cpp src/qjs/webenv.cpp src/qjs/canvas2d.cpp)
target_link_libraries(zn_qjs PUBLIC zn_quickjs zn_frontend zn_qjs_ext zn_native)
target_compile_definitions(zn_qjs PRIVATE ZN_NAPI_INLINE)
target_link_libraries(zn_qjs PRIVATE zn_text)   # canvas2d.cpp: the web environment's Canvas 2D shapes its text with the text tier (ZN-570)
target_include_directories(zn_qjs PUBLIC include src)

# zinc lint and zinc migrate (docs/reports/zinc-lint-migrate.md): rules and codemods on the frontend's lexer and loader
add_library(zn_lint STATIC src/lint/lint.cpp src/lint/migrate.cpp)
target_link_libraries(zn_lint PUBLIC zn_frontend zn_platform)
add_executable(zinc src/main.cpp src/test_cmd.cpp src/cli_core.cpp src/cli_tour.cpp src/cli_web.cpp src/cli_web_deps.cpp src/cli_pm.cpp src/cli_mqjs.cpp src/lsp/lsp.cpp src/dev/hot.cpp src/dev/hot_swap.cpp)   # dev/hot*.cpp: zinc dev's Fast Refresh, in the command line only (ZN-742); hot_swap.cpp also in the player (ZN-631)
option(ZN_NATIVE_FIXTURE "register the C test module 'Fixture' (tests/native/fixture.c) in zinc, for the native-call tests" ON)
if(ZN_NATIVE_FIXTURE)
  add_library(zn_native_fixture STATIC tests/native/fixture.c)   # also linked into the programs zinc build writes when they call the module
  target_compile_options(zn_native_fixture PRIVATE -std=c99 -Wall -Wextra -Werror -pedantic)
  target_include_directories(zn_native_fixture PUBLIC include)
  target_link_libraries(zinc PRIVATE zn_native_fixture)
  target_compile_definitions(zinc PRIVATE ZN_NATIVE_FIXTURE)
endif()
if(ZN_REPRODUCIBLE)
  target_compile_definitions(zinc PRIVATE ZN_SOURCE_DIR="")
else()
  target_compile_definitions(zinc PRIVATE ZN_SOURCE_DIR="${CMAKE_CURRENT_SOURCE_DIR}")
endif()
if(TARGET zinc-mqjs)
  add_dependencies(zinc zinc-mqjs)   # built with zinc, beside it (src/cli_mqjs.cpp finds it there)
endif()
set_target_properties(zinc PROPERTIES ENABLE_EXPORTS ON)   # a plugin loaded with dlopen finds zrt and the native registry in this binary
if(WIN32)   # plugins as .dll: the def exports the engine's C symbols their native code calls, so --out-implib (ENABLE_EXPORTS) writes libzinc.dll.a beside zinc.exe and the plugin links it (docs/reports/zinc-windows-port.md)
  target_sources(zinc PRIVATE src/host/gpu_select_win.cpp)   # a laptop with two GPUs gives the window the NVIDIA or AMD one, not the integrated one
  if(TARGET zn_host_gfx)   # the def is src/zinc.def plus the zrt/hal symbols of libzn_host_gfx.a, written before each link (cmake/zinc-def.cmake)
    find_program(ZN_NM NAMES llvm-nm nm REQUIRED)
    add_custom_command(TARGET zinc PRE_LINK COMMAND ${CMAKE_COMMAND} -DNM=${ZN_NM} -DLIB=$<TARGET_FILE:zn_host_gfx>
      -DSEED=${CMAKE_CURRENT_SOURCE_DIR}/src/zinc.def -DOUT=${CMAKE_BINARY_DIR}/zinc.def -P ${CMAKE_CURRENT_SOURCE_DIR}/cmake/zinc-def.cmake VERBATIM)
    set_target_properties(zinc PROPERTIES LINK_FLAGS "${CMAKE_BINARY_DIR}/zinc.def")
  else()
    set_target_properties(zinc PROPERTIES LINK_FLAGS "${CMAKE_CURRENT_SOURCE_DIR}/src/zinc.def")
  endif()
  set_property(TARGET zinc APPEND PROPERTY LINK_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/src/zinc.def)
  # "Zinc Atelier.exe" of the Windows download of the app (tools/package): a GUI program that starts zinc.exe without a console window
  add_executable(zinc-atelier src/app/atelier_launcher_win.c)
  target_link_options(zinc-atelier PRIVATE -Wl,--subsystem,windows)   # zig's driver ignores -mwindows, CMake's WIN32 flag
endif()
if(APPLE)   # signed ad hoc with the JIT entitlement after each link (ZN-773): the system's JavaScriptCore compiles only for a process that has it
  add_custom_command(TARGET zinc POST_BUILD COMMAND codesign --force --sign - --entitlements ${CMAKE_CURRENT_SOURCE_DIR}/targets/macos/zinc.entitlements $<TARGET_FILE:zinc> VERBATIM)
endif()
if(APPLE)   # but not zinc's own C++ (zn::), harfbuzz's or the libc++ templates it instantiates: exported weak definitions cost dyld a coalescing bind each
  # at every launch (629, 388 of them for one template) and the libc++ ones a patch of the shared cache; no plugin or module imports them (ZN-592.01)
  target_link_options(zinc PRIVATE "LINKER:-unexported_symbols_list,${CMAKE_CURRENT_SOURCE_DIR}/tools/zinc-unexported.txt")
  set_property(TARGET zinc APPEND PROPERTY LINK_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/tools/zinc-unexported.txt)
endif()
target_link_libraries(zinc PRIVATE zn_lint zn_sim zn_script zn_qjs zn_assets zn_res zn_dev zn_tc zn_prof zn_dbg zn_vm zn_aot zn_rt zn_zbc zn_ir zn_frontend zn_qrcodegen zn_i18n)
if(TARGET zn_rt_new)
  add_dependencies(zinc zn_rt_new)   # not linked into zinc (ZN-592): `zinc build` links it into the programs that have a heap budget
endif()
if(TARGET zn_host_gfx)
  target_compile_definitions(zinc PRIVATE ZN_HOST_GFX)
  target_include_directories(zinc PRIVATE ${ZN_RUNTIME_DIR}/include)   # hal_window.h (ZN-233)
  if(ZN_SDL_LIB)
    set(ZN_HOST_LIBS_LINE "'${ZN_SDL_LIB}'")
    if(ZN_SDL_LIB_LINE)
      set(ZN_HOST_LIBS_LINE "${ZN_SDL_LIB_LINE}")
    endif()
    if(ZN_SDL_VENDORED_BUILD)   # what the static archive needs from the system, repeated by `zinc build` (the frameworks SDL's cocoa/metal build links)
      if(APPLE)
        foreach(fw Cocoa CoreMedia CoreVideo IOKit Carbon Foundation Metal QuartzCore AppKit CoreFoundation CoreGraphics CoreServices UniformTypeIdentifiers CoreHaptics GameController ForceFeedback AudioToolbox AVFoundation CoreAudio CoreBluetooth CoreMotion OpenGL)
          set(ZN_HOST_LIBS_LINE "${ZN_HOST_LIBS_LINE} -framework ${fw}")
        endforeach()
        set(ZN_HOST_LIBS_LINE "${ZN_HOST_LIBS_LINE} -lobjc")
      elseif(NOT WIN32)
        set(ZN_HOST_LIBS_LINE "${ZN_HOST_LIBS_LINE} -ldl -lm")
      endif()
    endif()
    target_compile_definitions(zinc PRIVATE ZN_HOST_LIBS="${ZN_HOST_LIBS_LINE}")  # linked into the programs zinc build writes
  endif()
  target_link_libraries(zinc PRIVATE zn_host_gfx)
  # the device agent (ZN-729): zinc agent and zinc device, compiled into zinc like the rest of its commands. Its TLS sessions are those of
  # src/host/tls.cpp (zn_host_gfx); discovery is mjansson/mdns (third_party/mdns, one header). On Windows the daemon is
  # the POSIX pass yet (a serial server, termios, a pty): its commands say it (docs/targets/windows.md).
  if(NOT WIN32)
    target_sources(zinc PRIVATE src/agent/chan.cpp src/agent/wire.cpp src/agent/mdns.cpp src/agent/server.cpp src/agent/client.cpp src/agent/inspect.cpp)
    target_sources(zinc PRIVATE src/agent/dev.cpp src/agent/screen.cpp src/agent/live.cpp)   # zinc dev --device (ZN-729.03)
    target_sources(zinc PRIVATE src/net/dnssd.cpp)   # DNS-SD, shared with plugins/link (ZN-756), which compiles it into its own library
    target_include_directories(zinc SYSTEM PRIVATE third_party)   # "mdns/mdns.h"
    target_compile_definitions(zinc PRIVATE ZN_AGENT)
    target_sources(zinc PRIVATE src/agent/ota.cpp)   # the agent as a service, signed app updates with rollback (ZN-729.04)
  endif()
  if(NOT APPLE AND NOT WIN32)
    target_link_libraries(zinc PRIVATE util)   # forkpty
  endif()
  if(TARGET zn_window)   # the window host is a module beside zinc (ZN-592.01): src/host/window_module.cpp loads it; programs link zn_host_window
    target_sources(zinc PRIVATE src/host/window_module.cpp)
    target_include_directories(zinc PRIVATE src)
    target_compile_definitions(zinc PRIVATE ZN_WINDOW_MODULE)
    add_dependencies(zinc zn_window zn_host_window)
  elseif(ZN_SDL_VENDORED_BUILD)   # the display drivers loaded with dlopen call SDL functions that zinc itself may not: keep the whole archive
    if(APPLE)
      target_link_options(zinc PRIVATE "LINKER:-force_load,${ZN_SDL_LIB}")
    else()
      # three words, not LINKER:a,b,c: zig's linker (cmake/zig-linux.cmake) takes neither -Xlinker nor an archive inside -Wl
      target_link_libraries(zinc PRIVATE -Wl,--whole-archive ${ZN_SDL_LIB} -Wl,--no-whole-archive)
    endif()
  endif()
else()   # no graphics host (-DZN_HOST_GFX=OFF, the first Windows build): its entries that main.cpp and zinc:canvas2d call answer "no host"
  target_sources(zinc PRIVATE src/host/no_host.cpp)
endif()

add_executable(platform_test tests/unit/platform_test.cpp)   # tests/t0/platform.sh
target_link_libraries(platform_test PRIVATE zn_platform)

add_executable(i18n_test tests/unit/i18n_test.cpp)   # tests/t0/i18n.sh
target_link_libraries(i18n_test PRIVATE zn_i18n)

add_executable(ir_test tests/unit/ir_test.cpp)
target_link_libraries(ir_test PRIVATE zn_ir)

add_executable(ops_test tests/unit/ops_test.cpp)
target_include_directories(ops_test PRIVATE include)

add_executable(zbc_test tests/unit/zbc_test.cpp)
target_link_libraries(zbc_test PRIVATE zn_zbc)

# A test with a module written in C99
# The text-shaping tier (ZN-114, D11): HarfBuzz + SheenBidi + libunibreak behind src/text/layout.h. Nothing links it by default: only programs that ask for it.
add_library(zn_harfbuzz STATIC third_party/harfbuzz/src/zn-harfbuzz.cc)
target_include_directories(zn_harfbuzz PUBLIC third_party/harfbuzz/src)
set_target_properties(zn_harfbuzz PROPERTIES CXX_STANDARD 17 POSITION_INDEPENDENT_CODE ON)
target_compile_options(zn_harfbuzz PRIVATE -w -O2 -fno-exceptions -fno-rtti -DHB_NO_MT)
file(GLOB ZN_SHEENBIDI_SRC third_party/sheenbidi/Source/SheenBidi.c)
add_library(zn_sheenbidi STATIC ${ZN_SHEENBIDI_SRC})
target_include_directories(zn_sheenbidi PUBLIC third_party/sheenbidi/Headers PRIVATE third_party/sheenbidi/Source)
set_target_properties(zn_sheenbidi PROPERTIES C_STANDARD 11 POSITION_INDEPENDENT_CODE ON)
target_compile_options(zn_sheenbidi PRIVATE -w -O2)
target_compile_definitions(zn_sheenbidi PRIVATE SB_CONFIG_UNITY)
add_library(zn_unibreak STATIC third_party/libunibreak/linebreak.c third_party/libunibreak/linebreakdata.c third_party/libunibreak/linebreakdef.c third_party/libunibreak/unibreakbase.c third_party/libunibreak/unibreakdef.c third_party/libunibreak/eastasianwidthdef.c third_party/libunibreak/eastasianwidthdata.c third_party/libunibreak/emojidef.c third_party/libunibreak/emojidata.c third_party/libunibreak/linebreakauxdata.c third_party/libunibreak/graphemebreak.c third_party/libunibreak/graphemebreakdata.c third_party/libunibreak/wordbreak.c third_party/libunibreak/wordbreakdata.c)
target_include_directories(zn_unibreak PUBLIC third_party/libunibreak)
set_target_properties(zn_unibreak PROPERTIES C_STANDARD 11 POSITION_INDEPENDENT_CODE ON)
target_compile_options(zn_unibreak PRIVATE -w -O2)
add_library(zn_text STATIC src/text/layout.cpp)
target_include_directories(zn_text PUBLIC src PRIVATE third_party/stb)
set_target_properties(zn_text PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON POSITION_INDEPENDENT_CODE ON)
target_compile_options(zn_text PRIVATE -w -O2)
target_link_libraries(zn_text PUBLIC zn_harfbuzz zn_sheenbidi zn_unibreak)
add_library(zn_segment STATIC src/text/segment.cpp src/text/segmenter_js.cpp)   # grapheme/word/line boundaries and Intl.Segmenter (ZN-165)
target_include_directories(zn_segment PUBLIC src include)
set_target_properties(zn_segment PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON POSITION_INDEPENDENT_CODE ON)
target_link_libraries(zn_segment PUBLIC zn_unibreak zn_napi_qjs)
target_link_libraries(zinc PRIVATE zn_segment)
if(TARGET zn_host_gfx)   # the rn layout engine behind the Rt::HostLayout* rows (ZN-284.01): Yoga, the port of wrapText; linked by zinc and by AOT programs that call it
  add_library(zn_layout STATIC src/host/layout_host.cpp src/host/layout_yoga.cpp src/host/text_wrap.cpp)
  set_target_properties(zn_layout PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON POSITION_INDEPENDENT_CODE ON)
  target_include_directories(zn_layout PUBLIC src include ${ZN_RUNTIME_DIR} ${ZN_RUNTIME_DIR}/include)
  target_compile_options(zn_layout PRIVATE -Wall -Wextra)
  target_link_libraries(zn_layout PUBLIC zn_yoga)
  target_link_libraries(zinc PRIVATE zn_layout)
endif()
if(TARGET zn_host_gfx)   # shaped zinc:gfx / zinc:ui text (ZN-224): linked by programs that ask for it
  add_library(zn_text_gfx STATIC src/text/shaped_gfx.cpp src/text/sbix.cpp)
  set_target_properties(zn_text_gfx PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON POSITION_INDEPENDENT_CODE ON)
  target_include_directories(zn_text_gfx PUBLIC src ${ZN_RUNTIME_DIR} ${ZN_RUNTIME_DIR}/include PRIVATE third_party/stb)
  target_link_libraries(zn_text_gfx PUBLIC zn_text)
  target_link_libraries(zinc PRIVATE zn_text_gfx)
endif()
# The engine as a library for an app shell (ZN-620, D59, include/zn/app.h): the runtime, the graphics host with the SDL3 window HAL linked in,
# the native registry, the rn layout; no frontend, no toolchain manager, no child process and nothing loaded at run time (ZN_APP_LIBRARY).
# Its own objects, so the CLI's stay as they are; the program is the C++ of `zinc build` compiled with -DZN_APP_LIBRARY (zn_app_main).
# An Android or iOS project builds it from these sources with the platform's compiler (zinc export --target android, ZN-621).
if(TARGET zn_host_gfx AND SDL3_FOUND)
  get_target_property(ZN_APP_HOST_SRC zn_host_gfx SOURCES)
  list(APPEND ZN_APP_HOST_SRC ${CMAKE_CURRENT_SOURCE_DIR}/targets/macos/hal_sdl.cpp)
  if(CMAKE_SYSTEM_NAME MATCHES "^(Darwin|iOS)$")
    list(APPEND ZN_APP_HOST_SRC ${CMAKE_CURRENT_SOURCE_DIR}/targets/macos/hal_metal.mm)
  endif()
  list(REMOVE_DUPLICATES ZN_APP_HOST_SRC)
  add_library(zn_app_host STATIC ${ZN_APP_HOST_SRC})
  set_target_properties(zn_app_host PROPERTIES CXX_STANDARD 17 CXX_STANDARD_REQUIRED ON CXX_EXTENSIONS OFF POSITION_INDEPENDENT_CODE ON)
  target_include_directories(zn_app_host PUBLIC include PRIVATE ${ZN_RUNTIME_DIR} ${ZN_RUNTIME_DIR}/include third_party/bcdec third_party/etcdec)
  target_compile_options(zn_app_host PRIVATE -fno-exceptions -fno-rtti -fwrapv -ffp-contract=off -fno-threadsafe-statics -O2 -w)
  target_compile_definitions(zn_app_host PRIVATE ZN_APP_LIBRARY ZN_HOST_SDL ZRT_HEAP_BYTES=536870912u ZRT_PLATFORM="${ZN_PLATFORM_NAME}" ZRT_POINT_POOL=262144 ZRT_GROW_DRAW_CMDS)
  if(NOT ZN_TLS)
    target_compile_definitions(zn_app_host PRIVATE ZN_NO_TLS)
  endif()
  target_link_libraries(zn_app_host PUBLIC zn_uv zn_llhttp zn_mbedtls zn_regexp zn_codec zn_zpk SDL3::SDL3)
  if(CMAKE_SYSTEM_NAME STREQUAL "Darwin")   # macOS: hal_sdl.cpp presents with OpenGL there (ZN_HAL_GL); iOS is APPLE too and has no OpenGL.framework
    target_link_libraries(zn_app_host PUBLIC "-framework OpenGL" "-framework Metal" "-framework QuartzCore")   # and Metal: hal_metal.mm
  elseif(CMAKE_SYSTEM_NAME STREQUAL "iOS")   # hal_metal.mm
    target_link_libraries(zn_app_host PUBLIC "-framework Metal" "-framework QuartzCore" "-framework Security")   # Security: tls.cpp's verifier
  elseif(CMAKE_SYSTEM_NAME STREQUAL "Linux")
    target_include_directories(zn_app_host PRIVATE third_party/glad/include)
  elseif(WIN32)   # Windows: the same WGL path through SDL, glad's table
    target_include_directories(zn_app_host PRIVATE third_party/glad/include)
  elseif(ANDROID)
    target_link_libraries(zn_app_host PUBLIC GLESv2)
  endif()
  add_library(zn_app STATIC src/app/app.cpp src/app/embed.cpp src/rt/machine.cpp src/rt/rtcalls.cpp src/rt/program.cpp src/rt/unicode.cpp src/zbc/zbc.cpp)   # the shell, src/app/shell_sdl.cpp, goes into the app itself
  if(NOT ZN_SANITIZE)
    target_sources(zn_app PRIVATE src/rt/alloc.cpp)
  endif()
  if(ANDROID)   # a phone's system signals and commands (docs/ui.md "System signals"); the shell calls zn_mobile_glue_init
    target_sources(zn_app PRIVATE src/app/android_glue.cpp)
  elseif(CMAKE_SYSTEM_NAME STREQUAL "iOS")
    target_sources(zn_app PRIVATE src/app/ios_glue.mm src/app/ios_a11y.mm)
    set_source_files_properties(src/app/ios_glue.mm src/app/ios_a11y.mm PROPERTIES COMPILE_FLAGS "-fobjc-arc")
    target_link_libraries(zn_app PUBLIC "-framework UIKit")
  endif()
  set_target_properties(zn_app PROPERTIES POSITION_INDEPENDENT_CODE ON)
  target_include_directories(zn_app PUBLIC include src)
  target_link_libraries(zn_app PUBLIC zn_app_host zn_layout zn_native zn_mimalloc zn_regexp zn_yyjson)
  target_link_libraries(zn_app PUBLIC zn_script)   # zinc:script (QuickJS) for a program that imports it: a static archive, so a program that does not import it pulls no object
  # Zinc Go, the player (ZN-631, src/app/player.cpp): the interpreter, Fast Refresh's swap and the link to zinc dev --lan; linked into a
  # player's package only (zinc.json "player": true), never into a user's app, whose AOT program defines Machine::exec itself
  add_library(zn_app_player STATIC src/app/player.cpp src/dev/hot_swap.cpp src/vm/vm.cpp)
  set_target_properties(zn_app_player PROPERTIES POSITION_INDEPENDENT_CODE ON)
  target_compile_options(zn_app_player PRIVATE -Wall -Wextra)
  target_include_directories(zn_app_player PUBLIC include src)
  target_link_libraries(zn_app_player PUBLIC zn_app zn_zstd)
  # its device mode (ZN-792): the agent's protocol served from the player (src/agent/player.cpp over chan.cpp and the host's TLS), mDNS
  # through src/net/dnssd.cpp except on iOS (raw multicast needs an entitlement there)
  target_sources(zn_app_player PRIVATE src/agent/player.cpp src/agent/chan.cpp)
  if(NOT CMAKE_SYSTEM_NAME STREQUAL "iOS")
    target_sources(zn_app_player PRIVATE src/net/dnssd.cpp)
  endif()
  target_include_directories(zn_app_player SYSTEM PRIVATE third_party)   # "mdns/mdns.h"
  target_compile_definitions(zn_app_player PRIVATE ZN_AGENT_SERVER_ONLY)
  set_source_files_properties(src/app/player.cpp PROPERTIES COMPILE_DEFINITIONS "ZN_VERSION=\"${_zn_version}\"")
  target_link_libraries(zn_app_player PUBLIC zn_yyjson)
  # the archives an embedder links, in order, for a link outside CMake (tests/t0/app_library.sh); one configuration only (an Xcode project has several)
  if(NOT CMAKE_CONFIGURATION_TYPES)
    file(GENERATE OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/zn_app.link CONTENT "$<TARGET_FILE:zn_app>\n$<TARGET_FILE:zn_app_host>\n$<TARGET_FILE:zn_layout>\n$<TARGET_FILE:zn_yoga>\n$<TARGET_FILE:zn_native>\n$<TARGET_FILE:zn_mimalloc>\n$<TARGET_FILE:zn_regexp>\n$<TARGET_FILE:zn_uv>\n$<TARGET_FILE:zn_llhttp>\n$<TARGET_FILE:zn_mbedtls>\n$<TARGET_FILE:zn_codec>\n$<TARGET_FILE:zn_zpk>\n$<TARGET_FILE:zn_lz4>\n$<TARGET_FILE:zn_zstd>\n$<TARGET_FILE:zn_sha256>\n$<TARGET_FILE:zn_yyjson>\n${ZN_SDL_LIB}\n")
  endif()
endif()
# glTF cross-check (ZN-119): cgltf reads the models independently of the three plugin's reader, meshoptimizer's vertex cache optimiser must keep their triangles.
file(GLOB ZN_MESHOPT_SRC third_party/meshoptimizer/*.cpp)
add_library(zn_meshopt STATIC ${ZN_MESHOPT_SRC})
target_include_directories(zn_meshopt PUBLIC third_party/meshoptimizer)
set_target_properties(zn_meshopt PROPERTIES CXX_STANDARD 11 POSITION_INDEPENDENT_CODE ON)
target_compile_options(zn_meshopt PRIVATE -w -O2)
file(GLOB_RECURSE ZN_YOGA_SRC third_party/yoga/yoga/*.cpp)   # Yoga 3.2.1, the flexbox of React Native: the opt-in `rn` layout (ZN-280); sources vendored whole, our own target
add_library(zn_yoga STATIC ${ZN_YOGA_SRC})
target_include_directories(zn_yoga PUBLIC third_party/yoga)
set_target_properties(zn_yoga PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON POSITION_INDEPENDENT_CODE ON)
target_compile_options(zn_yoga PRIVATE -O2)
if(ANDROID)
  target_link_libraries(zn_yoga PUBLIC log)   # Yoga logs through __android_log_vprint there
endif()
add_executable(yoga_test tests/native/yoga_test.cpp)
set_target_properties(yoga_test PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON)
target_link_libraries(yoga_test PRIVATE zn_yoga)
add_executable(layout_yoga_test tests/native/layout_yoga_test.cpp src/host/layout_yoga.cpp src/host/text_wrap.cpp)   # the `rn` engine behind src/host/layout.h (ZN-283)
set_target_properties(layout_yoga_test PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON)
target_include_directories(layout_yoga_test PRIVATE src)
target_compile_options(layout_yoga_test PRIVATE -Wall -Wextra)
target_link_libraries(layout_yoga_test PRIVATE zn_yoga)
add_executable(layout_bench tests/bench/layout_bench.cpp)
set_target_properties(layout_bench PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON)
target_link_libraries(layout_bench PRIVATE zn_yoga)
# glslang 15.1.0 (Khronos): only its front end, to validate WebGL shaders as GLSL ES 1.00 / 3.00 (src/gl/essl_check.cpp); no SPIR-V, no optimiser, no HLSL
file(GLOB_RECURSE ZN_GLSLANG_SRC third_party/glslang/glslang/MachineIndependent/*.cpp third_party/glslang/glslang/GenericCodeGen/*.cpp third_party/glslang/glslang/ResourceLimits/ResourceLimits.cpp)
if(WIN32)
  list(APPEND ZN_GLSLANG_SRC third_party/glslang/glslang/OSDependent/Windows/ossource.cpp)
else()
  list(APPEND ZN_GLSLANG_SRC third_party/glslang/glslang/OSDependent/Unix/ossource.cpp)
endif()
add_library(zn_glslang STATIC ${ZN_GLSLANG_SRC})
target_include_directories(zn_glslang PUBLIC third_party/glslang third_party/glslang/zn)
set_target_properties(zn_glslang PROPERTIES CXX_STANDARD 17 CXX_STANDARD_REQUIRED ON POSITION_INDEPENDENT_CODE ON)
target_compile_definitions(zn_glslang PRIVATE ENABLE_OPT=0)
target_compile_options(zn_glslang PRIVATE -w -O2)
# WebGL foundation (ZN-203.01): the merged glad loader (third_party/glad) and the offscreen context helper over SDL3; a test executable, not linked into zinc yet.
option(ZN_WEBGL "build the WebGL module libzn_webgl beside zinc (off: about 16 s less to build; QuickJS programs run without WebGL)" ON)
if(WIN32)   # the module dlopen'ed beside zinc: its undefined SDL_* resolve at load only on ELF and Mach-O; the PE pass builds it with the import library later (docs/targets/windows.md)
  set(ZN_WEBGL OFF)
endif()
if(TARGET SDL3::SDL3 AND ZN_WEBGL)
  add_library(zn_glad STATIC third_party/glad/src/gl.c)
  target_include_directories(zn_glad PUBLIC third_party/glad/include)
  target_compile_options(zn_glad PRIVATE -w)
  add_library(zn_gl STATIC src/gl/offscreen.cpp src/gl/webgl1.cpp src/gl/webgl1_more.cpp src/gl/webgl2.cpp src/gl/webgl2_tex.cpp src/gl/essl_check.cpp
              src/gl/webgl_host.cpp src/gl/webgl_install.cpp)   # webgl_host, webgl_install: zinc:gl for AOT programs (ZN-562)
  set_target_properties(zn_gl PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON)
  target_include_directories(zn_gl PUBLIC src include)
  target_link_libraries(zn_gl PUBLIC zn_glad SDL3::SDL3 zn_glslang)
  # WebGL for the QuickJS engine as a module beside zinc (ZN-330.01): libzn_webgl.dylib / .so, loaded with dlopen on the first QuickJS context (src/main.cpp webglHook).
  # It carries the WebGL code, glad and glslang; SDL3 is resolved from zinc (ENABLE_EXPORTS, SDL3 force-loaded), so there is one copy; the engine comes as a Node-API table.
  add_library(zn_webgl MODULE src/gl/webgl_js.cpp src/gl/napi_trampoline.cpp src/gl/webgl_host.cpp src/gl/offscreen.cpp src/gl/webgl1.cpp src/gl/webgl1_more.cpp src/gl/webgl2.cpp src/gl/webgl2_tex.cpp src/gl/essl_check.cpp)
  set_target_properties(zn_webgl PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON PREFIX "lib" LIBRARY_OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR} CXX_VISIBILITY_PRESET hidden)
  if(APPLE)
    set_target_properties(zn_webgl PROPERTIES SUFFIX ".dylib")
    target_link_options(zn_webgl PRIVATE "LINKER:-undefined,dynamic_lookup")
  endif()
  set_target_properties(zn_glad PROPERTIES POSITION_INDEPENDENT_CODE ON)
  target_include_directories(zn_webgl PRIVATE src include third_party/node-api/include $<TARGET_PROPERTY:SDL3::SDL3,INTERFACE_INCLUDE_DIRECTORIES>)
  target_compile_definitions(zn_webgl PRIVATE NAPI_VERSION=8 "NAPI_EXTERN=")   # its napi_* are its own, hidden: the trampolines into the engine's table (ZN-773.02)
  target_link_libraries(zn_webgl PRIVATE zn_glad zn_glslang)
  add_executable(gl_offscreen tests/native/gl_offscreen.cpp)
  set_target_properties(gl_offscreen PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON)
  target_link_libraries(gl_offscreen PRIVATE zn_gl)
  # the GL replay's shaders as GLSL ES 1.00, the GLES 2 floor of D29 (ZN-581): glslang with the WebGL rules, no device
  add_executable(gl_replay_es2 tests/native/gl_replay_es2.cpp)
  set_target_properties(gl_replay_es2 PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON)
  target_include_directories(gl_replay_es2 PRIVATE runtime)
  target_link_libraries(gl_replay_es2 PRIVATE zn_gl)
  add_executable(webgl1_test tests/native/webgl1_test.cpp)
  set_target_properties(webgl1_test PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON)
  target_link_libraries(webgl1_test PRIVATE zn_gl)
  add_dependencies(zinc zn_webgl)   # built with zinc, not linked into it
endif()
# WebAssembly for the QuickJS engine (ZN-773.06): WAMR's fast interpreter (third_party/wamr, no AOT, no JIT) under the WebAssembly JS API, a module
# beside zinc (libzn_wasm, the `wasm` pack: zinc engine install wasm) that zinc opens on the first read of the global (src/main.cpp wasmGlobal).
# Built here for the tests; zinc ships without it (tools/package does not copy it).
option(ZN_WASM "build the WebAssembly module libzn_wasm beside zinc (the wasm pack)" ON)
if(ZN_WASM AND (APPLE OR CMAKE_SYSTEM_NAME STREQUAL "Linux"))
  enable_language(ASM)
  set(WAMR third_party/wamr/core)
  if(CMAKE_SYSTEM_PROCESSOR MATCHES "^(arm64|aarch64|ARM64)$")
    set(ZN_WAMR_TARGET AARCH64)
    set(ZN_WAMR_INVOKE ${WAMR}/iwasm/common/arch/invokeNative_aarch64.s)
  elseif(CMAKE_SYSTEM_PROCESSOR MATCHES "^arm")   # armhf and armv7: the hard-float ABI (ponytail: no soft-float armel target)
    set(ZN_WAMR_TARGET ARM_VFP)
    set(ZN_WAMR_INVOKE ${WAMR}/iwasm/common/arch/invokeNative_arm_vfp.s)
  elseif(CMAKE_SYSTEM_PROCESSOR MATCHES "^(i.86|x86)$")
    set(ZN_WAMR_TARGET X86_32)
    set(ZN_WAMR_INVOKE ${WAMR}/iwasm/common/arch/invokeNative_ia32.s)
  else()
    set(ZN_WAMR_TARGET X86_64)
    set(ZN_WAMR_INVOKE ${WAMR}/iwasm/common/arch/invokeNative_em64.s)
  endif()
  if(APPLE)
    set(ZN_WAMR_PLATFORM darwin)
  else()
    set(ZN_WAMR_PLATFORM linux)
  endif()
  string(TOUPPER ${ZN_WAMR_PLATFORM} ZN_WAMR_PLATFORM_UPPER)
  set(WAMR_POSIX ${WAMR}/shared/platform/common/posix)
  set(WAMR_UTILS ${WAMR}/shared/utils)
  set(WAMR_COMMON ${WAMR}/iwasm/common)
  add_library(zn_wamr STATIC ${WAMR}/shared/platform/${ZN_WAMR_PLATFORM}/platform_init.c ${WAMR}/shared/platform/common/memory/mremap.c
              ${WAMR_POSIX}/posix_blocking_op.c ${WAMR_POSIX}/posix_malloc.c ${WAMR_POSIX}/posix_memmap.c ${WAMR_POSIX}/posix_sleep.c ${WAMR_POSIX}/posix_thread.c ${WAMR_POSIX}/posix_time.c
              ${WAMR}/shared/mem-alloc/mem_alloc.c ${WAMR}/shared/mem-alloc/ems/ems_alloc.c ${WAMR}/shared/mem-alloc/ems/ems_gc.c
              ${WAMR}/shared/mem-alloc/ems/ems_hmu.c ${WAMR}/shared/mem-alloc/ems/ems_kfc.c
              ${WAMR_UTILS}/bh_assert.c ${WAMR_UTILS}/bh_bitmap.c ${WAMR_UTILS}/bh_common.c ${WAMR_UTILS}/bh_hashmap.c ${WAMR_UTILS}/bh_leb128.c ${WAMR_UTILS}/bh_list.c ${WAMR_UTILS}/bh_log.c ${WAMR_UTILS}/bh_queue.c
              ${WAMR_UTILS}/bh_vector.c ${WAMR_UTILS}/runtime_timer.c
              ${WAMR_COMMON}/wasm_blocking_op.c ${WAMR_COMMON}/wasm_c_api.c ${WAMR_COMMON}/wasm_exec_env.c ${WAMR_COMMON}/wasm_loader_common.c ${WAMR_COMMON}/wasm_memory.c ${WAMR_COMMON}/wasm_native.c ${WAMR_COMMON}/wasm_runtime_common.c
              ${WAMR_COMMON}/wasm_shared_memory.c ${ZN_WAMR_INVOKE}
              ${WAMR}/iwasm/interpreter/wasm_interp_fast.c ${WAMR}/iwasm/interpreter/wasm_loader.c ${WAMR}/iwasm/interpreter/wasm_runtime.c)
  # what WAMR's build-scripts/config_common.cmake gives for: fast interpreter, bulk memory, reference types, no AOT/JIT/WASI/threads/SIMD;
  # PUBLIC because src/wasm reads WAMR's internal structures, which these shape. ZN_WAMR_JS_API: patches/0001.
  target_compile_definitions(zn_wamr PUBLIC WASM_ENABLE_INTERP=1 WASM_ENABLE_FAST_INTERP=1 WASM_ENABLE_AOT=0 WASM_ENABLE_JIT=0 WASM_ENABLE_FAST_JIT=0
                             BUILD_TARGET_${ZN_WAMR_TARGET} "BUILD_TARGET=\"${ZN_WAMR_TARGET}\"" BH_PLATFORM_${ZN_WAMR_PLATFORM_UPPER}
                             WASM_ENABLE_MULTI_MODULE=0 WASM_ENABLE_BULK_MEMORY=1 WASM_ENABLE_SHARED_MEMORY=0 WASM_ENABLE_MINI_LOADER=0
                             WASM_DISABLE_HW_BOUND_CHECK=1 WASM_DISABLE_STACK_HW_BOUND_CHECK=1 WASM_DISABLE_WAKEUP_BLOCKING_OP=0 WASM_ENABLE_REF_TYPES=1
                             WASM_ENABLE_LIBC_BUILTIN=0 WASM_ENABLE_LIBC_WASI=0 WASM_ENABLE_SIMD=0 WASM_GLOBAL_HEAP_SIZE=10485760
                             WASM_ENABLE_QUICK_AOT_ENTRY=0 WASM_ENABLE_AOT_INTRINSICS=0 WASM_ENABLE_SHRUNK_MEMORY=0 WASM_ENABLE_EXTENDED_CONST_EXPR=1
                             WASM_HAVE_MREMAP=0 BH_MALLOC=wasm_runtime_malloc BH_FREE=wasm_runtime_free ZN_WAMR_JS_API)
  target_include_directories(zn_wamr PUBLIC ${WAMR} ${WAMR}/iwasm/include ${WAMR}/iwasm/interpreter ${WAMR_COMMON} ${WAMR}/shared/platform/${ZN_WAMR_PLATFORM}
                             ${WAMR}/shared/platform/include ${WAMR}/shared/mem-alloc ${WAMR_UTILS})
  set_target_properties(zn_wamr PROPERTIES POSITION_INDEPENDENT_CODE ON C_VISIBILITY_PRESET hidden C_STANDARD 99 C_EXTENSIONS ON)
  target_compile_options(zn_wamr PRIVATE -w)
  add_library(zn_wasm MODULE src/wasm/wasm_js.cpp src/wasm/napi_trampoline.cpp)
  set_target_properties(zn_wasm PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON PREFIX "lib" LIBRARY_OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR} CXX_VISIBILITY_PRESET hidden)
  if(APPLE)
    set_target_properties(zn_wasm PROPERTIES SUFFIX ".dylib")
  endif()
  target_include_directories(zn_wasm PRIVATE src include third_party/node-api/include)
  target_compile_definitions(zn_wasm PRIVATE NAPI_VERSION=8 "NAPI_EXTERN=")   # its napi_* are its own, hidden: the trampolines into the engine's tables
  target_link_libraries(zn_wasm PRIVATE zn_wamr)
  add_dependencies(zinc zn_wasm)   # built with zinc for the tests, not linked into it
endif()
# JavaScriptCore as an engine module beside zinc (ZN-773.03, include/zn/engine.h): the system framework, JsRuntimeHost's Node-API over its C API, the
# driver and its own copy of the Node-API bindings (napi_* hidden, so they never meet the QuickJS ones in zinc); zinc's services resolved at load.
if(APPLE)
  add_library(zn_engine_jsc MODULE src/engine/driver.cpp src/engine/jsc.cpp src/engine/zinc.cpp src/qjs/prelude.cpp src/qjs/web_shims.cpp src/text/segment.cpp
              third_party/node-api/src/js_native_api_javascriptcore.cc third_party/node-api/src/js_native_api_shared.cc third_party/node-api/src/env_javascriptcore.cc
              src/qjs/native_js.cpp src/qjs/canvas2d.cpp src/qjs/webenv.cpp src/text/segmenter_js.cpp)
  set_target_properties(zn_engine_jsc PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON PREFIX "lib" SUFFIX ".dylib" LIBRARY_OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}
                        CXX_VISIBILITY_PRESET hidden VISIBILITY_INLINES_HIDDEN ON)
  set_source_files_properties(third_party/node-api/src/js_native_api_javascriptcore.cc third_party/node-api/src/js_native_api_shared.cc third_party/node-api/src/env_javascriptcore.cc
                              TARGET_DIRECTORY zn_engine_jsc PROPERTIES COMPILE_OPTIONS "-w")
  target_compile_definitions(zn_engine_jsc PRIVATE NAPI_VERSION=8 NAPI_DISABLE_CPP_EXCEPTIONS "NAPI_EXTERN=" ZN_ENGINE_MODULE)
  target_include_directories(zn_engine_jsc PRIVATE third_party/node-api/include third_party/node-api/javascriptcore src include
                             $<TARGET_PROPERTY:zn_qjs,INTERFACE_INCLUDE_DIRECTORIES> $<TARGET_PROPERTY:zn_text,INTERFACE_INCLUDE_DIRECTORIES> $<TARGET_PROPERTY:zn_segment,INTERFACE_INCLUDE_DIRECTORIES>
                             $<TARGET_PROPERTY:zn_frontend,INTERFACE_INCLUDE_DIRECTORIES> $<TARGET_PROPERTY:zn_mbedtls,INTERFACE_INCLUDE_DIRECTORIES>)   # base64 of the inline source map: zinc's exported mbedTLS
  target_link_options(zn_engine_jsc PRIVATE "LINKER:-undefined,dynamic_lookup")
  target_link_libraries(zn_engine_jsc PRIVATE "-framework JavaScriptCore" zn_codec zn_text)   # zinc exports no C++: the stateless code is linked in
  add_dependencies(zinc zn_engine_jsc)   # built with zinc, not linked into it
endif()
# V8 as an engine module beside zinc (ZN-773.05), built when an SDK directory of tools/v8-pack is there (Homebrew's build of V8 stable: the
# component libraries against the system's libc++, pointer compression on, no sandbox; the defines below are that build's and V8 refuses to start
# with others). The module finds the libraries through its rpath.
set(ZN_V8_DIR "$ENV{HOME}/.zinc/sdk/v8/current" CACHE PATH "a V8 SDK directory of tools/v8-pack (include/, lib/)")
if(APPLE AND ZN_TLS AND EXISTS "${ZN_V8_DIR}/include/v8.h")   # ZN_TLS: the inspector's WebSocket handshake (src/dbg/ws.cpp)
  get_filename_component(ZN_V8_REAL "${ZN_V8_DIR}" REALPATH)
  add_library(zn_engine_v8 MODULE src/engine/driver.cpp src/engine/v8.cpp src/engine/zinc.cpp src/qjs/prelude.cpp src/qjs/web_shims.cpp src/text/segment.cpp
              third_party/node-api/src/js_native_api_v8.cc third_party/node-api/src/env_v8.cc src/dbg/ws.cpp
              src/qjs/native_js.cpp src/qjs/canvas2d.cpp src/qjs/webenv.cpp src/text/segmenter_js.cpp)
  set_target_properties(zn_engine_v8 PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON PREFIX "lib" SUFFIX ".dylib" LIBRARY_OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}
                        CXX_VISIBILITY_PRESET hidden VISIBILITY_INLINES_HIDDEN ON BUILD_RPATH "${ZN_V8_REAL}/lib")
  set_source_files_properties(third_party/node-api/src/js_native_api_v8.cc third_party/node-api/src/env_v8.cc TARGET_DIRECTORY zn_engine_v8 PROPERTIES COMPILE_OPTIONS "-w")
  target_compile_definitions(zn_engine_v8 PRIVATE NAPI_VERSION=8 NAPI_DISABLE_CPP_EXCEPTIONS "NAPI_EXTERN=" ZN_ENGINE_MODULE V8_COMPRESS_POINTERS V8_31BIT_SMIS_ON_64BIT_ARCH V8_CPPGC_MICROTASK_QUEUE)
  target_include_directories(zn_engine_v8 PRIVATE third_party/node-api/include third_party/node-api/v8 "${ZN_V8_REAL}/include" src include
                             $<TARGET_PROPERTY:zn_qjs,INTERFACE_INCLUDE_DIRECTORIES> $<TARGET_PROPERTY:zn_text,INTERFACE_INCLUDE_DIRECTORIES> $<TARGET_PROPERTY:zn_segment,INTERFACE_INCLUDE_DIRECTORIES>
                             $<TARGET_PROPERTY:zn_frontend,INTERFACE_INCLUDE_DIRECTORIES> $<TARGET_PROPERTY:zn_mbedtls,INTERFACE_INCLUDE_DIRECTORIES>)
  target_link_options(zn_engine_v8 PRIVATE "LINKER:-undefined,dynamic_lookup")
  target_link_libraries(zn_engine_v8 PRIVATE "${ZN_V8_REAL}/lib/libv8.dylib" "${ZN_V8_REAL}/lib/libv8_libplatform.dylib" "${ZN_V8_REAL}/lib/libv8_libbase.dylib" zn_codec zn_text)
  add_dependencies(zinc zn_engine_v8)
endif()
# Hermes as an engine module beside zinc (ZN-773.07, ZN-773.08), built when an SDK directory of tools/hermes-pack is there: Hermes's own Node-API in
# libhermesvm (napi_* exported there, so the module carries no copy), the driver and the bindings; src/engine/hermes.h gives them the named
# napi_run_script. Chrome DevTools through Hermes's CDP agent behind src/dbg/ws.cpp, as V8's (ZN_TLS: its WebSocket handshake).
set(ZN_HERMES_DIR "$ENV{HOME}/.zinc/sdk/hermes/current" CACHE PATH "a Hermes SDK directory of tools/hermes-pack (include/, lib/)")
if(APPLE AND ZN_TLS AND EXISTS "${ZN_HERMES_DIR}/lib/libhermesvm.dylib")
  get_filename_component(ZN_HERMES_REAL "${ZN_HERMES_DIR}" REALPATH)
  add_library(zn_engine_hermes MODULE src/engine/driver.cpp src/engine/hermes.cpp src/engine/zinc.cpp src/qjs/prelude.cpp src/qjs/web_shims.cpp src/text/segment.cpp src/dbg/ws.cpp
              src/qjs/native_js.cpp src/qjs/canvas2d.cpp src/qjs/webenv.cpp src/text/segmenter_js.cpp)
  set_target_properties(zn_engine_hermes PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON PREFIX "lib" SUFFIX ".dylib" LIBRARY_OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}
                        CXX_VISIBILITY_PRESET hidden VISIBILITY_INLINES_HIDDEN ON BUILD_RPATH "${ZN_HERMES_REAL}/lib")
  target_compile_definitions(zn_engine_hermes PRIVATE NAPI_VERSION=8 ZN_ENGINE_MODULE ZN_ENGINE_HERMES)
  target_compile_options(zn_engine_hermes PRIVATE -include ${CMAKE_CURRENT_SOURCE_DIR}/src/engine/hermes.h)
  target_include_directories(zn_engine_hermes PRIVATE "${ZN_HERMES_REAL}/include/hermes" src include
                             $<TARGET_PROPERTY:zn_qjs,INTERFACE_INCLUDE_DIRECTORIES> $<TARGET_PROPERTY:zn_text,INTERFACE_INCLUDE_DIRECTORIES> $<TARGET_PROPERTY:zn_segment,INTERFACE_INCLUDE_DIRECTORIES>
                             $<TARGET_PROPERTY:zn_frontend,INTERFACE_INCLUDE_DIRECTORIES> $<TARGET_PROPERTY:zn_mbedtls,INTERFACE_INCLUDE_DIRECTORIES>)
  target_link_options(zn_engine_hermes PRIVATE "LINKER:-undefined,dynamic_lookup")
  target_link_libraries(zn_engine_hermes PRIVATE "${ZN_HERMES_REAL}/lib/libhermesvm.dylib" zn_codec zn_text)
  add_dependencies(zinc zn_engine_hermes)
endif()
add_executable(gltf_check tests/native/gltf_check.cpp)
set_target_properties(gltf_check PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON)
target_include_directories(gltf_check PRIVATE third_party/cgltf)
target_link_libraries(gltf_check PRIVATE zn_meshopt)
add_executable(fx_test tests/native/fx_test.cpp)
set_target_properties(fx_test PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON)
target_include_directories(fx_test PRIVATE include)
add_executable(codec_test tests/native/codec_test.cpp)
set_target_properties(codec_test PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON)
target_link_libraries(codec_test PRIVATE zn_res zn_codec)
add_executable(napi_test tests/native/napi_test.cpp)   # Node-API on QuickJS-ng (ZN-773): the callback scope and the number reads of our patch
set_target_properties(napi_test PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON)
target_link_libraries(napi_test PRIVATE zn_napi_qjs)
add_executable(segment_test tests/text/segment_test.cpp)
set_target_properties(segment_test PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON)
target_link_libraries(segment_test PRIVATE zn_segment)
add_executable(layout_test tests/text/layout_test.cpp)
set_target_properties(layout_test PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON)
target_link_libraries(layout_test PRIVATE zn_text)

add_executable(native_test tests/native/native_test.cpp tests/native/fixture.c)
set_source_files_properties(tests/native/fixture.c PROPERTIES COMPILE_OPTIONS "-std=c99;-Wall;-Wextra;-Werror;-pedantic")
target_link_libraries(native_test PRIVATE zn_native)

# The plugins' native sources (ZN-099): x.host.cpp is built unchanged against zinc_native_x.h, with the thunk that `zinc native-gen --thunk` writes (src/native/zrt_compat.h)
# registering it as a native module. One static library per plugin, linked into programs that use it (zinc build --native) and into the test below.
if(TARGET zn_host_gfx)
  set(ZN_PLUGIN_DIR ${CMAKE_CURRENT_SOURCE_DIR}/plugins)
  function(zn_plugin name Name)
    set(gen ${CMAKE_CURRENT_BINARY_DIR}/gen/${name})
    set(spec ${ZN_PLUGIN_DIR}/${name}/native/${name}.spec.ts)
    add_custom_command(OUTPUT ${gen}/zinc_native_${name}.h ${gen}/zinc_native_${name}_thunk.cpp
      COMMAND ${CMAKE_COMMAND} -E make_directory ${gen}
      COMMAND zinc native-gen ${spec} ${gen}
      COMMAND zinc native-gen --thunk ${spec} ${gen}
      DEPENDS zinc ${spec} VERBATIM)
    add_library(zn_plugin_${name} STATIC ${ZN_PLUGIN_DIR}/${name}/native/${name}.host.cpp ${gen}/zinc_native_${name}_thunk.cpp ${ARGN})
    target_include_directories(zn_plugin_${name} PRIVATE ${gen} ${CMAKE_CURRENT_SOURCE_DIR}/src PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include ${ZN_RUNTIME_DIR} ${ZN_RUNTIME_DIR}/include)
    set_target_properties(zn_plugin_${name} PROPERTIES CXX_STANDARD 17 CXX_STANDARD_REQUIRED ON CXX_EXTENSIONS OFF)
    target_compile_options(zn_plugin_${name} PRIVATE -fno-exceptions -fno-rtti -fwrapv -ffp-contract=off -fno-threadsafe-statics -O2 -w)
    target_compile_definitions(zn_plugin_${name} PRIVATE ZRT_HEAP_BYTES=536870912u ZRT_PLATFORM="${ZN_PLATFORM_NAME}" ZRT_POINT_POOL=262144 ZRT_GROW_DRAW_CMDS)
  endfunction()
  set(ZN_SQLITE_DEFS SQLITE_THREADSAFE=0 SQLITE_OMIT_LOAD_EXTENSION SQLITE_DEFAULT_MEMSTATUS=0 SQLITE_OMIT_DEPRECATED SQLITE_DEFAULT_FOREIGN_KEYS=0)
  set_source_files_properties(${ZN_PLUGIN_DIR}/sqlite/vendor/sqlite3.c PROPERTIES COMPILE_DEFINITIONS "${ZN_SQLITE_DEFS}" COMPILE_OPTIONS "-w;-O2")
  zn_plugin(sqlite Sqlite ${ZN_PLUGIN_DIR}/sqlite/vendor/sqlite3.c)
  zn_plugin(process Process)
  zn_plugin(socket Socket)
  zn_plugin(system System)
  target_include_directories(zn_plugin_system PRIVATE ${ZN_PLUGIN_DIR}/system/native)   # ops.gen.h
  if(APPLE)   # the macOS backend (notifications, menus, dock, tray) is part of the plugin library the tests link
    target_sources(zn_plugin_system PRIVATE ${ZN_PLUGIN_DIR}/system/native/system.macos.mm)
    set_source_files_properties(${ZN_PLUGIN_DIR}/system/native/system.macos.mm PROPERTIES COMPILE_OPTIONS "-fobjc-arc;-w")
    target_link_libraries(zn_plugin_system PUBLIC "-framework Foundation" "-framework AppKit" "-framework UserNotifications" "-framework Carbon" "-framework IOKit")
  endif()
  add_executable(native_plugins_test tests/native/plugins_test.cpp)
  set_target_properties(native_plugins_test PROPERTIES CXX_STANDARD 17 CXX_STANDARD_REQUIRED ON)
  target_include_directories(native_plugins_test PRIVATE ${ZN_RUNTIME_DIR} ${ZN_RUNTIME_DIR}/include)
  target_compile_options(native_plugins_test PRIVATE -fno-exceptions -fno-rtti -fwrapv -w)
  target_compile_definitions(native_plugins_test PRIVATE ZRT_HEAP_BYTES=536870912u ZRT_PLATFORM="${ZN_PLATFORM_NAME}" ZRT_POINT_POOL=262144 ZRT_GROW_DRAW_CMDS)
  target_link_libraries(native_plugins_test PRIVATE zn_plugin_sqlite zn_plugin_process zn_plugin_socket zn_plugin_system zn_native zn_host_gfx zn_vm zn_rt)
  if(TARGET zn_host_window)
    target_link_libraries(native_plugins_test PRIVATE zn_host_window)
  endif()
endif()

# ---- fuzzing (ZN-147): `cmake -S . -B build-fuzz -DCMAKE_C_COMPILER=$(brew --prefix llvm)/bin/clang -DCMAKE_CXX_COMPILER=$(brew --prefix llvm)/bin/clang++ -DZN_SANITIZE=ON -DZN_FUZZ=ON`
if(ZN_FUZZ)
  set(ZN_LIBFUZZER "" CACHE FILEPATH "a libFuzzer archive, for a clang that instruments but ships none (Apple's): tools/libfuzzer builds it")
  foreach(t parse check zbc native zpk)
    add_executable(fuzz_${t} tests/fuzz/fuzz_${t}.cpp)
    target_compile_options(fuzz_${t} PRIVATE -fsanitize=fuzzer-no-link)
    if(ZN_LIBFUZZER)
      target_link_libraries(fuzz_${t} PRIVATE ${ZN_LIBFUZZER})
    else()
      target_link_options(fuzz_${t} PRIVATE -fsanitize=fuzzer)
    endif()
    set_target_properties(fuzz_${t} PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON)
  endforeach()
  target_link_libraries(fuzz_zpk PRIVATE zn_zpk)
  target_link_libraries(fuzz_parse PRIVATE zn_frontend)
  target_link_libraries(fuzz_check PRIVATE zn_frontend zn_ir zn_zbc zn_native)
  target_link_libraries(fuzz_zbc PRIVATE zn_zbc)
  target_link_libraries(fuzz_native PRIVATE zn_native)
  target_include_directories(fuzz_parse PRIVATE src include)
  target_include_directories(fuzz_check PRIVATE src include)
  target_include_directories(fuzz_zbc PRIVATE src include)
  target_include_directories(fuzz_native PRIVATE src include)
endif()
