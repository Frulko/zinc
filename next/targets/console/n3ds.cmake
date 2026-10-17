# Nintendo 3DS (devkitARM: -DCMAKE_TOOLCHAIN_FILE=$DEVKITPRO/cmake/3DS.cmake; tools/build-console-core runs it in devkitPro's pinned image):
# targets/n3ds/hal_n3ds.cpp with libctru, and zinc-core.3dsx, the homebrew format Azahar and the Homebrew Launcher start.
target_link_libraries(zinc-core PRIVATE ctru)
target_compile_definitions(zinc-core PRIVATE ZN_CONSOLE_STACK_SLOTS=262144 ZN_CONSOLE_MAX_DEPTH=1000)   # 2 MiB of registers, 1000 calls deep
set_source_files_properties(${CMAKE_CURRENT_SOURCE_DIR}/audio_console.cpp PROPERTIES COMPILE_DEFINITIONS "ZN_CONSOLE_AUDIO_RATE=22050;ZN_CONSOLE_AUDIO_NAME=\"ndsp\"")
ctr_create_3dsx(zinc-core)
