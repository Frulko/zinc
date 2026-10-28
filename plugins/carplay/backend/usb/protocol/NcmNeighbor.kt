// SPDX-License-Identifier: GPL-3.0-only
package com.shilapi.xcertplay.transport

/** utun is a point-to-point interface, so answer Ethernet NDP for the local wired address. */
object NcmNeighbor {
    fun reply(packet: ByteArray, localAddress: ByteArray, hostMac: ByteArray): ByteArray? {
        require(localAddress.size == 16 && hostMac.size == 6)
        if (packet.size < 64 || packet[0].toInt() ushr 4 and 15 != 6 ||
            packet[6] != 58.toByte() || packet[7] != 255.toByte() ||
            packet[40] != 135.toByte() || packet[41] != 0.toByte()) return null
        val payload = ((packet[4].toInt() and 255) shl 8) or (packet[5].toInt() and 255)
        if (payload < 24 || payload + 40 != packet.size ||
            !packet.copyOfRange(48, 64).contentEquals(localAddress)) return null
        val checked = packet.copyOf()
        EthernetIpv6Codec.writeIcmpv6Checksum(checked)
        if (checked[42] != packet[42] || checked[43] != packet[43]) return null
        val source = packet.copyOfRange(8, 24)
        val dad = source.all { it == 0.toByte() }
        val response = ByteArray(64)
        response[0] = 0x60
        response[5] = 24
        response[6] = 58
        response[7] = 255.toByte()
        localAddress.copyInto(response, 8)
        if (dad) {
            response[24] = 255.toByte(); response[25] = 2; response[39] = 1
        } else source.copyInto(response, 24)
        response[40] = 136.toByte()
        response[44] = if (dad) 0x20 else 0x60
        localAddress.copyInto(response, 48)
        return EthernetIpv6Codec.addNeighborAdvertisementTargetMac(response, hostMac)
    }
}
