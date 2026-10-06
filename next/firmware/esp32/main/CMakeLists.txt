set(ZN ${CMAKE_CURRENT_LIST_DIR}/../../..)
idf_component_register(
  SRCS main.cpp ${ZN}/src/dev/core.cpp ${ZN}/src/rt/machine.cpp ${ZN}/src/rt/rtcalls.cpp ${ZN}/src/rt/program.cpp ${ZN}/src/vm/vm.cpp ${ZN}/src/zbc/zbc.cpp
  INCLUDE_DIRS ${ZN}/include ${ZN}/src
  REQUIRES driver esp_system)
# no mimalloc on the device (the C library's heap serves everything); the runtime is built as on the host otherwise
target_compile_definitions(${COMPONENT_LIB} PRIVATE ZN_NO_MIMALLOC)
target_compile_options(${COMPONENT_LIB} PRIVATE -O2 -Wno-error)
