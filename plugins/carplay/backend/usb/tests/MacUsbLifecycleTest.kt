// SPDX-License-Identifier: GPL-3.0-only
package com.shilapi.xcertplay.transport

import org.junit.Assert.*
import org.junit.Test

class MacUsbLifecycleTest {
    private class Io : UsbIo {
        var closes = 0
        var timeout = 0
        var writes = 0
        override fun read(ncm: Boolean, timeoutMillis: Int): ByteArray? {
            timeout = timeoutMillis
            return byteArrayOf(1, 2)
        }
        override fun write(ncm: Boolean, data: ByteArray, timeoutMillis: Int) { writes++ }
        override fun close() { closes++ }
    }
    @Test fun boundedReadsAndIdempotentCloseRejectFurtherIo() {
        val io = Io()
        val pipe = MacUsbSession(io)
        assertArrayEquals(byteArrayOf(1, 2), pipe.read(60000))
        assertEquals(1000, io.timeout)
        pipe.write(byteArrayOf(), 20)
        assertEquals(0, io.writes)
        pipe.close(); pipe.close()
        assertEquals(1, io.closes)
        try { pipe.read(1); fail("closed pipe read") } catch (_: IphoneUsbException.DeviceUnavailable) { }
        try { pipe.write(byteArrayOf(1), 20); fail("closed pipe write") } catch (_: IphoneUsbException.DeviceUnavailable) { }
    }
    @Test fun invalidMuxHandshakeClosesItsPipe() {
        var closes = 0
        val pipe = object : Iap2UsbSession {
            override fun write(data: ByteArray, timeoutMillis: Int) = Unit
            override fun read(timeoutMillis: Long): ByteArray {
                return ByteArray(20).also { it[3] = 73; it[7] = 20 }
            }
            override fun close() { closes++ }
        }
        try { Iap2UsbMuxHost.open(pipe); fail("invalid handshake accepted") }
        catch (_: IphoneUsbException.Protocol) { }
        assertEquals(1, closes)
    }
    @Test fun muxHandshakeAndCloseReleaseThePipeOnce() {
        var closes = 0
        var first = true
        val writes = ArrayList<ByteArray>()
        val io = object : UsbIo {
            override fun write(ncm: Boolean, data: ByteArray, timeoutMillis: Int) {
                assertTrue("handshake uses a bounded native transfer timeout", timeoutMillis in 1..5000)
                writes += data
            }
            override fun read(ncm: Boolean, timeoutMillis: Int): ByteArray? {
                if (first) { first = false; return ByteArray(20).also { it[7] = 20; it[11] = 2 } }
                Thread.sleep(5)
                return null
            }
            override fun close() { closes++ }
        }
        val host = Iap2UsbMuxHost.open(MacUsbSession(io), readTimeoutMillis = 20)
        host.close(); host.close()
        assertEquals(1, closes)
        assertEquals(2, writes.size)
        assertEquals(20, writes[0].size)
        assertEquals(17, writes[1].size)
    }
    @Test fun ncmRetainsEverySplitAndOptionalPad() {
        val payload = ByteArray(484) { it.toByte() }
        val block = Ntb16Codec.build(payload, 65535)
        val next = Ntb16Codec.build(byteArrayOf(4, 5), 0)
        val stream = block + next
        for (split in 0..stream.size) {
            val frames = NcmFrames()
            frames.append(stream.copyOfRange(0, split))
            frames.append(stream.copyOfRange(split, stream.size))
            assertArrayEquals(payload, frames.take())
            assertArrayEquals(byteArrayOf(4, 5), frames.take())
            assertNull(frames.take())
        }
    }
    @Test fun fullSpeedPacketPaddingUsesActualEndpointSize() {
        val payload = ByteArray(36) { 1 }
        val block = Ntb16Codec.build(payload, 0, 64)
        assertEquals(65, block.size)
        val frames = NcmFrames(64)
        frames.append(block + Ntb16Codec.build(byteArrayOf(2), 1, 64))
        assertArrayEquals(payload, frames.take())
        assertArrayEquals(byteArrayOf(2), frames.take())
    }
    @Test fun ncmRejectsMalformedHeaderAndQueueFlood() {
        try { NcmFrames().append(ByteArray(12)); fail("bad NCM accepted") }
        catch (_: IphoneUsbException.Protocol) { }
        val frames = NcmFrames()
        try {
            repeat(257) { frames.append(Ntb16Codec.build(byteArrayOf(1), it)) }
            fail("unbounded NCM queue")
        } catch (_: IphoneUsbException.Protocol) { }
    }
}
