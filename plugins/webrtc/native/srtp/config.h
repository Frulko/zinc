/* libsrtp's config.h for zinc:webrtc (libsrtp includes it under HAVE_CONFIG_H; its CMake writes it from config_in_cmake.h). The built-in
 * crypto (AES-ICM, HMAC-SHA1): libdatachannel with mbedTLS only negotiates SRTP_AES128_CM_HMAC_SHA1_80, and libsrtp's mbedTLS engine
 * calls the mbedtls_aes_* functions mbedTLS 4 no longer has. Every target of the plugin is little-endian with these POSIX headers.
 * HAVE_CONFIG_H (plugin.json) makes libopus include it too: nothing here changes Opus, whose settings are the defines of plugin.json. */
#ifndef ZINC_SRTP_CONFIG_H
#define ZINC_SRTP_CONFIG_H
#define PACKAGE_VERSION "2.8.1"
#define PACKAGE_STRING "libsrtp2 2.8.1"
#if defined(__x86_64__) || defined(__i386__)
#define CPU_CISC 1
#define HAVE_X86 1
#else
#define CPU_RISC 1
#endif
#define HAVE_ARPA_INET_H 1
#define HAVE_INTTYPES_H 1
#define HAVE_NETINET_IN_H 1
#define HAVE_STDINT_H 1
#define HAVE_STDLIB_H 1
#define HAVE_SYS_SOCKET_H 1
#define HAVE_SYS_TYPES_H 1
#define HAVE_UNISTD_H 1
#define HAVE_INET_ATON 1
#define HAVE_INET_PTON 1
#define HAVE_SIGACTION 1
#define HAVE_USLEEP 1
#define HAVE_UINT8_T 1
#define HAVE_UINT16_T 1
#define HAVE_UINT32_T 1
#define HAVE_UINT64_T 1
#define HAVE_INT32_T 1
#define SIZEOF_UNSIGNED_LONG __SIZEOF_LONG__
#define SIZEOF_UNSIGNED_LONG_LONG 8
#define HAVE_INLINE 1
#endif
