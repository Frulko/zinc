package com.shilapi.xcertplay.transport

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UltraVehicleStateTest {
    private fun request(command: String, values: Any? = null): ByteArray = AppleOpack.encode(mapOf(
        "pluginID" to 0L,
        "pluginData" to AppleOpack.encode(mapOf("command" to command, "transactionID" to 7L, "values" to values)),
    ))

    private fun response(bytes: ByteArray): Map<*, *> {
        val outer = AppleOpack.decode(bytes) as Map<*, *>
        assertEquals(0L, outer["pluginID"])
        return AppleOpack.decode(outer["pluginData"] as ByteArray) as Map<*, *>
    }

    @Test fun describesAndPublishesOnlyRegisteredVehicleValues() {
        val state = UltraVehicleState()
        val info = state.infoEntry()
        assertEquals("1.0", info["protocolVersion"])
        assertEquals(1, (info["pluginConfigs"] as List<*>).size)
        assertNull(state.setGauge(2562, 1800L))
        val config = response(state.handle(request("configRequest"))[0])
        assertEquals("configResponse", config["command"])
        assertEquals(7L, config["transactionID"])
        assertEquals(3, ((config["values"] as Map<*, *>)["accessories"] as List<*>).size)

        val registered = response(state.handle(request("registerRequest", listOf(2562L, 1538L, 9999L)))[0])
        assertEquals(mapOf(2562L to 1800L, 1538L to 50L), registered["values"])
        assertEquals(mapOf(9999L to -6727L), registered["errors"])
        val update = state.setGauge(1538, 63L)
        assertNotNull(update)
        assertEquals(mapOf(1538L to 63L), response(update!!)["values"])
        assertNull(state.setGauge(1538, 63L))
        state.resetSubscriptions()
        assertNull(state.setGauge(1538, 64L))
    }

    @Test fun acceptsOnlyDeclaredPhoneWritesAndDropsBadMessages() {
        val state = UltraVehicleState()
        val written = response(state.handle(request("writeRequest", mapOf(514L to false, 520L to 22.5, 2562L to 9000L)))[0])
        assertEquals(mapOf(514L to 0L, 520L to 0L, 2562L to -6727L), written["errors"])
        assertEquals(false, state.snapshot()[514L])
        assertEquals(22.5, state.snapshot()[520L])
        assertEquals(0L, state.snapshot()[2562L])
        assertTrue(state.handle(byteArrayOf(0xa0.toByte())).isEmpty())
        assertTrue(state.handle(request("unknownRequest")).isEmpty())
        assertFalse(state.handle(request("controlRequest", mapOf(99L to null))).isEmpty())
    }

    @Test fun climateChangesPublishTypedValuesOnlyToSubscribers() {
        val state = UltraVehicleState()
        state.handle(request("registerRequest", listOf(514L, 520L)))
        assertEquals(mapOf(514L to false), response(state.setGauge(514, false)!!)["values"])
        assertEquals(mapOf(520L to 22.5), response(state.setGauge(520, 22.5)!!)["values"])
        assertTrue(runCatching { state.setGauge(520, 55.0) }.isFailure)
    }
}
