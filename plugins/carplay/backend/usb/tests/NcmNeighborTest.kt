// SPDX-License-Identifier: GPL-3.0-only
package com.shilapi.xcertplay.transport

import java.net.InetAddress
import org.junit.Assert.*
import org.junit.Test

class NcmNeighborTest {
    private val local = InetAddress.getByName("fe80::1").address
    private val peer = InetAddress.getByName("fe80::2").address
    private val mac = byteArrayOf(2, 3, 4, 5, 6, 7)
    private fun solicitation(dad: Boolean = false) = ByteArray(64).also {
        it[0] = 0x60; it[5] = 24; it[6] = 58; it[7] = 255.toByte()
        if (!dad) peer.copyInto(it, 8)
        InetAddress.getByName("ff02::1:ff00:1").address.copyInto(it, 24)
        it[40] = 135.toByte()
        local.copyInto(it, 48)
        EthernetIpv6Codec.writeIcmpv6Checksum(it)
    }
    @Test fun repliesWithMacAndValidChecksum() {
        val reply = NcmNeighbor.reply(solicitation(), local, mac)!!
        assertEquals(72, reply.size)
        assertEquals(136.toByte(), reply[40])
        assertArrayEquals(peer, reply.copyOfRange(24, 40))
        assertArrayEquals(mac, reply.copyOfRange(66, 72))
        val checked = reply.copyOf()
        EthernetIpv6Codec.writeIcmpv6Checksum(checked)
        assertArrayEquals(reply, checked)
    }
    @Test fun dadReplyIsUnsolicitedMulticast() {
        val reply = NcmNeighbor.reply(solicitation(true), local, mac)!!
        assertEquals(0x20.toByte(), reply[44])
        assertArrayEquals(InetAddress.getByName("ff02::1").address, reply.copyOfRange(24, 40))
    }
    @Test fun rejectsSpoofedHopLimitWrongTargetAndBadChecksum() {
        assertNull(NcmNeighbor.reply(solicitation().also { it[7] = 64 }, local, mac))
        assertNull(NcmNeighbor.reply(solicitation().also { it[63] = 3 }, local, mac))
        assertNull(NcmNeighbor.reply(solicitation().also { it[42] = (it[42].toInt() xor 1).toByte() }, local, mac))
    }
}
