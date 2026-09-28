# PlayStation 1: turns the generated project into a PS-EXE with PSn00bSDK (toolchain file sdk.cmake), plus a CD image.
# Included at the end of the generated CMakeLists.txt (ZINC_TARGET_CMAKE, compiler/src/cli.ts).
set(_ps1 ${CMAKE_CURRENT_LIST_DIR})
set_target_properties(app zrt PROPERTIES PSN00BSDK_TARGET_TYPE EXECUTABLE_NOGPREL)
# runtime/host.cpp needs libc float printf/strtod, which PSn00bSDK lacks: crt_ps1.cpp replaces it (and libm)
get_target_property(_src zrt SOURCES)
list(FILTER _src EXCLUDE REGEX "/host\\.cpp$")
set_target_properties(zrt PROPERTIES SOURCES "${_src}")
target_sources(zrt PRIVATE ${_ps1}/crt_ps1.cpp)
# 2 MB of RAM: small static pools (gfx command lists are double-buffered)
target_compile_definitions(zrt PUBLIC ZRT_MAX_DRAW_CMDS=512 ZRT_TEXT_POOL=4096 ZRT_POINT_POOL=2048 ZRT_MICROTASKS=256
  ZRT_DEFERRED=256 ZRT_TIMERS=16 ZRT_PEN_SAMPLES=4 ZRT_DYN_IMAGES=4)
set_source_files_properties(zinc_main.cpp PROPERTIES COMPILE_DEFINITIONS main=zinc_program_main)
if(DEFINED ZINC_FRAMES)
  set_source_files_properties(${ZINC_HAL} PROPERTIES COMPILE_DEFINITIONS ZINC_FRAMES=${ZINC_FRAMES})
endif()
# libgcc goes after libpsn00b's libc (both define __clzsi2; the SDK puts -lgcc first too)
get_target_property(_libs app LINK_LIBRARIES)
list(REMOVE_ITEM _libs -lgcc)
set_target_properties(app PROPERTIES LINK_LIBRARIES "${_libs}")
target_link_libraries(app PRIVATE ${PSN00BSDK_EXECUTABLE_LINK_LIBRARIES})
target_link_options(app PRIVATE -T${PSN00BSDK_LDSCRIPTS}/exe.ld)
# app.exe (PS-EXE) and app.bin/app.cue (bootable ISO 9660 image: SYSTEM.CNF + the executable, no license sector)
configure_file(${_ps1}/iso.xml ${CMAKE_BINARY_DIR}/iso.xml COPYONLY)
file(WRITE ${CMAKE_BINARY_DIR}/system.cnf "BOOT=cdrom:\\PSX.EXE;1\r\nTCB=4\r\nEVENT=10\r\nSTACK=801FFFF0\r\n")
add_custom_command(TARGET app POST_BUILD
  COMMAND ${ELF2X} -q $<TARGET_FILE:app> ${CMAKE_BINARY_DIR}/app.exe
  COMMAND mkpsxiso -q -y ${CMAKE_BINARY_DIR}/iso.xml
  WORKING_DIRECTORY ${CMAKE_BINARY_DIR})
