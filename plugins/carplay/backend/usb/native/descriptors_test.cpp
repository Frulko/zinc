// SPDX-License-Identifier: GPL-3.0-only
#include "descriptors.h"
#include <cassert>
int main() {
    libusb_endpoint_descriptor muxEnds[2]{};
    muxEnds[0].bEndpointAddress = 0x04; muxEnds[0].bmAttributes = 2;
    muxEnds[1].bEndpointAddress = 0x85; muxEnds[1].bmAttributes = 2;
    libusb_endpoint_descriptor ncmEnds[2]{};
    ncmEnds[0].bEndpointAddress = 0x02; ncmEnds[0].bmAttributes = 2;
    ncmEnds[1].bEndpointAddress = 0x83; ncmEnds[1].bmAttributes = 2;
    ncmEnds[0].wMaxPacketSize = 64; ncmEnds[1].wMaxPacketSize = 512;
    unsigned char extra[] = {4, 0x24, 0x0f, 7};
    libusb_interface_descriptor desc[4]{};
    desc[0].bInterfaceNumber = 1; desc[0].bInterfaceClass = 0xff;
    desc[0].bInterfaceSubClass = 0xfe; desc[0].bInterfaceProtocol = 2;
    desc[0].endpoint = muxEnds; desc[0].bNumEndpoints = 2;
    desc[1].bInterfaceNumber = 2; desc[1].bInterfaceClass = 2; desc[1].bInterfaceSubClass = 0x0d;
    desc[1].extra = extra; desc[1].extra_length = sizeof(extra);
    desc[2].bInterfaceNumber = 3; desc[2].bInterfaceClass = 0x0a; desc[2].bAlternateSetting = 1;
    desc[2].endpoint = ncmEnds; desc[2].bNumEndpoints = 2;
    desc[3].bInterfaceNumber = 4; desc[3].bInterfaceClass = 0xff;
    desc[3].bInterfaceSubClass = 0xfd; desc[3].bInterfaceProtocol = 1;
    libusb_interface interfaces[4]{};
    for (int i = 0; i < 4; ++i) { interfaces[i].altsetting = &desc[i]; interfaces[i].num_altsetting = 1; }
    libusb_config_descriptor config{};
    config.bConfigurationValue = 9; config.bNumInterfaces = 4; config.interface = interfaces;
    auto found = carplay::discover(config);
    assert(found && found.appleEthernet && found.value == 9);
    assert(found.macString == 7 && found.ncm.inPacketSize == 512 && found.ncm.outPacketSize == 64);
    assert(found.mux.in == 0x85 && found.mux.out == 4 && found.ncm.alternate == 1);
    desc[2].bNumEndpoints = 1;
    assert(!carplay::discover(config));
    desc[2].bNumEndpoints = 2; desc[0].bInterfaceProtocol = 1;
    assert(!carplay::discover(config));
    desc[0].bInterfaceProtocol = 2; config.bNumInterfaces = 3;
    assert(carplay::discover(config) && !carplay::discover(config).appleEthernet);
}
