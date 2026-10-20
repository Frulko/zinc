# The core firmware of an ESP32 (ZN-030): the Zinc interpreter and the upload protocol (src/dev), flashed once. Programs arrive over the UART.
# Built with ESP-IDF (tools/build-esp32-core); the result is kept in prebuilt/ so nobody needs the SDK to use it.
cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(zinc-core)
