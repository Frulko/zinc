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
        assertEquals(8, ((config["values"] as Map<*, *>)["accessories"] as List<*>).size)

        val registered = response(state.handle(request("registerRequest", listOf(2562L, 1538L, 9999L)))[0])
        assertEquals(mapOf(2562L to 1800L, 1538L to 68L), registered["values"])
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

    @Test fun nativeClimateHasZonesAndAcceptsSupportedPhoneControls() {
        val state = UltraVehicleState()
        val accessories = (state.infoEntry()["pluginConfigs"] as List<*>).first().let { (it as Map<*, *>)["accessories"] as List<*> }
        val climate = accessories.map { it as Map<*, *> }.first { it["iid"] == 512L }
        val services = climate["services"] as List<*>
        assertEquals(listOf(513L, 518L, 532L, 523L, 527L, 529L, 537L), services.map { (it as Map<*, *>)["iid"] })
        assertEquals("seat_front_right", state.snapshot()[536L])
        assertEquals(2L, state.snapshot()[525L])
        state.handle(request("registerRequest", listOf(514L, 525L, 534L)))
        var trace = ""
        val replies = state.handle(request("writeRequest", mapOf(514L to false, 525L to 4L, 534L to 22.5, 520L to 40.0))) { trace = it }
        assertTrue(trace.startsWith("writeRequest tx=7 values="))
        assertEquals(mapOf(514L to 0L, 525L to 0L, 534L to 0L, 520L to -6727L), response(replies[0])["errors"])
        assertEquals("updateNotify", response(replies[1])["command"])
        assertEquals(mapOf(514L to false, 525L to 4L, 534L to 22.5), response(replies[1])["values"])
        assertEquals(21.0, state.snapshot()[520L])
        assertNotNull(state.setGauge(525L, 5L))
        assertTrue(runCatching { state.setGauge(525L, 8L) }.isFailure)
    }

    @Test fun nativeCarHasFuelTripAndFourTireSensors() {
        val state = UltraVehicleState()
        val accessories = (state.infoEntry()["pluginConfigs"] as List<*>).first().let { (it as Map<*, *>)["accessories"] as List<*> }
        assertTrue(accessories.map { (it as Map<*, *>)["iid"] }.containsAll(listOf(1536L, 1792L, 2048L)))
        val tires = accessories.map { it as Map<*, *> }.first { it["iid"] == 2048L }
        assertEquals(4, (tires["services"] as List<*>).size)
        state.handle(request("registerRequest", listOf(1538L, 1541L, 2050L, 2065L)))
        assertEquals(mapOf(2050L to 250L), response(state.setGauge(2050L, 250L)!!)["values"])
        assertEquals(mapOf(1541L to 400L), response(state.setGauge(1541L, 400L)!!)["values"])
        assertEquals(mapOf(2050L to -6727L), response(state.handle(request("writeRequest", mapOf(2050L to 300L)))[0])["errors"])
        assertTrue(runCatching { state.setGauge(2065L, 1001L) }.isFailure)
    }

    @Test fun simulatedRadioDescribesStationsAndHandlesPhoneSelection() {
        val state = UltraVehicleState()
        val accessories = state.infoEntry()["pluginConfigs"].let { it as List<*> }.first().let { (it as Map<*, *>)["accessories"] as List<*> }
        val radio = accessories.map { it as Map<*, *> }.first { it["iid"] == 4096L }
        val source = (radio["services"] as List<*>).first() as Map<*, *>
        assertEquals(0x14000006L, source["type"])
        val stations = state.snapshot()[4103L] as List<*>
        assertEquals(listOf("inter", "fip", "info"), stations.map { (it as Map<*, *>)["identifier"] })
        val nowPlaying = accessories.map { it as Map<*, *> }.first { it["iid"] == 4352L }
        val controls = ((nowPlaying["services"] as List<*>).first() as Map<*, *>)["controls"] as List<*>
        assertEquals(7, controls.size)
        val selected = response(state.handle(request("controlRequest", mapOf(4364L to mapOf(
            "identifier" to "fip", "sourceIdentifier" to "DAB"))))[0])
        assertEquals("controlResponse", selected["command"])
        assertEquals("fip", state.snapshot()[4102L])
        assertEquals("FIP", state.snapshot()[4355L])
        assertEquals(1L, state.snapshot()[4359L])
        state.handle(request("registerRequest", listOf(4102L, 4355L, 4359L)))
        val update = response(state.setRadio("info")!!)
        assertEquals("updateNotify", update["command"])
        assertEquals("info", (update["values"] as Map<*, *>)[4102L])
        val phoneChange = state.handle(request("controlRequest", mapOf(4362L to emptyMap<String, Any>())))
        assertEquals(2, phoneChange.size)
        assertEquals("updateNotify", response(phoneChange[1])["command"])
        val rejected = response(state.handle(request("controlRequest", mapOf(4364L to mapOf(
            "identifier" to "unknown", "sourceIdentifier" to "DAB"))))[0])
        assertEquals(mapOf(4364L to -6735L), rejected["errors"])
        assertTrue(runCatching { state.setRadio("unknown") }.isFailure)
    }
}
