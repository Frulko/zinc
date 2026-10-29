package com.shilapi.xcertplay.airplay

import java.net.InetAddress
import java.net.Socket
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class UltraDataTunnelTest {
    @Test fun acknowledgesSynchronousPackageAndSendsEncryptedCommand() {
        val phoneKey = ByteArray(32) { 1 }
        val receiverKey = ByteArray(32) { 2 }
        val seen = AtomicReference<ByteArray>()
        val received = CountDownLatch(1)
        val tunnel = IapTunnel(phoneKey, InetAddress.getLoopbackAddress(), receiverKey)
        val port = tunnel.listen(object : IapTunnel.Listener {
            override fun onPackage(kind: Int, messageType: Int, replyToken: Long, body: ByteArray) {
                assertEquals(SYNC, kind)
                assertEquals(COMM, messageType)
                assertEquals(42L, replyToken)
                seen.set(body)
                received.countDown()
            }
        })
        try {
            Socket(InetAddress.getLoopbackAddress(), port).use { phone ->
                phone.soTimeout = 2000
                val request = packageBytes(SYNC, COMM, 42, "request".toByteArray())
                writeFrame(phone, phoneKey, 0, request)
                assertTrue(received.await(2, TimeUnit.SECONDS))
                assertArrayEquals("request".toByteArray(), seen.get())

                val ack = readFrame(phone, receiverKey, 0)
                assertEquals(REPLY, ByteBuffer.wrap(ack).order(ByteOrder.BIG_ENDIAN).getInt(4))
                assertEquals(42L, ByteBuffer.wrap(ack).order(ByteOrder.BIG_ENDIAN).getLong(20))
                tunnel.sendCommand("answer".toByteArray())
                val answer = readFrame(phone, receiverKey, 1)
                assertEquals(ASYNC, ByteBuffer.wrap(answer).order(ByteOrder.BIG_ENDIAN).getInt(4))
                assertEquals(COMMAND, ByteBuffer.wrap(answer).order(ByteOrder.BIG_ENDIAN).getInt(16))
                assertArrayEquals("answer".toByteArray(), answer.copyOfRange(32, answer.size))

                val large = ByteArray(70000) { it.toByte() }
                tunnel.sendCommand(large)
                val reassembled = readFrame(phone, receiverKey, 2) + readFrame(phone, receiverKey, 3)
                assertEquals(32 + large.size, ByteBuffer.wrap(reassembled).order(ByteOrder.BIG_ENDIAN).int)
                assertArrayEquals(large, reassembled.copyOfRange(32, reassembled.size))
            }
        } finally { tunnel.close() }
    }

    private fun packageBytes(kind: Int, type: Int, token: Long, body: ByteArray): ByteArray =
        ByteBuffer.allocate(32 + body.size).order(ByteOrder.BIG_ENDIAN)
            .putInt(32 + body.size).putInt(kind).putLong(0).putInt(type).putLong(token).putInt(0).put(body).array()

    private fun writeFrame(socket: Socket, key: ByteArray, nonce: Long, plain: ByteArray) {
        val aad = byteArrayOf(plain.size.toByte(), (plain.size ushr 8).toByte())
        socket.getOutputStream().write(aad + AirPlayCrypto.chachaSeal(key, AirPlayCrypto.nonce64(nonce), plain, aad))
    }

    private fun readFrame(socket: Socket, key: ByteArray, nonce: Long): ByteArray {
        val input = socket.getInputStream()
        val aad = input.readNBytes(2)
        val length = (aad[0].toInt() and 255) or ((aad[1].toInt() and 255) shl 8)
        return AirPlayCrypto.chachaOpen(key, AirPlayCrypto.nonce64(nonce), input.readNBytes(length + 16), aad)
    }

    private companion object {
        const val ASYNC = 0x6173796e
        const val SYNC = 0x73796e63
        const val REPLY = 0x72706c79
        const val COMMAND = 0x636d6e64
        const val COMM = 0x636f6d6d
    }
}
