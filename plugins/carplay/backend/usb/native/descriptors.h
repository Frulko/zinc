// SPDX-License-Identifier: GPL-3.0-only
// Descriptor rules ported from DiPlay IphoneCarPlayConfiguration/NcmFunctionDiscovery.
#pragma once
#include <libusb.h>
#include <string>

namespace carplay {
// Apple serial descriptors can contain NUL padding after the visible identifier.
inline std::string serialText(const unsigned char* text, size_t length) {
    std::string value(reinterpret_cast<const char*>(text), length);
    const auto end = value.find('\0');
    if (end != std::string::npos) value.resize(end);
    return value;
}

struct Pipe {
    int interface = -1;
    int alternate = 0;
    unsigned char in = 0, out = 0;
    int inPacketSize = 0, outPacketSize = 0;
    explicit operator bool() const { return interface >= 0 && in && out; }
};
struct Configuration {
    int value = 0;
    Pipe mux, ncm;
    int control = -1;
    int macString = 0;
    bool appleEthernet = false;
    explicit operator bool() const { return value && mux && ncm && control >= 0; }
};
inline Pipe bulkPipe(const libusb_interface_descriptor& d) {
    Pipe p;
    p.interface = d.bInterfaceNumber;
    p.alternate = d.bAlternateSetting;
    for (int i = 0; i < d.bNumEndpoints; ++i) {
        const auto& e = d.endpoint[i];
        if ((e.bmAttributes & 3) != LIBUSB_TRANSFER_TYPE_BULK) continue;
        auto& slot = e.bEndpointAddress & LIBUSB_ENDPOINT_IN ? p.in : p.out;
        // DiPlay prefers Apple's 0x85/0x04 USBMUX endpoints.
        if (!slot || e.bEndpointAddress == 0x85 || e.bEndpointAddress == 0x04) {
            slot = e.bEndpointAddress;
            (e.bEndpointAddress & LIBUSB_ENDPOINT_IN ? p.inPacketSize : p.outPacketSize) = e.wMaxPacketSize;
        }
    }
    return p;
}
inline Configuration discover(const libusb_config_descriptor& d) {
    Configuration result;
    result.value = d.bConfigurationValue;
    for (int i = 0; i < d.bNumInterfaces; ++i) {
        for (int j = 0; j < d.interface[i].num_altsetting; ++j) {
            const auto& a = d.interface[i].altsetting[j];
            if (a.bInterfaceClass == 0xff && a.bInterfaceSubClass == 0xfe && a.bInterfaceProtocol == 2)
                result.mux = bulkPipe(a);
            if (a.bInterfaceClass == 2 && a.bInterfaceSubClass == 0x0d && result.control < 0) {
                result.control = a.bInterfaceNumber;
                for (int offset = 0; offset + 2 <= a.extra_length;) {
                    const auto* extra = a.extra + offset;
                    int length = extra[0];
                    if (length < 2 || offset + length > a.extra_length) break;
                    if (length >= 4 && extra[1] == 0x24 && extra[2] == 0x0f)
                        result.macString = extra[3];
                    offset += length;
                }
            }
            if (a.bInterfaceClass == 0x0a && bulkPipe(a) && (!result.ncm || (result.ncm.alternate != 1 && a.bAlternateSetting == 1)))
                result.ncm = bulkPipe(a);
            if (a.bInterfaceClass == 0xff && a.bInterfaceSubClass == 0xfd && a.bInterfaceProtocol == 1)
                result.appleEthernet = true;
        }
    }
    return result;
}
}
