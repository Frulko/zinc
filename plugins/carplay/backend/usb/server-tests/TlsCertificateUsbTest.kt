package com.playport.server

import java.net.InetAddress
import java.net.Inet6Address
import java.nio.file.Files
import java.security.cert.X509Certificate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TlsCertificateUsbTest {
    @Test
    fun scopedUsbIpv6AddressGeneratesAndReloadsCertificate() {
        val directory = Files.createTempDirectory("carplay-usb-tls-")
        try {
            val address = Inet6Address.getByAddress(null, InetAddress.getByName("fe80::1234").address, 7)
            assertTrue(address.hostAddress.contains('%'))
            val material = TlsCertificate.loadOrCreate(directory, listOf(address, InetAddress.getByName("127.0.0.1")))
            val certificate = material.keyStore.getCertificate(material.alias) as X509Certificate
            certificate.verify(certificate.publicKey)
            val ips = certificate.subjectAlternativeNames.filter { it[0] == 7 }.map { it[1].toString() }
            assertEquals(2, ips.size)
            assertTrue(ips.none { it.contains('%') })
            assertTrue(ips.map { InetAddress.getByName(it) }.any { it.address.contentEquals(address.address) })
            val loaded = TlsCertificate.loadOrCreate(directory, listOf(address))
            assertTrue(loaded.keyStore.getCertificate(loaded.alias).encoded.contentEquals(certificate.encoded))
        } finally {
            Files.deleteIfExists(directory.resolve("tls-keystore.p12"))
            Files.deleteIfExists(directory)
        }
    }
}
