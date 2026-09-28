# PlayStation 2: gsKit (display) and libpad (input) for hal_ps2.cpp. Included at the end of the generated
# CMakeLists.txt (ZINC_TARGET_CMAKE, compiler/src/cli.ts); ps2dev.cmake already points at their headers and libraries.
target_link_libraries(app PRIVATE gskit dmakit pad)
if(DEFINED ZINC_FRAMES)
  set_source_files_properties(${ZINC_HAL} PROPERTIES COMPILE_DEFINITIONS ZINC_FRAMES=${ZINC_FRAMES})
endif()
