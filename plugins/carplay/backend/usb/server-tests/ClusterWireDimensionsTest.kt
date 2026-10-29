package com.playport.server

import io.ktor.websocket.Frame
import kotlinx.coroutines.channels.Channel
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.file.Path
import org.junit.Assert.assertEquals
import org.junit.Test

class ClusterWireDimensionsTest {
    @Test fun validatesCustomDimensions() {
        assertEquals(960, ClusterDimensions.dimension(null, 960))
        assertEquals(1280, ClusterDimensions.dimension("1280", 960))
        for (bad in listOf("abc", "0", "721", "8192")) {
            org.junit.Assert.assertThrows(IllegalArgumentException::class.java) { ClusterDimensions.dimension(bad, 960) }
        }
    }

    @Test fun secondaryConfigUsesClusterDimensionsInsteadOfMainScreen() {
        val hub = WebHub(ServerConfig(identityDir = Path.of("."), stateDir = Path.of(".")), DisplayState(1280, 720, 60, 100))
        assertVideoConfig(hub, listOf(Triple(110, 1280, 720), Triple(111, 960, 360)))
    }

    @Test fun ultraConfigUsesThemeDimensionsForBothStreams() {
        val hub = WebHub(ServerConfig(identityDir = Path.of("."), stateDir = Path.of(".")),
            DisplayState(1280, 720, 60, 100), themeEnabled = true)
        assertVideoConfig(hub, listOf(Triple(110, 1920, 720), Triple(111, 1920, 720)))
    }

    private fun assertVideoConfig(hub: WebHub, expected: List<Triple<Int, Int, Int>>) {
        val channel = Channel<Frame>(8)
        val type = Class.forName("com.playport.server.WsClient")
        val constructor = type.getDeclaredConstructor(Channel::class.java).apply { isAccessible = true }
        val clients = WebHub::class.java.getDeclaredField("clients").apply { isAccessible = true }
        @Suppress("UNCHECKED_CAST")
        val set = clients.get(hub) as MutableSet<Any>
        set.add(constructor.newInstance(channel))
        try {
            for ((stream, width, height) in expected) {
                hub.broadcastVideoConfig(stream, byteArrayOf())
                val bytes = (channel.tryReceive().getOrThrow() as Frame.Binary).data
                val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
                assertEquals(width, buffer.getInt(3)); assertEquals(height, buffer.getInt(7))
            }
            val text = "Rejoignez l’itinéraire · École"
            hub.debugTelemetry("unicode", HudSnapshot(instruction = text))
            val json = (channel.tryReceive().getOrThrow() as Frame.Text).data.toString(Charsets.UTF_8)
            org.junit.Assert.assertTrue(json.contains(text))
        } finally { set.clear(); channel.close() }
    }
}
