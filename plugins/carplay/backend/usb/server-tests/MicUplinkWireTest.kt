package com.playport.server

import com.shilapi.xcertplay.airplay.*
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import org.junit.Assert.assertArrayEquals
import org.junit.Test

class MicUplinkWireTest {
    @Test fun pcmIsBigEndianOnUdpAndOpusIsUnchanged() {
        val host = InetAddress.getLoopbackAddress()
        val key = ByteArray(32) { it.toByte() }
        for (codec in listOf(AudioCodecKind.LPCM, AudioCodecKind.OPUS)) {
            DatagramSocket(0, host).use { receiver ->
                receiver.soTimeout = 2000
                val config = MicrophoneConfig("speechrecognition", 24000, 1, 100, 20, host, receiver.localPort, key, codec)
                val input = byteArrayOf(0x34, 0x12, 0x78, 0x56)
                MicUplink(config).use { sender -> sender.send(input, 2) }
                val datagram = DatagramPacket(ByteArray(2048), 2048)
                receiver.receive(datagram)
                val packet = datagram.data.copyOf(datagram.length)
                val end = packet.size - MicrophonePacketizer.NONCE_LEN
                val nonce = ByteArray(12)
                packet.copyInto(nonce, 4, end, packet.size)
                val pcm = AirPlayCrypto.chachaOpen(key, nonce,
                    packet.copyOfRange(MicrophonePacketizer.RTP_HEADER_LEN, end),
                    packet.copyOfRange(4, MicrophonePacketizer.RTP_HEADER_LEN))
                assertArrayEquals(if (codec == AudioCodecKind.LPCM) byteArrayOf(0x12, 0x34, 0x56, 0x78) else input, pcm)
                assertArrayEquals(byteArrayOf(0x34, 0x12, 0x78, 0x56), input)
            }
        }
    }
}
