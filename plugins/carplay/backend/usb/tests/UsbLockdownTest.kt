// SPDX-License-Identifier: GPL-3.0-only
package com.shilapi.xcertplay.transport

import java.nio.ByteBuffer
import java.security.KeyPairGenerator
import java.security.interfaces.RSAPublicKey
import java.util.Base64
import org.junit.Assert.*
import org.junit.Test

class UsbLockdownTest {
    private class Stream(private var bytes: ByteArray = ByteArray(0)) : BlockingDuplexByteStream {
        val writes = ArrayList<ByteArray>()
        var closes = 0
        override fun send(data: ByteArray) { writes += data }
        override fun recv(maxBytes: Int, timeoutMillis: Long): ByteArray {
            val count = minOf(1, maxBytes, bytes.size)
            return bytes.copyOfRange(0, count).also { bytes = bytes.copyOfRange(count, bytes.size) }
        }
        override fun close() { closes++ }
    }
    private fun xml(value: String): Stream {
        val payload = ("<?xml version=\"1.0\"?><plist version=\"1.0\">" + value + "</plist>").toByteArray()
        return Stream(ByteBuffer.allocate(4).putInt(payload.size).array() + payload)
    }
    @Test fun desktopParserReassemblesByteSplitsAndRejectsDuplicateKeys() {
        val stream = xml("<dict><key>Port</key><integer>1234</integer><key>Data</key><data>AQI=</data></dict>")
        LockdownPlistChannel(stream).use {
            val value = it.receive()
            assertEquals(1234L, (value.entries["Port"] as LockdownPlistValue.Integer).value)
            assertArrayEquals(byteArrayOf(1, 2), (value.entries["Data"] as LockdownPlistValue.Data).bytes)
        }
        assertEquals(1, stream.closes)
        try {
            LockdownPlistChannel(xml("<dict><key>A</key><true/><key>A</key><false/></dict>")).receive()
            fail("duplicate plist key accepted")
        } catch (_: IphoneUsbException.Protocol) { }
    }
    @Test fun desktopParserDoesNotResolveExternalEntities() {
        val payload = ("<?xml version=\"1.0\"?><!DOCTYPE plist [<!ENTITY secret SYSTEM \"file:///nonexistent-zinc-usb-secret\">]>" +
            "<plist><dict><key>X</key><string>&secret;</string></dict></plist>").toByteArray()
        val stream = Stream(ByteBuffer.allocate(4).putInt(payload.size).array() + payload)
        try { LockdownPlistChannel(stream).receive(); fail("external entity accepted") }
        catch (_: IphoneUsbException.Protocol) { }
    }
    @Test fun detachTransfersOwnershipAndOversizedFrameFailsBeforeAllocation() {
        val stream = Stream()
        val channel = LockdownPlistChannel(stream)
        assertSame(stream, channel.detach())
        channel.close()
        assertEquals(0, stream.closes)
        try { channel.receive(); fail("detached stream used") }
        catch (_: IphoneUsbException.DeviceUnavailable) { }
        try {
            LockdownPlistChannel(Stream(byteArrayOf(0x7f, 0x7f, 0x7f, 0x7f))).receive()
            fail("oversized frame accepted")
        } catch (_: IphoneUsbException.Protocol) { }
    }
    @Test fun desktopPairCertificatesAndTlsEngineLoadWithoutExternalIdentity() {
        val pair = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair()
        val key = pair.public as RSAPublicKey
        val der = org.bouncycastle.asn1.pkcs.RSAPublicKey(key.modulus, key.publicExponent).encoded
        val pem = ("-----BEGIN RSA PUBLIC KEY-----\n" + Base64.getEncoder().encodeToString(der) +
            "\n-----END RSA PUBLIC KEY-----\n").toByteArray()
        val record = LockdownPairRecordGenerator.generate(pem, "02:00:00:00:00:02", "host-id", "system-buid")
        val root = java.security.cert.CertificateFactory.getInstance("X.509", org.bouncycastle.jce.provider.BouncyCastleProvider())
            .generateCertificate(record.rootCertificatePem.inputStream()) as java.security.cert.X509Certificate
        root.verify(root.publicKey)
        assertEquals("", root.issuerX500Principal.name)
        assertEquals("", root.subjectX500Principal.name)
        val host = java.security.cert.CertificateFactory.getInstance("X.509", org.bouncycastle.jce.provider.BouncyCastleProvider())
            .generateCertificate(record.hostCertificatePem.inputStream()) as java.security.cert.X509Certificate
        host.verify(root.publicKey)
        assertEquals("", host.issuerX500Principal.name)
        assertEquals("", host.subjectX500Principal.name)
        val device = java.security.cert.CertificateFactory.getInstance("X.509", org.bouncycastle.jce.provider.BouncyCastleProvider())
            .generateCertificate(record.deviceCertificatePem.inputStream()) as java.security.cert.X509Certificate
        device.verify(root.publicKey)
        assertEquals("", device.issuerX500Principal.name)
        assertEquals("", device.subjectX500Principal.name)
        assertEquals(key.modulus, (device.publicKey as RSAPublicKey).modulus)
        val engine = LockdownTlsEngineFactory.create(record)
        assertTrue(engine.useClientMode)
        assertEquals("PairedRecord(redacted)", PairedRecord(record, null).toString())
        assertEquals("LockdownPairRecord(redacted)", record.toString())
    }
}
