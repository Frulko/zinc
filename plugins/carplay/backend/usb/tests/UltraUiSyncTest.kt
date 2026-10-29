package com.shilapi.xcertplay.transport

import com.shilapi.xcertplay.airplay.BplistCodec
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class UltraUiSyncTest {
    private fun frame(header: Map<String, Any?>): ByteArray = AppleOpack.encode(mapOf(
        "displayUUID" to "cluster", "data" to BplistCodec.encode(header),
    ))

    private fun header(bytes: ByteArray): Map<*, *> = BplistCodec.decode((AppleOpack.decode(bytes) as Map<*, *>)["data"] as ByteArray) as Map<*, *>

    @Test fun resetCompletesAndAcknowledgesPhoneCommands() {
        val state = UltraUiSync()
        val reset = state.handle(frame(mapOf("type" to 0L, "id" to "phone")))
        assertEquals(1, reset.size)
        assertEquals(0L, header(reset[0])["type"])
        assertEquals(1L, header(reset[0])["ssn"])
        assertEquals("phone", header(reset[0])["id"])
        assertTrue(state.handle(frame(mapOf("type" to 0L))).isEmpty())

        val ready = state.handle(frame(mapOf("type" to 1L, "ssn" to 1L, "psn" to 3L, "version" to 2L)))
        assertEquals(listOf(1L, 2L, 2L), ready.map { header(it)["type"] })
        assertEquals(3L, header(ready[0])["asn"])
        val command = state.handle(frame(mapOf("type" to 2L, "ssn" to 1L, "psn" to 4L,
            "data" to BplistCodec.encode(mapOf("type" to 0x13L, "data" to mapOf("preference" to 2L))))))
        assertEquals(3L, header(command.single())["type"])
        assertEquals(0x13L, state.takeChoices().single().type)
        assertTrue(state.takeChoices().isEmpty())
    }

    @Test fun rejectsMalformedOrOldSessionFrames() {
        val state = UltraUiSync()
        assertTrue(state.handle(byteArrayOf(0xff.toByte())).isEmpty())
        assertTrue(state.handle(frame(mapOf("type" to 2L, "ssn" to 99L))).isEmpty())
        state.handle(frame(mapOf("type" to 0L)))
        assertTrue(state.handle(frame(mapOf("type" to 1L, "ssn" to 99L))).isEmpty())
        state.reset()
        assertTrue(state.handle(frame(mapOf("type" to 1L, "ssn" to 1L))).isEmpty())
    }

    @Test fun themedSessionRequestsTheCatalogLayoutAfterReset() {
        val state = UltraUiSync(themedLayout = true)
        state.handle(frame(mapOf("type" to 0L, "id" to "phone")))
        val ready = state.handle(frame(mapOf("type" to 1L, "ssn" to 1L, "psn" to 3L, "version" to 2L)))
        assertEquals(4, ready.size)
        val request = BplistCodec.decode(header(ready[2])["data"] as ByteArray) as Map<*, *>
        assertEquals(0x05L, request["type"])
        val data = request["data"] as Map<*, *>
        assertEquals(UltraTheme.layoutId, data["layoutID"])
        assertEquals(UltraTheme.paletteId, data["paletteID"])
        assertEquals(UltraTheme.activeComponents, data["activeComponents"])
        val day = state.setNightMode(false)
        assertEquals(1, day.size)
        val dayRequest = BplistCodec.decode(header(day.single())["data"] as ByteArray) as Map<*, *>
        assertEquals(0L, (dayRequest["data"] as Map<*, *>)["appearanceMode"])
        assertTrue(state.setNightMode(false).isEmpty())
    }

    @Test fun mapsClusterVideoToAnInstrumentPanel() {
        val panels = UltraUiSync.displayPanels(listOf(mapOf("uuid" to "main", "type" to 110, "widthPixels" to 1280),
            mapOf("uuid" to "cluster", "type" to 111, "widthPixels" to 960)))
        assertEquals(2, panels.size)
        assertEquals(listOf("showsInstruments"), panels[1]["properties"])
        assertEquals("cluster-panel", (panels[1]["displayPlugins"] as List<*>).first().let { (it as Map<*, *>)["uid"] })
    }
}
