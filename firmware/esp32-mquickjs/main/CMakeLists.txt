set(ZN ${CMAKE_CURRENT_LIST_DIR}/../../..)
set(MQ ${ZN}/third_party/mquickjs)
idf_build_get_property(ZN_NET ZN_NET)
set(SRCS main.c mod_gpio.c mod_storage.c ${MQ}/mquickjs.c ${MQ}/dtoa.c ${MQ}/libm.c ${MQ}/cutils.c)
set(REQS esp_lcd esp_driver_i2c esp_driver_gpio esp_driver_spi esp_partition esp_timer esp_app_format esp_rom nvs_flash app_update)
if(ZN_NET)   # the network image (../CMakeLists.txt)
  list(APPEND SRCS mod_wifi.c mod_update.c mod_espnow.c mod_ble.c)
  list(APPEND REQS esp_wifi esp_netif esp_event esp_http_server bt dns_server esp-mdns lwip)
endif()
idf_component_register(
  SRCS ${SRCS}
  INCLUDE_DIRS . ${MQ} ${ZN}/third_party/SDL3/src/render
  LDFRAGMENTS linker.lf
  REQUIRES ${REQS})
if(ZN_NET)
  target_compile_definitions(${COMPONENT_LIB} PRIVATE ZN_NET)
  set(NET_FLAG -DZN_NET)
endif()
# idf.py -DZN_PANEL=spi: the emulator's build (esp32sim's T-Display board), main.c's ZN_PANEL_SPI
if(ZN_PANEL STREQUAL "spi")
  target_compile_definitions(${COMPONENT_LIB} PRIVATE ZN_PANEL_SPI)
endif()
# The ROM standard library and the engine's atom table, written by a host program (zn_stdlib.c, built with the computer's cc) for 32-bit words
set(GEN ${CMAKE_CURRENT_BINARY_DIR}/gen)
add_custom_command(OUTPUT ${GEN}/zn_stdlib.h ${GEN}/mquickjs_atom.h
  COMMAND ${CMAKE_COMMAND} -E make_directory ${GEN}
  COMMAND cc -O2 -w ${NET_FLAG} -I${MQ} -o ${GEN}/zn_stdlib ${CMAKE_CURRENT_LIST_DIR}/zn_stdlib.c ${MQ}/mquickjs_build.c -lm
  COMMAND ${GEN}/zn_stdlib -m32 > ${GEN}/zn_stdlib.h
  COMMAND ${GEN}/zn_stdlib -m32 -a > ${GEN}/mquickjs_atom.h
  DEPENDS ${CMAKE_CURRENT_LIST_DIR}/zn_stdlib.c ${MQ}/mqjs_stdlib.c ${MQ}/mquickjs_build.c ${MQ}/mquickjs_build.h)
add_custom_target(zn_stdlib_h DEPENDS ${GEN}/zn_stdlib.h ${GEN}/mquickjs_atom.h)
add_dependencies(${COMPONENT_LIB} zn_stdlib_h)
target_include_directories(${COMPONENT_LIB} PRIVATE ${GEN})
target_compile_options(${COMPONENT_LIB} PRIVATE -Wno-error -O2)   # the engine and the raster for speed; the rest of the image is -Os
set_source_files_properties(${MQ}/mquickjs.c ${MQ}/dtoa.c ${MQ}/libm.c ${MQ}/cutils.c PROPERTIES COMPILE_OPTIONS "-w")   # upstream sources
