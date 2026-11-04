cmake_minimum_required(VERSION 3.20)
project(zinc_ios_legacy LANGUAGES C CXX OBJCXX)

set(ZN_CONSOLE ios-legacy CACHE STRING "" FORCE)
set(ZN_CONSOLE_HAL "${CMAKE_CURRENT_SOURCE_DIR}/hal_ios.mm" CACHE FILEPATH "" FORCE)
add_compile_definitions(ZN_PTHREAD_TLS)
add_compile_options(-include "${CMAKE_CURRENT_SOURCE_DIR}/compat.h")
set(ZN_CONSOLE_LAYOUT ON CACHE BOOL "" FORCE)
add_subdirectory(../console console)
target_sources(zinc-core PRIVATE compat.c)
if(TARGET zn_console_gfx)
  # hal_present calls the raster on the interpreter thread, without band workers.
  target_compile_definitions(zn_console_gfx PRIVATE ZRT_RASTER_SINGLE_THREAD)
endif()
set_source_files_properties("${CMAKE_CURRENT_SOURCE_DIR}/../console/core_main.cpp"
  TARGET_DIRECTORY zinc-core PROPERTIES COMPILE_DEFINITIONS "main=zn_console_main")
set_target_properties(zinc-core PROPERTIES MACOSX_BUNDLE TRUE
  MACOSX_BUNDLE_INFO_PLIST "${CMAKE_CURRENT_SOURCE_DIR}/Info.plist"
  OUTPUT_NAME ZincLegacy)
set_source_files_properties(hal_ios.mm TARGET_DIRECTORY zinc-core PROPERTIES COMPILE_OPTIONS "-fobjc-arc;-Wall;-Wextra")
target_link_libraries(zinc-core PRIVATE "-framework UIKit" "-framework Foundation" "-framework CoreGraphics" "-framework QuartzCore")
target_link_libraries(zinc-core PRIVATE "-framework OpenGLES")
get_filename_component(root "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)
target_sources(zinc-core PRIVATE "${root}/plugins/display-gl/src/display_gl.cpp")
target_sources(zinc-core PRIVATE "${root}/targets/common/info_bridge.cpp")
set_source_files_properties("${root}/targets/common/info_bridge.cpp" TARGET_DIRECTORY zinc-core PROPERTIES COMPILE_OPTIONS "-fno-rtti;-fno-exceptions")
target_include_directories(zinc-core PRIVATE "${root}/plugins/display-gl" "${root}/runtime")
set_source_files_properties("${root}/plugins/display-gl/src/display_gl.cpp" TARGET_DIRECTORY zinc-core
  PROPERTIES COMPILE_OPTIONS "-fno-rtti;-fno-exceptions;-w" COMPILE_DEFINITIONS "ZP_DISPLAY_GL_KEY=-1")
target_compile_definitions(zinc-core PRIVATE ZP_DISPLAY_GL_RENDERER="gl" ZP_DISPLAY_GL_REQUIRE_GPU=1)
add_executable(zinc-ui control_client.c)
add_executable(zinc-launch launch.c)
target_link_libraries(zinc-launch PRIVATE "-framework CoreFoundation")
set_target_properties(zinc-ui zinc-launch PROPERTIES MACOSX_BUNDLE FALSE)

