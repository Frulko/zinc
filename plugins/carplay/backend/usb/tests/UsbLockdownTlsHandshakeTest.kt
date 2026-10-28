// SPDX-License-Identifier: GPL-3.0-only
package com.shilapi.xcertplay.transport

import java.nio.ByteBuffer
import java.security.KeyPairGenerator
import java.security.Security
import java.security.interfaces.RSAPublicKey
import java.util.Base64
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLEngine
import javax.net.ssl.SSLEngineResult.HandshakeStatus
import javax.net.ssl.SSLEngineResult.Status
import org.junit.Assert.*
import org.junit.Test

class UsbLockdownTlsHandshakeTest {
    @Test fun emptyIssuerPeerCompletesMutualTls12AndTransfersApplicationData() {
        val providers = Security.getProviders().map { it.name }
        val defaultProvider = SSLContext.getDefault().provider.name
        val publicKey = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair().public as RSAPublicKey
        val der = org.bouncycastle.asn1.pkcs.RSAPublicKey(publicKey.modulus, publicKey.publicExponent).encoded
        val pem = ("-----BEGIN RSA PUBLIC KEY-----\n" + Base64.getEncoder().encodeToString(der) + "\n-----END RSA PUBLIC KEY-----\n").toByteArray()
        val record = LockdownPairRecordGenerator.generate(pem, "02:00:00:00:00:02", "HOST", "SYSTEM")
        val client = LockdownTlsEngineFactory.create(record)
        val server = LockdownTlsEngineFactory.create(record).apply { useClientMode = false; needClientAuth = true }
        assertEquals(providers, Security.getProviders().map { it.name })
        assertEquals(defaultProvider, SSLContext.getDefault().provider.name)
        client.enabledProtocols = arrayOf("TLSv1.2")
        server.enabledProtocols = arrayOf("TLSv1.2")
        client.beginHandshake(); server.beginHandshake()
        val toClient = ByteBuffer.allocate(65536)
        val toServer = ByteBuffer.allocate(65536)
        val application = ByteBuffer.allocate(65536)
        fun step(engine: SSLEngine, input: ByteBuffer, output: ByteBuffer) {
            while (engine.handshakeStatus == HandshakeStatus.NEED_TASK) engine.delegatedTask.run()
            when (engine.handshakeStatus) {
                HandshakeStatus.NEED_WRAP -> assertEquals(Status.OK, engine.wrap(ByteBuffer.allocate(0), output).status)
                HandshakeStatus.NEED_UNWRAP -> if (input.position() > 0) {
                    input.flip()
                    val result = engine.unwrap(input, application)
                    input.compact()
                    assertTrue(result.status == Status.OK || result.status == Status.BUFFER_UNDERFLOW)
                }
                else -> Unit
            }
        }
        var complete = false
        for (i in 0 until 1000) {
            step(client, toClient, toServer)
            step(server, toServer, toClient)
            if (client.handshakeStatus == HandshakeStatus.NOT_HANDSHAKING && server.handshakeStatus == HandshakeStatus.NOT_HANDSHAKING) {
                complete = true; break
            }
        }
        assertTrue("mutual TLS handshake did not finish", complete)
        assertEquals("TLSv1.2", client.session.protocol)
        val payload = "CarPlay USB TLS".toByteArray()
        assertEquals(Status.OK, client.wrap(ByteBuffer.wrap(payload), toServer).status)
        application.clear(); toServer.flip()
        assertEquals(Status.OK, server.unwrap(toServer, application).status)
        application.flip()
        val received = ByteArray(application.remaining()); application.get(received)
        assertArrayEquals(payload, received)
        client.closeOutbound(); server.closeOutbound()
    }
}
