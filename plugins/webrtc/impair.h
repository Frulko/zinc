// The network impairment harness of zinc:webrtc (native/impair.cpp). plugin.json force-includes this header into the vendored sources
// (vendorFlags: -include impair.h), so libdatachannel's calls to libjuice's juice_create, juice_send_diffserv and juice_destroy go through
// the harness without a change to the vendored files; the C sources (libjuice itself) skip it and keep the real functions.
// It lives beside plugin.json, where the plugin build hashes it into the key of the vendored archive.
#pragma once
#ifdef __cplusplus
#include <stddef.h>
#include <stdint.h>
typedef struct juice_agent juice_agent_t;
typedef struct juice_config juice_config_t;
extern "C" juice_agent_t* zn_impair_create(const juice_config_t* config);
extern "C" int zn_impair_send(juice_agent_t* agent, const char* data, size_t size, int ds);
extern "C" void zn_impair_destroy(juice_agent_t* agent);
/** The bytes on the wire (IPv4 + UDP + SRTP) of the RTP packets sent with this SSRC, retransmissions included: counted with or without
 *  ZINC_WEBRTC_IMPAIR, before its losses. */
extern "C" long long zn_impair_wire_bytes(uint32_t ssrc);
#ifndef ZN_IMPAIR_IMPL
#define juice_create zn_impair_create
#define juice_send_diffserv zn_impair_send
#define juice_destroy zn_impair_destroy
#endif
#endif
