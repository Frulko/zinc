package com.shilapi.xcertplay.transport

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class AppleOpackTest {
    @Test fun decodesVehicleRegisterResponseWithReferences() {
        // A real Vehicle State register response vector from LIVI's protocol tests.
        val bytes = """e4466572726f7273eb31040131b9e5310d01a2310501a2310e01a2310a01a2310601a2310201a2
            310f01a2310b01a2310301a2310c01a24d7472616e73616374696f6e494433a0bc52cb03e5cd02
            47636f6d6d616e64507265676973746572526573706f6e73654676616c756573e23108010131110108"""
            .filterNot(Char::isWhitespace).chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        val response = AppleOpack.decode(bytes) as Map<*, *>
        assertEquals("registerResponse", response["command"])
        val errors = response["errors"] as Map<*, *>
        assertEquals(11, errors.size)
        assertEquals(-6727L, errors[269L])
        assertEquals(mapOf(264L to true, 273L to 0L), response["values"])
    }

    @Test fun roundTripsVehicleRequestAndBounds() {
        val request = linkedMapOf<Any, Any?>(
            "command" to "configRequest", "transactionID" to 42L,
            "values" to linkedMapOf(264L to true, 273L to 0L),
            "assetID" to ByteArray(40) { it.toByte() },
        )
        val decoded = AppleOpack.decode(AppleOpack.encode(request)) as Map<*, *>
        assertEquals("configRequest", decoded["command"])
        assertEquals(42L, decoded["transactionID"])
        assertEquals(mapOf(264L to true, 273L to 0L), decoded["values"])
        assertArrayEquals(request["assetID"] as ByteArray, decoded["assetID"] as ByteArray)
        assertArrayEquals(byteArrayOf(0x0d), AppleOpack.encode(5L))
        assertArrayEquals(byteArrayOf(0x31, -1, 0), AppleOpack.encode(255L))
        assertArrayEquals(byteArrayOf(0x31, 0xb9.toByte(), 0xe5.toByte()), AppleOpack.encode(-6727L))
        assertThrows(IllegalArgumentException::class.java) { AppleOpack.decode(byteArrayOf(0xa0.toByte())) }
        assertThrows(IllegalArgumentException::class.java) { AppleOpack.decode(byteArrayOf(0xe1.toByte(), 0x41, 'k'.code.toByte())) }
        assertThrows(IllegalArgumentException::class.java) { AppleOpack.encode(ByteArray(4 * 1024 * 1024 + 1)) }
    }
}
